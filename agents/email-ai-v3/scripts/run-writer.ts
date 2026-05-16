/**
 * run-writer.ts
 *
 * Stage 5 manual runner. Processes email_ai_actions rows where:
 *   - verb IN ('notion_update', 'digest_p0_block', 'digest_p0_unblock')
 *   - extracted_at > STAGE_5_SHIP_TS (forward-only — no backfill)
 *   - no successful email_ai_writes row exists for (action_id, verb)
 *
 * Usage:
 *   npx -y dotenv-cli -e ~/faraudit-app/.env.local -- npx tsx scripts/run-writer.ts
 *   npx -y dotenv-cli -e ~/faraudit-app/.env.local -- npx tsx scripts/run-writer.ts --limit=1
 *   npx -y dotenv-cli -e ~/faraudit-app/.env.local -- npx tsx scripts/run-writer.ts --verb=notion_update
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { processAction, STAGE_5_SHIP_TS } from "../src/cross-system-writer";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const verbArg = process.argv.find((a) => a.startsWith("--verb="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const VERB_FILTER = verbArg ? verbArg.split("=")[1] : null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function main() {
  const tickId = randomUUID();
  console.log(`[run-writer] tick=${tickId} mode=APPLY limit=${LIMIT ?? "none"} verb=${VERB_FILTER ?? "all"}`);
  console.log(`[run-writer] STAGE_5_SHIP_TS=${STAGE_5_SHIP_TS} (forward-only)`);

  let query = sb
    .from("email_ai_actions")
    .select("id, thread_id, classification_id, verb, confidence, reason, extracted_at")
    .in("verb", ["notion_update", "digest_p0_block", "digest_p0_unblock"])
    .gt("extracted_at", STAGE_5_SHIP_TS)
    .order("extracted_at", { ascending: true });
  if (VERB_FILTER) query = query.eq("verb", VERB_FILTER);

  const { data: actions, error: aErr } = await query;
  if (aErr) { console.error("query email_ai_actions failed:", aErr); process.exit(1); }

  if (!actions || actions.length === 0) {
    console.log("[run-writer] no eligible actions (forward-only window empty)");
    return;
  }

  console.log(`[run-writer] found ${actions.length} eligible actions`);

  const todo = LIMIT ? actions.slice(0, LIMIT) : actions;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const action of todo) {
    try {
      const { data: classification } = await sb
        .from("email_thread_classifications")
        .select("subject, bucket, reasoning, confidence")
        .eq("id", action.classification_id)
        .single();
      const result = await processAction(sb, action, classification ?? {}, tickId);
      console.log(`[run-writer] ${result.status} ${result.verb} thread=${result.thread_id} → ${result.target_system}:${result.target_ref}${result.error ? ` ERROR: ${result.error}` : ""}`);
      if (result.status === "success") succeeded++;
      else if (result.status === "skipped") skipped++;
      else failed++;
    } catch (e: any) {
      console.error(`[run-writer] fatal on ${action.thread_id}: ${e?.message ?? e}`);
      failed++;
    }
  }

  console.log(`\n[run-writer] DONE: succeeded=${succeeded} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
