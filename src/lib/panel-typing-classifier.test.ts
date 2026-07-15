// $0 PROOF P1 — TWO-ALLOWLIST SHAPE CLASSIFIER (card #526, Brain ruling). Run: npx tsx src/lib/panel-typing-classifier.test.ts
//
// Ruling table: (a) PROFILE-BAR (HOLD/BE a credential) → fail-closed bar; (b) DO-THE-WORK (in-window ACTION) →
// bidder_controls (curable); (c) NEITHER → NHR (escalation is the residual — nothing defaults to bidder_controls).
// CR#2's six over-typed items MUST all be (b); genuine bars (pastor letters, DoDI 1402.5) MUST be (a); ambiguity
// (credential-disguised-as-action, action-disguised-as-credential, in-window certs, coupled) resolves safely.
import { classifyGateShape, panelFindingsToTyped, type PanelStructuredInput } from "./panel-findings-bridge";
import type { PanelistOutput } from "./agentic-panel-runner";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const shape = (s: string) => classifyGateShape(s);

// ── (b) DO-THE-WORK — CR#2's six over-typed items (the seed probe set) ──
console.log("\n── (b) DO-THE-WORK — CR#2 seed set (all must be do_the_work) ──");
const DO_THE_WORK = [
  "Active SAM.gov registration required at time of award",
  "Contractor personnel performing on installation must obtain CAC and base access",
  "Price submission — must include pricing for base plus four option years",
  "Technical acceptability — must meet ALL technical criteria on the Technical Criteria Checklist (LPTA)",
  "Firm Fixed Price pricing arrangement — bidder must submit a viable FFP for each base and option period",
  "Quote submission via email to designated Contract Specialists",
  "Base Access Identification — Contractor must submit written request for base ID and vehicle passes",
  "Offerors shall maintain an active registration in the System for Award Management",
];
for (const g of DO_THE_WORK) assert(shape(g) === "do_the_work", `do_the_work: "${g.slice(0, 60)}…"`);

// ── (a) PROFILE-BAR — genuine held-credential / status ──
console.log("\n── (a) PROFILE-BAR — genuine bars (all must be profile_bar) ──");
const PROFILE_BAR = [
  "Two letters of recommendation from Roman Catholic pastors or priests required",
  "Criminal history background check per DoDI 1402.5 required",
  "Offeror must hold an active facility clearance at time of award",
  "Contractor must possess a current Secret security clearance",
];
for (const g of PROFILE_BAR) assert(shape(g) === "profile_bar", `profile_bar: "${g.slice(0, 60)}…"`);

// ── ambiguity / adversarial (Gauntlet seed) — must NOT demote to do-the-work ──
console.log("\n── adversarial boundary — must escalate (never demote a credential to do-the-work) ──");
assert(shape("Offeror must submit proof of NADCAP accreditation with the quote") === "profile_bar",
  "credential DISGUISED as action ('submit proof of NADCAP accreditation') → profile_bar (not demoted)");
assert(shape("Contractor must obtain ISO 9001 certification prior to award") === "neither",
  "in-window-acquirable cert ('obtain ISO 9001 prior to award') → neither (escalate; Brain ruling — acquirable ≠ held bar)");
assert(shape("Offeror must hold a valid state license AND submit the completed SF-1449") === "profile_bar",
  "coupled construction (hold license + submit) → profile_bar priority (escalate)");
// action DISGUISED as credential — SAM registration is do-the-work per Brain (#516 consistency)
assert(shape("Offeror must be registered in SAM prior to award") === "do_the_work",
  "action disguised as credential ('be registered in SAM') → do_the_work (#516-aligned)");
// genuinely neither → escalate
assert(shape("The offeror shall be determined responsible by the Contracting Officer") === "neither",
  "no action + no held-credential → neither (escalate → NHR)");

// ── BANKED ADVERSARIAL REGRESSION (Gauntlet rounds 1+2 findings — locked to DRY) ──
console.log("\n── banked adversarial regression (Gauntlet-to-DRY) ──");
const ADVERSARIAL: Array<[string, GateShapeExp]> = [
  ["Include a copy of your active professional engineer license", "profile_bar"],           // R1: credential-copy (licens\\b bug)
  ["Provide evidence of your accreditation.", "profile_bar"],                                 // R1: possessive credential
  ["Proposals must be emailed to the contracting officer by the due date.", "do_the_work"],   // R1: "emailed" (verb inflection)
  ["Bidder must complete and sign the representations and certifications.", "do_the_work"],    // R1: reps & certs = do-the-work
  ["Only firms holding a valid GSA schedule contract may respond.", "profile_bar"],            // R1: GSA-schedule-holder
  ["Bidders are required to demonstrate an active DoD Secret clearance.", "profile_bar"],      // R1: secret clearance = held
  ["Contractor must be the incumbent BOA holder to compete.", "profile_bar"],                  // R1: incumbent/holder exclusivity
  ["The firm must achieve DCSA facility clearance prior to contract start.", "profile_bar"],   // R1/R2: long-lead clearance ≠ acquirable
  ["Become ISO 9001 certified before performance begins.", "neither"],                         // R2: acquirable cert → escalate
  ["Contractor must hold a facility clearance AND complete the representations and certifications.", "profile_bar"], // R2: coupled — override must NOT false-demote a held bar
  ["Offeror shall possess NADCAP accreditation and submit the reps and certs", "profile_bar"], // R2: coupled possess+submit
];
type GateShapeExp = "profile_bar" | "do_the_work" | "neither";
for (const [s, exp] of ADVERSARIAL) assert(shape(s) === exp, `[adversarial] ${exp}: "${s.slice(0, 58)}…" (got ${shape(s)})`);

