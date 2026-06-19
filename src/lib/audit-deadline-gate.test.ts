// Regression tests for the 2026-06-19 root-cause panel fixes.
// Run: npx tsx src/lib/audit-deadline-gate.test.ts
//
// Locks the two highest-stakes fixes at the building-block level — the exact
// failures the live re-run exposed:
//   RC4 — deadline parsing flipped open↔closed because new Date() returned
//         Invalid Date on real SAM/SF-1449/SF-1442 formats.
//   RC1 — the NO-BID score cap fired on the model's routine "Disqualification"
//         risk CATEGORY text instead of a genuine uncurable named gate, so it
//         must now key off aggregateGateRecommendation (DECLINE iff a gate fires
//         AND all gates are uncurable).
import { normalizeDeadlineString, parseDocDeadline, aggregateGateRecommendation, type DecisionGate } from "./audit-engine";

let pass = 0, fail = 0;
const TODAY = new Date("2026-06-19T12:00:00Z");
const isOpen = (d: Date | null) => d != null && d.getTime() >= TODAY.getTime();
const t = (label: string, got: unknown, expected: unknown) => {
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${JSON.stringify(expected)} · got: ${JSON.stringify(got)}`);
};

console.log("── RC4 · normalizeDeadlineString makes real formats parseable ──");
t("military '06/29/2026 1700 CT' → valid Date", Number.isFinite(new Date(normalizeDeadlineString("06/29/2026 1700 CT")).getTime()), true);
t("'11 June 2026 10:00 AM Arizona Local Time' → valid Date", Number.isFinite(new Date(normalizeDeadlineString("11 June 2026 10:00 AM Arizona Local Time")).getTime()), true);
t("prose '1:00 p.m. Eastern Time on June 16, 2026' → valid Date", Number.isFinite(new Date(normalizeDeadlineString("1:00 p.m. Eastern Time on June 16, 2026")).getTime()), true);

console.log("\n── RC4 · controlling offer-due picks the RIGHT entry (open/closed) ──");
// HM047626: offer-due 6/29 (future) must win over the 5/29 issue date → OPEN.
t("HM047626 → OPEN (not the 5/29 issue date)", isOpen(parseDocDeadline([
  { label: "Offer due", date: "06/29/2026 1700 CT" },
  { label: "Solicitation issue date", date: "05/29/2026" },
  { label: "Period of performance", date: "July 12, 2026 – July 11, 2027" },
])), true);
// FA487726: offer-due 11 June (past) → CLOSED (was false-open: null → SAM-guard).
t("FA487726 → CLOSED (Arizona Local Time parses)", isOpen(parseDocDeadline([
  { label: "RFI/Questions due", date: "25 May 2026 at 5:00 PM Arizona Local Time" },
  { label: "Offer due", date: "11 June 2026 10:00 AM Arizona Local Time" },
])), false);
// 1232SA: amendment-updated June 16 SUPERSEDES the original June 22 → CLOSED.
t("1232SA → CLOSED (amendment June 16 supersedes original June 22)", isOpen(parseDocDeadline([
  { label: "Offer due (Amendment 0001 updated deadline)", date: "1:00 p.m. Eastern Time on June 16, 2026" },
  { label: "Offer due", date: "2026-06-22T12:01:00-04:00" },
])), false);
// An issue/posted date alone must NOT be elected as the offer-due → null (open).
t("issue-date-only pool → null (never elects an issue date)", parseDocDeadline([
  { label: "Solicitation issue date", date: "05/29/2026" },
]), null);

console.log("\n── RC1 · score cap keys off a genuine gate, not category text ──");
const curable = (id: string): DecisionGate => ({ gate_id: id, gate_label: id, status: "OPEN", cure_possible_in_window: true, verification_action: "x" });
const uncurable = (id: string): DecisionGate => ({ gate_id: id, gate_label: id, status: "CLOSED", cure_possible_in_window: false, verification_action: "x" });
// No gate fired (a "Disqualification" risk CATEGORY is NOT a gate) → NOT decline → cap won't fire.
t("no gates → PROCEED_WITH_CAUTION (category text alone never NO-BIDs)", aggregateGateRecommendation([]), "PROCEED_WITH_CAUTION");
// A single uncurable named gate → DECLINE → cap to ≤25 (correct hard NO-BID).
t("one uncurable gate → DECLINE", aggregateGateRecommendation([uncurable("SPRS")]), "DECLINE");
// Mixed (a curable gate present) → CAUTION, NOT decline → score not crushed.
t("curable + uncurable → PROCEED_WITH_CAUTION (not crushed)", aggregateGateRecommendation([curable("SOLE_SOURCE"), uncurable("SPRS")]), "PROCEED_WITH_CAUTION");

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
