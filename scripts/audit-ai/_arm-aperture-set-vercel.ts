// ARM — the SEQ5-ROOTS aperture SET on VERCEL PRODUCTION (Rule 17 parity with the audit-worker).
// CEO in-words authorized 2026-07-30 ("merge and arm as a set").
//
// TWO KEYS, ARMED TOGETHER AND NEVER SEPARATELY:
//   AUDIT_ROUTING_HEAD_COVERAGE  (#363) — recovers the pre-first-anchor head (20/20 routed packages lost it).
//   AUDIT_UCF_CLASS_STRICT       (#365) — stops the 4-of-4 false-positive UCF classification.
// CLASS_STRICT sends the two VA packages down the ROUTED path, where the head is dropped unless HEAD_COVERAGE
// is also on. On 36C25626Q1137 that head is 31,581 chars — 24% of the document, carrying the deadline, questions
// deadline, set-aside and NAICS. Armed alone, CLASS_STRICT would replace an honest INCOMPLETE with a CONFIDENT
// verdict missing the cover page. So this script arms BOTH or exits non-zero having armed NEITHER usefully —
// and it re-reads every key at the end, asserting the SET is coherent before reporting success.
//
// AUDIT_UCF_BLIND_SECTION_FALLBACK (#362) is deliberately NOT armed: once CLASS_STRICT is live no corpus
// document reaches the blind-UCF path, so it is a backstop for a case that no longer occurs — and it is the one
// flag carrying real whole-source cost.
//
// Does NOT redeploy — that is a separate explicit step after read-back verifies (the env-snapshot trap: a
// Vercel env change only reaches the running app via a FRESH BUILD). Secrets never echoed (Rule 32/46).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

const ARM = ["AUDIT_ROUTING_HEAD_COVERAGE", "AUDIT_UCF_CLASS_STRICT"] as const;
// Asserted as part of the coherent set, but NOT written by this script.
const EXPECT_ALREADY_TRUE = ["AUDIT_NMR_CITATION_HONESTY"] as const;
const EXPECT_ABSENT = ["AUDIT_UCF_BLIND_SECTION_FALLBACK"] as const;

const listEnv = async (): Promise<any[]> => {
  const r = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!r.ok) throw new Error(`GET env failed HTTP ${r.status}`);
  const j: any = await r.json();
  return j.envs || j.env || [];
};

(async () => {
  if (!TOKEN) { console.log("VERCEL_TOKEN missing from .env.local — aborting"); process.exit(1); }

  for (const KEY of ARM) {
    const post = await fetch(`https://api.vercel.com/v10/projects/${PROJ}/env?teamId=${TEAM}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: KEY, value: "true", type: "plain", target: ["production"] }),
    });
    console.log(`POST ${KEY} → HTTP ${post.status}`);
    if (!post.ok) {
      const body = JSON.stringify(await post.json()).slice(0, 300);
      console.log(`  body: ${body}`);
      console.log(`  ABORT — ${KEY} not set. The SET is incoherent; do NOT redeploy.`);
      process.exit(1);
    }
  }

  // ── SET COHERENCE read-back — the whole point. Verify every key, not just the ones we wrote. ──
  const envs = await listEnv();
  const prodVal = (k: string): string | null => {
    const hit = envs.find((e: any) => e.key === k && Array.isArray(e.target) && e.target.includes("production"));
    return hit ? String(hit.value) : null;
  };

  let bad = 0;
  for (const k of ARM) {
    const v = prodVal(k);
    const ok = v === "true";
    console.log(`${ok ? "OK  " : "FAIL"} ${k.padEnd(34)} production=${v ?? "<absent>"}`);
    if (!ok) bad++;
  }
  for (const k of EXPECT_ALREADY_TRUE) {
    const v = prodVal(k);
    const ok = v === "true";
    console.log(`${ok ? "OK  " : "FAIL"} ${k.padEnd(34)} production=${v ?? "<absent>"}  (expected already-armed)`);
    if (!ok) bad++;
  }
  for (const k of EXPECT_ABSENT) {
    const v = prodVal(k);
    const ok = v === null || v === "false";
    console.log(`${ok ? "OK  " : "FAIL"} ${k.padEnd(34)} production=${v ?? "<absent>"}  (expected NOT armed)`);
    if (!ok) bad++;
  }

  if (bad) { console.log(`\n${bad} SET-COHERENCE FAILURE(S) — do NOT redeploy until resolved.`); process.exit(1); }
  console.log("\nSET COHERENT on Vercel production. Next: _redeploy-prod.ts (env changes need a FRESH BUILD), then poll READY.");
})();
