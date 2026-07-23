// VERDICT ARC — temporal primitive + panel-mandated disposition ($0 suite). Run: npx tsx src/lib/audit-temporal.test.ts
import { parseSolicitationDate, daysBetween, classifyTemporal, deriveTemporalDisposition, type TemporalSignal } from "./audit-temporal";

let fail = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const TODAY = "2026-07-22"; // the differential's reference date

// ── parseSolicitationDate ──
assert(parseSolicitationDate("2026-07-30") === "2026-07-30", "parses ISO");
assert(parseSolicitationDate("07/08/2026") === "2026-07-08", "parses US m/d/yyyy");
assert(parseSolicitationDate("7/8/26") === "2026-07-08", "parses m/d/yy");
assert(parseSolicitationDate("June 11, 2026") === "2026-06-11", "parses Month D, YYYY");
assert(parseSolicitationDate("") === null && parseSolicitationDate("upon award") === null, "FAIL-SAFE: empty/prose → null");
assert(parseSolicitationDate("2026-02-30") === null, "FAIL-SAFE: calendar overflow (Feb 30) rejected");

// ── daysBetween ──
assert(daysBetween(TODAY, "2026-07-07") === -15, "negative = past");
assert(daysBetween(TODAY, "2026-07-30") === 8, "positive = future");
assert(daysBetween(TODAY, "whenever") === null, "null on unparseable");

// ── classifyTemporal (differential's real cases) ──
assert(classifyTemporal([{ date: "2026-07-07", label: "RESPONSE DATE" }], TODAY).responseDeadlinePast === true, "36C25626Q0947: July 7 → CLOSED (past)");
assert(classifyTemporal([{ date: "2026-07-30", label: "RESPONSE DATE" }], TODAY).responseDeadlinePast === false, "FA303: July 30 → OPEN");
{
  const t = classifyTemporal([{ date: "2026-06-16", label: "RESPONSE DATE" }, { date: "2026-07-30", label: "RESPONSE DATE" }], TODAY);
  assert(t.responseDeadline === "2026-07-30" && t.responseDeadlinePast === false, "amendment supersession: LATEST response date governs (not stale June 16)");
}
assert(classifyTemporal([{ date: "2026-05-28", label: "Mandatory Initial Site Visit" }, { date: "2026-07-08", label: "RESPONSE DATE" }], TODAY).mandatoryEventPast === true, "FA8137: mandatory site visit May 28 is PAST");
assert(classifyTemporal([{ date: "upon award", label: "RESPONSE DATE" }], TODAY).responseDeadlinePast === null, "FAIL-SAFE: unparseable dates → null, never a false 'past'");
assert(classifyTemporal([], TODAY).responseDeadlinePast === null, "empty deadlines → null");

// ── deriveTemporalDisposition (panel-mandated safety, card #668) ──
const snapClosed: TemporalSignal = classifyTemporal([{ date: "2026-07-15", label: "RESPONSE DATE" }], TODAY); // snapshot says PAST
const snapOpen: TemporalSignal = classifyTemporal([{ date: "2026-07-30", label: "RESPONSE DATE" }], TODAY);
assert(snapClosed.responseDeadlinePast === true, "(precondition) snapshot WOULD have said closed");
assert(deriveTemporalDisposition(snapClosed, null, true, TODAY).kind === "INDETERMINATE", "CORE FIX: snapshot-closed + NO live → INDETERMINATE (never CLOSED — the silently-fatal false-CLOSED guard)");
assert(deriveTemporalDisposition(snapClosed, { fetched: false, active: null }, true, TODAY).kind === "INDETERMINATE", "live fetch FAILED → INDETERMINATE, never CLOSED");
assert(deriveTemporalDisposition(snapClosed, { fetched: true, active: false }, false, TODAY).kind === "INDETERMINATE", "UNREAD AMENDMENT → INDETERMINATE even if live says archived (amendments are supremacy docs)");
{
  const d = deriveTemporalDisposition(snapClosed, { fetched: true, active: false, responseDeadline: "2026-07-15" }, true, TODAY);
  assert(d.kind === "CLOSED" && (d as any).evidence.includes("active=false"), "live ARCHIVED + amendments complete → CLOSED (the only NO_BID-closed path)");
}
// FIXTURE DOCTRINE (Brain RULING 4 / ULTRA B2 F1): branch 4 compares INSTANTS ONLY. A date-only deadline is not
// an instant, so it can NEVER produce CLOSED — a date comparison would arm a tz off-by-one FALSE-CLOSED, which is
// silently fatal. This fixture asserted CLOSED from the date-only string "2026-07-15" and was therefore stale
// against the ratified contract (the sibling fixture was upgraded with the F1 fix; this one was missed).
assert(deriveTemporalDisposition(snapClosed, { fetched: true, active: true, responseDeadline: "2026-07-15" }, true, TODAY).kind === "OPEN",
  "F1 GUARD: live ACTIVE + DATE-ONLY live deadline → OPEN, never CLOSED (no unambiguous instant to compare)");
assert(deriveTemporalDisposition(snapClosed, { fetched: true, active: true, responseDeadline: "2026-07-15T17:00:00-04:00" }, true, TODAY, "2026-07-22T12:00:00-04:00").kind === "CLOSED",
  "live ACTIVE + live deadline INSTANT past (both sides zoned) → CLOSED");
assert(deriveTemporalDisposition(snapClosed, { fetched: true, active: true, responseDeadline: "2026-07-15T17:00:00-04:00" }, true, TODAY).kind === "OPEN",
  "F1 GUARD: past deadline instant but NO verdict-time instant → OPEN (never guesses a 'now')");
assert(deriveTemporalDisposition(snapClosed, { fetched: true, active: true, responseDeadline: "2026-08-15" }, true, TODAY).kind === "OPEN", "EXTENDED sol: stale snapshot past BUT live-active future deadline → OPEN");
assert(deriveTemporalDisposition(snapOpen, { fetched: true, active: true, responseDeadline: TODAY }, true, TODAY).kind === "OPEN", "same-day deadline → OPEN (datetime-granularity guard)");
assert(deriveTemporalDisposition(snapClosed, { fetched: true, active: null }, true, TODAY).kind === "INDETERMINATE", "live active UNKNOWN + no decisive signal → INDETERMINATE");

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : `❌ ${fail} FAILED`} — Verdict Arc temporal (primitive + panel-mandated disposition)`);
process.exit(fail === 0 ? 0 : 1);
