// ── §M ORDER-OF-IMPORTANCE INVARIANT ─────────────────────────────────────────────────────────────
// A renderer heading is a CLAIM ABOUT THE SOURCE. This panel used to make two such claims with no
// conditional behind either: it badged factors[0] "Most important" on array position alone, and titled
// itself "in the Government's stated order of importance" unconditionally. On W50S6U26QA019 that produced
// a ranked ladder of seven over a §M stating exactly two factors "approximately equal in importance" —
// and contradicted its own closing line ("the Government did not publish one, and neither do we") three
// rows below. Rule 64 cannot see this class: every excerpt was real; the fabrication is the FRAME.
//
// The invariant: a label asserting relative importance may only be rendered from what the source says.
// Deterministic, $0, no model call.
import { evalMBody } from "./render";
import type { V4EvalM } from "@/lib/v4-report/render";

let pass = 0, fail = 0;
const t = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`✓ PASS  ${label}`); } else { fail++; console.log(`✗ FAIL  ${label}`); } };

const base = (factors: Array<{ name: string; basis?: string; cite: string; importance?: string }>): V4EvalM =>
  ({ grounded: true, basis: "Best value tradeoff", factors }) as V4EvalM;

const twoEqual = [
  { name: "Price", basis: "Price and past performance are approximately equal in importance", cite: "§M" },
  { name: "Past performance", basis: "Price and past performance are approximately equal in importance", cite: "§M" },
];

// ── 1 · the defect: no stated importance ⇒ no importance claim anywhere ──
{
  const html = evalMBody(base(twoEqual));
  t("no source importance ⇒ the 'stated order of importance' heading is NOT rendered",
    !html.includes("stated order of importance"));
  t("no source importance ⇒ no 'Most important' badge is invented",
    !html.includes("Most important"));
  t("the factors themselves still render (the fix removes the CLAIM, not the content)",
    html.includes("Past performance"));
  t("the panel never both asserts a ranking and disclaims one in the same body",
    !(html.includes("stated order of importance") && html.includes("neither do we")));
}

// ── 2 · the honest case: the source DID state importance ⇒ render exactly what it said ──
{
  const stated = [
    { name: "Technical", basis: "b", cite: "§M", importance: "Most important" },
    { name: "Price", basis: "b", cite: "§M" },
  ];
  const html = evalMBody(base(stated));
  t("source states importance ⇒ the heading may claim an order", html.includes("stated order of importance"));
  t("the badge renders the SOURCE's words, not a computed rank", html.includes("Most important"));
}

// ── 3 · falsifiability — the badge must follow the DATA, never the array position ──
{
  const secondIsMost = [
    { name: "Price", basis: "b", cite: "§M" },
    { name: "Technical", basis: "b", cite: "§M", importance: "Significantly more important" },
  ];
  const html = evalMBody(base(secondIsMost));
  t("importance on factor[1] renders on factor[1]", html.includes("Significantly more important"));
  const firstName = html.indexOf("Price");
  const badge = html.indexOf("Significantly more important");
  t("…and NOT on factor[0] (position must not drive the label)", badge > firstName);
}

console.log(`\n§M order-of-importance invariant: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
