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

import type { AuditResult, RunDiagnostics } from "./audit-orchestrator";
import { buildManifest, completenessOf, coreMissingFor, locateObligationContext } from "./audit-orchestrator";
import { detectFormat, procurementPart, requiresProposalSections, type AuditToolContext } from "./audit-tools";
import { deriveVerdict, applyFindingDedup, applyCrossFleetDedup } from "./audit-decide";
import { consequenceTailsAfter, gradeCoverageV2, verifyRecitalInSource, type CoverageV2 } from "./audit-gate-v2";
import type { TypedFinding, VerdictInputs, BidderProfile } from "./audit-findings";
import type { UsageCall } from "./audit-cost";
import { isEnvOn } from "./env-flags";

export const RUN_RECORD_SCHEMA = "run-record/v1" as const;

export interface RunRecordMeta {
  runId: string;
  startedAt: string;                            // ISO 8601
  wallClockSec?: number;
  flags: Record<string, string | undefined>;   // curated run-env flags (legacy — a hand-picked subset; kept for back-compat)
  flagEnv?: Record<string, string>;             // card #582 — the FULL deterministic AUDIT_* flag env at run time (every AUDIT_* key). Optional ⇒ old records without it still load.
  models?: Record<string, string>;             // role → model id (provenance; not used by replay)
  sol?: string;                                 // solicitation id / label
  note?: string;
}

/** Snapshot the full deterministic AUDIT_* flag env (card #582). PURE — takes the env, returns every AUDIT_* key with a
 *  defined string value, sorted for stable diffs. This is the audit trail that makes a banked run per-flag minable (the
 *  curated `flags` subset recorded only ~5 keys, so 13 class-B flags were unrecoverable — card #578/#580 finding). */
export function captureAuditFlagEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  const malformed: string[] = [];
  for (const k of Object.keys(env).filter((k) => k.startsWith("AUDIT_")).sort()) {
    const v = env[k];
    if (typeof v !== "string") continue;
    out[k] = v;
    // A key containing whitespace is a SETTING MISTAKE, not a flag: several banked records carry a single
    // variable literally named "AUDIT_A AUDIT_B AUDIT_C …" = "true", which means those ~30 flags were never
    // set at all in that run. Capture stays faithful — the record must show what actually ran, mistake
    // included — but the mistake is announced instead of banked as if it were a flag state. Silent capture is
    // how a run whose flags differed from production got replayed as evidence ABOUT production.
    if (/\s/.test(k.trim())) malformed.push(k);
  }
  if (malformed.length) {
    const hidden = malformed.reduce((n, k) => n + k.trim().split(/\s+/).filter((t) => t.startsWith("AUDIT_")).length, 0);
    console.warn(`[run-record] MALFORMED flag env: ${malformed.length} variable name(s) contain whitespace, hiding ~${hidden} flag(s) that are therefore UNSET in this run — ` +
      malformed.map((k) => `"${k.slice(0, 60)}${k.length > 60 ? "…" : ""}"`).join(" · "));
  }
  return out;
}

