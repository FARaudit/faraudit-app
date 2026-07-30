import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
process.env.AUDIT_GATE_REASON_NAMED = "true";
import { createClient } from "@supabase/supabase-js";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits").select("*").eq("id", "583df921-9cd9-4fd9-b56a-4f49aee62eb2").single();
  const { gateCause } = await import("../../src/app/audit/[id]/route");
  const c = gateCause(data as never)!;
  const wrap = (t: string) => t.replace(/(.{92}\S*)\s/g, "$1\n  ");
  console.log("BEFORE — what the customer saw:\n");
  console.log("  ⚠ Deep analysis unavailable for this run");
  console.log("  " + wrap("The core report below is complete and accurate. Export is disabled until a full analysis succeeds — re-run to try again."));
  console.log("\nAFTER:\n");
  console.log("  ⚠ " + c.head);
  console.log("  " + wrap(c.body));
})();
