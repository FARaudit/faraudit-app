// ── PAID-RUN DIAGNOSTICS · persisted run record + $0 deterministic replay ─────────────────────────────
// Brain card 197 Part 2. A paid audit run is expensive and NON-REPEATABLE (Rule 68 — no retry on divergence).
// When a terminal verdict diverges from expectation we must see WHY without re-spending: which section's
// obligations failed to ground, what the section manifest was, whether the format classified as expected.
// This module (a) CAPTURES a complete RunRecord from a finished AuditResult (`buildRunRecord`), and
// (b) REPLAYS the deterministic stages (detectSections → buildManifest → completenessOf → deriveVerdict)
// at $0 from that record (`replayRunRecord`), yielding per-section obligation grounding PASS/MISS.
//
// PURE — no fs, no network, no model. The paid-run harness owns writing the record to disk (a gitignore-safe
// location, since fullSource carries the real solicitation text); the replay CLI + fixture test read it.
// deriveVerdict over the persisted VerdictInputs reproduces the verdict exactly — an integrity check that the
// record captured the run faithfully. NOTE: `allConverged` is a runtime property of the agentic loop (not a
// deterministic function of the source), so it is carried through the persisted VerdictInputs.coverageComplete;
// the replay recomputes the DETERMINISTIC coverage (required/missing/grounding) and flags any drift vs what
// was recorded — a mismatch means the record is stale or the deterministic stages changed since the run.

import type { AuditResult } from "./audit-orchestrator";
import { buildManifest, completenessOf, coreMissingFor } from "./audit-orchestrator";
import { detectFormat, procurementPart, type AuditToolContext } from "./audit-tools";
import { deriveVerdict } from "./audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "./audit-findings";

export const RUN_RECORD_SCHEMA = "run-record/v1" as const;

export interface RunRecordMeta {
  runId: string;
  startedAt: string;                            // ISO 8601
  wallClockSec?: number;
  flags: Record<string, string | undefined>;   // run-env flags that gate deterministic behavior (audit trail + replay fidelity)
  models?: Record<string, string>;             // role → model id (provenance; not used by replay)
  sol?: string;                                 // solicitation id / label
  note?: string;
}

export interface RunRecordInput {
  fullSource: string;                           // assembled package source — REQUIRED for replay (detectSections/coverage)
  sections?: Record<string, string>;            // optional precomputed section map (if the run supplied one)
  bidderProfile: BidderProfile | null;
  naics: string | null;
  setAside: string | null;
  manifestComplete: boolean | null;             // the external N8 signal the run used (null = not supplied)
}

export interface RunRecord {
  schema: typeof RUN_RECORD_SCHEMA;
  meta: RunRecordMeta;
  input: RunRecordInput;
  format: {
    formatDetected: string;
    procurementPart: string;
    manifest: string[];                         // buildManifest — required UCF-equivalent sections PRESENT
    coreMissing: string[];
  };
  result: {
    verdict: string;
    eligible: boolean | null;
    reason: string;
    inputs: VerdictInputs;                       // deriveVerdict(inputs) reproduces verdict — integrity check
    findings: TypedFinding[];                    // full grounded finding set (the replay's grounding corpus)
    coverage: AuditResult["coverage"];           // required/covered/missing/attestations/coreMissing as run
    conflict: boolean;
    sectionsRead: string[];
    perLens: Record<string, number>;
  };
  billing: { honestFail: boolean; billable: boolean };
}

export interface BuildRunRecordArgs {
  meta: RunRecordMeta;
  input: RunRecordInput;
  result: AuditResult;
  billing: { honestFail: boolean; billable: boolean };
  commercialHonestFail?: boolean;               // the coreMissing flag state the run used (AUDIT_PROCUREMENT_TYPE_SECTIONS)
}

/** Capture a complete, replayable record from a finished paid run. Pure — computes the deterministic
 *  format/manifest snapshot off the source and copies the run's grounded outputs verbatim. */
export function buildRunRecord(args: BuildRunRecordArgs): RunRecord {
  const ctx: AuditToolContext = { fullSource: args.input.fullSource, sections: args.input.sections };
  return {
    schema: RUN_RECORD_SCHEMA,
    meta: args.meta,
    input: args.input,
    format: {
      formatDetected: detectFormat(ctx),
      procurementPart: procurementPart(ctx),
      manifest: buildManifest(ctx),
      coreMissing: coreMissingFor(ctx, { commercialHonestFail: args.commercialHonestFail }),
    },
    result: {
      verdict: args.result.decision.verdict,
      eligible: args.result.decision.eligible,
      reason: args.result.decision.reason,
      inputs: args.result.inputs,
      findings: args.result.findings,
      coverage: args.result.coverage,
      conflict: args.result.conflict,
      sectionsRead: args.result.sectionsRead,
      perLens: args.result.perLens,
    },
    billing: args.billing,
  };
}

export interface SectionReplay {
  section: string;
  status: string;              // attestation status: covered_direct | covered_attested | read_no_obligation | unread | obligations_ungrounded
  obligations: number;         // obligation sentences found in the section
  grounded: number;            // distinct finding IDs that grounded ≥1 obligation
  ungroundedCount: number;
  ungrounded: string[];        // the obligation sentences that did NOT ground (the MISS detail)
  pass: boolean;               // section counts as covered
}

