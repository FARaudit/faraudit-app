// $0 fixture pull — persist the FA813726 e63bd1e7 INCOMPLETE row (9/9 read, INCOMPLETE pole) as a fixture
// so the COVERAGE_COUNTER_SPLIT served pin is reproducible. Read-only; no writes.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const PREFIX = process.argv[2] || "e63bd1e7";
  const { data, error } = await admin
    .from("audits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) { console.error("ERR", error.message); process.exit(1); }
  const matches = (data || []).filter((r: any) => typeof r.id === "string" && r.id.startsWith(PREFIX));
  if (matches.length === 0) { console.error(`no row matching ${PREFIX}% in last 500 by created_at`); process.exit(1); }
  if (matches.length > 1) { console.error(`ambiguous: ${matches.length} rows match ${PREFIX}%`); process.exit(1); }
  const row = matches[0];
  const out = `scripts/audit-ai/fixtures/row-${PREFIX}-live.json`;
  writeFileSync(out, JSON.stringify(row, null, 2));
  console.log(`WROTE ${out}`);
  console.log(`id=${row.id}  sol=${row.solicitation_number ?? row.sol_number ?? "?"}  status=${row.status}  verdict_pole=${row.compliance_json?.verdict?.pole ?? "?"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
