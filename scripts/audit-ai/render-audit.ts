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
import { classifyEnv, equals, describe, applyReadableProductionEnv, type EnvState, type RawVercelEnv } from "./vercel-env-state";

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
//
// SECOND HALF OF THE SAME LESSON (2026-08-10). The loud failure above covers "no token". It did not cover "the token
// worked and the answer still is not knowable": the loop below took only `type === "plain"` vars, so an ENCRYPTED
// AUDIT_* flag was skipped in silence and left OFF locally. Then `renderPath` was derived from
// AUDIT_REPORT_V5 === "true" and stamped onto the artifact — so an encrypted-but-true flag produced an artifact
// labelled "render-path: v4" while production served v5. That is the phantom-CLIN failure again, one layer down:
// a reviewer grading a file no customer could receive, this time with a label asserting the opposite.
//
// The env API returns CIPHERTEXT in `value` for encrypted/sensitive vars (AUDIT_V5_SEAL: 984 chars), so `=== "true"`
// against it is meaningless rather than false. Unreadable is now its own state and it stops the render.
async function applyProductionFlags(): Promise<{ label: string; v5: EnvState | null }> {
  if (process.env.PANEL_RENDER_LOCAL_FLAGS === "true") return { label: "LOCAL (explicitly requested)", v5: null };
  const TOKEN = process.env.VERCEL_TOKEN;
  const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
  const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent — cannot resolve the production flag state. Refusing to render a laptop-state artifact a reviewer would mistake for production. Set PANEL_RENDER_LOCAL_FLAGS=true to override deliberately.");
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Vercel env fetch failed (HTTP ${res.status}) — refusing to render at an unknown flag state.`);
  const j = await res.json() as { envs?: RawVercelEnv[]; env?: RawVercelEnv[] };
  const envs = j.envs ?? j.env ?? [];
  const { applied, unreadable } = applyReadableProductionEnv(envs);
  if (unreadable.length) {
    // Not fatal by itself — but it must be said out loud, because every flag named here is OFF in this render and
    // may be ON in production. Only AUDIT_REPORT_V5 decides the renderer, and that one is checked in main().
    console.log(`⚠ ${unreadable.length} production AUDIT_* var(s) are NOT readable through the env API and are therefore OFF in this render: ${unreadable.join(", ")}`);
  }
  return { label: `PRODUCTION (${applied.length} AUDIT_* vars applied from Vercel)`, v5: classifyEnv(envs, "AUDIT_REPORT_V5") };
}

async function main() {
  const id = process.argv[2];
  const { label: flagState, v5: v5State } = await applyProductionFlags();
  console.log(`flag-state: ${flagState}`);
  if (v5State) console.log(`renderer flag: ${describe(v5State)}`);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data: audit, error } = await admin.from("audits").select("*").eq("id", id).maybeSingle();
  if (error || !audit) { console.error("audit not found:", error?.message); process.exit(1); }

  // Card #428 / Brain ruling — route by ENGINE exactly as /audit/[id]/route.ts:410 does, so the preview tool renders
  // the SAME HTML prod serves (review artifacts must run through production composition). agentic_v3 → V4/V5 report
  // (renderV4/V5ReportFromRow); legacy → the V1 view-model/template path. Prior behavior rendered V1 unconditionally,
  // which is why the panel + Design stamp + root-C fix all measured a render prod does NOT serve for NHR audits.
  const engine = String((audit as Record<string, unknown> as { compliance_json?: { engine?: unknown } }).compliance_json?.engine ?? "");
  // In LOCAL mode the artifact is openly a laptop-state one, so the local flag decides. In PRODUCTION mode the
  // renderer must come from the classified live state: `null` there means unknowable, and an artifact stamped
  // "render-path: v4" on a guess is worse than no artifact.
  const v5Resolved = v5State ? equals(v5State, "true") : process.env.AUDIT_REPORT_V5 === "true";
  if (v5Resolved === null) {
    throw new Error(`AUDIT_REPORT_V5 is present on production but NOT readable through the env API (${describe(v5State!)}). The served renderer cannot be resolved, so this artifact cannot be labelled v4 or v5. Refusing to render. Resolve by execution against the deployed route, re-add the flag as plain, or set PANEL_RENDER_LOCAL_FLAGS=true to render a deliberately local artifact.`);
  }
  const v5On = v5Resolved;
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
