// #658 change 1: Gmail draft-flag egress. digest_p0_block actions (a HUMAN-authored email demanding
// CEO action by a deadline, OR an automated email proving a critical workflow broke) are collected each
// tick into ONE "📌 needs attention" summary draft. Machine noise NEVER reaches this path — only the
// digest_p0_block verb qualifies, and routine/automated notifications are explicitly not that verb.
import type { ActionVerb } from "./action-extractor";

export interface NeedsAttentionItem {
  senderName: string;
  senderEmail: string;
  subject: string;
  reason: string;       // blocker one-liner (or extractor reason)
  deadline?: string;    // if the extractor found one
  threadId: string;
}

/** The ONLY verb that flags a thread for CEO attention. Everything else (incl. machine noise) is silent. */
export function isNeedsAttention(verb: ActionVerb): boolean {
  return verb === "digest_p0_block";
}

/**
 * Build the single summary draft (subject + body). Returns null when there is nothing to flag.
 * @param nowLabel CT timestamp label, e.g. "2026-07-22 11:30 CT".
 */
export function buildNeedsAttentionDraft(
  items: NeedsAttentionItem[],
  nowLabel: string,
): { subject: string; body: string } | null {
  if (items.length === 0) return null;
  const subject = `📌 NEEDS ATTENTION — ${nowLabel}`;
  const blocks = items.map((it, i) => {
    const lines = [
      `${i + 1}. ${it.senderName || it.senderEmail} <${it.senderEmail}>`,
      `   Subject: ${it.subject || "(no subject)"}`,
      `   Why: ${it.reason || "flagged as action-required"}`,
    ];
    if (it.deadline) lines.push(`   Deadline: ${it.deadline}`);
    lines.push(`   Open: https://mail.google.com/mail/u/0/#inbox/${it.threadId}`);
    return lines.join("\n");
  });
  const body =
    `${items.length} email${items.length === 1 ? "" : "s"} classified as needing your action (as of ${nowLabel}):\n\n` +
    blocks.join("\n\n") +
    `\n\n— email-ai-v3 (digest_p0_block only; routine/machine notifications are never flagged here).\n`;
  return { subject, body };
}

/** One-line Telegram push text for a single qualifying item. */
export function buildTelegramLine(it: NeedsAttentionItem, nowLabel: string): string {
  const deadline = it.deadline ? ` · *Deadline:* ${it.deadline}` : "";
  return `📌 *NEEDS ATTENTION* (${nowLabel})\n*From:* ${it.senderName || it.senderEmail}\n*Subject:* ${it.subject || "(no subject)"}\n*Why:* ${it.reason || "action-required"}${deadline}`;
}
