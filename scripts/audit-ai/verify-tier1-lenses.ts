// $0 deterministic gate for T1-8 (passed-deadline NO-BID softening).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-lenses.ts
//
// The SHARED lens prompt listed "a passed deadline" as an already_satisfied
// example (line 26) while lines 28-31 correctly type a passed deadline as a
// universal impossibility (no_one_can_move show-stopper). That self-contradiction
// invited a lens to soften a passed-deadline NO-BID to already_satisfied. Fix:
// the already_satisfied definition now excludes a passed deadline and points at
// the no_one_can_move rule. Verified against the REAL exported lens prompt string.

import { AUDIT_LENSES } from "@/lib/audit-lenses";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const prompt = AUDIT_LENSES[0].system; // SHARED text is embedded verbatim in every lens

// Locate the already_satisfied definition line and check the passed-deadline exclusion.
const alreadyLine = prompt.split("\n").find((l) => /already_satisfied\s*=/.test(l)) ?? "";
ok("T1-8 R1: the already_satisfied definition exists in the shipped prompt", alreadyLine.length > 0);
ok("T1-8 R2: already_satisfied NO LONGER lists a passed deadline as an example (contradiction removed)",
  !/already_satisfied\s*=[^\n]*a passed deadline\)/.test(prompt) && !/existing registration, a passed deadline/.test(prompt));
ok("T1-8 R3: the already_satisfied line explicitly EXCLUDES a passed deadline",
  /already_satisfied/.test(alreadyLine) && /passed\s+(?:response\s+)?deadline is NEVER already_satisfied/i.test(alreadyLine));
ok("T1-8 R4: the prompt still types a passed deadline as a no_one_can_move show-stopper (rule preserved)",
  /already[-\s]passed deadline/i.test(prompt) && /no_one_can_move/.test(prompt));
ok("T1-8 R5: the prompt still warns that softening a universal bar is wrong",
  /wrongly soften a NO-BID/i.test(prompt));
ok("T1-8 R6: EVERY lens carries the corrected SHARED guidance (embedded in all system prompts)",
  AUDIT_LENSES.every((l) => /passed\s+(?:response\s+)?deadline is NEVER already_satisfied/i.test(l.system)));

console.log(`\nTier1 lenses (T1-8): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
