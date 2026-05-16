/**
 * backfill-stage-3.ts
 *
 * One-shot Stage 3 backfill. For every row in email_thread_classifications
 * that does NOT yet have a corresponding row in email_ai_actions, synthesize
 * a ClassificationResult + EmailMeta and invoke extractAction + write to
 * email_ai_actions.
 *
 * - ARCHIVE/REFERENCE/WAITING → deterministic short-circuit (no LLM, no Gmail call)
 * - NOW/THIS_WEEK → fetch real Gmail body, fall back to subject-as-proxy on miss
 *
 * All backfilled rows share a single tick_id for audit-trace + rollback.
 *
 * Cost: ~$0.10 for ~51 LLM calls + ~51 Gmail refetches.
 * Idempotent: re-running is a no-op (filters by id NOT IN existing actions).
 *
 * Usage:
 *   npx dotenv -e ../../.env.local -- npx tsx scripts/backfill-stage-3.ts          # DRY (default)
 *   npx dotenv -e ../../.env.local -- npx tsx scripts/backfill-stage-3.ts --apply  # WRITE
 *   --limit=N    cap to N classifications (default: no cap)
 */
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { randomUUID } from "crypto";
import { extractAction } from "../src/action-extractor";
import type { EmailMeta } from "../src/types";

const DRY = !process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const BACKFILL_TICK_ID = randomUUID();
const NON_ACTIONABLE_BUCKETS = new Set(["ARCHIVE", "REFERENCE", "WAITING"]);

function gmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

async function fetchThreadSnippet(threadId: string, fallbackSubject: string): Promise<string> {
  try {
    const gmail = gmailClient();
    const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    const msg = res.data.messages?.[0];
    if (!msg) return fallbackSubject;
    const parts = msg.payload?.parts ?? [];
    for (const p of parts) {
      if (p.mimeType === "text/plain" && p.body?.data) {
        return Buffer.from(p.body.data, "base64").toString("utf-8").slice(0, 2000);
      }
    }
    return msg.snippet || fallbackSubject;
  } catch (e: any) {
    console.warn(`[backfill] gmail fetch failed thread=${threadId}: ${e?.message ?? e} — using subject fallback`);
    return fallbackSubject;
  }
}

async function main() {
  console.log(`[backfill-stage-3] mode=${DRY ? "DRY" : "APPLY"} limit=${LIMIT ?? "none"} tick=${BACKFILL_TICK_ID}`);

  const { data: existing, error: aErr } = await sb
    .from("email_ai_actions")
    .select("classification_id");
  if (aErr) { console.error("query email_ai_actions failed:", aErr); process.exit(1); }
  const haveIds = new Set((existing ?? []).map((r: any) => r.classification_id));

  const { data: classifications, error: cErr } = await sb
    .from("email_thread_classifications")
    .select("id, thread_id, sender_email, subject, bucket, confidence, reasoning, classified_at")
    .order("classified_at", { ascending: false });
  if (cErr) { console.error("query email_thread_classifications failed:", cErr); process.exit(1); }

  const todo = (classifications ?? [])
    .filter((c: any) => !haveIds.has(c.id))
    .slice(0, LIMIT ?? undefined);

  const bucketCounts: Record<string, number> = {};
  for (const c of todo as any[]) bucketCounts[c.bucket] = (bucketCounts[c.bucket] ?? 0) + 1;

  console.log(`[backfill-stage-3] todo=${todo.length} bucket_dist=`, bucketCounts);
  console.log(`[backfill-stage-3] tick_id for this run: ${BACKFILL_TICK_ID}`);

  if (DRY) {
    console.log(`[backfill-stage-3] DRY — add --apply to execute. No writes performed.`);
    const llmEst = (bucketCounts.NOW ?? 0) + (bucketCounts.THIS_WEEK ?? 0);
    console.log(`[backfill-stage-3] Estimated LLM calls: ${llmEst}`);
    console.log(`[backfill-stage-3] Estimated cost: ~$${(llmEst * 0.002).toFixed(3)}`);
    return;
  }

  let llmCalls = 0, deterministicCalls = 0, errors = 0;
  const verbCounts: Record<string, number> = {};

  for (let i = 0; i < todo.length; i++) {
    const c: any = todo[i];
    const synthesized = {
      urgency: c.bucket,
      confidence: c.confidence,
      reasoning: c.reasoning ?? "",
    };

    const snippet = NON_ACTIONABLE_BUCKETS.has(c.bucket)
      ? ""
      : await fetchThreadSnippet(c.thread_id, c.subject ?? "");

    const meta: EmailMeta = {
      threadId: c.thread_id,
      senderEmail: c.sender_email ?? "",
      senderName: "",
      recipient: "jose@faraudit.com",
      subject: c.subject ?? "",
      snippet,
      date: c.classified_at,
      ageDays: 0,
      hasReply: false,
    } as any;

    try {
      const action = await extractAction(meta as any, synthesized as any);
      if (action.extractor_stage === "llm") llmCalls++;
      else deterministicCalls++;
      verbCounts[action.verb] = (verbCounts[action.verb] ?? 0) + 1;

      const { error: insErr } = await sb.from("email_ai_actions").insert({
        classification_id: c.id,
        thread_id: c.thread_id,
        tick_id: BACKFILL_TICK_ID,
        verb: action.verb,
        reason: action.reason,
        cross_system: action.cross_system ?? null,
        confidence: action.confidence,
        extractor_stage: action.extractor_stage,
        extractor_model: action.extractor_model ?? null,
      });
      if (insErr) {
        console.error(`[backfill] INSERT failed thread=${c.thread_id}:`, insErr.message);
        errors++;
      }
      if ((i + 1) % 10 === 0) console.log(`[backfill] progress ${i + 1}/${todo.length}`);
    } catch (e: any) {
      console.error(`[backfill] extractAction threw thread=${c.thread_id}:`, e?.message ?? e);
      errors++;
    }
  }

  console.log(`\n[backfill-stage-3] DONE tick=${BACKFILL_TICK_ID}`);
  console.log(`  llmCalls=${llmCalls} deterministicCalls=${deterministicCalls} errors=${errors}`);
  console.log(`  verb distribution:`, verbCounts);
  console.log(`\n  Audit-query: SELECT * FROM email_ai_actions WHERE tick_id = '${BACKFILL_TICK_ID}';`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
