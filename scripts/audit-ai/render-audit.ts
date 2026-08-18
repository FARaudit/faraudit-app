// Render an audit report to HTML locally (mirrors route.ts) for FA-195
// verification without the auth wall. Run: npx tsx scripts/audit-ai/render-audit.ts <audit_id>
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as dotenv from "dotenv";
import { buildViewModel } from "../../src/app/audits/[id]/_view-model";
import { renderAuditReportComplete } from "../../src/app/audits/[id]/_render";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";

dotenv.config({ path: ".env.local", quiet: true });

// PANEL-ARTIFACT INTEGRITY (2026-07-30). This script is what the Gauntlet reviews, so it MUST render what production
// serves — "review artifacts run through production composition". It did not: it sourced flags from .env.local, which
// carries NONE of the AUDIT_* render flags, so every export was rendered at the flag state of a developer laptop.
//
// Cost of that, measured: the panel on audit 583df921 reviewed an export with 7 CLIN cells including a fabricated
// "1810" (a street number), and three independent seats fired AUTO-F on it — while production, at its real flag
// state, rendered 26 correct cells (0001-0006, 1001-4005) and no 1810. Seven expert seats spent their review budget
// grading a file no customer could ever receive.
//
// Fix: pull the LIVE production env from Vercel and apply every AUDIT_* plain var before rendering, exactly as the
// forensic scripts do. Fails LOUD rather than silently rendering a laptop-state artifact — a quiet fallback here is
// what produced the phantom in the first place. Set PANEL_RENDER_LOCAL_FLAGS=true to deliberately render at local
// state (for A/B work), which prints a banner saying so.
async function applyProductionFlags(): Promise<string> {
  if (process.env.PANEL_RENDER_LOCAL_FLAGS === "true") return "LOCAL (explicitly requested)";
  const TOKEN = process.env.VERCEL_TOKEN;
  const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
  const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent — cannot resolve the production flag state. Refusing to render a laptop-state artifact a reviewer would mistake for production. Set PANEL_RENDER_LOCAL_FLAGS=true to override deliberately.");
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Vercel env fetch failed (HTTP ${res.status}) — refusing to render at an unknown flag state.`);
  const j = await res.json() as { envs?: Array<{ key: string; value: string; type: string; target: string[] }>; env?: Array<{ key: string; value: string; type: string; target: string[] }> };
  const envs = j.envs ?? j.env ?? [];
  let n = 0;
  for (const e of envs) {
    if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain"
        && Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") {
      process.env[e.key] = e.value; n++;
    }
  }
  return `PRODUCTION (${n} AUDIT_* vars applied from Vercel)`;
}

async function main() {
  const id = process.argv[2];
  const flagState = await applyProductionFlags();
  console.log(`flag-state: ${flagState}`);
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
    const template = readFileSync(join(process.cwd(), "src", "app", "audits", "[id]", "_template.html"), "utf8");
    html = renderAuditReportComplete(template, vm as never, audit as Record<string, unknown>);
    renderPath = "v1";
  }
  const out = `/tmp/audit-${id}.html`;
  writeFileSync(out, html, "utf8");
  console.log("rendered →", out, "·", html.length, "bytes · engine:", engine || "(legacy)", "· render-path:", renderPath);
}
main().catch((e) => { console.error(e); process.exit(1); });
