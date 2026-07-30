// $0 CERT — REPORT-TRUTH #4 on the REAL run, through the production render path.
// Asserts the CLIN panel now shows the schedule the solicitation states (26 items, real quantities, real periods)
// instead of four-digit tokens scraped from prose, and that flag-OFF is unchanged.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await a.from("audits").select("*").eq("id", ID).single();
  const { extractClinSchedule } = await import("../../src/lib/audit-clin-schedule");

  console.log("A · THE SCHEDULE IS IN THE SOURCE (and always was)");
  const sched = extractClinSchedule((row as { raw_pdf_text: string }).raw_pdf_text);
  ok("26 line items extracted — the Gauntlet's stated ground truth", sched.length === 26);
  ok("base items 0001-0006 present", ["0001", "0002", "0003", "0004", "0005", "0006"].every((c) => sched.some((r) => r.clin === c)));
  ok("option items 1001-4005 present", sched.some((r) => r.clin === "1001") && sched.some((r) => r.clin === "4005"));
  ok("0001 is 'Moving and Edging', 52 Each, Firm Fixed Price",
    sched[0].clin === "0001" && sched[0].title === "Moving and Edging" && sched[0].qtyUnit === "52 Each" && sched[0].type === "Firm Fixed Price");
  ok("periods are real dates, not invented", sched[0].period === "15 Sep 2026 – 31 Aug 2027");
  ok("NO item is 1810 / 2026 / 7012 — the #3 fabrications", !sched.some((r) => ["1810", "2026", "7012", "1984"].includes(r.clin)));

  console.log("\nB · IT REACHES THE RENDERED REPORT");
  const render = async (flag: boolean) => {
    process.env.AUDIT_CLIN_SCHEDULE_EXTRACT = flag ? "true" : "false";
    process.env.AUDIT_PANEL_COMPUTE_OR_ABSENT = "true";
    const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
    return renderV5ReportFromRow(row as Record<string, unknown>);
  };
  const off = await render(false), on = await render(true);
  ok("flag-ON names a real line item the customer can price", /Moving and Edging/.test(on));
  ok("flag-ON shows the quantity", /52 Each/.test(on));
  ok("flag-ON shows the period of performance", /15 Sep 2026/.test(on));
  ok("flag-ON restores the Qty / unit column (now that it is computed)", /Qty \/ unit/.test(on));
  ok("flag-OFF shows none of it (the fix is not inert)", !/Moving and Edging/.test(off));

  console.log(`\nCERT RT4 · schedule on the real run: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
