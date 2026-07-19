// PHASE 3 UNIT 1 — PERF-OBLIGATION INSURANCE DO-THE-WORK GATE ($0 suite, flag AUDIT_PERF_OBLIGATION_INSURANCE).
// Driver: seq-2 dccce793 typed "must maintain professional liability insurance $1M/occ $3M aggregate throughout
// performance" (#49) as a NON-CURABLE eligibility_bar / bidder_cannot_move — a fabricated show-stopper — while the
// SAME requirement is correctly typed as a do-the-work submission (#74). Insurance is self-acquirable inside the
// window (buy the policy), exactly like a bond → bidder_controls + curable, never a held-profile bar.
// POSITIVE-shape allowlist + split keep-the-bar veto (narrow hard-bar on full hay, comprehensive on trigger only).
// Run: npx tsx src/lib/perf-obligation-insurance.test.ts
import { applyPerfObligationInsuranceTyping } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_PERF_OBLIGATION_INSURANCE;
  if (on) process.env.AUDIT_PERF_OBLIGATION_INSURANCE = "true"; else delete process.env.AUDIT_PERF_OBLIGATION_INSURANCE;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_PERF_OBLIGATION_INSURANCE; else process.env.AUDIT_PERF_OBLIGATION_INSURANCE = prev; }
};
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "x", excerpt: "x", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "test", ...o,
});
// The gate fired on f iff it flipped to bidder_controls + curable + the marker.
const fired = (f: TypedFinding) => f.controllability === "bidder_controls" && f.curableInWindow === true && f.perfObligationGuard === true;
const run = (f: TypedFinding) => withFlag(true, () => applyPerfObligationInsuranceTyping([f], { enabled: process.env.AUDIT_PERF_OBLIGATION_INSURANCE === "true" }))[0];

// ── POSITIVE — a bidder_cannot_move insurance do-the-work obligation is re-typed ──────────────────────────
assert(fired(run(base({ citation: "PWS §7.2.2", requirement: "must maintain professional liability insurance at minimum $1M per occurrence / $3M aggregate throughout performance" }))),
  "POS-1 the real #49 shape: maintain professional liability insurance $/occ/aggregate → do-the-work");
assert(fired(run(base({ requirement: "Provide a certificate of insurance prior to commencing work" }))),
  "POS-2 certificate/proof-of-insurance token → do-the-work");
assert(fired(run(base({ requirement: "Contractor shall carry commercial general liability insurance" }))),
  "POS-3 carry commercial general liability insurance (named line) → do-the-work");
assert(fired(run(base({ requirement: "Offeror must obtain workers' compensation insurance for all on-site personnel" }))),
  "POS-4 obtain workers' compensation insurance → do-the-work");
assert(fired(run(base({ requirement: "Errors and omissions (E&O) coverage of $2,000,000 aggregate required" }))),
  "POS-5 errors and omissions / E&O named line → do-the-work");
assert(fired(run(base({ requirement: "Insurance coverage with limits of not less than $5,000,000 per occurrence" }))),
  "POS-6 insurance noun + magnitude (per-occurrence / limits) anchor → do-the-work");
assert(fired(run(base({ requirement: "Furnish proof of insurance with policy limits acceptable to the CO" }))),
  "POS-7 furnish proof of insurance + policy limits → do-the-work");

// ── KEEP-THE-BAR — R1 BANKED VOCAB SWEEP (the blocklist→positive-shape lesson; every genuine held-profile/set-aside
//    bar co-stated with insurance MUST keep the bar — these are the P0 false-clears R1 proved against the blocklist). ─
assert(!fired(run(base({ requirement: "Personnel must hold an active unrestricted state professional license and carry professional liability insurance" }))),
  "R1-A1 held state professional license + insurance → keep (classifyGateShape profile_bar)");
