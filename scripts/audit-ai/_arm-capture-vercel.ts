// ARM — AUDIT_CONSEQUENCE_CAPTURE=true on VERCEL PRODUCTION (Rule 17 parity; capture arm — CEO in-words authorized this conversation). CEO in-words authorized 2026-07-29.
// Step 1: POST the env var (plain, target=production). Step 2: read back and assert value==="true" & target=production.
// Does NOT redeploy — that is a separate explicit step after read-back verifies. Secrets never echoed (Rule 32/46).
import dotenv from "dotenv";
import { classifyEnv, equals, describe } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEY = "AUDIT_CONSEQUENCE_CAPTURE";

(async () => {
  // 1) POST create.
  const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
  });
  console.log(`POST ${KEY} → HTTP ${post.status}`);
  const pj = await post.json();
  if (!post.ok) { console.log(`  body: ${JSON.stringify(pj).slice(0, 300)}`); process.exit(1); }

  // 2) read back from the live env list.
  const get = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const gj = await get.json();
  const envs = gj.envs || gj.env || [];
  // Three states, not two. `type === "plain" && value === "true"` folded ENCRYPTED into FAIL — but the env API
  // returns CIPHERTEXT in `value` for an encrypted/sensitive var, so that comparison is meaningless there, not false.
  // A read-back that never read the value must not name a verdict in either direction.
  const state = classifyEnv(envs, KEY);
  console.log(`READ-BACK: ${describe(state)}`);
  const isTrue = equals(state, "true");
  if (isTrue === null) {
    console.log(`\nARM UNVERIFIABLE — ${KEY} is present on production but its value cannot be read here. Not VERIFIED, not FAIL. Confirm by execution against the deployed app, or re-add the var as plain.`);
    process.exit(2);
  }
  console.log(`value === "true": ${isTrue}`);
  console.log(`\nARM ${isTrue ? "VERIFIED — plain 'true' on production. Next: redeploy so a fresh build picks it up." : state.state === "absent" ? "FAIL — not present on production." : "FAIL — readable on production, but not 'true'."}`);
  process.exit(isTrue ? 0 : 1);
})();
