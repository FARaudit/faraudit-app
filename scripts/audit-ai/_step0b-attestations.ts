// DENOMINATOR STEP 0b — the half step 0 could not answer: per-document attestation.
// Re-ingests W911SG27BA002 from SAM (real attachment downloads, NO model calls, $0 in spend) and runs the
// PRODUCTION `sweepConstructionManifest` over the REAL per-document {name,text} array — the input the banked
// run-records do not carry.
//
// G2: this fires no paid run. It touches ingest (fetch + extract) and the deterministic sweep only. The audit
// executor, the lenses, the panel and the verifier are never imported.
//
// Doc ORDER does not affect this measurement: isConstruction fires on the NAICS arm (237310), element presence
// loops every doc, and docAttestations is per-doc. So no primary-election is reproduced here.
import { writeFileSync } from "node:fs";
import { fetchSolicitationByNoticeId } from "/Users/josearodriguezjr./faraudit-app/src/lib/sam";
import { fetchDocumentFromSam } from "/Users/josearodriguezjr./faraudit-app/agents/audit-ai/pdf";
import { sweepConstructionManifest, constructionRequired, constructionCoreMissing } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-construction-manifest";
import { isBindingDoc } from "/Users/josearodriguezjr./faraudit-app/src/lib/sam-attachments";
import { extractText } from "/Users/josearodriguezjr./faraudit-app/src/lib/pdf-text-extractor";

const SOL = "W911SG27BA002";
const NOTICE = "8799e548c40f4ecb91187408ce877023";
const GAP_MS = 120;   // the paced-queue convention; a burst has IP-blocked the worker before
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const s = await fetchSolicitationByNoticeId(NOTICE);
  if (!s) { console.log("notice fetch failed"); process.exit(1); }
  console.log(`${SOL} · naics=${s.naicsCode} · setAside=${s.typeOfSetAside} · resourceLinks=${s.resourceLinks.length}\n`);

  const docs: Array<{ name: string; text: string }> = [];
  const failures: Array<{ url: string; err: string }> = [];
  let i = 0;
  for (const url of s.resourceLinks) {
    i++;
    try {
      const r: any = await fetchDocumentFromSam(url);
      // fetchDocumentFromSam returns BASE64 for pdf/image and extractedText only for docx/xlsx.
      // The per-doc TEXT the sweep needs comes from the same extractor buildAgenticDocs uses.
      let name: string = r.filename ?? `resource-${i}`;
      let text = "";
      if (r.kind === "text") text = r.extractedText ?? "";
      else if (r.kind === "pdf" && r.base64) {
        const { rawText, title } = await extractText(Buffer.from(r.base64, "base64")) as any;
        text = rawText ?? "";
        if (title && !r.filename) name = String(title).slice(0, 90);
      }
      docs.push({ name, text });
      process.stdout.write(`\r  ${i}/${s.resourceLinks.length} ${r.kind.padEnd(5)} ${String(text.length).padStart(7)} chars  ${String(name).slice(0, 40).padEnd(42)}`);
    } catch (e: any) {
      failures.push({ url, err: String(e?.message ?? e).slice(0, 90) });
      process.stdout.write(`\r  FAILED ${i}/${s.resourceLinks.length} ${String(e?.message ?? e).slice(0, 58).padEnd(60)}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`\n\nfetched ${docs.length} · failed ${failures.length}\n`);

  const m = sweepConstructionManifest(docs, s.naicsCode);
  const att = m.docAttestations;

  const noText = att.filter((a) => !a.hasText);
  const readEmpty = att.filter((a) => a.hasText && a.groundableObligations === 0);
  const withObl = att.filter((a) => a.groundableObligations > 0);
  const binding = docs.filter((d) => isBindingDoc({ role: "attachment", name: d.name }));
  const bindingNoText = binding.filter((d) => !att.find((a) => a.name === d.name)?.hasText);

  console.log("── isConstruction + the element carrier (now on REAL per-doc text)");
  console.log(`   isConstruction : ${m.isConstruction}`);
  console.log(`   required       : [${constructionRequired(m).join(", ")}]`);
  console.log(`   coreMissing    : [${constructionCoreMissing(m).join(", ") || "(none)"}]`);
  for (const e of m.elements.filter((e) => e.present)) console.log(`     ${e.key.padEnd(19)} anchor=${JSON.stringify(String(e.anchor).slice(0, 34))} doc=${String(e.sourceDoc).slice(0, 40)}`);

  console.log("\n── THE LAYER STEP 0 COULD NOT SEE — per-document attestation");
  console.log(`   documents ingested                          : ${att.length}`);
  console.log(`   hasText = FALSE  (NEVER attestable ⇒ INCOMPLETE) : ${noText.length}`);
  console.log(`   hasText, obligations = 0 (attest read-and-empty) : ${readEmpty.length}`);
  console.log(`   hasText, obligations > 0 (need a grounded finding): ${withObl.length}`);
  console.log(`   isBindingDoc by name                        : ${binding.length}  (of which no-text: ${bindingNoText.length})`);
  console.log(`   total groundable obligations over FULL text  : ${att.reduce((a, x) => a + x.groundableObligations, 0)}`);

  if (noText.length) {
    console.log("\n   documents that can NEVER be attested (hasText=false):");
    for (const a of noText) console.log(`     · ${a.name.slice(0, 78)}`);
  }
  const top = [...withObl].sort((a, b) => b.groundableObligations - a.groundableObligations).slice(0, 8);
  console.log("\n   heaviest obligation carriers (these must each land a grounded finding):");
  for (const a of top) console.log(`     ${String(a.groundableObligations).padStart(5)}  ${a.name.slice(0, 72)}`);

  if (failures.length) {
    console.log("\n   fetch failures (excluded from the sweep — they would be uncovered in production too):");
    for (const f of failures.slice(0, 10)) console.log(`     · ${f.err}`);
  }

  writeFileSync("/tmp/ua2/step0b-attestations.json", JSON.stringify({ sol: SOL, naics: s.naicsCode,
    isConstruction: m.isConstruction, required: constructionRequired(m), coreMissing: constructionCoreMissing(m),
    docs: att, failures }, null, 2));
  console.log("\nwrote /tmp/ua2/step0b-attestations.json");
})();
