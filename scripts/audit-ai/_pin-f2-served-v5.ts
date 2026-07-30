// PER-FLAG SERVED-V5 PIN for the 4 held F2 render flags. Method: render each REAL agentic_v3 row through the
// SERVED path (renderV5ReportFromRow = buildV4Data → renderRichWebV5) with ONE flag toggled OFF vs ON; a v5 byte-diff
// ⇒ the flag PARTICIPATES on the served surface. Captures a specimen BEFORE/AFTER signal per flag + a correctness read.
// $0. Run: npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_pin-f2-served-v5.ts
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";

const FLAGS = [
  { flag: "AUDIT_SETASIDE_HEADER_RECONCILE", name: "F-3 set-aside header", sig: /None confirmed|no operative set-aside clause/i },
  { flag: "AUDIT_MASTHEAD_OFFICE_LEAF",      name: "F-4 issuing-office leaf", sig: /Issuing office/i },
  { flag: "AUDIT_SEVERITY_HONEST",           name: "F-2 severity honesty",   sig: /Unrated|unrated/ },
  { flag: "AUDIT_COVERAGE_DISPLAY_COHERENT", name: "F-5 coverage coherence", sig: /Incomplete/ },
];
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("audits").select("id,solicitation_number,compliance_json").eq("status", "complete").range(from, from + 999);
    if (!data || !data.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  const v3 = rows.filter(r => r.compliance_json?.engine === "agentic_v3");
  // served v5 config baseline: all currently-served render flags. We toggle ONE F2 flag at a time from OFF→ON.
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true"; process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE = "true";
  console.log(`corpus: ${v3.length} agentic_v3 complete rows\n`);

  for (const { flag, name, sig } of FLAGS) {
    for (const f of FLAGS) delete process.env[f.flag]; // clean slate for the F2 four
    let participate = 0, sigOnCount = 0, sigOffCount = 0; let specimen: any = null;
    for (const row of v3) {
      delete process.env[flag]; const off = renderV5ReportFromRow(row);
      process.env[flag] = "true"; const on = renderV5ReportFromRow(row);
      delete process.env[flag];
      if (on !== off) {
        participate++;
        const onHas = sig.test(strip(on)), offHas = sig.test(strip(off));
        if (onHas) sigOnCount++; if (offHas) sigOffCount++;
        if (!specimen) {
          const ot = strip(off), nt = strip(on);
          // pull the masthead-ish window around the signal for a readable delta
          const idx = nt.search(sig);
          specimen = {
            id: row.id, sol: row.solicitation_number, deltaChars: on.length - off.length,
            onSnippet: idx >= 0 ? nt.slice(Math.max(0, idx - 40), idx + 90) : "(sig not in text; byte-diff elsewhere)",
            offSnippet: (() => { const oi = ot.search(sig); return oi >= 0 ? ot.slice(Math.max(0, oi - 40), oi + 90) : "(sig absent when OFF)"; })(),
          };
        }
      }
    }
    console.log(`── ${flag}  (${name}) ──`);
    console.log(`   v5-participation: ${participate}/${v3.length} rows differ  ·  sig-present ON=${sigOnCount} OFF=${sigOffCount}`);
    if (specimen) {
      console.log(`   specimen ${String(specimen.id).slice(0,8)} (${specimen.sol}) Δ${specimen.deltaChars>=0?"+":""}${specimen.deltaChars} chars`);
      console.log(`     OFF: …${specimen.offSnippet}…`);
      console.log(`     ON : …${specimen.onSnippet}…`);
    } else {
      console.log(`   → INERT on served v5 (no row's v5 output changed) — arming is a no-op on the served surface.`);
    }
    console.log("");
  }
})();
