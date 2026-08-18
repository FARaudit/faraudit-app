// PANEL GATE-4 RENDER — resolve audit by id-prefix, render on the SERVED surface (v5 + live prod config).
// Fidelity per [[reference_offline_render_verification_fidelity]]: select("*") · live Vercel prod AUDIT_* pull ·
// env set BEFORE the render module is imported (dynamic import) so no module-level flag can freeze false.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const PREFIX = process.argv[2];
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

  // 1) Resolve the id-prefix → the full row (select("*") — raw_pdf_text is build-layer input).
  // id is uuid — LIKE is invalid on uuid; resolve the prefix by exact-match on the canonical 8-4-4-4-12 shape
  // when a full uuid is given, else scan recent rows and match the prefix client-side.
  let rows: Record<string, any>[] | null = null;
  let error: { message: string } | null = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(PREFIX)) {
    const r = await admin.from("audits").select("*").eq("id", PREFIX);
    rows = r.data as Record<string, any>[] | null; error = r.error;
  } else {
    const r = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
    error = r.error;
    rows = ((r.data ?? []) as Record<string, any>[]).filter((x) => String(x.id).startsWith(PREFIX));
  }
  if (error) { console.error("query failed:", error.message); process.exit(1); }
  if (!rows || rows.length !== 1) { console.error(`expected 1 row for prefix ${PREFIX}, got ${rows?.length ?? 0}`); process.exit(1); }
  const row = rows[0] as Record<string, any>;

  const cj = row.compliance_json ?? {};
  console.log("=== ROW ===");
  console.log("id:", row.id);
  console.log("solicitation_number:", row.solicitation_number);
  console.log("notice_id:", row.notice_id);
  console.log("created_at:", row.created_at, "| source:", row.source, "| cost_source:", row.cost_source);
  console.log("engine:", cj.engine, "| verdict:", row.verdict ?? cj.verdict ?? cj.decision?.verdict);
  console.log("raw_pdf_text bytes:", (row.raw_pdf_text ?? "").length);

  // 2) Production config = live Vercel production AUDIT_* plain flags, pulled fresh.
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("VERCEL_TOKEN missing — cannot pull production config"); process.exit(1); }
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await res.json();
  const envs = j.envs || j.env || [];
  let applied = 0;
  const onFlags: string[] = [];
  for (const e of envs) {
    if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" &&
        Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") {
      process.env[e.key] = e.value;
      applied++;
      if (e.value === "true") onFlags.push(e.key);
    }
  }
  // V5/SEAL are encrypted on Vercel; prod serves v5 by execution.
  process.env.AUDIT_REPORT_V5 = "true";
  process.env.AUDIT_V5_SEAL = "true";
  console.log(`\n=== PROD CONFIG === plain AUDIT_* applied: ${applied} · true: ${onFlags.length}`);

  // 3) Render on the served path — import AFTER env is set.
  const engine = String(cj.engine ?? "");
  let html: string, renderPath: string;
  if (engine === "agentic_v3") {
    const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
    html = renderV5ReportFromRow(row);
    renderPath = "v5";
  } else {
    const { buildViewModel } = await import("../../src/app/audits/[id]/_view-model");
    const { renderAuditReportComplete } = await import("../../src/app/audits/[id]/_render");
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const vm = buildViewModel(row as never, { isWatching: false, hasCapabilityStatement: true });
    const template = readFileSync(join(process.cwd(), "src", "app", "audits", "[id]", "_template.html"), "utf8");
    html = renderAuditReportComplete(template, vm as never, row);
    renderPath = "v1";
  }

  const outHtml = `/tmp/panel-audit-${row.id}.html`;
  writeFileSync(outHtml, html, "utf8");

  // Plain-text export for the panel lenses (they read text, not markup).
  const txt = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(+d))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  const outTxt = `/tmp/panel-audit-${row.id}.txt`;
  writeFileSync(outTxt, txt, "utf8");

  // Engine JSON for lens cross-checking.
  const outJson = `/tmp/panel-audit-${row.id}.compliance.json`;
  writeFileSync(outJson, JSON.stringify(cj, null, 2), "utf8");
  const outRaw = `/tmp/panel-audit-${row.id}.rawtext.txt`;
  writeFileSync(outRaw, String(row.raw_pdf_text ?? ""), "utf8");

  console.log(`\n=== RENDERED === path:${renderPath} · html:${html.length}B → ${outHtml}`);
  console.log(`text:${txt.length}B → ${outTxt}`);
  console.log(`compliance_json:${JSON.stringify(cj).length}B → ${outJson}`);
  console.log(`raw_pdf_text → ${outRaw}`);
})();
