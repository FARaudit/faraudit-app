// ARM — AUDIT_COVERAGE_COUNTER_SPLIT=true on VERCEL PRODUCTION (render layer, L44). CEO in-words authorized.
// Step 1: POST the env var (plain, target=production). Step 2: read back and assert value==="true" & target=production.
// Does NOT redeploy — that is a separate explicit step after read-back verifies. Secrets never echoed (Rule 32/46).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEY = "AUDIT_COVERAGE_COUNTER_SPLIT";

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
  const hit = envs.find((e: any) => e.key === KEY && Array.isArray(e.target) && e.target.includes("production"));
  if (!hit) { console.log("  READ-BACK FAIL — not present on production"); process.exit(1); }
  const ok = hit.type === "plain" && hit.value === "true" && hit.target.includes("production");
  console.log(`READ-BACK: key=${hit.key} type=${hit.type} value_is_true=${hit.value === "true"} target=${JSON.stringify(hit.target)}`);
  console.log(`\nARM ${ok ? "VERIFIED — plain 'true' on production. Next: redeploy so a fresh build picks it up." : "FAIL"}`);
  process.exit(ok ? 0 : 1);
})();
