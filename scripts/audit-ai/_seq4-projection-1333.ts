// SEQ-4 pre-fire projection — 1333-26-2091 on the DEPLOYED cost model. Whole-source fanout=5 (routing_v2 OFF →
// no clean routing), the HONEST worst case, vs the $2.50 gate + 360s budget. Run on the worker (deployed code).
import { fetchSolicitationByNoticeId } from "./src/lib/sam";
import { assembleSamDocumentSet } from "./src/lib/sam-attachments";
import { pipelinePrescreen, PANEL_LENS_FANOUT } from "./src/lib/cost-prescreen";

(async () => {
  const sol = await fetchSolicitationByNoticeId("1333-26-2091");
  if (!sol) { console.log("NOT FOUND"); return; }
  const asm = await assembleSamDocumentSet(sol.noticeId, sol.solicitationNumber, sol.resourceLinks);
  if (!asm) { console.log("assemble null"); return; }
  const ing = (asm as any).ingestion;
  const ingestedFiles = (ing?.files ?? []).filter((f: any) => f.ingested);
  const texts = [asm.primary?.text ?? "", ...(asm.attachments ?? []).map((a: any) => a?.text ?? "")];
  const fullSource = texts.join("\n\n");
  const census = {
    docCount: (asm.attachments?.length ?? 0) + (asm.primary ? 1 : 0),
    machineReadableChars: fullSource.length,
    scannedDocCount: ingestedFiles.filter((f: any) => f.has_text !== true).length,
    totalBytes: ingestedFiles.reduce((a: number, f: any) => a + (f.bytes ?? 0), 0),
    imageBytes: ingestedFiles.filter((f: any) => f.has_text !== true).reduce((a: number, f: any) => a + (f.bytes ?? 0), 0),
  };
  console.log(`census: ${census.docCount} docs / ${census.machineReadableChars} chars / ${census.scannedDocCount} scanned / ${(census.totalBytes/1e6).toFixed(2)}MB`);
  for (const [label, whole] of [["WHOLE-SOURCE fanout="+PANEL_LENS_FANOUT+" (routing_v2 OFF — HONEST basis)", true], ["clean-routing fanout=1 (if it routed)", false]] as const) {
    const p = pipelinePrescreen(census, { budgetMs: 360_000, wholeSourceFallback: whole as boolean });
    console.log(`\n[${label}]`);
    console.log(`  COST : $${p.cost.projectedUsd.toFixed(2)} vs gate $${p.cost.gateUsd.toFixed(2)} → ${p.cost.projectedUsd <= p.cost.gateUsd ? "PASS" : "OVER"}`);
    console.log(`  WALL : ${p.wallClock.projectedSeconds.toFixed(0)}s vs limit ${p.wallClock.effectiveLimitSeconds.toFixed(0)}s (budget ${p.wallClock.budgetSeconds}s, ≥${p.wallClock.headroomPct}% headroom) → ${p.wallClock.projectedSeconds <= p.wallClock.effectiveLimitSeconds ? "PASS" : "OVER"}`);
    console.log(`  PIPELINE: ${p.pass ? "PASS" : "REFUSE (refusedBy="+p.refusedBy+")"}`);
  }
})();
