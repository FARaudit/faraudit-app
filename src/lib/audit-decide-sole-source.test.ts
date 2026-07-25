// INTEGRATION — the ④ sole-source lock through the real deriveVerdict (flag AUDIT_SOLE_SOURCE_LOCK, card #746).
// Proves: flag-OFF byte-identical; flag-ON a surviving lock caps a would-be committal → NHR-CONDITIONAL naming the
// vendor (NOT NO_BID, NOT INELIGIBLE); each carve-out FALLS THROUGH (biddable, no false NHR); a real INCOMPLETE /
// proven show-stopper still WINS over the lock (correct precedence).
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { deriveVerdict } from "./audit-decide";
import type { VerdictInputs, TypedFinding } from "./audit-findings";
import { detectSoleSourceLock } from "./audit-sole-source-lock";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_SOLE_SOURCE_LOCK;
  process.env.AUDIT_SOLE_SOURCE_LOCK = on ? "true" : "false";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_SOLE_SOURCE_LOCK; else process.env.AUDIT_SOLE_SOURCE_LOCK = prev; }
};

// T1 ground-truth source (masthead + OCI offeror-obligation prose from a7727dfc).
const T1_SOURCE = [
  "==== DOCUMENT: notice ====",
  "24K Environmental Control Unit (ECU) Sole Source to Raytheon",
  "The Government intends to procure the 24K ECU on a sole source basis.",
  "If Raytheon intends to subcontract more than 70% of the value-added, Raytheon shall identify all OCIs.",
  "Raytheon shall submit a mitigation plan if any OCIs are identified.",
].join("\n");

// A clean, otherwise-committal input (a routine curable caution → would be BID/BWC without the lock).
const base = (source: string): VerdictInputs => {
  const findings: TypedFinding[] = [{
    requirement: "Submit an active SAM registration", citation: "52.204-7", excerpt: "offeror shall be registered in SAM",
    kind: "eligibility_bar", controllability: "bidder_controls", curableInWindow: true, grounded: true, lens: "contracts",
  }];
  return { findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false,
    documentsComplete: true, manifestComplete: true, source,
    soleSourceLock: detectSoleSourceLock(source) ?? undefined };
};

// ── 1. FLAG-OFF byte-identical: the lock is present in inputs but never routed. ────────────────────────────
{
  const inp = base(T1_SOURCE);
  const off = withFlag(false, () => deriveVerdict(inp));
  assert(off.verdict !== "NEEDS_HUMAN_REVIEW" || !/sole-source/i.test(off.reason), `flag-OFF: no sole-source NHR (got ${off.verdict})`);
  assert(inp.soleSourceLock?.vendor === "Raytheon", "detector populated soleSourceLock=Raytheon on the T1 source");
}

// ── 2. FLAG-ON T1: the lock CAPS the committal → NHR-CONDITIONAL naming Raytheon. ──────────────────────────
{
  const on = withFlag(true, () => deriveVerdict(base(T1_SOURCE)));
  assert(on.verdict === "NEEDS_HUMAN_REVIEW", `flag-ON T1: verdict = NEEDS_HUMAN_REVIEW (got ${on.verdict})`);
  assert(on.verdict !== "NO_BID" && on.verdict !== "INELIGIBLE", "flag-ON T1: NOT NO_BID / NOT INELIGIBLE (doctrine)");
  assert(/Raytheon/.test(on.reason), "flag-ON T1: reason NAMES the vendor (Raytheon)");
  assert(/no-bid.*confirm|confirm.*firm/i.test(on.reason), "flag-ON T1: reason is CONDITIONAL ('if not Raytheon, no-bid — confirm')");
  assert(/subcontract/i.test(on.reason), "flag-ON T1: reason carries the subcontractor-teaming disposition");
  assert(on.noVerdictCause === "eligibility", `flag-ON T1: noVerdictCause=eligibility (got ${on.noVerdictCause})`);
  assert(on.showStoppers.length === 1 && /Raytheon/.test(on.showStoppers[0].requirement), "flag-ON T1: one show-stopper naming the vendor");
}

