// CERT — 4th collision site (ELIGIBILITY_BAR_RE, audit-orchestrator). Two real processes; flag-OFF must still
// leak, or the cert is not proving the guard is what fixed it.
export {};
import { execSync } from "node:child_process";
let fail = 0;
for (const on of [false, true]) {
  const raw = execSync(`AUDIT_MANDATORY_NEGATION_GUARD=${on} npx tsx scripts/audit-ai/_cert-eligbar-negation-probe.ts`,
    { encoding: "utf8", cwd: "/Users/josearodriguezjr./faraudit-app" });
  const rows = JSON.parse(raw.split("__J__")[1].trim()) as Array<{ n: string; w: boolean; got: boolean }>;
  console.log(`\n── guard=${on} ${on ? "(the fix)" : "(prod today — leak must still be present)"} ──`);
  for (const r of rows) {
    // OFF must still leak on the two reachable NOT cases; the REAL-AOC case never matches in either state.
    const leaks = r.n.startsWith("NOT");
    const expect = on ? r.w : (leaks ? true : r.w);
    const ok = r.got === expect;
    if (!ok) fail++;
    console.log(`  ${ok ? "✓" : "✗"} ${r.n.padEnd(32)} want=${String(expect).padEnd(5)} got=${r.got}`);
  }
}
console.log(fail ? `\n❌ ${fail} failed` : `\n✅ 4th site fixed — OFF still leaks, ON blocks both NON-MANDATORY spellings while genuine bars still match.`);
process.exit(fail ? 1 : 0);
