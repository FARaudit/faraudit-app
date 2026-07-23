// NAMED DEFECT FIX (Brain step-4 ruling item 2; found by the red-team seat, card #682) —
// `importanceOf` returned "boilerplate" on a sentence carrying an eligibility-BAR signal: a live
// fail-toward-disqualifier violation on the shipped engine, INDEPENDENT of veto retirement.
// Flag `AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD`, default-OFF (verdict-path ⇒ CEO-click arm).
//
// DIRECTION OF RISK: this fix ADDS escalation, so the danger is OVER-fire / crying-wolf — the opposite of the
// retirement work. Section 3 is therefore the load-bearing half: ordinary boilerplate must be UNMOVED.
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { importanceOf, hasBarSignal } from "./audit-gate-v2";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD;
  process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD = on ? "true" : "false";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD; else process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD = prev; }
};

// ── 1. THE DEFECT — a boilerplate-shaped sentence that CARRIES a bar signal ─────────────────────────────────
const BAR_BEARING = [
  "Offerors shall submit a copy of their current FAA Part 145 Repair Station Certificate with their quotation.",
  "The offeror shall submit evidence that it must possess an active facility clearance at the time of proposal submission.",
];
for (const ob of BAR_BEARING) {
  if (!hasBarSignal(ob)) { console.log(`⏭  (specimen carries no bar signal under the current flag set; skipped) "${ob.slice(0, 60)}"`); continue; }
  const off = withFlag(false, () => importanceOf(ob));
  const on = withFlag(true, () => importanceOf(ob));
  assert(off === "boilerplate", `flag-OFF reproduces the defect: bar-signal-positive sentence released as boilerplate (got ${off})`);
  assert(on === "ambiguous", `flag-ON routes it to "ambiguous" — the pole that escalates a bar-signal-positive obligation (got ${on})`);
  assert(on !== "boilerplate", "flag-ON: never a full release off the escalation path");
}

// ── 2. FAIL-TOWARD-DISQUALIFIER IS PRESERVED, NOT WIDENED ───────────────────────────────────────────────────
// The fix must not turn bar-signal-positive prose into a *disqualifier* — that would be manufacturing a bar.
// "ambiguous" is the correct landing: the ratified ambiguous+bar-signal-POSITIVE semantics escalate it, while
// ambiguous+bar-signal-NEGATIVE demotes to the coverage signal. The fix only stops the premature release.
for (const ob of BAR_BEARING) {
  if (!hasBarSignal(ob)) continue;
  assert(withFlag(true, () => importanceOf(ob)) !== "disqualifier",
    "flag-ON does NOT promote to 'disqualifier' — it hands to the ambiguous pole (no bar is manufactured)");
}

// ── 3. NO OVER-FIRE — ordinary boilerplate is UNMOVED in both flag states (the load-bearing half) ───────────
const ORDINARY_BOILERPLATE = [
  "Offerors shall submit one original and two copies of the proposal.",
  "The offeror shall submit its proposal in Times New Roman 12-point font.",
  "Proposals shall be submitted electronically through the portal.",
  "The offeror shall provide a point of contact for technical questions.",
  "Page limits shall not exceed 30 pages for the technical volume.",
];
for (const ob of ORDINARY_BOILERPLATE) {
  const off = withFlag(false, () => importanceOf(ob));
  const on = withFlag(true, () => importanceOf(ob));
  assert(off === on, `UNMOVED both states: "${ob.slice(0, 52)}…" (off=${off} on=${on})`);
}

// ── 4. THE #587b BOND-PAPER CARVE-OUT MUST SURVIVE (the named over-fire trap for THIS fix) ──────────────────
// The guard calls `hasBarSignal`, not raw BAR_SIGNAL_RE, precisely so a §L format instruction naming "bond
// paper" (a PAPER STOCK colliding with the surety-`bond` token) cannot be re-classified as bar-bearing.
{
  const ob = "The offeror shall submit the bid schedule on SF-1444 or bond paper.";
  const prevBond = process.env.AUDIT_BOND_PAPER_NONBAR;
  process.env.AUDIT_BOND_PAPER_NONBAR = "true";
  try {
    const on = withFlag(true, () => importanceOf(ob));
    assert(on === "boilerplate",
      `#587b bond-paper carve-out holds under the new guard — a paper-stock format instruction stays boilerplate (got ${on})`);
  } finally { if (prevBond === undefined) delete process.env.AUDIT_BOND_PAPER_NONBAR; else process.env.AUDIT_BOND_PAPER_NONBAR = prevBond; }
}

// ── 5. FLAG-OFF BYTE-IDENTITY over a broad sweep (nothing moves unless the flag is on) ──────────────────────
{
  const ALL = [...BAR_BEARING, ...ORDINARY_BOILERPLATE,
    "The Contractor shall comply with FAR 52.219-14 during performance of this contract.",
    "An Offeror is required to be registered in SAM when submitting an offer or quotation.",
    "Award is restricted to firms possessing a TOP SECRET facility clearance at the time of proposal submission.",
  ];
  const baseline = ALL.map((ob) => withFlag(false, () => importanceOf(ob)));
  const again = ALL.map((ob) => withFlag(false, () => importanceOf(ob)));
  assert(JSON.stringify(baseline) === JSON.stringify(again), "flag-OFF is deterministic and unchanged across the sweep");
  const anyMoved = ALL.some((ob, i) => withFlag(true, () => importanceOf(ob)) !== baseline[i]);
  assert(anyMoved, "flag-ON moves at least one specimen — the fix is real, not a no-op");
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS — boilerplate/bar-signal guard (named defect, Brain step-4 item 2)");
if (failures) process.exit(1);
