// $0 gate for Layer-2 (Brain card 43, build #1). Proves the verdict is now DERIVED deterministically
// from typed grounded findings — including Brain card-42 §4's new criterion: identical input → identical
// verdict across N runs (the old single-shot architecture could NEVER satisfy this).
//   npx tsx scripts/audit-ai/test-derive-verdict.ts
import { deriveVerdict, enforceVerdictWordInvariant, applySetAsideFirmStatusGate, applyAwardBasisOvertypeGuard, applyStructuralBarWhitelist, applyCautionFloor, applyClauseSemanticsGuard } from "@/lib/audit-decide";
import type { Decision, DecidedFinding } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "@/lib/audit-findings";

const f = (o: Partial<TypedFinding> & { kind: TypedFinding["kind"]; controllability: TypedFinding["controllability"] }): TypedFinding => ({
  requirement: o.requirement ?? "requirement", citation: "FAR 52.x", excerpt: "verbatim", grounded: true, lens: "x",
  kind: o.kind, controllability: o.controllability, requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow,
});
const inp = (findings: TypedFinding[], o: { profile?: BidderProfile | null; coverage?: boolean; sound?: boolean; conflict?: boolean; manifest?: boolean } = {}): VerdictInputs =>
  ({ findings, bidderProfile: o.profile ?? null, coverageComplete: o.coverage ?? true, verifierSound: o.sound ?? true, conflict: o.conflict ?? false, manifestComplete: o.manifest ?? true });

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

