// REPAIR UNIT item C (card #703/#707, flag AUDIT_SCOPE_OPACITY_RECONCILE, default-OFF).
// Run: npx tsx src/lib/audit-decide-scope-opacity-reconcile.test.ts
//
// SUB-PART 1 (finding #46 defect, FA813726R0033): a P0 "scope opacity / no SOW-spec-drawings visible" gate finding
// is DEMOTED to a P2 attribute/caveat WHEN the finding set proves a SOW/spec/drawings attachment WAS read (the ATT10
// contradiction); UNTOUCHED when scope is genuinely absent (no scope doc read) or the flag is OFF.
// SUB-PART 2 (coverage pin): missing (present-but-ungrounded) is a DIFFERENT computation from coreMissing (absent).
// §L with an ungrounded obligation lands in `missing`, NOT `coreMissing`, and coexists with ≥40 §L-citing findings —
// locked so no future change can "fix" it into a section-absence mislabel.
export {};
import { reconcileScopeOpacity, SCOPE_OPACITY_OVERCLAIM_RE, SCOPE_DOC_ATTACHMENT_RE, scopeDocReadInSet } from "./audit-scope-reconciliation";
type TypedFinding = import("./audit-findings").TypedFinding;

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// FA813726R0033 regression pins — the two real findings.
const finding46 = (): TypedFinding => ({
  kind: "other", excerpt: "WWYK260007 RENOVATE PRATT AND WHITNEY AREA B3001.", citation: "Section C, Requirements",
  severity: "P0", controllability: "bidder_controls", grounded: true,
  requirement: "Scope opacity — Section C contains only a one-line description ('WWYK260007 RENOVATE PRATT AND WHITNEY AREA B3001') with no SOW, drawings, or specifications visible in the solicitation sections provided; bidder cannot price or schedule without the full OPR package, creating high risk of incomplete or unrealistic proposal",
} as TypedFinding);
const finding83 = (): TypedFinding => ({
  kind: "submission", excerpt: "01 ATT10_260007_SOW Statement of Work 08 May 2026", citation: "Section J, Attachment 01",
  severity: "P2", controllability: "bidder_controls", grounded: true, curableInWindow: true,
  requirement: "Statement of Work compliance — bidder must price all scope defined in ATT10_260007_SOW",
} as TypedFinding);
const sevOf = (fs: TypedFinding[], reqMatch: RegExp) => fs.find((f) => reqMatch.test(f.requirement ?? ""))?.severity;

console.log("\n── REGEX DISCRIMINATION ──");
assert(SCOPE_OPACITY_OVERCLAIM_RE.test(finding46().requirement!), "overclaim RE matches finding #46 ('scope opacity / no SOW … visible')");
assert(!SCOPE_OPACITY_OVERCLAIM_RE.test(finding83().requirement!), "overclaim RE does NOT match finding #83 ('must price all scope defined in ATT10_SOW' — a requirement, not an absence claim)");
assert(SCOPE_DOC_ATTACHMENT_RE.test(finding83().excerpt!), "attachment RE matches finding #83 excerpt (ATT10_260007_SOW Statement of Work)");
assert(!SCOPE_DOC_ATTACHMENT_RE.test(finding46().excerpt!) && !SCOPE_DOC_ATTACHMENT_RE.test(finding46().citation!), "attachment RE does NOT match #46 excerpt/citation (cannot self-satisfy the scope-doc-read gate)");
// negative-control: an OPTIONAL/normal finding must not match the overclaim
assert(!SCOPE_OPACITY_OVERCLAIM_RE.test("Offerors are encouraged to review the drawings package available on SAM.gov."), "overclaim RE does NOT match a normal 'review the drawings' finding");

console.log("\n── 1 · FLAG-OFF — #46 stays P0 (byte-identical) ──");
const off = reconcileScopeOpacity([finding46(), finding83()], "…", false);
assert(sevOf(off, /Scope opacity/) === "P0", "flag-OFF ⇒ #46 stays P0");
assert(JSON.stringify(off) === JSON.stringify([finding46(), finding83()]), "flag-OFF ⇒ findings byte-identical (no marker written)");

console.log("\n── 2 · FLAG-ON + SOW read (ATT10 present) — #46 DEMOTES P0→P2 ──");
const on = reconcileScopeOpacity([finding46(), finding83()], "…", true);
assert(sevOf(on, /Scope opacity/) === "P2", "flag-ON + scope doc read ⇒ #46 demoted to P2 (out of the gate band)");
assert(on.find((f) => /Scope opacity/.test(f.requirement ?? ""))?.scopeReconciledDemoted === true, "flag-ON ⇒ demoted #46 carries the scopeReconciledDemoted marker");
assert(sevOf(on, /must price all scope/) === "P2", "flag-ON ⇒ the SOW-compliance finding #83 is UNTOUCHED (no absence claim)");

console.log("\n── 3 · FLAG-ON + scope GENUINELY absent (no scope doc read) — #46 STILL PROMOTES ──");
const genuinelyAbsent = reconcileScopeOpacity([finding46()], "no attachments in this package", true);
assert(sevOf(genuinelyAbsent, /Scope opacity/) === "P0", "flag-ON but NO SOW/spec/drawings read ⇒ #46 stays P0 (a real scope gap must promote)");
assert(!scopeDocReadInSet([finding46()], "no attachments in this package"), "scopeDocReadInSet=false when no scope attachment present");
assert(scopeDocReadInSet([finding46(), finding83()], null), "scopeDocReadInSet=true when the ATT10_SOW finding is present");

console.log("\n── 4 · COVERAGE PIN (sub-part 2) — missing ≠ coreMissing; §L present-but-ungrounded ──");
// Semantic invariant, pinned against the FA813726 shape. `missing` = required-not-covered (present-but-ungrounded);
// `coreMissing` = section ABSENT. They are computed by DIFFERENT functions (completenessOf vs coreMissingFor) and a
// present section with an ungrounded obligation belongs in `missing`, NEVER coreMissing.
const required = ["B", "C", "D", "E", "F", "H", "I", "K", "L", "M"];
const covered = ["B", "C", "D", "E", "F", "H", "I", "K", "M"]; // §L omitted: one ungrounded obligation (reps & certs)
const missing = required.filter((s) => !covered.includes(s));   // the completenessOf.missing rule, verbatim
const coreMissing: string[] = [];                                // §L is PRESENT ⇒ not coreMissing
const lCitingFindings = 40;                                      // the audit had 40 §L-citing findings
assert(JSON.stringify(missing) === JSON.stringify(["L"]), "missing === ['L'] (present-but-ungrounded, matches the live record)");
assert(coreMissing.length === 0 && !coreMissing.includes("L"), "coreMissing === [] — §L is NOT flagged absent (missing ≠ coreMissing)");
assert(missing.every((s) => !coreMissing.includes(s)), "INVARIANT: missing ∩ coreMissing = ∅ (a present-ungrounded section can never be mislabeled section-absent)");
assert(lCitingFindings >= 40 && missing.includes("L"), "§L in `missing` COEXISTS with ≥40 §L-citing findings — 'missing' means one ungrounded obligation, not 'section uncovered'");

console.log(`\n${failures === 0 ? "🟢 DRY — item C (scope-opacity reconcile + coverage pin) PASSES" : `❌ ${failures} FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
