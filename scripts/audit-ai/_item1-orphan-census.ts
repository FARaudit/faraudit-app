// STEP 5 — orphan-date census across all 60 agentic_v3 complete rows. For each row, render v5 (flag OFF, then ON),
// extract the masthead "Offers due" date, and check whether that date appears VERBATIM in the row's raw_pdf_text
// (in any common format). Orphan = rendered masthead date absent from every artifact. Reports OFF vs ON counts.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// Given "31 Jul 2026", build the set of source forms that would count as verbatim-present.
function forms(dd: number, monIx: number, yyyy: number): RegExp[] {
  const m2 = String(monIx + 1).padStart(2, "0"), d2 = String(dd).padStart(2, "0");
  const monFull: Record<string,string> = {Jan:"January",Feb:"February",Mar:"March",Apr:"April",May:"May",Jun:"June",Jul:"July",Aug:"August",Sep:"September",Oct:"October",Nov:"November",Dec:"December"};
  const mon = MON[monIx];
  return [
    new RegExp(`${dd}\\s+${mon}[a-z]*\\s+${yyyy}`, "i"),     // 31 Jul 2026 / 31 July 2026
    new RegExp(`${monFull[mon]}\\s+${dd},?\\s+${yyyy}`, "i"),// July 31, 2026
    new RegExp(`${mon}\\s+${dd},?\\s+${yyyy}`, "i"),         // Jul 31 2026
    new RegExp(`${yyyy}-${m2}-${d2}`),                        // 2026-07-31
    new RegExp(`${m2}/${d2}/${yyyy}`),                        // 07/31/2026
    new RegExp(`${dd}/${monIx + 1}/${yyyy}`),                // 31/7/2026
  ];
}
function mastheadDate(html: string): { dd: number; monIx: number; yyyy: number; label: string } | null {
  const m = strip(html).match(/Offers due\s+(\d{1,2})\s+([A-Z][a-z]{2})[a-z]*\s+(\d{4})/);
  if (!m) return null;
  const monIx = MON.indexOf(m[2]); if (monIx < 0) return null;
  return { dd: Number(m[1]), monIx, yyyy: Number(m[3]), label: `${m[1]} ${m[2]} ${m[3]}` };
}
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const rows: any[] = [];
  for (let from = 0; ; from += 200) {
    const { data } = await sb.from("audits").select("id,solicitation_number,response_deadline,raw_pdf_text,compliance_json").eq("status", "complete").range(from, from + 199);
    if (!data || !data.length) break; rows.push(...data); if (data.length < 200) break;
  }
  const v3 = rows.filter(r => r.compliance_json?.engine === "agentic_v3");
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE = "true"; process.env.AUDIT_SEVERITY_HONEST = "true";

  const run = (flagOn: boolean) => {
    if (flagOn) process.env.AUDIT_MASTHEAD_DEADLINE_RECONCILE = "true"; else delete process.env.AUDIT_MASTHEAD_DEADLINE_RECONCILE;
    let withDate = 0; const orphans: string[] = [];
    for (const row of v3) {
      const md = mastheadDate(renderV5ReportFromRow(row));
      if (!md) continue; withDate++;
      const src = String(row.raw_pdf_text || "");
      const present = forms(md.dd, md.monIx, md.yyyy).some(re => re.test(src));
      if (!present) orphans.push(`${String(row.id).slice(0,8)}(${row.solicitation_number}) → "${md.label}"`);
    }
    return { withDate, orphans };
  };
  const off = run(false), on = run(true);
  console.log(`agentic_v3 complete rows: ${v3.length}\n`);
  console.log(`=== FLAG-OFF (today's served logic) ===`);
  console.log(`  rows with a masthead deadline: ${off.withDate}`);
  console.log(`  ORPHAN masthead dates (not in that row's source): ${off.orphans.length}`);
  off.orphans.forEach(o => console.log(`    · ${o}`));
  console.log(`\n=== FLAG-ON (reconcile) ===`);
  console.log(`  rows with a masthead deadline: ${on.withDate}`);
  console.log(`  ORPHAN masthead dates: ${on.orphans.length}`);
  on.orphans.forEach(o => console.log(`    · ${o}`));
  console.log(`\nNET: reconcile cleared ${off.orphans.length - on.orphans.length} orphan(s); ${on.orphans.length} remain (census — not fixed beyond the reconcile logic).`);
})();
