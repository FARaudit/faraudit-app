import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
(async () => {
  const { fetchSolicitationByNoticeId } = await import("../../src/lib/sam");
  const { assembleSamDocumentSet } = await import("../../src/lib/sam-attachments");
  const { extractText } = await import("../../src/lib/pdf-text-extractor");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const WANT: Record<string, string[]> = {
    "SPRRA2-26-R-0034": ["RFP SPRRA2-26-R-0034.pdf"],
    "36C24126Q0569": ["36C24126Q0569.docx", "36C24126Q0569 0001.docx"],
  };
  for (const [sol, names] of Object.entries(WANT)) {
    const { data } = await admin.from("pending_audits").select("notice_id").eq("solicitation_number", sol).limit(1);
    const s = await fetchSolicitationByNoticeId(data![0].notice_id);
    const set = await assembleSamDocumentSet(s!.noticeId, sol);
    for (const d of [set?.primary, ...(set?.attachments ?? [])].filter(Boolean) as Array<{name:string;buffer:Buffer}>) {
      if (!names.includes(d.name)) continue;
      const text = (await extractText(d.buffer))?.rawText ?? "";
      const head = text.slice(0, 1200).replace(/\n{2,}/g, "\n");
      console.log(`\n── ${sol} · ${d.name} (${text.length}c) head:`);
      console.log(head);
      const FORM = /\bSF ?1449\b|SOLICITATION\/CONTRACT\/ORDER FOR COMMERCIAL|STANDARD FORM 1449|\bSF ?1442\b|SOLICITATION,? OFFER,? AND AWARD|STANDARD FORM 1442|\bSF ?33\b|STANDARD FORM 33|\bSF ?18\b|REQUEST FOR QUOTATIONS?\b/i;
      const AMD = /amendment of solicitation[\s\/]{0,3}modification of contract\b/i;
      console.log(`  FORM_RE in 20k head: ${FORM.test(text.slice(0,20000))} · AMD_RE: ${AMD.test(text.slice(0,20000))} · SECTION-headings: ${(text.match(/^\s*SECTION [A-M]\b/gim)||[]).length}`);
    }
  }
})();
