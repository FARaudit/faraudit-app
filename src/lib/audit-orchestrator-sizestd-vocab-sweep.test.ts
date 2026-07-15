// PERMANENT eligibility-family regression suite (Brain card #515 P3). Run: npx tsx src/lib/audit-orchestrator-sizestd-vocab-sweep.test.ts
// Guards the §509 size-standard self-cert DEMOTION against the #507 blocklist-treadmill: a real bar COUPLED to a size
// standard must ESCALATE (never demote), a genuinely BARE size standard must DEMOTE. The guard is a SHAPE ALLOWLIST
// (ELIGIBILITY_BAR_RE coverage + second-obligation shape), never a bar-vocabulary blocklist. MUST stay green on every
// future touch of the eligibility family.
import { isBareSizeStandardSentence, isBidderSelfDeterminableSentence, noticeBodyEligibilityUngrounded } from "./audit-orchestrator";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
const mk = (t: string) => `\n\n==== DOCUMENT: Primary ====\n\nSF1449 solicitation.\n\n==== DOCUMENT: ${NOTICE_BODY_DOC_NAME} ====\n\n${t}`;
let fail = 0;
const expectEscalate = (label: string, t: string) => {
  const bare = isBareSizeStandardSentence(t);
  const floorEscalates = noticeBodyEligibilityUngrounded(mk(t), []);
  const ok = bare === false && floorEscalates === true;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌LEAK"} ${label}: isBare=${bare} floorEscalates=${floorEscalates}`);
};
const expectDemote = (label: string, t: string) => {
  const bare = isBareSizeStandardSentence(t);
  const floorEscalates = noticeBodyEligibilityUngrounded(mk(t), []);
  const ok = bare === true && floorEscalates === false;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: isBare=${bare} floorEscalates=${floorEscalates}`);
};

// ── #515 ledger: 11 coupled bars w/ UNENUMERATED vocab + 1 enumerated control — ALL must ESCALATE ──
console.log("── COUPLED bars (must ESCALATE) — #515 ledger ──");
expectEscalate("nadcap",   "Offerors must meet the applicable small business size standard and hold NADCAP accreditation.");
expectEscalate("itar",     "The offeror must meet the size standard and must be registered with the DDTC under ITAR.");
expectEscalate("taa",      "Quotes must meet the size standard and must comply with the Trade Agreements Act.");
expectEscalate("iso27001", "The contractor must meet the size standard and hold ISO 27001 certification.");
expectEscalate("scif",     "Offerors must meet the size standard and must maintain an accredited SCIF at time of award.");
expectEscalate("poly",     "The offeror must meet the size standard and personnel must pass a counterintelligence polygraph.");
expectEscalate("berry",    "Offerors must meet the size standard and must provide Berry Amendment compliant domestic textiles.");
expectEscalate("jcp",      "The offeror must meet the size standard and hold an active Joint Certification Program certification.");
expectEscalate("foci",     "The offeror must meet the size standard and must obtain an approved FOCI mitigation agreement.");
expectEscalate("buyamer",  "Quotes must meet the size standard and must satisfy Buy American Act domestic-end-product requirements.");
expectEscalate("fedramp",  "The contractor must meet the size standard and hold a FedRAMP Moderate authorization.");
expectEscalate("topsecret","The offeror must meet the size standard and must hold a Top Secret facility clearance.");

// ── NEW probe classes this pass: embedded-clause, conjunctions, semicolons, negation ──
console.log("── NEW probe classes (must ESCALATE) ──");
expectEscalate("semicolon",   "The small business size standard is $13 million; offerors must hold an active DCSA facility clearance.");
expectEscalate("embedded",    "Offerors that meet the size standard and possess a current CMMC Level 2 certification are eligible.");
expectEscalate("relclause",   "Only firms that meet the size standard and that maintain ITAR registration may submit.");
expectEscalate("comma-list",  "Offerors must meet the size standard, hold ISO 9001, and provide past performance.");
expectEscalate("citizenship", "The offeror must meet the size standard and all personnel must be U.S. citizens.");
expectEscalate("setaside",    "This is a HUBZone set-aside; offerors must meet the applicable size standard.");

// ── BARE size standards (must DEMOTE) — #515 round-2 + benign co-occurrence variants ──
console.log("── BARE size standards (must DEMOTE) ──");
expectDemote("dollar",    "The small business size standard is no greater than $13 million.");
expectDemote("employees", "The small business size standard is 1,250 employees.");
expectDemote("generic",   "Offerors must be small under the applicable NAICS size standard.");
expectDemote("eligible",  "Offerors must be eligible under the applicable small business size standard.");
expectDemote("meet-only", "To be eligible, the offeror must meet the small business size standard.");
expectDemote("of-form",   "The applicable size standard for this NAICS is $23.5 million in average annual receipts.");

// ── Round-2 adversarial angles (parenthetical / waiver / nested / passive / export / restriction) — must ESCALATE ──
console.log("── ROUND 2 angles (must ESCALATE) ──");
expectEscalate("parenthetical", "Offerors (who must also hold a Top Secret clearance) must meet the size standard.");
expectEscalate("waiver-neg",    "Offerors must meet the size standard and must not be debarred or suspended.");
expectEscalate("nested",        "Firms meeting the size standard shall obtain CMMC Level 2 prior to award.");
expectEscalate("passive-held",  "The size standard applies and a DCSA facility clearance is required to be held by the offeror.");
expectEscalate("export-itar",   "Offerors must meet the size standard and register under the ITAR export regime.");

// ── Round-2 bare (must DEMOTE) ──
console.log("── ROUND 2 bare (must DEMOTE) ──");
expectDemote("double",   "The size standard is $13 million for services and $30 million for supplies.");
expectDemote("receipts", "Offerors qualify if their average annual receipts are under the applicable size standard.");
// NOTE (verified): a benign "This size standard is not a certification requirement." does NOT match ELIGIBILITY_BAR_RE
// at all → the notice-body floor never treats it as a bar → no NHR and no caveat (rides a committal untouched). The
// demotion predicate is only ever consulted on sentences the floor already flagged, so this class needs no assertion.

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Card #516 CLASS ruling — generalize the demotion to the FULL bidder-self-determinable class (set-aside · SAM
// registration · reps & certs · size standard · bare generic-eligible). SAME allowlist-of-SHAPE rigor: a self-cert
// substance COUPLED to a third-party bar (clearance / site-visit / ITAR / QPL / holder-only) must ESCALATE; ambiguity
// (a "registered" with no SAM, a bare "eligible" carrying a second obligation) fails toward ESCALATION.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
const SET_ASIDE_META = "Women-Owned Small Business";           // record `set_aside` metadata (R3 belt)
// Class-aware helpers: the predicate AND the LIVE floor (flags ON) must agree — the floor is what the paid run runs.
const classEscalate = (label: string, t: string, meta: string | null = null) => {
  const demotable = isBidderSelfDeterminableSentence(t, meta);
  const floorEscalates = noticeBodyEligibilityUngrounded(mk(t), [], null, meta);
  const ok = demotable === false && floorEscalates === true;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌LEAK"} ${label}: demotable=${demotable} floorEscalates=${floorEscalates}`);
};
const classDemote = (label: string, t: string, meta: string | null = null) => {
  const demotable = isBidderSelfDeterminableSentence(t, meta);
  const floorEscalates = noticeBodyEligibilityUngrounded(mk(t), [], null, meta);
  const ok = demotable === true && floorEscalates === false;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: demotable=${demotable} floorEscalates=${floorEscalates}`);
};

// ── The 4 REAL seq-1 FA303026Q0020 notice-body sentences (as the floor's .!? splitter sees them) — ALL DEMOTE ──
console.log("\n── #516 REAL seq-1 notice-body sentences (must DEMOTE) ──");
classDemote("real-sizestd", "The small business size standard is no greater than $13 million.", SET_ASIDE_META);
classDemote("real-wosb",    "TYPE OF SET-ASIDE: This acquisition is a 100% Women Owned Small Business set-aside.", SET_ASIDE_META);
classDemote("real-sam",     "REGISTRATIONS: Offerors shall have and shall maintain an active registration in SAM.", SET_ASIDE_META);
classDemote("real-elig",    "gov to be eligible for a Government contract award.", SET_ASIDE_META);

// ── Self-determinable set-aside PROGRAMS (must DEMOTE) — the closed FAR-19 / 13-CFR allowlist ──
console.log("── #516 set-aside programs (must DEMOTE) ──");
classDemote("wosb",     "This acquisition is a 100% Women-Owned Small Business set-aside.");
classDemote("hubzone",  "This requirement is a total HUBZone small business set-aside.");
classDemote("sdvosb",   "This is a Service-Disabled Veteran-Owned Small Business set-aside.");
classDemote("8a",       "This procurement is set aside for 8(a) program participants.");
classDemote("edwosb",   "This is an EDWOSB set-aside.");
classDemote("sb-total", "This acquisition is a total small business set-aside.");

// ── SAM registration / reps & certs (must DEMOTE) — self-executed per FAR 52.204-7 / 52.212-3 ──
console.log("── #516 SAM registration + reps/certs (must DEMOTE) ──");
classDemote("sam-active",  "Offerors must have an active registration in SAM.gov at time of award.");
classDemote("sam-be-reg",  "Offerors must be registered in SAM to be eligible for award.");
classDemote("sam-sfam",    "Contractors shall maintain registration in the System for Award Management.");
classDemote("repscerts",   "Offerors must complete their representations and certifications at FAR 52.212-3.");

// ── ADVERSARIAL: self-determinable substance COUPLED to a THIRD-PARTY bar (must ESCALATE — the leak guard) ──
console.log("── #516 coupled third-party bars (must ESCALATE — leak guard) ──");
classEscalate("wosb+clearance",  "This is a WOSB set-aside; offerors must hold a Top Secret facility clearance.", SET_ASIDE_META);
classEscalate("wosb+sitevisit",  "This is a WOSB set-aside and attendance at the mandatory site visit is required to be eligible to propose.", SET_ASIDE_META);
classEscalate("sam+clearance",   "Offerors must maintain an active SAM registration and hold a Secret clearance.");
classEscalate("itar-reg+sam",    "Offerors must maintain an active SAM registration and must be registered with the DDTC under ITAR.");   // distant SAM must NOT demote the DDTC/ITAR registration
classEscalate("setaside+qpl",    "This is a HUBZone set-aside and offerors must hold an active Qualified Products List listing.");
classEscalate("sizestd+cmmc",    "Offerors must meet the size standard and possess a current CMMC Level 2 certification.");
classEscalate("bare-registered", "Offerors must be registered with the state licensing authority.");   // no SAM ⇒ ambiguous ⇒ escalate
classEscalate("sam+berry",       "Offerors must maintain SAM registration and provide Berry Amendment compliant textiles.");
classEscalate("wosb+facility",   "This is a WOSB set-aside; the offeror must maintain an accredited SCIF at time of award.", SET_ASIDE_META);
classEscalate("elig+obligation", "To be eligible, the offeror must hold a DCSA facility clearance.");   // "eligible" + real bar

// ── RED-TEAM leak regressions (Gate-2 adversarial panel, 2026-07-15) — a self-cert token COUPLED to an OUT-OF-VOCAB
//    THIRD-PARTY-AGENT gate ELIGIBILITY_BAR_RE cannot see. TEST(3) (third-party-agent SHAPE) must force ESCALATE — the
//    #507 blocklist-dependence guard. ALL must escalate. ──
console.log("── #516 red-team OOV third-party-agent leaks (must ESCALATE) ──");
classEscalate("dcsa-inspect",   "This is a WOSB set-aside; the facility is inspected by DCSA.", SET_ASIDE_META);
classEscalate("dcsa-enroll",    "This is a HUBZone set-aside and the plant is enrolled by DCSA.", SET_ASIDE_META);
classEscalate("sec-assess",     "Total small business set-aside; the system undergoes a security assessment.");
classEscalate("c3pao",          "This is a WOSB set-aside; the offeror is validated by a C3PAO.", SET_ASIDE_META);
classEscalate("vetted",         "Offerors must be registered in SAM; personnel are vetted by the security office.");
classEscalate("qpl-listing",    "This is a WOSB set-aside; the product receives QPL listing from the qualifying activity.", SET_ASIDE_META);
classEscalate("itar-in-sam",    "This is a WOSB set-aside; the contractor shall be registered under ITAR in SAM.", SET_ASIDE_META);   // SAM-window borrow closed
classEscalate("ddtc-then-sam",  "This is a WOSB set-aside; offerors shall be registered with DDTC and in SAM.", SET_ASIDE_META);
classEscalate("caf-issue",      "This is a WOSB set-aside; interim Secret determinations are issued by CAF.", SET_ASIDE_META);
classEscalate("qualified-by",   "This is an 8(a) set-aside; the product line is qualified by the approving activity.", SET_ASIDE_META);
classEscalate("walkthrough",    "This is a WOSB set-aside; a walkthrough of the classified space precedes any proposal.", SET_ASIDE_META);
classEscalate("r3-borrow",      "This is a WOSB set-aside; the facility is enrolled in the classified program by DCSA.", SET_ASIDE_META);   // R3 metadata must NOT open the gate for the coupled bar

// ── RED-TEAM R2 regressions (noun-form adjudications · conditional connectives · orphaned actor-clauses) — the leaks
//    TEST(3)'s verb-blocklist missed; TEST(4) positive-coverage must ESCALATE all. This is the non-treadmill guard. ──
console.log("── #516 red-team R2 noun-form / connective leaks (must ESCALATE) ──");
classEscalate("suitability-det", "This is a WOSB set-aside; the government will conduct a suitability determination on the awardee.", SET_ASIDE_META);
classEscalate("responsibility-det", "This is a WOSB set-aside; a favorable responsibility determination is required.", SET_ASIDE_META);
classEscalate("fitness-det",     "This is a WOSB set-aside; personnel are subject to a favorable fitness determination.", SET_ASIDE_META);
classEscalate("signoff",         "This is a WOSB set-aside; performance is contingent on a facility security officer sign-off.", SET_ASIDE_META);
classEscalate("nisp-entry",      "This is a WOSB set-aside; award is pending DCSA favorable entry into the NISP.", SET_ASIDE_META);
classEscalate("background-inv",  "This is a WOSB set-aside; personnel are subject to a background investigation.", SET_ASIDE_META);
classEscalate("sec-review-noun", "This is a WOSB set-aside; the facility undergoes a security review.", SET_ASIDE_META);
classEscalate("elig-dcsa-review","This is a WOSB set-aside; eligibility is subject to DCSA review of the facility.", SET_ASIDE_META);
classEscalate("interim-secret",  "This is a WOSB set-aside; assigned personnel require interim SECRET eligibility.", SET_ASIDE_META);
classEscalate("rating-from",     "This is a WOSB set-aside; offerors must have a favorable rating from the cognizant security office.", SET_ASIDE_META);
classEscalate("itar-with-ddtc",  "This is a WOSB set-aside; award is conditioned on ITAR registration with the DDTC.", SET_ASIDE_META);
classEscalate("sitevisit-noun",  "This is a WOSB set-aside; the site visit is mandatory and unconcluded.", SET_ASIDE_META);

// ── RED-TEAM R4 regressions — the positive-coverage allowlist HOLE: a govt-conferred / program-enrollment eligibility
//    phrased ENTIRELY in allowlisted words. EXTERNAL_ELIGIBILITY_GATE_RE must ESCALATE. ──
console.log("── #516 red-team R4 external-eligibility allowlist-hole (must ESCALATE) ──");
classEscalate("govt-completes-elig", "This is a WOSB set-aside; the Government must have completed the eligibility of the offeror.", SET_ASIDE_META);
classEscalate("agency-completes",    "This is a WOSB set-aside; the agency must have completed the eligibility of the offeror.", SET_ASIDE_META);
classEscalate("elig-with-agency",    "This is a WOSB set-aside; the offeror must have active eligibility with the agency.", SET_ASIDE_META);
classEscalate("govt-eligibility",    "This is a WOSB set-aside; the offeror must have Government eligibility.", SET_ASIDE_META);
classEscalate("govt-prog-elig",      "This is a WOSB set-aside; the offeror must have Government program eligibility.", SET_ASIDE_META);
classEscalate("current-prog-elig",   "This is a WOSB set-aside; the offeror must have current program eligibility.", SET_ASIDE_META);
classEscalate("elig-with-usg",   "This is a WOSB set-aside; the offeror must have eligibility with the United States Government.", SET_ASIDE_META);
classEscalate("elig-under-usg",   "This is a WOSB set-aside; the offeror must have eligibility under the U.S. Government.", SET_ASIDE_META);
classEscalate("elig-per-agency",  "This is a WOSB set-aside; the offeror must have eligibility per the agency.", SET_ASIDE_META);
// ── OVER-ESCALATION controls: self-referential eligibility (offeror eligible FOR/TO/under-size) MUST still DEMOTE ──
console.log("── #516 R4/R5 self-referential-eligibility controls (must DEMOTE) ──");
classDemote("be-an-eligible-sb",   "The offeror must be an eligible small business concern.");
classDemote("elig-under-size",     "Offerors must be eligible under the applicable small business size standard.");
classDemote("elig-for-award",      "Offerors must be registered in SAM to be eligible for award.");

// ── AFFILIATION carve-out (Brain card #517 ruling #3, 13 CFR 121.103) — affiliation / ostensible-subcontractor /
//    identity-of-interest is NOT bidder-self-determinable; it must ESCALATE even riding a size-standard / set-aside. ──
console.log("── #517 affiliation carve-out (must ESCALATE) ──");
classEscalate("affil-ride-size",  "The offeror must not be affiliated with a concern whose receipts exceed the size standard.");
classEscalate("affil-affiliates", "The size standard applies to the concern together with its affiliates.");
classEscalate("affil-ostensible", "This is a WOSB set-aside; award is barred where an ostensible subcontractor relationship exists.", SET_ASIDE_META);
classEscalate("affil-identity",   "The offeror must have no identity of interest with another concern under the size standard.");
classEscalate("affil-sizestd",    "Affiliation with any other concern will be considered in applying the small business size standard.");
classEscalate("affil-coupled-sa", "This is a WOSB set-aside; the offeror must not be affiliated with a large business.", SET_ASIDE_META);

// ── SUPERSET property: every §509 BARE size standard still DEMOTES under the class predicate ──
console.log("── #516 superset check — §509 bare size standards still DEMOTE ──");
classDemote("super-dollar",   "The small business size standard is no greater than $13 million.");
classDemote("super-generic",  "Offerors must be small under the applicable NAICS size standard.");

console.log(`\n${fail === 0 ? "✅ ALL GREEN — sweep DRY" : `❌ ${fail} FAILURE(S) — NOT DRY`}`);
process.exit(fail === 0 ? 0 : 1);
