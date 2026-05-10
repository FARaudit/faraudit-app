// outbound-tracker.ts
// WAITING auto-detect: track outbound emails from self-domains, apply WAITING after 4hr,
// remove WAITING on reply or after 14d expiry.
//
// Watermark strategy: use MAX(sent_at) from outbound_tracking as implicit watermark.
// Falls back to 24h lookback if table is empty.

import { gmail_v1 } from "googleapis";
import { getSupabase } from "./supabase";
import { errorMessage, extractEmail, extractDomain } from "./utils";
import { WAITING_THRESHOLD_HOURS, WAITING_EXPIRY_DAYS } from "./constants";
import senders from "./data/senders.json";

const WAITING_LABEL_NAME = "🟡 WAITING";

interface OutboundRow {
  id: number;
  message_id: string;
  thread_id: string;
  sent_at: string;
  awaiting_reply_since: string;
  replied: boolean;
  waiting_label_applied: boolean;
}

interface GmailHeaderLite {
  name: string;
  value: string;
}

function findHeader(headers: GmailHeaderLite[] | undefined, name: string): string {
  if (!headers) return "";
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

async function getWatermark(): Promise<Date> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("outbound_tracking")
    .select("sent_at")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.sent_at) return new Date(data.sent_at);
  // Fallback: 24h lookback if table is empty
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

/**
 * Scan SENT folder for messages newer than watermark, insert into outbound_tracking.
 * Skips self-domain recipients and unreplyable recipients.
 */
export async function tickOutbound(gmail: gmail_v1.Gmail): Promise<number> {
  const supabase = getSupabase();
  const watermark = await getWatermark();
  const sinceUnix = Math.floor(watermark.getTime() / 1000);

  const list = await gmail.users.messages.list({
    userId: "me",
    q: `in:sent after:${sinceUnix}`,
    maxResults: 50,
  });

  let inserted = 0;
  for (const m of list.data.messages || []) {
    if (!m.id) continue;
    try {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["To", "Subject"],
      });
      const headers = (msg.data.payload?.headers as GmailHeaderLite[] | undefined) || [];
      const toHeader = findHeader(headers, "To");
      const recipientEmail = extractEmail(toHeader);
      const recipientDomain = extractDomain(recipientEmail);

      if (!recipientEmail || !recipientDomain) continue;

      // Skip if recipient is self-domain (self-forward — don't track)
      if (senders.self_identity_domains.includes(recipientDomain)) continue;

      // Skip if recipient is unreplyable (auto-system, no reply expected)
      const isUnreplyable = senders.unreplyable_patterns.some((p) =>
        new RegExp(p, "i").test(recipientEmail)
      );
      if (isUnreplyable) continue;

      const internalMs = parseInt(msg.data.internalDate || "0", 10);
      if (internalMs <= 0) continue;
      const sentAt = new Date(internalMs);
      const awaitingReplySince = new Date(
        sentAt.getTime() + WAITING_THRESHOLD_HOURS * 3600 * 1000
      );

      const { error } = await supabase.from("outbound_tracking").upsert(
        {
          message_id: m.id,
          thread_id: msg.data.threadId || "",
          recipient_email: recipientEmail,
          recipient_domain: recipientDomain,
          subject: findHeader(headers, "Subject"),
          sent_at: sentAt.toISOString(),
          awaiting_reply_since: awaitingReplySince.toISOString(),
        },
        { onConflict: "message_id" }
      );
      if (error) {
        console.error(`[outbound] upsert failed: ${errorMessage(error)}`);
        continue;
      }
      inserted += 1;
    } catch (e) {
      console.error(`[outbound] message ${m.id} skipped: ${errorMessage(e)}`);
    }
  }
  console.log(`[outbound] tick: ${inserted} new outbound emails tracked since ${watermark.toISOString()}`);
  return inserted;
}

/**
 * For each pending row, check if a reply arrived after sent_at. If yes, mark replied
 * and remove WAITING label.
 */