assert(!fired(run(base({ requirement: "This is an 8(a) set-aside; offeror must maintain professional liability insurance $1M/occ" }))),
  "R1-A2 8(a) set-aside + insurance → keep (set_aside_caution)");
assert(!fired(run(base({ requirement: "HUBZone set-aside; contractor shall carry general liability insurance" }))),
  "R1-A3 HUBZone set-aside + insurance → keep");
assert(!fired(run(base({ requirement: "Service-disabled veteran-owned small business set-aside; provide certificate of insurance" }))),
  "R1-A4 SDVOSB set-aside + insurance → keep");
assert(!fired(run(base({ requirement: "Offeror must hold a registered Professional Engineer (PE) license and maintain E&O insurance" }))),
  "R1-A5 held PE license + E&O → keep (profile_bar)");
assert(!fired(run(base({ requirement: "Physician must be board-certified and carry malpractice insurance" }))),
  "R1-A6 board-certified + malpractice insurance → keep (HELD_CREDENTIAL_SHAPE — classifyGateShape under-catches)");
assert(!fired(run(base({ requirement: "Contractor must hold active ITAR registration and provide proof of insurance" }))),
  "R1-A7 held ITAR registration + insurance → keep (generic 'hold…registration' credential shape, not named-bar vocab)");
assert(!fired(run(base({ requirement: "Firm must hold ISO 9001 certification at award and carry general liability insurance" }))),
  "R1-A8 held ISO 9001 certification-at-award + insurance → keep");
assert(!fired(run(base({ requirement: "Offeror must demonstrate bonding capacity of $10M and maintain insurance" }))),
  "R1-A9 held bonding capacity + insurance → keep (HELD_CREDENTIAL_SHAPE bonding-capacity — under-caught)");
assert(!fired(run(base({ requirement: "Must be a certified DBE and provide certificate of insurance" }))),
  "R1-A10 certified DBE + insurance → keep");
assert(!fired(run(base({ requirement: "Must hold a state contractor's license and carry liability insurance" }))),
  "R1-A11 held contractor's license + insurance → keep");
assert(!fired(run(base({ requirement: "Staff must hold Secret-level access and carry general liability insurance $1M" }))),
  "R1-B2a held Secret-level access + insurance → keep (clearance shape, no literal 'clearance' token)");
assert(!fired(run(base({ requirement: "Personnel require interim Secret and professional liability insurance" }))),
  "R1-B2b interim Secret clearance-level + insurance → keep (HELD_CREDENTIAL_SHAPE — under-caught)");
assert(!fired(run(base({ requirement: "Staff must pass a CI poly and maintain insurance" }))),
  "R1-B2c CI poly + insurance → keep (polygraph shape)");
assert(!fired(run(base({ requirement: "ISO 9001:2015 registration required; provide proof of insurance" }))),
  "R1-B2d ISO registration + insurance → keep");
assert(!fired(run(base({ requirement: "Contractor must hold CMMC Level 2 certification and carry insurance" }))),
  "R1-CMMC held CMMC certification + insurance → keep (generic 'hold…certification' shape)");
assert(!fired(run(base({ requirement: "must maintain professional liability insurance $1M/occ", requiredAttribute: "8(a) certification" }))),
  "R1-reqAttr a finding carrying its own requiredAttribute (a typed eligibility gate) is never demoted whatever the prose");

// ── KEEP-THE-BAR — R2 BANKED CONFERRAL SWEEP (the strip-then-residual lesson: a third-party-CONFERRED held status
//    co-stated with insurance, OUTSIDE any credential-noun enumeration, must escalate BY DEFAULT — these were the P0
//    false-clears R2 proved against the shape-enumeration; the residual second-obligation/conferral catch holds them). ─
assert(!fired(run(base({ requirement: "Contractor shall be an OEM-authorized service provider and carry commercial general liability insurance" }))),
  "R2-OEM OEM-authorized service provider + insurance → keep (CONFERRED_STATUS_SHAPE + residual modal)");
