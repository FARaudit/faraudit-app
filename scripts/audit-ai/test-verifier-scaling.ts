/**
 * $0 DETERMINISTIC reproduction + fix-proof for the recurring 6E verifier-truncation honest-fail.
 *
 * Root (proven by the run log, not guessed): the verifier echoes one {ref,state,evidence} per claim,
 * so OUTPUT is O(n) in claim count while the ceiling is O(1) (12k). The 2026-06-25 run emitted 90+
 * risks from ONE lens → ~150 claims → output > 12k → "Unterminated string" → honest-fail. Patched 3×
 * at the ceiling (the wrong fix). This test reproduces the failure with SYNTHETIC load (no API, no
 * spend) and proves the two structural levers — boundPanelClaims + chunkClaims/verifierBatchSize —
 * hold the invariant "verifier output ≤ ceiling for ANY claim count" at 3–5× expected volume.
 *
 * Run: npx tsx scripts/audit-ai/test-verifier-scaling.ts
 */
import {
  boundPanelClaims, chunkClaims, verifierBatchSize,
  VERIFIER_OUTPUT_CEILING, VERIFIER_OUT_TOKENS_PER_CLAIM,
} from "../../src/lib/agentic-panel-runner";

let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };

type C = { kind: "gate" | "risk"; lens: string; sev: number; text: string; ref: string };
const LENSES = ["capture", "contracts", "pricing", "exko", "proposal"];
const SEVS = [
  { tag: "P0", sev: 3 }, { tag: "P1", sev: 2 }, { tag: "P2", sev: 1 },
];

// Synthesize a claim explosion: `risksPerLens` risks across 5 lenses + a few gates each.
function synth(risksPerLens: number, gatesPerLens = 3): C[] {
  const out: C[] = [];
  for (const lens of LENSES) {
    for (let i = 0; i < gatesPerLens; i++) {
      out.push({ kind: "gate", lens, sev: i === 0 ? 5 : 4, text: `GATE ${lens} g${i}`, ref: `${lens}:G${i + 1}` });
    }
    for (let i = 0; i < risksPerLens; i++) {
      const s = SEVS[i % SEVS.length];
      out.push({ kind: "risk", lens, sev: s.sev, text: `RISK(${s.tag}) ${lens} r${i}`, ref: `${lens}:R${i + 1}` });
    }
  }
  return out;
}

// The OLD path estimated output: a single verifier call echoing EVERY claim.
const estOutput = (n: number) => n * VERIFIER_OUT_TOKENS_PER_CLAIM + 200;

// ── 1. REPRODUCE the failure deterministically (the 6E load: ~90 risks/lens → unbatched > ceiling) ──
const sixEload = synth(90); // 90 risks × 5 lenses + 15 gates = 465 claims (the real explosion class)
check(`repro: 6E-class load = ${sixEload.length} claims (matches the 90-risks/lens log)`, sixEload.length >= 150);
check(
  `repro: OLD single-call output (${estOutput(sixEload.length)} tok) BLOWS the ${VERIFIER_OUTPUT_CEILING} ceiling → truncation`,
  estOutput(sixEload.length) > VERIFIER_OUTPUT_CEILING,
);
// Even a modest 30-risk/lens package (~165 claims) already truncated — prove the failure isn't exotic.
const modest = synth(30);
check(`repro: even modest 30-risk/lens = ${modest.length} claims still truncates unbatched`, estOutput(modest.length) > VERIFIER_OUTPUT_CEILING);

// ── 2. LEVER 1 — boundPanelClaims bounds the material set; NEVER drops a hard gate ──
const totalGates = sixEload.filter((c) => c.kind === "gate").length;
const { kept, droppedRisks } = boundPanelClaims(sixEload);
check("bound: every hard gate kept (eligibility-critical, never dropped)", kept.filter((c) => c.kind === "gate").length === totalGates);
check("bound: the P1/P2 advisory tail is capped to the global max (≤40)", kept.filter((c) => c.kind === "risk" && c.sev < 3).length <= 40);
check("bound: dropped-risk count is reported (no silent cap)", droppedRisks === sixEload.filter((c) => c.kind === "risk").length - kept.filter((c) => c.kind === "risk").length && droppedRisks > 0);
check("bound: kept set keeps the HIGHEST-severity risks (a P0 survives, sev ranking respected)", kept.some((c) => c.kind === "risk" && c.sev === 3));
check("bound: per-lens cap honored on the P1/P2 tail (≤8 lesser risks from any one lens)", LENSES.every((l) => kept.filter((c) => c.kind === "risk" && c.lens === l && c.sev < 3).length <= 8));
// P0 = show-stopper severity → NEVER dropped (material disqualifier safety). Synthesize 20 P0/lens.
const p0Heavy: C[] = LENSES.flatMap((lens) => Array.from({ length: 20 }, (_, i) => ({ kind: "risk" as const, lens, sev: 3, text: `RISK(P0) ${lens} p0-${i}`, ref: `${lens}:R${i + 1}` })));
const p0Bound = boundPanelClaims(p0Heavy);
check("bound: EVERY P0 risk kept even at 100 P0s (no material disqualifier dropped)", p0Bound.kept.length === 100 && p0Bound.droppedRisks === 0);

// ── 3. LEVER 2 — chunkClaims/verifierBatchSize: EVERY batch ≤ ceiling for ANY count (the invariant) ──
const bs = verifierBatchSize();
check(`batch: computed batch size ${bs} fits the ceiling (worst-case ${bs * VERIFIER_OUT_TOKENS_PER_CLAIM + 200} ≤ ${VERIFIER_OUTPUT_CEILING})`, bs * VERIFIER_OUT_TOKENS_PER_CLAIM + 200 <= VERIFIER_OUTPUT_CEILING);

// Stress the INVARIANT at 3–5× expected volume on the UNBOUNDED set (prove batching alone holds even
// if bounding were ever loosened or a package legitimately had hundreds of gates).
for (const mult of [150, 300, 500, 1000]) {
  const batches = chunkClaims(Array.from({ length: mult }, (_, i) => i), bs);
  const reassembled = batches.flat().length;
  const everyBatchFits = batches.every((b) => estOutput(b.length) <= VERIFIER_OUTPUT_CEILING);
  const noLoss = reassembled === mult;
  check(`stress ${mult} claims: every batch ≤ ceiling (max batch out ${estOutput(Math.max(...batches.map((b) => b.length)))} tok)`, everyBatchFits);
  check(`stress ${mult} claims: chunking is loss-free (${reassembled}/${mult} reassembled)`, noLoss);
}

// ── 4. End-to-end: bound THEN batch (the real pipeline) → a single safe batch at the 6E load ──
const e2eBatches = chunkClaims(kept, bs);
check(`e2e: 6E load bounds to ${kept.length} claims → ${e2eBatches.length} batch (normally 1), all ≤ ceiling`, e2eBatches.every((b) => estOutput(b.length) <= VERIFIER_OUTPUT_CEILING));

// ── 5. Edge cases ──
check("edge: empty claim set → no batches, no crash", chunkClaims([], bs).length === 0);
check("edge: bound on empty → empty, 0 dropped", (() => { const r = boundPanelClaims([] as C[]); return r.kept.length === 0 && r.droppedRisks === 0; })());
check("edge: all-gates set (200 gates) is fully kept (gates never dropped)", boundPanelClaims(synth(0, 40)).kept.length === 200);

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — verifier scaling invariant ${pass ? "holds" : "BROKEN"} at 3–5× load (reproduced failure → fixed, $0)`);
process.exit(pass ? 0 : 1);
