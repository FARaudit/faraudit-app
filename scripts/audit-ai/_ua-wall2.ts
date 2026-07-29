// Wall classifier v2 — verdict lives in v3.decision or a sibling column. Probe one row fully.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from("audits").select("*").order("created_at", { ascending: false }).limit(1);
  const row = (data ?? [])[0] as Record<string, unknown>;
  console.log("columns:", Object.keys(row).join(", "));
  const cj = row.compliance_json as Record<string, unknown>;
  const v3 = cj?.v3 as Record<string, unknown> | undefined;
  if (v3) console.log("v3 keys:", Object.keys(v3).join(", "));
  const dec = (v3?.decision ?? v3?.verdict) as Record<string, unknown> | string | undefined;
  console.log("decision:", JSON.stringify(dec)?.slice(0, 300));
})();