export async function tickReplies(gmail: gmail_v1.Gmail, labelMap: Map<string, string>): Promise<number> {
  const supabase = getSupabase();
  const { data: pending } = await supabase
    .from("outbound_tracking")
    .select("id,message_id,thread_id,sent_at,awaiting_reply_since,replied,waiting_label_applied")
    .eq("replied", false);

  let resolved = 0;
  for (const row of (pending as OutboundRow[]) || []) {
    try {
      const thread = await gmail.users.threads.get({ userId: "me", id: row.thread_id, format: "minimal" });
      const msgs = thread.data.messages || [];
      const sentMs = new Date(row.sent_at).getTime();

      // Reply = any message in thread with internalDate > sent_at AND not from self
      // (We can't easily check From here without metadata fetch, so be permissive:
      // any later message in the thread is treated as a reply for waiting purposes.)
      const hasLater = msgs.some((m) => parseInt(m.internalDate || "0", 10) > sentMs);
      if (!hasLater) continue;

      await supabase
        .from("outbound_tracking")
        .update({ replied: true, replied_at: new Date().toISOString() })
        .eq("id", row.id);

      if (row.waiting_label_applied) {
        const waitingLabelId = labelMap.get(WAITING_LABEL_NAME);
        if (waitingLabelId) {
          await gmail.users.threads
            .modify({
              userId: "me",
              id: row.thread_id,
              requestBody: { removeLabelIds: [waitingLabelId] },
            })
            .catch((e: unknown) => console.error(`[waiting-remove] ${errorMessage(e)}`));
        }
      }
      resolved += 1;
    } catch (e) {
      console.error(`[outbound] reply-check thread ${row.thread_id} skipped: ${errorMessage(e)}`);
    }
  }
  console.log(`[outbound] tick: ${resolved} threads marked replied`);
  return resolved;
}

/**
 * Apply WAITING label to threads past the 4hr threshold. Remove WAITING from threads
 * past the 14d expiry.
 */
export async function tickWaiting(gmail: gmail_v1.Gmail, labelMap: Map<string, string>): Promise<{ applied: number; expired: number }> {
  const supabase = getSupabase();
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() - WAITING_EXPIRY_DAYS * 86400 * 1000);
  const waitingLabelId = labelMap.get(WAITING_LABEL_NAME);

  if (!waitingLabelId) {
    console.error(`[outbound] WAITING label '${WAITING_LABEL_NAME}' not in Gmail — skip waiting tick`);
    return { applied: 0, expired: 0 };
  }

  // Apply WAITING to threads past 4hr threshold
  const { data: toApply } = await supabase
    .from("outbound_tracking")
    .select("id,thread_id,sent_at")
    .eq("replied", false)
    .eq("waiting_label_applied", false)
    .lt("awaiting_reply_since", now.toISOString())
    .gt("sent_at", expiryThreshold.toISOString());

  let applied = 0;
  for (const row of (toApply as Pick<OutboundRow, "id" | "thread_id" | "sent_at">[]) || []) {
    try {
      await gmail.users.threads.modify({
        userId: "me",
        id: row.thread_id,
        requestBody: { addLabelIds: [waitingLabelId] },
      });
      await supabase
        .from("outbound_tracking")
        .update({ waiting_label_applied: true })
        .eq("id", row.id);
      applied += 1;
    } catch (e) {
      console.error(`[outbound] waiting-add ${row.thread_id}: ${errorMessage(e)}`);
    }
  }

  // Remove WAITING from expired threads
  const { data: toExpire } = await supabase
    .from("outbound_tracking")
    .select("id,thread_id")
    .eq("replied", false)
    .eq("waiting_label_applied", true)
    .lt("sent_at", expiryThreshold.toISOString());

  let expired = 0;
  for (const row of (toExpire as Pick<OutboundRow, "id" | "thread_id">[]) || []) {
    try {
      await gmail.users.threads.modify({
        userId: "me",
        id: row.thread_id,
        requestBody: { removeLabelIds: [waitingLabelId] },
      });
      expired += 1;
    } catch (e) {
      console.error(`[outbound] waiting-expire ${row.thread_id}: ${errorMessage(e)}`);
    }
  }

  console.log(`[outbound] waiting tick: applied=${applied} expired=${expired}`);
  return { applied, expired };
}
