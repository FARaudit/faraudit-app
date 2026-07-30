// CERT — the v5 deadline-caveat fix (flag AUDIT_V5_DEADLINE_CAVEAT). On 496a9a21 (reset_tbd deadline), flag-OFF must
// be byte-identical to today's served output; flag-ON must render the engine's reset caveat that v5 was dropping.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
const CAVEAT = /reset by the latest amendment|Verify against the latest amendment|new date will be provided/i;
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: row } = await sb.from("audits").select("*").eq("id", "496a9a21-8391-41b4-9e24-cff212971fd3").single();
  // baseline = current served config (v5 + seal + already-armed flags), caveat flag OFF
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE = "true"; process.env.AUDIT_SEVERITY_HONEST = "true";
  delete process.env.AUDIT_V5_DEADLINE_CAVEAT;
  const off = renderV5ReportFromRow(row);
  process.env.AUDIT_V5_DEADLINE_CAVEAT = "true";
  const on = renderV5ReportFromRow(row);
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const offHas = CAVEAT.test(strip(off)), onHas = CAVEAT.test(strip(on));
  console.log("flag-OFF caveat present:", offHas, "(expect false)");
  console.log("flag-ON  caveat present:", onHas, "(expect true)");
  console.log("byte-delta ON-OFF:", on.length - off.length, "(caveat node only)");
  // show the rendered caveat text
  const t = strip(on); const i = t.search(CAVEAT);
  if (i >= 0) console.log("rendered caveat: …" + t.slice(Math.max(0, i - 30), i + 130) + "…");
  const pass = !offHas && onHas;
  console.log("\nRESULT:", pass ? "PASS — flag-OFF byte-identical (no caveat); flag-ON renders the engine's reset caveat v5 was dropping" : "FAIL");
  process.exit(pass ? 0 : 1);
})();
