import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await a.from("audits").select("raw_pdf_text").eq("id","95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const { extractClinSchedule } = await import("../../src/lib/audit-clin-schedule");
  const rows = extractClinSchedule((row as any).raw_pdf_text);
  console.log(`extracted ${rows.length} line items\n`);
  for (const r of rows) console.log(`  ${r.clin.padEnd(6)} | ${(r.title ?? "—").padEnd(34)} | ${(r.qtyUnit ?? "—").padEnd(9)} | ${(r.type ?? "—").padEnd(18)} | ${r.period ?? "—"}`);
})();
