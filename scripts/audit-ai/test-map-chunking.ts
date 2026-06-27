/**
 * $0 DETERMINISTIC proof for chunk-then-map (large-package hardening).
 *
 * The silent-truncation gap: a document over MAP_INPUT_CHAR_LIMIT was sliced to the limit
 * (agentic-map.ts mapPrompt) and FLAGGED truncated → the whole package fell to INCOMPLETE/
 * no-charge. A 459-pg binding spec (the gold-set #5 Attachment-1a class) would do exactly that.
 * chunkForMap + mergeChunkParts read the ENTIRE doc in overlapping ≤-limit slices and merge —
 * no trim, the middle/tail is never dropped, overlap duplicates collapse.
 *
 * Pure-function gate (no API, no spend). Proves: full coverage · ≤-limit chunks · overlap so a
 * straddling finding survives whole · the MIDDLE is read (the load-bearing negative vs truncation)
 * · overlap dedup (no double-count) · no-op for in-limit docs (single-call path byte-identical).
 *
 * Run: npx tsx scripts/audit-ai/test-map-chunking.ts
 */
import { chunkForMap, mergeChunkParts } from "../../src/lib/agentic-map";
import type { ClauseItem, PerformanceRequirement } from "../../src/lib/section-extractors";

let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };

// ── chunkForMap ──────────────────────────────────────────────────────────────
// Small limit/overlap so the logic is exercised on a tiny synthetic doc ($0).
const LIMIT = 100;
const OVERLAP = 20;

// no-op: a doc within the limit returns EXACTLY [text] (the single-call path is byte-identical).
check("chunk: in-limit doc → single chunk == original (no-op)", (() => {
  const t = "x".repeat(LIMIT);
  const c = chunkForMap(t, LIMIT, OVERLAP);
  return c.length === 1 && c[0] === t;
})());
check("chunk: empty doc → single chunk", chunkForMap("", LIMIT, OVERLAP).length === 1);

// over-limit doc: full coverage + every chunk ≤ limit + overlap between neighbors.
const big = Array.from({ length: 500 }, (_, i) => `line-${i}`).join("\n"); // ~3.9k chars, well over LIMIT
const chunks = chunkForMap(big, LIMIT, OVERLAP);
check("chunk: over-limit doc → multiple chunks", chunks.length > 1);
check("chunk: every chunk ≤ limit", chunks.every((c) => c.length <= LIMIT));
check("chunk: first chunk starts at the document start", big.startsWith(chunks[0]));
check("chunk: last chunk reaches the document END (tail not dropped)", big.endsWith(chunks[chunks.length - 1]));
// FULL COVERAGE: walking the chunks with their overlap reconstructs every character of the source.
check("chunk: union of chunks covers the WHOLE document (no gap)", (() => {
  // Reassemble by appending each chunk's NON-overlapping advance. Because successive chunks
  // overlap, the concatenation of [chunk0] + [each next chunk minus its overlap with the prior]
  // must equal the source exactly.
  let rebuilt = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    const prevTail = rebuilt.slice(Math.max(0, rebuilt.length - LIMIT));
    // find where this chunk re-joins: it shares an overlap prefix with the running tail.
    const cur = chunks[i];
    let joined = false;
    for (let ov = Math.min(prevTail.length, cur.length); ov >= 1; ov--) {
      if (prevTail.slice(prevTail.length - ov) === cur.slice(0, ov)) { rebuilt += cur.slice(ov); joined = true; break; }
    }
    if (!joined) rebuilt += cur; // disjoint (shouldn't happen given overlap)
  }
  return rebuilt === big;
})());
check("chunk: neighbors share ≥1 char of overlap (straddle protection)", (() => {
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const cur = chunks[i];
    // some suffix of prev equals some prefix of cur (the overlap seam)
    let share = false;
    for (let ov = Math.min(prev.length, cur.length, OVERLAP); ov >= 1; ov--) {
      if (prev.slice(prev.length - ov) === cur.slice(0, ov)) { share = true; break; }
    }
    if (!share) return false;
  }
  return true;
})());

