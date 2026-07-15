// PERMANENT eligibility-family regression suite (Brain card #515 P3). Run: npx tsx src/lib/audit-orchestrator-sizestd-vocab-sweep.test.ts
// Guards the §509 size-standard self-cert DEMOTION against the #507 blocklist-treadmill: a real bar COUPLED to a size
// standard must ESCALATE (never demote), a genuinely BARE size standard must DEMOTE. The guard is a SHAPE ALLOWLIST
// (ELIGIBILITY_BAR_RE coverage + second-obligation shape), never a bar-vocabulary blocklist. MUST stay green on every
// future touch of the eligibility family.
import { isBareSizeStandardSentence, noticeBodyEligibilityUngrounded } from "./audit-orchestrator";
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

console.log(`\n${fail === 0 ? "✅ ALL GREEN — sweep DRY" : `❌ ${fail} FAILURE(S) — NOT DRY`}`);
process.exit(fail === 0 ? 0 : 1);