export interface RunRecordInput {
  fullSource: string;                           // assembled package source — REQUIRED for replay (detectSections/coverage)
  // Pre-filter, pre-drop, pre-compression full text (audit-executor-v3.ts:537, `docs.map(d=>d.text).join`
  // over the doc list, which assembly never reassigns). Grounding reads THIS, not the digest
  // (audit-expert.ts:36).
  //   ⚠ CORRECTION (2026-07-28): the previous note here said it "diverges from fullSource ONLY when chunked
  //   ingest compressed the package." That is false on the live configuration and it is the same wrong premise
  //   _groundfixture-backfill.ts used to justify writing this field as a copy of fullSource. AUDIT_CHUNKED_INGEST
  //   is false but AUDIT_LOSSLESS_INGEST is TRUE, and even the lossless fits-whole early return
  //   (agentic-lossless-ingest.ts:79) returns assembleFullSource(docs), which carries the per-doc
  //   "==== DOCUMENT: n ====" delimiters this string lacks. fullSource is additionally APPENDED to after
  //   assembly (audit-executor-v3.ts:412, arc-B vision wage rates) while this is computed later from the
  //   untouched docs. So for any multi-document package the two differ, in BOTH directions, on every run.
  // Optional: records banked before 2026-07-28 lack a run-time value and fall back to fullSource. A record
  // carrying meta.backfill.field === "input.groundingSource" has a RECONSTRUCTED value — treat it as absent.
  groundingSource?: string;
  sections?: Record<string, string>;            // optional precomputed section map (if the run supplied one)
  bidderProfile: BidderProfile | null;
  naics: string | null;
  setAside: string | null;
  manifestComplete: boolean | null;             // the external N8 signal the run used (null = not supplied)
  // ── COVERAGE-DETERMINING INPUTS (added 2026-07-27; ALL OPTIONAL so every existing record still loads) ──
  // Without these a replay cannot reproduce the run's coverage, and the gap is not subtle: a banked run graded
  // `missing: ["L"]` and reached BID_WITH_CAUTION, while replaying the same record from the same source graded
  // C/L/M absent and capped at INCOMPLETE. `noticeType` + `formIdentified` are the reason — Layer-2 (card 262)
  // uses them to SCOPE whether §L/§M are required at all, so omitting them silently changes what "complete"
  // means. The consequence was not academic: no banked record can be replayed to a committal verdict, which is
  // why all 46 carry an EMPTY show-stopper band and the report's most consequential region has no $0 evidence
  // behind it at all.
  //
  // Deliberately NOT banked: `groundingSource`. It is byte-identical to `fullSource` in all 39 records that
  // carry both, so persisting it again would double the largest field to store a copy. Replay defaults it to
  // fullSource, which is exactly what the orchestrator does when it is absent.
  noticeType?: string | null;                   // SAM notice type — scopes the §L/§M requirement (Layer-2, card 262)
  formIdentified?: boolean;                     // whether a substantive primary form was recognized — corroborates body-absent
  // `documentsComplete` was declared here alongside the three fields above and then never written by the
  // banker and never read by the replay — a dead field on the one interface whose entire purpose is replay
  // fidelity, which reads to the next person as "the record carries this signal" (review round 5, finding #5).
  // REMOVED rather than wired, because the record already carries it: `result.inputs` is the full
  // VerdictInputs, and `documentsComplete` lives there (audit-findings.ts:215) as the value deriveVerdict
  // actually used. A second copy on the input side could only ever disagree with it.
  // BANKED, NOT YET CONSUMED BY REPLAY — say so rather than imply otherwise (review round 4, finding #1). The
  // only readers of `ctx.noticeBodyText` are the eligibility floor and the three caveat emitters, and all four
  // live inside `runAgenticAudit`; `replayRunRecord` runs the deterministic stages only, none of which touch it.
  // It is banked anyway because a compressed-digest run does NOT keep the notice body recoverable from
  // `fullSource` (the emitters' `docRegions` fallback finds nothing there), so dropping it would foreclose ever
  // replaying the floor. Cost is real — a second copy of the notice body — and it is the reason `groundingSource`
  // above is deliberately NOT banked; revisit if a compressed-digest run is never replayed.
  noticeBodyText?: string;                      // raw SAM notice body — what the live-run eligibility floor reads
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
    // Vehicle F2 · I6 — capture the Decision's verdict metadata so the post-run battery reads REAL values instead of
    // NOT-MEASURED (the vehicle-F battery found result.noVerdictCause / result.showStoppers absent). Additive +
    // optional ⇒ pre-existing records still load; the report render never reads the run-record, so byte-identity holds.
    noVerdictCause?: string;                     // the enumerated no-verdict cause (eligibility/conflict/coverage/…)
    showStoppers?: unknown[];                    // decided show-stoppers WITH disposition (the two-tier eligibility bars)
    coverage: AuditResult["coverage"];           // required/covered/missing/attestations/coreMissing as run
    conflict: boolean;
    sectionsRead: string[];
    perLens: Record<string, number>;
    diagnostics?: RunDiagnostics;                // card #582 — pre-dedup finding snapshot + stage counts for the coverage-stage replay. Optional ⇒ pre-#582 records still load.
    // STAGE LEDGER (2026-08-03) — every model call this run made: stage label, model, tokens, cache split and
    // wall-clock. The engine ALREADY produced this on every paid run and threw it away: `usageCalls` was
    // aggregated into a dollar figure for billing (`aggregate()` reads model+tokens only) and then dropped.
    // Measured across 113 banked records, ONE carried any `wall_ms` and TWO any `cost_usd` — which is why
    // "where does the wall-clock and the token spend go" was unanswerable by replay at $0. Capturing the array
    // costs one assignment and makes every FUTURE run answer it permanently.
    // Optional ⇒ every pre-existing record still loads, and replay never reads it: this is EVIDENCE, not input,
    // so adding it cannot change a replayed verdict.
    usage?: UsageCall[];
  };
  billing: { honestFail: boolean; billable: boolean };
}

