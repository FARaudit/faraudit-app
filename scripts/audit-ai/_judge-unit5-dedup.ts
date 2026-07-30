// INDEPENDENT JUDGE probe — DEDUP dangerous direction (highest severity).
// The dangerous failure = an UNRELATED co-emitted finding falsely suppresses a REAL 520/1040 emission
// toward committal. I construct the pathological co-findings myself and confirm the real emission SURVIVES.
import { applyQuantityAmbiguityFidelity } from "../../src/lib/audit-decide";

// A genuine source that DOES pose the either/or question (so emission SHOULD happen unless dedup wrongly suppresses).
const SRC = "Question 12: Is the total requirement 520 hours or 1,040 hours?";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL", m); } };

const mkF = (o: any) => ({ id: o.id ?? "x", requirement: o.requirement ?? "", citation: o.citation ?? "", excerpt: o.excerpt ?? "", kind: "other", controllability: "bidder_controls", grounded: true } as any);

const emits = (findings: any[]): boolean => {
  const out = applyQuantityAmbiguityFidelity(findings, SRC, { enabled: true });
  return out.some((f: any) => f.quantityAmbiguityFlagged === true);
};

// --- MUST STILL EMIT (co-finding is UNRELATED / does not truly name the pair as unresolved) ---
// 1. embedded digits 5W520 (CAGE-ish) + 52.219-1040 clause, with an ambiguity marker
ok(emits([mkF({ requirement: "CAGE 5W520 registration is ambiguous per clause 52.219-1040 discrepancy" })]),
  "embedded 5W520 / 52.219-1040 + marker does NOT suppress (digits embedded, not the pair)");
// 2. an unrelated 'or ... ?' question finding
ok(emits([mkF({ requirement: "Shall the offeror submit volume A or volume B? This is unresolved and ambiguous." })]),
  "unrelated 'or...?' + ambiguity words does NOT suppress");
// 3. a one-number finding (only 520) with a marker
ok(emits([mkF({ requirement: "The 520 hours estimate is ambiguous and unresolved per the PWS." })]),
  "one-number (520 only) + marker does NOT suppress");
// 4. a both-numbers-NO-marker finding
ok(emits([mkF({ requirement: "Base period is 520 hours; option adds 1,040 hours of surge." })]),
  "both numbers but NO ambiguity marker does NOT suppress");
// 5. numbers in DIFFERENT findings (split), each with a marker but never together
ok(emits([mkF({ requirement: "520 hours is unresolved" }), mkF({ requirement: "1,040 hours discrepancy" })]),
  "520 and 1,040 in SEPARATE findings does NOT suppress (dedup needs BOTH in one blob)");
// 6. glued-digit right side: '1,040-hour' with 520 + marker in same finding — this is a REAL prior naming the pair
//    (should SUPPRESS — the honest no-double case). Confirm it DOES suppress.
ok(!emits([mkF({ requirement: "The base is stated as 520 hours or 1,040-hour surge, an unresolved discrepancy." })]),
  "GENUINE prior (520 + 1,040 + 'discrepancy' in one blob) DOES suppress (no double emit) — correct");

// 7. control: no co-findings at all -> emits
ok(emits([]), "no co-findings -> emits (control)");

console.log(`\n=== JUDGE dedup: ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
