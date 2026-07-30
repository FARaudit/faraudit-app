// Poll a Vercel deployment to READY + report its production aliases. Node timers (not shell sleep).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const ID = process.argv[2] || "dpl_7avPbXb9x5cGMpGYwuCRPXt2XDAM";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`https://api.vercel.com/v13/deployments/${ID}?teamId=${TEAM}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const j = await res.json();
    const state = j.readyState || j.status;
    console.log(`[${i}] state=${state} sha=${j.meta?.githubCommitSha?.slice(0,7) ?? "?"}`);
    if (state === "READY") {
      const aliases = j.alias || [];
      console.log(`READY. aliases: ${JSON.stringify(aliases)}`);
      // confirm faraudit.com points here
      const a = await fetch(`https://api.vercel.com/v9/aliases?teamId=${TEAM}&limit=50`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const aj = await a.json();
      const fara = (aj.aliases || []).find((x: any) => x.alias === "faraudit.com");
      console.log(`faraudit.com → deploymentId=${fara?.deploymentId ?? "?"} (this dpl=${ID}) match=${fara?.deploymentId === ID}`);
      process.exit(0);
    }
    if (state === "ERROR" || state === "CANCELED") { console.log("BUILD FAILED"); process.exit(1); }
    await sleep(15000);
  }
  console.log("timeout waiting for READY");
  process.exit(2);
})();