// ── 3. CARVE-OUTS fall through — biddable, NO false NHR. ──────────────────────────────────────────────────
const CARVE = (title: string, source: string) => {
  const on = withFlag(true, () => deriveVerdict(base(source)));
  assert(on.verdict !== "NEEDS_HUMAN_REVIEW" || !/sole-source award/i.test(on.reason),
    `carve-out ${title}: NOT a sole-source NHR (biddable) — got ${on.verdict}`);
};
CARVE("or-equal", "Sole source to Acme Systems. Brand name or equal; an approved equal meeting the salient characteristics will be accepted.");
CARVE("intent synopsis 5207", "Notice of intent to sole source to Northrop Grumman Systems under FAR 5.207; interested capable sources may submit a capability statement the Government will consider.");
CARVE("incidental set-aside (J&A, no directed vendor)", "Justification and approval: the only known source is Acme Systems Inc. This is a 100% total small business set-aside under FAR 52.219-6.");

// ── 4. PRECEDENCE — a real INCOMPLETE WINS over the lock (unread doc could waive it). ─────────────────────
{
  const inp = base(T1_SOURCE); inp.documentsComplete = false;
  const on = withFlag(true, () => deriveVerdict(inp));
  assert(on.verdict === "INCOMPLETE", `flag-ON + documentsComplete=false → INCOMPLETE wins (got ${on.verdict})`);
}

// ── 5. PRECEDENCE — a proven show-stopper (INELIGIBLE) WINS over the lock. ────────────────────────────────
{
  const src = T1_SOURCE + "\nThe offeror must hold a Top Secret facility clearance.";
  const inp = base(src);
  inp.bidderProfile = { satisfiedAttributes: [], closedWorld: true }; // closed-world: a not-held grounded attribute provably fails
  inp.findings = [{
    requirement: "Hold a Top Secret facility clearance", citation: "DD254", excerpt: "must hold a Top Secret facility clearance",
    kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, grounded: true, lens: "contracts",
    requiredAttribute: "Top Secret facility clearance", // grounded substring of src ⇒ closed-world firmStatus="fails"
  }];
  assert(inp.soleSourceLock?.vendor === "Raytheon", "test 5: sole-source lock IS present (Raytheon)");
  const on = withFlag(true, () => deriveVerdict(inp));
  assert(on.verdict === "INELIGIBLE", `flag-ON + proven clearance fail → INELIGIBLE wins over lock (got ${on.verdict})`);
  assert(!/sole-source award to/i.test(on.reason), "test 5: the proven bar won — reason is NOT the sole-source pole");
}

// ── 6. TRUE T1 SHAPE — documentsComplete=true + manifestComplete=false (coreMissing=["M"], the grounding stop
//   that produced the live INCOMPLETE at decide.ts:3803). The sole-source step sits ABOVE that committal cap, so
//   the lock PREEMPTS it → NHR-conditional. Proves ④ does NOT depend on ② (card #745) for T1 to show the pole. ──
{
  const inp = base(T1_SOURCE);
  inp.documentsComplete = true;        // all 8 docs read (matches persisted a7727dfc documents_complete=true)
  inp.manifestComplete = false;        // coreMissing=["M"] → the grounding stop that capped the live run to INCOMPLETE
  const on = withFlag(true, () => deriveVerdict(inp));
  assert(on.verdict === "NEEDS_HUMAN_REVIEW", `true-T1-shape: lock PREEMPTS the manifestIncomplete INCOMPLETE cap → NHR (got ${on.verdict})`);
  assert(/Raytheon/.test(on.reason), "true-T1-shape: reason names Raytheon (not the 'unfetched' INCOMPLETE)");
  // and flag-OFF the SAME input reproduces the original INCOMPLETE (byte-identical prior behavior)
  const off = withFlag(false, () => deriveVerdict(inp));
  assert(off.verdict === "INCOMPLETE", `true-T1-shape flag-OFF: original INCOMPLETE preserved (got ${off.verdict})`);
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS");
if (failures) process.exit(1);