export interface ReplayResult {
  formatDetected: string;
  procurementPart: string;
  required: string[];
  coreMissing: string[];
  sections: SectionReplay[];
  missing: string[];           // required sections not covered (deterministic recompute)
  deterministicCoverageComplete: boolean;   // missing.length===0 && required.length>0 (the deterministic part; allConverged excluded)
  replayVerdict: string;       // deriveVerdict(record.inputs)
  replayEligible: boolean | null;
  verdictReproduced: boolean;  // replayVerdict === recorded verdict (integrity of persisted inputs)
  drift: string[];             // human-readable divergences: record vs deterministic replay
}

/** Re-run the deterministic stages from a persisted record at $0. Reproduces per-section obligation grounding
 *  (the WHICH-section-missed detail a divergence investigation needs) and re-derives the verdict from the
 *  persisted inputs. `drift` lists any place the record's recorded values disagree with a fresh deterministic
 *  recompute (stale record / changed engine). Options mirror the run-env flags so the replay is faithful. */
export function replayRunRecord(rec: RunRecord, opts?: { sectionMDepth?: boolean; commercialHonestFail?: boolean }): ReplayResult {
  const ctx: AuditToolContext = { fullSource: rec.input.fullSource, sections: rec.input.sections };
  const findings: TypedFinding[] = rec.result.findings;
  const sectionsRead = new Set(rec.result.sectionsRead);

  const formatDetected = detectFormat(ctx);
  const part = procurementPart(ctx);
  const required = buildManifest(ctx);
  const coreMissing = coreMissingFor(ctx, { commercialHonestFail: opts?.commercialHonestFail });
  const { covered, missing, attestations } = completenessOf(ctx, required, findings, sectionsRead, { sectionMDepth: opts?.sectionMDepth });

  const sections: SectionReplay[] = attestations.map((a) => ({
    section: a.section,
    status: a.status,
    obligations: a.obligations.length,
    grounded: a.citedFindingIds.length,
    ungroundedCount: a.ungrounded.length,
    ungrounded: a.ungrounded,
    pass: covered.includes(a.section),
  }));

  const replay = deriveVerdict(rec.result.inputs);

  // Drift — where a fresh deterministic recompute disagrees with what the record captured. Empty = faithful.
  const drift: string[] = [];
  const asSet = (xs: string[]) => [...xs].sort().join(",");
  if (asSet(required) !== asSet(rec.format.manifest)) drift.push(`manifest: replay [${asSet(required)}] vs recorded [${asSet(rec.format.manifest)}]`);
  if (asSet(missing) !== asSet(rec.result.coverage.missing)) drift.push(`coverage.missing: replay [${asSet(missing)}] vs recorded [${asSet(rec.result.coverage.missing)}]`);
  if (asSet(coreMissing) !== asSet(rec.result.coverage.coreMissing)) drift.push(`coreMissing: replay [${asSet(coreMissing)}] vs recorded [${asSet(rec.result.coverage.coreMissing)}]`);
  if (formatDetected !== rec.format.formatDetected) drift.push(`formatDetected: replay ${formatDetected} vs recorded ${rec.format.formatDetected}`);
  if (replay.verdict !== rec.result.verdict) drift.push(`verdict: deriveVerdict(inputs)=${replay.verdict} vs recorded ${rec.result.verdict}`);

  return {
    formatDetected,
    procurementPart: part,
    required,
    coreMissing,
    sections,
    missing,
    deterministicCoverageComplete: missing.length === 0 && required.length > 0,
    replayVerdict: replay.verdict,
    replayEligible: replay.eligible,
    verdictReproduced: replay.verdict === rec.result.verdict,
    drift,
  };
}

/** Human-readable $0 replay report — the per-section grounding PASS/MISS table an investigator reads. */
export function formatReplayReport(rec: RunRecord, r: ReplayResult): string {
  const L: string[] = [];
  L.push(`── REPLAY · ${rec.meta.sol ?? rec.meta.runId} (recorded ${rec.meta.startedAt}) ──`);
  L.push(`format: ${r.formatDetected} · part: ${r.procurementPart} · required=[${r.required.join(",")}] · coreMissing=[${r.coreMissing.join(",")}]`);
  L.push(`per-section obligation grounding:`);
  for (const s of r.sections) {
    const tag = s.pass ? "PASS" : "MISS";
    L.push(`  §${s.section} ${tag} [${s.status}] obligations=${s.obligations} grounded=${s.grounded} ungrounded=${s.ungroundedCount}`);
    for (const u of s.ungrounded) L.push(`      ✗ ungrounded: ${u.slice(0, 140)}`);
  }
  L.push(`missing (not covered): [${r.missing.join(",")}]  → deterministicCoverageComplete=${r.deterministicCoverageComplete}`);
  L.push(`recorded verdict=${rec.result.verdict} eligible=${rec.result.eligible} billable=${rec.billing.billable} honestFail=${rec.billing.honestFail}`);
  L.push(`replay deriveVerdict(inputs)=${r.replayVerdict} eligible=${r.replayEligible}  → verdictReproduced=${r.verdictReproduced}`);
  L.push(r.drift.length ? `DRIFT (record vs replay):\n  - ${r.drift.join("\n  - ")}` : `drift: none (record is faithful)`);
  return L.join("\n");
}
