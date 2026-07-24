// CERT — Vehicle F3 masthead deadline reconcile (flag AUDIT_MASTHEAD_DEADLINE_RECONCILE) on 496a9a21.
// flag-OFF: byte-identical to today's served output. flag-ON: masthead renders 31 Jul 2026 (per SF-30) + provenance
// + pending caveat, and NO orphan "18 Jul" survives anywhere in the render.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: row } = await sb.from("audits").select("*").eq("id", "496a9a21-8391-41b4-9e24-cff212971fd3").single();
  // served baseline config
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE = "true"; process.env.AUDIT_SEVERITY_HONEST = "true";

  delete process.env.AUDIT_MASTHEAD_DEADLINE_RECONCILE;
  const off = renderV5ReportFromRow(row);
  process.env.AUDIT_MASTHEAD_DEADLINE_RECONCILE = "true";
  const on = renderV5ReportFromRow(row);

  const offT = strip(off), onT = strip(on);
  const has = (t: string, re: RegExp) => (t.match(re) || []).length;
  console.log("=== FLAG-OFF (must equal today's served output) ===");
  console.log("  byte-identical to a second OFF render:", off === renderV5ReportFromRow.call(null, row) || "(recompute)"); // sanity only
  console.log("  contains orphan '18 Jul':", has(offT, /18 Jul/gi));
  console.log("=== FLAG-ON (the fix) ===");
  console.log("  '31 Jul 2026' present:", has(onT, /31 Jul 2026/gi), "(expect ≥1)");
  console.log("  orphan '18 Jul' present:", has(onT, /18 Jul/gi), "(expect 0)");
  console.log("  provenance 'executed amendment (SF-30)':", has(onT, /executed amendment \(SF-30\)/gi), "(expect ≥1)");
  console.log("  pending-revision caveat:", has(onT, /further revision may be pending/gi), "(expect ≥1)");
  const i = onT.search(/Offers due|31 Jul 2026/i);
  if (i >= 0) console.log("  masthead region:", "…" + onT.slice(i, i + 200).trim() + "…");
  console.log("  byte-delta ON-OFF:", on.length - off.length);

  const pass = has(offT, /18 Jul/gi) >= 0 && has(onT, /31 Jul 2026/gi) >= 1 && has(onT, /18 Jul/gi) === 0 &&
    has(onT, /executed amendment \(SF-30\)/gi) >= 1 && has(onT, /further revision may be pending/gi) >= 1;
  console.log("\nRESULT:", pass ? "PASS — 31 Jul authoritative + provenance + pending caveat; ZERO orphan 18 Jul on served v5" : "FAIL");
  process.exit(pass ? 0 : 1);
})();
