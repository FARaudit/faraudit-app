// ITEM-7 (Brain #648 / ROOT-1+ROOT-2) — worker-side ingest-parity probe. MUST run ON THE WORKER (the seq-4 defect
// was worker-got-1-doc vs local-got-7 — a worker network/SAM path difference; a local probe is a false proof,
// feedback_prefire_ingest_parity_on_worker). Proves, on the DEPLOYED code + worker env: the v2 resourceLinks
// (independent expected-set) parity against what actually ingested, and whether ROOT-2's EXISTS gate would fire.
// $0 — fetch + assemble only, NO model call. Run: cd /app && node_modules/.bin/tsx /tmp/item7.ts
import { fetchSolicitationByNoticeId } from "./src/lib/sam";
import { assembleSamDocumentSet } from "./src/lib/sam-attachments";

const TARGETS = ["36C24626Q0724", "1333-26-2091"];

(async () => {
  for (const t of TARGETS) {
    console.log(`\n═══ ITEM-7 · ${t} ═══`);
    try {
      const sol = await fetchSolicitationByNoticeId(t);
      if (!sol) { console.log(`  ✗ NOT FOUND on SAM (closed/withdrawn or sol# drift)`); continue; }
      const rl = sol.resourceLinks?.length ?? 0;
      console.log(`  noticeId=${sol.noticeId} · solnum=${sol.solicitationNumber} · v2 resourceLinks=${rl} · setAside=${sol.typeOfSetAside ?? "none"}`);
      const asm = await assembleSamDocumentSet(sol.noticeId, sol.solicitationNumber, sol.resourceLinks).catch((e) => { console.log(`  assemble threw: ${e?.message ?? e}`); return null; });
      if (!asm) { console.log(`  ✗ assemble returned null (manifest unavailable) → ROOT-1 no-silent-degrade would route INCOMPLETE`); continue; }
      const ing = asm.ing ?? (asm as any).ingestion;
      const filesTotal = ing?.files_total ?? "?";
      const filesIngested = ing?.files_ingested ?? "?";
      const notRetrieved = (ing?.files ?? []).filter((f: any) => f?.not_retrieved === true).length;
      const fullSourceChars = ((asm.primary?.text?.length ?? 0) + (asm.attachments ?? []).reduce((s: number, a: any) => s + (a?.text?.length ?? 0), 0));
      const gateFires = typeof filesIngested === "number" && typeof filesTotal === "number" && filesIngested < filesTotal;
      const parity = rl > 0 ? (filesIngested === rl || (typeof filesIngested === "number" && filesIngested >= rl)) : true;
      console.log(`  ingestion: files_total(EXISTS)=${filesTotal} · files_ingested=${filesIngested} · not_retrieved placeholders=${notRetrieved} · fullSource≈${fullSourceChars} chars`);
      console.log(`  PARITY (files_ingested >= v2 resourceLinks ${rl}): ${parity ? "✅ PASS" : "❌ SHORTFALL"} · ROOT-2 EXISTS gate would ${gateFires ? "FIRE → INCOMPLETE (honest)" : "pass (complete)"}`);
    } catch (e: any) {
      console.log(`  ✗ probe error: ${e?.message ?? e}`);
    }
  }
  console.log("\n═══ ITEM-7 done ═══");
})();
