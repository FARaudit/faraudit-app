// SERVED-SURFACE PIN — AUDIT_COVERAGE_COUNTER_SPLIT (Vehicle A–E · item C, render layer).
// Gates the Vercel arm of this flag (L44: render flags are served by Vercel; the worker arm is a no-op for the report).
// Method mirrors the founding NHR pin (_pin-served-verify.ts): pull the LIVE Vercel production AUDIT_* plain flag set,
// apply as prod config, render the served function renderV5ReportFromRow on a REAL persisted row, and contrast the
// coverage-step copy with the flag ARMED vs the current served (flag-absent) state.
// Pin row: FA813726 e63bd1e7 — INCOMPLETE pole with read===total (the self-contradictory "9 of 9 … A partial read
// cannot certify" that the design comment at render.ts:292 names). $0. Read-only.
import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
import { classifyEnv, equals, describe, applyReadableProductionEnv, type RawVercelEnv } from "./vercel-env-state";

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

// The internally-contradictory legacy string (flag-OFF) and the honest replacement (flag-ON).
const LEGACY = /documents could be read\. A partial read cannot certify what it did not see/gi;
const HONEST = /All \d+ documents were read; the sequence stops because not all binding content could be grounded\/confirmed/gi;
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// Verdict-band phrases — used to confirm the pole/headline did NOT move (no verdict regression).
const bandOf = (t: string) => (t.match(/NEEDS HUMAN REVIEW|INCOMPLETE|BID-WITH-CAUTION|DO NOT BID|INELIGIBLE|\bBID\b/i) || ["?"])[0];

(async () => {
  // 1) prod config = live Vercel production AUDIT_* plain flags, pulled fresh.
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j = await res.json();
  const envs = (j.envs || j.env || []) as RawVercelEnv[];
  const { applied, unreadable } = applyReadableProductionEnv(envs);
  process.env.AUDIT_REPORT_V5 = "true";
  process.env.AUDIT_V5_SEAL = "true";
  console.log(`prod AUDIT_* readable flags applied: ${applied.length}`);
  if (unreadable.length) console.log(`⚠ not readable here, therefore OFF in the renders below though possibly ON in production: ${unreadable.join(", ")}`);
  // The expected answer here is FALSE, which is exactly why the old two-state read was dangerous: an ENCRYPTED
  // entry also produced `false`, and a wrong reading that agrees with the expectation is the one nobody re-checks.
  const cov = classifyEnv(envs, "AUDIT_COVERAGE_COUNTER_SPLIT");
  const covsplitInProd = equals(cov, "true");
  console.log(`AUDIT_COVERAGE_COUNTER_SPLIT in prod config → ${describe(cov)} · === "true": ${covsplitInProd === null ? "UNKNOWABLE" : covsplitInProd} (expected false — this is the arm being gated)`);
  if (covsplitInProd === null) { console.log(`\nRESULT: UNVERIFIABLE — the BEFORE state of the flag under test cannot be read, so the before/after contrast has no baseline.`); process.exit(2); }

  const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/row-e63bd1e7-live.json", "utf8"));

  // 2) SERVED-BEFORE = current served state (flag absent/OFF) — the contradictory legacy copy.
  delete process.env.AUDIT_COVERAGE_COUNTER_SPLIT;
  const before = renderV5ReportFromRow(row);
  const beforeTxt = strip(before);
  const before_legacy = (beforeTxt.match(LEGACY) || []).length;
  const before_honest = (beforeTxt.match(HONEST) || []).length;
  const before_band = bandOf(beforeTxt);

  // 3) SERVED-NOW = armed state (prod config + flag ON) — the honest read-vs-grounded copy.
  process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";
  const now = renderV5ReportFromRow(row);
  const nowTxt = strip(now);
  const now_legacy = (nowTxt.match(LEGACY) || []).length;
  const now_honest = (nowTxt.match(HONEST) || []).length;
  const now_band = bandOf(nowTxt);

  console.log("\n=== SERVED-SURFACE PIN · audit e63bd1e7 (FA813726R0033, INCOMPLETE pole) ===");
  console.log(`BEFORE (flag OFF, current served): legacy-contradiction=${before_legacy}  honest-copy=${before_honest}  band=${before_band}`);
  console.log(`NOW    (flag ARMED):               legacy-contradiction=${now_legacy}  honest-copy=${now_honest}  band=${now_band}`);
  console.log(`byte delta (now - before): ${now.length - before.length}`);

  const pass =
    before_legacy >= 1 &&        // the self-contradictory legacy copy was being served
    now_legacy === 0 &&          // it is gone once armed
    now_honest >= 1 &&           // the honest read-vs-grounded copy renders
    before_honest === 0 &&       // (the honest copy was NOT present pre-arm — proves it's the flag's doing)
    now_band === before_band &&  // verdict band/headline unchanged — no verdict regression, copy-only
    before_band !== "?";         // sanity: we actually located the band
  console.log(`\nRESULT: ${pass ? "PASS — legacy contradiction cleared on served surface, honest copy renders, verdict band unchanged (copy-only)" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
})();
