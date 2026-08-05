// ARM — AUDIT_NOOP_REP_BAR_SIGNAL_PARITY = true on VERCEL PRODUCTION (Rule 17 parity with audit-worker).
// CEO authorized in words 2026-08-05 ("merge 476 and arm the flag"), after PR #476 merged as 81823485.
//
// WHY PARITY IS REQUIRED: importanceOf is reached by src/lib code that Vercel routes exercise, so armed on the
// worker only, the SAME obligation would classify two different ways depending on how the audit was submitted.
//
// POST, then READ BACK — the read-back is the sole authority (Vercel signals already-exists as HTTP 400 +
// ENV_CONFLICT, not 409). PATCHes an existing entry rather than treating a conflict as success, so a
// wrong-valued entry can never be reported as armed. Does NOT redeploy: a running build carries the OLD env
// snapshot and only a FRESH GIT BUILD picks this up. Only the boolean-ness of a value is printed (Rules 32/46).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_arm-noop-rep-parity-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEY = "AUDIT_NOOP_REP_BAR_SIGNAL_PARITY";

type Env = { id: string; key: string; value?: string; target?: string[] };
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const list = async (): Promise<Env[]> => {
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, { headers: H });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  return ((await res.json()) as { envs: Env[] }).envs;
};

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");
  const existing = (await list()).filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
  if (existing.length > 1) { console.log(`⚠ ${KEY}: ${existing.length} production entries — resolve before trusting any value`); process.exit(1); }
  if (existing.length === 1) {
    const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env/${existing[0].id}?teamId=${TEAM}`,
      { method: "PATCH", headers: H, body: JSON.stringify({ value: "true", target: ["production"] }) });
    console.log(`PATCH ${KEY} (existing entry) → HTTP ${r.status}`);
  } else {
    const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`,
      { method: "POST", headers: H, body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }) });
    const j = (await r.json()) as { error?: { code?: string } };
    console.log(`POST ${KEY} → HTTP ${r.status}${j?.error?.code === "ENV_CONFLICT" ? " (already present — read-back decides)" : ""}`);
  }
  const hits = (await list()).filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
  const armed = hits.length === 1 && hits[0].value === "true";
  console.log(`READ-BACK ${KEY}: ${hits.length} production entr${hits.length === 1 ? "y" : "ies"}, value ${hits[0]?.value === "true" ? "true" : hits[0]?.value === "false" ? "false" : "<absent/non-boolean>"}`);
  console.log(armed ? `\n✅ ARMED on Vercel production. NOT yet live — a FRESH GIT BUILD is required (env-snapshot trap).`
                    : `\n❌ NOT ARMED — read-back disagrees. Do not claim parity.`);
  process.exit(armed ? 0 : 1);
})();
