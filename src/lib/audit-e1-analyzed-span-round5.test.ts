// ARC #747 · E1 — ROUND-5 ANALYZED-SPAN SITES.
// Run: npx tsx src/lib/audit-e1-analyzed-span-round5.test.ts
//
// /code-review high round 5 on PR #292, findings #1 and #4. Both are the L45 class — a value improved for the
// READER silently changing what counts as EXAMINED — arriving at two sites the earlier sweep missed.
// [[feedback_display_span_vs_analyzed_span]]
//
// #1 · MASTHEAD. `bodyDeniesSetAside` regexed the DISPLAY excerpt while its three siblings in the same file
//      were converted. It asks "did the body deny the set-aside?" and then OVERRIDES a SAM-sourced masthead
//      fact with the answer, so it has the largest blast radius of the four. A head-widened pricing excerpt
//      that swallows a neighbouring "…no socioeconomic set-aside applies…" line flips the customer's
//      Set-aside fact to "None confirmed" on the strength of text no lens ever read.
//
// #4 · COVERAGE. The TAIL repair pass widens an excerpt too, and unlike the head pass it runs PRE-verdict —
//      so it is the pass that can actually reach the coverage proof. It recorded no pre-repair span, which
//      made `analyzedExcerptOf` return the WIDENED text and turned the guard at `completenessOf` ("the one
//      place widening can manufacture coverage") into a no-op for exactly the findings that can trip it.
export {};
process.env.AUDIT_SETASIDE_HEADER_RECONCILE = "true";
import { buildV3Payload } from "./audit-v3-report";
import { buildV4Data } from "./v4-report/build-data";
import { repairClippedExcerpts, analyzedExcerptOf } from "./audit-excerpt-repair";
import type { Decision } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// ── #1 · THE MASTHEAD ───────────────────────────────────────────────────────────────────────────────
// The real shape: the source line wraps, so the clause the pricing finding quotes is preceded on the same
// line by the set-aside sentence. Widening the head to the clause start legitimately swallows it — the
// classification guard sees no change, because the finding is still a pricing obligation either way.
const ANALYZED = "offerors shall submit unit prices for each line item.";
const WIDENED = "This order is placed against the parent IDIQ where no socioeconomic set-aside applies; " + ANALYZED;

const decision = { verdict: "BID_WITH_CAUTION", eligible: true, reason: "r", dispositions: [], showStoppers: [] } as unknown as Decision;
const coverage = { required: [], covered: [], missing: [], coreMissing: [] };

const mastheadSetAside = (excerpt: string, preReground?: string) => {
  const f = {
    requirement: "Submit unit prices for each line item.", citation: "Section B",
    excerpt, kind: "pricing", controllability: "bidder_controls", severity: "P1" as const,
    ...(preReground ? { excerptPreReground: preReground } : {}),
  };
  const d = buildV4Data({
    compliance_json: { v3: buildV3Payload(decision, coverage, [f] as never, "2026-07-27T00:00:00Z"), engine: "agentic_v3" },
    set_aside: "Total Small Business Set-Aside",
  } as never);
  return (d.masthead?.facts ?? []).find((x: { k: string }) => x.k === "Set-aside");
};

{
  const fact = mastheadSetAside(WIDENED, ANALYZED);
  check("#1 · a widened quote does NOT flip the masthead — the SAM value stands",
    fact?.v === "Total Small Business Set-Aside", JSON.stringify(fact));
}
{
  // FALSIFICATION PROBE — the defect, reproduced. Without the analyzed span the predicate reads the widened
  // text and overrides the customer's Set-aside fact. If this ever stops flipping, the fixture no longer
  // reaches the predicate and the assertion above proves nothing.
  const fact = mastheadSetAside(WIDENED);
  check("#1 PROBE · WITHOUT the analyzed span the masthead DOES flip (the defect)",
    fact?.v === "None confirmed", JSON.stringify(fact));
}
{
  // And the predicate must still fire when the ANALYSIS genuinely found the denial — the fix must not just
  // disable it. Here the analyzed span itself carries the denial.
  const fact = mastheadSetAside(WIDENED, WIDENED);
  check("#1 · a genuinely-analyzed denial STILL overrides the masthead",
    fact?.v === "None confirmed", JSON.stringify(fact));
}

// ── #4 · THE TAIL PASS ──────────────────────────────────────────────────────────────────────────────
// `isTruncatedExcerpt` fires on a dangling function word with no terminator — the max_tokens clip shape.
const SOURCE = "Wage rates are set by the applicable Davis-Bacon determination for the county specified for this project. "
  + "Appendix C lists CSI division 09 finishes required under the base scope.";
const CLIPPED = "Wage rates are set by the applicable Davis-Bacon determination for the county specified for";

{
  const f = { id: "t#0", lens: "pricing_analyst", requirement: "r", citation: "c", excerpt: CLIPPED,
    kind: "pricing", controllability: "bidder_controls", grounded: true } as TypedFinding;
  const res = repairClippedExcerpts([f], SOURCE) as { repaired: number };

  check("#4 PROBE · the tail pass actually repaired this excerpt (else the test is inert)",
    res.repaired === 1 && f.excerpt !== CLIPPED, `repaired=${res.repaired} excerpt=${JSON.stringify(f.excerpt)}`);
  check("#4 · the pre-repair span is recorded",
    f.excerptPreReground === CLIPPED, JSON.stringify(f.excerptPreReground));
  check("#4 · analyzedExcerptOf returns what was EXAMINED, not what was widened to",
    analyzedExcerptOf(f) === CLIPPED, JSON.stringify(analyzedExcerptOf(f)));
  check("#4 · and the widened span is still what the reader sees",
    (f.excerpt ?? "").startsWith(CLIPPED) && f.excerpt !== CLIPPED, JSON.stringify(f.excerpt));
}
{
  // An UNtouched finding must be unchanged — no stamp, so `analyzedExcerptOf` stays the excerpt itself and
  // every existing caller is byte-identical.
  const clean = { id: "t#1", lens: "pricing_analyst", requirement: "r", citation: "c",
    excerpt: "Appendix C lists CSI division 09 finishes required under the base scope.",
    kind: "pricing", controllability: "bidder_controls", grounded: true } as TypedFinding;
  repairClippedExcerpts([clean], SOURCE);
  check("#4 · an unrepaired finding carries no stamp (byte-identical for every existing caller)",
    clean.excerptPreReground === undefined && analyzedExcerptOf(clean) === clean.excerpt);
}

console.log(failures ? `\n❌ ${failures} failed` : "\n✅ all passed");
process.exit(failures ? 1 : 0);
