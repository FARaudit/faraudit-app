// CERT — the cross-flag coupling the code review found. Arming AUDIT_SITEVISIT_LITERAL_HONEST while the
// negation guard stayed OFF made the "honest" literal open with "Mandatory site visit" on a NON-MANDATORY
// notice AND assert "The notice states attendance conditions eligibility" — a NEW fabrication the legacy
// string never made. The dependency is now enforced in code; this proves it, in real processes.
export {};
import { execSync } from "node:child_process";
const NON_MANDATORY = "A NON-MANDATORY site visit will be held at the Capitol Building, room S-216";
const probe = (env: string) => execSync(`${env} npx tsx scripts/audit-ai/_cert-flag-coupling-probe.ts`,
  { encoding: "utf8", cwd: "/Users/josearodriguezjr./faraudit-app" }).split("__J__")[1].trim();
console.log(`specimen: "${NON_MANDATORY}"`);
let fail = 0;
const CASES: Array<[string, string, boolean]> = [
  ["both OFF (prod today)",                    "AUDIT_MANDATORY_NEGATION_GUARD=false AUDIT_SITEVISIT_LITERAL_HONEST=false", true],
  ["LITERAL_HONEST alone (the review's bug)",  "AUDIT_MANDATORY_NEGATION_GUARD=false AUDIT_SITEVISIT_LITERAL_HONEST=true",  false],
  ["NEGATION_GUARD alone",                     "AUDIT_MANDATORY_NEGATION_GUARD=true  AUDIT_SITEVISIT_LITERAL_HONEST=false", false],
  ["both ON",                                  "AUDIT_MANDATORY_NEGATION_GUARD=true  AUDIT_SITEVISIT_LITERAL_HONEST=true",  false],
];
for (const [name, env, wantMatch] of CASES) {
  const got = JSON.parse(probe(env)).matched as boolean;
  const ok = got === wantMatch;
  if (!ok) fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(42)} regex matches NON-MANDATORY: want=${String(wantMatch).padEnd(5)} got=${got}`);
}
console.log(fail
  ? `\n❌ ${fail} failed — the coupling is NOT enforced`
  : `\n✅ COUPLING ENFORCED. LITERAL_HONEST alone now implies the guard, so the combination that\n   produced a new fabrication is unreachable. Both-OFF still reproduces prod-today's leak.`);
process.exit(fail ? 1 : 0);