// ── The #2 case: cab/GVWR is commodity sourcing → bidder_controls; DEI is boilerplate; set-aside the firm
//    qualifies for is already_satisfied. Expect BID (what the stochastic panel could not stabilize). ──
const two = [
  f({ requirement: "enclosed cab + GVWR 3500-4500 lb", kind: "technical_spec", controllability: "bidder_controls" }),
  f({ requirement: "submit pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" }),
  f({ requirement: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" }),
  f({ requirement: "Anti-Discrimination / DEI", kind: "boilerplate", controllability: "bidder_controls" }),
  f({ requirement: "100% small-business set-aside (firm qualifies)", kind: "eligibility_bar", controllability: "already_satisfied" }),
];
eq("#2 → BID", deriveVerdict(inp(two)).verdict, "BID");
eq("#2 DEI dropped", deriveVerdict(inp(two)).dispositions.find((d) => d.kind === "boilerplate")?.disposition, "dropped");
eq("#2 set-aside met", deriveVerdict(inp(two)).dispositions.find((d) => d.requirement.includes("set-aside"))?.disposition, "met");

// ── Ladder ──
eq("incomplete coverage → INCOMPLETE", deriveVerdict(inp(two, { coverage: false })).verdict, "INCOMPLETE");
eq("verifier unsound → NEEDS_HUMAN_REVIEW", deriveVerdict(inp(two, { sound: false })).verdict, "NEEDS_HUMAN_REVIEW");
eq("conflict → NEEDS_HUMAN_REVIEW", deriveVerdict(inp(two, { conflict: true })).verdict, "NEEDS_HUMAN_REVIEW");

// ── Brain card-44 §2: curability splits the old blanket "unknown → CAUTION" branch. ──
// 5a. UNTYPED bar (bidder_cannot_move, no requiredAttribute / no curableInWindow) → FAIL CLOSED to human review.
const untyped = [...two, f({ requirement: "proprietary single-source widget", kind: "technical_spec", controllability: "bidder_cannot_move" })];
eq("untyped disqualifying bar → NEEDS_HUMAN_REVIEW (fail closed)", deriveVerdict(inp(untyped)).verdict, "NEEDS_HUMAN_REVIEW");

// 5b. THE MOAT-THREAT INPUT (Brain §2): non-curable structural bar + null profile → NOT a soft caution.
const nonCurable = [...two, f({ requirement: "active facility clearance required at award (lead time > window)", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "clearance:secret-facility", curableInWindow: false })];
eq("non-curable bar, null profile → NEEDS_HUMAN_REVIEW (not CAUTION — the SPRS error stays disarmed)", deriveVerdict(inp(nonCurable)).verdict, "NEEDS_HUMAN_REVIEW");
eq("non-curable bar names the bar in showStoppers", deriveVerdict(inp(nonCurable)).showStoppers.length, 1);

// 5c. CURABLE bar + null profile → genuine residual → BID_WITH_CAUTION.
const curable = [...two, f({ requirement: "obtain SAM registration before award", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "sam:registered", curableInWindow: true })];
eq("curable bar, null profile → BID_WITH_CAUTION", deriveVerdict(inp(curable)).verdict, "BID_WITH_CAUTION");

// Brain card-45 refinement: the non-curable human-review state must CARRY the conditional-NO_BID payload.
eq("non-curable reason carries CONDITIONAL NO-BID payload", /CONDITIONAL NO-BID/.test(deriveVerdict(inp(nonCurable)).reason), true);

// Brain card-45 typing guard: a UNIVERSAL impossibility (no_one_can_move) is a PROVEN show-stopper even under
// a null profile — must hit NO_BID, NOT soften to human-review (the mistype Brain warned about).
const universal = [...two, f({ requirement: "5-day delivery against a 90-day irreducible lead time", kind: "technical_spec", controllability: "no_one_can_move" })];
eq("universal impossibility, null profile → NO_BID (not human-review)", deriveVerdict(inp(universal)).verdict, "NO_BID");
eq("universal impossibility is a named show-stopper", deriveVerdict(inp(universal)).showStoppers.length, 1);
// a universal ELIGIBILITY impossibility → INELIGIBLE
const universalElig = [f({ requirement: "set-aside category no firm can meet", kind: "eligibility_bar", controllability: "no_one_can_move" })];
eq("universal eligibility impossibility → INELIGIBLE", deriveVerdict(inp(universalElig)).verdict, "INELIGIBLE");

// ── Brain card-49 typing doctrine, locked at the decision layer (correct typing → correct verdict). ──
// plain Total SB set-aside = already_satisfied (the pool) → NOT a gate → BID
eq("Total SB set-aside (already_satisfied) → BID, never a bar", deriveVerdict(inp([f({ requirement: "Total Small Business Set-Aside 52.219-6", kind: "eligibility_bar", controllability: "already_satisfied" })])).verdict, "BID");
// narrower socioeconomic set-aside = bidder_cannot_move + curable (verify status), null profile → CAUTION (never disqualifier)
eq("socioeconomic set-aside (curable, verify status) → BID_WITH_CAUTION", deriveVerdict(inp([f({ requirement: "SDVOSB set-aside", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "setaside:sdvosb", curableInWindow: true })])).verdict, "BID_WITH_CAUTION");
// standard self-cert rep = bidder_controls → gate to clear → BID
eq("self-cert rep (bidder_controls) → BID", deriveVerdict(inp([f({ requirement: "telecom security rep 52.240-91", kind: "clause_flowdown", controllability: "bidder_controls" })])).verdict, "BID");

// ── Brain card-51 pre-#3 guard: CLOSED-world (known-fail) vs OPEN-world (unknown) on the SAME structural bar.
// The Dillon sole-source bar must yield INELIGIBLE only via firmStatus="fails" on a KNOWN-absent attribute
// (non-null empty profile = "this generic SB is known not to be the named OEM"), NOT from a null/unknown
// profile (that's the open-world branch → NEEDS_HUMAN_REVIEW, never eligible:false). Right label, right reason.
const dillon = (profile: BidderProfile | null) => deriveVerdict(inp([f({ requirement: "sole-source to named OEM (Dillon Aero DGMT1002)", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "oem:dillon-approved-source", curableInWindow: false })], { profile }));
eq("closed-world (known-empty profile) → INELIGIBLE via firmStatus=fails", dillon({ satisfiedAttributes: [] }).verdict, "INELIGIBLE");
eq("closed-world INELIGIBLE is eligible:false", dillon({ satisfiedAttributes: [] }).eligible, false);
eq("open-world (null profile) → NEEDS_HUMAN_REVIEW, NOT eligible:false (no Norfolk over-fire)", dillon(null).verdict, "NEEDS_HUMAN_REVIEW");
eq("open-world (null profile) stays eligible:true", dillon(null).eligible, true);
eq("firm PROVABLY holds the OEM attribute → BID (cleared)", dillon({ satisfiedAttributes: ["oem:dillon-approved-source"] }).verdict, "BID");

// eligibility bar the firm provably FAILS (profile lacks the required NAICS) → INELIGIBLE
const eligBar = [f({ requirement: "must be small under NAICS 333120", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "naics:333120-small" })];
eq("eligibility bar firm fails → INELIGIBLE", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] } })).verdict, "INELIGIBLE");
eq("same bar, firm qualifies → BID", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: ["naics:333120-small"] } })).verdict, "BID");
// non-eligibility uncontrollable bar the firm provably fails → NO_BID
const noBid = [f({ requirement: "must hold exclusive OEM license", kind: "clause_flowdown", controllability: "bidder_cannot_move", requiredAttribute: "oem:exclusive" })];
eq("uncontrollable non-elig bar firm fails → NO_BID", deriveVerdict(inp(noBid, { profile: { satisfiedAttributes: [] } })).verdict, "NO_BID");

