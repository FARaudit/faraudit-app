// CO-LOCATED cert — card #582 bank instrumentation (capture-only + coverage-stage replay). Run:
//   npx tsx src/lib/audit-run-record-instrumentation.test.ts
// Proves: (a) captureAuditFlagEnv snapshots the FULL AUDIT_* env; (b) replayCoverageStage re-runs gradeCoverageV2 from a
// banked record + computes the AUDIT_FINDING_DEDUP delta from the #582 pre-dedup snapshot, toggling per-flag; (c) a
// pre-#582 record (no flagEnv / no diagnostics) still loads + replays (absent-field tolerant); (d) buildRunRecord omits
// diagnostics when the run didn't capture it (flag-OFF byte-identity of the record shape).
import { captureAuditFlagEnv, replayCoverageStage, buildRunRecord, type RunRecord } from "./audit-run-record";
import type { TypedFinding, VerdictInputs } from "./audit-findings";
import type { AuditResult } from "./audit-orchestrator";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// ── (a) captureAuditFlagEnv ──────────────────────────────────────────────────────────────────────────
console.log("\n── 1 · captureAuditFlagEnv: full AUDIT_* env, false included, non-AUDIT excluded, undefined skipped ──");
{
  const env = { AUDIT_ZED: "true", AUDIT_ALPHA: "false", AUDIT_UNDEF: undefined, PATH: "/usr/bin", HOME: "/root", AUDIT_MODEL: "claude-opus-4-8" };
  const snap = captureAuditFlagEnv(env);
  assert(snap.AUDIT_ZED === "true" && snap.AUDIT_ALPHA === "false", "captures AUDIT_* incl. false values");
  assert(snap.AUDIT_MODEL === "claude-opus-4-8", "captures non-boolean AUDIT_* (model id) too");
  assert(!("PATH" in snap) && !("HOME" in snap), "excludes non-AUDIT_ keys");
  assert(!("AUDIT_UNDEF" in snap), "skips undefined values");
  assert(JSON.stringify(Object.keys(snap)) === JSON.stringify(["AUDIT_ALPHA", "AUDIT_MODEL", "AUDIT_ZED"]), "keys are sorted for stable diffs");
}

// ── helpers: a minimal banked record (replayCoverageStage reads only input.fullSource, coverage.attestations,
//    diagnostics.preProcessingFindings — inputs/format are cast since the coverage-stage replay never touches them). ──
const plainFinding = (id: string): TypedFinding => ({
  id, requirement: "Contractor may extend the term per FAR 52.217-8.", citation: "FAR 52.217-8",
  excerpt: "Option to Extend Services (52.217-8)", kind: "clause_flowdown", controllability: "bidder_controls",
  grounded: true, lens: "contracts_attorney", severity: "P2", curableInWindow: true,
});
const mkRecord = (opts: { withDiagnostics: boolean; withFlagEnv: boolean }): RunRecord => ({
  schema: "run-record/v1",
  meta: { runId: "test-1", startedAt: "2026-07-20T00:00:00.000Z", flags: {}, ...(opts.withFlagEnv ? { flagEnv: { AUDIT_FINDING_DEDUP: "true" } } : {}) },
  input: { fullSource: "==== DOCUMENT: SAM Notice Body ====\nA benign combined synopsis for widgets.", bidderProfile: null, naics: null, setAside: null, manifestComplete: null },
  format: { formatDetected: "commercial", procurementPart: "12", manifest: [], coreMissing: [] },
  result: {
    verdict: "NEEDS_HUMAN_REVIEW", eligible: null, reason: "test", inputs: {} as VerdictInputs,
    findings: [], coverage: { required: [], covered: [], missing: [], attestations: [], coreMissing: [] },
    conflict: false, sectionsRead: [], perLens: {},
    ...(opts.withDiagnostics ? { diagnostics: { preProcessingFindings: [plainFinding("a"), plainFinding("b")], stageCounts: { preDedup: 2, postDedup: 1 } } } : {}),
  },
  billing: { honestFail: true, billable: false },
});

