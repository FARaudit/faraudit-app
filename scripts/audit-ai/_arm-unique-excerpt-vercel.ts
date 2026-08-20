// ARM — AUDIT_COVERAGE_UNIQUE_EXCERPT = true on VERCEL PRODUCTION (Rule 17 parity with the audit-worker).
// CEO authorized in words 2026-08-20 ("arm it now"). Armed BEFORE the merge of PR #727 deliberately:
// Vercel snapshots env at BUILD START, so arming after the merge produces a green deploy on the right sha
// that does not carry the flag. The code is not merged yet, so the flag is inert until it is — harmless.
//
// Step 1: POST the env var (plain, target=production). Step 2: READ IT BACK from the live list and assert
// value==="true" AND target includes production — the read-back is the sole authority, a POST outcome is advisory
// (Vercel signals already-exists as HTTP 400 + code ENV_CONFLICT, not 409). Does NOT redeploy: that is a separate
// explicit step, because a running build carries the OLD env snapshot and only a FRESH GIT BUILD picks this up.
// The value is a boolean and only its boolean-ness is printed (Rules 32/46).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_arm-binding-doc-floor-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const KEY = "AUDIT_COVERAGE_UNIQUE_EXCERPT";

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");

  const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
  });
  const pj = (await post.json()) as { error?: { code?: string } };
  const conflict = pj?.error?.code === "ENV_CONFLICT";
  console.log(`POST ${KEY} → HTTP ${post.status}${conflict ? " (already present — read-back decides)" : ""}`);
  if (!post.ok && !conflict) console.log(`  body: ${JSON.stringify(pj).slice(0, 300)}`);

  // READ-BACK — the authority.
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  const { envs } = (await res.json()) as { envs: Array<{ key: string; value?: string; target?: string[] }> };
  const hits = envs.filter((e) => e.key === KEY && (e.target ?? []).includes("production"));
  const armed = hits.length === 1 && hits[0].value === "true";
  console.log(`READ-BACK ${KEY}: ${hits.length} production entr${hits.length === 1 ? "y" : "ies"}, value ${hits[0]?.value === "true" ? "true" : hits[0]?.value === "false" ? "false" : "<absent/non-boolean>"}`);
  if (hits.length > 1) console.log(`  ⚠ DUPLICATE production entries — resolve before trusting the value`);
  console.log(armed ? `\n✅ ARMED on Vercel production. NOT yet live — a FRESH GIT BUILD is required (env-snapshot trap).`
                    : `\n❌ NOT ARMED — read-back disagrees. Do not claim parity.`);
  process.exit(armed ? 0 : 1);
})();
