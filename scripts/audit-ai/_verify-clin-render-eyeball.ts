import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
for (const k of ["AUDIT_PANEL_COMPUTE_OR_ABSENT","AUDIT_CLIN_SCHEDULE_EXTRACT"]) process.env[k]="true";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await a.from("audits").select("*").eq("id","95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const html = renderV5ReportFromRow(row as any);
  const m = /<table class="grid grid-clin">[\s\S]*?<\/table>/.exec(html);
  if (!m) { console.log("NO CLIN TABLE RENDERED"); process.exit(1); }
  const txt = m[0].replace(/<\/t[dh]>/g," | ").replace(/<\/tr>/g,"\n").replace(/<[^>]+>/g,"").replace(/[ \t]+/g," ");
  console.log("===== THE CLIN TABLE THE CUSTOMER SEES =====");
  console.log(txt.split("\n").slice(0,14).join("\n"));
  console.log("... (" + (txt.split("\n").length-1) + " rows total)");
})();