// ── Brain card-58 ASYMMETRY CAP: an unfetched manifest attachment caps no-bar verdicts, NOT bar-found. ──
eq("BID + manifest incomplete → INCOMPLETE (cap)", deriveVerdict(inp(two, { manifest: false })).verdict, "INCOMPLETE");
eq("CAUTION + manifest incomplete → INCOMPLETE (cap)", deriveVerdict(inp(curable, { manifest: false })).verdict, "INCOMPLETE");
eq("INELIGIBLE + manifest incomplete → STILL INELIGIBLE (asymmetry)", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] }, manifest: false })).verdict, "INELIGIBLE");
eq("NO_BID + manifest incomplete → STILL NO_BID (asymmetry)", deriveVerdict(inp(noBid, { profile: { satisfiedAttributes: [] }, manifest: false })).verdict, "NO_BID");

// ── Doctrine #6 (Step 1, AUDIT_ELIGIBLE_TRISTATE) — honest-fail eligible is tri-state, flag-gated DEFAULT-OFF.
//    OFF: byte-identical to HEAD (false). ON: INCOMPLETE & verifier-unsound NHR → null; INELIGIBLE → false (invariant). ──
const TRI = process.env.AUDIT_ELIGIBLE_TRISTATE === "true";
eq(`INCOMPLETE → eligible ${TRI ? "null" : "false"} (flag ${TRI ? "ON" : "OFF"})`, deriveVerdict(inp(two, { coverage: false })).eligible, TRI ? null : false);
eq(`NHR(verifier-unsound) → eligible ${TRI ? "null" : "false"}`, deriveVerdict(inp(two, { sound: false })).eligible, TRI ? null : false);
eq("INELIGIBLE → eligible false (flag-INVARIANT — true firm-credential bar)", deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] } })).eligible, false);

