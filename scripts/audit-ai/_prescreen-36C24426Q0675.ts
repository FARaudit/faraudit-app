// $0 CERT-3 RETARGET PRE-SCREEN — 36C24426Q0675 (VA HVAC controls, 9 docs). Brain ruling 2026-07-21.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_prescreen-36C24426Q0675.ts
// Verifies (1) machine-readable (real text extracts from every ingested doc), (2) COMPLETE-flag-OFF (checked
// in the DB separately — no audit row exists), and (3) BOTH pre-fire projections computed for ITS ACTUAL size:
// cost ≤$2.50 AND wall-clock ≥20% headroom vs 360s, Opus tier included. NO Claude calls (SAM fetch + pdf-parse).
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText } from "../../src/lib/pdf-text-extractor";
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

const NOTICE = "f3bd5005a5884713af52b2dfe9bd8299", SOL = "36C24426Q0675";
const BUDGET_MS = 360_000, HEADROOM = 0.20, E133_CHARS = 995_368;
// E133 measured per-stage token profile (the anchor) — scaled linearly by (targetChars / E133_CHARS).
const S = "claude-sonnet-4-6", O = "claude-opus-4-8", H = "claude-haiku-4-5";
const mk = (l: string, m: string, ms: number, i: number, o: number, cr: number, cw: number): StructuredUsage => ({ label: l, model: m, input_tokens: i, output_tokens: o, cache_read: cr, cache_write: cw, ms });
const E133: StructuredUsage[] = [
  mk("panel:capture_strategist", S, 89300, 18074, 45296, 0, 220332),
  mk("panel:pricing_contracts_risk", S, 60300, 3942, 6574, 0, 43737),
  mk("panel:source_selection_evaluator", O, 37200, 1877, 3195, 0, 23218),
  mk("panel:proposal_compliance", S, 69800, 3810, 10516, 0, 41866),
  mk("panel:smallbiz_eligibility_counsel", H, 60300, 13963, 33920, 43884, 84240),
  mk("panel:verifier", O, 57700, 77164, 19245, 0, 0),
  mk("panel:gatekeeper", S, 200, 3355, 9, 0, 0),
];
const E133_PREPANEL_MS = 24907 + 17695 + 41836, E133_PRODUCER_MS = 358200;

(async () => {
  console.log(`=== PRE-SCREEN ${SOL} (notice ${NOTICE.slice(0,8)}…) ===`);
  const set = await assembleSamDocumentSet(NOTICE, SOL);
  if (!set) { console.log("❌ manifest fetch FAILED (no attachable docs / SAM error) — REJECT like card #503 notice-body-only class"); process.exit(1); }
  const bufs = [set.primary, ...set.attachments].filter(Boolean) as Array<{ name: string; buffer: Buffer }>;
  let totalChars = 0, readable = 0, unreadable: string[] = [];
  for (const d of bufs) {
    let text = ""; try { text = (await extractText(d.buffer))?.rawText ?? ""; } catch { text = ""; }
    const n = text.trim().length; totalChars += n;
    if (n >= 200) readable++; else unreadable.push(`${d.name} (${n} chars)`);
    console.log(`  ${n >= 200 ? "✓" : "✗"} ${d.name.slice(0,52).padEnd(52)} ${n} chars`);
  }
  console.log(`\n(1) MACHINE-READABLE: ${readable}/${bufs.length} docs extract text · total ${totalChars.toLocaleString()} chars${unreadable.length ? ` · thin/unreadable: ${unreadable.join(", ")}` : ""}`);
  const machineReadable = readable >= 1 && totalChars >= 2000;
  console.log(`  → ${machineReadable ? "PASS" : "REJECT (no extractable binding text)"}`);

  // (3) size-scaled projection — scale the E133 token profile by the char ratio, re-price via the shipped model.
  const ratio = totalChars / E133_CHARS;
  const scaled = E133.map((u) => mk(u.label, u.model, Math.round((u.ms||0)*Math.min(1,ratio*1.4)), Math.round(u.input_tokens*ratio), Math.round(u.output_tokens*ratio), Math.round(u.cache_read*ratio), Math.round(u.cache_write*ratio)));
  const rows = summarizePanelUsage(scaled);
  const cost = rows.reduce((a, r) => a + r.costUsd, 0);
  const prodMs = E133_PRODUCER_MS * Math.min(1, ratio*1.4);   // producer scales sub-linearly toward a floor; conservative *1.4
  const totalMs = E133_PREPANEL_MS + prodMs;
  const headroom = 1 - totalMs / BUDGET_MS;
  console.log(`\n(2) PROJECTIONS for ${totalChars.toLocaleString()} chars (ratio ${ratio.toFixed(2)}× of E133, n=1 calibration):`);
  console.log(`  COST      projected $${cost.toFixed(2)}  →  ${cost <= PANEL_COST_GATE_USD ? "PASS" : "FAIL"} (gate ≤$${PANEL_COST_GATE_USD})`);
  console.log(`  WALL-CLOCK projected ${(totalMs/1000).toFixed(0)}s → headroom ${(headroom*100).toFixed(0)}% → ${headroom >= HEADROOM ? "PASS" : "FAIL"} (gate ≥${HEADROOM*100}% of ${BUDGET_MS/1000}s)`);
  const pass = machineReadable && cost <= PANEL_COST_GATE_USD && headroom >= HEADROOM;
  console.log(`\n=== VERDICT: ${pass ? "✅ FIRE-READY (both gates PASS, machine-readable)" : "❌ NOT fire-ready"} ===`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("HARNESS THREW:", e instanceof Error ? e.message : e); process.exit(2); });
