// Repro of the adversarial-seat P0 (item D false-BID): a GENUINE 252.204-7012 CDI eligibility bar (no "CMMC" token,
// so STRUCTURAL_BAR_RE_114 does NOT protect it) is demoted to bidder_controls when the source merely contains a
// DECOUPLED "no longer a requirement" phrase + a CUI-HANDLING "no CUI" phrase (neither a real cyber withdrawal).
//   npx tsx scripts/audit-ai/_repro-itemd-p0.ts
import { applyCyberRfiReconciliation } from "../../src/lib/audit-decide";
type TF = import("../../src/lib/audit-findings").TypedFinding;

const genuine7012 = (): TF => ({
  requirement: "Offeror must have implemented NIST SP 800-171 and hold a current SPRS score at time of award; offerors unable to demonstrate safeguarding of covered defense information are ineligible.",
  citation: "DFARS 252.204-7012", excerpt: "this effort involves covered defense information; 800-171 implementation is required.",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "cyber_cmmc", curableInWindow: false,
});

// Adversarial source: a routine site-visit withdrawal (decoupled tail) + a CUI-HANDLING instruction that AFFIRMS CUI.
const advSource = "The pre-proposal site visit is no longer a requirement. No CUI shall be stored on contractor information systems that are not 800-171 compliant. This effort involves covered defense information.";
// Legit source (cert block 2 shape): a REAL cyber withdrawal + a REAL no-CUI absence assertion.
const legitSource = "Per RFI response, CMMC / SPRS / NIST SP 800-171 for subcontractors is no longer a requirement. This project does not contain CUI.";

const run = (src: string) => applyCyberRfiReconciliation([genuine7012()], src, { enabled: true })[0];
const demoted = (f: TF) => f.controllability === "bidder_controls" && (f as any).cyberRfiReconciled === true;

const adv = run(advSource);
const legit = run(legitSource);
console.log(`ADVERSARIAL source → genuine 7012 demoted? ${demoted(adv)}   ${demoted(adv) ? "❌ P0 FALSE-BID" : "✅ kept as gate"}`);
console.log(`LEGIT withdrawal source → demoted? ${demoted(legit)}   ${demoted(legit) ? "✅ intended demotion" : "❌ regression (should demote)"}`);
