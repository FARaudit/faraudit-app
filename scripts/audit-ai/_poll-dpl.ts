// One-off: poll a Vercel deployment to a terminal state. Env pre-injected by `npx dotenv -e .env.local --`.
const T = process.env.VERCEL_TOKEN!, TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const ID = process.argv[2];
(async () => {
  if (!T) { console.log("VERCEL_TOKEN absent"); process.exit(1); }
  for (let i = 1; i <= 45; i++) {
    const r = await fetch(`https://api.vercel.com/v13/deployments/${ID}?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${T}` } });
    const j: any = await r.json();
    const st = j.readyState ?? j.status;
    console.log(`[${i}] ${st}`);
    if (st === "READY") { console.log("SHA:", j.meta?.githubCommitSha?.slice(0, 7)); console.log("ALIASES:", JSON.stringify(j.alias ?? []).slice(0, 400)); process.exit(0); }
    if (st === "ERROR" || st === "CANCELED") { console.log("FAILED:", JSON.stringify(j.errorMessage ?? "").slice(0, 300)); process.exit(1); }
    await new Promise((s) => setTimeout(s, 20000));
  }
  console.log("timed out still building"); process.exit(2);
})();
