// Open the RECORDS behind the 10 census hits — never judge the class from the filename. For each distinct
// (solicitation, document) the census flagged as read-but-never-analyzed, print the region's actual text so the
// question "is this a genuine binding obligation the engine skipped, or an empty stub?" is answered from content.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_census-hit-contents.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";

const WANTED: Array<[string, string]> = [
  ["bb1d6997", "Appendix F Storm Drains Newington.pdf"],
  ["bb1d6997", "36C24126Q0569 0003.docx"],
  ["bb1d6997", "36C24126Q0569 0005.docx"],
  ["8c6fbf67", "RFP_SPRRA2-26-R-0034_AMD 002_SAM.GOV.pdf"],
  ["8c6fbf67", "Request for Proposal_Raytheon_SPRRA2-26-R-0034_AMD 001.pdf"],
  ["8c6fbf67", "Amendment 0003_SPRRA2-26-R-0034_US IDIQ limited Spares Procurement.xlsx"],
];

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.from("audits").select("id,solicitation_number,raw_pdf_text").not("raw_pdf_text", "is", null).limit(200);
  if (error) throw new Error(JSON.stringify(error));
  const { docRegions } = await import("../../src/lib/audit-orchestrator");

  // Does the region carry a DEADLINE / TERM CHANGE — the highest-consequence thing an unanalyzed amendment can hide?
  const DATE_RE = /\b(?:\d{1,2}\s*(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;
  const CHANGE_RE = /\b(?:extend|extended|amend|amended|revis|chang|due date|closing date|response date|offer date|hereby)\w*\b/i;

  for (const [short, docName] of WANTED) {
    const row = (data as Array<{ id: string; solicitation_number: string; raw_pdf_text: string }>).find((r) => r.id.startsWith(short));
    if (!row) { console.log(`\n=== ${short} · NOT FOUND ===`); continue; }
    const reg = docRegions(row.raw_pdf_text).find((r) => r.name === docName);
    if (!reg) { console.log(`\n=== ${short} · region "${docName}" NOT FOUND ===`); continue; }
    const t = reg.text.replace(/\s+/g, " ").trim();
    console.log(`\n${"=".repeat(100)}`);
    console.log(`${short} · ${row.solicitation_number} · ${docName}`);
    console.log(`chars=${reg.text.length}  date-token=${DATE_RE.test(t)}  change-verb=${CHANGE_RE.test(t)}`);
    console.log("-".repeat(100));
    console.log(t.slice(0, 1400));
    if (t.length > 1400) console.log(`… [${t.length - 1400} more chars]`);
  }
  console.log();
  process.exit(0);
})();
