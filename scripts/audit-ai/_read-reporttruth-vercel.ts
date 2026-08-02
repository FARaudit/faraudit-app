// READ-ONLY — Rule 17 env-var parity check for the REPORT-TRUTH flag set on VERCEL PRODUCTION vs the audit-worker.
// This script NEVER writes: no POST, no PATCH, no redeploy. It lists the project's env and reports the live value of
// each key, so the worker/Vercel split can be seen before anyone decides to arm (G1 — Code never arms).
// Booleans only are printed; no secret value is ever echoed (Rules 32/46).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_read-reporttruth-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEYS = ["AUDIT_DOC_ANALYZED_TRUTH", "AUDIT_NONPRESENCE_HONESTY", "AUDIT_PANEL_COMPUTE_OR_ABSENT", "AUDIT_CLIN_SCHEDULE_EXTRACT", "AUDIT_ABSENCE_RECONCILE", "AUDIT_GATE_REASON_NAMED"];

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local — cannot read project env");
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  const { envs } = (await res.json()) as { envs: Array<{ key: string; value?: string; target?: string[] }> };
  console.log(`\nVERCEL PRODUCTION — REPORT-TRUTH flag parity (read-only)\n`);
  for (const KEY of KEYS) {
    const hits = envs.filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
    if (!hits.length) { console.log(`  ${KEY.padEnd(32)} ABSENT (production)`); continue; }
    // Only the boolean-ness of a boolean flag is printed — never a raw value from an arbitrary key.
    const v = hits[0].value === "true" ? "true" : hits[0].value === "false" ? "false" : "<non-boolean>";
    console.log(`  ${KEY.padEnd(32)} ${v}${hits.length > 1 ? `  (${hits.length} production entries — DUPLICATE)` : ""}`);
  }
  console.log();
})();
