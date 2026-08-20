// Redeploy the CURRENT production deployment with a FRESH ENV SNAPSHOT — deterministic, via the API.
//
// WHY THIS EXISTS RATHER THAN `vercel redeploy`. The CLI resolves deployments through its own linked
// scope, and on 2026-08-20 it both listed a stale set and refused the newest production URL with
// "Deployment belongs to a different team" — while the API, queried with an explicit teamId, returned that
// same deployment happily. Same lesson as Rule 18: when the CLI's behaviour depends on ambient local state,
// use the deterministic API call.
//
// WHAT IT IS FOR. Vercel snapshots env at BUILD START. A variable created after a build exists in the
// project and is absent from the running lambda — and every surface says "armed": the project env reads
// true, the deployment is READY, the sha is right. This rebuilds the SAME git sha with a fresh snapshot.
//
//   npx tsx scripts/audit-ai/_vercel-redeploy-prod.ts
import dotenv from "dotenv";
dotenv.config({ path: "/Users/josearodriguezjr./faraudit-app/.env.local", quiet: true });

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");
  const h = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

  const list = await fetch(`https://api.vercel.com/v6/deployments?projectId=${PROJ}&teamId=${TEAM}&target=production&limit=1`, { headers: h });
  const current = (await list.json()).deployments?.[0];
  if (!current) throw new Error("no production deployment found");
  const sha = (current.meta ?? {}).githubCommitSha ?? "";
  console.log(`current production: ${current.url}  sha=${String(sha).slice(0, 8)}  state=${current.state}`);

  const res = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: current.name ?? "faraudit-app", deploymentId: current.uid ?? current.id, target: "production" }),
  });
  const body = await res.json();
  if (!res.ok) { console.error(`redeploy HTTP ${res.status}: ${JSON.stringify(body).slice(0, 400)}`); process.exit(1); }
  console.log(`redeploy queued: ${body.url}  (rebuilds sha ${String(sha).slice(0, 8)} with a fresh env snapshot)`);
})();