assert(!fired(run(base({ requirement: "Firm shall be approved by a nationally recognized accreditation body and provide general liability insurance" }))),
  "R2-approved 'approved by an accreditation body' + insurance → keep (conferral verb, no credential-noun)");
assert(!fired(run(base({ requirement: "Vendor must have current FedRAMP authorization and provide errors and omissions insurance" }))),
  "R2-FedRAMP FedRAMP authorization + E&O → keep (classifyGateShape ran on the insurance-STRIPPED residual — no verb contamination)");
assert(!fired(run(base({ requirement: "Offeror must be listed on the approved vendor roster and carry product liability insurance" }))),
  "R2-roster listed on an approved vendor roster + insurance → keep");
assert(!fired(run(base({ requirement: "Firm must be in good standing with the state licensing board and carry general liability insurance" }))),
  "R2-standing in good standing + insurance → keep");
assert(!fired(run(base({ requirement: "Contractor shall submit proof of manufacturer authorization and carry insurance" }))),
  "R2-mfr 'proof of manufacturer authorization' + insurance → keep (strip does not swallow the co-stated authorization)");
assert(!fired(run(base({ requirement: "Firm must be a member of the approved provider network and carry insurance" }))),
  "R2-member membership in an approved network + insurance → keep");
assert(!fired(run(base({ requirement: "Contractor shall provide monthly status reports and maintain professional liability insurance $1M" }))),
  "R2-2ndmodal a co-stated NON-insurance obligation (monthly reports) + insurance → keep (residual second-obligation catch; fail-toward-keep even though reports are benign)");

// ── KEEP-THE-BAR — R3 BANKED BARE-NOUN SWEEP (the terminal "affirmatively insurance-only" inversion: a genuine bar
//    phrased as a BARE DECLARATIVE NOUN PHRASE — no modal, no possession/conferral verb — must escalate BY DEFAULT.
//    The anchored INSURANCE_ONLY_OBLIGATION_RE fires ONLY when the WHOLE requirement is a pure insurance obligation
//    sentence; a co-stated bar clause leaves content outside the template → no match → keep). ─
assert(!fired(run(base({ requirement: "TWIC card required for all personnel accessing the port facility; the contractor shall maintain general liability insurance $1,000,000 per occurrence" }))),
  "R3-TWIC bare-noun 'TWIC card required' + a separate insurance clause → keep (anchor fails; not insurance-only)");
assert(!fired(run(base({ requirement: "SCIF access is a prerequisite. The contractor shall carry general liability insurance" }))),
  "R3-SCIF 'SCIF access is a prerequisite' + insurance sentence → keep (two sentences; anchor spans only the insurance one)");
assert(!fired(run(base({ requirement: "This is an AbilityOne mandatory source item and the vendor shall provide certificate of insurance" }))),
  "R3-AbilityOne 'AbilityOne mandatory source item' + insurance → keep (tempered lead cannot swallow the bar clause across 'and')");
assert(!fired(run(base({ requirement: "CMMC Level 2 certification. Contractor shall carry commercial general liability insurance" }))),
  "R3-CMMCbare bare 'CMMC Level 2 certification' + insurance → keep");
assert(!fired(run(base({ requirement: "FAA Part 145 repair station certification and general liability insurance" }))),
  "R3-FAA145 bare aviation held-cert + insurance → keep (credential-noun forbidden in the lead; 'and' cannot bridge to a second insurance)");
assert(!fired(run(base({ requirement: "Gefahrgutbeauftragter dangerous-goods credential; carry general liability insurance" }))),
  "R3-foreign a novel/foreign held credential as a bare noun + insurance → keep (escalates by default; no vocab dependence)");
assert(!fired(run(base({ requirement: "Contractor shall procure and maintain a valid facility clearance and general liability insurance" }))),
  "R3-clearcombo 'procure and maintain a valid facility clearance and insurance' → keep (hard-bar 'facility clearance' + anchor fails)");