export interface BuildRunRecordArgs {
  meta: RunRecordMeta;
  input: RunRecordInput;
  /** The run's per-call cost/latency ledger, verbatim. See RunRecord.result.usage. */
  usage?: UsageCall[];
  result: AuditResult;
  billing: { honestFail: boolean; billable: boolean };
  commercialHonestFail?: boolean;               // the coreMissing flag state the run used (AUDIT_PROCUREMENT_TYPE_SECTIONS)
}

/** Capture a complete, replayable record from a finished paid run. Pure — computes the deterministic
 *  format/manifest snapshot off the source and copies the run's grounded outputs verbatim. */
export function buildRunRecord(args: BuildRunRecordArgs): RunRecord {
  // CAPTURE SCOPES THE WAY REPLAY DOES (review round 4, finding #3). `format.coreMissing` is a snapshot taken
  // at capture; when replay learned to scope §L/§M by notice type, capture kept the fail-safe "solicitation-type
  // buy" default — so a Sources Sought record recorded coreMissing ["C","L","M"] while its own replay computed
  // []. Same inputs, same function, two answers, baked into every new record. Both sides now read the banked
  // scoping inputs, so the snapshot agrees with the replay it is supposed to be a baseline for.
  const ctx: AuditToolContext = { fullSource: args.input.fullSource, sections: args.input.sections,
    ...(args.input.noticeBodyText ? { noticeBodyText: args.input.noticeBodyText } : {}) };
  return {
    schema: RUN_RECORD_SCHEMA,
    meta: args.meta,
    input: args.input,
    format: {
      formatDetected: detectFormat(ctx),
      procurementPart: procurementPart(ctx),
      manifest: buildManifest(ctx),
      coreMissing: coreMissingFor(ctx, {
        commercialHonestFail: args.commercialHonestFail,
        ...(args.input.noticeType !== undefined ? { requiresLM: requiresProposalSections(args.input.noticeType) } : {}),
        ...(args.input.formIdentified !== undefined ? { formIdentified: args.input.formIdentified } : {}),
      }),
    },
    result: {
      verdict: args.result.decision.verdict,
      eligible: args.result.decision.eligible,
      reason: args.result.decision.reason,
      inputs: args.result.inputs,
      findings: args.result.findings,
      // Vehicle F2 · I6 — verdict metadata for the battery (see interface note). Spread-conditional so a committal
      // pole (no noVerdictCause) omits the key; showStoppers always captured (empty array on a clean BID).
      ...((args.result.decision as { noVerdictCause?: string }).noVerdictCause
        ? { noVerdictCause: (args.result.decision as { noVerdictCause?: string }).noVerdictCause }
        : {}),
      showStoppers: (args.result.decision as { showStoppers?: unknown[] }).showStoppers ?? [],
      coverage: args.result.coverage,
      conflict: args.result.conflict,
      sectionsRead: args.result.sectionsRead,
      perLens: args.result.perLens,
      ...(args.result.diagnostics ? { diagnostics: args.result.diagnostics } : {}),   // card #582 — capture-only, present iff the run banked it
      // Spread-conditional like its siblings: a run that supplied no ledger omits the key entirely rather than
      // banking an empty array, so "this run predates the ledger" stays distinguishable from "this run made
      // zero model calls". Those are different facts and only one of them is alarming.
      ...(args.usage && args.usage.length ? { usage: args.usage } : {}),
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
  // MERGE NOTE (E1 × main, 2026-07-28) — both sides added an OPTIONAL field to this same ctx literal, for
  // the same reason and with the same caveat: make a banked input ADDRESSABLE in replay. They are independent,
  // so both are kept. Neither changes replay output today.
  //
  // The notice body rides ctx as it does in the live run. NOTE it changes nothing here today: no deterministic
  // stage below reads it (see the field's note on RunRecordInput). It is placed on ctx so that wiring the
  // eligibility floor into replay is a one-line change rather than a re-capture of the whole corpus.
  //
  // GROUNDFIXTURE — carry the banked groundingSource into ctx so it is at least ADDRESSABLE. Until
  // this line existed the field was banked and then unreachable: ctx was built from fullSource
  // alone, so a corpus WITH groundingSource and one WITHOUT produced byte-identical output, which
  // made every "grounding changed nothing" delta structurally guaranteed rather than measured.
  //
  // ⚠ THIS CHANGE IS INERT TODAY — PROVEN, NOT ASSUMED. A falsification probe
  // (scripts/audit-ai/_gf-grounding-probe.ts) emptied groundingSource entirely on all 4 reproducing
  // records and NOTHING moved: grounded counts and drift identical, 0/4 detected. The reason is
  // that this replay's grounding math does not read ctx.groundingSource at all — completenessOf
  // calls findingProvenance(ctx.fullSource, findings) (audit-orchestrator.ts:1946), hardcoded to
  // the digest. The groundingSource-aware check is isGrounded (audit-expert.ts:36), and its callers
  // live in audit-orchestrator.ts, which reaches production via audit-package → audit-executor-v3.
  //
  // So this line is a NECESSARY PRECONDITION and nothing more. DO NOT read it as "the replay now
  // grounds against source" — it does not, and the fixture is still not grounding-capable. Closing
  // that gap means changing grounding computation inside audit-orchestrator.ts, which is
  // production verdict-path code: TIER V, design panel first.
  //
  // Falls back to fullSource when a record has no banked groundingSource — which is what
  // audit-expert.ts:36 does anyway (it only diverges when the two differ), so the fallback is the
  // pre-existing behaviour, not a new assumption.
  //
  // DELIBERATELY NOT DONE at the sibling ctx in buildRunRecord (:99). That one is
  // PRODUCTION-REACHABLE — audit-run-record-bank.ts → bankRunRecord → audit-executor-v3.ts:869,
  // on every real audit — and its ctx feeds detectFormat / buildManifest / coreMissingFor, i.e.
  // what gets BANKED. Changing it is a TIER V verdict-path change requiring a design panel. It is
  // also unnecessary: groundingSource is already persisted in `input`; only the REPLAY needs to
  // read it. This function is reached from scripts/ and tests only.
  const ctx: AuditToolContext = { fullSource: rec.input.fullSource, sections: rec.input.sections, groundingSource: rec.input.groundingSource,
    ...(rec.input.noticeBodyText ? { noticeBodyText: rec.input.noticeBodyText } : {}) };
  const findings: TypedFinding[] = rec.result.findings;
  const sectionsRead = new Set(rec.result.sectionsRead);

  const formatDetected = detectFormat(ctx);
  const part = procurementPart(ctx);
  const required = buildManifest(ctx);
  // SCOPE THE §L/§M REQUIREMENT THE WAY THE RUN DID. `coreMissingFor` has always accepted requiresLM /
  // formIdentified; replay never supplied them, so it fell back to the fail-safe "solicitation-type buy"
  // default and could grade sections missing that the run never required. Records banked before these fields
  // existed have `noticeType === undefined`, and `requiresProposalSections(undefined)` returns the same
  // fail-safe default — so old records replay byte-identically and only NEW records gain the fidelity.
  const coreMissing = coreMissingFor(ctx, {
    commercialHonestFail: opts?.commercialHonestFail,
    ...(rec.input.noticeType !== undefined ? { requiresLM: requiresProposalSections(rec.input.noticeType) } : {}),
    ...(rec.input.formIdentified !== undefined ? { formIdentified: rec.input.formIdentified } : {}),
  });
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

export interface CoverageStageReplay {
  gradeV2Ran: boolean;                          // gradeCoverageV2 was re-run from the record's attestations
  coverageV2: CoverageV2;                        // the grader output under the CURRENT process.env (caller toggles flags around the call)
  benignCoveredRecital: number;                  // #572 signature (0 unless AUDIT_BENIGN_RECITAL_COVERED on AND a recital matched)
  caveatRecital: number;                         // #576 signature (0 unless AUDIT_PERFORMANCE_UPKEEP_CAVEAT on AND an upkeep recital matched)
  disqualifierUncovered: number;                 // escalating ungrounded disqualifiers (the NHR driver)
  ungroundedNonBarSignal: number;                // AUDIT_AMBIGUOUS_SIGNAL_DEMOTION signature
  dedup: { pre: number; post: number; delta: number } | null;   // AUDIT_FINDING_DEDUP delta on the captured pre-dedup findings (null if the record predates #582 diagnostics)
}

/** COVERAGE-STAGE REPLAY (card #582 item c) — the per-flag mining primitive. Re-runs the flag-gated coverage/dedup tail
 *  from a banked record at $0, under the CURRENT process.env, so a caller can isolate a class-B flag's delta by toggling
 *  it around two calls (env OFF → replay → env ON → replay → diff the bucket counts). gradeCoverageV2 runs from the
 *  record's persisted attestations + fullSource (works on EXISTING records — attestations were always banked); the dedup
 *  delta needs the #582 pre-dedup snapshot (`diagnostics`), null on older records. PURE except reading process.env for
 *  the flag toggle (the same faithful-to-run-env contract as replayRunRecord's opts). Never mutates the record. */
export function replayCoverageStage(rec: RunRecord): CoverageStageReplay {
  const src = rec.input.fullSource;
  const atts = rec.result.coverage.attestations;
  const cov = gradeCoverageV2(atts, {
    locate: (ob) => locateObligationContext(src, ob),
    verifyRecitalPresence: (ob) => verifyRecitalInSource(src, ob),
    consequenceTails: (ob) => consequenceTailsAfter(src, ob),   // U-B — replay mirrors the production sentence-pair lookup
  });
  const pre = rec.result.diagnostics?.preProcessingFindings ?? null;
  let dedup: CoverageStageReplay["dedup"] = null;
  if (pre) {
    const clauseDeduped = applyFindingDedup(pre, { enabled: isEnvOn(process.env.AUDIT_FINDING_DEDUP) });
    const post = applyCrossFleetDedup(clauseDeduped, { enabled: isEnvOn(process.env.AUDIT_CROSS_FLEET_DEDUP) });  // mirror the live path (clause gate then cross-fleet gate)
    dedup = { pre: pre.length, post: post.length, delta: pre.length - post.length };
  }
  return {
    gradeV2Ran: true,
    coverageV2: cov,
    benignCoveredRecital: (cov.benignCoveredRecital ?? []).length,
    caveatRecital: (cov.caveatRecital ?? []).length,
    disqualifierUncovered: (cov.disqualifierUncovered ?? []).length,
    ungroundedNonBarSignal: (cov.ungroundedNonBarSignal ?? []).length,
    dedup,
  };
}
