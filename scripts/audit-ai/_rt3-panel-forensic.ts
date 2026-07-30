// $0 FORENSIC — REPORT-TRUTH fix #3. The §L / §M / CLIN panels in v4-report/build-data.ts assert structure they
// never computed. Reproduces the three panel builders against the REAL findings of run 95698f91.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await admin.from("audits").select("compliance_json,raw_pdf_text").eq("id", "95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const cj = (row as any).compliance_json;
  const full: string = (row as any).raw_pdf_text;
  const findings = cj.v3.findings as Array<Record<string, any>>;

  // The exact scrape from build-data.ts:316.
  const SCRAPE = /\b(\d{4})\b/;
  console.log("===== D1 · THE 4-DIGIT CLIN SCRAPE, over finding PROSE =====");
  const clinish = findings.filter((f) => f.kind === "clin" || /clin|schedule|0001|section b/i.test(String(f.citation ?? "")));
  console.log(`findings that would enter buildClins: ${clinish.length}\n`);
  for (const f of findings) {
    const req = String(f.requirement ?? ""), cite = String(f.citation ?? "");
    const m = req.match(SCRAPE) || cite.match(SCRAPE);
    if (!m) continue;
    const tok = m[1];
    // Is this token actually a CLIN in the source, or is it something else that happens to have 4 digits?
    const asClin = new RegExp(`(?:CLIN|ITEM|Item No\\.?)\\s*0*${tok}\\b`, "i").test(full);
    if (!asClin) console.log(`  ⚠ "${tok}" scraped from: "${req.slice(0, 130).replace(/\s+/g, " ")}"  → NOT a CLIN in source`);
  }

  console.log("\n===== the real CLIN set in the source =====");
  const realClins = [...new Set([...full.matchAll(/\b(?:CLIN|ITEM NO\.?)\s*(\d{4})\b/gi)].map((m) => m[1]))].sort();
  console.log(`  ${realClins.length} distinct: ${realClins.join(", ")}`);

  console.log("\n===== D2/D3 · what the panels HARDCODE =====");
  console.log("  buildSubmissionL → vol:'' (never computed)   · grounded:true HARDCODED");
  console.log("  buildEvalM       → basis:'' (never computed) · grounded:true HARDCODED");
  console.log("  buildClins       → type:'', qtyUnit:'', period:'' (never computed) · grounded:true HARDCODED");
})();
