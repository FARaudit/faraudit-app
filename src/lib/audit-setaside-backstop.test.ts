// UNIT — deriveSetAsideBackstop (VERDICT ARC move-4, part B; part A retired per Brain card #677).
// Properties under test, all structural rather than lexical:
//   · the backstop fires ONLY off the RULING-3 structured notice union — never off prose in `source`
//   · the cap is BWC by construction and can never reach NHR (ruling 3: NHR-on-set-aside is product-killing)
//   · `requiredAttribute` survives to the hit so a #575 profile can clear it as-declared
//   · suppression is disposition-aware (a boilerplate gate_to_clear NEVER suppresses) and program-keyed first,
//     text-anchored as a generous fallback (failing to suppress is the over-fire; over-suppressing is safe)
//   · the retired part-A prose specimens fire NOTHING — the retirement is honest, with no residue
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { deriveSetAsideBackstop } from "./audit-setaside-backstop";
import { disposeFinding } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const f = (over: Partial<TypedFinding>): TypedFinding => ({
  requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, lens: "test", ...over,
});
type Notice = { excerpt: string; requirement: string; requiredAttribute?: string };
const disp = (findings: TypedFinding[]) => findings.map((x) => ({ f: x, disposition: disposeFinding(x) }));
const fire = (notices: Notice[], findings: TypedFinding[] = []) => deriveSetAsideBackstop(disp(findings), notices);

const TOTAL_SB: Notice = {
  excerpt: "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020)",
  requirement: "Set-aside applies", requiredAttribute: "sb:total",
};
const HUBZONE: Notice = {
  excerpt: "52.219-3 Notice of HUBZone Set-Aside (OCT 2022)",
  requirement: "Set-aside applies", requiredAttribute: "se:hubzone",
};

// ── 1. FIRES on a structured notice, at the BWC cap, carrying the attribute ─────────────────────────────────
{
  const d = fire([TOTAL_SB]);
  assert(!!d && d.cap === "BID_WITH_CAUTION", `set-aside notice → FIRES at cap BWC (got ${d ? d.cap : "null"})`);
  assert(!!d && d.hits.length === 1 && d.hits[0].cls === "set_aside" && d.hits[0].requiredAttribute === "sb:total",
    "hit carries cls=set_aside and requiredAttribute (so a #575 profile can clear it as-declared)");
  assert(!!d && /At minimum, confirm/.test(d.reason),
    "reason reads as a MINIMUM to confirm, never as an exhaustive inventory (contracts amendment A5)");
}

// ── 2. Nothing to fire on ───────────────────────────────────────────────────────────────────────────────────
assert(fire([]) === null, "no notices → null");
assert(fire([{ excerpt: "", requirement: "", requiredAttribute: "sb:total" }]) === null,
  "a notice with no anchor text at all → skipped (never a hit with an empty sentence)");

// ── 3. SAM-metadata-only path (no document excerpt exists by construction — BRK-10) ─────────────────────────
{
  const samOnly: Notice = { excerpt: "", requirement: "SAM records this solicitation as a total small business set-aside.", requiredAttribute: "sb:total" };
  const d = fire([samOnly]);
  assert(!!d && d.hits[0].sentence === samOnly.requirement,
    "SAM-metadata notice with no excerpt → anchors on `requirement` (names the source rather than quoting a doc)");
}

// ── 4. DE-DUP (BRK-14) — two DIFFERENT programs must not collapse, identical ones must ──────────────────────
{
  const d = fire([TOTAL_SB, HUBZONE]);
  assert(!!d && d.hits.length === 2, `two distinct programs → two hits (got ${d ? d.hits.length : 0})`);
}
{
  const d = fire([TOTAL_SB, { ...TOTAL_SB, excerpt: "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020)" }]);
  assert(!!d && d.hits.length === 1, `the same program twice → one hit (got ${d ? d.hits.length : 0})`);
}
{ // attr-less notices de-dup on anchor text, not on `undefined === undefined`
  const a: Notice = { excerpt: "This acquisition is set aside for small business.", requirement: "x" };
  const b: Notice = { excerpt: "Award is set aside for HUBZone small business concerns.", requirement: "y" };
  const d = fire([a, b]);
  assert(!!d && d.hits.length === 2, `two attr-less notices with different anchors → two hits (got ${d ? d.hits.length : 0})`);
}