// ── FIRE — the standard federal "procure/purchase and maintain <insurance>" clause opening (pure insurance) ─────────
assert(fired(run(base({ requirement: "The Contractor shall procure and maintain commercial general liability insurance in force during the contract term" }))),
  "FIRE-procure the standard 'shall procure and maintain … insurance in force during the contract term' → do-the-work");
assert(fired(run(base({ requirement: "Contractor shall purchase and maintain workers' compensation insurance for all employees" }))),
  "FIRE-purchase 'shall purchase and maintain … insurance' → do-the-work");
assert(fired(run(base({ requirement: "General liability insurance of $1,000,000 per occurrence is required" }))),
  "FIRE-passive a passive pure-insurance requirement ('… insurance … is required') → do-the-work");

// ── KEEP-THE-BAR — R4 BANKED CITATION-SLOT SWEEP (the anchor inspects f.requirement only; a bare-noun bar smuggled
//    into the STRUCTURED f.citation field escaped both the residual vetoes and the anchor → false clear. Every citation
//    token must be a benign reference/insurance/UCF word; a credential/program noun keeps the bar). ─
assert(fired(run(base({ citation: "PWS §7.2.2", requirement: "The contractor shall maintain general liability insurance of $1,000,000 per occurrence" }))),
  "R4-cite-ok a CLEAN reference citation ('PWS §7.2.2') + pure insurance requirement → still fires (benign tokens)");
assert(fired(run(base({ citation: "Section L, Insurance/Bonding", requirement: "The contractor shall maintain general liability insurance of $1,000,000 per occurrence" }))),
  "R4-cite-ok2 real dccce793 citation format 'Section L, Insurance/Bonding' → still fires");
assert(!fired(run(base({ citation: "Section L, TWIC/Insurance", requirement: "The contractor shall maintain general liability insurance of $1,000,000 per occurrence" }))),
  "R4-1a bare-noun bar 'TWIC' in the citation slot + pure insurance requirement → keep (citation token not benign)");
assert(!fired(run(base({ citation: "PWS §5, AbilityOne Mandatory Source", requirement: "The contractor shall maintain commercial general liability insurance" }))),
  "R4-1b 'AbilityOne Mandatory Source' in the citation → keep");
assert(!fired(run(base({ citation: "FAA Part 145 repair station certification", requirement: "The contractor shall maintain general liability insurance" }))),
  "R4-1c 'FAA Part 145 repair station certification' in the citation → keep");
assert(!fired(run(base({ citation: "This is an AbilityOne mandatory source item", requirement: "The contractor shall carry general liability insurance" }))),
  "R4-1d a full bare-noun bar SENTENCE in the citation → keep");
assert(!fired(run(base({ citation: "SCIF access is a prerequisite", requirement: "The contractor shall maintain general liability insurance" }))),
  "R4-1e 'SCIF access is a prerequisite' in the citation → keep");
assert(!fired(run(base({ requirement: "The contractor shall maintain commercial general liability insurance and bonds" }))),
  "R4-2 'and bonds' is no longer a coverage-tail token → the co-stated bond obligation keeps the bar (bonds handled by the bonding guard)");

// ── NEGATIVE (not the shape) — a bare 'insurance' mention with no do-the-work anchor must NOT fire ─────────
assert(!fired(run(base({ citation: "NAICS 524126", requirement: "Direct Property and Casualty Insurance Carriers" }))),
  "NEG-5 insurance-INDUSTRY NAICS title (bare noun, no obtain-verb/magnitude/proof) → no fire");
assert(!fired(run(base({ requirement: "Deposits are protected by the Federal Deposit Insurance Corporation" }))),
  "NEG-6 'Federal Deposit Insurance Corporation' bare institutional mention → no fire");
