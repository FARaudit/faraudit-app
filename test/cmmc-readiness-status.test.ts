// ─────────────────────────────────────────────────────────────────────────────
// CMMC READINESS — A RUN THAT NEVER FINISHED CANNOT ANSWER A COMPLIANCE QUESTION.
//
// The defect this locks down: /api/cmmc-readiness selected from `audits` with no status filter.
// 11 of the 116 live rows are status 'failed', a failed run carries no compliance_json, and
// inferLevel returns level "0" for it — so the row landed in the "No CMMC named" bucket, whose
// caption on the page reads "nothing in the audit triggers a level". That is a positive claim
// about an audit that does not exist. A solicitation whose only run failed was reported to the
// customer as clear of CMMC.
//
// The rows below are transcribed from production `audits` — solicitation W911SG27BA002, Fort Bliss
// Paving IDIQ, which really does carry all three states this gate needs: two complete runs, one of
// them carrying the CUI banner marking that puts it at Level 2, and one failed run whose
// error_message is the engine's own ("agentic V3 primary overall budget (360s) exceeded").
//
// Run: npx tsx test/cmmc-readiness-status.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)

import { aggregateCmmc, isAnalyzed } from "../src/lib/bd-os/cmmc-aggregate";
import { inferLevel } from "../src/lib/bd-os/cmmc-levels";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// ── the real rows ───────────────────────────────────────────────────────────
// The CUI excerpt is the persisted finding verbatim: a line holding nothing but CUI is the BANNER
// MARKING, mandatory top and bottom of every page carrying it, and the reason this solicitation
// is Level 2 at all.
const CUI_FINDING = {
  kind: "submission",
  excerpt: "3, 2026 \tFE 10031 4J\nPage | 8\nCUI\n• \tUFGS 32 84 23 Underground Sprinkler Systems.pdf",
  citation: "§C (grounding sweep)"
};

const COMPLETE_L2 = {
  id: "e5f177aa-4aee-4974-ac3f-ae7703b49c87",
  status: "complete",
  notice_id: "8799e548c40f4ecb91187408ce877023",
  solicitation_number: "W911SG27BA002",
  title: "New Fort Bliss Paving IDIQ Contract",
  agency: "DEPT OF DEFENSE · DEPT OF THE ARMY",
  created_at: "2026-08-05T18:55:37.045486+00:00",
  response_deadline: "2026-09-10T09:00:00-06:00",
  compliance_json: { engine: "agentic_v3", analysis_phase: "done", v3: { findings: [CUI_FINDING] } }
};

// Transcribed verbatim. compliance_json really is NULL on this row — that is what a failed run
// leaves behind, and it is why inferLevel reads it as level "0".
const FAILED = {
  id: "58c612f5-48d9-4101-a5ff-acb010c8a9f1",
  status: "failed",
  notice_id: "8799e548c40f4ecb91187408ce877023",
  solicitation_number: "W911SG27BA002",
  title: "New Fort Bliss Paving IDIQ Contract",
  agency: "DEPT OF DEFENSE · DEPT OF THE ARMY",
  created_at: "2026-08-05T16:30:52.749137+00:00",
  response_deadline: "2026-09-10T09:00:00-06:00",
  error_message: "agentic V3 primary overall budget (360s) exceeded — engine stalled",
  compliance_json: null
};

// A failed run on a solicitation with NO successful run — the shape that reaches the customer as
// a clean solicitation. Same row, re-keyed to a different solicitation number.
const FAILED_ALONE = { ...FAILED, id: "failed-alone", solicitation_number: "W9126G26RA087", notice_id: "n-alone" };

console.log(`\n── A · the premise: a failed run infers level "0" ──`);
ok(inferLevel(FAILED).level === "0",
  "inferLevel really does return level 0 for the real failed row — the counting layer is where this must be caught",
  `got L${inferLevel(FAILED).level}`);
ok(inferLevel(COMPLETE_L2).level === "2" && inferLevel(COMPLETE_L2).trigger === "CUI",
  "…and Level 2 for the complete run of the same solicitation",
  `${inferLevel(COMPLETE_L2).level} · ${inferLevel(COMPLETE_L2).trigger}`);
