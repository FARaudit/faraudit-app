// Vehicle A–E · item D cert — cyber RFI reconciliation (flag AUDIT_CYBER_RFI_RECONCILE, default-OFF).
// Run: npx tsx src/lib/audit-decide-cyber-rfi-reconcile.test.ts
// OVER-CLAIM class: demote a 252.204-7012 / 800-171 sub-flow-down over-claim to informational ONLY when the package's
// RFI responses ground BOTH a CO cyber-withdrawal AND a no-CUI/FCI statement (FA813726 e63bd1e7). Conservative: either
// signal alone must NOT demote (a live 7012 with real CDI stays a gate).
import { applyCyberRfiReconciliation } from "./audit-decide";
type TypedFinding = import("./audit-findings").TypedFinding;

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const cyberFinding = (): TypedFinding => ({
  requirement: "DFARS 252.204-7012 obligations may require NIST SP 800-171 compliance infrastructure that subcontractors must also satisfy.",
  citation: "Section I · DFARS 252.204-7012", excerpt: "Safeguarding Covered Defense Information and Cyber Incident Reporting.",
  kind: "submission", controllability: "bidder_cannot_move", grounded: true, lens: "cyber_cmmc", curableInWindow: false,
});
const nonCyber = (): TypedFinding => ({
  requirement: "Offeror must furnish a 20% bid guarantee.", citation: "§ L 4.3", excerpt: "A bid guarantee of 20% is required.",
  kind: "pricing", controllability: "bidder_controls", grounded: true, lens: "pricing_analyst", curableInWindow: true,
});
// e63bd1e7 RFI responses — FAITHFUL Q&A shape from this record's persisted raw_pdf_text (L40-D4 fixture doctrine, D5
// fix 2026-07-24): the cyber requirement is in the QUESTION and the withdrawal in the "PZ Response:" ANSWER, split by
// a PERIOD (the prior fixture used an em-dash with no period, hiding the sentence boundary that made item D under-fire
// on the real source under the tight `[^.]` window). This captured shape is the regression pin for the widened anchor.
const RFI_SRC = "Per the OPSEC Memo this project does not contain CUI. FCI and/or CUI are not included in any documentation as a part of the subject project. 54. Please confirm whether subcontractors must implement applicable CMMC, SPRS, and/or NIST SP 800-171 requirements in order to participate in proposal preparation or contract performance under this acquisition. PZ Response: This is no longer a requirement.";
const SRC_WITHDRAWN_ONLY = "Subcontractors to satisfy CMMC/SPRS requirements — PZ Response: This is no longer a requirement."; // no no-CUI statement
const SRC_LIVE_CYBER = "Contractor shall comply with DFARS 252.204-7012 safeguarding of covered defense information and 72-hour cyber incident reporting."; // real CDI, no withdrawal

console.log("\n── 1 · FLAG OFF ⇒ cyber finding unchanged (byte-identical) ──");
{
  const out = applyCyberRfiReconciliation([cyberFinding()], RFI_SRC, { enabled: false });
  assert(out[0].controllability === "bidder_cannot_move" && !out[0].cyberRfiReconciled, "flag-OFF ⇒ untouched");
}

console.log("\n── 2 · FLAG ON + BOTH signals grounded ⇒ cyber over-claim DEMOTED to informational ──");
{
  const out = applyCyberRfiReconciliation([cyberFinding()], RFI_SRC, { enabled: true });
  assert(out[0].cyberRfiReconciled === true, "reconciled marker set");
  assert(out[0].controllability === "bidder_controls" && out[0].curableInWindow === true, "demoted to bidder-controllable/curable (non-escalating)");
  assert(/cyber reconciliation \(item D\)/.test(out[0].citation ?? ""), "citation annotated with the RFI reconciliation");
}

console.log("\n── 3 · FLAG ON + WITHDRAWAL only (no no-CUI statement) ⇒ NOT demoted (conservative) ──");
{
  const out = applyCyberRfiReconciliation([cyberFinding()], SRC_WITHDRAWN_ONLY, { enabled: true });
  assert(out[0].controllability === "bidder_cannot_move" && !out[0].cyberRfiReconciled, "one signal ⇒ untouched (never demote a possibly-live gate)");
}

console.log("\n── 4 · FLAG ON + a LIVE 7012 (real CDI, no withdrawal) ⇒ NOT demoted (false-BID guard) ──");
{
  const out = applyCyberRfiReconciliation([cyberFinding()], SRC_LIVE_CYBER, { enabled: true });
  assert(out[0].controllability === "bidder_cannot_move" && !out[0].cyberRfiReconciled, "live cyber gate stays a gate");
}

console.log("\n── 5 · FLAG ON + BOTH signals but a NON-cyber finding ⇒ untouched ──");
{
  const out = applyCyberRfiReconciliation([nonCyber()], RFI_SRC, { enabled: true });
  assert(out[0].controllability === "bidder_controls" && !out[0].cyberRfiReconciled, "non-cyber finding never reconciled");
}

// P0 REGRESSION LOCK (adversarial seat, 2026-07-24) — the two-signal guard must NOT fire on a DECOUPLED withdrawal
// (a routine "X is no longer a requirement" unrelated to cyber) + a CUI-HANDLING "no CUI" phrase (which presumes CUI).
// A genuine 252.204-7012 CDI bar (no "CMMC" token ⇒ unprotected by STRUCTURAL_BAR_RE_114) must stay a gate. False-BID.
const genuine7012 = (): TypedFinding => ({
  requirement: "Offeror must have implemented NIST SP 800-171 and hold a current SPRS score at time of award; offerors unable to demonstrate safeguarding of covered defense information are ineligible.",
  citation: "DFARS 252.204-7012", excerpt: "this effort involves covered defense information; 800-171 implementation is required.",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "cyber_cmmc", curableInWindow: false,
});
const ADV_DECOUPLED = "The pre-proposal site visit is no longer a requirement. No CUI shall be stored on contractor information systems that are not 800-171 compliant. This effort involves covered defense information.";
console.log("\n── 6 · FLAG ON + DECOUPLED withdrawal + CUI-HANDLING 'no CUI' (false signals) ⇒ genuine 7012 NOT demoted ──");
{
  const out = applyCyberRfiReconciliation([genuine7012()], ADV_DECOUPLED, { enabled: true });
  assert(out[0].controllability === "bidder_cannot_move" && !out[0].cyberRfiReconciled, "adversarial decoupled signals ⇒ genuine CDI bar kept as a gate (no false-BID)");
}

console.log(failures === 0 ? "\n✅ ALL GREEN — vehicle D cyber RFI reconciliation" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
