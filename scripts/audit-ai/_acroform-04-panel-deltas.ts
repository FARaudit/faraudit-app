// The measurement, stated against the panel's OWN absent-string list. Each string below was recorded as
// missing from run eab43ada's export; this asks, for the two real SF-30s, whether it is present in the page
// text (before) and whether the AcroForm block recovers it (after).
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractText } from "../../src/lib/pdf-text-extractor";

const DIR = "/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app/7bdd960c-8373-4c42-a119-6c3262878ce1/scratchpad";
const FILES = ["Solicitation_Amendment_W50S6U26QA0190001_SF_30.pdf", "Solicitation_Amendment_W50S6U26QA0190002_SF_30.pdf"];

// Every one of these was measured ABSENT from the run's assembled source by the adjudication panel.
const PANEL_ABSENT = [
  "purpose of this amendment",
  "Version 2",
  "acknowledge",
  "questions",
  "extend the quotations due date",
  "KRISTIAN",
];

const firstGroup = (re: RegExp, s: string): string | undefined => (s.match(re) || [])[1];

(async () => {
  for (const f of FILES) {
    const buf = readFileSync(join(DIR, f));
    delete process.env.AUDIT_INGEST_ACROFORM_FIELDS;
    const before = (await extractText(buf)).rawText;
    process.env.AUDIT_INGEST_ACROFORM_FIELDS = "true";
    const after = (await extractText(buf)).rawText;
    delete process.env.AUDIT_INGEST_ACROFORM_FIELDS;

    console.log(`\n### ${f}`);
    console.log(`    page text ${before.length} chars → with form fields ${after.length} chars (+${after.length - before.length})`);
    console.log("    string".padEnd(38) + "before   after");
    for (const s of PANEL_ABSENT) {
      const b = before.toLowerCase().includes(s.toLowerCase());
      const a = after.toLowerCase().includes(s.toLowerCase());
      console.log(`    ${s.slice(0, 34).padEnd(36)}${b ? "yes" : "NO "}      ${a ? "yes" : "NO "}${!b && a ? "   <- RECOVERED" : ""}`);
    }

    // The deadline question the page text cannot answer.
    const ext = firstGroup(/OffrExt \[checkbox\] = (\S+)/, after);
    const noExt = firstGroup(/OffrNoEx \[checkbox\] = (\S+)/, after);
    console.log(`    page text says BOTH ("is extended." AND "is not extended."): ${before.includes("is extended.") && before.includes("is not extended.")}`);
    console.log(`    form resolves it -> OffrExt=${ext}  OffrNoEx=${noExt}  => offers ${ext && ext !== "Off" ? "WERE EXTENDED" : "were NOT extended"}`);
  }
})();
