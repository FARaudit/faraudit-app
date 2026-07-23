// VERDICT ARC step 4 (moves 1+2) — WIRING PROOF for `AUDIT_RETIRE_VERBATIM_VETO` (default-OFF).
// Scope is deliberately narrow: prove the flag is REAL (not a no-op) and that flag-OFF is unchanged. The corpus
// flip-adjudication that actually discharges the gate (Brain step-4 ruling PART 1: gold-set direct count AND
// itemized flip-adjudication over the 40 banked run-records) is POST-PANEL work and is NOT attempted here.
//
// The property under test is the ratified halving of move 2:
//   RETIRED = the verbatim MATCH as an authority (disqualifierUncovered no longer CAPS)
//   KEPT    = the source-obligation ENUMERATION (the bucket still flows to every consumer)
//   UNTOUCHED = `unreadable` → INCOMPLETE (honest-fail on unread content, in BOTH flag states)
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { gateV2Outcome, type CoverageV2 } from "./audit-gate-v2";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_RETIRE_VERBATIM_VETO;
  process.env.AUDIT_RETIRE_VERBATIM_VETO = on ? "true" : "false";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_RETIRE_VERBATIM_VETO; else process.env.AUDIT_RETIRE_VERBATIM_VETO = prev; }
};

const cov = (over: Partial<CoverageV2>): CoverageV2 => ({
  unreadable: [], ungroundedRead: [], disqualifierUncovered: [], coverageGrade: 1, ...over,
});
const BAR = { section: "L", obligation: "Offerors must possess an active TOP SECRET facility clearance at the time of proposal submission." };

// ── 1. THE VETO — flag-OFF caps to NHR; flag-ON does not cap ────────────────────────────────────────────────
{
  const c = cov({ disqualifierUncovered: [BAR] });
  const off = withFlag(false, () => gateV2Outcome(c));
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(off.cap === "NEEDS_HUMAN_REVIEW", `flag-OFF: ungrounded bar-shaped obligation → NHR cap (got ${off.cap})`);
  assert(on.cap === null, `flag-ON: the same obligation NO LONGER caps the verdict (got ${on.cap})`);
  assert(/retire_verbatim_veto/.test(on.reason), "flag-ON: reason names the retirement and counts the retained ledger entries");
  assert(!/retire_verbatim_veto/.test(off.reason), "flag-OFF: reason carries NO retirement note (byte-identity)");
}

// ── 2. THE ENUMERATION IS KEPT — retirement must not DROP the ledger, only de-authorize it ──────────────────
{
  const c = cov({ disqualifierUncovered: [BAR, { section: "M", obligation: "Proposals from offerors lacking an active CMMC Level 2 certification will not be evaluated." }] });
  const before = JSON.stringify(c);
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(JSON.stringify(c) === before, "flag-ON: gateV2Outcome does not MUTATE the coverage ledger (entries survive for downstream consumers)");
  assert(c.disqualifierUncovered.length === 2, "flag-ON: both ledger entries retained as classifier input");
  assert(/2 ungrounded bar-shaped obligation\(s\) retained as ledger input/.test(on.reason),
    "flag-ON: the reason reports the retained COUNT (measurable, not silent)");
}

// ── 3. UNREADABLE → INCOMPLETE IS UNTOUCHED IN BOTH STATES (this is honest-fail, not the veto) ──────────────
{
  const c = cov({ unreadable: ["C"], disqualifierUncovered: [BAR] });
  const off = withFlag(false, () => gateV2Outcome(c));
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(off.cap === "INCOMPLETE" && on.cap === "INCOMPLETE",
    `unread binding content → INCOMPLETE in BOTH flag states (off=${off.cap} on=${on.cap})`);
  assert(off.reason === on.reason, "INCOMPLETE reason is byte-identical across flag states (unreadable precedes the veto branch)");
}

// ── 4. NO-BAR CASES ARE BYTE-IDENTICAL ACROSS FLAG STATES (the flag touches ONE branch only) ────────────────
for (const [name, c] of [
  ["clean coverage", cov({})],
  ["ungrounded non-bar boilerplate only", cov({ ungroundedRead: ["L", "M"], coverageGrade: 0.82 })],
  ["demoted non-bar signal", cov({ ungroundedNonBarSignal: [{ section: "L", obligation: "Submit one original and two copies." }], coverageGrade: 0.9 })],
] as Array<[string, CoverageV2]>) {
  const off = withFlag(false, () => gateV2Outcome(c));
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(off.cap === on.cap && off.reason === on.reason, `${name}: identical in both flag states`);
}

// ── 5. THE FAILURE DIRECTION IS NAMED — retirement REMOVES an escalation, so it fails toward FALSE-BID ──────
// Not a behavioural assertion; a pinned reminder that this flag's arm gate is measured false-BID = 0 (PANEL
// RULING 1 as re-scoped), never a byte-identity or a green suite.
{
  const c = cov({ disqualifierUncovered: [BAR] });
  const off = withFlag(false, () => gateV2Outcome(c));
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(off.cap === "NEEDS_HUMAN_REVIEW" && on.cap === null,
    "DIRECTION: the flag converts an escalation into a non-cap ⇒ failure direction is FALSE-BID ⇒ arm gate is measured false-BID=0, not this suite");
}

// ── 6. CO-RETIREMENT PIN (Brain ruling 2026-07-23, cards #690/#691 — red-team R7) ───────────────────────────
// THIS SUITE WAS INCOMPLETE: it reported 13/13 GREEN while the flag it tests silently DISARMS an armed floor.
// FAIL-2 (substrate-independent, and now the evidence the retirement REJECT rests on): flipping
// `AUDIT_RETIRE_VERBATIM_VETO` converts the LIVE-ARMED `AUDIT_COVERED_DIRECT_BAR_FLOOR` — and its subordinate
// `AUDIT_ELIG_BAR_PASSIVE_FRAME` — into dead code, because their entire output lands in `disqualifierUncovered`,
// which retirement de-authorizes. A wiring suite that cannot see that is exactly the L40 suite-design defect.
// This pin asserts the co-retirement EXPLICITLY, so the consequence can never again be invisible to a green run.
{
  const covered = { section: "C", obligation: "Offerors must hold a facility clearance at the SECRET level at the time of proposal submission." };
  const c = cov({ disqualifierUncovered: [covered] });
  const capIntact = withFlag(false, () => gateV2Outcome(c).cap);
  const capRetired = withFlag(true, () => gateV2Outcome(c).cap);
  assert(capIntact === "NEEDS_HUMAN_REVIEW",
    `CO-RETIREMENT PIN: with the veto INTACT, a covered_direct/passive-frame emission still caps (got ${capIntact})`);
  assert(capRetired === null,
    `CO-RETIREMENT PIN: retirement DE-AUTHORIZES that emission — the armed floor's output stops capping (got ${capRetired})`);
  assert(capIntact !== capRetired,
    "CO-RETIREMENT PIN: the two armed floors (AUDIT_COVERED_DIRECT_BAR_FLOOR + AUDIT_ELIG_BAR_PASSIVE_FRAME) are CO-RETIRED by this flag — any future retirement design must name their post-retirement enforcement path (L40-D2 / ITEM 0c)");
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS — veto-retirement flag wiring + co-retirement pin (build-neutral)");
if (failures) process.exit(1);
