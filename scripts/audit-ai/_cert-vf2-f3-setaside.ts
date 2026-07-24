// CERT — Vehicle F2 · F-3 (flag AUDIT_SETASIDE_HEADER_RECONCILE). Faithful fixture 496a9a21 (set_aside="SBA",
// set_aside_type=null, body finding "52.219-6 absent / no socioeconomic set-aside"). Asserts the masthead does not
// assert a set-aside the body denies. $0. Run: npx tsx scripts/audit-ai/_cert-vf2-f3-setaside.ts
import { readFileSync } from "node:fs";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";

const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json", "utf8"));
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fails++; };
// extract the Set-aside masthead fact value
const setAsideVal = (html: string): string | null => {
  const m = html.match(/mf-k">Set-aside<\/div>[\s\S]{0,120}?mf-val">([^<]*)<\/span>/);
  return m ? m[1] : null;
};

delete process.env.AUDIT_SETASIDE_HEADER_RECONCILE;
const off = renderV4ReportFromRow(row);
console.log(`[flag-OFF] Set-aside fact = ${JSON.stringify(setAsideVal(off))}`);
ok(setAsideVal(off) === "SBA", "flag-OFF: masthead asserts raw 'Set-aside: SBA' (legacy, byte-identical)");

process.env.AUDIT_SETASIDE_HEADER_RECONCILE = "true";
const on = renderV4ReportFromRow(row);
const v = setAsideVal(on);
console.log(`[flag-ON ] Set-aside fact = ${JSON.stringify(v)}`);
ok(v !== "SBA", "flag-ON: masthead no longer asserts the bare 'SBA' set-aside the body denies");
ok(v === "None confirmed", `flag-ON: header derives from the body finding → 'None confirmed' (got ${JSON.stringify(v)})`);
ok(/no operative set-aside clause \(52\.219-6 absent\)/.test(on), "flag-ON: reconcile sub-note explains the SAM coding vs absent clause");

delete process.env.AUDIT_SETASIDE_HEADER_RECONCILE;
const off2 = renderV4ReportFromRow(row);
ok(off2 === off, "flip-back: flag-OFF render byte-identical");

console.log(fails === 0 ? "\n✅ ALL GREEN — F-3 set-aside header/body reconcile" : `\n❌ ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
