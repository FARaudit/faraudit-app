// $0 SEQ-4 PRE-FIRE PRE-SCREEN — 36C24626Q0724 (VA Asheville VAMC Grounds Maintenance, SDVOSB, UCF). Brain #643 confirm.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_prescreen-36C24626Q0724.ts
// Exact census + item-6 reconcile · routing class · cost/wall projection (PER-SECTION basis, fallback-mult=1 because UCF;
// both stated vs gates) · demo open-world note. NO Claude calls (SAM + pdf/docx-parse only). Expected: COMPLETE run →
// NEEDS_HUMAN_REVIEW → VAAR 852.219-73/-75 SDVOSB/VetCert bar grounded+named+prominent · zero false-BID.
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { resolveSamDescription } from "../../src/lib/sam-description";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText, meaningfulCharCount } from "../../src/lib/pdf-text-extractor";
import { detectDocumentClass, ucfHeaderCount } from "../../src/lib/panel-doc-class";
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

const SOL = "36C24626Q0724", NOTICE = "d6d5f76b635a46ad937a2b0895b9c95f";
const BUDGET_MS = 360_000, HEADROOM = 0.20, E133_CHARS = 995_368;
const FALLBACK_COST_MULT = 4.0, FALLBACK_WALL_MULT = 1.6; // #628-B — applies to COMMERCIAL whole-source only; UCF ⇒ 1.
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
const VAAR_RE = /852\.219-(?:73|75)|service-disabled veteran|SDVOSB|VetCert|verified? .{0,20}veteran|VOSB set-aside/i;

