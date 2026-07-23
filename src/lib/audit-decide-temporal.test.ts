// VERDICT ARC (move 4/5, Brain card #668) — deriveVerdict × temporal disposition integration ($0 suite).
// Run: npx tsx src/lib/audit-decide-temporal.test.ts
//
// Proves the panel non-negotiables AT THE VERDICT LAYER (the pure disposition itself is proven in
// audit-temporal.test.ts): flag-OFF byte-identity, CLOSED dominance (NO_BID + temporalClosed), the
// silently-fatal false-CLOSED guard (snapshot-past + NO live confirmation → INCOMPLETE, NEVER NO_BID),
// INDETERMINATE capping a would-be committal, and OPEN passing through untouched.
import { deriveVerdict } from "./audit-decide";
import { classifyTemporal, type LiveSamStatus } from "./audit-temporal";
import type { TypedFinding, VerdictInputs } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const TODAY = "2026-07-22";
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;

// A benign bidder-controllable curable finding → a committal verdict (BID/BWC) with NO temporal reasoning.
// The temporal layer's job is to correctly BLOCK/redirect that committal when currency says it must.
const cleanish = (): TypedFinding => ({
  requirement: "Offeror shall submit a technical approach addressing all PWS tasks.",
  citation: "§ L.3", excerpt: "The offeror shall submit a technical approach addressing all PWS tasks.",
  kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "proposal_manager",
  curableInWindow: true,
});

const snapPast = classifyTemporal([{ date: "2026-07-15", label: "RESPONSE DATE" }], TODAY);   // snapshot says CLOSED
const snapOpen = classifyTemporal([{ date: "2026-07-30", label: "RESPONSE DATE" }], TODAY);   // snapshot says OPEN
// FIXTURE DOCTRINE (Brain RULING 4): every temporal fixture carries a REAL SAM-format datetime and a verdict-time
// INSTANT. `NOW_ISO` is the instant the deadline gate compares against; date-only forms are a format SAM never emits
// and were the reason a fully-green battery stayed blind to F1.
const NOW_ISO = "2026-07-22T12:00:00Z";
const withTemporal = (live: LiveSamStatus | null, amendComplete: boolean, snap = snapPast): VerdictInputs => ({
  findings: [cleanish()], ...base, temporalSnapshot: snap, liveSam: live, ingestedAmendmentComplete: amendComplete,
  today: TODAY, nowIso: NOW_ISO,
});

// Baseline (no temporal reasoning at all) — the committal verdict the temporal layer will act on.
const baseline = deriveVerdict({ findings: [cleanish()], ...base });
const COMMITTAL = new Set(["BID", "BID_WITH_CAUTION"]);
console.log(`\n── baseline (no temporal): ${baseline.verdict} ──`);
assert(COMMITTAL.has(baseline.verdict), `baseline is a committal verdict (got ${baseline.verdict}) — the case the temporal layer must redirect`);
assert(baseline.temporalClosed === undefined, "baseline never sets temporalClosed");

console.log("\n── 1 · FLAG OFF ⇒ byte-identical even with full temporal inputs present ──");
{
  delete process.env.AUDIT_TEMPORAL_VERDICT;
  const d = deriveVerdict(withTemporal(null, true));
  assert(d.verdict === baseline.verdict, `flag-OFF verdict unchanged (got ${d.verdict})`);
  assert(d.temporalClosed === undefined, "flag-OFF never sets temporalClosed");
}

process.env.AUDIT_TEMPORAL_VERDICT = "true";

console.log("\n── 2 · CORE GUARD: snapshot-past + NO live confirmation ⇒ INCOMPLETE, NEVER NO_BID (false-CLOSED backstop) ──");
{
  const d = deriveVerdict(withTemporal(null, true));                                   // live fetch failed / absent
  assert(d.verdict === "INCOMPLETE", `no live currency ⇒ INCOMPLETE (got ${d.verdict})`);
  assert(!d.temporalClosed, "the missing doc may BE the extending amendment — must not be NO_BID(closed)");
  const d2 = deriveVerdict(withTemporal({ fetched: false, active: null }, true));      // explicit fetch failure
  assert(d2.verdict === "INCOMPLETE", `explicit fetch-fail ⇒ INCOMPLETE (got ${d2.verdict})`);
}

console.log("\n── 3 · CLOSED (live-confirmed archived + amendments complete) ⇒ NO_BID + temporalClosed ──");
{
  const d = deriveVerdict(withTemporal({ fetched: true, active: false, responseDeadline: "2026-07-15T10:00:00-04:00" }, true));
  assert(d.verdict === "NO_BID", `live archived ⇒ NO_BID (got ${d.verdict})`);
  assert(d.temporalClosed === true, "temporalClosed set for the distinct recompete-watch render");
  assert(d.eligible === null, "CLOSED is a temporal fact, not an ineligibility claim (eligible=null)");
}

console.log("\n── 4 · CLOSED via live-active + live deadline PAST ⇒ NO_BID ──");
{
  const d = deriveVerdict(withTemporal({ fetched: true, active: true, responseDeadline: "2026-07-15T10:00:00-04:00" }, true));
  assert(d.verdict === "NO_BID" && d.temporalClosed === true, `live-active past-deadline ⇒ NO_BID(closed) (got ${d.verdict})`);
}

console.log("\n── 5 · UNREAD AMENDMENT (live says archived but ingested set incomplete) ⇒ INCOMPLETE, never NO_BID ──");
{
  const d = deriveVerdict(withTemporal({ fetched: true, active: false }, false));      // amendments incomplete
  assert(d.verdict === "INCOMPLETE", `unread amendment ⇒ INCOMPLETE (got ${d.verdict})`);
  assert(!d.temporalClosed, "amendments are supremacy docs — cannot certify closed on a partial set");
}

