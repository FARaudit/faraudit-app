// $0 — the panel reviewed an export rendered with EVERY REPORT-TRUTH flag OFF (render-audit.ts sources .env.local,
// which carries none of them). Re-render at the PRODUCTION flag state and separate the panel's findings into
// (A) artifacts of the stale render and (B) real defects that survive the fix.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const ID="583df921-9cd9-4fd9-b56a-4f49aee62eb2";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data:row}=await a.from("audits").select("*").eq("id",ID).single();
  for (const k of ["AUDIT_DOC_ANALYZED_TRUTH","AUDIT_NONPRESENCE_HONESTY","AUDIT_PANEL_COMPUTE_OR_ABSENT","AUDIT_CLIN_SCHEDULE_EXTRACT","AUDIT_GATE_REASON_NAMED"]) process.env[k]="true";
  process.env.AUDIT_REPORT_V5="true";
  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const prod = renderV5ReportFromRow(row as never);
  fs.writeFileSync("/tmp/audit-583df921-PRODUCTION-FLAGS.html", prod);
  const stale = fs.readFileSync("/tmp/audit-583df921-9cd9-4fd9-b56a-4f49aee62eb2.html","utf8");
  const t=(h:string)=>h.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
  const S=t(stale), P=t(prod);
  const check=(label:string,re:RegExp)=>console.log(`  ${label.padEnd(52)} stale:${re.test(S)?"PRESENT":"absent "}  production:${re.test(P)?"PRESENT":"absent"}`);
  console.log("PANEL FINDING                                          STALE ARTIFACT     PRODUCTION FLAGS");
  console.log("--- (A) claims that should be FIXED by the flags ---");
  check("CLIN 1810 as a line item", /cl-n mono">1810|cx-clin mono">1810/);
  check("1810 anywhere in a CLIN cell", /1810/);
  check("CLIN 0004 Preventive Maintenance present", /Preventive Maintenance/);
  check("option CLIN 4005 present", /\b4005\b/);
  check("real qty '52 Each' rendered", /52 Each/);
  console.log("--- (B) claims INDEPENDENT of the flags ---");
  check("'mandatory' site visit", /mandatory site visit/i);
  check("coverage header says 100%", /100%/);
  check("PWS 'not provided' claim", /not provided in the assigned source/i);
  check("52.222-43 cited", /52\.222-43/);
  check("52.240-93 cited", /52\.240-93/);
  check("Q&A cutoff 14 Aug", /August 14, 2026|14 Aug 2026/);
  check("EO 14026 raised", /14026/);
  console.log(`\nstale bytes=${stale.length}  production bytes=${prod.length}`);
})();
