// ARM — AUDIT_MAX_DOCS=60 + AGENTIC_MAX_FULLSOURCE_CHARS=3000000 on VERCEL PRODUCTION (Rule 17 parity
// with audit-worker, armed there first). CEO authorized in words 2026-08-05 ("arm the ceilings"), after
// PRs #482 + #484 merged as 3668c5e1 + 7490fff3.
//
// WHY PARITY IS REQUIRED: both ceilings are read by src/lib — MAX_DOCS in sam-attachments.ts, the char
// ceiling in agentic-executor.ts — and BOTH the Railway worker (agents/audit-worker/worker.ts imports
// @/lib/audit-executor) and the Vercel route (src/app/api/audit/route.ts) run that same pipeline. Armed
// on the worker only, the SAME solicitation would ingest a different number of documents depending on
// which door the audit came through.
//
// WHY BOTH KEYS MOVE TOGETHER, and this is measured not predicted: the 36 surviving docs already assemble
// to 1,565,625 chars against a 1,400,000 char ceiling, so raising the doc count alone just relocates the
// drop to a later stage where it is harder to see. Admitting all 55 needs ~2.39M chars.
//
// POST, then READ BACK — the read-back is the sole authority (Vercel signals already-exists as HTTP 400 +
// ENV_CONFLICT, not 409). PATCHes an existing entry rather than treating a conflict as success, so a
// wrong-valued entry can never be reported as armed. Does NOT redeploy: a running build carries the OLD
// env snapshot and only a FRESH GIT BUILD picks this up. Values are printed in full — these are ingest
// ceilings, not credentials, and the exact number IS the proof (Rules 32/46 govern secrets, not integers).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_arm-ingest-ceilings-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const WANT: Record<string, string> = { AUDIT_MAX_DOCS: "60", AGENTIC_MAX_FULLSOURCE_CHARS: "3000000" };

type Env = { id: string; key: string; value?: string; target?: string[] };
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const list = async (): Promise<Env[]> => {
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, { headers: H });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  return ((await res.json()) as { envs: Env[] }).envs;
};
const prod = (envs: Env[], key: string) => envs.filter((e) => e.key === key && (e.target ?? []).includes("production"));

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");
  for (const [KEY, VALUE] of Object.entries(WANT)) {
    const existing = prod(await list(), KEY);
    if (existing.length > 1) { console.log(`⚠ ${KEY}: ${existing.length} production entries — resolve before trusting any value`); process.exit(1); }
    if (existing.length === 1) {
      const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env/${existing[0].id}?teamId=${TEAM}`,
        { method: "PATCH", headers: H, body: JSON.stringify({ value: VALUE, target: ["production"] }) });
      console.log(`PATCH ${KEY} (existing entry) → HTTP ${r.status}`);
    } else {
      const r = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`,
        { method: "POST", headers: H, body: JSON.stringify({ key: KEY, value: VALUE, type: "plain", target: ["production"] }) });
      const j = (await r.json()) as { error?: { code?: string } };
      console.log(`POST ${KEY} → HTTP ${r.status}${j?.error?.code === "ENV_CONFLICT" ? " (already present — read-back decides)" : ""}`);
    }
  }
  const after = await list();
  let allArmed = true;
  for (const [KEY, VALUE] of Object.entries(WANT)) {
    const hits = prod(after, KEY);
    const armed = hits.length === 1 && hits[0].value === VALUE;
    allArmed &&= armed;
    console.log(`READ-BACK ${KEY}: ${hits.length} production entr${hits.length === 1 ? "y" : "ies"}, value ${hits[0]?.value ?? "<absent>"} (want ${VALUE}) ${armed ? "✓" : "✗"}`);
  }
  console.log(allArmed ? `\n✅ BOTH ceilings ARMED on Vercel production. NOT yet live — a FRESH GIT BUILD is required (env-snapshot trap).`
                       : `\n❌ NOT ARMED — read-back disagrees. Do not claim parity.`);
  process.exit(allArmed ? 0 : 1);
})();
