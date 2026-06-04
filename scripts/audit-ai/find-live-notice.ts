// One-shot: find a currently-active SAM notice_id from pending_audits with
// response_deadline > now() + 6h (so the pin endpoint's guard won't reject
// it and the audit engine can actually run). Used by the run→report
// verification spec.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const cutoff = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pending_audits")
    .select("notice_id, solicitation_number, title, response_deadline, agency")
    .eq("status", "pending")
    .gt("response_deadline", cutoff)
    .order("response_deadline", { ascending: true })
    .limit(5);
  if (error) { console.error(error); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}
main();
