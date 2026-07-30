// DECISIVE: does 36C24126Q0569 land COMPLETE or INCOMPLETE? (the WEBGIS image-only attachment content-loss check)
import { fetchSolicitationByNoticeId } from "./src/lib/sam";
import { assembleSamDocumentSet, isBindingDoc } from "./src/lib/sam-attachments";
import { agenticManifestComplete, bindingContentLossDocs } from "./src/lib/audit-executor-v3";
(async () => {
  const sol = await fetchSolicitationByNoticeId("36C24126Q0569");
  const asm = await assembleSamDocumentSet(sol!.noticeId, sol!.solicitationNumber, sol!.resourceLinks);
  const ing: any = (asm as any).ingestion;
  const complete = agenticManifestComplete(ing, false, true);
  const loss = bindingContentLossDocs(ing);
  console.log(`agenticManifestComplete = ${complete}  → verdict-cap = ${complete ? "COMPLETE (no cap)" : "INCOMPLETE"}`);
  console.log(`binding-content-loss docs (${loss.length}): ${loss.map((f:any)=>`${(f.name||"?").slice(0,30)} has_text=${f.has_text}`).join(" · ")||"none"}`);
  for (const f of (ing.files||[])) console.log(`  ${(f.name||"?").slice(0,34)} · ingested=${f.ingested} has_text=${f.has_text} isBinding=${isBindingDoc(f)}`);
})();
