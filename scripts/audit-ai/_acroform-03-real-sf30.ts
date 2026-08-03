// CEO authorized the fetch in words 2026-08-03 ("merge and fetch").
//
// THE QUESTION THIS SETTLES, and nothing else: do the REAL SAM-published SF-30s for W50S6U26QA019 carry a live
// AcroForm whose /V values we can recover, or is page 1 flattened / XFA / genuinely blank? PR #405 shipped the
// recovery proven against a fixture that reproduces the defect STRUCTURE; the benefit on this document class
// was explicitly left unproven. This measures it.
//
// Downloads via the project's own manifest path (fetchAttachmentManifest), not an ad-hoc URL. Files are written
// to the session scratchpad, never into the repo. The API key is never printed (Rules 32/46).
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchAttachmentManifest } from "../../src/lib/sam-attachments";
import { extractText } from "../../src/lib/pdf-text-extractor";
import { recoverAcroFormFields } from "../../src/lib/pdf-acroform-fields";

const NOTICE = "1e3e02dbe95e4561a522d902824060d5";
const OUT = process.env.SCRATCH_DIR || "/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app/7bdd960c-8373-4c42-a119-6c3262878ce1/scratchpad";

(async () => {
  mkdirSync(OUT, { recursive: true });
  const manifest = await fetchAttachmentManifest(NOTICE);
  if (!manifest) { console.error("FATAL: manifest null (key absent or notice id rejected)"); process.exit(1); }
  console.log(`manifest: ${manifest.length} resource(s)`);
  for (const m of manifest) console.log(`  ${String(m.sizeBytes ?? "?").padStart(9)} B  ${m.name}`);

  const targets = manifest.filter((m) => /SF ?30|amend/i.test(m.name));
  console.log(`\nSF-30 targets: ${targets.length}`);
  if (!targets.length) { console.error("no SF-30 in the manifest"); process.exit(1); }

  const key = process.env.SAM_API_KEY;
  for (const t of targets) {
    const url = t.url.includes("api_key=") ? t.url : `${t.url}${t.url.includes("?") ? "&" : "?"}api_key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) { console.log(`\n${t.name}: HTTP ${res.status} — skipped`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const path = join(OUT, t.name.replace(/[^\w.\-]/g, "_"));
    writeFileSync(path, buf);
    console.log(`\n${"=".repeat(94)}\n### ${t.name}  (${buf.length} bytes) → ${path}\n${"=".repeat(94)}`);

    // 1. Does it even declare an AcroForm? Read the raw bytes — cheapest possible discriminator.
    const latin = buf.toString("latin1");
    console.log(`  /AcroForm token in bytes : ${latin.includes("/AcroForm")}`);
    console.log(`  /XFA token in bytes      : ${latin.includes("/XFA")}`);
    console.log(`  /Widget annotations      : ${(latin.match(/\/Widget/g) || []).length}`);
    console.log(`  /FT (field type) count   : ${(latin.match(/\/FT\s*\//g) || []).length}`);

    // 2. What does pdfjs actually give us?
    const mod: any = require("pdf-parse");
    const Ctor = mod?.PDFParse ?? mod?.default ?? mod;
    const inst = new Ctor({ data: buf });
    await inst.getText();
    const af = await recoverAcroFormFields((inst as any).doc);
    console.log(`  recoverAcroFormFields    : ${af.refused ? `REFUSED — ${af.refused}` : `${af.fields.length} field(s)`}`);
    for (const f of af.fields.slice(0, 40)) {
      console.log(`      [p${f.page + 1}] ${f.name} [${f.type}] = ${JSON.stringify(f.value).slice(0, 90)}`);
    }
    if (af.fields.length > 40) console.log(`      … and ${af.fields.length - 40} more`);
    await inst.destroy?.();

    // 3. End to end through the production entry point, flag ON — what the engine would actually receive.
    process.env.AUDIT_INGEST_ACROFORM_FIELDS = "true";
    const on = await extractText(buf);
    delete process.env.AUDIT_INGEST_ACROFORM_FIELDS;
    const i = on.rawText.indexOf("==== FORM FIELD VALUES");
    console.log(`\n  --- appended block (via extractText) ---`);
    console.log(i < 0 ? "      (none — nothing recovered)" : on.rawText.slice(i).split("\n").slice(0, 45).map((l) => "      " + l).join("\n"));
  }
})();
