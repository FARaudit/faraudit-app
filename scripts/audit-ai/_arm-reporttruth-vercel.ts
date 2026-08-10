// ARM — AUDIT_DOC_ANALYZED_TRUTH + AUDIT_NONPRESENCE_HONESTY = true on VERCEL PRODUCTION (Rule 17 parity with the
// audit-worker). CEO authorized in words 2026-07-30: "arm both then keep going".
//
// Step 1: POST each env var (plain, target=production). Step 2: read back from the live list and assert
// value==="true" AND target includes production. Does NOT redeploy — that is a separate explicit step after read-back
// verifies (Vercel env-snapshot trap: a running build carries the OLD snapshot, so a fresh GIT build is required).
// Secrets are never echoed (Rules 32/46) — these are booleans, and only the boolean-ness is printed.
import dotenv from "dotenv";
import { classifyEnv, equals, describe, type RawVercelEnv } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEYS = ["AUDIT_DOC_ANALYZED_TRUTH", "AUDIT_NONPRESENCE_HONESTY", "AUDIT_PANEL_COMPUTE_OR_ABSENT", "AUDIT_CLIN_SCHEDULE_EXTRACT", "AUDIT_ABSENCE_RECONCILE", "AUDIT_GATE_REASON_NAMED"];

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
  const envs = (gj.envs || gj.env || []) as RawVercelEnv[];
  console.log("");
  // Three states per key. `hit.type === "plain" && hit.value === "true"` reported FAIL for an ENCRYPTED var, which is
  // a verdict nobody read: the API returns CIPHERTEXT in `value` for encrypted/sensitive entries, so the comparison is
  // meaningless rather than false. UNVERIFIABLE is now its own bucket and it keeps the run out of both VERIFIED and
  // FAIL — the whole point of a read-back is that it read something.
  const unverifiable: string[] = [];
  for (const KEY of KEYS) {
    const state = classifyEnv(envs, KEY);
    const isTrue = equals(state, "true");
    if (isTrue === null) { unverifiable.push(KEY); console.log(`READ-BACK ${describe(state)} → UNVERIFIABLE`); continue; }
    if (!isTrue) allOk = false;
    console.log(`READ-BACK ${describe(state)} · value === "true": ${isTrue} → ${isTrue ? "OK" : "FAIL"}`);
  }
  if (unverifiable.length) {
    console.log(`\nVERCEL ARM UNVERIFIABLE for ${unverifiable.length} of ${KEYS.length} key(s): ${unverifiable.join(", ")} — present on production, value not readable here. Not claiming VERIFIED${allOk ? "" : " (and other keys did FAIL)"}. Confirm those by execution, or re-add them as plain.`);
    process.exit(allOk ? 2 : 1);
  }
  console.log(`\nVERCEL ARM ${allOk ? `VERIFIED — all ${KEYS.length} plain 'true' on production. Next: a FRESH GIT BUILD (env-snapshot trap: a redeploy of an existing build carries the OLD env).` : "FAIL"}`);
  process.exit(allOk ? 0 : 1);
})();
