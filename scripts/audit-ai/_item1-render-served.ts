// ITEM-1 — render audit 496a9a21 through the SERVED v5 renderer under the LIVE Vercel production flag config,
// and extract the real SAM source (ground truth) for the independent ex-KO seat. Writes both to /tmp for the seat.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
import { writeFileSync } from "node:fs";
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const ID = "496a9a21-8391-41b4-9e24-cff212971fd3";

(async () => {
  // 1) live prod config (the served surface's actual flags)
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await res.json(); const envs = j.envs || j.env || [];
  const applied: string[] = [];
  for (const e of envs) if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" && Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") {
    process.env[e.key] = e.value; if (e.value === "true") applied.push(e.key);
  }
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  const flagCheck = (k: string) => process.env[k] === "true";
  console.log("LIVE prod flags relevant to this grade:");
  console.log("  AUDIT_NHR_NARRATIVE_TRUE_CAUSE:", flagCheck("AUDIT_NHR_NARRATIVE_TRUE_CAUSE"));
  console.log("  AUDIT_SEVERITY_HONEST         :", flagCheck("AUDIT_SEVERITY_HONEST"));
  console.log("  AUDIT_SETASIDE_HEADER_RECONCILE:", flagCheck("AUDIT_SETASIDE_HEADER_RECONCILE"), "(expect false — held)");
  console.log("  AUDIT_MASTHEAD_OFFICE_LEAF    :", flagCheck("AUDIT_MASTHEAD_OFFICE_LEAF"), "(expect false — held)");
  console.log("  AUDIT_COVERAGE_DISPLAY_COHERENT:", flagCheck("AUDIT_COVERAGE_DISPLAY_COHERENT"), "(expect false — v4-only)");
  console.log("  total true AUDIT_* plain flags:", applied.length);

  // 2) row + served render
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: row } = await sb.from("audits").select("*").eq("id", ID).single();
  if (!row) { console.error("row not found"); process.exit(1); }
  const html = renderV5ReportFromRow(row);
  writeFileSync("/tmp/item1-496a9a21-SERVED-V5.html", html);
  console.log(`\n→ served v5 HTML: /tmp/item1-496a9a21-SERVED-V5.html (${html.length} bytes)`);

  // 3) ground-truth source
  const src = String((row as any).raw_pdf_text || "");
  writeFileSync("/tmp/item1-fa0033-source.txt", src);
  console.log(`→ ground-truth SAM source: /tmp/item1-fa0033-source.txt (${src.length} chars)`);
})();