// ── Doctrine #2 (Step 2, AUDIT_VERDICT_WORD_INVARIANT) — INELIGIBLE requires a real eligibility_bar.
//    Default-OFF (byte-identical). ON: real INELIGIBLE silent · crafted violation throws(dev)/routes-NHR(prod) ·
//    requirement-side impossibility → NO_BID, never INELIGIBLE. ──
const INV = process.env.AUDIT_VERDICT_WORD_INVARIANT === "true";
if (INV) {
  // (i) real INELIGIBLE (firm provably fails an eligibility_bar) → unchanged, invariant silent
  const realInelig = deriveVerdict(inp(eligBar, { profile: { satisfiedAttributes: [] } }));
  eq("inv(i): real INELIGIBLE stays INELIGIBLE", realInelig.verdict, "INELIGIBLE");
  eq("inv(i): real INELIGIBLE eligible:false", realInelig.eligible, false);
  // (ii) crafted state — eligible:false with ZERO eligibility_bar (a requirement-side bar mislabeled)
  const craftedSS = { ...f({ requirement: "req-side impossibility", kind: "clause_flowdown", controllability: "no_one_can_move" }), disposition: "disqualifying" } as DecidedFinding;
  const crafted = { verdict: "INELIGIBLE", eligible: false, reason: "crafted", dispositions: [] as DecidedFinding[], showStoppers: [craftedSS] } as Decision;
  let threw = false;
  try { enforceVerdictWordInvariant(crafted); } catch (e) { threw = /invariant_violation/.test((e as Error).message); }
  eq("inv(ii)-dev: crafted violation throws", threw, true);
  const env = process.env as Record<string, string | undefined>;  // NODE_ENV is readonly in the project's types
  const prevEnv = env.NODE_ENV;
  env.NODE_ENV = "production";
  const routed = enforceVerdictWordInvariant(crafted);
  if (prevEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = prevEnv;
  eq("inv(ii)-prod: routes NEEDS_HUMAN_REVIEW", routed.verdict, "NEEDS_HUMAN_REVIEW");
  eq("inv(ii)-prod: eligible null", routed.eligible, null);
  eq("inv(ii)-prod: reason tagged", routed.reason, "invariant_violation:ineligible_without_eligibility_bar");
  // (iii) requirement-side impossibility (kind != eligibility_bar) → NO_BID, never INELIGIBLE
  eq("inv(iii): req-side impossibility → NO_BID not INELIGIBLE", deriveVerdict(inp(noBid, { profile: { satisfiedAttributes: [] } })).verdict, "NO_BID");
}

// ── Doctrine #1 (Step 3, AUDIT_SETASIDE_FIRMSTATUS_GATE) — a set-aside vouched already_satisfied is MET only
//    when the profile PROVES it; null/unverified → caution GATE; closed-world FAIL → eligibility_bar. Default-OFF.
//    Step 3 is an ORCHESTRATOR pass (not in deriveVerdict), so it is proven by invoking the pass directly. ──
const GATE3 = process.env.AUDIT_SETASIDE_FIRMSTATUS_GATE === "true";
if (GATE3) {
  const sa = () => f({ requirement: "100% Total Small Business set-aside — firm qualifies", kind: "eligibility_bar", controllability: "already_satisfied", requiredAttribute: "naics:333120-small" });
  const gate = (p: BidderProfile | null) => applySetAsideFirmStatusGate([sa()], p, { enabled: true })[0];
  // null profile → unverified caution GATE, never met
  const nullP = gate(null);
  eq("step3: null profile → bidder_controls (gate, not met)", nullP.controllability, "bidder_controls");
  eq("step3: null profile → cautionFloor set", nullP.cautionFloor, true);
  eq("step3: null profile → NEVER already_satisfied", nullP.controllability === "already_satisfied", false);
  // satisfies-profile (closed-world holds the size attr) → keep met
  eq("step3: satisfies-profile → stays already_satisfied (met)", gate({ satisfiedAttributes: ["naics:333120-small"] }).controllability, "already_satisfied");
  // fails-profile (closed-world lacks it) → eligibility_bar → INELIGIBLE
  const failsF = gate({ satisfiedAttributes: [] });
  eq("step3: fails-profile → bidder_cannot_move (bar)", failsF.controllability, "bidder_cannot_move");
  const fv = deriveVerdict(inp([failsF], { profile: { satisfiedAttributes: [] } }));
  eq("step3: fails-profile → INELIGIBLE", fv.verdict, "INELIGIBLE");
  eq("step3: fails INELIGIBLE carries eligibility_bar (invariant-safe)", fv.showStoppers.some((s) => s.kind === "eligibility_bar"), true);
  // ── INTERACTION — the three ordering constraints ──
  // (1) award-basis handles an 8(a) socioeconomic set-aside ONCE → Step-3 no-ops (no double-caution)
  const ab = applyAwardBasisOvertypeGuard([f({ requirement: "8(a) set-aside — firm qualifies", kind: "eligibility_bar", controllability: "already_satisfied" })], null, { enabled: true })[0];
  eq("compose(1): 8(a) Step-3 no-op after award-basis (handled once)", JSON.stringify(applySetAsideFirmStatusGate([ab], null, { enabled: true })[0]), JSON.stringify(ab));
  // (2) fails-bar survives the whitelist (no-op on a loaded profile) → INELIGIBLE un-downgraded
  const afterWL = applyStructuralBarWhitelist([failsF], { satisfiedAttributes: [] }, { enabled: true })[0];
  eq("compose(2): fails-bar survives whitelist (loaded-profile no-op)", afterWL.controllability, "bidder_cannot_move");
  eq("compose(2): → INELIGIBLE un-downgraded", deriveVerdict(inp([afterWL], { profile: { satisfiedAttributes: [] } })).verdict, "INELIGIBLE");
  // (3) fails-bar is NOT caution-floored (caution-floor skips bar-class)
  const afterCF = applyCautionFloor([failsF], { enabled: true })[0];
  eq("compose(3): fails-bar NOT caution-floored", afterCF.cautionFloor ?? false, false);
  eq("compose(3): fails-bar stays bidder_cannot_move", afterCF.controllability, "bidder_cannot_move");
}

// ── Step 5a: KNOWN-CLAUSE SEMANTICS GUARD (Brain card 135) ──
// `f()` hardcodes citation, so build clause findings with an explicit citation field here.
const cf = (citation: string, o: Partial<TypedFinding> & { kind: TypedFinding["kind"]; controllability: TypedFinding["controllability"] }): TypedFinding =>
  ({ requirement: o.requirement ?? "requirement", citation, excerpt: "verbatim", grounded: true, lens: "x",
     kind: o.kind, controllability: o.controllability, requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow });
// OFF/inert is unconditional (default-off → byte-identical) — calling with omitted opts returns the input.
{
  const bar = cf("FAR 52.204-7", { requirement: "register in SAM", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "sam:registered", curableInWindow: false });
  eq("5a OFF: guard inert (no opts) → byte-identical", JSON.stringify(applyClauseSemanticsGuard([bar])[0]), JSON.stringify(bar));
}
const G5 = process.env.AUDIT_CLAUSE_SEMANTICS_GUARD === "true";
if (G5) {
  const on = (x: TypedFinding) => applyClauseSemanticsGuard([x], { enabled: true })[0];
  // (i) 52.204-7 mis-typed bar/INELIGIBLE → curable caution, NEVER a show-stopper.
  const sam = on(cf("FAR 52.204-7", { requirement: "offeror must be registered in SAM", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "sam:registered", curableInWindow: false }));
  eq("5a(i) 52.204-7 → bidder_controls", sam.controllability, "bidder_controls");
  eq("5a(i) 52.204-7 → curable caution", [sam.curableInWindow, sam.cautionFloor], [true, true]);
  eq("5a(i) 52.204-7 via deriveVerdict → BID_WITH_CAUTION (never a show-stopper)", deriveVerdict(inp([sam])).verdict, "BID_WITH_CAUTION");
  // (ii) 52.246-15 mis-typed bar → cleared to non-blocking (no caution floor).
  const coc = on(cf("FAR 52.246-15", { requirement: "Certificate of Conformance required", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "coc", curableInWindow: false }));
  eq("5a(ii) 52.246-15 → bidder_controls", coc.controllability, "bidder_controls");
  eq("5a(ii) 52.246-15 → NOT caution-floored (informational)", coc.cautionFloor ?? false, false);
  eq("5a(ii) 52.246-15 alone via deriveVerdict → BID (non-blocking)", deriveVerdict(inp([coc])).verdict, "BID");
  // (i-b) CAP-ONLY: a 52.204-7 finding that is ALREADY satisfied/controllable → UNTOUCHED (never downgrade a met).
  const satisfied = cf("FAR 52.204-7", { requirement: "registered in SAM", kind: "eligibility_bar", controllability: "already_satisfied", requiredAttribute: "sam:registered" });
  eq("5a(i-b) already_satisfied 52.204-7 → UNTOUCHED (cap-only)", JSON.stringify(on(satisfied)), JSON.stringify(satisfied));
  const ctrl = cf("FAR 52.204-7", { requirement: "confirm SAM registration", kind: "submission", controllability: "bidder_controls" });
  eq("5a(i-b) bidder_controls 52.204-7 → UNTOUCHED (never elevated)", JSON.stringify(on(ctrl)), JSON.stringify(ctrl));
  // (iii) LOAD-BEARING: a genuine structural bar (sole-source/OEM/QPL, not in the map) → UNTOUCHED.
  const ss = cf("FAR 52.211-6", { requirement: "sole-source to named OEM; QPL listing required", kind: "technical_spec", controllability: "bidder_cannot_move", requiredAttribute: "qpl:listed", curableInWindow: false });
  eq("5a(iii) genuine structural bar UNTOUCHED", JSON.stringify(on(ss)), JSON.stringify(ss));
  // (iv) exact-match discipline: 52.204-13 / 52.246-2 / DFARS 252.204-7012 NOT matched.
  const o13 = cf("FAR 52.204-13", { requirement: "SAM maintenance", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "x", curableInWindow: false });
  eq("5a(iv) 52.204-13 NOT matched", JSON.stringify(on(o13)), JSON.stringify(o13));
  const o2 = cf("FAR 52.246-2", { requirement: "inspection of supplies", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "x", curableInWindow: false });
  eq("5a(iv) 52.246-2 NOT matched", JSON.stringify(on(o2)), JSON.stringify(o2));
  const dfars = cf("DFARS 252.204-7012", { requirement: "covered defense information safeguarding", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "x", curableInWindow: false });
  eq("5a(iv) DFARS 252.204-7012 NOT matched (digit-boundary)", JSON.stringify(on(dfars)), JSON.stringify(dfars));
  // trailing-digit boundary the lookahead exists to protect (52.204-70, 52.204-8, 52.246-150, 52.246-23).
  for (const c of ["FAR 52.204-70", "FAR 52.204-8", "FAR 52.246-150", "FAR 52.246-23"]) {
    const b = cf(c, { requirement: "x", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "x", curableInWindow: false });
    eq(`5a(iv) ${c} NOT matched (digit-boundary)`, JSON.stringify(on(b)), JSON.stringify(b));
  }
  // (v) PRECEDENCE: a 52.204-7 finding the whitelist ALONE would not cap (generic requirement, no SAM keyword)
  //     is capped by the clause guard run BEFORE the whitelist → authoritative, not just safe.
  const generic = cf("FAR 52.204-7", { requirement: "the offeror shall comply with the referenced provision at award", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "x", curableInWindow: false });
  eq("5a(v) whitelist ALONE leaves generic 52.204-7 a bar (precision gap)", applyStructuralBarWhitelist([generic], null, { enabled: true })[0].controllability, "bidder_cannot_move");
  eq("5a(v) clause guard BEFORE whitelist → capped (authoritative)", applyStructuralBarWhitelist([on(generic)], null, { enabled: true })[0].controllability, "bidder_controls");
}

// ── DETERMINISM (Brain card-42 §4): identical input → identical verdict across 50 runs. ──
const baseline = JSON.stringify(deriveVerdict(inp(two)));
let drift = 0;
for (let i = 0; i < 50; i++) if (JSON.stringify(deriveVerdict(inp(two))) !== baseline) drift++;
eq("determinism: 0 drift across 50 runs", drift, 0);

console.log(`derive-verdict gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — verdict DERIVED in code (the #2 case = BID); full ladder; 0 drift across 50 runs (determinism proven).");
