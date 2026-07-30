// PROBE (card #576 F8) — does wiring classifyBenignRecital into the notice-body pole actually DEMOTE the Class C
// residue (GAO-protest availability line, reps-certs recital, set-aside/size metadata), or does the residue belt
// refuse because the pole's firing token (eligib/set-aside/sam) is ALSO a BAR_SIGNAL token surviving outside the
// stripped arm span? Run: npx tsx scripts/audit-ai/_probe-f8-notice-body-benign.ts
import { noticeBodyEligibilityUngrounded } from "../../src/lib/audit-orchestrator";
import { classifyBenignRecital, verifyRecitalInSource, recitalTailVeto, hasBarSignal } from "../../src/lib/audit-gate-v2";

const NOTICE = "SAM Notice Body";
const PRIMARY = "Solicitation W912-XX-26-R-0001. Statement of work and pricing schedule follow in the attached document.";
const mk = (t: string) => `\n\n==== DOCUMENT: Solicitation ====\n\n${PRIMARY}\n\n==== DOCUMENT: ${NOTICE} ====\n\n${t}`;

// Realistic Class C notice-body recitals (each a plausible SAM synopsis line).
const CASES: Record<string, string> = {
  gaoProtestLine:   "Protests may be filed with the Government Accountability Office in accordance with FAR 33.104; an interested party that is an actual or prospective offeror is eligible to file a protest.",
  copyOfProtest:    "The copy of any protest shall be furnished to the Contracting Officer, and any eligible offeror may request an agency-level protest within the FAR 33.103 timeframe.",
  repsCertsElig:    "Offerors are required to meet the annual representations and certifications and to confirm eligibility for award electronically.",
  setAsideMeta:     "This requirement is a total small business set-aside under NAICS 541511 with a size standard of $34 million.",
  siteVisitLogist:  "A site visit is scheduled for 15 March 2026; please RSVP by email to the Contracting Officer.",
};

console.log("token / classifier trace (flag-independent):\n");
for (const [k, txt] of Object.entries(CASES)) {
  // Enclosing-sentence extraction mirrors the pole's slice logic isn't needed — the whole line IS one sentence here.
  const arm = classifyBenignRecital(txt);
  const verified = verifyRecitalInSource(mk(txt), txt);
  const tailVeto = verified ? recitalTailVeto(verified.continuation) : "(n/a)";
  console.log(`• ${k}`);
  console.log(`    classifyBenignRecital = ${arm ?? "null"}   hasBarSignal(whole) = ${hasBarSignal(txt)}`);
  console.log(`    verifyRecitalInSource = ${verified ? "present" : "null"}   recitalTailVeto = ${tailVeto}`);
}

console.log("\npole behavior — flag OFF vs ON (does the wiring change the verdict pole?):\n");
for (const [k, txt] of Object.entries(CASES)) {
  process.env.AUDIT_NOTICE_BODY_BENIGN_RECITAL = "";
  const off = noticeBodyEligibilityUngrounded(mk(txt), [], txt);
  process.env.AUDIT_NOTICE_BODY_BENIGN_RECITAL = "true";
  const on = noticeBodyEligibilityUngrounded(mk(txt), [], txt);
  process.env.AUDIT_NOTICE_BODY_BENIGN_RECITAL = "";
  const changed = off !== on ? "  ⟵ DEMOTED by flag" : (off ? "  (still escalates)" : "  (never fired)");
  console.log(`• ${k}: OFF=${off} ON=${on}${changed}`);
}
