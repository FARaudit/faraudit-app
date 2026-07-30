// ARM — AUDIT_DOC_ANALYZED_TRUTH + AUDIT_NONPRESENCE_HONESTY = true on VERCEL PRODUCTION (Rule 17 parity with the
// audit-worker). CEO authorized in words 2026-07-30: "arm both then keep going".
//
// Step 1: POST each env var (plain, target=production). Step 2: read back from the live list and assert
// value==="true" AND target includes production. Does NOT redeploy — that is a separate explicit step after read-back
// verifies (Vercel env-snapshot trap: a running build carries the OLD snapshot, so a fresh GIT build is required).
// Secrets are never echoed (Rules 32/46) — these are booleans, and only the boolean-ness is printed.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEYS = ["AUDIT_DOC_ANALYZED_TRUTH", "AUDIT_NONPRESENCE_HONESTY", "AUDIT_PANEL_COMPUTE_OR_ABSENT"];

(async () => {
  let allOk = true;
  for (const KEY of KEYS) {
    const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
    });
    const pj = await post.json() as { error?: { code?: string } };
    // ALREADY-EXISTS is not a failure, and Vercel does not signal it with 409 — it returns 400 carrying
    // code ENV_CONFLICT (batch semantics, with the detail repeated in a `failed[]` array). Keying on the status alone
    // marked a correctly-armed flag as FAIL. The READ-BACK below is the sole authority on the live value; a POST
    // outcome is advisory only.
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
  console.log(`\nVERCEL ARM ${allOk ? "VERIFIED — both plain 'true' on production. Next: a FRESH GIT BUILD (env-snapshot trap: a redeploy of an existing build carries the OLD env)." : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
})();
