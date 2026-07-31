// CERT — the NON-MANDATORY negation leak, BOTH DIRECTIONS, executed in two real processes.
// The fix makes the engine decline LESS often, which is the direction a false BID lives in, so the
// must-STILL-match set is as load-bearing as the must-not set and is asserted alongside it.
// Flag-OFF must REPRODUCE the leak — a cert whose OFF leg is already clean proves nothing about the fix.
export {};
import { execSync } from "node:child_process";
const LEAKY = new Set(["NOT  AOCSSB26R0023 verbatim", "NOT  lowercase non-mandatory", "NOT  spaced non mandatory"]);
const run = (on: boolean) => {
  const raw = execSync(`AUDIT_MANDATORY_NEGATION_GUARD=${on} PROBE_EMIT=1 npx tsx scripts/audit-ai/_cert-mandatory-negation-probe.ts`,
    { encoding: "utf8", cwd: "/Users/josearodriguezjr./faraudit-app" });
  return JSON.parse(raw.split("__JSON__")[1].trim());
};
let fail = 0;
for (const on of [false, true]) {
  console.log(`\n── AUDIT_MANDATORY_NEGATION_GUARD=${on} ${on ? "(the fix)" : "(prod today — the leak must still be here)"} ──`);
  for (const r of run(on) as Array<{ n: string; want: boolean; got: boolean; hit: string }>) {
    const expect = on ? r.want : (LEAKY.has(r.n) ? true : r.want);
    const ok = r.got === expect;
    if (!ok) fail++;
    console.log(`  ${ok ? "✓" : "✗"} ${r.n.padEnd(30)} want=${String(expect).padEnd(5)} got=${String(r.got).padEnd(5)} ${r.hit ? `"${r.hit.slice(0, 38)}"` : ""}`);
  }
}
console.log(fail
  ? `\n❌ ${fail} failed`
  : `\n✅ BOTH DIRECTIONS HOLD.\n   flag-OFF still leaks on all 3 NON-MANDATORY spellings — proving the guard is what fixes it, not luck.\n   flag-ON kills every leak case while all 9 genuine mandatory bars still match (no false BID).`);
process.exit(fail ? 1 : 0);
