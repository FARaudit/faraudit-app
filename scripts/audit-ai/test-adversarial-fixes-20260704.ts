/**
 * Load-bearing NEGATIVES for the 2026-07-04 adversarial-review fixes (A + C).
 * A — clearance vocabulary: a clearance bar bundled with a set-aside must SUBORDINATE the set-aside (detector
 *     does NOT fire) and must NOT self-clear under a holder profile → no false clean BID.
 * C — NMR canonicalizer: a WAIVED/MITIGATED non-compliance → UNKNOWN (NHR), never a false INELIGIBLE; a genuine
 *     non-compliance still → fails; positives still fire. $0, no model calls.
 */
import { isPositiveSetAside, firmStatus, canonicalizeNmrAttr } from "@/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "@/lib/audit-findings";

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.log(`  ❌ ${msg}`); } };
const F = (requirement: string, excerpt = "", requiredAttribute?: string): TypedFinding =>
  ({ requirement, excerpt, requiredAttribute, citation: "§K", kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "keyfact_detector", curableInWindow: false });
const holder = (attr: string): BidderProfile => ({ satisfiedAttributes: [attr], openWorld: true } as unknown as BidderProfile);

console.log("=== A: clearance vocabulary subordinates a bundled set-aside (no false clean BID) ===");
// detector must NOT fire — the clearance bar is a genuine structural show-stopper carrying a set-aside token
ok(isPositiveSetAside(F("This 8(a) set-aside requires all personnel to hold an active Top Secret/SCI clearance.")) === false, "8(a) + Top Secret/SCI clearance → detector does NOT fire (subordinated)");
ok(isPositiveSetAside(F("100% WOSB set-aside; offeror personnel must hold a DoD Secret clearance.")) === false, "WOSB + DoD Secret clearance → detector does NOT fire");
ok(isPositiveSetAside(F("SDVOSB set-aside; contractor personnel require a favorable polygraph.")) === false, "SDVOSB + polygraph → detector does NOT fire");
ok(isPositiveSetAside(F("100% WOSB set-aside; personnel security clearance at the Secret level required.")) === false, "WOSB + Secret-level personnel clearance → detector does NOT fire");
// CONTROLS — a genuine set-aside WITHOUT a clearance bar still fires (no over-suppression)
ok(isPositiveSetAside(F("This acquisition is 100% set-aside for WOSB concerns for widget manufacturing.")) === true, "CONTROL: plain WOSB set-aside (no clearance) → detector STILL fires");
ok(isPositiveSetAside(F("100% competitive 8(a) set-aside for administrative support services.")) === true, "CONTROL: plain 8(a) competitive set-aside → detector STILL fires");
// firmStatus OPEN-WORLD self-clear (canonical, non-exact match — the reviewer's scenario) must be BLOCKED by the
// clearance bar: a self-asserted socioeconomic cert may clear a PURE set-aside, never a clearance-bundled bar.
ok(firmStatus(F("100% WOSB set-aside; personnel must hold a Top Secret clearance.", "", "se:wosb"), holder("wosb")) !== "satisfies", "open-world holder(wosb) does NOT self-clear past a Top Secret clearance bar (no false BID)");
ok(firmStatus(F("This acquisition is 100% set-aside for WOSB concerns.", "", "se:wosb"), holder("wosb")) === "satisfies", "CONTROL: open-world holder(wosb) DOES self-clear a plain WOSB set-aside");

console.log("\n=== C: NMR canonicalizer — waived/mitigated noncompliance → UNKNOWN (NHR), never false INELIGIBLE ===");
ok(canonicalizeNmrAttr("nmr noncompliance waiver granted") === null, "'nmr noncompliance waiver granted' → null (unknown → NHR, not fails)");
ok(canonicalizeNmrAttr("nonmanufacturer rule noncompliance mitigated") === null, "'nonmanufacturer rule noncompliance mitigated' → null (unknown)");
ok(canonicalizeNmrAttr("nmr noncompliance risk resolved") === null, "'nmr noncompliance risk resolved' → null (unknown)");
// genuine non-compliance still fails
ok(canonicalizeNmrAttr("nmr noncompliant") === "nmr:noncompliant", "CONTROL: 'nmr noncompliant' → noncompliant (still fails)");
ok(canonicalizeNmrAttr("nonmanufacturer rule: not currently compliant") === "nmr:noncompliant", "CONTROL: 'nmr not currently compliant' → noncompliant (still fails)");
ok(canonicalizeNmrAttr("nmr compliant") === "nmr:compliant", "CONTROL: 'nmr compliant' → compliant");
ok(canonicalizeNmrAttr("affiliation rule noncompliant") === null, "CONTROL: non-NMR 'affiliation rule noncompliant' → null (not an NMR status)");

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail) process.exit(1);
console.log("✅ ALL GREEN — A (clearance subordination) + C (waived-noncompliance → NHR) proven at $0.");
