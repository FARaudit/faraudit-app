// Investigate the F-2 (AUDIT_SEVERITY_HONEST) −12818-char v5 delta on row 8dfd0c9a. What does ON remove/change?
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.from("audits").select("*").ilike("solicitation_number","FA303026Q0020").order("created_at",{ascending:false}).limit(20);
  const row = (data||[]).find((r:any)=>String(r.id).startsWith("8dfd0c9a")) || (data||[])[0];
  process.env.AUDIT_REPORT_V5="true"; process.env.AUDIT_V5_SEAL="true"; process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE="true";
  delete process.env.AUDIT_SEVERITY_HONEST; const off = renderV5ReportFromRow(row);
  process.env.AUDIT_SEVERITY_HONEST="true"; const on = renderV5ReportFromRow(row);
  console.log("id", row.id, "| off len", off.length, "| on len", on.length, "| Δ", on.length-off.length);
  // section-count diff: count data-sec sections + finding rows in each
  const count = (h:string,re:RegExp)=> (h.match(re)||[]).length;
  console.log("\nsections (data-sec):   off", count(off,/data-sec/g), " on", count(on,/data-sec/g));
  console.log("finding rows (find-row/fr-): off", count(off,/class="fr /g)+count(off,/find-row/g), " on", count(on,/class="fr /g)+count(on,/find-row/g));
  console.log("'Critical' occurrences: off", count(off,/Critical/g), " on", count(on,/Critical/g));
  console.log("'Gate' occurrences:     off", count(off,/\bGate\b/g), " on", count(on,/\bGate\b/g));
  console.log("'Advisory' occurrences: off", count(off,/Advisory/g), " on", count(on,/Advisory/g));
  console.log("'Unrated' occurrences:  off", count(off,/[Uu]nrated/g), " on", count(on,/[Uu]nrated/g));
  // Find first divergence region
  let i=0; while(i<off.length && i<on.length && off[i]===on[i]) i++;
  console.log("\nfirst divergence @char", i);
  console.log("OFF ±: ...", off.slice(Math.max(0,i-60), i+160).replace(/\s+/g," "), "...");
  console.log("ON  ±: ...", on.slice(Math.max(0,i-60), i+160).replace(/\s+/g," "), "...");
})();
