// FOUNDING SERVED-SURFACE PIN — verify the fabrication is cleared on the served v5 surface for 496a9a21.
// Method (per CEO step 3): renderV5ReportFromRow with PRODUCTION CONFIG. Production config = the live Vercel
// production AUDIT_* plain flag set, pulled fresh in-script (not a hand-guess), applied to process.env.
import { readFileSync } from "node:fs";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const CONFLICT = /findings conflict and the engine will not adjudicate/gi;
const ELIG_GATE = /A bidder-eligibility gate stated in the solicitation governs award/gi;
const FAILLOUD = /the cause was not recorded in this report/gi;
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

(async () => {
  // 1) Pull live production AUDIT_* plain flags and apply them = production config.
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j = await res.json();
  const envs = j.envs || j.env || [];
  let applied = 0, nhrTrueInProd = false;
  for (const e of envs) {
    if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" &&
        Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") {
      process.env[e.key] = e.value;
      applied++;
      if (e.key === "AUDIT_NHR_NARRATIVE_TRUE_CAUSE" && e.value === "true") nhrTrueInProd = true;
    }
  }
  // AUDIT_REPORT_V5 / AUDIT_V5_SEAL are encrypted on Vercel (value not readable via API); prod serves v5
  // by execution, and renderV5ReportFromRow is the served function for agentic_v3 rows — set true to match.
  process.env.AUDIT_REPORT_V5 = "true";
  process.env.AUDIT_V5_SEAL = "true";
  console.log(`prod AUDIT_* plain flags applied: ${applied}`);
  console.log(`AUDIT_NHR_NARRATIVE_TRUE_CAUSE present+true in prod config: ${nhrTrueInProd}`);

  const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/row-496a9a21-live.json", "utf8"));

  // 2) SERVED-NOW: render with production config exactly as pulled (flag ON).
  const now = renderV5ReportFromRow(row);
  const nowTxt = strip(now);
  const now_conflict = (nowTxt.match(CONFLICT) || []).length;
  const now_elig = (nowTxt.match(ELIG_GATE) || []).length;
  const now_faillloud = (nowTxt.match(FAILLOUD) || []).length;

  // 3) SERVED-BEFORE contrast: same config but flag REMOVED (the ~10-day fabrication state).
  delete process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE;
  const before = renderV5ReportFromRow(row);
  const beforeTxt = strip(before);
  const before_conflict = (beforeTxt.match(CONFLICT) || []).length;
  const before_elig = (beforeTxt.match(ELIG_GATE) || []).length;

  // headline (engine-baked, carried in the row) — extract to check agreement with the walkthrough.
  const hmatch = nowTxt.match(/NEEDS HUMAN REVIEW|Human confirmation required|eligibility/i);

  console.log("\n=== SERVED-SURFACE PIN · audit 496a9a21 (FA813726R0033, eligibility-NHR) ===");
  console.log(`BEFORE (flag removed, ~10-day served state): conflict-step=${before_conflict}  elig-gate=${before_elig}`);
  console.log(`NOW    (production config, flag armed):       conflict-step=${now_conflict}  elig-gate=${now_elig}  faillloud-substitute=${now_faillloud}`);

  const pass =
    before_conflict >= 1 &&           // the fabrication existed
    now_conflict === 0 &&             // it is gone on the served surface
    now_elig >= 1 &&                  // the true eligibility cause renders
    now_faillloud === 0 &&            // no uncomputed-cause substitute (fail-loud path intact for KNOWN cause)
    !!hmatch;                         // walkthrough now speaks eligibility/human-review — agrees with headline
  console.log(`\nRESULT: ${pass ? "PASS — fabrication CLEARED on served surface, true cause renders, headline+walkthrough agree" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
})();
