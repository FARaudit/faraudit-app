// Redeploy Vercel PRODUCTION so the freshly-armed env var is baked into a new build (env-snapshot trap).
// Redeploys the latest READY production deployment with current env (forceNew). Reports new dpl id + state.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

(async () => {
  // latest production deployment
  const list = await fetch(`https://api.vercel.com/v6/deployments?projectId=${PROJ}&target=production&limit=1&teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const lj = await list.json();
  const latest = (lj.deployments || [])[0];
  if (!latest) { console.log("no production deployment found"); process.exit(1); }
  console.log(`latest prod dpl: ${latest.uid} state=${latest.state ?? latest.readyState} sha=${latest.meta?.githubCommitSha?.slice(0,7) ?? "?"} created=${new Date(latest.created).toISOString()}`);

  const redeploy = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: latest.name, deploymentId: latest.uid, target: "production" }),
  });
  console.log(`POST redeploy → HTTP ${redeploy.status}`);
  const rj = await redeploy.json();
  if (!redeploy.ok) { console.log(`  body: ${JSON.stringify(rj).slice(0, 400)}`); process.exit(1); }
  console.log(`NEW dpl: id=${rj.id ?? rj.uid} url=${rj.url} state=${rj.readyState ?? rj.status} sha=${rj.meta?.githubCommitSha?.slice(0,7) ?? "?"}`);
  console.log(`\nRedeploy triggered — poll for READY + alias next.`);
})();
