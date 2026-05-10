import { getSupabase } from "./supabase";
import { errorMessage } from "./utils";

const REQUIRED_TABLES = [
  "email_blacklist",
  "email_ai_runs",
  "email_thread_classifications",
  "outbound_tracking",
] as const;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  email_ai_runs: [
    "threads_overridden_unreplyable",
    "threads_skipped_stale",
  ],
  email_thread_classifications: [
    "overridden",
    "override_reason",
  ],
  outbound_tracking: [
    "message_id",
    "awaiting_reply_since",
    "waiting_label_applied",
  ],
};

/**
 * Boot-time check: every table + column referenced by v3.1 must exist.
 * Fails loudly with exit code 1 if anything is missing.
 */
export async function runMigrationCheck(): Promise<void> {
  const supabase = getSupabase();

  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select("*").limit(0);
    if (error) {
      console.error(
        `[email-ai-v3] FATAL: required table missing: ${table} — ${errorMessage(error)}`
      );
      console.error(`[email-ai-v3] apply migration 021 + 022 + 023 via Supabase dashboard before redeploying`);
      process.exit(1);
    }
  }

  let columnCount = 0;
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const col of cols) {
      const { error } = await supabase.from(table).select(col).limit(0);
      if (error) {
        console.error(
          `[email-ai-v3] FATAL: required column missing: ${table}.${col} — ${errorMessage(error)}`
        );
        process.exit(1);
      }
      columnCount += 1;
    }
  }

  console.log(
    `[email-ai-v3] boot: ${REQUIRED_TABLES.length} tables + ${columnCount} columns verified`
  );
}
