// $0 SEQ-4 PRE-SCREEN + NEW-STYLE CENSUS — SPE7L126T830Y (DLA SDVOSB set-aside). CERT-5 seq-4 INELIGIBLE pathway.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_prescreen-SPE7L126T830Y.ts
// Brain cards #640/#641. GOAL: prove the confident-wrong guardrail — a REAL SDVOSB bar the demo firm provably fails →
// expected verdict INELIGIBLE. Steps: (0) resolve notice metadata + set-aside; (1) per-doc census + item-6 direct
// listing reconcile; (2) routing class (UCF expected; COMMERCIAL → fire WAITS on #271 fix per Brain #641); (3) cost+
// wall projection on the OPERATIVE basis — #628-B fallback multiplier (~4× cost / ~1.6× wall) when class=commercial
// (V2 DISARMED → whole-source fallback is the live path), standard basis when UCF. NO Claude calls (SAM + pdf-parse).
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { resolveSamDescription } from "../../src/lib/sam-description";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText, meaningfulCharCount } from "../../src/lib/pdf-text-extractor";
import { detectDocumentClass, ucfHeaderCount } from "../../src/lib/panel-doc-class";
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

const SOL = "SPE7L126T830Y";
const BUDGET_MS = 360_000, HEADROOM = 0.20, E133_CHARS = 995_368;
// #628-B (card #628 opt-B, empirical from N0016726Q1089 live fire c7e99592): whole-source fallback inflated
// cost ~4× and wall ~1.6× vs the clean per-section projection. V2 disarmed ⇒ any COMMERCIAL package falls back
// to whole-source ⇒ these multipliers are the OPERATIVE projection basis. UCF routes per-section (mult = 1).
const FALLBACK_COST_MULT = 4.0, FALLBACK_WALL_MULT = 1.6;
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
  console.log(`=== SEQ-4 PRE-SCREEN + CENSUS ${SOL} (DLA SDVOSB — expected INELIGIBLE) ===`);

  // (0) RESOLVE notice metadata — set-aside is the crux of the INELIGIBLE verdict.
  const sol = await fetchSolicitationByNoticeId(SOL);
  if (!sol) { console.log(`❌ SAM resolve FAILED for ${SOL} (no record on noticeid/solnum, hyphen-stripped tried)`); process.exit(1); }
  console.log(`\n--- (0) NOTICE METADATA ---`);
  console.log(`  noticeId       ${sol.noticeId}`);
  console.log(`  title          ${(sol.title || "").slice(0, 80)}`);
  console.log(`  dept/subTier    ${sol.department ?? "?"} / ${sol.subTier ?? "?"}`);
  console.log(`  NAICS          ${sol.naicsCode ?? "?"}`);
  console.log(`  type           ${sol.type ?? "?"}`);
  console.log(`  SET-ASIDE      ${sol.typeOfSetAside ?? "(none)"}   ← INELIGIBLE crux`);
  console.log(`  posted / due   ${sol.postedDate ?? "?"} / ${sol.responseDeadLine ?? "?"}`);
  console.log(`  resourceLinks  ${sol.resourceLinks.length}`);
  const isSdvosb = /SDVOSB|service.?disabled/i.test(sol.typeOfSetAside ?? "");
  console.log(`  → set-aside is SDVOSB-class: ${isSdvosb ? "YES ✅ (firm-inherent bar shape)" : "NO ⚠ (verify target — Brain expected SDVOSB)"}`);

  // (0b) L1 NOTICE BODY — for a Combined Synopsis/Solicitation the binding text IS the notice body (description),
  // not attachments. The executor (audit-executor-v3 L1) resolves the noticedesc URL → body and prepends it as a
  // first-class doc. Replicate that so the census/routing reflect the ACTUAL source, not attachments-only.
  const resolved = await resolveSamDescription(sol.noticeId, sol.description);
  const noticeBodyText = resolved.fetched ? resolved.text : "";
  console.log(`\n--- (0b) L1 NOTICE BODY ---`);
  console.log(`  fetched=${resolved.fetched} · provenance=${resolved.provenance} · chars=${resolved.chars}${resolved.reason ? ` · reason=${resolved.reason}` : ""}`);
  if (!resolved.fetched) console.log(`  ⚠ notice body NOT fetched — engine would run on attachments only (or honest-fail if none).`);

  // (1) PER-DOC CENSUS + item-6 direct listing reconcile.
  const set = await assembleSamDocumentSet(sol.noticeId, SOL);
  const bufs = set ? ([set.primary, ...set.attachments].filter(Boolean) as Array<{ name: string; buffer: Buffer }>) : [];
  if (!set) console.log("\n  (no attachable docs from manifest — notice-body-only buy)");

  let totalChars = noticeBodyText.trim().length, readable = noticeBodyText.trim().length >= 200 ? 1 : 0, assembled = "\n" + noticeBodyText;
  const unreadable: string[] = [];
  const directListing: string[] = noticeBodyText.trim().length ? [`[L1 NOTICE BODY] · ${noticeBodyText.length}chars · machine-readable`] : [];
  console.log(`\n--- (1) PER-DOC CENSUS (${bufs.length} attachment docs + ${noticeBodyText.trim().length ? 1 : 0} notice body) ---`);
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
    const scanned = bytes > 1_000_000 && n / bytes < 0.02;
    const cls = scanned ? "SCANNED/image-heavy" : (n >= 200 ? "machine-readable" : "thin/empty");
    if (n >= 200) readable++; else unreadable.push(`${d.name} (${n} chars)`);
    directListing.push(`${d.name} · ${bytes}B · ${n}chars · ${cls}`);
    console.log(`  ${n >= 200 ? "✓" : "✗"} ${d.name.slice(0,48).padEnd(48)} bytes=${bytes.toString().padStart(8)} chars=${n.toString().padStart(7)} pages=${pages||"?"}${Number.isFinite(ratio)?` textPgRatio=${ratio.toFixed(2)}`:""} [${cls}]`);
  }
  const censusCount = bufs.length + (noticeBodyText.trim().length ? 1 : 0);
  console.log(`\n  ITEM-6 RECONCILE — direct doc listing (${directListing.length} items) vs census count (${censusCount}): ${directListing.length === censusCount ? "✅ MATCH" : "❌ MISMATCH"}`);
  directListing.forEach((l, i) => console.log(`    [${i + 1}] ${l}`));

  console.log(`\n  MACHINE-READABLE: ${readable}/${bufs.length} docs · total ${totalChars.toLocaleString()} chars${unreadable.length?` · thin/unreadable: ${unreadable.join(", ")}`:""}`);
  const machineReadable = readable >= 1 && totalChars >= 2000;
  console.log(`  → ${machineReadable ? "PASS (extractable binding text present)" : "REJECT (no extractable binding text)"}`);

  // (2) ROUTING CLASS.
  const hdrs = ucfHeaderCount(assembled);
  const klass = detectDocumentClass(assembled);
  console.log(`\n--- (2) ROUTING CLASS ---`);
  console.log(`  canonical UCF headers ("SECTION X -" at line start) = ${hdrs} → detectDocumentClass = ${klass.toUpperCase()}`);
  if (klass === "commercial") {
    console.log(`  ⚠ COMMERCIAL → per Brain #641 the FIRE WAITS on the #271 fix re-arm (V2 disarmed ⇒ whole-source fallback; #628-B multiplier applies).`);
  } else {
    console.log(`  ✅ UCF → per-section routing, standard projection basis, no #271 dependency.`);
  }

  // (3) PROJECTION on the operative basis.
  const ratio = totalChars / E133_CHARS;
  const scaled = E133.map((u) => mk(u.label, u.model, Math.round((u.ms||0)*Math.min(1,ratio*1.4)), Math.round(u.input_tokens*ratio), Math.round(u.output_tokens*ratio), Math.round(u.cache_read*ratio), Math.round(u.cache_write*ratio)));
  const rows = summarizePanelUsage(scaled);
  const baseCost = rows.reduce((a, r) => a + r.costUsd, 0);
  const baseProdMs = E133_PRODUCER_MS * Math.min(1, ratio*1.4);
  const baseTotalMs = E133_PREPANEL_MS + baseProdMs;
  const costMult = klass === "commercial" ? FALLBACK_COST_MULT : 1.0;
  const wallMult = klass === "commercial" ? FALLBACK_WALL_MULT : 1.0;
  const cost = baseCost * costMult;
  const totalMs = baseTotalMs * wallMult;
  const headroom = 1 - totalMs / BUDGET_MS;
  console.log(`\n--- (3) PROJECTION (${totalChars.toLocaleString()} chars, ratio ${ratio.toFixed(3)}× E133; basis=${klass === "commercial" ? `#628-B FALLBACK (cost×${FALLBACK_COST_MULT}, wall×${FALLBACK_WALL_MULT})` : "STANDARD per-section"}) ---`);
  console.log(`  COST       clean $${baseCost.toFixed(2)} → operative $${cost.toFixed(2)}  → ${cost <= PANEL_COST_GATE_USD ? "PASS" : "FAIL"} (gate ≤$${PANEL_COST_GATE_USD})`);
  console.log(`  WALL-CLOCK clean ${(baseTotalMs/1000).toFixed(0)}s → operative ${(totalMs/1000).toFixed(0)}s → headroom ${(headroom*100).toFixed(0)}% → ${headroom >= HEADROOM ? "PASS" : "FAIL"} (gate ≥${HEADROOM*100}% of ${BUDGET_MS/1000}s)`);

  // (4) VERDICT-SHAPE readiness — the seq-4 point is INELIGIBLE, not fire-cost.
  const routeReady = klass === "ucf"; // commercial waits on #271 per Brain #641
  const pass = machineReadable && cost <= PANEL_COST_GATE_USD && headroom >= HEADROOM && routeReady && isSdvosb;
  console.log(`\n=== VERDICT-SHAPE: set-aside=${sol.typeOfSetAside ?? "none"} · class=${klass.toUpperCase()} · route-ready=${routeReady} ===`);
  console.log(`=== PRE-SCREEN: ${pass ? "✅ FIRE-READY (pending demo-profile SDVOSB-mismatch confirm + gold-set + pre-fire card)" : "❌ NOT fire-ready" + (klass === "commercial" ? " — COMMERCIAL, blocked on #271 fix" : "")} ===`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("HARNESS THREW:", e instanceof Error ? e.message : e); process.exit(2); });
