import { applyQuantityAmbiguityFidelity, detectQuantityAmbiguities } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-decide";

// R11 — DEDUP DANGEROUS DIRECTION (highest severity). A genuine source-posed ambiguity must NOT be
// falsely suppressed by a prior UNRELATED finding that merely embeds the digits. Suppression is legit
// ONLY when a prior finding names THIS pair AS unresolved (both nums + ambiguity marker).
const GENUINE = "Is the total requirement 520 hours or 1,040 hours?";

function emitsFor(findings: TypedFinding[], src = GENUINE) {
  const out = applyQuantityAmbiguityFidelity(findings, src, { enabled: true });
  return out.filter((f: any) => f.quantityAmbiguityFlagged).length;
}

const cases: Array<{ tag: string; findings: TypedFinding[]; expectEmit: boolean }> = [
  { tag: "no prior finding — MUST emit", findings: [], expectEmit: true },
  { tag: "unrelated finding, no digits — MUST emit",
    findings: [{ requirement: "Submit past performance.", citation: "M.2", kind: "other" } as any], expectEmit: true },
  { tag: "prior finding embeds BOTH digits but NO ambiguity marker — MUST emit (not a dup)",
    findings: [{ requirement: "Base is 520 hours; option adds 1,040 hours.", citation: "PWS", kind: "other" } as any], expectEmit: true },
  { tag: "prior finding has ambiguity marker but WRONG digits — MUST emit",
    findings: [{ requirement: "There is an unresolved discrepancy of 300 hours vs 600 hours.", citation: "x", kind: "other" } as any], expectEmit: true },
  { tag: "digits appear only EMBEDDED in clause/CAGE (5W520 / 52.219-1040) — MUST emit",
    findings: [{ requirement: "Clause 52.219-1040 and CAGE 5W520 apply; ambiguous scope.", citation: "x", kind: "other" } as any], expectEmit: true },
  { tag: "GENUINE prior dup (both nums + marker) — legit suppress",
    findings: [{ requirement: "Unresolved quantity ambiguity: 520 hours or 1,040 hours, which is correct?", citation: "x", kind: "other" } as any], expectEmit: false },
  { tag: "prior dup with 1,040 formatted + 'conflict' marker — legit suppress",
    findings: [{ requirement: "Conflict: the base is stated as 520 hours or 1,040 hours.", citation: "x", kind: "other" } as any], expectEmit: false },
];
console.log("=== DEDUP DANGEROUS DIRECTION (false-suppression toward committal) ===");
let bad = 0;
for (const c of cases) {
  const emit = emitsFor(c.findings) > 0;
  const ok = emit === c.expectEmit;
  if (!ok && !emit) bad++; // false suppression = the dangerous failure
  console.log(`${emit ? "EMIT " : "SUPPR"} ${ok ? "OK   " : (emit ? "over " : "★SUPPRESS-DANGER")}  [${c.tag}]`);
}
console.log(`dangerous false-suppressions: ${bad}`);

// ReDoS — the R10 second-subject regexes (QA_DETERMINER_G_RE global, QA_SUBJ_PRONOUN_RE) on adversarial input
console.log("\n=== ReDoS (adversarial long inputs through detectQuantityAmbiguities) ===");
for (const [tag, s] of [
  ["long determiner chain", "Is " + "the ".repeat(4000) + "assumption staff bill 520 hours or 1,040 hours?"],
  ["long pronoun chain", "Is the assumption " + "you ".repeat(4000) + "bill 520 hours or 1,040 hours?"],
  ["long pre-pair whitespace/word run", "Is the assumption " + "x ".repeat(8000) + "520 hours or 1,040 hours?"],
  ["nested or-units", ("520 hours or ").repeat(3000) + "1,040 hours?"],
] as const) {
  const t0 = Date.now();
  detectQuantityAmbiguities(s);
  console.log(`  ${tag}: ${Date.now() - t0}ms  (len ${s.length})`);
}
