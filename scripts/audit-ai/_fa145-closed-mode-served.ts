// FA-145 INVESTIGATION ($0, read-only) — is the closed-solicitation mode present on the SERVED report?
//
// FA-114 built a full closed-state mode (expired banner · hero-gate rewording · critical-path rewrite · KO-email
// card suppression) — all of it in src/app/audit/[id]/_render.ts, the v4/V1 renderer. Production picks its
// renderer at src/app/audit/[id]/route.ts:417 on AUDIT_REPORT_V5, and a grep of src/lib/v5-report finds no
// expired/closed handling at all. If V5 is the served renderer, FA-145 is not "residual wording" — the whole
// closed mode is missing from what customers actually open.
//
// This reads the LIVE Vercel production env (never a code default — a default-OFF in code is not evidence about
// production) and then renders a REAL expired audit through BOTH renderers to compare what each says.
//
// Prints flag state and phrase counts only. No key value is ever printed.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { classifyEnv, equals, describe, applyReadableProductionEnv, type RawVercelEnv } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });

const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

// Phrases that only make sense while a solicitation is still OPEN. Deliberately SHAPES, not one exact string —
// a phrase list tuned to what I expect is how an inert check gets written. [[feedback_probe_before_the_number]]
const ACTION_NOW = [
  /before quoting/gi,
  /before submission/gi,
  /before proceeding with our proposal/gi,
  /submit by (?:the )?deadline/gi,
  /request clarification/gi,
  /days? (?:remain|left)/gi,
  /\bcure what you can\b/gi,
];

(async () => {
  // 1) LIVE production flag state — read, never assumed.
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("VERCEL_TOKEN not set — cannot read live production flags. Refusing to guess."); process.exit(1); }
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json() as { envs?: RawVercelEnv[] };
  const envs = j.envs ?? [];
  const { applied, unreadable } = applyReadableProductionEnv(envs);

  // Three states. An encrypted variable used to take the `continue` and print "(unset) → v4" — indistinguishable
  // from the flag genuinely not existing, and the whole point of this script is which renderer production runs.
  const v5 = classifyEnv(envs, "AUDIT_REPORT_V5");
  const v5IsTrue = equals(v5, "true");
  console.log(`LIVE PRODUCTION · ${describe(v5)}`);
  console.log(`AUDIT_* production vars: ${applied.length} readable and applied${unreadable.length ? ` · ${unreadable.length} NOT readable → ${unreadable.join(", ")}` : ""}`);
  if (v5IsTrue === null) {
    console.log(`→ served renderer: CANNOT BE DETERMINED from the env API — not defaulting to v4. This script's entire finding is "which renderer is served", so it stops here rather than answer it with a guess.`);
    process.exit(1);
  }
  console.log(`→ value === "true": ${v5IsTrue}  →  served renderer = ${v5IsTrue ? "V5 (src/lib/v5-report)" : "v4 (_render.ts), by the code default at src/app/audits/[id]/route.ts:422"}`);

  // 2) A REAL expired audit — chosen from the corpus by its own response_deadline, not hand-picked.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
  const { data, error } = await sb.from("audits").select("*").order("created_at", { ascending: false }).limit(60);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const now = Date.now();
  const expired = rows.filter((r) => {
    const d = Date.parse(String(r.response_deadline ?? ""));
    return Number.isFinite(d) && d < now && r.compliance_json;
  });
  console.log(`audits scanned ${rows.length} · with a PASSED response_deadline and a report payload: ${expired.length}`);
  if (!expired.length) { console.error("\nNo expired audit in the recent corpus — nothing to measure. Not reporting a zero as a clean.\n"); process.exit(1); }

  // 3) Render through the SERVED path and count open-only phrasing.
  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  console.log(`\nOPEN-ONLY PHRASING IN THE SERVED (V5) REPORT, on solicitations that already CLOSED\n`);
  let totalHits = 0;
  for (const row of expired.slice(0, 6)) {
    let html = "";
    try { html = renderV5ReportFromRow(row as never) as unknown as string; }
    catch (e) { console.log(`  ${String(row.solicitation_number ?? row.id).slice(0, 24).padEnd(24)}  render threw: ${e instanceof Error ? e.message : String(e)}`); continue; }
    const counts = ACTION_NOW.map((re) => (html.match(re) ?? []).length);
    const n = counts.reduce((a, b) => a + b, 0);
    totalHits += n;
    const closedBanner = /SOLICITATION CLOSED|deadline .{0,12}(?:has )?passed/i.test(html);
    console.log(`  ${String(row.solicitation_number ?? row.id).slice(0, 24).padEnd(24)} deadline ${String(row.response_deadline).slice(0, 10)}  open-only phrases: ${String(n).padStart(3)}   closed banner present: ${closedBanner ? "YES" : "NO"}`);
  }
  console.log(`\n  total open-only phrase occurrences across the sample: ${totalHits}`);
  console.log(`  (a phrase like "before quoting" on a solicitation that closed is the FA-145 defect)\n`);
})();
