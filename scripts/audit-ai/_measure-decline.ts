// FIRST MEASUREMENT of the half we never looked at. Reads the banked gold-set judgment keys (expected verdict)
// and reports BOTH error directions plus the decline rate. $0 — files only, no model, no network.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verdictErrors, isFalseDecline, isFalseBid } from "./_instrument";
const DIR = "scripts/audit-ai/gold-sets";
const pick = (o: any): string[] => {
  const c = o?.expected_verdict ?? o?.expectedVerdict ?? o?.verdict ?? o?.judgment?.verdict ?? o?.expected?.verdict;
  return c ? (Array.isArray(c) ? c : [String(c)]) : [];
};
const specimens: Array<{ file: string; exp: string[]; got: string }> = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  try {
    const o = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    const exp = pick(o);
    const got = String(o?.got ?? o?.actual_verdict ?? o?.verdict ?? "");
    if (exp.length && got) specimens.push({ file: f, exp, got });
  } catch {}
}
console.log(`gold-set files with a readable expected verdict: ${specimens.length}`);
if (!specimens.length) {
  console.log("\n⚠ No specimen carries BOTH an expected and an observed verdict in one file.");
  console.log("  That is itself the finding: the corpus can score a false BID only because the RULER unit-test");
  console.log("  supplies synthetic pairs — there is no banked answer key pairing expectation with outcome.");
  console.log("  A false-decline rate CANNOT be computed from what is on disk today.");
  process.exit(0);
}
const r = verdictErrors(specimens);
console.log(`  false BIDs      ${r.falseBids}`);
console.log(`  false DECLINES  ${r.falseDeclines}   <- never measured before today`);
console.log(`  decline rate    ${(r.declineRate * 100).toFixed(1)}%`);
for (const s of specimens) {
  if (isFalseDecline(s.exp, s.got)) console.log(`    DECLINE  ${s.file}: expected ${s.exp.join("|")} got ${s.got}`);
  if (isFalseBid(s.exp, s.got)) console.log(`    FALSEBID ${s.file}: expected ${s.exp.join("|")} got ${s.got}`);
}
