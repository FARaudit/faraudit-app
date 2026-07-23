// PRODUCTION-COMPOSITION proof for the `temporalClosed` recompete-watch render (Brain ITEM B).
// Proof-shape per the ruling: render through the REAL report path — deriveVerdict → buildV3Payload → renderV3Html —
// NOT a leaf helper. Flag-OFF must be byte-identical; flag-ON must replace the (wrong) generic no-bid copy.
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { deriveVerdict } from "./audit-decide";
import { buildV3Payload, renderV3Report } from "./audit-v3-report";
import type { VerdictInputs, TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T,>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_TEMPORAL_VERDICT;
  process.env.AUDIT_TEMPORAL_VERDICT = on ? "true" : "false";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_TEMPORAL_VERDICT; else process.env.AUDIT_TEMPORAL_VERDICT = prev; }
};
const f = (o: Partial<TypedFinding>): TypedFinding => ({ requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, lens: "t", ...o });

// A CLOSED solicitation: live SAM archived, amendment set complete (the ONLY path to NO_BID(closed)).
const DL = "2026-06-22T13:00:00-04:00";              // fixture doctrine: real SAM datetime form
const NOW = "2026-07-22T12:00:00Z";
const closedInputs = (): VerdictInputs => ({
  findings: [f({ requirement: "Price all CLINs per the schedule.", excerpt: "Price all CLINs.", citation: "B.1", curableInWindow: true })],
  bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false,
  source: "Full and open solicitation. Award to the LPTA offeror. Price all CLINs.",
  documentsComplete: true,
  temporalSnapshot: { today: "2026-07-22", responseDeadline: DL, responseDeadlinePast: true, mandatoryEventDates: [], mandatoryEventPast: null, latestFutureDeadline: null, daysToResponse: -30 },
  liveSam: { fetched: true, active: false, responseDeadline: DL, amendmentCount: 0 },
  ingestedAmendmentComplete: true, today: "2026-07-22", nowIso: NOW,
});
const cov = { required: [], covered: [], missing: [], coreMissing: [] };
const renderOf = (inp: VerdictInputs) => {
  const d = deriveVerdict(inp);
  const p = buildV3Payload(d, cov, [], "2026-07-22T00:00:00Z");
  return { d, p, html: renderV3Report(p, { solicitationNumber: "TEST-001", title: "Test", auditId: "t1" }) };
};

// ── 1. FLAG-OFF: byte-identical, field absent ──────────────────────────────────────────────────────────────
const off = withFlag(false, () => renderOf(closedInputs()));
assert(!("temporalClosed" in off.p), "flag-OFF: payload OMITS the temporalClosed key entirely (not false/undefined)");
assert(!/recompete watch/i.test(off.html), "flag-OFF: no recompete-watch copy in the rendered HTML");

// ── 2. FLAG-ON: NO_BID(closed) renders the recompete-watch state through the REAL path ─────────────────────
const on = withFlag(true, () => renderOf(closedInputs()));
assert(on.d.verdict === "NO_BID" && on.d.temporalClosed === true, `flag-ON: producer emits NO_BID + temporalClosed (got ${on.d.verdict}/${on.d.temporalClosed})`);
assert(on.p.temporalClosed === true, "flag-ON: buildV3Payload carries temporalClosed into the payload");
assert(/recompete watch/i.test(on.html), "flag-ON: rendered HTML carries the recompete-watch eyebrow");
// The whole point: the generic no-bid copy is WRONG for a closed sol and must be GONE.
assert(!/unwinnable requirement/i.test(on.html), "flag-ON: the misleading 'unwinnable requirement' copy is REPLACED");
assert(!/no offeror can clear/i.test(on.html), "flag-ON: the misleading 'no offeror can clear' copy is REPLACED");
// Colour moat invariant: word/cls unchanged (gateFramingPres states word/cls/kind never change).
assert(/NO-BID/.test(on.html) && /v-stop/.test(on.html), "flag-ON: verdict word + colour class UNCHANGED (colour moat intact)");

// ── 3. a NON-closed NO_BID must keep the generic copy (the override is scoped, not blanket) ────────────────
{
  const inp = closedInputs();
  inp.liveSam = { fetched: true, active: true, responseDeadline: "2026-08-15T10:00:00-04:00", amendmentCount: 0 }; // OPEN
  const r = withFlag(true, () => renderOf(inp));
  assert(r.d.verdict !== "NO_BID" || !r.p.temporalClosed, `open sol → not a temporal NO_BID (got ${r.d.verdict})`);
  assert(!/recompete watch/i.test(r.html), "open sol: no recompete-watch copy");
}

// ── 4. gate-framing ON: the override still applies (both presentation modes) ───────────────────────────────
{
  const prev = process.env.AUDIT_GATE_FRAMING;
  process.env.AUDIT_GATE_FRAMING = "true";
  const r = withFlag(true, () => renderOf(closedInputs()));
  assert(/recompete watch/i.test(r.html), "gate-framing ON: recompete-watch copy still renders");
  assert(!/forecloses an award/i.test(r.html), "gate-framing ON: generic closing-gate copy REPLACED");
  if (prev === undefined) delete process.env.AUDIT_GATE_FRAMING; else process.env.AUDIT_GATE_FRAMING = prev;
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL GREEN — temporalClosed render (production composition)");
process.exit(failures ? 1 : 0);
