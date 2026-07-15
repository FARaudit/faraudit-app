// $0 REGRESSION for the DETERMINISTIC ABSENCE-GROUNDING GATE (card #523, 2c). Brain condition: declaration ≠
// presence — an absence claim about a checkable element is DROPPED unless the deterministic scan confirms the
// element is genuinely missing. Run: npx tsx src/lib/absence-grounding-gate.test.ts
import { scanPackageMarkers, resolveAbsenceClaim, absenceClaimContradicted } from "./absence-grounding-gate";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// A package that GENUINELY CONTAINS Section B, Section C, clause 52.212-1, and a wage determination — but NOT
// Section M, and NOT clause 252.204-7012.
const SRC = [
  "SECTION B - SUPPLIES AND PRICES",
  "Offerors shall submit pricing for all CLINs.",
  "SECTION C - STATEMENT OF WORK",
  "The contractor shall perform the work. 52.212-1 Instructions to Offerors is incorporated.",
  "A wage determination WD 15-1234 applies to this effort.",
].join("\n");
const M = scanPackageMarkers(SRC);

// ── marker scan ──────────────────────────────────────────────────────────────
assert(M.sections.has("B") && M.sections.has("C"), "scan: Section B and C present");
assert(!M.sections.has("M"), "scan: Section M genuinely absent");
assert(M.clauses.has("52.212-1"), "scan: clause 52.212-1 present");
assert(!M.clauses.has("252.204-7012"), "scan: clause 252.204-7012 absent");
assert(M.artifacts.has("wage_determination"), "scan: wage determination present");

// ── THE seq-1 PROOF — a false "no Section B" is suppressed ────────────────────
assert(resolveAbsenceClaim("The package contains no Section B, so coverage is incomplete.", M) === "drop_present",
  "seq-1: 'no Section B' (B present) → drop_present (SUPPRESSED)");
assert(absenceClaimContradicted("There is no Section B in this solicitation.", M) === true,
  "seq-1: absenceClaimContradicted true for present element");

// ── genuine-absence counter-probe SURVIVES (present element vs genuinely-missing) ──
assert(resolveAbsenceClaim("Section M is not included — no stated evaluation factors.", M) === "keep_absent",
  "counter-probe: 'Section M not included' (M genuinely absent) → keep_absent (SURVIVES)");
assert(absenceClaimContradicted("Section M is missing from the package.", M) === false,
  "counter-probe: genuinely-missing absence claim is NOT suppressed");

// ── clause + subject-negated shapes ──────────────────────────────────────────
assert(resolveAbsenceClaim("Clause 52.212-1 is not included in the contract clauses.", M) === "drop_present",
  "clause present + subject-negated → drop_present");
assert(resolveAbsenceClaim("Clause 252.204-7012 is missing (no CUI safeguarding).", M) === "keep_absent",
  "clause genuinely absent → keep_absent");

// ── named artifact ───────────────────────────────────────────────────────────
assert(resolveAbsenceClaim("No wage determination is attached to this package.", M) === "drop_present",
  "artifact present ('no wage determination') → drop_present");
assert(resolveAbsenceClaim("This solicitation includes no DD Form 254.", M) === "keep_absent",
  "artifact genuinely absent (DD254) → keep_absent");

// ── ABSTAIN: not an absence-of-checkable-element claim (fail toward KEEP) ─────
assert(resolveAbsenceClaim("Section C requires no additional bonding.", M) === "not_applicable",
  "'Section C requires no additional bonding' is NOT an absence-of-C claim → abstain");
assert(resolveAbsenceClaim("The evaluation methodology is unclear and poorly defined.", M) === "not_applicable",
  "qualitative non-checkable claim → abstain (gate does not touch it)");
assert(absenceClaimContradicted("Section B includes pricing instructions for all CLINs.", M) === false,
  "a POSITIVE mention of a present section is never suppressed");
assert(resolveAbsenceClaim("", M) === "not_applicable", "empty text → abstain");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