assert(!fired(run(base({ requirement: "The incumbent is Acme Insurance Company, a large business" }))),
  "NEG-7 a firm NAMED '…Insurance Company' (bare noun) → no fire");

// ── DIRECTION — only a bidder_cannot_move mis-type is a candidate; a verified defect is untouched ──────────
assert(run(base({ controllability: "bidder_controls", curableInWindow: true, requirement: "maintain professional liability insurance $1M" })).perfObligationGuard !== true,
  "DIR-1 an already do-the-work insurance finding (bidder_controls) is not re-marked (never softens a correct finding)");
assert(run(base({ controllability: "no_one_can_move", requirement: "maintain professional liability insurance $1M" })).controllability === "no_one_can_move",
  "DIR-2 a no_one_can_move insurance finding is left as-is (gate only touches bidder_cannot_move)");
assert(run(base({ universalDefect: "unmeetable_by_any_offeror", requirement: "maintain professional liability insurance $1M" })).controllability === "bidder_cannot_move",
  "DIR-3 a VERIFIED universal defect is never downgraded (universalDefect mark)");
assert(run(base({ verifiedBy: { verifierId: "panel", excerptHash: "h", affirmation: "a" }, requirement: "carry general liability insurance $1M" })).controllability === "bidder_cannot_move",
  "DIR-4 a verifiedBy-backed bar is never downgraded");

// ── ALTITUDE — the trigger is citation+requirement only; a bar whose EXCERPT quotes insurance is not fired ─
assert(!fired(run(base({ requirement: "Offeror must possess an active DoD facility clearance", excerpt: "See insurance limits: $1M per occurrence / $3M aggregate" }))),
  "ALT-1 a clearance bar (requirement) whose grounded excerpt quotes an insurance magnitude is NOT demoted (narrow veto + trigger-only shape)");

// ── NON-DESTRUCTIVE — on fire, only the who-can-win axis moves; severity/kind/requirement/excerpt preserved ─
const src = base({ severity: "high" as unknown as TypedFinding["severity"], kind: "eligibility_bar", citation: "PWS §7.2.2", requirement: "must maintain professional liability insurance $1M/occ $3M aggregate", excerpt: "Maintain licensing requirements/certification/accreditation and required insurance coverage" });
const out = run(src);
assert(fired(out) && out.severity === src.severity && out.kind === src.kind && out.requirement === src.requirement && out.excerpt === src.excerpt,
  "NON-DESTRUCTIVE on fire: severity/kind/requirement/excerpt preserved (mirrors the real #49 boilerplate-bundled excerpt)");

// ── FLAG-OFF — byte-identical no-op (same array reference) ────────────────────────────────────────────────
const arr = [base({ requirement: "maintain professional liability insurance $1M/occ" })];
assert(withFlag(false, () => applyPerfObligationInsuranceTyping(arr, { enabled: process.env.AUDIT_PERF_OBLIGATION_INSURANCE === "true" })) === arr,
  "FLAG-OFF: gate returns the same array reference — byte-identical (Rule 61)");

// ── BOUNDARY vs mm-evidence-factor — Unit 1 is a who-can-win controllability re-type, a DIFFERENT rail from the
//    §M evidence-factor demotion (mm-evidence treats a held insurance/license credential as a demotion VETO). Unit 1
//    only ever touches a bidder_cannot_move eligibility bar; a §M evaluation-FACTOR finding (typed bidder_controls,
//    kind procedural/other) is never a candidate here → no cross-gate interference.
assert(run(base({ controllability: "bidder_controls", kind: "procedural_obligation", requirement: "§M: past-performance evidence may reference insurance/bonding capacity" })).perfObligationGuard !== true,
  "BOUNDARY a §M evaluation-factor finding referencing insurance (bidder_controls) is not touched — Unit 1 ≠ mm-evidence rail");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILED`} — Phase 3 Unit 1 perf-obligation insurance do-the-work gate`);
process.exit(failures === 0 ? 0 : 1);
