/**
 * run-drafter.ts
 *
 * Manual Stage 4 runner. Processes all email_ai_actions rows where
 * verb='reply' AND no draft exists yet.
 *
 * Use this to validate Stage 4 before wiring into the live cron tick loop.
 *
 * Usage:
 *   npx -y dotenv-cli -e ~/faraudit-app/.env.local -- npx tsx scripts/run-drafter.ts
 *   npx -y dotenv-cli -e ~/faraudit-app/.env.local -- npx tsx scripts/run-drafter.ts --limit=1
 */
import { createClient } from "@supabase/supabase-js";
import { draftReply } from "../src/reply-drafter";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log(`[run-drafter] mode=APPLY limit=${LIMIT ?? "none"}`);

  const { data: actions, error: aErr } = await sb
    .from("email_ai_actions")
    .select("id, thread_id, classification_id, verb, confidence, reason")
    .eq("verb", "reply")
    .gte("confidence", 0.7)
    .order("extracted_at", { ascending: false });
  if (aErr) { console.error("query email_ai_actions failed:", aErr); process.exit(1); }

  if (!actions || actions.length === 0) {
    console.log("[run-drafter] no reply actions to process");
    return;
  }

  console.log(`[run-drafter] found ${actions.length} reply actions`);

  const todo = LIMIT ? actions.slice(0, LIMIT) : actions;
  let drafted = 0;
  let skipped = 0;
  let errors = 0;

  for (const action of todo) {
    try {
      const { data: classification } = await sb
        .from("email_thread_classifications")
        .select("bucket, reasoning, confidence")
        .eq("id", action.classification_id)
        .single();

      const result = await draftReply(sb, action, classification ?? {});
      if (result) drafted++;
      else skipped++;
    } catch (e: any) {
      console.error(`[run-drafter] error on ${action.thread_id}:`, e?.message ?? e);
      errors++;
    }
  }

  console.log(`\n[run-drafter] DONE: drafted=${drafted} skipped=${skipped} errors=${errors}`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