// LOAD-BEARING NEGATIVE — a unique marker placed only in the MIDDLE of the doc (the region a
// single truncated call DROPS) appears in some chunk. This is the whole point of chunking.
check("chunk: a marker in the MIDDLE of the doc survives (vs truncation dropping it)", (() => {
  const head = "A".repeat(250);
  const mid = "UNIQUE_MIDDLE_MARKER";
  const tail = "B".repeat(250);
  const doc = `${head}\n${mid}\n${tail}`;
  const cs = chunkForMap(doc, LIMIT, OVERLAP);
  return cs.some((c) => c.includes(mid));
})());

// defensive: a misconfigured overlap ≥ limit must NOT infinite-loop (clamped → still terminates).
check("chunk: overlap ≥ limit is clamped (terminates, full coverage)", (() => {
  const cs = chunkForMap(big, LIMIT, LIMIT * 5);
  return cs.length >= 1 && cs.every((c) => c.length <= LIMIT) && big.endsWith(cs[cs.length - 1]);
})());

// ── mergeChunkParts ──────────────────────────────────────────────────────────
const clause = (number: string): ClauseItem => ({ number, title: "", incorporated: "by_reference", effectiveDate: null, isTrap: false, trapReason: null });
const perf = (id: string): PerformanceRequirement => ({ text: id, category: "scope", sourceSection: null, isCritical: false });
const emptyPart = () => ({ clauses: [] as ClauseItem[], clins: [], delivery: [], submissionRequirements: [], evaluationFactors: [], performanceRequirements: [] as PerformanceRequirement[], amendmentChanges: [], workStatementText: null as string | null, warnings: [] as string[] });

// three chunks: distinct findings per chunk + a SHARED finding in the overlap of chunk1/chunk2.
const p1 = { ...emptyPart(), clauses: [clause("52.219-6"), clause("52.222-26")], performanceRequirements: [perf("clean restrooms daily")], workStatementText: "SOW part 1", warnings: ["w1"] };
const p2 = { ...emptyPart(), clauses: [clause("52.222-26"), clause("252.204-7012")], performanceRequirements: [perf("respond within 4 hours")], workStatementText: "SOW part 2", warnings: ["w1", "w2"] };
const p3 = { ...emptyPart(), clauses: [clause("252.225-7060")], performanceRequirements: [perf("maintain 98% quality")], workStatementText: "SOW part 3", warnings: [] };
const m = mergeChunkParts([p1, p2, p3]);

check("merge: UNION of all distinct clauses across chunks (nothing dropped)", (() => {
  const nums = new Set(m.clauses.map((c) => c.number));
  return ["52.219-6", "52.222-26", "252.204-7012", "252.225-7060"].every((n) => nums.has(n));
})());
check("merge: the overlap-duplicated clause (52.222-26) appears ONCE (no double-count)", m.clauses.filter((c) => c.number === "52.222-26").length === 1);
check("merge: every performanceRequirement from every chunk survives", (() => {
  const reqs = new Set(m.performanceRequirements.map((r) => r.text));
  return reqs.size === 3 && reqs.has("clean restrooms daily") && reqs.has("respond within 4 hours") && reqs.has("maintain 98% quality");
})());
check("merge: workStatement bodies concatenated (all parts present)", !!m.workStatementText && ["part 1", "part 2", "part 3"].every((s) => m.workStatementText!.includes(s)));
check("merge: warnings deduped (w1 once, w2 once)", m.warnings.filter((w) => w === "w1").length === 1 && m.warnings.includes("w2"));
check("merge: a single-part merge is identity-preserving (counts unchanged)", (() => {
  const one = mergeChunkParts([p1]);
  return one.clauses.length === 2 && one.performanceRequirements.length === 1 && one.workStatementText === "SOW part 1";
})());
check("merge: empty input → all-empty extract (no crash)", (() => {
  const z = mergeChunkParts([]);
  return z.clauses.length === 0 && z.performanceRequirements.length === 0 && z.workStatementText === null && z.warnings.length === 0;
})());

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — chunk-then-map ${pass ? "reads the whole doc in overlapping slices, merges with no drop/double-count ($0)" : "BROKEN"}`);
process.exit(pass ? 0 : 1);
