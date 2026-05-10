import { getSupabase } from "./supabase";

let cached: Set<string> | null = null;

/** Load active blacklist from Supabase into an in-memory lowercase Set. */
export async function loadBlacklist(): Promise<Set<string>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("email_blacklist")
    .select("sender_email")
    .eq("active", true);
  if (error) {
    throw new Error(`loadBlacklist failed: ${error.message}`);
  }
  cached = new Set((data || []).map((r) => (r.sender_email as string).toLowerCase()));
  console.log(`[email-ai-v3] boot: ${cached.size} senders blacklisted`);
  return cached;
}

export function isBlacklisted(senderEmail: string | null | undefined): boolean {
  if (!cached) throw new Error("blacklist not loaded — call loadBlacklist() at boot");
  if (!senderEmail) return false;
  return cached.has(senderEmail.toLowerCase());
}
