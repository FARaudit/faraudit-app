// ARM — AUDIT_LENS_MAX_TURNS = 10 on VERCEL PRODUCTION (Rule 17 parity with the audit-worker).
//
// CEO authorized in words 2026-08-20: "raise turns to 10 then I'll fire".
//
// WHY 10 AND NOT MORE. A lens has `maxTurns` and the last is forced to submit_findings, so 10 buys 9
// reads. Measured $0 over 50 banked packages (`_capacity-probe.ts`): at 8 turns the busiest lane exceeds
// its read budget on 3 packages and the flagship is over by exactly ONE document; at 10 the flagship is
// within and the population drops to 1 of 50. 16 would take it to zero — 10 was chosen because it clears
// the run about to be fired without making a larger cost and latency change than that run needs.
//
// ⚠ WHAT THIS DOES NOT BUY. A bigger budget lets a lens OPEN more documents. It does not show that it
// grounds more findings in them. That is exactly what the live run is for, and it is why this is armed
// BEFORE the fire rather than argued about after.
//
// Read-back is the SOLE authority — Vercel signals already-exists as HTTP 400 + ENV_CONFLICT, not 409, so
// a POST outcome alone proves nothing. Not a secret; printing the value is Rule 32/46 compliant.
//
//   npx tsx scripts/audit-ai/_arm-lens-turns-10-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: "/Users/josearodriguezjr./faraudit-app/.env.local", quiet: true });

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEY = "AUDIT_LENS_MAX_TURNS";
const VALUE = "10";

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");

  const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key: KEY, value: VALUE, type: "plain", target: ["production"] }),
  });
  const pj = (await post.json()) as { error?: { code?: string } };
  const conflict = pj?.error?.code === "ENV_CONFLICT";
  console.log(`POST ${KEY} → HTTP ${post.status}${conflict ? " (already present — PATCHing to the wanted value)" : ""}`);

  if (conflict) {
    // An existing entry with a DIFFERENT value is the trap: every surface would report "armed" while the
    // running lambda read the old number. Patch it rather than leaving it and trusting the POST.
    const list = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const { envs } = (await list.json()) as { envs: Array<{ id: string; key: string; target?: string[] }> };
    const hit = envs.find((e) => e.key === KEY && (e.target ?? []).includes("production"));
    if (hit) {
      const patch = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env/${hit.id}?teamId=${TEAM}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ value: VALUE }),
      });
      console.log(`PATCH ${KEY} → HTTP ${patch.status}`);
    }
  }

  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  const { envs } = (await res.json()) as { envs: Array<{ key: string; value?: string; target?: string[] }> };
  const hits = envs.filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
  const armed = hits.length === 1 && hits[0].value === VALUE;
  console.log(`READ-BACK ${KEY}: ${hits.length} production entr${hits.length === 1 ? "y" : "ies"}, value ${hits[0]?.value ?? "<absent>"}`);
  if (hits.length > 1) console.log(`  DUPLICATE production entries — resolve before trusting the value`);
  console.log(armed
    ? `\n✅ ARMED on Vercel production. NOT yet live — a FRESH GIT BUILD is required (env-snapshot trap).`
    : `\n❌ NOT ARMED — read-back disagrees. Do not claim parity.`);
  process.exit(armed ? 0 : 1);
})();
