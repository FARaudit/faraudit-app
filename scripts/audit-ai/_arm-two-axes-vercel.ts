// ARM — the two coverage axes on VERCEL PRODUCTION (Rule 17 parity with the audit-worker).
//
// CEO authorized in words 2026-08-20: "go ahead and ship and merge and deploy and keep going ensure we
// tackle every step of the engine". Ruling R5 (CEO-approved 2026-08-17) settled cost: +$2/audit against
// a run already spending $5.67 on a panel that landed nothing. Cost is not the gate. The LIVE RUN is the
// proof, and firing one is the CEO's call, never Code's (G2).
//
// Read-back is the SOLE authority — a POST outcome is advisory, because Vercel signals already-exists as
// HTTP 400 + ENV_CONFLICT rather than 409. Every value here is a boolean or a small integer; no secret is
// involved, so printing the value is Rule 32/46 compliant.
//
//   npx tsx scripts/audit-ai/_arm-two-axes-vercel.ts
import dotenv from "dotenv";
dotenv.config({ path: "/Users/josearodriguezjr./faraudit-app/.env.local", quiet: true });

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

/** Axis 1 routes documents to owning lenses; axis 2 sends the homogeneous spec bulk to per-document
 *  extraction instead of a lens read. Concurrency is SCHEDULE ONLY and changes no result. */
const WANT: Record<string, string> = {
  AUDIT_DOC_OWNERSHIP: "true",
  AUDIT_DOC_EXTRACTION: "true",
  AUDIT_DOC_EXTRACTION_SPEC_BULK: "true",
  AGENTIC_DOC_EXTRACTION_CONCURRENCY: "4",
};

(async () => {
  if (!TOKEN) throw new Error("VERCEL_TOKEN absent from .env.local");

  for (const [key, value] of Object.entries(WANT)) {
    const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, type: "plain", target: ["production"] }),
    });
    const pj = (await post.json()) as { error?: { code?: string } };
    const conflict = pj?.error?.code === "ENV_CONFLICT";
    console.log(`POST ${key.padEnd(34)} → HTTP ${post.status}${conflict ? " (already present — read-back decides)" : ""}`);
  }

  // READ-BACK — the authority. An entry that exists with the WRONG value is the failure mode this catches:
  // every surface would say "armed" while the running lambda read something else.
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}&decrypt=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`env list HTTP ${res.status}`);
  const { envs } = (await res.json()) as { envs: Array<{ key: string; value?: string; target?: string[] }> };

  let allOk = true;
  console.log("");
  for (const [key, value] of Object.entries(WANT)) {
    const hits = envs.filter((e) => e.key === key && (e.target ?? []).includes("production"));
    const ok = hits.length === 1 && hits[0].value === value;
    if (!ok) allOk = false;
    console.log(`READ-BACK ${key.padEnd(34)} ${hits.length} production entr${hits.length === 1 ? "y" : "ies"}, value ${hits[0]?.value ?? "<absent>"} ${ok ? "OK" : "MISMATCH"}`);
    if (hits.length > 1) console.log(`  DUPLICATE production entries for ${key} — resolve before trusting it`);
  }

  console.log(allOk
    ? `\n✅ ARMED on Vercel production. NOT yet live — a FRESH GIT BUILD is required (env-snapshot trap).`
    : `\n❌ NOT ARMED — read-back disagrees. Do not claim parity.`);
  process.exit(allOk ? 0 : 1);
})();
