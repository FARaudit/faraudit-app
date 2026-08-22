// ARM — AUDIT_NAICS_SCOPE_DISCLOSURE=true on VERCEL PRODUCTION. CEO authorized in words 2026-08-22.
// Deterministic API POST, not `vercel env add`: the CLI consumes piped input as the Sensitive prompt
// answer and stores an EMPTY value while printing success (Rule 18). Read-back asserts the value.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEY = "AUDIT_NAICS_SCOPE_DISCLOSURE";
(async () => {
  const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
  });
  console.log(`POST ${KEY} → HTTP ${post.status}`);
  const pj: any = await post.json();
  if (!post.ok) { console.log(`  body: ${JSON.stringify(pj).slice(0, 300)}`); process.exit(1); }
  const get = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!get.ok) { console.log(`READ-BACK UNREADABLE (HTTP ${get.status}) — not the same as armed`); process.exit(2); }
  const gj: any = await get.json();
  const envs = gj.envs || gj.env || [];
  const hit = envs.find((e: any) => e.key === KEY && Array.isArray(e.target) && e.target.includes("production"));
  if (!hit) { console.log("READ-BACK FAIL — not present on production"); process.exit(1); }
  const ok = hit.type === "plain" && hit.value === "true";
  console.log(`READ-BACK: target=[${hit.target.join(",")}] type=${hit.type} value==="true" → ${ok}`);
  process.exit(ok ? 0 : 1);
})();
