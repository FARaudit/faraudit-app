// ── AGENTIC ENGINE v3 — gold-set FIELD PROOF (Brain card-46 two-key run) ──────────────────────────────
// PAID. Runs the real auditPackage() (agentic experts → tools → grounded findings → adversarial verifier →
// deterministic deriveVerdict) over a frozen gold key's source-of-record, compares the DERIVED verdict to
// the authored expectedVerdict, and totals real token cost across BOTH the expert SDK loop AND the skeptic.
// One sol per invocation (so cost is tracked per audit and a wiring bug halts after one key, not two).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/v3-proof.ts <SOL_ID>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { auditPackage } from "@/lib/audit-package";
import { setExpertUsageSink, type ExpertUsage } from "@/lib/audit-expert";
import { setStructuredUsageSink, type StructuredUsage } from "@/lib/anthropic-structured";
import { modelFor } from "@/lib/model-registry";
import type { BidderProfile } from "@/lib/audit-findings";

const sol = process.argv[2];
if (!sol) { console.error("usage: v3-proof.ts <SOL_ID>"); process.exit(1); }
process.env.AUDIT_AGENTIC_V3 = "true"; // explicit greenlight for THIS run (CEO flag-flip, Rule 66)

const G = "scripts/audit-ai/gold-sets";
const fullSource = readFileSync(`${G}/${sol}-FULL-SOURCE.txt`, "utf8");
const key = JSON.parse(readFileSync(`${G}/${sol}.judgment.frozen.json`, "utf8"));
const expected = key.expectedVerdict?.verdict as string;
// Map the authored bidderProfile → the engine's typed profile. null = unknown; a described generic firm that
// holds NONE of the special bars' attributes → satisfiedAttributes:[] (any requiredAttribute → firmStatus "fails").
const bidderProfile: BidderProfile | null = key.bidderProfile == null ? null : { satisfiedAttributes: [] };

// ── cost capture (input $/1M, output $/1M); cache read ~0.1× in, cache write ~1.25× in. No caching yet. ──
const PRICE: Record<string, [number, number]> = { opus: [5, 25], sonnet: [3, 15], haiku: [1, 5] };
const tierOf = (m: string) => /opus/i.test(m) ? "opus" : /haiku/i.test(m) ? "haiku" : "sonnet";
let calls = 0; const tally: Record<string, { in: number; out: number; cw: number; cr: number; $: number; n: number }> = {};
const add = (model: string, i: number, o: number, cw: number, cr: number) => {
  calls++; const t = tierOf(model); const [pi, po] = PRICE[t];
  const dollars = (i * pi + o * po + cr * pi * 0.1 + cw * pi * 1.25) / 1e6;
  const r = (tally[t] ??= { in: 0, out: 0, cw: 0, cr: 0, $: 0, n: 0 });
  r.in += i; r.out += o; r.cw += cw; r.cr += cr; r.$ += dollars; r.n++;
};
setExpertUsageSink((u: ExpertUsage) => add(u.model, u.input_tokens, u.output_tokens, u.cache_write, u.cache_read));
setStructuredUsageSink((u: StructuredUsage) => add(u.model, u.input_tokens, u.output_tokens, u.cache_write, u.cache_read));

async function main() {
  const t0 = Date.now();
  console.log(`\n═══ v3 FIELD PROOF · ${sol} ═══`);
  console.log(`expected verdict: ${expected} | bidderProfile: ${bidderProfile ? "generic (satisfiedAttributes:[])" : "null"} | source: ${(fullSource.length/1024).toFixed(0)}KB`);
  console.log(`models: experts=${modelFor("lens")} · skeptic-base=${modelFor("lens")} · skeptic-escalate=${modelFor("judge")}\n`);

  const res = await auditPackage({ fullSource, bidderProfile });
  const ms = Date.now() - t0;
  const got = res.decision.verdict;

  console.log(`── DERIVED DECISION ──`);
  console.log(`  verdict:   ${got}   (expected ${expected})  ${got === expected ? "✅ MATCH" : "❌ MISMATCH"}`);
  console.log(`  eligible:  ${res.decision.eligible}`);
  console.log(`  reason:    ${res.decision.reason}`);
  console.log(`  showStoppers: ${res.decision.showStoppers.map((s) => s.requirement).join(" | ") || "none"}`);
  console.log(`  coverage:  required=[${res.coverage.required}] covered=[${res.coverage.covered}] missing=[${res.coverage.missing}] complete=${res.inputs.coverageComplete}`);
  console.log(`  conflict:  ${res.conflict} | verifierSound: ${res.inputs.verifierSound} | findings: ${res.findings.length}`);
  console.log(`  per-lens:  ${JSON.stringify(res.perLens)}`);

  // Persist the full result for $0 post-mortem — every finding with its lens, excerpt, and typing. No re-run
  // needed to inspect why a section is uncovered or a lens returned empty.
  mkdirSync("ceo/proofs", { recursive: true });
  writeFileSync(`ceo/proofs/v3-${sol}-result.json`, JSON.stringify({
    sol, expected, got, decision: res.decision, coverage: res.coverage, perLens: res.perLens,
    conflict: res.conflict, verifierSound: res.inputs.verifierSound,
    sectionsRead: res.sectionsRead, trace: res.trace,   // per-agent tool trace — adjudicate thin-vs-bug FIRST (Brain guardrail 2)
    findings: res.findings.map((f) => ({ id: f.id, lens: f.lens, kind: f.kind, controllability: f.controllability, requirement: f.requirement, citation: f.citation, excerpt: f.excerpt, requiredAttribute: f.requiredAttribute, curableInWindow: f.curableInWindow })),
  }, null, 2));
  console.log(`  sectionsRead: [${res.sectionsRead.sort()}] | attestations: ${res.coverage.attestations.map((a) => a.section + ":" + a.status).join(" ")}`);
  console.log(`  (full result → ceo/proofs/v3-${sol}-result.json)`);

  let total = 0;
  console.log(`\n── COST (baseline, pre-caching) ──`);
  for (const [t, r] of Object.entries(tally)) { total += r.$; console.log(`  ${t.padEnd(6)} ${r.n} call(s)  in=${r.in} out=${r.out} cr=${r.cr} cw=${r.cw}  $${r.$.toFixed(4)}`); }
  console.log(`  ${calls} model calls · ${(ms/1000).toFixed(1)}s · TOTAL $${total.toFixed(4)} /key`);
  console.log(`\n${got === expected ? "✅ PASS" : "❌ FAIL"} — ${sol}: derived ${got}, expected ${expected}. cost $${total.toFixed(4)}.\n`);
  if (got !== expected) process.exit(2);
}
main().catch((e) => { console.error("RUN ERROR:", e?.message || e); process.exit(1); });
