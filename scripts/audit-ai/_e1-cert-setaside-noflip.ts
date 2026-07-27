// ARC #747 · E1 — CERT: the cross-row P0 is dead. $0, nothing written.
//
// An integration probe caught the backward walk climbing through a CLAUSE-INCORPORATION table — rows like
//   "FAR Clause \t52.219-6 \tNotice of Total Small Business Set-Aside \tFeb 2026 \tYes"
// — and prepending unrelated clauses to a finding's quote. `isPositiveSetAside` (audit-decide.ts:598) then
// flipped false→true on four findings: a Nonmanufacturer-Rule quote asserting a total small-business
// set-aside because the row above it got glued on. Verbatim text, wrong clause, landing on the set-aside axis.
//
// This re-runs the shipped pass over every banked run record and asserts, on real data, that (1) no finding's
// set-aside reading changes, and (2) no repaired excerpt gains a clause-table row it did not already have.
// Rule (2) is the general form — the set-aside axis is the consequence that was caught, not the whole risk.
import * as fs from "fs";
import * as path from "path";
import { RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { repairHeadClippedExcerpts } from "../../src/lib/audit-excerpt-repair";
import { isPositiveSetAside } from "../../src/lib/audit-decide";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));
// A clause-incorporation row: a regulation number plus column separators.
const CLAUSE_ROW = /\b\d{2,3}\.\d{3}(?:-\d+)?\b[^\n]*?(?:\t| {2,})/;

let loaded = 0, repaired = 0, setAsideFlips = 0, rowGains = 0;
const detail: string[] = [];

for (const f of files) {
  let rec: RunRecord;
  try {
    rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (rec?.schema !== RUN_RECORD_SCHEMA) continue;
  } catch { continue; }
  if (!rec.input?.fullSource || !rec.result?.findings?.length) continue;
  loaded++;

  const findings = JSON.parse(JSON.stringify(rec.result.findings)) as typeof rec.result.findings;
  const before = findings.map((x) => ({ setAside: isPositiveSetAside(x), excerpt: x.excerpt ?? "" }));

  process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
  const res = repairHeadClippedExcerpts(findings, rec.input.fullSource);
  delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  repaired += res.repaired;

  findings.forEach((x, i) => {
    if (isPositiveSetAside(x) !== before[i].setAside) {
      setAsideFlips++;
      detail.push(`  ⚠ SET-ASIDE FLIP ${rec.meta?.sol ?? f} · finding ${i}: ${before[i].setAside} → ${!before[i].setAside}\n     ${String(x.excerpt).slice(0, 160).replace(/\s+/g, " ")}`);
    }
    const now = x.excerpt ?? "";
    if (now !== before[i].excerpt && CLAUSE_ROW.test(now) && !CLAUSE_ROW.test(before[i].excerpt)) {
      rowGains++;
      detail.push(`  ⚠ CLAUSE-ROW GAINED ${rec.meta?.sol ?? f} · finding ${i}:\n     ${now.slice(0, 160).replace(/\s+/g, " ")}`);
    }
  });
}

console.log(`\nARC #747 · E1 CERT — cross-row contamination ($0)\n`);
console.log(`  run records replayed ................... ${loaded}`);
console.log(`  excerpts re-grounded ................... ${repaired}`);
console.log(`  set-aside readings that FLIPPED ........ ${setAsideFlips}`);
console.log(`  excerpts that GAINED a clause row ...... ${rowGains}`);
for (const d of detail) console.log(d);
const clean = setAsideFlips === 0 && rowGains === 0;
console.log(`\nRESULT: ${clean ? "CLEAN — no finding changed its set-aside reading and no quote absorbed a neighbouring clause row" : "NOT CLEAN — cross-row contamination is still reachable"}`);
console.log(`(A zero here means nothing unless excerpts were actually re-grounded — ${repaired} were.)\n`);
process.exit(clean ? 0 : 1);
