// $0 read-only. GATE 1 for the SF-30 / SF-1449 form-field VALUE loss.
//
// The claim (panel eab43ada): both SF-30 amendment regions carry the Block 11 kill-gate verbatim AND the Block 14
// HEADING "14. DESCRIPTION OF AMENDMENT/MODIFICATION", but NOT the text under it. Label kept, value dropped —
// the same class as the SF-1449 loss on run 583df921 (set-aside % and size standard invisible).
//
// HYPOTHESIS TO TEST, and it decides the whole fix: SF-30 and SF-1449 are AcroForm PDFs. A form's printed
// LABELS live in the page CONTENT STREAM; the values typed into it live in the field dictionaries' /V entries,
// which are annotation objects. pdf-parse's getText() reads the content stream. If that is the mechanism, then
// no amount of tuning the text extraction recovers the values — they were never in the text layer — and the fix
// is to read the AcroForm field objects and append them. Structural prediction: every LABEL present, every
// TYPED value absent, and PREPRINTED values (form revision, page numbers) present.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from("audits").select("raw_pdf_text").eq("id", AUDIT).single();
  if (error || !data) { console.error("FATAL:", error?.message); process.exit(1); }
  const full = (data as any).raw_pdf_text as string;

  const heads = [...full.matchAll(/^====\s*DOCUMENT:\s*(.+?)\s*====$/gm)]
    .map((m) => ({ name: m[1], at: m.index as number, len: m[0].length }));
  const regions = heads.map((h, i) => ({
    name: h.name,
    text: full.slice(h.at + h.len, i + 1 < heads.length ? heads[i + 1].at : full.length),
  }));
  const sf30 = regions.filter((r) => /SF ?30/i.test(r.name));

  for (const r of sf30) {
    console.log(`\n${"=".repeat(96)}\n### ${r.name}  (${r.text.length} chars)\n${"=".repeat(96)}`);

    console.log("\n-- STRUCTURAL PREDICTION: labels present, typed values absent --");
    const LABELS = [
      "AMENDMENT OF SOLICITATION", "CONTRACT ID CODE", "EFFECTIVE DATE", "REQUISITION/PURCHASE REQ",
      "ISSUED BY", "ADMINISTERED BY", "NAME AND ADDRESS OF CONTRACTOR",
      "THE ABOVE NUMBERED SOLICITATION IS AMENDED", "DESCRIPTION OF AMENDMENT/MODIFICATION",
      "NAME AND TITLE OF SIGNER", "CONTRACTING OFFICER",
    ];
    const TYPED = [
      "purpose of this amendment", "Version 2", "question(s) and answer", "Q&A",
      "hereby amended", "is extended", "is hereby extended",
    ];
    const kill = "FAILURE OF YOUR ACKNOWLEDGMENT";
    console.log("  LABELS (content-stream, should survive):");
    for (const l of LABELS) console.log(`    ${r.text.toUpperCase().includes(l.toUpperCase()) ? "present" : "ABSENT "}  ${l}`);
    console.log("  TYPED VALUES (AcroForm /V, predicted absent):");
    for (const t of TYPED) console.log(`    ${r.text.toLowerCase().includes(t.toLowerCase()) ? "present" : "ABSENT "}  ${t}`);
    console.log(`  KILL-GATE (preprinted): ${r.text.toUpperCase().includes(kill) ? "present" : "ABSENT"}  "${kill}…"`);

    console.log("\n-- WHAT FOLLOWS THE BLOCK 14 HEADING (the value slot) --");
    const i14 = r.text.toUpperCase().indexOf("DESCRIPTION OF AMENDMENT");
    console.log(i14 < 0 ? "    heading not found" : "    " + JSON.stringify(r.text.slice(i14, i14 + 420)));

    console.log("\n-- FULL REGION, verbatim (it is small enough to just read) --");
    console.log(r.text.split("\n").map((l, n) => `    ${String(n).padStart(3)}| ${l}`).join("\n"));
  }
})();
