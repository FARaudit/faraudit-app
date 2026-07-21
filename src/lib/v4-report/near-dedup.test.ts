// REPORT-LAYER NEAR-DEDUP — card #612-(3b). Collapse a finding whose ENTIRE requirement
// normalizes identically (same obligation restated with a trivial wording difference),
// but NEVER collapse genuinely distinct gates (RN vs LPN vs Psychologist licensure).
// Run: npx tsx src/lib/v4-report/near-dedup.test.ts
import { dedupeNearFindings } from "./build-data";
let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const F = (req: string, cite = "") => ({ req, cite });

// exact-normalized restatement collapses (article + spacing difference)
{
  const out = dedupeNearFindings([F("Provide a Quality Control Plan within 10 days after award", "§C"), F("Provide Quality Control Plan within 10 days after award", "§L")]);
  assert(out.length === 1, "trivial 'a'/spacing restatement → 1 row");
  // dual-authority provenance is PRESERVED, not dropped (review 2026-07-21)
  assert(out[0].cite === "§C · §L", "collapsed row merges both citations (protest-relevant dual-cite kept)");
}
// merging de-dupes identical cites and does not mutate the source finding
{
  const src = [F("Maintain an active SAM registration", "52.204-7"), F("Maintain active SAM registration", "52.204-7"), F("Maintain the active SAM registration", "§K rep 3")];
  const out = dedupeNearFindings(src);
  assert(out.length === 1 && out[0].cite === "52.204-7 · §K rep 3", "identical cite not duplicated; distinct cite appended");
  assert(src[0].cite === "52.204-7", "source finding object not mutated by the cite-merge");
}

// distinct licensure gates survive (the dangerous over-collapse case)
{
  const out = dedupeNearFindings([
    F("Active, unrestricted state license for Registered Nurse II"),
    F("Active, unrestricted license for LPN"),
    F("Active, unrestricted license as Clinical Psychologist"),
  ]);
  assert(out.length === 3, "RN / LPN / Psychologist licenses all kept (different subjects → different normalized text)");
}

// different obligations that share words but differ in substance survive
{
  const out = dedupeNearFindings([
    F("Maintain insurance $1M per occurrence / $3M aggregate"),
    F("Maintain business/professional licensing"),
  ]);
  assert(out.length === 2, "insurance vs licensing kept separate");
}

// empty req is not a dedup key (never collapses blanks together)
{
  const out = dedupeNearFindings([F(""), F("")]);
  assert(out.length === 2, "empty requirements are not collapsed into one");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