// ── 5. SUPPRESSION — disposition-aware ──────────────────────────────────────────────────────────────────────
{ // a boilerplateTrapSweep-style grounding: bidder_controls → gate_to_clear → MUST NOT suppress, else the sweep
  //   (which manufactures a same-class finding on mere mention) silences the backstop on the very packages it serves.
  const boiler = f({ requirement: "Total small business set-aside", excerpt: TOTAL_SB.excerpt, citation: "52.219-6", controllability: "bidder_controls", curableInWindow: true });
  assert(disposeFinding(boiler) === "gate_to_clear" && fire([TOTAL_SB], [boiler]) !== null,
    "boilerplate gate_to_clear set-aside grounding → does NOT suppress (fires anyway)");
}
{ // a HANDLED (met) grounding naming the SAME program → suppresses.
  const met = f({ requirement: "Total small business set-aside — firm qualifies", excerpt: TOTAL_SB.excerpt, citation: "52.219-6", controllability: "already_satisfied", requiredAttribute: "sb:total" });
  const d = deriveSetAsideBackstop([{ f: met, disposition: "met", setAsideProgram: "sb:total" }], [TOTAL_SB]);
  assert(d === null, "handled ('met') finding naming the same program → SUPPRESSES (proven in pool)");
}
{ // a HANDLED (disqualifying) grounding → suppresses (the ladder already escalated it).
  const dq = f({ requirement: "HUBZone set-aside bar", excerpt: HUBZONE.excerpt, citation: "52.219-3", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "se:hubzone" });
  const d = deriveSetAsideBackstop([{ f: dq, disposition: "disqualifying", setAsideProgram: "se:hubzone" }], [HUBZONE]);
  assert(d === null, "handled ('disqualifying') finding naming the same program → SUPPRESSES (ladder owns it)");
}
{ // PROGRAM IDENTITY, not text overlap (BRK-5): the lens grounds §L prose, the detector keys the matrix row —
  //   two textual homes that never share a word-run.
  const metProse = f({
    requirement: "100 percent set aside for small business",
    excerpt: "This acquisition is 100 percent set aside for small business concerns under NAICS 541519.",
    citation: "L.2", controllability: "already_satisfied", requiredAttribute: "sb:total",
  });
  const d = deriveSetAsideBackstop([{ f: metProse, disposition: "met", setAsideProgram: "sb:total" }], [TOTAL_SB]);
  assert(d === null, "BRK-5: §L prose grounding suppresses the clause-matrix notice via PROGRAM identity (no shared word-run)");
}
{ // a handled finding for a DIFFERENT program must not suppress this one.
  const metOther = f({ requirement: "HUBZone set-aside — firm qualifies", excerpt: HUBZONE.excerpt, citation: "52.219-3", controllability: "already_satisfied", requiredAttribute: "se:hubzone" });
  const d = deriveSetAsideBackstop([{ f: metOther, disposition: "met", setAsideProgram: "se:hubzone" }], [TOTAL_SB]);
  assert(!!d && d.hits.length === 1 && d.hits[0].requiredAttribute === "sb:total",
    "a handled finding for a DIFFERENT program does NOT suppress this pool");
}
{ // BRK-12 — suppression must survive an ABBREVIATED excerpt when no program key is available on either side.
  const met = f({ requirement: "Total small business set-aside", excerpt: "Notice of Total Small Business Set-Aside", citation: "52.219-6", controllability: "already_satisfied" });
  const notice: Notice = { excerpt: "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020)", requirement: "Set-aside applies" };
  assert(deriveSetAsideBackstop([{ f: met, disposition: "met" }], [notice]) === null,
    "BRK-12: abbreviated excerpt over a met pool still suppresses via the text-anchor fallback");
}
{ // a finding that says nothing about set-asides can never suppress, however it was disposed.
  const unrelated = f({ requirement: "Price all CLINs per the schedule.", excerpt: "Price all CLINs.", citation: "B.1", controllability: "already_satisfied" });
  assert(deriveSetAsideBackstop([{ f: unrelated, disposition: "met", setAsideProgram: null }], [TOTAL_SB]) !== null,
    "an unrelated 'met' finding does NOT suppress the set-aside notice");
}

// ── 6. RETIREMENT IS HONEST — every part-A prose specimen fires NOTHING (no residue) ────────────────────────
// These are the flagship TRUE bars part A used to fire on. They are now owned by the veto / ledger / lenses /
// #575, and this unit must be structurally incapable of seeing them: it takes no `source` argument at all.
const GRAVEYARD_TRUE_BARS = [
  "Award is restricted to firms possessing a TOP SECRET facility clearance at the time of proposal submission.",
  "Award is limited to holders of the SeaPort-NxG multiple-award contract (MAC).",
  "To be eligible for award, offerors must hold a CMMC Level 2 certification at time of award.",
  "To be eligible, the offeror must hold a valid FAA airworthiness repair station certificate at time of offer.",
  "Only firms holding a current GSA Schedule contract are eligible for award.",
];
{
  const anyFired = GRAVEYARD_TRUE_BARS.some((s) =>
    // the ONLY way prose could reach this unit is as a notice anchor, which the caller never does for these
    fire([], [f({ requirement: s, excerpt: s, controllability: "bidder_cannot_move" })]) !== null);
  assert(!anyFired, "part-A prose specimens fire nothing — part A is deleted, not shadowed (ceo/GRAVEYARD-HARDBAR-PART-A.md)");
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS");
if (failures) process.exit(1);
