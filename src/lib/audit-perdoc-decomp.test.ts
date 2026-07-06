// $0 proof for Brain card 291 — per-doc decomposition proposer wrapper (makePerDocProposer).
// Run: npx tsx src/lib/audit-perdoc-decomp.test.ts
import { makePerDocProposer, type ProposeFn } from "./audit-judgment-first";
import { docRegions } from "./audit-orchestrator";
import type { TypedFinding } from "./audit-findings";

let pass = 0, fail = 0;
const eq = (l: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${l}${ok ? "" : ` — got ${JSON.stringify(g)}`}`); };
const ok = (l: string, c: boolean) => eq(l, !!c, true);
const F = (excerpt: string): TypedFinding => ({ requirement: excerpt, citation: "x", excerpt, kind: "other", controllability: "bidder_controls", grounded: false, lens: "judgment" });

// Stub base proposer: returns a finding whose excerpt echoes which doc it saw (last DOCUMENT header, or "holistic").
const base: ProposeFn = async (input) => {
  const m = [...input.fullSource.matchAll(/==== DOCUMENT: (.+?) ====/g)];
  const tag = m.length ? m[m.length - 1][1] : "holistic";
  return { verdict: "BID", eligible: null, analysis: "a", reason: "r", findings: [F(`finding-from-${tag}`)] };
};

const SRC = `==== DOCUMENT: primary ====\n\nprimary body\n\n==== DOCUMENT: attach A ====\n\nA body\n\n==== DOCUMENT: attach B ====\n\nB body`;

(async () => {
  const perDoc = makePerDocProposer(base, docRegions);
  const res = await perDoc({ fullSource: SRC });
  const excerpts = res.findings.map((f) => f.excerpt).sort();
  // Union must include a finding grounded from EACH attachment (A and B), plus the holistic pass.
  ok("per-doc union includes a finding from attach A", excerpts.some((e) => e.includes("attach A")));
  ok("per-doc union includes a finding from attach B", excerpts.some((e) => e.includes("attach B")));
  ok("verdict/analysis come from the holistic pass", res.verdict === "BID" && res.analysis === "a");

  // Single-doc → no decomposition (byte-identical to base).
  const single = await perDoc({ fullSource: "just one doc, no headers" });
  eq("single-doc → base proposal unchanged (1 finding)", single.findings.length, 1);

  // Dedup — a base that returns the SAME excerpt for every doc collapses to one.
  const dupBase: ProposeFn = async () => ({ verdict: "BID", eligible: null, analysis: "a", reason: "r", findings: [F("same-excerpt")] });
  const dup = await makePerDocProposer(dupBase, docRegions)({ fullSource: SRC });
  eq("dedup by excerpt across passes → 1 union finding", dup.findings.length, 1);

  console.log(`\n────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
