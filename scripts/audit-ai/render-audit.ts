// Render an audit report to HTML locally (mirrors route.ts) for FA-195
// verification without the auth wall. Run: npx tsx scripts/audit-ai/render-audit.ts <audit_id>
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as dotenv from "dotenv";
import { buildViewModel } from "../../src/app/audit/[id]/_view-model";
import { renderAuditReportComplete } from "../../src/app/audit/[id]/_render";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const id = process.argv[2];
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data: audit, error } = await admin.from("audits").select("*").eq("id", id).maybeSingle();
  if (error || !audit) { console.error("audit not found:", error?.message); process.exit(1); }

  // Card #428 / Brain ruling — route by ENGINE exactly as /audit/[id]/route.ts:410 does, so the preview tool renders
  // the SAME HTML prod serves (review artifacts must run through production composition). agentic_v3 → V4/V5 report
  // (renderV4/V5ReportFromRow); legacy → the V1 view-model/template path. Prior behavior rendered V1 unconditionally,
  // which is why the panel + Design stamp + root-C fix all measured a render prod does NOT serve for NHR audits.
  const engine = String((audit as Record<string, unknown> as { compliance_json?: { engine?: unknown } }).compliance_json?.engine ?? "");
  const v5On = process.env.AUDIT_REPORT_V5 === "true";
  let html: string; let renderPath: string;
  if (engine === "agentic_v3") {
    html = v5On ? renderV5ReportFromRow(audit as Record<string, unknown>) : renderV4ReportFromRow(audit as Record<string, unknown>);
    renderPath = v5On ? "v5" : "v4";
  } else {
    const vm = buildViewModel(audit as never, { isWatching: false, hasCapabilityStatement: true });
    const template = readFileSync(join(process.cwd(), "src", "app", "audit", "[id]", "_template.html"), "utf8");
    html = renderAuditReportComplete(template, vm as never, audit as Record<string, unknown>);
    renderPath = "v1";
  }
  const out = `/tmp/audit-${id}.html`;
  writeFileSync(out, html, "utf8");
  console.log("rendered →", out, "·", html.length, "bytes · engine:", engine || "(legacy)", "· render-path:", renderPath);
}
main().catch((e) => { console.error(e); process.exit(1); });
