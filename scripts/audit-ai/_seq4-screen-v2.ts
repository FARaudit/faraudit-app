// SEQ-4 #643-CLASS SCREEN v2 ($0) — mid-size set-aside targets that CERTIFY in-budget (Brain ruling card #655→a).
// Criteria: set-aside program · ≥~50K machine-readable chars (bar groundable IN-BODY — VERIFY the clause is in the
// document text, not just SAM metadata) · ≤~120K chars · whole-source projection (routing_v2 OFF) fits 360s+$2 gate ·
// real attachments · active deadline ≥1 day · item-7 worker parity. Runs ON THE WORKER (deployed code + SAM net).
import { fetchSolicitationByNoticeId } from "./src/lib/sam";
import { assembleSamDocumentSet } from "./src/lib/sam-attachments";
import { pipelinePrescreen } from "./src/lib/cost-prescreen";
import { agenticManifestComplete } from "./src/lib/audit-executor-v3";

const SAM_KEY = process.env.SAM_API_KEY || "";
const SAM_SEARCH = "https://sam.gov/api/prod/opportunities/v2/search";
const MIN_CHARS = 46_000, MAX_CHARS = 84_000;   // groundable-in-body (≥~50K) ↔ WHOLE-SOURCE budget-fit ceiling (~75K → $2/288s)
const ONE_DAY = 86_400_000;

// set-aside program → in-BODY clause/marker regex (must appear in assembled document text to satisfy the criterion)
const PROGRAM_MARKERS: Record<string, RegExp> = {
  SDVOSBC: /service[- ]disabled veteran|\bSDVOSB\b|852\.219-1[01]|52\.219-27/i,
  "8A": /\b8\(a\)\b|52\.219-18|section 8\(a\)/i,
  HZC: /\bHUBZone\b|52\.219-3\b/i,
  WOSB: /women[- ]owned|\bWOSB\b|\bEDWOSB\b|52\.219-(?:29|30)/i,
  VOSB: /veteran[- ]owned|\bVOSB\b|852\.219-9/i,
};
const PROBES = [
  { setAside: "SDVOSBC", naics: "561110", label: "SDVOSB·office admin" },
  { setAside: "SDVOSBC", naics: "541611", label: "SDVOSB·admin consult" },
  { setAside: "SDVOSBC", naics: "611430", label: "SDVOSB·training" },
  { setAside: "8A", naics: "541611", label: "8(a)·admin consult" },
  { setAside: "8A", naics: "611430", label: "8(a)·training" },
  { setAside: "8A", naics: "541612", label: "8(a)·HR consult" },
  { setAside: "8A", naics: "541990", label: "8(a)·prof svcs" },
  { setAside: "WOSB", naics: "541611", label: "WOSB·admin consult" },
  { setAside: "HZC", naics: "541611", label: "HUBZone·admin consult" },
];
const fmt = (d: Date) => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;