ok(!isAnalyzed(FAILED) && isAnalyzed(COMPLETE_L2), "isAnalyzed separates the two");

console.log(`\n── B · a failed-only solicitation is counted, never classified ──`);
{
  const a = aggregateCmmc([FAILED_ALONE]);
  ok(a.distribution["0"] === 0,
    "the failed solicitation is NOT in the No-CMMC-named bucket", `got ${a.distribution["0"]}`);
  ok(a.totalSolicitations === 1,
    "it is still counted as a solicitation — the customer paid for that run", `got ${a.totalSolicitations}`);
  ok(a.analyzedSolicitations === 0, "…but not as an analyzed one", `got ${a.analyzedSolicitations}`);
  ok(a.unanalyzed === 1 && a.unanalyzedFailed === 1 && a.unanalyzedRunning === 0,
    "it is reported as a FAILED run, not as one still coming",
    `unanalyzed=${a.unanalyzed} failed=${a.unanalyzedFailed} running=${a.unanalyzedRunning}`);
  ok(a.reason === "none-analyzed",
    "the page state is 'nothing was read', not 'nothing was found'", `got ${a.reason}`);
}

console.log(`\n── C · NEGATIVE CONTROL: the pre-fix counting gets it wrong on this same row ──`);
// Without this, a green gate would prove only that the fixture is easy. This is the exact
// arithmetic the route shipped: every kept row inferred, level "0" included.
{
  const preFix = { "0": 0, "1": 0, "2": 0, "3": 0 } as Record<string, number>;
  for (const r of [FAILED_ALONE]) preFix[inferLevel(r).level] += 1;
  ok(preFix["0"] === 1,
    "the shipped code counted the failed run as a solicitation with no CMMC requirement",
    `pre-fix No-CMMC-named = ${preFix["0"]}`);
  ok(aggregateCmmc([FAILED_ALONE]).distribution["0"] !== preFix["0"],
    "the fix and the defect disagree on this row — the gate can go red");
}

console.log(`\n── D · a failed re-run must not delete a known obligation ──`);
// Re-auditing after an amendment is the normal path, so "the newest run failed" is reachable on a
// solicitation already known to require CMMC Level 2. Newest-wins alone would keep the failed row
// and the Level 2 would vanish from the page. Both rows are real; the ordering is the scenario.
{
  const failedRerun = { ...FAILED, id: "failed-rerun", created_at: "2026-08-07T09:00:00.000000+00:00" };
  const a = aggregateCmmc([failedRerun, COMPLETE_L2]);
  ok(a.totalSolicitations === 1, "the two runs collapse to one solicitation", `got ${a.totalSolicitations}`);
  ok(a.distribution["2"] === 1,
    "the Level 2 obligation survives the failed re-run", `L2 count = ${a.distribution["2"]}`);
  ok(a.byLevel["2"].length === 1 && a.byLevel["2"][0].id === COMPLETE_L2.id,
    "…and the row shown is the COMPLETE run, not the failed one",
    a.byLevel["2"][0] ? a.byLevel["2"][0].id : "no row");
  ok(a.unanalyzed === 0,
    "a solicitation that HAS an answer is not also reported as unanswered", `got ${a.unanalyzed}`);

  // Negative control for this case too: newest-wins alone loses the requirement.
  const newestWins = [failedRerun, COMPLETE_L2]
    .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))[0];
  ok(inferLevel(newestWins).level === "0",
    "newest-wins alone would have kept the failed run and reported Level 0");
}