// ── (b) replayCoverageStage — per-flag dedup delta toggles with AUDIT_FINDING_DEDUP ──────────────────
console.log("\n── 2 · replayCoverageStage: gradeCoverageV2 re-runs + AUDIT_FINDING_DEDUP delta toggles per-flag ──");
{
  const rec = mkRecord({ withDiagnostics: true, withFlagEnv: true });
  const prev = process.env.AUDIT_FINDING_DEDUP;

  process.env.AUDIT_FINDING_DEDUP = "true";
  const on = replayCoverageStage(rec);
  assert(on.gradeV2Ran === true, "gradeCoverageV2 re-ran from the record's attestations");
  assert(on.dedup !== null && on.dedup.pre === 2, "dedup replay sees the 2 pre-dedup findings from #582 diagnostics");
  assert(on.dedup !== null && on.dedup.delta === 1, "AUDIT_FINDING_DEDUP=ON collapses the 2 same-clause plain dups → delta 1");

  process.env.AUDIT_FINDING_DEDUP = "";
  const off = replayCoverageStage(rec);
  assert(off.dedup !== null && off.dedup.delta === 0, "AUDIT_FINDING_DEDUP=OFF → no collapse → delta 0 (per-flag isolation proven)");

  if (prev === undefined) delete process.env.AUDIT_FINDING_DEDUP; else process.env.AUDIT_FINDING_DEDUP = prev;
}

// ── (c) absent-field tolerance — a pre-#582 record (no flagEnv, no diagnostics) still replays ─────────
console.log("\n── 3 · absent-field tolerance: pre-#582 record (no diagnostics/flagEnv) replays without throwing ──");
{
  const old = mkRecord({ withDiagnostics: false, withFlagEnv: false });
  let threw = false, r: ReturnType<typeof replayCoverageStage> | null = null;
  try { r = replayCoverageStage(old); } catch { threw = true; }
  assert(!threw, "replayCoverageStage does not throw on a record lacking diagnostics");
  assert(r !== null && r.gradeV2Ran === true, "coverage grader still re-runs on the old record");
  assert(r !== null && r.dedup === null, "dedup delta is null when the record predates the #582 pre-dedup snapshot (honest gap, not a crash)");
  assert(old.meta.flagEnv === undefined, "old record has no flagEnv (back-compat)");
}

// ── (d) flag-OFF record-shape byte-identity — buildRunRecord omits diagnostics when the run didn't capture it ──
console.log("\n── 4 · buildRunRecord: diagnostics key ABSENT when the AuditResult carries none (flag-OFF byte-identity) ──");
{
  const baseResult = {
    decision: { verdict: "BID", eligible: true, reason: "ok" }, inputs: {} as VerdictInputs, findings: [],
    coverage: { required: [], covered: [], missing: [], attestations: [], coreMissing: [] }, perLens: {}, conflict: false,
    sectionsRead: [], trace: {},
  } as unknown as AuditResult;
  const recOff = buildRunRecord({ meta: { runId: "x", startedAt: "t", flags: {} }, input: { fullSource: "s", bidderProfile: null, naics: null, setAside: null, manifestComplete: null }, result: baseResult, billing: { honestFail: false, billable: true } });
  assert(!("diagnostics" in recOff.result), "no diagnostics key on the record when the run didn't bank it");
  const recOn = buildRunRecord({ meta: { runId: "y", startedAt: "t", flags: {} }, input: { fullSource: "s", bidderProfile: null, naics: null, setAside: null, manifestComplete: null }, result: { ...baseResult, diagnostics: { preProcessingFindings: [plainFinding("a")], stageCounts: { preDedup: 1, postDedup: 1 } } }, billing: { honestFail: false, billable: true } });
  assert("diagnostics" in recOn.result && recOn.result.diagnostics!.stageCounts.preDedup === 1, "diagnostics carried through when the AuditResult has it");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