// ── BRIDGE OUTCOME — the pole-relevant controllability per shape ──
console.log("\n── bridge outcome — do-the-work demotes, profile-bar/neither fail closed ──");
const lens = (gates: PanelistOutput["named_hard_gates"]): PanelistOutput => ({ lens: "x", verdict: "BID", fit_score: 60, confidence: "medium", named_hard_gates: gates, risks: [], contrarian_finding: "" });
const mk = (gate: string): PanelStructuredInput => ({
  panelists: [{ key: "ex_ko", name: "Ex-KO", output: lens([{ gate, met: false, citation: "c", excerpt: "src" }]) }],
  stateByRef: new Map([["ex_ko:G1", { state: "VERIFIED", evidence: "" }]]),
});
const doWork = panelFindingsToTyped(mk("Price submission — must include pricing for base plus four option years"))[0];
assert(doWork.controllability === "bidder_controls" && doWork.curableInWindow === true && doWork.kind === "submission", "do-the-work gate → bidder_controls + curable + submission (NOT a bar)");
const bar = panelFindingsToTyped(mk("Offeror must hold an active facility clearance at time of award"))[0];
assert(bar.controllability === "bidder_cannot_move" && bar.curableInWindow === undefined, "profile-bar gate → bidder_cannot_move + fail-closed (curableInWindow undefined)");
const neither = panelFindingsToTyped(mk("The offeror shall be determined responsible by the Contracting Officer"))[0];
assert(neither.controllability === "bidder_cannot_move" && neither.curableInWindow === undefined, "neither → bidder_cannot_move + fail-closed (escalate → NHR)");

// ── (a2) SET-ASIDE CAUTION (card #528 R1) — bare socioeconomic/size eligibility → verify-caution, not fail-closed ──
console.log("\n── (a2) set-aside caution (R1) + boundaries (R2) ──");
const SET_ASIDE = [
  "100% Women-Owned Small Business (WOSB) set-aside — offeror must be a verified WOSB",
  "Total Small Business Set-Aside",
  "This is a HUBZone set-aside",
  "Offeror must be an SBA-certified 8(a) holder in good standing",
  "NAICS Code 711510 size standard applies to this acquisition",
];
for (const g of SET_ASIDE) assert(shape(g) === "set_aside_caution", `set_aside_caution: "${g.slice(0, 52)}…" (got ${shape(g)})`);
// R2 boundaries — coupled/affiliation/held-credential still escalate (NOT demoted to caution)
assert(shape("WOSB set-aside; offeror must also hold an active facility clearance") === "profile_bar", "R2: set-aside COUPLED with clearance → profile_bar");
// card #529 grounding determination — affiliation is bar-eligible ONLY with a DOCUMENT-TEXT trigger.
assert(shape("Ostensible Subcontractor / Affiliation Risk Under 13 CFR 121.103") === "set_aside_caution", "#529: regulation-cite-only affiliation (no doc trigger) → verify-if-teaming caution");
assert(shape("Offeror must disclose any teaming agreement or joint venture; affiliation applies") === "profile_bar", "#529: document-triggered affiliation (teaming/JV) → profile_bar");
assert(shape("Ostensible subcontractor rule with 52.219-14 limitations on subcontracting") === "profile_bar", "#529: affiliation + 52.219-14 doc trigger → profile_bar");
assert(shape("Affiliation with a named subcontractor plus an active facility clearance") === "profile_bar", "#529: affiliation coupled with clearance → profile_bar (genuine bar wins)");
assert(shape("ITAR-controlled effort under a small business set-aside") === "profile_bar", "R2: ITAR coupled → profile_bar");
assert(shape("Mandatory site visit required for this small business set-aside") === "profile_bar", "R2: mandatory site visit coupled → profile_bar");
// bridge outcome — set-aside caution types as curable eligibility caution (BID_WITH_CAUTION + eligible=null), never a bar
{
  const f = panelFindingsToTyped(mk("100% Women-Owned Small Business (WOSB) set-aside — offeror must be a verified WOSB"))[0];
  assert(f.controllability === "bidder_controls" && f.cautionFloor === true && f.kind === "eligibility_bar" && !!f.requiredAttribute,
    `set-aside → bidder_controls + cautionFloor + requiredAttribute=${f.requiredAttribute} (verify-eligibility caution, not fail-closed)`);
  assert(f.curableInWindow === undefined, "set-aside caution does NOT set curableInWindow (cautionFloor drives the caution)");
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
