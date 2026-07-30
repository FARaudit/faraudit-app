// SEQ-4 FINAL CONFIRM — 36C24126Q0569 item-6 census (per-doc) + item-7 parity + in-body SDVOSB clause evidence. Worker.
import { fetchSolicitationByNoticeId } from "./src/lib/sam";
import { assembleSamDocumentSet } from "./src/lib/sam-attachments";
const CLAUSE = /(service[- ]disabled veteran[- ]owned small business|SDVOSB|852\.219-1[01]|52\.219-27)/i;
(async () => {
  const sol = await fetchSolicitationByNoticeId("36C24126Q0569");
  if (!sol) { console.log("NOT FOUND"); return; }
  const asm = await assembleSamDocumentSet(sol.noticeId, sol.solicitationNumber, sol.resourceLinks);
  if (!asm) { console.log("assemble null"); return; }
  const ing: any = (asm as any).ingestion;
  console.log(`notice=${sol.noticeId} sol=${sol.solicitationNumber} setAside=${sol.typeOfSetAside} v2resourceLinks=${sol.resourceLinks?.length}`);
  console.log(`ITEM-7: files_total=${ing.files_total} files_ingested=${ing.files_ingested} not_retrieved=${(ing.files||[]).filter((f:any)=>f.not_retrieved).length} → parity ${ing.files_ingested>=(sol.resourceLinks?.length??0)&&ing.files_ingested===ing.files_total?"PASS":"FAIL"}`);
  console.log(`ITEM-6 census (per doc):`);
  const docs = [{name:asm.primary?.name,text:asm.primary?.text,role:"primary"}, ...(asm.attachments||[]).map((a:any)=>({name:a.name,text:a.text,role:"attach"}))];
  let clauseDoc=""; let snippet="";
  for (const d of docs) {
    const t = d.text||""; const m = t.match(CLAUSE);
    if (m && !clauseDoc) { clauseDoc=d.name||"?"; const i=Math.max(0,(m.index||0)-40); snippet=t.slice(i,(m.index||0)+80).replace(/\s+/g," "); }
    console.log(`  [${d.role}] ${(d.name||"?").slice(0,48)} · ${t.length}c · has_text=${t.length>50} · clause=${m?"✓":"·"}`);
  }
  console.log(`IN-BODY SDVOSB CLAUSE: ${clauseDoc?`✓ in "${clauseDoc.slice(0,40)}" → …${snippet}…`:"✗ NOT FOUND"}`);
  const files:any[] = ing.files||[];
  console.log(`ingestion.files listing: ${files.map((f:any)=>`${(f.name||"?").slice(0,24)}(${f.ingested?"ing":"skip"})`).join(" · ")}`);
})();
