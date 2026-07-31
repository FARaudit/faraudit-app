// ARM — AUDIT_FORCE_GROUNDING = true on VERCEL PRODUCTION (Rule 17 parity with the audit-worker: audit-executor-v3
// runs on BOTH src/app/api/audit/route.ts and agents/audit-worker/worker.ts, so a flag set on one platform only
// produces a seam that fires or stays dark depending on which door the customer came through).
//
// CEO authorized the arm in words 2026-07-30 ("arm"). DO NOT RUN BEFORE PR #380 IS MERGED AND DEPLOYED — setting the
// variable while the deployed bundle has no seam reading it is a placebo arm, and worse, it would activate silently
// at whatever unrelated deploy happens next rather than under a deliberate, verified arm. Order: merge → deploy →
// arm → prove.
//
// Step 1: POST (plain, target=production). Step 2: read back from the live list and assert value==="true" AND target
// includes production. Does NOT redeploy — that is a separate explicit step, because a running build carries the OLD
// env snapshot and only a FRESH GIT BUILD picks the new value up. Booleans only; no secret is echoed (Rules 32/46).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEYS = ["AUDIT_FORCE_GROUNDING"];

(async () => {
  let allOk = true;
  for (const KEY of KEYS) {
    const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
    });
    const pj = await post.json() as { error?: { code?: string } };
    // ALREADY-EXISTS is not a failure, and Vercel signals it with 400 + ENV_CONFLICT, not 409. The READ-BACK below
    // is the sole authority on the live value; a POST outcome is advisory only.
    const conflict = pj?.error?.code === "ENV_CONFLICT";
    console.log(`POST ${KEY} → HTTP ${post.status}${conflict ? " (already present — read-back decides)" : ""}`);
    if (!post.ok && !conflict) { console.log(`  body: ${JSON.stringify(pj).slice(0, 300)}`); allOk = false; }
  }

  const get = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const gj = await get.json();
  const envs = (gj.envs || gj.env || []) as Array<{ key: string; type: string; value: string; target: string[] }>;
  console.log("");
  for (const KEY of KEYS) {
    const hit = envs.find((e) => e.key === KEY && Array.isArray(e.target) && e.target.includes("production"));
    if (!hit) { console.log(`READ-BACK ${KEY}: FAIL — not present on production`); allOk = false; continue; }
    const ok = hit.type === "plain" && hit.value === "true";
    if (!ok) allOk = false;
    console.log(`READ-BACK ${KEY}: type=${hit.type} value_is_true=${hit.value === "true"} target=${JSON.stringify(hit.target)} → ${ok ? "OK" : "FAIL"}`);
  }
  console.log(`\nVERCEL ARM ${allOk ? "VERIFIED — plain 'true' on production. Next: a FRESH GIT BUILD (env-snapshot trap), then _redeploy-prod.ts and poll READY." : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
})();
