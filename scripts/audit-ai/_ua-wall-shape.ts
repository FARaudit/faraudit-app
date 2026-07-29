import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from("audits").select("id, created_at, compliance_json").order("created_at", { ascending: false }).limit(3);
  for (const r of data ?? []) {
    const cj = (r as { compliance_json: Record<string, unknown> }).compliance_json ?? {};
    console.log((r as { id: string }).id.slice(0, 8), Object.keys(cj).join(", ").slice(0, 300));
    const dr = cj.decisionRecord ?? cj.decision ?? cj.verdictRecord;
    if (dr) console.log("  decision-ish:", JSON.stringify(dr).slice(0, 200));
    for (const k of ["verdict","overall_verdict","summary","verdictReason"]) if (cj[k] !== undefined) console.log(` ${k}:`, JSON.stringify(cj[k]).slice(0,150));
  }
})();
