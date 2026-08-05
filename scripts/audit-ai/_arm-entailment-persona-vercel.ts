// ARM — AUDIT_CLAIM_ENTAILMENT + AUDIT_PERSONA_DIVERSITY = true on VERCEL PRODUCTION (Rule 17 parity with
// audit-worker). CEO authorized in words 2026-08-05 ("merge it and arm both flags").
//
// WHY PARITY IS REQUIRED, not merely tidy: both flags are read inside src/lib code that Vercel routes reach —
// the skeptic prompt/schema (audit-verifier) and the lens roster (audit-lenses) — so armed on the worker only,
// the SAME solicitation would be audited two different ways depending on how it was submitted.
//
// Step 1: POST each key (plain, target=production). Step 2: READ IT BACK from the live list and assert
// value==="true" AND target includes production — the read-back is the sole authority, a POST outcome is
// advisory (Vercel signals already-exists as HTTP 400 + code ENV_CONFLICT, not 409). PATCHes an existing entry
// rather than leaving a stale value behind a "conflict" that reads as success.
//
// Does NOT redeploy: a running build carries the OLD env snapshot and only a FRESH GIT BUILD picks this up.
// Only the boolean-ness of a value is ever printed (Rules 32/46).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_arm-entailment-persona-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEYS = ["AUDIT_CLAIM_ENTAILMENT", "AUDIT_PERSONA_DIVERSITY"] as const;

type Env = { id: string; key: string; value?: string; target?: string[] };
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function list(): Promise<Env[]> {
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, { headers: H });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  return ((await res.json()) as { envs: Env[] }).envs;
}

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");
  let allArmed = true;

  for (const KEY of KEYS) {
    const existing = (await list()).filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
    if (existing.length > 1) { console.log(`⚠ ${KEY}: ${existing.length} production entries — resolve before trusting any value`); allArmed = false; continue; }

    if (existing.length === 1) {
      // PATCH, don't skip. An entry already present with the WRONG value is the case a POST-only script reports
      // as "conflict, fine" and leaves disarmed.
      const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env/${existing[0].id}?teamId=${TEAM}`, {
        method: "PATCH", headers: H, body: JSON.stringify({ value: "true", target: ["production"] }),
      });
      console.log(`PATCH ${KEY} (existing entry) → HTTP ${r.status}`);
    } else {
      const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
        method: "POST", headers: H, body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
      });
      const j = (await r.json()) as { error?: { code?: string } };
      console.log(`POST ${KEY} → HTTP ${r.status}${j?.error?.code === "ENV_CONFLICT" ? " (already present — read-back decides)" : ""}`);
    }
  }

  // READ-BACK — the authority, taken once over the final state.
  const envs = await list();
  for (const KEY of KEYS) {
    const hits = envs.filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
    const armed = hits.length === 1 && hits[0].value === "true";
    const shown = hits[0]?.value === "true" ? "true" : hits[0]?.value === "false" ? "false" : "<absent/non-boolean>";
    console.log(`READ-BACK ${KEY}: ${hits.length} production entr${hits.length === 1 ? "y" : "ies"}, value ${shown}`);
    if (!armed) allArmed = false;
  }

  console.log(allArmed
    ? `\n✅ BOTH ARMED on Vercel production. NOT yet live — a FRESH GIT BUILD is required (env-snapshot trap).`
    : `\n❌ NOT ARMED — read-back disagrees. Do not claim parity.`);
  process.exit(allArmed ? 0 : 1);
})();
