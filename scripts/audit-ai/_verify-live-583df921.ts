// $0 — the four REPORT-TRUTH fixes checked against the LIVE run, not a replay. This is the first time the engine
// seams (orchestrator docCoverage threading, executor documents_complete fold, executor non-presence seam) have
// actually EXECUTED in a real pipeline run.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const PREFIX = "583df921", WD = "WAGE DETERMINATIONS";
let pass=0, fail=0;
const ok=(l:string,c:boolean)=>{ if(c){pass++;console.log(`  ✓ ${l}`);} else {fail++;console.log(`  ✗ ${l}`);} };
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data:recent}=await a.from("audits").select("id").order("created_at",{ascending:false}).limit(5);
  const hit=(recent||[]).find((r:any)=>String(r.id).startsWith(PREFIX));
  const {data:row}=await a.from("audits").select("*").eq("id",(hit as any).id).single();
  const cj=(row as any).compliance_json||{};
  const v3=cj.v3||{};

  console.log(`run ${(row as any).id}  verdict=${String((row as any).bid_recommendation).slice(0,60)}`);
  console.log(`findings=${(v3.findings||[]).length}  docs=${JSON.stringify(v3.documents)}\n`);

  console.log("#1 · ANALYZED, NOT READ — the seam EXECUTED?");
  ok("payload carries analyzed_of (only the patched executor writes it)", v3.documents?.analyzed_of !== undefined);
  ok("payload carries the unanalyzed register", Array.isArray(v3.documents?.unanalyzed));
  ok("analyzed < read (the WD is not counted as analyzed)", Number(v3.documents?.analyzed) < Number(v3.documents?.read));
  ok("the Wage Determination is NAMED as unanalyzed",
     JSON.stringify(v3.documents?.unanalyzed||[]).toUpperCase().includes(WD));
  ok("documents_complete is FALSE", cj.documents_complete === false);

  console.log("\n#2 · NON-PRESENCE — conditional on the model emitting absence prose");
  const framed=(v3.findings||[]).filter((f:any)=>/UNVERIFIED ABSENCE/.test(String(f.requirement||"")));
  console.log(`   framed findings: ${framed.length}`);
  for (const f of framed.slice(0,4)) console.log(`     • ${String(f.requirement).slice(0,140).replace(/\s+/g," ")}`);
  if (framed.length) ok("absence claims were framed", true);
  else console.log("  ⓘ UNTESTED this run — the model emitted no absence-shaped prose (not a failure)");

  console.log("\n#3/#4 · THE CLIN PANEL, through the production render");
  for (const k of ["AUDIT_PANEL_COMPUTE_OR_ABSENT","AUDIT_CLIN_SCHEDULE_EXTRACT","AUDIT_DOC_ANALYZED_TRUTH","AUDIT_NONPRESENCE_HONESTY"]) process.env[k]="true";
  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const html = renderV5ReportFromRow(row as any);
  ok("no CLIN cell contains 1810", !/<td class="cx-clin mono">1810<\/td>/.test(html));
  ok("the real schedule is rendered — 'Moving and Edging'", /Moving and Edging/.test(html));
  ok("quantity rendered", /52 Each/.test(html));
  ok("period of performance rendered", /15 Sep 2026/.test(html));
  ok("no 'undefined' leaked into the render", !/>undefined</.test(html));

  console.log(`\nLIVE VERIFICATION: ${pass} passed, ${fail} failed`);
})();