console.log(`\n── E · both error directions, and the in-flight state ──`);
{
  // Live check 2026-08-10: across all 116 rows the two conditions coincide exactly — 11 rows are
  // 'failed' and 11 have no compliance_json, with no row on either side alone. They are ANDed
  // anyway, because the two ways they can diverge are different bugs and BOTH read as "clear":
  // a completed write that did not land, and a run that stopped mid-analysis.
  const completeNoJson = { ...COMPLETE_L2, id: "write-did-not-land", solicitation_number: "S-NO-JSON", compliance_json: null };
  const failedWithJson = { ...FAILED, id: "stopped-midway", solicitation_number: "S-PARTIAL", compliance_json: { v3: { findings: [CUI_FINDING] } } };
  const running = { ...FAILED, id: "in-flight", solicitation_number: "S-RUNNING", status: "processing" };

  const a = aggregateCmmc([completeNoJson, failedWithJson, running]);
  ok(a.analyzedSolicitations === 0, "none of the three is treated as an answer", `got ${a.analyzedSolicitations}`);
  ok(a.distribution["2"] === 0,
    "a partial record from a FAILED run does not flag Level 2 — a stopped run is not a finding",
    `L2 = ${a.distribution["2"]}`);
  ok(a.unanalyzedRunning === 1 && a.unanalyzedFailed === 2,
    "a run still in flight is counted apart from runs that ended with nothing",
    `running=${a.unanalyzedRunning} failed=${a.unanalyzedFailed}`);
  // A status the table has never held must not be silently admitted as an answer.
  ok(!isAnalyzed({ id: "x", compliance_json: { summary: "Handles CUI." } }),
    "a row with NO status at all fails closed — absent is not complete");
}

console.log(`\n── F · the arithmetic the page states must close ──`);
{
  const rows = [
    COMPLETE_L2,
    { ...COMPLETE_L2, id: "older-run-same-sol", created_at: "2026-08-04T10:00:00.000000+00:00" },
    FAILED_ALONE,
    { ...FAILED, id: "running-2", solicitation_number: "S-R2", status: "processing" },
    { ...COMPLETE_L2, id: "clean-sol", solicitation_number: "S-CLEAN", notice_id: "n-clean",
      compliance_json: { engine: "agentic_v3", v3: { findings: [{ kind: "t", excerpt: "Replace the printed circuit board assembly.", citation: "SOW 3.2" }] } } }
  ];
  const a = aggregateCmmc(rows);
  const distSum = a.distribution["0"] + a.distribution["1"] + a.distribution["2"] + a.distribution["3"];
  ok(distSum === a.analyzedSolicitations,
    "the distribution sums to the ANALYZED count, which is what the page prints beside it",
    `${distSum} vs ${a.analyzedSolicitations}`);
  ok(a.totalSolicitations - a.analyzedSolicitations === a.unanalyzed,
    "every solicitation is either classified or explicitly unanswered — no third bucket",
    `${a.totalSolicitations} - ${a.analyzedSolicitations} = ${a.totalSolicitations - a.analyzedSolicitations}, unanalyzed=${a.unanalyzed}`);
  ok(a.unanalyzed === a.unanalyzedFailed + a.unanalyzedRunning, "the split accounts for all of it");
  ok(a.totalAudited === rows.length && a.duplicatesCollapsed === rows.length - a.totalSolicitations,
    "runs and solicitations stay separately reported", `${a.totalAudited} runs, ${a.duplicatesCollapsed} collapsed`);
  ok(a.distribution["0"] === 1 && a.byLevel["2"].length === 1,
    "the genuinely clear solicitation is still reported clear — the fix does not mute real answers",
    `L0=${a.distribution["0"]} L2rows=${a.byLevel["2"].length}`);
}

console.log(`\n── G · the empty states stay distinguishable ──`);
{
  ok(aggregateCmmc([]).reason === "no-audits", "no rows at all");
  ok(aggregateCmmc([FAILED_ALONE]).reason === "none-analyzed", "rows, none finished");
  const clear = { ...COMPLETE_L2, solicitation_number: "S-CLEAN2",
    compliance_json: { engine: "agentic_v3", v3: { findings: [] } } };
  ok(aggregateCmmc([clear]).reason === "none-flagged", "finished, nothing found");
  ok(aggregateCmmc([COMPLETE_L2]).reason === null, "finished, something found");
}

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCMMC READINESS STATUS GATE FAILED — a run that produced no answer is being counted as one.");
  process.exit(1);
}
console.log("cmmc-readiness status handling clean.");
