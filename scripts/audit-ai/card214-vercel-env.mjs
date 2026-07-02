// Card 214 Vercel prod env helper. Reads VERCEL_TOKEN INTERNALLY from .env.local (never echoed). Status-only output.
// Usage:
//   node scripts/audit-ai/card214-vercel-env.mjs list                 → print AUDIT_* prod env keys (values redacted)
//   node scripts/audit-ai/card214-vercel-env.mjs set <KEY> <VALUE>    → upsert KEY=VALUE on target=production
//   node scripts/audit-ai/card214-vercel-env.mjs unset <KEY>          → delete KEY from production
// Requires --dangerouslyDisableSandbox at the Bash layer (network to api.vercel.com).
import { readFileSync } from "fs";

const PROJECT = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const TOKEN = (env.match(/^VERCEL_TOKEN=(.+)$/m) || [])[1]?.trim();
if (!TOKEN) { console.error("VERCEL_TOKEN missing in .env.local"); process.exit(2); }
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const base = `https://api.vercel.com`;
const q = `teamId=${TEAM}`;

const listEnv = async () => {
  const r = await fetch(`${base}/v9/projects/${PROJECT}/env?${q}`, { headers: H });
  const j = await r.json();
  if (!r.ok) { console.error("list failed", r.status, JSON.stringify(j)); process.exit(3); }
  return j.envs || [];
};

const cmd = process.argv[2];
if (cmd === "list") {
  const envs = await listEnv();
  const flags = envs.filter((e) => e.key.startsWith("AUDIT_"));
  if (!flags.length) console.log("(no AUDIT_* env vars set on this project)");
  for (const e of flags) console.log(`  ${e.key} :: target=[${(e.target||[]).join(",")}] type=${e.type} value=${e.value ? "<set>" : "<encrypted/hidden>"}`);
} else if (cmd === "set") {
  const [key, value] = [process.argv[3], process.argv[4]];
  if (!key || value === undefined) { console.error("usage: set <KEY> <VALUE>"); process.exit(2); }
  const existing = (await listEnv()).filter((e) => e.key === key && (e.target||[]).includes("production"));
  for (const e of existing) {
    const d = await fetch(`${base}/v9/projects/${PROJECT}/env/${e.id}?${q}`, { method: "DELETE", headers: H });
    console.log(`  deleted prior ${key} id=${e.id} status=${d.status}`);
  }
  const r = await fetch(`${base}/v10/projects/${PROJECT}/env?${q}`, {
    method: "POST", headers: H,
    body: JSON.stringify({ key, value, type: "plain", target: ["production"] }),
  });
  const j = await r.json();
  console.log(`  set ${key}=${value} target=production → status=${r.status} ${r.ok ? "OK" : JSON.stringify(j)}`);
  if (!r.ok) process.exit(4);
} else if (cmd === "unset") {
  const key = process.argv[3];
  const existing = (await listEnv()).filter((e) => e.key === key);
  if (!existing.length) { console.log(`  ${key} not present — nothing to unset`); }
  for (const e of existing) {
    const d = await fetch(`${base}/v9/projects/${PROJECT}/env/${e.id}?${q}`, { method: "DELETE", headers: H });
    console.log(`  unset ${key} id=${e.id} status=${d.status}`);
  }
} else if (cmd === "redeploy") {
  const r = await fetch(`${base}/v13/deployments?${q}`, {
    method: "POST", headers: H,
    body: JSON.stringify({ name: "faraudit-app", target: "production", gitSource: { type: "github", repoId: "1221363674", ref: "main" } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error("redeploy failed", r.status, JSON.stringify(j)); process.exit(5); }
  console.log(`  redeploy triggered: uid=${j.id || j.uid} url=${j.url} state=${j.readyState || j.status}`);
} else if (cmd === "wait") {
  const uid = process.argv[3];
  if (!uid) { console.error("usage: wait <uid>"); process.exit(2); }
  for (let i = 0; i < 120; i++) {
    const r = await fetch(`${base}/v13/deployments/${uid}?${q}`, { headers: H });
    const j = await r.json();
    const st = j.readyState || j.status;
    if (st === "READY") { console.log(`  READY uid=${uid} url=${j.url}`); process.exit(0); }
    if (st === "ERROR" || st === "CANCELED") { console.error(`  ${st} uid=${uid}`); process.exit(6); }
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.error("  timed out waiting for READY"); process.exit(7);
} else {
  console.error("usage: list | set <KEY> <VALUE> | unset <KEY> | redeploy | wait <uid>");
  process.exit(2);
}