console.log("\n── 6 · EXTENDED sol: stale snapshot-past BUT live-active future deadline ⇒ committal passes through (OPEN) ──");
{
  const d = deriveVerdict(withTemporal({ fetched: true, active: true, responseDeadline: "2026-08-15T10:00:00-04:00" }, true));
  assert(d.verdict === baseline.verdict, `live-open extension ⇒ no temporal block, baseline verdict (got ${d.verdict})`);
  assert(!d.temporalClosed, "an open (extended) sol is never temporalClosed");
}

console.log("\n── 7 · OPEN snapshot + live-active ⇒ committal passes through ──");
{
  const d = deriveVerdict(withTemporal({ fetched: true, active: true, responseDeadline: "2026-07-30T14:00:00-04:00" }, true, snapOpen));
  assert(d.verdict === baseline.verdict, `open sol ⇒ baseline verdict (got ${d.verdict})`);
}

console.log("\n── 8 · missing today/snapshot ⇒ no temporal reasoning even with flag ON (byte-identical) ──");
{
  const d = deriveVerdict({ findings: [cleanish()], ...base, liveSam: { fetched: true, active: false }, ingestedAmendmentComplete: true });
  assert(d.verdict === baseline.verdict, `no snapshot/today ⇒ unchanged (got ${d.verdict})`);
}

delete process.env.AUDIT_TEMPORAL_VERDICT;
console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`} — deriveVerdict × temporal integration`);
if (failures) process.exit(1);

// ── ULTRA B2 · FINDING F1 REGRESSION BANK (Brain RULING 4, 2026-07-22) ──────────────────────────────────────
// SAM v2 `responseDeadLine` is ALWAYS `YYYY-MM-DDTHH:MM:SS±HH:MM`. `parseSolicitationDate` returns null on that
// form, so the live-past-deadline CLOSED branch was DEAD CODE in production — a never-amended sol in the
// deadline→archive window read OPEN → committal BID on a CLOSED solicitation. Every fixture below uses the REAL
// SAM datetime form per the ratified FIXTURE DOCTRINE (no hand-written date-only deadlines — a format SAM never
// emits, and the reason a fully-green battery stayed blind to this).
console.log("\n── F1 regression bank (SAM-format datetimes, instants only) ──");
{
  const { deriveTemporalDisposition, parseSolicitationInstant } = require("./audit-temporal");
  const snap = (dl: string) => ({ today: "2026-07-22", responseDeadline: dl, responseDeadlinePast: null,
    mandatoryEventDates: [], mandatoryEventPast: null, latestFutureDeadline: null, daysToResponse: null });
  const D = (dl: string, now: string | null, amendComplete = true, active: boolean | null = true) =>
    deriveTemporalDisposition(snap(dl), { fetched: true, active, responseDeadline: dl, amendmentCount: 0 },
      amendComplete, (now ?? "2026-07-22").slice(0, 10), now);

  assert(parseSolicitationInstant("2026-07-15T10:00:00-04:00") !== null, "F1: real SAM offset datetime parses to an instant");
  assert(parseSolicitationInstant("2026-07-15") === null, "F1: date-only is NOT an instant (the moment is unknowable)");
  assert(parseSolicitationInstant("2026-07-15T10:00:00") === null, "F1: zone-less datetime is NOT an instant (never guess a zone)");

  assert(D("2026-07-15T10:00:00-04:00", "2026-07-22T12:00:00Z").kind === "CLOSED",
    "F1: SAM-format deadline 7d past + live active → CLOSED (this branch was dead in production)");
  assert(D("2026-08-15T10:00:00-04:00", "2026-07-22T12:00:00Z").kind === "OPEN",
    "F1: future SAM-format deadline → OPEN");

  // The tz off-by-one FALSE-CLOSED a naive date-only fix would have armed. `today` is the UTC date, so on these
  // inputs a date-vs-date compare reads deadline-date < today and returns CLOSED while the sol is still OPEN.
  assert(D("2026-07-22T22:00:00-04:00", "2026-07-23T01:00:00Z").kind === "OPEN",
    "F1/tz: 10 PM EDT deadline w/ UTC already next day → OPEN (date-compare would FALSE-CLOSE)");
  assert(D("2026-07-22T15:00:00-10:00", "2026-07-23T00:30:00Z").kind === "OPEN",
    "F1/tz: 3 PM HST deadline 30min away, UTC rolled → OPEN");
  assert(D("2026-07-22T15:00:00-10:00", "2026-07-23T01:30:00Z").kind === "CLOSED",
    "F1/tz: …30min AFTER that same HST deadline → CLOSED (guard is not one-directional)");
  assert(D("2026-07-22T23:59:59-04:00", "2026-07-23T03:59:58Z").kind === "OPEN", "F1: 1s before deadline → OPEN");
  assert(D("2026-07-22T23:59:59-04:00", "2026-07-23T04:00:01Z").kind === "CLOSED", "F1: 1s after deadline → CLOSED");

  // Conservatism preserved: no instant on either side ⇒ never CLOSED.
  assert(D("2026-07-15", "2026-07-22T12:00:00Z").kind === "OPEN", "F1: date-only deadline → OPEN, never CLOSED");
  assert(D("2026-07-15T10:00:00-04:00", null).kind === "OPEN", "F1: nowIso absent → OPEN (nothing to compare)");
  assert(D("2026-07-15T10:00:00-04:00", "2026-07-22T12:00:00Z", false).kind === "INDETERMINATE",
    "F1: unread amendments still dominate a past deadline");
  assert(D("2026-07-15T10:00:00-04:00", "2026-07-22T12:00:00Z", true, null).kind === "INDETERMINATE",
    "F1: unknown active still INDETERMINATE");
}
