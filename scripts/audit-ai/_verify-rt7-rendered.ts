// VERIFICATION at the real surface: the RENDERED CUSTOMER REPORT, not the engine's return value.
// Mirrors scripts/audit-ai/render-audit.ts exactly (production flags from Vercel, same engine routing, same
// renderers) and emits BEFORE / AFTER HTML for audit 61aaaa95 — before = what production serves today with
// AUDIT_ABSENCE_RECONCILE disarmed; after = what it would serve with the reconciler applied at audit time.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as dotenv from "dotenv";
import { buildViewModel } from "../../src/app/audits/[id]/_view-model";
import { renderAuditReportComplete } from "../../src/app/audits/[id]/_render";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
import { classifyEnv, equals, describe, applyReadableProductionEnv, type EnvState, type RawVercelEnv } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });

const OUT = process.env.VERIFY_OUT_DIR || "/tmp";
const ID = process.argv[2] || "61aaaa95-b205-43b0-bf41-0a25fdd9265e";

async function applyProductionFlags(): Promise<string> {
  const TOKEN = process.env.VERCEL_TOKEN;
  const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD", TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent — refusing to render a laptop-state artifact.");
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Vercel env fetch failed HTTP ${res.status}`);
  const j = await res.json() as { envs?: RawVercelEnv[]; env?: RawVercelEnv[] };
  const envs = j.envs ?? j.env ?? [];
  const { applied, unreadable } = applyReadableProductionEnv(envs);
  // Same fix as render-audit.ts, which this script says it mirrors: a plain-only pull leaves an ENCRYPTED flag OFF
  // in silence, and `render()` below stamps "v4"/"v5" onto the artifact from exactly that env.
  if (unreadable.length) console.log(`⚠ ${unreadable.length} AUDIT_* production var(s) NOT readable → OFF in these renders, possibly ON in production: ${unreadable.join(", ")}`);
  V5_STATE = classifyEnv(envs, "AUDIT_REPORT_V5");
  return `PRODUCTION (${applied.length} AUDIT_* vars from Vercel)`;
}

// Set by applyProductionFlags; null until then (and in any local-flag path).
let V5_STATE: EnvState | null = null;

function render(audit: Record<string, unknown>): { html: string; path: string } {
  const engine = String((audit as any).compliance_json?.engine ?? "");
  // `process.env.AUDIT_REPORT_V5 === "true"` reads false both when the flag is off and when it was never readable.
  // The classified state distinguishes them; unknowable stops the render rather than mislabelling the artifact.
  const v5Resolved = V5_STATE ? equals(V5_STATE, "true") : process.env.AUDIT_REPORT_V5 === "true";
  if (v5Resolved === null) throw new Error(`AUDIT_REPORT_V5 is present on production but not readable (${describe(V5_STATE!)}). The served renderer cannot be resolved, so BEFORE/AFTER cannot be labelled v4 or v5. Refusing to render.`);
  const v5On = v5Resolved;
  if (engine === "agentic_v3") return { html: v5On ? renderV5ReportFromRow(audit) : renderV4ReportFromRow(audit), path: v5On ? "v5" : "v4" };
  const vm = buildViewModel(audit as never, { isWatching: false, hasCapabilityStatement: true });
  const template = readFileSync(join(process.cwd(), "src", "app", "audits", "[id]", "_template.html"), "utf8");
  return { html: renderAuditReportComplete(template, vm as never, audit), path: "v1" };
}

(async () => {
  console.log("flag-state:", await applyProductionFlags());
  console.log("AUDIT_ABSENCE_RECONCILE on Vercel =", JSON.stringify(process.env.AUDIT_ABSENCE_RECONCILE));
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data: audit } = await admin.from("audits").select("*").eq("id", ID).maybeSingle();
  if (!audit) { console.error("audit not found"); process.exit(1); }

  const before = render(JSON.parse(JSON.stringify(audit)));
  writeFileSync(join(OUT, "rt7-BEFORE.html"), before.html, "utf8");
  console.log(`BEFORE → ${join(OUT, "rt7-BEFORE.html")} · ${before.html.length} bytes · render-path ${before.path}`);

  // Apply the reconciler exactly as audit-executor-v3 would at audit time, then render the resulting row.
  const after = JSON.parse(JSON.stringify(audit));
  const cj = after.compliance_json;
  const prov = new Set<string>((cj?.finding_provenance || []).map((p: any) => p.doc).filter((d: string) => d && d !== "(ungrounded)"));
  const rec = reconcileAbsenceClaims(cj.v3.findings.map((f: any, i: number) => ({ ...f, id: `f#${i}` })), after.raw_pdf_text, prov, after.set_aside ?? null);
  cj.v3.findings = rec.findings.map(({ id, ...f }: any) => f);
  console.log(`reconciler corrected ${rec.refuted.length} finding(s):`, rec.refuted.map((r: any) => `${r.id}/${r.kind}`).join(", ") || "(none)");
  const afterR = render(after);
  writeFileSync(join(OUT, "rt7-AFTER.html"), afterR.html, "utf8");
  console.log(`AFTER  → ${join(OUT, "rt7-AFTER.html")} · ${afterR.html.length} bytes · render-path ${afterR.path}`);
})();
