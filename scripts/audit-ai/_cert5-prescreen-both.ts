// $0 PRE-FIRE PRE-SCREEN — CERT-5 stress pair T1 SPRRA2-26-R-0034 (false-BID trap) + T2 36C24126Q0569 (false-INELIGIBLE
// trap). Library paths only. Per target: notice metadata · per-doc census · item-6 reconcile · machine-readable gate ·
// trap-bar groundability · routing class · cost/wall projection vs gates. NO Claude calls. Verdict is NOT predicted —
// only fire-readiness (a real run reveals the pole; CEO clicks).
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { resolveSamDescription } from "../../src/lib/sam-description";
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { extractText, meaningfulCharCount } from "../../src/lib/pdf-text-extractor";
import { detectDocumentClass, ucfHeaderCount } from "../../src/lib/panel-doc-class";
import { summarizePanelUsage, PANEL_COST_GATE_USD } from "../../src/lib/agentic-panel-runner";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

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

const TARGETS = [
  { sol: "SPRRA2-26-R-0034", archetype: "T1 false-BID trap", barRe: /sole\s*source|only\s+one\s+responsible\s+source|6\.302|justification\s+and\s+approval|Raytheon/i, barName: "sole-source lock (uncontrollable) → engine must NOT BID" },
  { sol: "36C24126Q0569",   archetype: "T2 false-INELIGIBLE trap", barRe: /SDVOSB|service-disabled|852\.219-7[35]|VetCert|verified.{0,20}veteran/i, barName: "SDVOSB set-aside — firm HOLDS SDVOSB → bar cleared → engine must BID" },
];

async function screen(t: typeof TARGETS[number], admin: any) {
  console.log(`\n════════ ${t.archetype} · ${t.sol} ════════`);
  const { data } = await admin.from("pending_audits").select("notice_id, title, set_aside, naics_code, agency, response_deadline").eq("solicitation_number", t.sol).limit(1);
  const meta = data?.[0];
  if (!meta) { console.log("  ❌ no pending_audits row"); return false; }
  const s = await fetchSolicitationByNoticeId(meta.notice_id);
  if (!s) { console.log("  ❌ SAM resolve FAILED"); return false; }
  console.log(`  ${(meta.title||"").slice(0,58)} · setaside=${meta.set_aside} · naics=${meta.naics_code} · due=${(meta.response_deadline||"").slice(0,10)} · SAM active=${s.active}`);

  const resolved = await resolveSamDescription(s.noticeId, s.description);
  const body = resolved.fetched ? resolved.text : "";
  const set = await assembleSamDocumentSet(s.noticeId, t.sol);
  const bufs = set ? ([set.primary, ...set.attachments].filter(Boolean) as Array<{name:string;buffer:Buffer}>) : [];

  let totalChars = body.trim().length, readable = body.trim().length >= 200 ? 1 : 0, assembled = "\n" + body;
  const listing: string[] = body.trim().length ? [`[L1 NOTICE BODY] ${body.length}c`] : [];
  const thin: string[] = [];
  for (const d of bufs) {
    let text = "", pages = 0; try { const ex = await extractText(d.buffer); text = ex?.rawText ?? ""; pages = ex?.pageCount ?? 0; } catch {}
    const n = text.trim().length; totalChars += n; assembled += "\n" + text;
    const scanned = d.buffer.length > 1_000_000 && n / d.buffer.length < 0.02;
    if (n >= 200) readable++; else thin.push(`${d.name.slice(0,30)}(${n}c)`);
    listing.push(`${d.name.slice(0,38)} ${n}c ${scanned ? "SCANNED" : n >= 200 ? "machine-readable" : "thin"} p${pages||"?"}`);
  }
  const censusCount = bufs.length + (body.trim().length ? 1 : 0);
  const item6 = listing.length === censusCount;
  const machineReadable = readable >= 1 && totalChars >= 2000;
  const barGrounded = t.barRe.test(assembled);
  const hdrs = ucfHeaderCount(assembled), klass = detectDocumentClass(assembled), isUcf = klass === "ucf";

  console.log(`  CENSUS: ${censusCount} docs · machine-readable ${readable}/${censusCount} · total ${totalChars.toLocaleString()}c${thin.length ? ` · thin: ${thin.join(", ")}` : ""}`);
  console.log(`  ITEM-6 reconcile (listing ${listing.length} vs census ${censusCount}): ${item6 ? "✅ MATCH" : "❌ MISMATCH"}`);
  console.log(`  MACHINE-READABLE gate: ${machineReadable ? "✅ PASS" : "❌ REJECT (thin/garbled → INCOMPLETE risk)"}`);
  console.log(`  TRAP-BAR groundable in source [${t.barName}]: ${barGrounded ? "✅ YES" : "❌ NOT FOUND"}`);
  console.log(`  ROUTING: UCF headers=${hdrs} → ${klass.toUpperCase()} ${isUcf ? "(per-section, mult=1)" : "(commercial → whole-source)"}`);

  const ratio = totalChars / E133_CHARS;
  const scaled = E133.map((u) => mk(u.label, u.model, Math.round((u.ms||0)*Math.min(1,ratio*1.4)), Math.round(u.input_tokens*ratio), Math.round(u.output_tokens*ratio), Math.round(u.cache_read*ratio), Math.round(u.cache_write*ratio)));
  const baseCost = summarizePanelUsage(scaled).reduce((a, r) => a + r.costUsd, 0);
  const baseMs = E133_PREPANEL_MS + E133_PRODUCER_MS * Math.min(1, ratio*1.4);
  const cost = baseCost * (isUcf ? 1 : 4.0), totalMs = baseMs * (isUcf ? 1 : 1.6);
  const headroom = 1 - totalMs / BUDGET_MS;
  console.log(`  PROJECTION (${totalChars.toLocaleString()}c, ${ratio.toFixed(3)}× E133): COST ~$${cost.toFixed(2)} → ${cost <= PANEL_COST_GATE_USD ? "✅" : "❌"} (gate ≤$${PANEL_COST_GATE_USD}) · WALL ~${(totalMs/1000).toFixed(0)}s → headroom ${(headroom*100).toFixed(0)}% → ${headroom >= HEADROOM ? "✅" : "❌"} (gate ≥20%)`);

  const ready = machineReadable && item6 && barGrounded && cost <= PANEL_COST_GATE_USD && headroom >= HEADROOM;
  console.log(`  ── FIRE-READY: ${ready ? "✅ YES (pending CEO greenlight + click)" : "❌ NO — resolve above"} ──`);
  return ready;
}

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const results: boolean[] = [];
  for (const t of TARGETS) results.push(await screen(t, admin));
  console.log(`\n════════ SUMMARY: ${results.filter(Boolean).length}/${TARGETS.length} fire-ready ════════`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
