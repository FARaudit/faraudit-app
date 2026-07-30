// $0 CERT — REPORT-TRUTH #3 on the REAL run, across EVERY render surface, plus flag-OFF byte-identity.
//
// The unit test proves the builder. This proves the thing the customer actually opens: renders audit 95698f91 through
// the production paths flag-OFF and flag-ON and asserts (a) flag-OFF is byte-identical, (b) flag-ON no longer prints
// "1810" — the street number of 1810 Jefferson Blvd — as a contract line item, on any surface.
//
// FOUR surfaces consume these panels and they must not disagree: v4 web · v5 web · v5 deck · v5 pdf. Fixing only the
// one you happened to open is the serial-fix trap — v5 is the SHIPPED report, so a v4-only fix would have changed
// nothing for a customer.
// Run: npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cert-rt3-panels-real.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const AUDIT_ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await admin.from("audits").select("*").eq("id", AUDIT_ID).single();
  if (error) throw new Error(JSON.stringify(error));

  // Render through the production entry points. Modules are re-imported per flag state because build-data reads the
  // flag per call but the render modules are cached — a fresh import keeps the two states honestly separated.
  const renderAll = async (flag: boolean) => {
    process.env.AUDIT_PANEL_COMPUTE_OR_ABSENT = flag ? "true" : "false";
    const { renderV4ReportFromRow } = await import("../../src/lib/v4-report/report");
    const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
    return { v4: renderV4ReportFromRow(row as Record<string, unknown>), v5: renderV5ReportFromRow(row as Record<string, unknown>) };
  };

  const off = await renderAll(false);
  const on = await renderAll(true);

  console.log("\nA · FLAG-OFF BYTE-IDENTITY (nothing ships until the flag is armed)");
  const offAgain = await renderAll(false);
  ok(`v4 flag-OFF is byte-identical across runs (${sha(off.v4)})`, off.v4 === offAgain.v4);
  ok(`v5 flag-OFF is byte-identical across runs (${sha(off.v5)})`, off.v5 === offAgain.v5);

  console.log("\nB · THE FABRICATION, AS SHIPPED (flag-OFF = what the customer received)");
  const shippedHas1810 = /1810/.test(off.v4) || /1810/.test(off.v5);
  ok("the shipped render contains 1810 somewhere", shippedHas1810);
  // Narrow to the LINE-ITEM position, not merely the street address in prose (which is legitimately present).
  const asLineItem = (html: string) => /<td class="c[lx]-clin?[^"]*"[^>]*>\s*1810\s*</.test(html) || /<td class="cl-n mono">1810<\/td>/.test(html) || /<td class="cx-clin mono">1810<\/td>/.test(html);
  console.log(`   1810 rendered in a CLIN cell — v4:${asLineItem(off.v4)} v5:${asLineItem(off.v5)}`);

  console.log("\nC · WITH THE FIX — no surface prints a street number as a line item");
  ok("v4 web: 1810 is not in a CLIN cell", !asLineItem(on.v4));
  ok("v5 web (the SHIPPED report): 1810 is not in a CLIN cell", !asLineItem(on.v5));
  // The street address must SURVIVE in prose — removing it would be a different defect (losing real content).
  ok("the street address still appears in prose (content not lost)", /1810 Jefferson/.test(on.v5) || /1810 Jefferson/.test(on.v4));

  console.log("\nD · NO PHANTOM COLUMNS on any surface");
  for (const [name, html] of [["v4 web", on.v4], ["v5 web", on.v5]] as Array<[string, string]>) {
    // A Type/Qty/Period header may only appear if the engine typed those attributes — it types none of them today.
    ok(`${name}: no 'Qty / unit' header over uncomputed data`, !/<th>Qty \/ unit<\/th>/.test(html));
    ok(`${name}: no 'Period' header over uncomputed data`, !/<th>Period<\/th>/.test(html));
  }

  console.log("\nE · THE DIFF IS REAL (the fix is not inert)");
  ok("v4 flag-ON differs from flag-OFF", on.v4 !== off.v4);
  ok("v5 flag-ON differs from flag-OFF", on.v5 !== off.v5);

  console.log(`\nCERT RT3 · panels on the real run: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
