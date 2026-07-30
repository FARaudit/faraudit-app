// Live pull of the 496a9a21 served audit row from prod Supabase (ground truth for the served-surface pin).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error("MISSING SUPABASE ENV"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  const { data, error } = await sb.from("audits").select("*")
    .ilike("solicitation_number", "FA813726R0033").order("created_at", { ascending: false }).limit(20);
  if (error) { console.error("ERR", error.message); process.exit(1); }
  const matches = (data || []).filter((r: any) => String(r.id).startsWith("496a9a21"));
  if (!matches.length) { console.error("NO ROW id 496a9a21% under FA813726R0033; ids seen:", (data||[]).map((r:any)=>String(r.id).slice(0,8))); process.exit(1); }
  if (matches.length > 1) console.error("WARN: >1 row matched prefix");
  const row = matches[0] as Record<string, unknown>;
  const cj = (row.compliance_json ?? {}) as Record<string, unknown>;
  console.log("id            =", row.id);
  console.log("sol           =", row.solicitation_number);
  console.log("status        =", row.status);
  console.log("engine        =", (cj as any).engine);
  console.log("noVerdictCause =", (cj as any).noVerdictCause);
  console.log("verdict/headline present =", !!(cj as any).verdict, "/", !!(cj as any).headline);
  writeFileSync("scripts/audit-ai/fixtures/row-496a9a21-live.json", JSON.stringify(row));
  console.log("→ wrote scripts/audit-ai/fixtures/row-496a9a21-live.json");
})();