async function search(setAside: string, naics: string) {
  const to = new Date(), from = new Date(to.getTime() - 45*ONE_DAY);
  const p = new URLSearchParams({ api_key: SAM_KEY, naicsCode: naics, typeOfSetAside: setAside, postedFrom: fmt(from), postedTo: fmt(to), limit: "25", offset: "0", ptype: "o,k,r" });
  try { const r = await fetch(`${SAM_SEARCH}?${p}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) }); if (!r.ok) return []; return ((await r.json()).opportunitiesData || []) as any[]; } catch { return []; }
}

(async () => {
  if (!SAM_KEY) { console.log("SAM_API_KEY missing"); return; }
  const now = Date.now(), seen = new Set<string>();
  const cands: any[] = [];
  for (const pr of PROBES) {
    const opps = await search(pr.setAside, pr.naics);
    let kept = 0;
    for (const o of opps) {
      const nid = o.noticeId; if (!nid || seen.has(nid)) continue;
      const links = Array.isArray(o.resourceLinks) ? o.resourceLinks.length : 0;
      const dl = o.responseDeadLine ? new Date(o.responseDeadLine).getTime() : 0;
      if (links < 1 || !dl || dl < now + ONE_DAY) continue;     // ≥1 day runway
      seen.add(nid); kept++;
      cands.push({ notice: nid, sol: o.solicitationNumber ?? "?", title: (o.title||"").slice(0,54), setAside: o.typeOfSetAside ?? pr.setAside, naics: o.naicsCode ?? pr.naics, deadline: o.responseDeadLine, links, prog: pr.setAside });
      if (kept >= 3) break;
    }
    console.log(`probe ${pr.label} → ${opps.length} hits, ${kept} active+docs`);
  }
  console.log(`\n${cands.length} candidates with docs + ≥1d runway. Assembling + projecting (whole-source, routing_v2 OFF)...`);
  const scored: any[] = [];
  for (const c of cands.slice(0, 12)) {
    const sol = await fetchSolicitationByNoticeId(c.notice); if (!sol) continue;
    const asm = await assembleSamDocumentSet(sol.noticeId, sol.solicitationNumber, sol.resourceLinks).catch(() => null); if (!asm) continue;
    const ing = (asm as any).ingestion;
    const ingested = (ing?.files ?? []).filter((f: any) => f.ingested);
    const fullSource = [asm.primary?.text ?? "", ...(asm.attachments ?? []).map((a: any) => a?.text ?? "")].join("\n\n");
    const chars = fullSource.length;
    if (chars < MIN_CHARS || chars > MAX_CHARS) { console.log(`  ${c.sol}: ${chars.toLocaleString()}c — ${chars<MIN_CHARS?"THIN":"OVER"}, skip`); continue; }
    const marker = PROGRAM_MARKERS[c.prog];
    const inBody = marker ? marker.test(fullSource) : false;
    const census = { docCount: (asm.attachments?.length ?? 0) + (asm.primary?1:0), machineReadableChars: chars, scannedDocCount: ingested.filter((f: any) => f.has_text !== true).length, totalBytes: ingested.reduce((a: number, f: any) => a + (f.bytes ?? 0), 0), imageBytes: 0 };
    const ws = pipelinePrescreen(census, { budgetMs: 360_000, wholeSourceFallback: true });
    const cr = pipelinePrescreen(census, { budgetMs: 360_000, wholeSourceFallback: false });
    const item7 = (ing?.files_ingested ?? 0) >= (sol.resourceLinks?.length ?? 0) && (ing?.files_ingested ?? 0) === (ing?.files_total ?? -1);
    const complete = agenticManifestComplete(ing, false, true);
    const pass4 = inBody && ws.pass && item7 && complete;
    const fits = ws.pass;   // whole-source is the honest basis; PASS = certifiable at any routing
    scored.push({ ...c, chars, inBody, item7, complete, pass4, wsPass: ws.pass, wsCost: ws.cost.projectedUsd, wsWall: ws.wallClock.projectedSeconds, crCost: cr.cost.projectedUsd, crWall: cr.wallClock.projectedSeconds, fits, docs: census.docCount });
    console.log(`  ${c.sol} · ${c.setAside} · ${c.title}`);
    console.log(`    notice=${c.notice} deadline=${c.deadline} docs=${census.docCount} chars=${chars.toLocaleString()} inBodyClause=${inBody?"✓":"✗"} item7=${item7?"✓":"✗"}`);
    console.log(`    4-FILTER: inBody=${inBody?"✓":"✗"} item7=${item7?"✓":"✗"} complete=${complete?"✓":"✗"} budget=${ws.pass?"✓":"✗"}($${ws.cost.projectedUsd.toFixed(2)}/${ws.wallClock.projectedSeconds.toFixed(0)}s) → ${pass4?"★PASS":"fail"}`);
  }
  scored.sort((a,b) => (b.pass4?1:0)-(a.pass4?1:0) || (b.complete?1:0)-(a.complete?1:0) || (b.inBody?1:0)-(a.inBody?1:0) || b.chars-a.chars);
  console.log(`\n=== RANKED (whole-source-FITS + in-body-clause + item7 first) ===`);
  scored.forEach((r,i) => console.log(`  ${i+1}. ${r.pass4?"★":" "} ${r.sol} ${r.setAside} · ${r.chars.toLocaleString()}c/${r.docs}d · inBody=${r.inBody?"✓":"✗"} item7=${r.item7?"✓":"✗"} complete=${r.complete?"✓":"✗"} budget=${r.wsPass?"✓":"✗"} · WS $${r.wsCost.toFixed(2)}/${r.wsWall.toFixed(0)}s · closes ${r.deadline?.slice(0,10)}`));
})();