(async () => {
  console.log(`=== SEQ-4 PRE-FIRE PRE-SCREEN ${SOL} (VA Asheville grounds · SDVOSB · UCF) ===`);
  const sol = await fetchSolicitationByNoticeId(NOTICE);
  if (!sol) { console.log("❌ SAM resolve FAILED"); process.exit(1); }
  console.log(`\n--- NOTICE METADATA ---`);
  console.log(`  noticeId ${sol.noticeId} · NAICS ${sol.naicsCode} · type ${sol.type}`);
  console.log(`  SET-ASIDE ${sol.typeOfSetAside ?? "(none)"} · posted ${sol.postedDate} · due ${sol.responseDeadLine}`);
  const isSdvosb = /SDVOSB|service.?disabled|VOSB/i.test(sol.typeOfSetAside ?? "");
  console.log(`  → SDVOSB-class set-aside: ${isSdvosb ? "YES ✅" : "NO ⚠"}`);

  // L1 notice body + attachments (executor's exact source assembly).
  const resolved = await resolveSamDescription(sol.noticeId, sol.description);
  const body = resolved.fetched ? resolved.text : "";
  const set = await assembleSamDocumentSet(sol.noticeId, SOL);
  const bufs = set ? ([set.primary, ...set.attachments].filter(Boolean) as Array<{ name: string; buffer: Buffer }>) : [];

  let totalChars = body.trim().length, readable = body.trim().length >= 200 ? 1 : 0, assembled = "\n" + body;
  let vaarHits = VAAR_RE.test(body) ? 1 : 0;
  const listing: string[] = body.trim().length ? [`[L1 NOTICE BODY] ${body.length}c${VAAR_RE.test(body) ? " ⟵VAAR/SDVOSB" : ""}`] : [];
  const unreadable: string[] = [];
  console.log(`\n--- PER-DOC CENSUS (${bufs.length} attachments + ${body.trim().length ? 1 : 0} notice body) ---`);
  for (const d of bufs) {
    let text = "", pages = 0, textPages = 0;
    try { const ex = await extractText(d.buffer); text = ex?.rawText ?? ""; pages = ex?.pageCount ?? 0; textPages = Array.isArray(ex?.pages) ? ex.pages.filter((p) => meaningfulCharCount(p.text) >= 25).length : 0; } catch { text = ""; }
    const n = text.trim().length; totalChars += n; assembled += "\n" + text;
    const bytes = d.buffer.length, scanned = bytes > 1_000_000 && n / bytes < 0.02;
    const vaar = VAAR_RE.test(text); if (vaar) vaarHits++;
    if (n >= 200) readable++; else unreadable.push(`${d.name} (${n}c)`);
    const cls = scanned ? "SCANNED" : (n >= 200 ? "machine-readable" : "thin");
    listing.push(`${d.name.slice(0,40)} ${n}c ${cls}${vaar ? " ⟵VAAR/SDVOSB" : ""}`);
    console.log(`  ${n >= 200 ? "✓" : "✗"} ${d.name.slice(0,44).padEnd(44)} bytes=${bytes.toString().padStart(8)} chars=${n.toString().padStart(7)} pages=${pages||"?"} [${cls}]${vaar ? " ⟵VAAR/SDVOSB" : ""}`);
  }

  const censusCount = bufs.length + (body.trim().length ? 1 : 0);
  console.log(`\n  ITEM-6 RECONCILE — direct doc listing (${listing.length}) vs census count (${censusCount}): ${listing.length === censusCount ? "✅ MATCH" : "❌ MISMATCH"}`);
  listing.forEach((l, i) => console.log(`    [${i + 1}] ${l}`));
  console.log(`\n  MACHINE-READABLE: ${readable}/${censusCount} · total ${totalChars.toLocaleString()} chars${unreadable.length ? ` · thin: ${unreadable.join(", ")}` : ""}`);
  const machineReadable = readable >= 1 && totalChars >= 2000;
  console.log(`  → ${machineReadable ? "PASS" : "REJECT"}`);
  console.log(`  VAAR/SDVOSB bar present in source: ${vaarHits > 0 ? `✅ YES (${vaarHits} doc(s)) — the firm-inherent bar is groundable` : "❌ NOT FOUND — bar may not ground (STOP-check)"}`);

  // Routing.
  const hdrs = ucfHeaderCount(assembled), klass = detectDocumentClass(assembled);
  console.log(`\n--- ROUTING ---`);
  console.log(`  UCF headers = ${hdrs} → detectDocumentClass = ${klass.toUpperCase()} ${klass === "ucf" ? "✅ (per-section; decoupled from #271; fallback-mult=1)" : "⚠ COMMERCIAL (would need #271)"}`);

  // Projection — per-section basis (mult=1 for UCF). State both vs gates.
  const ratio = totalChars / E133_CHARS;
  const scaled = E133.map((u) => mk(u.label, u.model, Math.round((u.ms||0)*Math.min(1,ratio*1.4)), Math.round(u.input_tokens*ratio), Math.round(u.output_tokens*ratio), Math.round(u.cache_read*ratio), Math.round(u.cache_write*ratio)));
  const baseCost = summarizePanelUsage(scaled).reduce((a, r) => a + r.costUsd, 0);
  const baseMs = E133_PREPANEL_MS + E133_PRODUCER_MS * Math.min(1, ratio*1.4);
  const isUcf = klass === "ucf";
  const cost = baseCost * (isUcf ? 1 : FALLBACK_COST_MULT), totalMs = baseMs * (isUcf ? 1 : FALLBACK_WALL_MULT);
  const headroom = 1 - totalMs / BUDGET_MS;
  console.log(`\n--- PROJECTION (${totalChars.toLocaleString()} chars, ratio ${ratio.toFixed(3)}× E133) ---`);
  console.log(`  per-section (UCF, mult=1): COST $${baseCost.toFixed(2)} · WALL ${(baseMs/1000).toFixed(0)}s`);
  console.log(`  fallback basis (if commercial, ×4/×1.6): COST $${(baseCost*FALLBACK_COST_MULT).toFixed(2)} · WALL ${(baseMs*FALLBACK_WALL_MULT/1000).toFixed(0)}s`);
  console.log(`  OPERATIVE (${isUcf ? "per-section" : "fallback"}): COST $${cost.toFixed(2)} → ${cost <= PANEL_COST_GATE_USD ? "PASS" : "FAIL"} (gate ≤$${PANEL_COST_GATE_USD}) · WALL ${(totalMs/1000).toFixed(0)}s → headroom ${(headroom*100).toFixed(0)}% → ${headroom >= HEADROOM ? "PASS" : "FAIL"} (gate ≥${HEADROOM*100}%)`);

  const pass = machineReadable && isUcf && vaarHits > 0 && isSdvosb && cost <= PANEL_COST_GATE_USD && headroom >= HEADROOM;
  console.log(`\n=== PRE-SCREEN: ${pass ? "✅ FIRE-READY (UCF·source-rich·VAAR bar groundable·within gates) — pending checklist 1-6 + gold-set" : "❌ NOT fire-ready"} ===`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
