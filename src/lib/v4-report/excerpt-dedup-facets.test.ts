// REPORT-LAYER EXCERPT DEDUP — the merged row must keep every obligation, not just the first one.
// Run: npx tsx src/lib/v4-report/excerpt-dedup-facets.test.ts
//
// `dedupeByExcerpt` collapses two findings that quote the same source span. It always merged their
// CITATIONS; it silently discarded the loser's REQUIREMENT. So when two lenses quoted one §L schedule span —
// one stating the page limit, the other the submission portal — the report shipped the page limit alone and
// the second obligation was gone with no trace. Measured on banked run records: 13 of 40 contained at least
// one merge whose discarded requirement differed.
//
// The engine's applyFindingDedup has always preserved every facet with " · ". This is the report layer
// catching up to it.
export {};
import { dedupeByExcerpt } from "./build-data";

let failures = 0;
const assert = (c: boolean, m: string, extra?: string) => {
  console.log(`${c ? "✅" : "❌"} ${m}${!c && extra ? `\n     ${extra}` : ""}`);
  if (!c) failures++;
};

const SPAN = "Volume I shall not exceed 30 pages and shall be submitted through the DoD SAFE portal no later than the time specified.";
const F = (req: string, cite: string, excerpt = SPAN) => ({ req, cite, excerpt });

// THE DEFECT — same span, different obligations.
{
  const out = dedupeByExcerpt([
    F("Volume I is limited to 30 pages", "§L-4.1"),
    F("Volume I must be submitted through the DoD SAFE portal", "§L-4.2"),
  ]);
  assert(out.length === 1, "one span → one row (the merge itself is unchanged)");
  assert(/30 pages/.test(out[0].req), "the surviving obligation is kept");
  assert(/DoD SAFE portal/.test(out[0].req), "the SECOND obligation is no longer dropped", `got: ${out[0].req}`);
  assert(out[0].cite === "§L-4.1 · §L-4.2", "citations still merge exactly as before");
}

// Identical restatements must NOT produce a doubled row — this is a dedup, not a concatenator.
{
  const out = dedupeByExcerpt([
    F("Volume I is limited to 30 pages", "§L-4.1"),
    F("volume i is limited to 30 pages", "§L-4.1"),
  ]);
  assert(out.length === 1 && out[0].req === "Volume I is limited to 30 pages",
    "a case-different restatement adds nothing", `got: ${out[0].req}`);
}

// Distinct spans are untouched — the fix must not widen what merges.
{
  const out = dedupeByExcerpt([
    F("Volume I is limited to 30 pages", "§L-4.1"),
    F("Volume II shall contain the price schedule", "§L-5", "Volume II shall contain the completed price schedule and no technical content whatsoever."),
  ]);
  assert(out.length === 2, "different spans stay separate rows");
}

// A row is a row, not a paragraph: the merge caps, and the overflow is logged rather than silently dropped.
{
  const out = dedupeByExcerpt([
    F("Obligation one", "§L-1"), F("Obligation two", "§L-2"), F("Obligation three", "§L-3"), F("Obligation four", "§L-4"),
  ]);
  assert(out.length === 1, "still one row");
  assert(out[0].req.split(" · ").length === 3, "at most three obligations render in one row", `got: ${out[0].req}`);
  assert(out[0].cite.split(" · ").length === 4, "all four citations are still preserved");
}

// Findings with no excerpt were never a dedup key and still are not.
{
  const out = dedupeByExcerpt([
    { req: "A", cite: "§1", excerpt: "" },
    { req: "B", cite: "§2", excerpt: "" },
  ]);
  assert(out.length === 2, "empty-excerpt findings each keep their own row");
}

// The input list must not be mutated — the report builder reuses these objects.
{
  const src = [F("First obligation", "§L-1"), F("Second obligation", "§L-2")];
  dedupeByExcerpt(src);
  assert(src[0].req === "First obligation", "source finding object is not mutated by the merge");
}

console.log(failures === 0 ? "\nPASS — merged rows keep every obligation\n" : `\nFAIL — ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
