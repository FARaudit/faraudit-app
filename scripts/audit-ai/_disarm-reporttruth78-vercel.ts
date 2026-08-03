// DISARM — AUDIT_ABSENCE_RECONCILE + AUDIT_FORCE_GROUNDING = false on VERCEL PRODUCTION.
// CEO authorized in words 2026-07-30 ("disarm") after two dangerous-direction P0s were confirmed by execution:
// the absence reconciler refutes off a DIFFERENT artifact ("Appendix C to the PWS is not attached"), and the force
// gate softens a real obligation when the source is line-broken. Rule 17 parity: audit-executor-v3 runs on both the
// Vercel route and the Railway worker, so disarming one platform only would leave the bug live on the other door.
// PATCHes the existing production var (POST would 409 on an existing key) and reads back. Booleans only.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEYS = ["AUDIT_ABSENCE_RECONCILE", "AUDIT_FORCE_GROUNDING"];

(async () => {
  const list = async () => {
    const r = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const j = await r.json();
    return ((j.envs || j.env || []) as Array<{ id: string; key: string; value: string; type: string; target: string[] }>);
  };
  let allOk = true;
  for (const KEY of KEYS) {
    const hit = (await list()).find((e) => e.key === KEY && Array.isArray(e.target) && e.target.includes("production"));
    if (!hit) { console.log(`${KEY}: not present on production — already disarmed`); continue; }
    const p = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env/${hit.id}?teamId=${TEAM}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value: "false" }),
    });
    console.log(`PATCH ${KEY} → HTTP ${p.status}`);
    if (!p.ok) { console.log(`  body: ${JSON.stringify(await p.json()).slice(0, 240)}`); allOk = false; }
  }
  console.log("");
  for (const e of (await list())) {
    if (!KEYS.includes(e.key) || !e.target?.includes("production")) continue;
    const ok = e.value === "false";
    if (!ok) allOk = false;
    console.log(`READ-BACK ${e.key}: is_true=${e.value === "true"} → ${ok ? "DISARMED" : "STILL ARMED"}`);
  }
  console.log(`\nVERCEL DISARM ${allOk ? "VERIFIED — next: a FRESH GIT BUILD (env-snapshot trap)." : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
})();
