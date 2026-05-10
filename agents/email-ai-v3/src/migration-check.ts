import { getSupabase } from "./supabase";

const REQUIRED_TABLES = [
  "email_blacklist",
  "email_ai_runs",
  "email_thread_classifications",
] as const;

/**
 * Boot-time check: every table referenced by v3 must exist in Supabase.
 * Fails loudly with exit code 1 if any are missing — refuses to proceed.
 */
export async function runMigrationCheck(): Promise<void> {
  const supabase = getSupabase();

  // Trivial select with limit 0 — fails if table does not exist or service role lacks access
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select("id").limit(0);
    if (error) {
      console.error(
        `[email-ai-v3] migration check FAILED — table '${table}' not accessible: ${error.message}`
      );
      console.error(
        `[email-ai-v3] apply migration 021_email_ai_v3.sql via Supabase dashboard before redeploying`
      );
      process.exit(1);
    }
  }

  console.log(`[email-ai-v3] boot: 3 tables verified (${REQUIRED_TABLES.join(", ")})`);
}
