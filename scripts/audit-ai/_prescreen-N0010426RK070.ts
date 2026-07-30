// $0 CERT-3 PRE-SCREEN + NEW-STYLE CENSUS — N0010426RK070 (Navy CWRG battery, ~4 docs, SB). #503 seq target #3.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_prescreen-N0010426RK070.ts
// (1) fetch+extract every ingested doc; (2) PER-DOC census {bytes, chars, machine-readable vs scanned page-ratio};
// (3) route COMMERCIAL vs UCF via detectDocumentClass on the ASSEMBLED source; (4) size-scaled cost+wall projection
// under the E133 anchor. NO Claude calls (SAM fetch + pdf-parse only).
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText, meaningfulCharCount } from "../../src/lib/pdf-text-extractor";
import { detectDocumentClass, ucfHeaderCount } from "../../src/lib/panel-doc-class";
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

const NOTICE = "f7a0231c229844debe89ae81db3c1895", SOL = "N0010426RK070";
const BUDGET_MS = 360_000, HEADROOM = 0.20, E133_CHARS = 995_368;
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
  console.log(`=== PRE-SCREEN + CENSUS ${SOL} (notice ${NOTICE.slice(0,8)}…) ===`);
  const set = await assembleSamDocumentSet(NOTICE, SOL);
  if (!set) { console.log("❌ manifest fetch FAILED (no attachable docs / SAM error)"); process.exit(1); }
  const bufs = [set.primary, ...set.attachments].filter(Boolean) as Array<{ name: string; buffer: Buffer }>;

  let totalChars = 0, readable = 0, assembled = "";
  const unreadable: string[] = [];
  console.log(`\n--- PER-DOC CENSUS (${bufs.length} docs) ---`);
  for (const d of bufs) {
    const bytes = d.buffer.length;
    let text = "", pages = 0, textPages = 0;
    try {
      const ex = await extractText(d.buffer);
      text = ex?.rawText ?? "";
      pages = ex?.pageCount ?? 0;
      textPages = Array.isArray(ex?.pages) ? ex.pages.filter((p) => meaningfulCharCount(p.text) >= 25).length : 0;
    } catch { text = ""; }
    const n = text.trim().length;
    totalChars += n; assembled += "\n" + text;
    const ratio = pages ? (textPages / pages) : NaN;
    const scanned = bytes > 1_000_000 && n / bytes < 0.02; // image-heavy heuristic: big bytes, low char density
    if (n >= 200) readable++; else unreadable.push(`${d.name} (${n} chars)`);
    console.log(`  ${n >= 200 ? "✓" : "✗"} ${d.name.slice(0,48).padEnd(48)} bytes=${bytes.toString().padStart(8)} chars=${n.toString().padStart(7)} pages=${pages||"?"}${Number.isFinite(ratio)?` textPgRatio=${ratio.toFixed(2)}`:""} ${scanned?"[SCANNED/image-heavy]":"[machine-readable]"}`);
  }

  console.log(`\n(1) MACHINE-READABLE: ${readable}/${bufs.length} docs · total ${totalChars.toLocaleString()} chars${unreadable.length?` · thin/unreadable: ${unreadable.join(", ")}`:""}`);
  const machineReadable = readable >= 1 && totalChars >= 2000;
  console.log(`  → ${machineReadable ? "PASS" : "REJECT (no extractable binding text)"}`);

  // (2) ROUTING — decided by SHAPE on the assembled source.
  const hdrs = ucfHeaderCount(assembled);
  const klass = detectDocumentClass(assembled);
  console.log(`\n(ROUTE) canonical UCF headers ("SECTION X -" at line start) = ${hdrs} → detectDocumentClass = ${klass.toUpperCase()}`);
  console.log(`  → ${klass === "commercial" ? "✅ COMMERCIAL (provides the routing-line arm-proof target)" : "UCF (cannot provide the commercial routing-line proof)"}`);

  // (3) size-scaled projection.
  const ratio = totalChars / E133_CHARS;
  const scaled = E133.map((u) => mk(u.label, u.model, Math.round((u.ms||0)*Math.min(1,ratio*1.4)), Math.round(u.input_tokens*ratio), Math.round(u.output_tokens*ratio), Math.round(u.cache_read*ratio), Math.round(u.cache_write*ratio)));
  const rows = summarizePanelUsage(scaled);
  const cost = rows.reduce((a, r) => a + r.costUsd, 0);
  const prodMs = E133_PRODUCER_MS * Math.min(1, ratio*1.4);
  const totalMs = E133_PREPANEL_MS + prodMs;
  const headroom = 1 - totalMs / BUDGET_MS;
  console.log(`\n(PROJECTION) for ${totalChars.toLocaleString()} chars (ratio ${ratio.toFixed(3)}× of E133):`);
  console.log(`  COST       projected $${cost.toFixed(2)}  → ${cost <= PANEL_COST_GATE_USD ? "PASS" : "FAIL"} (gate ≤$${PANEL_COST_GATE_USD})`);
  console.log(`  WALL-CLOCK projected ${(totalMs/1000).toFixed(0)}s → headroom ${(headroom*100).toFixed(0)}% → ${headroom >= HEADROOM ? "PASS" : "FAIL"} (gate ≥${HEADROOM*100}% of ${BUDGET_MS/1000}s)`);

  const pass = machineReadable && cost <= PANEL_COST_GATE_USD && headroom >= HEADROOM;
  console.log(`\n=== VERDICT: ${pass ? "✅ FIRE-READY" : "❌ NOT fire-ready"} · route=${klass.toUpperCase()} ===`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("HARNESS THREW:", e instanceof Error ? e.message : e); process.exit(2); });
