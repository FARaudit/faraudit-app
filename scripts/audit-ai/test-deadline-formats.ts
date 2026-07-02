// $0 gate for Brain card 219 — deadline detector widening (format set v1).
//   npx tsx scripts/audit-ai/test-deadline-formats.ts
//
// One positive per FORMAT CLASS + NEGATIVE tests. A quote deadline needs a LABEL + a FULL date; clause
// effective-dates ("(Sep 2021)") and delivery dates (no due-label) must NEVER surface as a quote deadline.
import { applyKeyfactDetector, DEADLINE_FORMATS } from "@/lib/audit-keyfact-detector";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else fails.push(l); };
const deadlineOf = (src: string): TypedFinding | undefined =>
  applyKeyfactDetector([], src, { enabled: true }).find((f) => f.kind === "submission" && /deadline/i.test(f.requirement));
const surfaces = (src: string) => { const d = deadlineOf(src); return !!d && src.includes(d.excerpt); };

ok("format-set is versioned (v1)", DEADLINE_FORMATS.version === 1);

// ── POSITIVE: one per format class (all require a deadline label present) ──
ok("MM/DD/YYYY same-line", surfaces("4. Closing Response Date: 6/29/2026, 5:30PM EDT - submit by then."));
ok("DD Mon YYYY (SF-1449 grid, label + date on separate grid lines)",
  surfaces("8. OFFER DUE DATE/\n 7. FOR SOLICITATION            LOCAL TIME\n INFORMATION CALL:   Naomi Larson                          10 Jul 2026\n"));
ok("Month DD, YYYY", surfaces("Offer Due Date: July 10, 2026 at 3:00 PM local time."));
ok("DD Mon YYYY same-line labelled", surfaces("Response Due Date: 15 Aug 2026, 2:00 PM."));

// ── NEGATIVE: must NOT surface a quote deadline ──
ok("clause effective-date (Sep 2021) is NOT a deadline", !deadlineOf("(30) 52.219-33, Nonmanufacturer Rule (Sep 2021) applies to this order."));
ok("clause effective-date (Nov 2023) is NOT a deadline", !deadlineOf("52.212-4 Contract Terms and Conditions (Nov 2023)."));
ok("delivery date (no due-label) is NOT a quote deadline", !deadlineOf("Delivery date: 15 Aug 2026. FOB Destination, 30 days ARO."));
ok("a bare date with no deadline label is NOT surfaced", !deadlineOf("The contract was signed 10 Jul 2026 by the KO."));
ok("month+year only with a label is NOT enough (needs a full date)", !deadlineOf("Offer due date: Sep 2021."));

// ── NEGATIVE (code-review card 219): the grid fallback must not grab a COMPETING date near the label ──
ok("grid: delivery date after an empty OFFER DUE DATE header is NOT the deadline",
  !deadlineOf("8. OFFER DUE DATE/LOCAL TIME: See Section L.\n Items shall be delivered by 07/15/2026 to the depot."));
ok("grid: clause effective date near the header is NOT the deadline",
  !deadlineOf("OFFER DUE DATE/LOCAL TIME\n This order is effective 08/13/2026 and contractors must comply."));
ok("Q&A 'Question Response Due Date' is NOT the quote deadline",
  !deadlineOf("Question Response Due Date: 06/20/2026. Direct questions to the KO."));
ok("real offer-due-date still wins alongside a Q&A line",
  surfaces("Question Response Due Date: 06/20/2026.\n Offer Due Date: 06/29/2026, 5:00 PM EDT."));
ok("'Offeror … due' prose does NOT over-match", !deadlineOf("Offeror acceptance is due 09/30/2026 for option pricing."));

console.log(`deadline-formats gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — MM/DD/YYYY · DD Mon YYYY (grid) · Month DD, YYYY surface on a labelled deadline; clause effective-dates + delivery dates never do; format-set frozen v1.");
