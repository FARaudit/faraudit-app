// ── AGENTIC VERIFICATION ENGINE · the ORCHESTRATOR (P0→P5 cycle) ──────────────────────────────────────
// Brain card 43, build #4. This is the conductor that replaces the single stuffed audit call. It runs the
// domain phases ON TOP of Anthropic's agentic loop — the moat that a Gemini/GPT one-shot cannot reproduce:
//   P0 Decompose      — build the binding-section manifest (what MUST be covered).
//   P1 Ground         — run the agentic experts (Layer 1) in parallel; each grounds its own findings.
//   P3 Reconcile      — dedup across lenses; flag unresolved material conflict on the decisive field.
//   P2 Cross-examine  — adversarial verification (injected; default = agentic skeptic) → verifierSound.
//   P4 Prove-complete — coverageComplete iff every binding section present in source has a grounded finding.
//   P5 Decide         — hand the typed facts to deriveVerdict (Layer 2, pure). The verdict is DERIVED.
// Everything that decides is deterministic; the only nondeterminism is inside the experts, and every claim
// they make is hard-gated by grounding (Layer 1) before it can reach the decision (Layer 2).
//
// callModel + verify are INJECTED → the whole cycle is unit-testable with stubs ($0). The real run is PAID.

import { runAgenticExpert, isGrounded, type CallModel, type ExpertSpec } from "./audit-expert";
import { readSection, sectionFullText, procurementPart, requiresProposalSections, materializeSections, parseDocRegions, resolvePrimary, normalizeForSearch, phrasePresentInNormalized, ATTACHMENT_COVERAGE_ENABLED, type AuditToolContext } from "./audit-tools";
import { constructionRequired, constructionCoreMissing, constructionCoverage } from "./audit-construction-manifest";
import { recomputeGrounding } from "./audit-grounding-recompute";
import { detectSoleSourceLock } from "./audit-sole-source-lock";
import { runSectionFinder, type SectionFinderCall } from "./audit-section-finder";
import { isBindingDoc, hasEngineText } from "./sam-attachments";
import { looksMojibake } from "./pdf-ocr";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";
import { proceduralCoveragePass, type ProceduralExtractor } from "./audit-procedural-coverage";
import { gateFindingCitations, gateCitationsInText, stripWithholdMarkers, citationFidelityEnabled } from "./audit-citation-fidelity";
import { repairClippedExcerpts, repairHeadClippedExcerpts, applyHeadRepairsTo, analyzedExcerptOf } from "./audit-excerpt-repair";
// ATTRIBUTION USES THE ANALYZED SPAN, NOT THE DISPLAYED ONE (ARC #747 · E1). Every "does this finding cover
// that text?" computation below — grounding attribution, region coverage, the eligibility floors, the caveat
// emitters — asks whether the ANALYSIS examined a passage. Head re-grounding widens an excerpt backward so a
// customer sees the whole clause; if that widened span answered these questions it would silently credit the
// finding with source it never looked at, and an eligibility bar sitting one line above a quote would read as
// already-covered. An adversarial probe demonstrated exactly that: a questions-deadline finding, widened,
// swallowing a Top Secret facility-clearance bar and retiring the floor that should have fired.
// `analyzedExcerptOf` returns the model's own excerpt when a repair widened it, and the excerpt itself
// otherwise — so with the flag off, or on a finding no pass touched, every one of these is unchanged.
import { SITE_VISIT_CONCLUDED_RE, BOA_HOLDER_ONLY_EMIT_RE, SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "./audit-site-visit-patterns";
import { isPositiveSetAside, isInquiryDeadlineBenign, hasOperativeEligibilityLanguage, ELIGIBILITY_AUTHORITY_RE, deriveVerdict, disposeFinding, applyCautionFloor, applyTemporalConflict, applyPreconditionOvertypeFloor, applyRoutineClauseOvertypeGuard, applyCyberRfiReconciliation, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts, applyStructuralBarWhitelist, applySetAsideFirmStatusGate, applyNmrSingleEmitter, applyNmrFirmStatusGate, applyNmrNaicsDormancy, applyCheckboxStateFidelity, applyPerfObligationInsuranceTyping, applyClauseKeyedTypingFloor, applyStructuralAssertionFidelity, applyQuantityAmbiguityFidelity, applyFindingDedup, applyCrossFleetDedup, applyClauseSemanticsGuard, applyOrEqualCarveout, applyEligibilityAuthorityAllowlist, applyInquiryDeadlineBenignGuard, detectSetAsideConflict, applySetAsideStructuralDowngrade, emitSetAsideNoticeFindings, mergeSetAsideNoticeFindings, emitPerformanceUpkeepCaveats, deriveShadowVerdict, EngineInvariantError, type Decision, type ShadowVerdict } from "./audit-decide";
import { applyKeyfactDetector } from "./audit-keyfact-detector";
import { judgmentLayerEnabled, runJudgmentProducer, runJudgmentVerifier, type ReasonCaller, type EntailmentCaller, type JudgmentCost, zeroCost } from "./audit-judgment-layer";
import { highSignalSweep, boilerplateTrapSweep } from "./audit-grounding-sweep";
import { createHash } from "node:crypto";
import type { TypedFinding, BidderProfile, VerdictInputs, Controllability } from "./audit-findings";
import { scanPackageMarkers, absenceClaimContradicted } from "./absence-grounding-gate";
import { disqualifierTriggersOf, GATE_V2_ENABLED, gradeCoverageV2, groundingVariantToleranceEnabled, importanceOf, isLedgerDemotableNonBar, verifyRecitalInSource } from "./audit-gate-v2";

// B1 (Brain card #421 Fork-1) — §L/§M coverage-ledger honors boilerplate. A READ §L/§M whose ONLY ungrounded
// obligation sentences are administrative BOILERPLATE (importanceOf==="boilerplate") reads COVERED-WITH-SIGNAL, not
// missing — the FA8137 false "§L/§M uncovered" root (findings quote bars, never the canned §L instruction litany, so
// un-quoted boilerplate alone flipped a fully-read section to missing). INVARIANT (Brain, non-negotiable): a genuine
// ungrounded §L/§M DISQUALIFIER or ambiguous obligation (importanceOf!=="boilerplate") — or any [truncated] marker —
// STILL escalates exactly as today (stays obligations_ungrounded → missing → NHR/INCOMPLETE). Flag OFF ⇒ byte-identical.
const COVERAGE_LEDGER_V2 = process.env.AUDIT_COVERAGE_LEDGER_V2 === "true";

/** UCF sections that carry binding obligations — the ones completeness is measured against.
 *  C-8 (Brain C.f): expanded {B,C,H,I,L,M} → {B,C,D,E,F,H,I,K,L,M}. §D (packaging/marking), §E (inspection &
 *  acceptance), §F (deliveries / period of performance — gold-source attribution puts delivery windows here),
 *  and §K (reps/certs affecting eligibility) carry binding terms a complete read must ground. Anti-Option-A guard:
 *  a section is only REQUIRED when PRESENT (buildManifest filters on presence), and a legitimately THIN present
 *  section (no obligation sentences) attests read_no_obligation → covered (the relief valve), so a package that
 *  simply has a short §D does NOT go chronically INCOMPLETE. §G (contract admin) and §J (list of attachments) are
 *  read-and-attest only — J feeds the C-2 per-binding-document reconciliation — so they are NOT completeness-required. */
export const BINDING_SECTIONS = ["B", "C", "D", "E", "F", "H", "I", "K", "L", "M"] as const;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Telemetry record for a finding the skeptic dropped (Brain card 274 RULING 1). `empty_corrected` = a refuted
 *  finding whose `corrected` object was non-substantive (the false-INELIGIBLE/NO_BID resurrection hole, now closed);
 *  `overturned` = a plain upheld=false drop. Persisted so every drop is auditable, never silent. */
export interface CorrectedDrop { index: number; id?: string; requirement: string; citation: string; refutation: string; dropReason: "empty_corrected" | "overturned" | "entailment_fail"; }
/** R1 · card #592 — VERIFIER LEDGER (capture-only, verdict-inert). One row per grounded finding the skeptic saw,
 *  recording the disposition + the MECHANICAL cause the run went unsound. Built ONLY when AUDIT_BANK_RUN_RECORD is on
 *  ⇒ flag-OFF `ledger` is undefined and VerifyResult / AuditResult are byte-identical. deriveVerdict NEVER reads it.
 *  `cause` granularity is the maximum the verifier boundary actually has: a per-index residue (the skeptic returned a
 *  verdicts array but omitted this index) is `no_ruling_returned` — parse-miss vs mid-array truncation are
 *  indistinguishable HERE (both = absent index); the SUB-type of a whole-set failure lives in `throwMessage`
 *  (total-outage vs tiered non-escalation vs structured parse-fail — the throw strings already differ). */
export type VerifierDisposition = "upheld" | "retyped" | "overturned" | "entailment_drop" | "unresolved";
export interface VerifierClaimRuling {
  index: number; id?: string; citation: string; kind: string; controllability: string;
  requirementPreview: string;                 // truncated — the ledger is a diagnostic, not a second copy of findings
  disposition: VerifierDisposition;
  verdictDriving?: boolean;                    // set on `unresolved` — did this residue sink soundness?
  cause?: "skeptic_throw" | "no_ruling_returned"; // set on `unresolved` — the mechanical reason no ruling landed
  reason?: string;                             // skeptic reason where one was returned
  retype?: { controllability?: Controllability; curableInWindow?: boolean }; // set on `retyped`
}
export interface VerifierLedger {
  failureMode: "sound" | "zero_grounded" | "skeptic_throw" | "residue_unresolved" | "total_overturn";
  throwMessage?: string;                       // present iff failureMode==="skeptic_throw" — distinguishes the throw sub-type
  residueDoctrine: boolean;                    // AUDIT_VERIFIER_BATCHING state at run time (governs which residue sinks soundness)
  counts: { input: number; grounded: number; droppedUngrounded: number; survived: number; rejected: number; ruled: number; unresolvedTotal: number; unresolvedVerdictDriving: number };
  unresolvedIndices: number[];                 // grounded indices the skeptic left un-ruled
  rulings: VerifierClaimRuling[];              // one per grounded finding (empty on zero_grounded)
}
export interface VerifyResult { sound: boolean; survived: TypedFinding[]; rejected: TypedFinding[]; correctedDrops?: CorrectedDrop[]; ledger?: VerifierLedger; }
/** P2 — adversarial cross-examination. Default impl is an agentic skeptic; injected as a stub in tests.
 *  bidderProfile is passed so the verifier can compute the deterministic knife-edge set (Brain card-54/55). */
export type VerifyFn = (ctx: AuditToolContext, findings: TypedFinding[], opts?: { bidderProfile?: BidderProfile | null }) => Promise<VerifyResult>;

export interface OrchestratorInput {
  ctx: AuditToolContext;
  experts: ExpertSpec[];
  callModel: CallModel;
  bidderProfile?: BidderProfile | null;
  verify?: VerifyFn;        // P2 — defaults to grounding-only soundness (no extra model) if absent
  maxTurns?: number;
  signal?: AbortSignal;     // overall wall-clock budget — aborts in-flight lens calls on breach (no-op if absent)
  // N8 — an EXTERNAL manifest-reconciliation signal (the deterministic "every posted SAM
  // doc was ingested" truth the executor holds), AND-combined with the internal page-count
  // heuristic. false → caps a no-bar BID/CAUTION to INCOMPLETE (asymmetry). Default/absent
  // = true (no external constraint → rely on the heuristic alone, unchanged behavior).
  manifestComplete?: boolean;
  // Vehicle A–E item A (flag AUDIT_VERDICT_POLE_PRECEDENCE) — narrowed dispositive-completeness precondition
  // (computed in the executor from the incomplete-doc set via a deterministic role classifier). Forwarded verbatim
  // to VerdictInputs. Absent ⇒ A never fires ⇒ byte-identical.
  dispositiveCompletenessForEligibility?: boolean;
  // Step 4a (plumb-only) — SAM-resolved scalar FACTS carried into the gate-pipeline scope so a
  // future deterministic gate (Step 4: Nonmanufacturer Rule) can read them WITHOUT regexing source
  // (Rule 64: fact, never AI-derived). Absent → null (honest silence; uploads have no SAM NAICS).
  // NOTHING reads these yet — adding them changes no verdict (a data plumb that moves a verdict is a bug).
  naics?: string | null;
  setAside?: string | null;
  // Layer-2 (Brain card 262 — content-aware completeness). noticeType → whether this is a solicitation-type buy
  // that REQUIRES §L/§M (vs Sources Sought / RFI / notice-only). formIdentified → whether a substantive primary
  // solicitation FORM was recognized in the package. Both feed the core-section INCOMPLETE cap so a package whose
  // §L/§M-bearing content (notice body) was never ingested caps to INCOMPLETE, never a confident false-COMPLETE.
  // Absent → noticeType null (fail-safe: require §L/§M), formIdentified undefined (no independent cap contribution).
  noticeType?: string | null;
  formIdentified?: boolean;
  // Card 208-B — optional cheap-tier extractor for the Part-12 procedural-coverage pass. Absent ⇒ the pass uses
  // its deterministic default (the shipped path). Only consulted when AUDIT_PROCEDURAL_COVERAGE_LENS is on.
  proceduralExtract?: ProceduralExtractor;
  // J-1/J-2 JUDGMENT LAYER (Brain card 246) — injected model callers. BOTH the AUDIT_JUDGMENT_LAYER flag AND the
  // caller must be present for a stage to run; absent/flag-off ⇒ inert (byte-identical), no paid calls. Production
  // wires real Opus/Sonnet callers; tests stub them. J-1 (producer) runs pre-P2; J-2 (verifier) at the P2 seam.
  judgmentReason?: ReasonCaller;
  judgmentEntail?: EntailmentCaller;
  // L3 (Brain card 265/267) — grounded agentic section-finder. Present ONLY when AUDIT_SECTION_FINDER is on
  // (auditPackage wires the real PAID caller; tests stub it). Absent/flag-off ⇒ L3 never runs (byte-identical).
  // Fires ONLY on required sections the deterministic pass did not locate; a verified locate augments ctx.sections
  // BEFORE the experts run so both the analysis AND the completeness proof see the located §L/§M.
  sectionFinder?: SectionFinderCall;
  // CITATION-FIDELITY CORPUS (review round 4, finding #1) — the text a printed regulation citation is checked
  // AGAINST, supplied explicitly instead of read off ctx. It exists because `ctx.groundingSource` is NOT set on
  // the production path: `auditPackage` receives `input.groundingSource` and then builds its ctx without it
  // (audit-package.ts:198), while `runJudgmentFirstAudit` does forward it (:294). So the gate was reading
  // `ctx.groundingSource ?? ctx.fullSource` and ALWAYS landing on fullSource, while the executor's fold gate a
  // layer up used the real pre-compression text — two gates, two corpora, and a comment in the executor
  // asserting they matched. Under AUDIT_LOSSLESS_INGEST (live=true) an over-budget package's fullSource is a
  // binding-filtered SUBSET, so a citation genuinely in the solicitation could be withheld from the customer
  // report: the module's own stated worst failure.
  //
  // DELIBERATELY NOT FIXED BY PUTTING groundingSource BACK ON ctx. That would also redirect `isGrounded`
  // (audit-expert.ts:36) and the E1 head-re-grounding pass, changing what counts as grounded on the VERDICT
  // path — a TIER V change that does not belong in a display-only citation gate. The narrow seam keeps this
  // fix inside the display layer; the ctx-level gap is filed as its own unit.
  citationSource?: string;
  // JUDGMENT-FIRST SEAM (Brain cards 276/279) — opt-in. When the holistic proposer supplies pre-found findings,
  // the orchestrator SKIPS the paid expert lenses (P1) and runs the FULL deterministic rail (P1.5→P5: sweep,
  // temporal, dedup, verify, completeness, every re-typing guard, deriveVerdict) over this seed instead. The seed
  // is RE-GROUNDED here against real source with the SAME isGrounded check the lenses use — the proposer never
  // self-asserts grounding (audit-judgment-first.ts). Absent ⇒ the ladder path (P1 experts) is byte-identical.
  seedFindings?: TypedFinding[];
  // PANEL WIRING ARC (card #523, P2a-wire) — the expert panel's VERIFIED typed facts (panel-findings-bridge),
  // supplied by the executor ONLY when AUDIT_PANEL_JUDGE is on. Distinct from `seedFindings`: these are ADDITIVE
  // to the P1 lens findings (the panel is a co-producer, not a replacement) — they are UNIONed into the finding set
  // BEFORE dedup + every re-typing guard (so a panel finding is treated exactly like a lens finding) and
  // RE-GROUNDED against the assembled source with the same isGrounded gate. deriveVerdict stays the SOLE authority.
  // Absent/empty ⇒ byte-identical (flag-OFF customer path never sets it).
  panelFindings?: TypedFinding[];
  // PARALLELIZE (card #570, flag AUDIT_PANEL_PARALLEL) — when the executor runs the panel PRODUCER concurrently with
  // this rail's expert-phase, it passes the producer's findings as a PROMISE resolved AT the merge point (:2227),
  // AFTER the expert-phase has already run. The merged union is byte-identical to the serial `panelFindings` array
  // (same set, same merge point, same dedup order) — only wall-clock differs. Exactly one of the two is ever set.
  panelFindingsPromise?: Promise<TypedFinding[] | undefined>;
  // VERDICT ARC (move 4, card #668) — the verdict-time temporal bundle the executor computed at the I/O boundary
  // (classifyTemporal snapshot + fetchLiveSamStatus + amendment reconciliation + injected today). Threaded verbatim
  // into VerdictInputs so the PURE deriveTemporalDisposition runs inside deriveVerdict. Absent (flag-OFF executor) ⇒
  // no temporal fields on inputs ⇒ byte-identical. The orchestrator does NO temporal I/O — it only forwards.
  temporal?: import("./audit-temporal").TemporalVerdictBundle;
}

export interface AuditResult {
  decision: Decision;
  inputs: VerdictInputs;
  findings: TypedFinding[];
  coverage: { required: string[]; covered: string[]; missing: string[]; attestations: SectionAttestation[]; coreMissing: string[] };
  perLens: Record<string, number>;
  conflict: boolean;
  sectionsRead: string[];                                                                 // union across all agents (pure-observer)
  trace: Record<string, { converged: boolean; turns: number; dropped: number; droppedInReadSource: number; sectionsRead: string[]; tools: Array<{ turn: number; tools: Array<{ name: string; input: Record<string, unknown> }> }> }>; // per-lens; dropped* are VERDICT-INERT telemetry (see the expert-phase log)
  verifierDrops?: CorrectedDrop[];                                                        // card 274 RULING 1 — skeptic drops (empty-corrected + overturned), telemetry-visible; absent when none
  judgmentCost?: JudgmentCost;                                                            // J-1/J-2 per-audit token/call ledger (card 246 acceptance h); absent when the layer is off
  /** ARC #747 · E2 — every regulation citation the fidelity gate refused to print, with the reason. Declared
   *  because it was previously RETURNED but absent from this interface, so no consumer could read it and
   *  nothing persisted it: the withholding ledger existed only as a console.warn, which is not a record.
   *  Absent when nothing was withheld ⇒ flag-OFF shape unchanged. (Review finding #5 on PR #294.) */
  citationsWithheld?: Array<{ raw: string; corpus: string; number: string; reason: string; field?: string }>;
  diagnostics?: RunDiagnostics;                                                           // card #582 CAPTURE-ONLY — verdict-inert bank instrumentation (pre-dedup snapshot + stage counts); present only when AUDIT_BANK_RUN_RECORD is on; NEVER read by deriveVerdict
}

/** Capture-only bank instrumentation (card #582). VERDICT-INERT — populated for the run-record bank / coverage-stage
 *  replay so a banked run can be replayed with class-B flags toggled to isolate each flag's delta. deriveVerdict never
 *  reads it. Present ONLY when AUDIT_BANK_RUN_RECORD is on ⇒ flag-OFF the AuditResult is byte-identical. */
export interface RunDiagnostics {
  preProcessingFindings: TypedFinding[];        // the finding set consumed by the flag-gated tail (before applyFindingDedup) — the dedup/coverage-stage replay corpus
  stageCounts: Record<string, number>;          // pre/post finding counts around the flag-gated tail (e.g. preDedup, postDedup, final)
  verifierLedger?: VerifierLedger;              // R1 · card #592 — the P2 skeptic's per-claim ledger + the mechanical unsoundness cause; present only when banking is on
  shadowVerdict?: ShadowVerdict;               // Phase-1 SHADOW · cards #596/#597 — the positive-shape pole computed BESIDE the real verdict; present only when AUDIT_POSITIVE_VERDICT_POLE is on; NEVER authoritative
}

/** P0 — the manifest: binding UCF sections that are actually PRESENT (non-empty) in this package's source.
 *  Brain card 288 — FORMAT-AWARE carrier: a construction (SF-1442 / part36) package has no §A–M headers, so the UCF
 *  filter returns [] and the engine honest-fails the whole construction CLASS on FORMAT (:574 required.length>0). For
 *  part36 the carrier is the SEALED construction binding-content manifest (present elements = the §A–M analog),
 *  computed at ingest over FULL doc text. The :574 completeness FORMULA is untouched — only WHICH set populates
 *  `required` changes. Flag-off / no manifest ⇒ procurementPart never returns part36 ⇒ byte-identical UCF path. */
/** Number `prefix#N` ids WITHOUT ever re-issuing one the set already holds.
 *
 *  Every emitter here used to number from zero unconditionally, which is correct only while nothing upstream
 *  already carries that emitter's ids. The judgment-first / replay shape breaks exactly that assumption: the
 *  seed IS a previous run's persisted findings, so a record holding keyfact_detector#0 came back with TWO
 *  findings answering to #0 — the Nonmanufacturer Rule and a delivery schedule. Duplicate ids are not cosmetic:
 *  anything that pairs findings by id (repair propagation, dedup bookkeeping, replay drift, every differential
 *  harness) can silently act on the wrong row, and a widened quote landing on the wrong requirement is the
 *  fabrication shape this arc exists to close.
 *
 *  Live ladder runs are unaffected — nothing is ever taken, so the numbering is identical to before. This
 *  diverges only where it would otherwise have produced a duplicate. Census: scripts/audit-ai/_dupe-id-census.ts. */
function assignUniqueFindingIds(rows: TypedFinding[], prefix: string, existing: TypedFinding[]): void {
  const taken = new Set(existing.map((f) => f.id).filter(Boolean) as string[]);
  let n = 0;
  for (const f of rows) {
    let id = `${prefix}#${n++}`;
    while (taken.has(id)) id = `${prefix}#${n++}`;
    f.id = id;
    taken.add(id);
  }
}

export function buildManifest(ctx: AuditToolContext): string[] {
  if (procurementPart(ctx) === "part36-construction" && ctx.constructionManifest) return constructionRequired(ctx.constructionManifest);
  return BINDING_SECTIONS.filter((k) => readSection(ctx, k).present);
}

/** Manifest-completeness detector (Brain card-58 production cap). CONSERVATIVE: flags an unfetched attachment
 *  only when the source itself NAMES an attachment with a page count whose volume alone (≈1000 chars/page,
 *  deliberately lenient to avoid false caps) exceeds the ENTIRE assembled source — i.e. that attachment
 *  cannot physically be present (the #5 459-pg-spec-in-a-221KB-source signature). A package whose named
 *  attachments are all plausibly contained returns true. Tunable; intentionally errs toward NOT capping. */
export function manifestComplete(ctx: AuditToolContext): boolean {
  let maxPages = 0;
  const src = ctx.fullSource;
  // A "N pages" span is an ATTACHMENT page-COUNT signal (a named attachment that cannot physically fit in the
  // assembled source) ONLY when it is NOT a proposal page LIMIT. §L/§M limits — "shall not exceed 40 pages",
  // "not to exceed 50 pages", "limited to 30 pages" — constrain the BIDDER's response; they are NOT evidence of
  // an unfetched attachment. Counting them false-caps a fully-ingested, biddable audit to INCOMPLETE and would
  // BURN a paid run (W9126G26RA087 USACE construction carries §L page limits). Skip any match whose immediately
  // preceding context carries limit phrasing. Errs toward NOT capping (the stated intent of this weak heuristic).
  const LIMIT_CTX = /(?:not\s+to\s+exceed|not\s+exceed|no\s+more\s+than|no\s+longer\s+than|limited\s+to|maximum|minimum|up\s+to|within|less\s+than|fewer\s+than|at\s+least|shall\s+not)(?:\s+of)?\s*$/i;
  for (const m of src.matchAll(/(\d{2,4})\s*(?:pgs?\b|pages\b)/gi)) {
    const before = src.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    if (LIMIT_CTX.test(before)) continue; // proposal page LIMIT, not an attachment page-count → never a cap signal
    maxPages = Math.max(maxPages, parseInt(m[1], 10));
  }
  return !(maxPages * 1000 > src.length); // a single named attachment can't exceed the whole source → unfetched
}

/** Format-aware CORE-section honest-fail (fail-safe #10 — Brain card 135, Step 8). Part-15 UCF: any of §C/§L/§M
 *  absent → cap (UNCHANGED). Part-12 commercial (SF-1449/SF-18/combined-synopsis): the core EQUIVALENTS are the
 *  instructions (52.212-1 ≡ §L) and the evaluation / basis-for-award (52.212-2 ≡ §M); cap ONLY when BOTH are
 *  absent (a single missing one is plausibly inline/by-reference — no false scare). The commercial path is
 *  flag-gated via `commercialHonestFail`; OFF ⇒ commercial returns [] (today's free pass, byte-identical).
 *  procurementPart(ctx) is the SINGLE deterministic format source — this EXTENDS fail-safe #10, never a parallel
 *  surface. Pure → $0 gate-testable with a fullSource string. Commercial "changes WHAT counts as core, not
 *  WHETHER a core set is required" — honest-fail preserved both ways. */
export function coreMissingFor(ctx: AuditToolContext, opts?: { commercialHonestFail?: boolean; requiresLM?: boolean; formIdentified?: boolean }): string[] {
  const part = procurementPart(ctx);
  const present = (k: string) => readSection(ctx, k).present;
  // requiresLM is NOTICE-TYPE-driven: a solicitation-type buy (default true / fail-safe when unscoped) requires the
  // instructions (§L) and evaluation (§M); a non-solicitation (Sources Sought / RFI, requiresLM=false) is exempt.
  const requiresLM = opts?.requiresLM !== false;
  if (part === "part36-construction") {
    // Brain card 288 — construction CORE = bonding / wage determination / submission (the §C/§L/§M analog). A
    // solicitation-type construction buy that cannot ground ALL core elements cannot certify a biddable package ⇒
    // INCOMPLETE. Non-solicitation types (requiresLM=false) keep the free pass, symmetric with UCF/commercial. Reads
    // the SEALED full-text manifest, never the digest. No manifest (defensive) ⇒ [] (buildManifest already gates part36).
    if (!requiresLM) return [];
    return ctx.constructionManifest ? constructionCoreMissing(ctx.constructionManifest) : [];
  }
  if (part === "part15-ucf") return ["C", "L", "M"].filter((k) => !present(k));
  if (part === "part12-commercial") {
    // Commercial core EQUIVALENTS: 52.212-1 ≡ §L, 52.212-2 ≡ §M. Cap ONLY when BOTH absent (a single one missing is
    // plausibly inline/by-reference — no false scare).
    const bothAbsent = !present("L") && !present("M");
    // ── IMPOSTOR CAP (Brain card 262 · adversarial-review finding D) — FLAG-INDEPENDENT, runs FIRST so it survives
    //   the FAR-applicability fix below: a SOW-only source classifies part12-commercial off a STRAY "SF 1449"/"RFQ"
    //   string yet has NO recognized primary FORM (form_identified===false) and located neither 52.212-1 nor 52.212-2
    //   → the 80NSSC SOW-only class hiding in the commercial branch → cap regardless of any flag. A REAL commercial
    //   RFQ has form_identified=true (its SF-1449/SF-18 IS the form) → unaffected.
    if (requiresLM && opts?.formIdentified === false && bothAbsent) return ["52.212-1", "52.212-2"];
    // ── FAR-CLAUSE-APPLICABILITY FIX (AUDIT_COMMERCIAL_CLAUSE_APPLICABILITY, default OFF). Deep-research 2026-07-08,
    //   primary FAR text (acquisition.gov/far/12.301 + 52.252-1): on a GENUINE commercial buy, 52.212-1 (Instructions)
    //   is MANDATORY but INCORPORATED BY REFERENCE via SF-1449/SF-18 Block 27a — its FULL TEXT IS EXPECTED ABSENT from
    //   the body — and 52.212-2 (Evaluation) is DISCRETIONARY (12.301(c) "the CO may insert"). Absence-in-body of either
    //   is therefore NOT a completeness defect, and an item incorporated by reference has "the same force and effect as
    //   if given in full text" (52.252-1/-2). This SUPERSEDES the card-135-Step-8 both-absent commercial cap, which
    //   wrongly treated by-reference / discretionary absence as suspicious → the FA442726Q1068 false-INCOMPLETE (form
    //   identified, both absent-in-body, correctly by-reference/discretionary). Flag ON ⇒ genuine commercial never
    //   false-flags 52.212-1/-2 (the impostor cap above still fires). Flag OFF ⇒ byte-identical to card-135 Step 8.
    if (process.env.AUDIT_COMMERCIAL_CLAUSE_APPLICABILITY === "true") return [];
    if (opts?.commercialHonestFail) return bothAbsent ? ["52.212-1", "52.212-2"] : []; // Brain card 135 Step 8 — legacy; OFF ⇒ byte-identical for GENUINE commercial
    return [];
  }
  if (part === "unknown") {
    // C-5 (Brain C.f) — an UNRECOGNIZED format where NONE of the core sections can be located cannot certify its core
    // set ⇒ INCOMPLETE (structureless blob). Unchanged.
    const anyCore = ["C", "L", "M"].some(present);
    const commercialRef = /\b5?2\.212-[12]\b/.test(ctx.fullSource ?? ""); // a bare Part-12 synopsis references 52.212-1/-2 — leave it to the C-10 flag path, never a C-5 false-flag
    // S3 (Brain card 274) — gate the commercialRef free-pass behind !requiresLM. A SOLICITATION-type buy (requiresLM)
    // with a STRAY 52.212-1/-2 reference used to short-circuit to [] (COMPLETE) BEFORE the §L/§M cap below, reopening
    // the notice-body-blind false-COMPLETE and zeroing the L3 finder target set. Only a NON-solicitation (RFI/Sources
    // Sought, requiresLM=false — no §L/§M required anyway) keeps the free pass.
    if (commercialRef && !requiresLM) return [];
    if (!anyCore) return ["C", "L", "M"];
    // Layer-2 (Brain card 262) — KILL THE §C-ONLY FREE PASS. Previously `anyCore → []`, so a SOW-only source (§C
    // detected via title patterns) certified complete while §L/§M lived in an un-ingested notice body → the
    // catastrophic false-COMPLETE (80NSSC26936974Q). A solicitation-type buy discloses the not-located proposal
    // sections → INCOMPLETE cap. Non-solicitations (requiresLM=false) keep the free pass. NOTE (review finding A,
    // Layer-1 dependency): readSection presence is header-regex, so once Layer-1 ingests a NARRATIVE notice body
    // (no "SECTION L/M" headers) §L/§M still read absent — the Layer-3 agentic section-finder is required to clear it.
    if (!requiresLM) return [];
    return ["L", "M"].filter((k) => !present(k));
  }
  return [];
}

/** P3 — dedup identical findings across lenses, preserving the first seen. The key INCLUDES controllability:
 *  two lenses that agree on the decisive field are duplicates and collapse; two that DISAGREE (cannot_move
 *  vs already_satisfied) are NOT duplicates — they must both survive so hasConflict can catch the clash. */
function dedup(findings: TypedFinding[]): TypedFinding[] {
  const seen = new Set<string>(); const out: TypedFinding[] = [];
  for (const f of findings) { const k = norm(f.requirement) + "|" + norm(f.citation) + "|" + f.controllability; if (seen.has(k)) continue; seen.add(k); out.push(f); }
  return out;
}

/** P3 — a material conflict = the SAME requirement asserted with directly contradictory controllability
 *  (one lens says bidder_cannot_move, another says already_satisfied). That contradiction on the decisive
 *  field cannot be silently averaged — it routes to NEEDS_HUMAN_REVIEW. */
function hasConflict(findings: TypedFinding[]): boolean {
  const byReq = new Map<string, Set<string>>();
  for (const f of findings) { const k = norm(f.requirement); if (!byReq.has(k)) byReq.set(k, new Set()); byReq.get(k)!.add(f.controllability); }
  for (const set of byReq.values()) if (set.has("bidder_cannot_move") && set.has("already_satisfied")) return true;
  return false;
}

export interface SectionAttestation { section: string; status: "covered_direct" | "covered_attested" | "covered_attested_boilerplate" | "covered_boilerplate_signal" | "read_no_obligation" | "unread" | "obligations_ungrounded"; obligations: string[]; citedFindingIds: string[]; ungrounded: string[]; sectionHash?: string; }

// C-7 (Brain C.c) — the obligation-extraction cap. Raised 25 → 200 so a normal binding section is fully proven
// (25 silently dropped obligations #26+ was a false-COMPLETE hole). If a section still exceeds 200 obligation
// sentences (pathological), `truncated` fires so the caller cannot certify it covered ⇒ INCOMPLETE — never a
// silent drop.
const MAX_OBLIGATIONS = 200;
/** Extract obligation sentences from a section — the clauses that impose a duty (shall/must/provide/...). */
function obligationsOf(text: string): { obligations: string[]; truncated: boolean } {
  const all = text.split(/(?<=[.;\n])/).map((s) => s.trim())
    .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s));
  return { obligations: all.slice(0, MAX_OBLIGATIONS), truncated: all.length > MAX_OBLIGATIONS };
}
// ELIGIBILITY-BAR obligation language — the deterministic INCOMPLETE floor's CHARTER (Gauntlet Card #370 RULING 2). An
// attachment attestation may never suppress a BIDDER-ELIGIBILITY / DISQUALIFIER bar (it must be GROUNDED as a finding,
// never merely "attested no-obligation"). The allow-list is scoped to eligibility semantics ONLY — clearance, set-aside,
// size standard, certification, registration, debarment — mirroring the eligibility show-stopper narrowing (FAR 19 /
// 13 CFR 121–128 precedent). RULING 2 NARROWED this from the former HARD_BAR_RE: a bare `\bshall not\b` performance
// obligation and generic `\bmust be a\b` are NOT eligibility bars — they belong to the A+C coverage mandate (the doc
// must still be provably-read + ground-or-attest) and Gate-4 verifier/panel adjudication, and must NOT trip
// deterministic INCOMPLETE alone (attesting-read a drawings/construction doc that only carries "SHALL NOT DEVIATE FROM
// THE PLANS" was an UNDER_ABSTAIN manufacturing vector on every construction buy, and contradicted the Card #347
// honest-empty ruling). "shall not" is NOT deleted as a coverage-relevance signal — obligationsOf still detects it, so
// the doc stays coverage-required; it just can no longer force INCOMPLETE by itself. The be-<qualifier> clause allows a
// BOUNDED cert token ("must be CMMC Level 2 certified") — {0,40}? length-capped, ReDoS-safe. Two W9126-drawings-grounded
// refinements (Card #370 calibration, real construction text — no synthetics): (a) OFFEROR-vs-WORK — a credential on the
// OFFEROR ("offeror shall be certified") is eligibility, a credential on the WORK/AGENT ("drawings shall be sealed BY a
// licensed engineer", "work performed BY certified welders") is performance → the be-<qualifier> clause tempers out an
// intervening "by"; (b) SET-ASIDE requires a socioeconomic qualifier (small-business/HUBZone/SDVOSB/… before, or
// "for/program/concern" after) so a construction "SET ASIDE for re-use" is not read as a socioeconomic set-aside — the
// specific program tokens (hubzone/sdvosb/8(a)/cmmc/clearance/debarred) stay standalone (no construction homograph). All
// ELIGIBILITY_BAR_RE consumers are flag-ON only, so both the narrowing and the additions are flag-OFF byte-identical.
const ELIGIBILITY_BAR_RE = /\b(?:shall|must|required to) (?:hold|possess|maintain|have) [\w /:.\-]{0,40}?(?:clearance|certif|accredit|licens|registration|registered|eligib)\b|\b(?:shall|must|required to) be (?:(?!\bby\b)[\w /:.\-]){0,40}?(?:certified|registered|accredited|licensed)\b|\bcleared (?:to|at|for)\s(?:the\s)?(?:secret|top[\s-]?secret|ts[\s/]?sci|sci|confidential|interim)\b|\bregistered in sam\b|\bactive sam(?:\.gov)? registration\b|\b(?:facility|security|personnel) clearance\b|\btop secret\b|\bsecret\b.{0,20}\bclearance\b|\bcmmc\b|\bas9100\b|\biso\s?9001\b|\bsize standard\b|\bdebarr?ed\b|\bexcluded part(?:y|ies)\b|\bsam exclusion\b|\beligib(?:le|ility)\b|\bineligible\b|\b(?:small[\s-]?business|total|competitive|partial|hubzone|sdvosb|wosb|edwosb|service[\s-]?disabled|women[\s-]?owned|veteran[\s-]?owned|8\s?\(?a\)?)[\s\w%,\-]{0,20}?set[\s-]?aside\b|\bset[\s-]?aside[\s\w%,\-]{0,20}?(?:small[\s-]?business|concern|program)\b|\brestricted to\s[\w,\- ]{0,30}?(?:small[\s-]?business|concern|offeror|firm|8\s?\(?a\)?|hubzone|sdvosb|wosb|edwosb|women[\s-]?owned|veteran[\s-]?owned|service[\s-]?disabled|certified|eligib)\b|\blimited to\s[\w,\- ]{0,30}?(?:small[\s-]?business|concern|offeror|firm|8\s?\(?a\)?|hubzone|sdvosb|wosb|edwosb|women[\s-]?owned|veteran[\s-]?owned|service[\s-]?disabled)\b|\b8\s?\(?a\)?\b|\bsdvosb\b|\bhubzone\b|\bwosb\b|\bedwosb\b|\bservice[\s-]?disabled\b|\bonly[^.!?]{0,55}?attend(?:ed|ing|ance)?[^.!?]{0,55}?(?:move forward|will be able|may (?:submit|propose|bid|participate)|proceed with the propos|eligible to (?:propose|bid))\b|\b(?:mandatory|required)[^.!?]{0,25}?(?:pre[\s-]?proposal |pre[\s-]?bid )?(?:site[\s-]?visit|conference)\b[^.!?]{0,55}?(?:attend|eligib|to (?:propose|bid|submit))\b/i;

// ── Commercial §L false-INCOMPLETE fix (ENGINE-5-ROOT #1, clears P0 S3-1 + S6-1) ──────────────
// On a FAR Part-12 commercial (SF1449) buy, §L (Instructions to Offerors) is the INCORPORATED
// standard provision FAR 52.212-1 plus the agency's own "Addendum". obligationsOf() enumerates the
// standard (a)-(l) provision boilerplate as obligations, but NO auditor finding quotes that canned
// government text verbatim (auditors flag the Addendum's real bars — OEM letter, SAM registration,
// 90-day acceptance, warranty). So a handful of un-quotable 52.212-1 boilerplate sentences land
// `ungrounded` → §L `missing` → false INCOMPLETE on essentially every commercial SF1449. This is the
// verbatim FAR 52.212-1 (SEP 2023) obligation-bearing body; an obligation that shares a ≥6-word
// verbatim n-gram with it (stricter than the ≥4-word grounding gram) is standard clause boilerplate,
// NOT an agency-authored bar, and is excused from per-obligation grounding — but ONLY on a commercial
// §L that already proved it was read (≥1 direct §L-cited grounded finding). See completenessOf.
const FAR_52_212_1_BOILERPLATE = `
Submit signed and dated offers to the office specified in this solicitation at or before the exact time specified in the solicitation.
As a minimum, offers must show the solicitation number; the name, address, and telephone number of the offeror; a technical description of the items being offered in sufficient detail to evaluate compliance with the requirements in the solicitation.
Terms of any express warranty; price and any discount terms; remit to address, if different than mailing address; a completed copy of the representations and certifications; acknowledgment of solicitation amendments; past performance information; and if the offer is not submitted on the SF 1449, include a statement specifying the extent of agreement with all terms, conditions, and provisions included in the solicitation.
Offers that fail to furnish required representations or information, or reject the terms and conditions of the solicitation, may be excluded from consideration.
The offeror shall submit any statement of the extent of agreement with all terms, conditions, and provisions included in the solicitation.
The offeror agrees to hold the prices in its offer firm for 30 calendar days from the date specified for receipt of offers, unless another time period is specified in an addendum to the solicitation.
When required by the solicitation, product samples shall be submitted at or prior to the time specified for receipt of offers.
Offerors are encouraged to submit multiple offers presenting alternative terms and conditions, including alternative line items or alternative commercial products or services for satisfying the requirements of this solicitation.
Nongovernment (voluntary) standards must be obtained from the organization responsible for their preparation, publication, or maintenance.
Offerors are responsible for submitting offers, and any modifications, revisions, or withdrawals, so as to reach the Government office designated in the solicitation by the time specified in the solicitation.
The offeror shall enter, in the block with its name and address on the cover page of its offer, the annotation Unique Entity Identifier followed by the unique entity identifier that identifies the offeror's name and address.
The offeror also shall enter its Electronic Funds Transfer indicator, if applicable.
Offers are bound by the terms of the solicitation and shall provide the required information.
`;
const norm6 = (s: string): string => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const FAR_52_212_1_GRAMS: Set<string> = (() => {
  const words = norm6(FAR_52_212_1_BOILERPLATE).split(" ").filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i + 6 <= words.length; i++) grams.add(words.slice(i, i + 6).join(" "));
  return grams;
})();
/** True when an obligation sentence is verbatim FAR 52.212-1 standard-provision boilerplate (shares a
 *  ≥6-word n-gram with the canonical clause body) — i.e. incorporated government text, not an agency bar. */
function isFar52121Boilerplate(ob: string): boolean {
  const words = norm6(ob).split(" ").filter(Boolean);
  for (let i = 0; i + 6 <= words.length; i++) { if (FAR_52_212_1_GRAMS.has(words.slice(i, i + 6).join(" "))) return true; }
  return false;
}

/** The UCF section a finding is CITED to (from its citation, e.g. "§C" / "Section C" / "C - ..."). null when the
 *  citation names a clause number or is unparseable — such a finding cannot ground a section-scoped obligation. */
function findingSection(f: TypedFinding): string | null {
  // STRIP the engine's own withholding marker before scanning. Its prose ends in "withhel*d*", and the bare
  // UCF-letter scan below matches that `d` — so a gated citation reported section "D" where the ungated one
  // reported none, drifting replay coverage away from the live run. (Review finding #4 on PR #294.)
  const c = stripWithholdMarkers(f.citation || "").trim();
  // A commercial clause number IS its UCF section — 52.212-1 ≡ §L (instructions), 52.212-2 ≡ §M (evaluation),
  // 52.212-4/-5 ≡ §I (clauses), 52.204-8 / 52.212-3 ≡ §K (reps/certs). Map them so a finding that cites the clause
  // number instead of the §-letter still grounds its own section (else §M/§I/§K attested-coverage would false-drop
  // to ungrounded → chronic false INCOMPLETE on commercial buys).
  if (/\b5?2\.212-1\b/.test(c)) return "L";
  if (/\b5?2\.212-2\b/.test(c)) return "M";
  if (/\b5?2\.212-[45]\b/.test(c)) return "I";
  if (/\b5?2\.(?:204-8|212-3)\b/.test(c)) return "K";
  const m = /§?\s*(?:section\s+)?([A-M])\b/i.exec(c);
  return m ? m[1].toUpperCase() : null;
}

// ── UNIT 2.2 (Brain cards #548/#549) — grounding-matcher VARIANT TOLERANCE ─────────────────────────────
// Live driver (dccce793): the §7.3.2 obligation "Maintain licensing requirements, certifications,
// accreditations, and the required insurance…" failed to ground against its §7.2.2 twin finding
// "Maintain licensing requirements/certification/accreditation and required insurance coverage…" —
// comma-form vs slash-form plus singular/plural drift means the two share NO exact 4-gram, and the
// finding's citation ("PWS §7.2.2") parses to no UCF letter so the same-section constraint also failed.
// → false-NHR on a sentence the audit itself had grounded. Fix, DETERMINISTIC BY CONSTRUCTION (no
// vocabulary lists): a variant-normal form — lowercase, every non-alphanumeric run → one space (the
// comma/slash/paren class collapses), closed-class articles {a,an,the} dropped, and a trailing "s"
// stripped from tokens ≥4 chars (plural drift). 4-gram threshold UNCHANGED (R8 — no drift); matching is
// token-boundary-safe (space-padded containment). Flag OFF ⇒ exact-gram path only, byte-identical.
const ARTICLES = new Set(["a", "an", "the"]);
const LEADING_CONJUNCTIONS = new Set(["and", "or"]); // R5-F3 — closed-class grammar, same class as ARTICLES
// R1-F7 — singularization BY CONSTRUCTION (morphology, not vocabulary): -ies→y (facilities/facility),
// sibilant -es strip (classes/class, matches/match), bare -s strip (requirements/requirement) with the
// -ss guard (class stays class); possessive "'s" arrives as a standalone "s" token after the punctuation
// collapse and is dropped (offeror's ≡ offerors ≡ offeror).
const singular = (w: string): string => {
  if (w.length < 4) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  // R3-F4 — result-length guard on the sibilant strip: a ≤3-char result ("uses"→"us", "cases"→"cas")
  // collides with distinct short words; decline the -es strip and FALL THROUGH to the plain -s strip
  // ("uses"→"use", "cases"→"case" — which then canonicalize correctly against their singulars).
  // R4-F5 truth-up: the fallthrough's REAL cost class is 3-letter stems (boxes→"boxe"≠box, taxes,
  // gases, buses) — those misses fail SAFE toward NHR (a missed unification never grounds anything).
  if (/(?:ses|xes|zes|ches|shes)$/.test(w) && w.length - 2 >= 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
// R2-F4 — the -ses ending is morphologically AMBIGUOUS (clause+s vs class+es); no strip picks right for
// both. Canonicalize instead: after singularization, drop a trailing "e" on tokens ≥4 — "clauses"→"claus"
// ≡ "clause"→"claus", "licenses"≡"license"→"licens", "cases"≡"case"→"cas", while "classes"≡"class" via the
// -ss guard. Collisions this introduces (note/not, one/on-class) only matter inside a 4-gram (three
// neighbors must also match) and only on the relaxed path, which now also demands contiguity + trigger
// coverage — bounded by construction.
const canonToken = (w: string): string => {
  const s = singular(w);
  // R3-F4 — result-length guard: strip the trailing e only when the RESULT stays ≥4 chars. A 3-char
  // result collides with distinct short words (SAM≡"same", not≡"note", rac≡"race" — an executed
  // eligibility-bar launder rode sam/same). Cost class (R4-F5 truth-up): 3-letter stems (box/boxes,
  // tax/taxes, gas/gases) stay un-unified via the sibilant fallthrough — fail SAFE toward NHR; the
  // 4-letter -se singulars (case/cases, size/sizes) DO unify via the -s fallthrough.
  return s.length >= 5 && s.endsWith("e") ? s.slice(0, -1) : s;
};
export function normVariant(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((w) => w && w !== "s" && !ARTICLES.has(w))
    .map(canonToken)
    .join(" ");
}
const gramsOf = (tokens: string[], n: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
};
/** C-12 (Brain C.d, R8) — a ≥4-word verbatim n-gram shared between an obligation sentence and a grounded finding's
 *  excerpt, AND the finding must be CITED to the SAME section as the obligation. This closes the cross-section
 *  false-attestation (a §C finding sharing a 4-gram with a §M obligation no longer attests §M covered). The n-gram
 *  threshold stays FROZEN at ≥4 (R8 — no drift). Same-span + same-section is the Rule-64 "this obligation IS
 *  grounded by that finding" proof.
 *  UNIT 2.2 additions (flag AUDIT_GROUNDING_VARIANT_TOLERANCE, OFF ⇒ byte-identical):
 *  (a) VARIANT grams (normVariant) accepted alongside exact grams — closes the comma/slash+plural class;
 *  (b) SECTION-NULL relaxation: a finding whose citation parses to NO UCF letter (e.g. "PWS §7.2.2" on a
 *      commercial package, where section keys are routed approximations) may ground an obligation IFF its
 *      citation is NON-EMPTY (R1-F1c: an uncited finding is unprovenanced and never a grounder) AND its
 *      excerpt is verbatim-contained in the SAME section's full text (`sectionNText`) — a same-span proof
 *      STRONGER than the citation letter; a finding cited to a DIFFERENT letter still never crosses (S7).
 *  R1-F1 + R2-F1 SUBSTANTIVE-COVERAGE BAR (the anti-laundering gate): EVERY relaxed acceptance —
 *  variant-only grams and/or a section-null finding — additionally requires the shared material to be a
 *  PROOF of same-substance, not a phrase coincidence:
 *   (1) CONTIGUITY (kills scattered-gram assembly, R2-F1a3): the covered obligation tokens must contain
 *       ONE contiguous run ≥50% of the obligation's variant tokens;
 *   (2) TRIGGER-SPAN + SUBJECT (kills idiom bridging, R2-F1a1/a2): when the obligation carries a
 *       DISQUALIFIER_RE trigger ("will not be considered", …), the qualifying run must cover the WHOLE
 *       trigger AND extend ≥2 tokens beyond it (the finding must share the consequence AND its subject —
 *       a finding quoting a DIFFERENT bar's identical consequence idiom shares no subject token).
 *  The dccce793 twin shares its full head+tail contiguously (trigger-less, ~100% run) and PASSES all of
 *  this by construction. The fail-toward-disqualifier doctrine is only ever released by that proof. */
const RELAXED_COVERAGE_MIN = 0.5;
// R8-F2 — per-excerpt sentence derivation is pure; memoized so a giant excerpt quoted by many findings
// is split/normalized once, not once per (obligation × finding) pair. Bounded, cleared at 64 entries.
const EXCERPT_SENTENCE_CACHE = new Map<string, Array<{ vEx: string; exToks: string[] }>>();
/** covered-position mask from shared 4-grams (variant space). */
function coveredMask(vToks: string[], vExcerptPadded: string): boolean[] {
  const covered = new Array<boolean>(vToks.length).fill(false);
  if (vToks.length < 4) return covered;
  for (let i = 0; i + 4 <= vToks.length; i++) {
    if (vExcerptPadded.includes(` ${vToks.slice(i, i + 4).join(" ")} `)) for (let k = i; k < i + 4; k++) covered[k] = true;
  }
  return covered;
}
/** find the trigger's token positions inside the obligation's variant tokens (consecutive subsequence). */
/** R4-F2 — ALL occurrences of a token subsequence (a repeated consequence idiom maps to EVERY position,
 *  so a clipped excerpt cannot attest a compound bar via the first occurrence alone). */
function tokenSpansOf(vToks: string[], spanToks: string[]): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  if (!spanToks.length || spanToks.length > vToks.length) return out;
  for (let i = 0; i + spanToks.length <= vToks.length; i++) {
    if (spanToks.every((t, j) => vToks[i + j] === t)) out.push({ start: i, end: i + spanToks.length - 1 });
  }
  return out;
}
function passesSubstantiveBar(obligation: string, vToks: string[], rawExcerpt: string): boolean {
  const n = vToks.length;
  if (n < 4) return false;
  // R7-F2 — SIZE GUARD: no real obligation SENTENCE approaches 120 variant tokens; beyond it the
  // "obligation" is a table/OCR block (obligationsOf caps the pool at whole-sentence granularity) and
  // the relaxed bar's window×sentence scan cost multiplies across findings. Over-cap ⇒ refuse relaxed
  // acceptance = fail SAFE toward NHR (the legacy exact path is untouched).
  if (n > 120) return false;
  const need = Math.ceil(RELAXED_COVERAGE_MIN * n);
  // Obligation-side triggers, FAIL CLOSED (R3-F2) — computed once, enforced per-sentence below.
  const trigSeqs: string[][] = [];
  const trigSpans: Array<{ start: number; end: number }> = [];
  const seenSeq = new Set<string>();
  for (const t of disqualifierTriggersOf(obligation)) {
    const seq = normVariant(t).split(" ").filter(Boolean);
    const spans = tokenSpansOf(vToks, seq);
    if (!spans.length) return false;                             // fail CLOSED (R3-F2)
    trigSpans.push(...spans);
    const key = seq.join(" ");
    if (!seenSeq.has(key)) { seenSeq.add(key); trigSeqs.push(seq); }
  }
  // R5-F1/F2 — SENTENCE-SCOPED TWO-SIDED PROOF. Five rounds established that ANY release computed over
  // obligation-side positions against a position-blind whole-excerpt mask will be bridged (tail bridges
  // R2/R3, head bridges R5-F1, idiom tiling R5-F2). The proof is now scoped to ONE EXCERPT SENTENCE at a
  // time: a grounding excerpt QUOTES the obligation sentence (with punctuation/plural variants and
  // bounded insertions); matches assembled across different excerpt sentences are assembly, not
  // quotation. Within a single sentence:
  //   (1) contiguity: one covered run ≥50% of the obligation's variant tokens;
  //   (0) DUAL endpoint anchor (R4-F1 + R5-F1): the run must include the obligation's HEAD (token 0 —
  //       token 1 only behind a genuine leading conjunction, R5-F3: closed-class grammar {and, or},
  //       the same class as the ARTICLES set, not bar vocabulary) AND its TAIL (token ≥ n-2): a
  //       compound bar's laundered half always leaves one endpoint uncovered;
  //   (2) triggers: EVERY occurrence inside the qualifying run, and the SENTENCE must carry at least
  //       as many occurrences of each trigger sequence as the obligation (R4-F2/R5-F2 — an unrelated
  //       same-idiom sentence elsewhere in the excerpt can no longer tile or inflate the count);
  //   (3) subject test (triggered case): the qualifying runs cover ≥50% of NON-TRIGGER tokens.
  // The dccce793 twin passes by construction: its mid-sentence insertion ("$1 mil per occurrence…")
  // leaves the obligation's covered POSITIONS adjacent (0..8 + 9..end), one head+tail run, one sentence.
  // R6-F3 — orthography-protected split (closed-class, not vocabulary): decimals/clause cites
  // ("$1.5", "52.212-1") and letter-dot abbreviation chains ("U.S.", "e.g.") are NOT sentence
  // boundaries; a newline is a boundary only before a blank line or an outline number (PDF hard-wraps
  // are mid-sentence by default). A false split fragments a LEGIT twin and falsely refuses it — the
  // exact false-NHR class this card exists to close.
  // R7-F1 — a chain's FINAL dot stays a BOUNDARY when followed by a start-of-sentence signature
  // (whitespace + capital/digit/open-quote): "…authorized in the U.S. Facsimile submissions…" is two
  // sentences; "(e.g. professional liability)" / "U.S. citizens" stay one. Cost: a mid-sentence
  // "U.S. Government" twin splits → false-refusal, fail-SAFE (documented ledger class). The digit
  // protection keeps its no-whitespace shape (a space-dropped OCR glue "15.52.228-1" remains the
  // documented n2 floor, Brain-sanction pending).
  // R8-F1 — INVERTED default (doctrine polarity): after a letter-dot chain, whitespace means BOUNDARY
  // unless a closed-class CONTINUATION signature follows (lowercase, comma/semicolon/colon, closing
  // paren/bracket/quote incl. curly, currency "U.S. $1.5 million"). Unknown/exotic start glyphs now
  // default to SPLIT = refuse = fail-toward-escalation (the prior allowlist of start glyphs failed
  // toward acceptance — curly-quote/§/bracket-led second sentences kept the glue). No-whitespace
  // ("U.S.-based") stays protected. Residual: a lowercase-led glue joins the n2 digit-glue floor
  // (orthographically undecidable without vocabulary; Brain-sanction pending).
  const protectedExcerpt = (rawExcerpt || "")
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (m, offset: number, str: string) => {
      // R9-F1/F2 (terminal shape) — the continuation class holds ONLY the glyphs that are unambiguous
      // continuations after whitespace: a lowercase word (mid-sentence prose) or "$" (the "U.S. $1.5
      // million" currency form). ASCII quotes after whitespace are OPENERS (a closing quote never
      // follows whitespace) and every punctuation member was a glue carrier. Leading CLOSER glyphs are
      // stripped before the test ("…the U.S.\" Facsimile…" — the closer hugs the dot, the boundary
      // decision belongs to what follows it). Every excerpt-side split at a chain dot is structurally
      // rescued by symmetric fragment pairing (obligationsOf raw-splits at every dot, so no pool entry
      // straddles one) — proven zero-cost on the banked positives. Residual floors (Brain-sanction
      // pending, banked): lowercase-led glue (q1), "$"-led second sentences (t9), digit-glue (n2).
      const after = str.slice(offset + m.length).replace(/^["'\u201D\u2019)\]]+/, "");
      const boundaryAfter = /^\s+/.test(after) && !/^\s*[a-z$]/.test(after);
      const all = m.replace(/\./g, "\u0001");
      return boundaryAfter ? `${all.slice(0, -1)}.` : all;
    });
  let sentences = EXCERPT_SENTENCE_CACHE.get(protectedExcerpt);
  if (!sentences) {
    sentences = protectedExcerpt.split(/[.;!?]+|\n\s*\n|\n(?=\s*\d+[.)\t ])/)
      .map((raw) => { const vEx = normVariant(raw); return { vEx, exToks: vEx.split(" ").filter(Boolean) }; })
      .filter((x) => x.exToks.length >= 4);
    if (EXCERPT_SENTENCE_CACHE.size >= 64) EXCERPT_SENTENCE_CACHE.clear(); // bounded (R8-F2)
    EXCERPT_SENTENCE_CACHE.set(protectedExcerpt, sentences);
  }
  for (const { vEx, exToks } of sentences) {
    const covered = coveredMask(vToks, ` ${vEx} `);
    const runs: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < covered.length; i++) {
      if (!covered[i]) continue;
      const start = i;
      while (i + 1 < covered.length && covered[i + 1]) i++;
      runs.push({ start, end: i });
    }
    // R6-F2 — the tail anchor requires the FINAL token (n-1), symmetric with the head: an un-typed
    // endpoint tolerance is a swap surface (R5-F3 head ↔ R6-F2 tail — parallel §L rows differing only
    // at the object noun). Cost: final-token morphology misses refuse → fail SAFE toward NHR.
    let qualifying = runs.filter((r) => r.end - r.start + 1 >= need
      && (r.start === 0 || (r.start === 1 && LEADING_CONJUNCTIONS.has(vToks[0])))
      && r.end >= n - 1);
    // R6-F1(i) — ORDER BINDING: the run's matched 4-gram windows must align MONOTONICALLY to the
    // excerpt sentence (greedy non-decreasing assignment). Scattered-but-reordered chunk assembly
    // inside one comma-joined sentence is assembly, not quotation. The in-order negation/preference
    // wrapper remains the documented POLARITY FLOOR (Brain-sanction pending) — the same floor the
    // pre-existing legacy exact path already has.
    qualifying = qualifying.filter((r) => {
      let prev = 0;
      for (let i = r.start; i + 4 <= r.end + 1; i++) {
        const g = vToks.slice(i, i + 4);
        const occs = tokenSpansOf(exToks, g);
        if (!occs.length) continue; // an unmatched window inside the run (covered via overlaps) imposes no constraint
        const ok = occs.find((o) => o.start >= prev);
        if (!ok) return false;
        prev = ok.start;
      }
      return true;
    });
    if (!qualifying.length) continue;
    let ok = true;
    for (const sp of trigSpans) {
      if (!qualifying.some((r) => r.start <= sp.start && r.end >= sp.end)) { ok = false; break; }
    }
    if (ok) for (const seq of trigSeqs) {
      if (tokenSpansOf(exToks, seq).length < tokenSpansOf(vToks, seq).length) { ok = false; break; }
    }
    if (!ok) continue;
    if (trigSpans.length) {
      const inTrigger = new Array<boolean>(n).fill(false);
      for (const sp of trigSpans) for (let k = sp.start; k <= sp.end; k++) inTrigger[k] = true;
      const nonTrigTotal = inTrigger.filter((x) => !x).length;
      if (nonTrigTotal === 0) continue; // all-trigger obligation carries no shareable subject
      let nonTrigCovered = 0;
      for (const r of qualifying) for (let k = r.start; k <= r.end; k++) if (!inTrigger[k]) nonTrigCovered++;
      if (nonTrigCovered / nonTrigTotal < RELAXED_COVERAGE_MIN) continue;
    }
    return true;
  }
  return false;
}
function groundedBy(obligation: string, findings: TypedFinding[], sec: string, sectionNText?: string): string[] {
  const words = norm(obligation).split(" ").filter(Boolean);
  const grams = gramsOf(words, 4);
  const tol = groundingVariantToleranceEnabled();
  const vToks = tol ? normVariant(obligation).split(" ").filter(Boolean) : [];
  const ids: string[] = [];
  for (const f of findings) {
    if (!f.id) continue;
    const ex = norm(analyzedExcerptOf(f) || "");
    const fSec = findingSection(f);
    // Legacy path — UNCHANGED any flag state: same-letter citation + exact 4-gram.
    if (fSec === sec && grams.some((g) => ex.includes(g))) { ids.push(f.id); continue; }
    if (!tol) continue;
    // Relaxed paths (flag ON) — all gated by the substantive-coverage bar.
    const sectionOk = fSec === sec
      || (fSec === null && (f.citation || "").trim().length > 0 && !!sectionNText && !!ex && sectionNText.includes(ex));
    if (!sectionOk) continue;
    // ANALYZED span, not the displayed one. `passesSubstantiveBar` tokenises the excerpt and asks whether it
    // COVERS the obligation's tokens, so widening only ever adds tokens and can only make an obligation
    // easier to claim — the dangerous direction. Its sibling at the legacy path above was converted in the
    // first E1 pass and this one was missed: two lines apart, the same finding was answering "did the
    // analysis examine this?" with two different spans.
    if (passesSubstantiveBar(obligation, vToks, analyzedExcerptOf(f) || "")) ids.push(f.id);
  }
  return [...new Set(ids)];
}

/** C-2 (Brain C.f) — PER-BINDING-DOCUMENT attestation. The assembled fullSource carries a "==== DOCUMENT: name ===="
 *  delimiter per doc. Section-level completeness proves the PRIMARY solicitation; an ATTACHMENT is a separate binding
 *  document that must ALSO be analyzed. For each binding attachment region: it is covered iff it carries NO obligation
 *  sentence (read_no_obligation — a thin binding doc, the relief valve) OR ≥1 finding is grounded verbatim IN it.
 *  A binding attachment with obligations but NO grounding finding is ingested-with-text-but-UNANALYZED → uncovered ⇒
 *  the read cannot read COMPLETE. Single-doc packages (no delimiter) → covered (section completeness governs). */
/** Parse the assembled fullSource into (name, text) document regions by the "==== DOCUMENT: name ====" delimiter
 *  (assembleFullSource writes one per doc when >1). `isPrimary` marks the primary solicitation: identity-based
 *  (resolvePrimary — Card #370 R1: solicitation form / UCF density, amendments DISQUALIFIED) when the attachment-
 *  coverage flag is ON, write-order (first region) when OFF (flag-OFF byte-identical). Single-doc packages carry no
 *  delimiter → one primary region. */
export function docRegions(fullSource: string): Array<{ name: string; text: string; isPrimary: boolean }> {
  // ReDoS-PROOF shared parser (Gauntlet #349 R3) — replaces the quadratic split regex (empirically 16k spaces ≈ 43s;
  // reachable in prod today via any attachment body). Byte-identical regions on well-formed input.
  const regions = parseDocRegions(fullSource ?? "");
  if (regions.length === 0) return [{ name: "(primary solicitation)", text: fullSource ?? "", isPrimary: true }];
  const primaryIdx = ATTACHMENT_COVERAGE_ENABLED ? resolvePrimary(regions).index : 0;
  return regions.map((r, i) => ({ ...r, isPrimary: i === primaryIdx }));
}

// ── Vehicle A–E · item B (flag AUDIT_COVERAGE_COUNTER_SPLIT, default-OFF) — READ vs GROUNDED are distinct axes. ──────
// A region that is the GROUNDED SOURCE of a decision-bearing finding is, by definition, read AND grounded, and must
// NEVER appear in the "not confirmed read/grounded" gap list. Pin: FA813726 e63bd1e7 — two `disqualifying` findings
// quote the SAM Notice Body verbatim while the gap list named it "not confirmed read/grounded" (the contradiction the
// Gate-4 panel + red-team confirmed). REGION-GRANULAR per design-panel R5: keyed to the region a decision-bearing
// grounded finding's excerpt is actually IN. Pure; model-free. Flag-OFF ⇒ never called ⇒ byte-identical.
const coverageCounterSplitEnabled = (): boolean => process.env.AUDIT_COVERAGE_COUNTER_SPLIT === "true";
export function groundedSourceRegionNames(fullSource: string, findings: TypedFinding[]): Set<string> {
  const nameKey = (s: string): string => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const decisionBearing = findings.filter((f) => f.grounded === true && !!f.excerpt && disposeFinding(f) !== "dropped");
  const regions = docRegions(fullSource).map((r) => ({ name: r.name, text: norm(r.text) }));
  const out = new Set<string>();
  // P2 FIX (adversarial seat #4, 2026-07-24) — attribute each grounded excerpt to its UNIQUE source region. A short or
  //   boilerplate excerpt ("shall comply with all applicable regulations", a bare FAR cite) can substring a genuinely-
  //   UNCOVERED region and wrongly strip it from the gap list, hiding an unread doc. Guard both directions: require a
  //   substantive excerpt (≥24 norm chars) AND a UNIQUE containing region (hits===1). Ambiguous (0 or >1) ⇒ strip
  //   nothing ⇒ the gap disclosure is KEPT (conservative — never hide a real gap; at worst leaves a grounded region listed).
  for (const f of decisionBearing) {
    const ex = norm(analyzedExcerptOf(f) || "");
    if (ex.length < 24) continue;
    const hits = regions.filter((r) => r.text.includes(ex));
    if (hits.length === 1) out.add(nameKey(hits[0].name));
  }
  return out;
}

export function documentsCovered(
  fullSource: string,
  findings: TypedFinding[],
  opts?: { docsRead?: string[]; attestations?: string[] },
): { complete: boolean; uncovered: string[] } {
  const regions = docRegions(fullSource);
  if (regions.length <= 1) return { complete: true, uncovered: [] }; // single-doc package — section completeness governs
  const primaryNorm = norm(regions.find((r) => r.isPrimary)?.text ?? "");
  // Brain #347 (flag AUDIT_ATTACHMENT_COVERAGE) — a binding attachment the panel READ but that genuinely carries no
  // operative obligation for the bidder can be covered by a PROVABLY-READ "no operative obligation" attestation. It is
  // honoured ONLY when the doc is BOTH attested AND in docsRead (the lens actually read_document'd it): attested-but-
  // not-read = rubber-stamp = REJECTED (stays uncovered → the safe direction, never a false COMPLETE). A fabricated
  // FINDING can never cover a doc either — an ungrounded excerpt is dropped upstream (isGrounded), so it never reaches
  // `findings` here. Opts absent (flag off) ⇒ both sets empty ⇒ byte-identical to the prior behaviour.
  // Join docsRead/attestations to regions by an EXACT (punctuation-preserving) name key — `norm` strips punctuation
  // and would let two DISTINCT attachments whose names differ only in punctuation collide, so one attestation could
  // cover BOTH (Gauntlet #349 R2). docsRead/attestations already carry RESOLVED region names, so exact keying matches.
  const nameKey = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const readSet = new Set((opts?.docsRead ?? []).map(nameKey));
  const attSet = new Set((opts?.attestations ?? []).map(nameKey));
  // CROSS-ATTACHMENT uniqueness (Gauntlet #349 R4, flag-on only — opts present). The grounded-finding predicate below
  // excludes excerpts shared with the PRIMARY; it must ALSO exclude excerpts shared with ANOTHER attachment, else a
  // finding grounded in attachment A (a flow-down phrase A and B both carry) would falsely certify B as analyzed →
  // false COMPLETE. Opts absent (flag off) ⇒ gate off ⇒ byte-identical to prior behaviour.
  const crossAttGate = opts != null;
  const otherAttNorms = crossAttGate ? regions.filter((x) => !x.isPrimary).map((x) => ({ name: x.name, t: norm(x.text) })) : [];
  const uncovered: string[] = [];
  for (const r of regions) {
    if (r.isPrimary) continue;                                           // primary solicitation — handled by section completeness
    if (!isBindingDoc({ role: "attachment", name: r.name })) continue;   // non-binding attachment (offeror-fill) — exempt
    // T0-2 (engine line-audit 2026-07-06) — UNREAD ≠ read-and-empty (mirrors constructionDocumentsCovered): a
    // binding attachment whose region carries no machine-readable text (failed extraction / scanned / empty) was
    // NOT analyzed — its obligations were never extractable, so "0 obligations" is not proof of coverage. Flag it
    // uncovered ⇒ INCOMPLETE (the safe direction); never let a content-loss doc pass as read_no_obligation.
    if (!hasEngineText(r.text)) { uncovered.push(r.name); continue; }
    const obs = obligationsOf(r.text).obligations;
    if (!obs.length) {
      // DETERMINISTIC FLOOR on the read_no_obligation valve too (Gauntlet #350 ADD-7 — the SECOND hard-bar bypass): a
      // VERB-LESS clearance/eligibility/set-aside bar (e.g. a bare "HUBZone Small Business Set-Aside" heading, orch:379
      // live-defect class) yields ZERO obligation SENTENCES, so obligationsOf is empty — yet it is a real disqualifier.
      // It must NOT take the free no-obligation pass. Fall through to the grounded-finding-in-region check below (only a
      // finding that actually ANALYZED it, or — rejected here too — an attestation, can cover it). Scan the WHOLE region
      // (not the capped obligationsOf list), mirroring the attestation floor at ELIGIBILITY_BAR_RE.exec below. Flag-gated
      // on crossAttGate (opts present) ⇒ flag-OFF byte-identical. Card #370 R2: floor is ELIGIBILITY-only — a verb-less
      // performance "shall not" no longer fires here (routes to Gate-4), only a true eligibility/disqualifier bar does.
      if (!(crossAttGate && ELIGIBILITY_BAR_RE.test(r.text))) continue;         // no eligibility-bar (or flag off) ⇒ genuinely-read thin binding attachment is covered
      console.warn(`[coverage] read_no_obligation valve REJECTED for "${r.name}" — ELIGIBILITY-BAR language present though obligationsOf found no obligation SENTENCE (verb-less bar); requires a grounded finding → uncovered`);
    }
    const nRegion = norm(r.text);
    // A finding proves this attachment was ANALYZED only if its excerpt is grounded IN the attachment AND is not a
    // coincidental duplicate of a phrase already present in the PRIMARY (a flow-down sentence appearing in both) —
    // else a primary finding could falsely certify an unanalyzed attachment (a false COMPLETE, the dangerous direction).
    // Card #372 PIECE B — COVERAGE KEYS TO VERIFIER OUTCOME: coverage credit requires a VERIFIED, DECISION-BEARING finding.
    // The caller passes the verifier-SURVIVED set (ver.survived — REFUTED findings already removed), so with PIECE A's
    // entailment scope a fabricated real-excerpt/invented-requirement finding is refuted and never reaches here. This
    // filter adds the decision-bearing half: a `dropped` (boilerplate/non-operative) survivor credits NOTHING, so only a
    // finding the engine would actually act on can lift the INCOMPLETE veto. Flag-gated on crossAttGate ⇒ flag-OFF
    // byte-identical (a `dropped` finding still counted before).
    if (findings.some((f) => {
      const ex = norm(analyzedExcerptOf(f) || "");
      if (!(ex.length > 0 && nRegion.includes(ex) && !primaryNorm.includes(ex))) return false;
      if (crossAttGate && disposeFinding(f) === "dropped") return false;   // #372 B — boilerplate/dropped finding is not decision-bearing → credits no coverage
      if (crossAttGate && otherAttNorms.some((o) => o.name !== r.name && o.t.includes(ex))) return false; // excerpt shared with ANOTHER attachment → doesn't prove THIS one analyzed
      return true;
    })) continue;
    const nName = nameKey(r.name);
    if (attSet.has(nName) && readSet.has(nName)) {
      // Brain #347/#348 — a provably-read "no operative obligation" attestation covers the doc, with honesty deferred
      // to the verifier/panel (Gate 4). DETERMINISTIC FLOOR (Gauntlet #349 R2, narrowed by Card #370 R2): an attestation
      // may NEVER suppress a BIDDER-ELIGIBILITY / DISQUALIFIER bar the deterministic detector positively found (clearance/
      // set-aside/size standard/certification/registration/debarment) — the dangerous "model attests a real disqualifier
      // away → false COMPLETE" case. A bare performance "shall not" is NOT such a bar (Card #370 R2) → it no longer fires
      // this floor and routes to Gate-4. If any ELIGIBILITY_BAR_RE hit is present, the attestation is REJECTED (must be
      // GROUNDED, else stays uncovered → INCOMPLETE). Soft over-detections (RFI questions, blank-form field labels) still
      // route to the panel. Always logged — the obligationsOf-vs-attestation contradiction is never silent.
      // Scan the WHOLE region text for eligibility-bar language, NOT just the capped obligationsOf list (which stops at
      // MAX_OBLIGATIONS=200 — a bar past #200 would otherwise be invisible to the floor; Gauntlet #349 R3).
      const hardHit = ELIGIBILITY_BAR_RE.exec(r.text);
      if (!hardHit) { console.log(`[coverage] attestation honored for "${r.name}" — provably-read, no hard-bar obligation (obligationsOf soft-detected ${obs.length}; honesty = verifier/panel gate)`); continue; }
      console.warn(`[coverage] attestation REJECTED for "${r.name}" — HARD-BAR language present ("${hardHit[0].slice(0, 90)}"); requires a grounded finding, not an attestation → uncovered`);
    }
    uncovered.push(r.name);
  }
  return { complete: uncovered.length === 0, uncovered };
}

// B3 (Brain card 421 Fork-3) — NOTICE-BODY deterministic ELIGIBILITY-BAR floor. documentsCovered runs ELIGIBILITY_BAR_RE
// ONLY on non-primary binding ATTACHMENTS (`if (r.isPrimary) continue`), so a hard bidder-eligibility / disqualifier bar
// stated in the SAM NOTICE BODY — a MANDATORY pre-proposal site visit that gates eligibility, a set-aside, a clearance —
// is invisible to the floor whenever the notice body is resolved as the PRIMARY region (synopsis-only / ITO notices) or
// the package is single-region (documentsCovered short-circuits COMPLETE at regions.length<=1). The site-visit arm lives
// INSIDE ELIGIBILITY_BAR_RE but only ran attachment-scoped — this is the notice-body extension (Card #421 Fork-3).
// BOUNDED: scans ONLY the "SAM Notice Body" region, never the whole primary solicitation PDF (that would OVER_ABSTAIN on
// incidental "eligible"/"secret"/"set aside" prose). Direction = FAIL-TOWARD-DISQUALIFIER: an ELIGIBILITY_BAR_RE hit that
// NO grounded, decision-bearing finding already covers forces INCOMPLETE (→ NEEDS_HUMAN_REVIEW, the safe abstain — never
// a committal (Gauntlet WRONG_VERDICT=0), never a silent clean BID (UNDER_ABSTAIN=0)). The grounded-finding escape hatch
// is the OVER_ABSTAIN control: if the engine already surfaced the bar as a decision-bearing finding, the verdict path
// owns it and the floor stays silent. Benign notice bodies (site-visit ENCOURAGED-not-required, informational BOA/holder
// mentions) do not match ELIGIBILITY_BAR_RE's mandatory-attendance / socioeconomic-set-aside arms → floor never fires.
// Own flag AUDIT_NOTICE_BODY_ELIG_FLOOR; OFF ⇒ never called ⇒ byte-identical (Rule 61). Pure → gate-tested.

// Card #509 (Brain-ratified, flag AUDIT_SIZE_STANDARD_SELF_CERT default-OFF) — a BARE NAICS size-standard statement is
// bidder-self-determinable (SBA self-cert via FAR 52.212-3 reps & certs). It must DEMOTE to a coverage caveat on a
// committal verdict — never drive a verdict-blocking notice-body NHR bar (the CERT-10 seq-1 FA303026Q0020 false-punt:
// "the small business size standard is no greater than $13 million." mis-typed as a firm-only eligibility bar).
//
// DOCTRINE (Brain, engine-wide, PERMANENT — card #515): no release/demotion decision may rest on a BLOCKLIST of bar
// vocabulary (v1 used COUPLED_BAR_SUBSTANCE_RE and leaked on every unenumerated bar — NADCAP/ITAR/TAA/… — the #507
// treadmill). SHAPE ALLOWLIST ONLY; ambiguity fails toward ESCALATION (NHR), never toward demotion. isBareSizeStandard-
// Sentence therefore demotes ONLY when the size standard is the sentence's SOLE eligibility-bar substance, decided by
// TWO shape tests (both must pass), NEITHER of which enumerates bar vocabulary:
//   (1) ELIGIBILITY_BAR_RE coverage: run the engine's OWN bar detector over the sentence; EVERY match must overlap a
//       size-standard span. Any non-overlapping bar match → a second bar the engine recognizes → coupled → escalate.
//   (2) Second-obligation shape: outside the size-standard clause, the sentence must carry no OTHER imperative
//       obligation (must/shall/required-to + a non-"meet" action verb, or a bare-imperative "hold/possess/… <noun>").
//       This is a SHAPE signal (a second directed requirement exists), not a bar list — it catches coupled bars whose
//       NOUN is out of ELIGIBILITY_BAR_RE's vocabulary (NADCAP/TAA/Berry/FedRAMP/…), closing the (1)-only residue.
// CARVE-OUT: the generic `eligible`/`eligibility` token co-occurs benignly in a bare sentence ("must be ELIGIBLE under
// the size standard") — it is NOT a second substantive bar and is EXCLUDED from test (1). "ineligible" is NOT carved
// out (it more often marks a real bar) — fail toward escalation. Span-overlap is CHARACTER-RANGE (half-open [s,e)):
// ranges overlap iff s1 < e2 && s2 < e1 — deterministic, position-based (token overlap would need a tokenizer and drift).
const SIZE_STANDARD_RE = /\bsize standard\b/i;
const SIZE_STD_GENERIC_ELIGIBILITY_RE = /^eligib(?:le|ility)$/i;
// Second-obligation SHAPE (test 2) — two POSITION-checked signals, NEITHER a bar-noun list:
//  (a) ACTION-VERB: the closed grammar of solicitation obligation verbs ("you must <do>"). Its presence anywhere
//      outside the size-standard span means the sentence directs a SECOND requirement (hold/obtain/comply/…), so the
//      out-of-vocab coupled bars ELIGIBILITY_BAR_RE cannot see (NADCAP/TAA/Berry/FedRAMP/ISO-27001/…) still escalate.
//      "meet"/"be" are NOT here (they are the size standard's own predicate → would self-trip a bare sentence).
//  (b) BE-OBLIGATION: "must/shall be <X>" where X is NOT a size-standard-benign predicate (small / eligible /
//      responsible / able) — catches copular bars like "must be U.S. citizens" that carry no action verb.
// Both are grammatical SHAPE (a directed obligation exists), not enumerated bars. Ambiguity fails toward escalation.
const SIZE_STD_ACTION_VERB_RE = /\b(?:hold|holds|holding|possess(?:es|ing)?|maintain(?:s|ing)?|obtain(?:s|ing)?|compl(?:y|ies|ying|iant|iance)|conform(?:s|ing)?|register(?:ed|ing|s)?|accredit\w*|certif\w*|licens\w*|clear(?:ed|ance)|pass(?:es|ing|ed)?|provide[sd]?|providing|furnish(?:es|ing|ed)?|satisf(?:y|ies|ying)|attend(?:s|ed|ing|ance)?)\b/i;
const SIZE_STD_BE_OBLIGATION_RE = /\b(?:shall|must|required to|will need to)\s+be\s+(?!(?:an?\s+|the\s+)?(?:small\b|eligible\b|responsible\b|able\b))/i;
// Restriction idiom (test 2c) — the "<class> only" gate shape (e.g. vehicle "holders only", handled end-to-end by its
// own BOA emitter but ALSO surfaced here so a size standard coupled to it never demotes). Idiomatic restriction, not a
// bar noun; short + anchored so it does not span the size clause.
const SIZE_STD_RESTRICTION_RE = /\bholders?\s+only\b|\bonly\s+holders?\b/i;
const SIZE_STANDARD_SELF_CERT_ENABLED = () => process.env.AUDIT_SIZE_STANDARD_SELF_CERT === "true";
export function isBareSizeStandardSentence(sentence: string): boolean {
  if (!SIZE_STANDARD_RE.test(sentence)) return false;
  const sizeSpans = [...sentence.matchAll(new RegExp(SIZE_STANDARD_RE.source, "gi"))].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as [number, number]);
  const overlapsSize = (s: number, e: number) => sizeSpans.some(([ss, se]) => s < se && ss < e);
  // Test (1) — every ELIGIBILITY_BAR_RE match must be the size standard (or the benign generic-eligibility token).
  for (const m of sentence.matchAll(new RegExp(ELIGIBILITY_BAR_RE.source, "gi"))) {
    const s = m.index ?? 0, e = s + m[0].length;
    if (overlapsSize(s, e)) continue;
    if (SIZE_STD_GENERIC_ELIGIBILITY_RE.test(m[0].trim())) continue;
    return false;                                                  // a second recognized bar → coupled → escalate
  }
  // Test (2) — no second imperative obligation outside the size-standard clause (catches out-of-vocab coupled bars).
  for (const re of [SIZE_STD_ACTION_VERB_RE, SIZE_STD_BE_OBLIGATION_RE, SIZE_STD_RESTRICTION_RE]) {
    for (const m of sentence.matchAll(new RegExp(re.source, "gi"))) {
      const s = m.index ?? 0, e = s + m[0].length;
      if (!overlapsSize(s, e)) return false;                       // a directed obligation that is not the size standard → coupled
    }
  }
  return true;                                                     // size standard is the SOLE bar substance → demote
}

// ── Card #516 (Brain CLASS ruling, flag AUDIT_SELF_DETERMINABLE_ELIG_CLASS default-OFF) ─────────────────────────────
// GENERALIZES the §509 size-standard demotion to the FULL BIDDER-STATUS-KNOWABLE eligibility class. The CERT-10 seq-1
// FA303026Q0020 run cycled benign notice-body layers — size standard → WOSB set-aside → SAM registration → a bare
// "eligible" fragment — each a status the firm resolves itself, none a firm-only third-party bar, yet each in
// turn forced a false NHR. Rule the CLASS once instead of chasing one sentence per paid run.
//
// ⚠ NAMING RULING (Brain, 2026-07-23 · seam record 01 · `ceo/SEAM-01-INSTRUMENT-REBUILD.md`). R1 was originally
// described as the "SELF-CERT" class, and that name CONFLATED TWO DIFFERENT THINGS — a blur that hid a live
// false-BID on an 8(a) set-aside (70B01C 999e909b) until the instrument rebuild exposed it:
//   · self-CERTIFIABLE      — the firm EXECUTES the certification itself (WOSB, size standard, SAM, reps & certs)
//   · self-DETERMINABLE     — a THIRD PARTY grants the status, but the firm KNOWS its own standing with certainty
//                             and cannot be mistaken about it (8(a), HUBZone, SDVOSB — SBA/VA-granted)
// The old name implied the first, while the membership list already contained the second ("…self-certifies OR is
// SBA-certified under…"). Anyone reading the name would conclude 8(a) had been mis-filed; anyone reading the list
// would conclude it was deliberate. Both readings were available, which is what made it a blur rather than a bug.
//
// THE DISCRIMINATOR IS **BIDDER-KNOWABILITY**, NOT CERTIFICATION MECHANICS. NHR is justified only where human
// review can ADD INFORMATION. A firm's own 8(a)/HUBZone/SDVOSB standing is known to it with certainty, so
// abstaining adds nothing and manufactures the NHR-on-common-set-asides product failure. Fail-toward-disqualifier
// governs ambiguity about whether a bar EXISTS — here the bar is CERTAIN and bidder-resolvable, which is the
// ratified clears-as-declared shape (set-aside backstop `requiredAttribute` + #575).
// The class is therefore named **BIDDER-STATUS-KNOWABLE**. Behaviour is UNCHANGED by this ruling — it renames and
// documents an existing membership so the blur cannot recur; R2 is untouched.
//   R1 DEMOTE→named-gate caveat (BIDDER-STATUS-KNOWABLE): socioeconomic set-aside/program the firm self-certifies
//      OR is SBA/VA-certified under and knows its own standing in
//      (WOSB/EDWOSB/HUBZone/SDVOSB/veteran-/women-/service-disabled-owned/8(a)/small-business set-aside) · SAM
//      registration (FAR 52.204-7, self-executed) · reps & certs (FAR 52.212-3, offeror-completed) · size standard.
//      The emitted caveat MUST NAME the specific gate (e.g. "SBA-certified 8(a) participant per FAR 52.219-18"),
//      never a generic "confirm eligibility" — pinned by `requireNamedGate` in `_shadow-acceptance-corpus.ts`.
//   R2 RESERVE floor-NHR for bars that are NOT bidder-knowable — a third party must investigate, adjudicate, or
//      grant, so the firm genuinely cannot answer: security/facility clearance · mandatory (unconcluded)
//      site visit · vehicle/BOA holder-only · ITAR/export · QPL/facility certification. These stay firm_cannot_move.
//      TEST FOR MEMBERSHIP: ask "can the bidder answer this today with certainty?" — not "who issues the paper?"
//   R3 the floor never RE-escalates a sentence already resolved as structured RECORD METADATA (`set_aside`) — the
//      platform header already displays it; re-flagging it "needs human review" is doubly incoherent.
//   R4 ALLOWLIST-OF-SHAPE only (the closed, statutory set of self-cert substances) — NEVER a bar-vocabulary blocklist
//      (the #507/#515 treadmill). Ambiguity FAILS TOWARD ESCALATION (NHR), never toward demotion.
// SAME two position-checked shape tests as isBareSizeStandardSentence (both must pass), now over the UNION of
// self-determinable substance spans instead of the size-standard span alone.
const SELF_DET_CLASS_ENABLED = () => process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS === "true";
// The closed socioeconomic set-aside PROGRAM allowlist (FAR 19 / 13 CFR 121-128). A firm bidding one of these
// self-certifies / is SBA-certified for it — bidder-self-determinable. Position-anchored to the program token so a
// clearance/ITAR/QPL sentence never matches (those are NOT socioeconomic programs).
const SETASIDE_PROGRAM_RE = /\b(?:small[\s-]?business|hubzone|sdvosb|wosb|edwosb|8\s?\(?a\)?|service[\s-]?disabled(?:[\s-]?veteran[\s-]?owned)?|women[\s-]?owned|veteran[\s-]?owned|economically[\s-]?disadvantaged)[\s\w%,()\-]{0,45}?set[\s-]?aside\b|\bset[\s-]?aside\b[\s\w%,()\-]{0,25}?(?:small[\s-]?business|concern|program|hubzone|sdvosb|wosb|edwosb|women[\s-]?owned|veteran[\s-]?owned|service[\s-]?disabled|8\s?\(?a\)?)\b|\b(?:hubzone|sdvosb|wosb|edwosb)\b|\b8\s?\(?a\)?\b/i;
// Reps & certs (FAR 52.212-3) — the offeror self-completes these; not a third-party gate.
const REPS_CERTS_RE = /\brepresentations?\s+and\s+certifications?\b|\breps?\s+(?:and|&)\s+certs?\b|\b52\.212[\s.\-]?3\b/i;
// SAM presence token — a "registration/registered" bar is bidder-self-determinable ONLY when it names SAM / the System
// for Award Management (FAR 52.204-7). A bare "must be registered" WITHOUT SAM stays ambiguous → escalates (R4).
const SAM_TOKEN_RE = /\bsam(?:\.gov)?\b|\bsystem\s+for\s+award\s+management\b/i;
const REGISTRATION_TOKEN_RE = /\bregistr(?:ation|ations)\b|\bregister(?:ed|ing|s)?\b/i;
// The bare socioeconomic PROGRAM tokens (ELIGIBILITY_BAR_RE sometimes matches only "service-disabled" / "veteran-owned"
// when the "…set-aside" tail overflows its {0,20} gap). Recognized as self-determinable ONLY inside a sentence that is
// itself a set-aside (SETASIDE_PROGRAM_RE) — a socioeconomic program is a self-cert status, never a third-party gate.
const SOCIO_TOKEN_RE = /\b(?:hubzone|sdvosb|wosb|edwosb|8\s?\(?a\)?|service[\s-]?disabled(?:[\s-]?veteran[\s-]?owned)?|women[\s-]?owned|veteran[\s-]?owned|economically[\s-]?disadvantaged|small[\s-]?business)\b/i;
// Classify ONE ELIGIBILITY_BAR_RE match (in the context of its SENTENCE, by CHARACTER POSITION) as bidder-self-
// determinable. Per-match SHAPE allowlist; anything not clearly self-determinable is UNCLASSIFIED → test (1) escalates.
// The SAM arm keys off a registration token in the MATCH plus a SAM token in a TIGHT WINDOW around the match — NOT
// anywhere in the sentence: a "must be registered with the DDTC under ITAR" clause in a sentence that ALSO names SAM
// elsewhere must NOT borrow that distant SAM to demote itself (the DDTC/ITAR-registration leak). The window is generous
// enough to reach a trailing "… registration in SAM" / "… in the System for Award Management".
function isSelfDeterminableBarText(matchText: string, sentence: string, matchStart: number, matchEnd: number): boolean {
  const t = matchText.trim();
  if (SIZE_STANDARD_RE.test(t)) return true;
  if (SETASIDE_PROGRAM_RE.test(t)) return true;
  if (REPS_CERTS_RE.test(t)) return true;
  if (SOCIO_TOKEN_RE.test(t) && SETASIDE_PROGRAM_RE.test(sentence)) return true;    // bare socio token in a set-aside sentence
  if (REGISTRATION_TOKEN_RE.test(t)) {                                              // SAM registration (FAR 52.204-7) — proximity-gated
    // TIGHT window for the 3-letter "sam" (ambiguous — must be directly bound: "registration in SAM", "SAM registration",
    // "registered in SAM"). A DISTANT sam ("shall be registered under ITAR in SAM") is NOT borrowed → escalates (R4).
    const tightWin = sentence.slice(Math.max(0, matchStart - 12), matchEnd + 14);
    if (/\bsam(?:\.gov)?\b/i.test(tightWin)) return true;
    // The full phrase "System for Award Management" is unambiguous (no other registry bears that name) → wider window ok.
    const wideWin = sentence.slice(Math.max(0, matchStart - 12), matchEnd + 42);
    if (/\bsystem\s+for\s+award\s+management\b/i.test(wideWin)) return true;
  }
  return false;                                                                    // generic-eligible handled separately
}
// TEST (3) — THIRD-PARTY-AGENT SHAPE (positive escalation signal; the red-team #516 leak-plug). A bidder-self-
// determinable sentence has the OFFEROR as the SOLE actor: it self-certifies, self-registers, self-completes. A
// THIRD-PARTY GATE has an EXTERNAL actor act ON the firm/facility/personnel/product — inspect · validate · assess ·
// adjudicate · enroll · vet · screen · accredit · authorize · badge · a "<verb> … by/from <external actor>" agent
// clause · a named third-party artifact (QPL). ELIGIBILITY_BAR_RE cannot SEE most of these (out-of-vocabulary), and
// TEST (1)/(2) only catch bars it enumerates — so WITHOUT this test a real third-party bar coupled to a self-cert
// token ("WOSB set-aside; the facility is inspected by DCSA") would DEMOTE. This is a SHAPE (external-actor grammar),
// NOT a bar-vocabulary blocklist — it is the doctrine's allowlist inverted (the offeror-as-sole-actor allowlist), and
// ambiguity fails toward ESCALATION. Applied only OUTSIDE the self-cert substance spans (a self-cert "register/certify"
// lives inside a span and is exempt).
const THIRD_PARTY_ADJUDICATION_RE = /\b(?:inspect|validat|assess|adjudicat|adjudg|enroll|vett|vetted|screen|surveil|accredit|authoriz|badg|credential|examin|sponsor|endors|vouch|walk[\s-]?through|walkthrough)\w*\b/i;
const THIRD_PARTY_ARTIFACT_RE = /\bqpl\b|\bqualified\s+products?\s+list\b|\bapproved\s+products?\s+list\b/i;
// "<adjudication/grant verb> … by|from <EXTERNAL actor>" — the agent is a gatekeeper, not the offeror and not a benign
// temporal/logistics "by <date/closing/email>". Self-references + benign followers are excluded so a self-cert
// ("registered in SAM by the closing date", "certs completed by the offeror") does NOT trip it.
const THIRD_PARTY_BY_AGENT_RE = /\b(?:approv|grant|issu|determin|qualif|list|process|clear|verif|certif|register|review|evaluat|accept|adjudicat|authoriz|inspect|validat|assess)\w*\s+(?:[\w,/:.\-]+\s+){0,3}?(?:by|from)\s+(?!(?:the\s+|a\s+|an\s+)?(?:offeror|offerors|contractor|contractors|firm|firms|quoter|quoters|vendor|vendors|bidder|bidders|you|itself|themselves|applicant|awardee|closing|close|deadline|due|award|submission|no\s+later|end\b|then|the\s+time|receipt|email|e-mail|letter|mail|hand|fax|website|portal|sam\b)\b)/i;
function hasThirdPartyAgentShape(sentence: string, substanceSpans: Array<[number, number]>): boolean {
  const overlaps = (s: number, e: number) => substanceSpans.some(([ss, se]) => s < se && ss < e);
  for (const re of [THIRD_PARTY_ADJUDICATION_RE, THIRD_PARTY_ARTIFACT_RE, THIRD_PARTY_BY_AGENT_RE]) {
    for (const m of sentence.matchAll(new RegExp(re.source, "gi"))) {
      const s = m.index ?? 0, e = s + m[0].length;
      if (!overlaps(s, e)) return true;   // an external-actor gate outside every self-cert substance → escalate (R4)
    }
  }
  return false;
}

// The generic "eligible/eligibility" token is intrinsically ambiguous — it is BOTH the self-cert anchor AND a benign
// allowlist word, so a govt-conferred / enrollment eligibility phrased in only-benign words ("the Government must have
// completed the eligibility of the offeror", "eligibility with the United States Government", "program eligibility")
// would otherwise DEMOTE. Rather than blocklist the external actors/prepositions (a treadmill — "with"→"under"→"per"→
// "via", "the Government"→"the United States Government"), we INVERT: the token is benign ONLY inside a tight
// SELF-REFERENTIAL shape — the OFFEROR is eligible FOR an award / TO bid / under the size standard / as a small
// business. EVERY OTHER eligibility phrasing is ambiguous → escalate. Closed grammatical allowlist, no actor/prep list.
const SELF_REFERENTIAL_ELIGIBLE_RE = /\bto\s+be\s+eligible\b|\beligible\s+to\s+(?:propose|bid|submit|offer|quote|compete|participate|be\s+considered|receive|be\s+awarded|apply)\b|\beligible\s+for\s+(?:award|an?\s+award|payment|a\s+government\s+contract\b|an?\s+contract\b|the\s+(?:award|contract|acquisition|procurement|solicitation|set[\s-]?aside|reserve))|\beligib(?:le|ility)\b[\s\w,'\-]{0,45}?\bsize\s+standard\b|\bsize\s+standard\b[\s\w,'\-]{0,45}?\beligib|\beligible\s+small\s+business\b|\beligible\s+(?:concern|offeror|small\s+business\s+concern)s?\b/i;
function hasUngovernedEligibility(sentence: string, substanceSpans: Array<[number, number]>): boolean {
  const overlaps = (s: number, e: number) => substanceSpans.some(([ss, se]) => s < se && ss < e);
  for (const m of sentence.matchAll(/\beligib(?:le|ility)\b/gi)) {
    const s = m.index ?? 0, e = s + m[0].length;
    if (overlaps(s, e)) continue;                                      // inside a size/set-aside substance span → covered
    const ctx = sentence.slice(Math.max(0, s - 30), e + 58);          // wide enough to reach a trailing "… size standard"
    if (SELF_REFERENTIAL_ELIGIBLE_RE.test(ctx)) continue;              // self-referential ("eligible for award / to bid …") → benign
    return true;                                                       // any other eligibility phrasing → ambiguous → escalate
  }
  return false;
}

// ── TEST (4) — POSITIVE-COVERAGE (the durable, non-treadmill guard; red-team R2). ──────────────────────────────────
// The blocklist trap (TEST 3 leaked on NOUN-form adjudications / conditional connectives it did not enumerate) is
// closed here by INVERSION: instead of listing what is a bar, we list what is KNOWN-BENIGN (grammar + procurement
// boilerplate + the offeror's OWN self-cert actions), MASK the recognized self-cert substance spans, and require every
// SURVIVING word to be on that closed allowlist. ANY residual content word — "clearance", "DCSA", "investigation",
// "QPL", "ITAR", "determination", "walkthrough", a brand-new bar noun nobody has seen — is by definition not on the
// benign allowlist → the sentence carries an eligibility element we cannot positively vouch as self-cert → ESCALATE
// (R4 ambiguity-fails-toward-escalation). New bars need NO new code: they are content-by-default. Numbers/money/dates
// are ignored (a size-standard threshold "$13 million" is not "content"). Over-escalation of a legitimate self-cert
// carrying an unlisted benign word is the SAFE direction and is tuned by adding the benign word here, never a bar.
const SELF_CERT_BENIGN_TOKENS = new Set<string>([
  // grammar — determiners · conjunctions · prepositions · pronouns · auxiliaries · subordinators
  "a", "an", "the", "this", "that", "these", "those", "is", "are", "was", "were", "be", "been", "being", "am",
  "to", "for", "of", "in", "on", "at", "as", "by", "with", "and", "or", "not", "no", "nor", "its", "their", "it",
  "they", "them", "you", "your", "our", "under", "per", "via", "if", "then", "so", "than", "each", "all", "any",
  "who", "which", "whose", "when", "where", "will", "shall", "must", "may", "should", "can", "would", "do", "does",
  "up", "out", "into", "within", "upon", "prior", "before", "after", "time", "times",
  // procurement subjects / actors (the bidder side)
  "offeror", "offerors", "contractor", "contractors", "firm", "firms", "quoter", "quoters", "vendor", "vendors",
  "bidder", "bidders", "concern", "concerns", "business", "businesses", "company", "companies", "applicant",
  "applicants", "awardee", "awardees", "entity", "entities", "party", "parties", "participant", "participants",
  "government", "agency", "united", "states", "usg",
  // procurement boilerplate nouns
  "acquisition", "procurement", "requirement", "requirements", "solicitation", "solicitations", "rfq", "rfp", "ifb",
  "award", "awards", "contract", "contracts", "order", "orders", "offer", "offers", "quote", "quotes", "proposal",
  "proposals", "bid", "bids", "response", "responses", "submission", "submissions", "due", "closing", "deadline",
  "receipt", "naics", "code", "codes", "program", "programs", "type", "basis", "status", "purpose", "notice",
  // benign regulatory-reference tokens (a self-cert clause cites its authority)
  "far", "dfars", "cfr", "clause", "clauses", "provision", "provisions", "paragraph", "paragraphs", "section",
  "sections", "accordance", "iaw", "herein", "hereof", "part", "subpart", "usc", "far's",
  // benign URL / DOMAIN artifacts (Brain card #518 R1) — a SAM-registration sentence carries its portal address
  // ("… active registration in the System for Award Management (SAM) database at http://www.sam.gov"); a URL is NEVER
  // an eligibility bar, so these are the safe stoplist direction. URL/DOMAIN ARTIFACTS ONLY — 'at' and generic
  // prepositions are handled as grammar stopwords above (never added as content-vouching tokens; wrong fail direction).
  "http", "https", "www", "gov", "mil", "url", "website", "portal", "database", "sam.gov", "sam.gov.",
  // self-cert SUBSTANCE vocabulary (size · set-aside · SAM · reps-certs · eligibility)
  "standard", "standards", "size", "small", "set", "aside", "setaside", "women", "owned", "woman", "veteran",
  "veterans", "service", "disabled", "economically", "disadvantaged", "hubzone", "wosb", "edwosb", "sdvosb", "vosb",
  "total", "competitive", "partial", "unrestricted", "eligibility", "eligible", "ineligible", "eligibility",
  "registration", "registrations", "registered", "register", "sam", "gov", "system", "management", "certification",
  "certifications", "certified", "certify", "representation", "representations", "represent", "reps", "certs",
  "dollar", "dollars", "usd", "million", "billion", "thousand", "employees", "employee", "receipts", "annual",
  "average", "greater", "less", "fewer", "more", "threshold", "applicable", "designated", "self",
  // self-cert ACTIONS (offeror acting on ITSELF) — objects of a third-party gate are NOT here, so they stay content
  "meet", "meets", "meeting", "have", "has", "having", "hold", "holds", "holding", "maintain", "maintains",
  "maintaining", "complete", "completes", "completed", "submit", "submits", "submitted", "provide", "provides",
  "acknowledge", "acknowledges", "qualify", "qualifies", "sign", "signed", "active", "current", "valid",
]);
function positivelySelfCertCovered(sentence: string, substanceSpans: Array<[number, number]>): boolean {
  // Mask the recognized self-cert substance spans → spaces, so their (possibly non-benign-looking) internals do not
  // count as residual content.
  const chars = sentence.split("");
  for (const [s, e] of substanceSpans) for (let i = s; i < e && i < chars.length; i++) chars[i] = " ";
  const masked = chars.join("").toLowerCase();
  // Every surviving ALPHA word (≥3 letters; numbers/money/dates already skipped) must be on the benign allowlist.
  for (const m of masked.matchAll(/[a-z][a-z'\-]*/gi)) {
    const w = m[0].replace(/[^a-z]/g, "");
    if (w.length < 3) continue;
    if (!SELF_CERT_BENIGN_TOKENS.has(w)) return false;   // residual content the allowlist does not vouch → escalate
  }
  return true;
}
// AFFILIATION carve-out (Brain card #517 ruling #3, 13 CFR 121.103) — affiliation / ostensible-subcontractor / identity-
// of-interest is NOT cleanly bidder-self-determinable (a firm routinely misjudges its own affiliation; it is the #1 SBA
// size-protest killer). A sentence carrying this class must ESCALATE and may never ride the size-standard or
// self-determinable demotion. POSITIVE ESCALATION signal (fail-safe — over-inclusion only escalates more); an explicit
// auditable belt on top of TEST(4) positive coverage, NOT a demotion blocklist.
const AFFILIATION_RE = /\baffiliat(?:e|es|ed|ing|ion|ions)\b|\bostensible\s+subcontractor\b|\bidentity\s+of\s+interest\b/i;
export function isBidderSelfDeterminableSentence(sentence: string, declaredSetAside?: string | null): boolean {
  if (AFFILIATION_RE.test(sentence)) return false;                 // 13 CFR 121.103 affiliation → not self-determinable → escalate
  // Substance spans = the UNION of self-determinable substances present in the sentence (allowlist-of-shape).
  const spans: Array<[number, number]> = [];
  const collect = (re: RegExp) => { for (const m of sentence.matchAll(new RegExp(re.source, "gi"))) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]); };
  collect(SIZE_STANDARD_RE);
  collect(SETASIDE_PROGRAM_RE);
  collect(REPS_CERTS_RE);
  // Add self-determinable ELIGIBILITY_BAR_RE match spans (tight, verb-inclusive) + record which bars are self-det/generic.
  const bars: Array<{ s: number; e: number; selfDet: boolean; generic: boolean }> = [];
  for (const m of sentence.matchAll(new RegExp(ELIGIBILITY_BAR_RE.source, "gi"))) {
    const s = m.index ?? 0, e = s + m[0].length;
    const generic = SIZE_STD_GENERIC_ELIGIBILITY_RE.test(m[0].trim());
    const selfDet = isSelfDeterminableBarText(m[0], sentence, s, e);
    bars.push({ s, e, selfDet, generic });
    if (selfDet && !generic) spans.push([s, e]);
  }
  const overlaps = (s: number, e: number) => spans.some(([ss, se]) => s < se && ss < e);
  // R3 — the record already resolved this as `set_aside` metadata: a set-aside-naming sentence is a restatement of a
  // field the platform already displays, never a firm-only bar (belt to R1's shape allowlist; cannot demote a clearance
  // because SETASIDE_PROGRAM_RE only matches socioeconomic programs, never a clearance/ITAR/QPL).
  const r3SetAside = !!(declaredSetAside && declaredSetAside.trim()) && SETASIDE_PROGRAM_RE.test(sentence);
  // Gate: demote only a sentence that actually carries a self-determinable substance, OR whose sole bar-signal is the
  // benign generic "eligible/eligibility" token (a self-cert boilerplate fragment), OR an R3 set-aside restatement.
  const hasSubstance = spans.length > 0;
  const allBarsGeneric = bars.length > 0 && bars.every((b) => b.generic);
  if (!hasSubstance && !allBarsGeneric && !r3SetAside) return false;
  // TEST (1) — every ELIGIBILITY_BAR_RE match is self-determinable (overlaps a substance span) or the generic token.
  for (const b of bars) {
    if (b.generic) continue;
    if (b.selfDet && overlaps(b.s, b.e)) continue;
    return false;                                                  // a bar the allowlist does not recognize → escalate
  }
  // TEST (2) — no second imperative obligation outside the substance spans (catches out-of-vocab coupled bars, e.g.
  // "meet the size standard and provide Berry-Amendment textiles"). Identical SHAPE grammar as the §509 predicate.
  for (const re of [SIZE_STD_ACTION_VERB_RE, SIZE_STD_BE_OBLIGATION_RE, SIZE_STD_RESTRICTION_RE]) {
    for (const m of sentence.matchAll(new RegExp(re.source, "gi"))) {
      const s = m.index ?? 0, e = s + m[0].length;
      if (!overlaps(s, e)) return false;
    }
  }
  // TEST (3) — no THIRD-PARTY-AGENT gate outside the substance spans (fast verb/artifact SHAPE catch; defense-in-depth).
  if (hasThirdPartyAgentShape(sentence, spans)) return false;
  // TEST (3.5) — no UNGOVERNED eligibility token: the generic "eligible/eligibility" is benign only self-referentially
  // ("eligible for award / to bid / under the size standard"); any govt-conferred or enrollment eligibility escalates.
  if (hasUngovernedEligibility(sentence, spans)) return false;
  // TEST (4) — POSITIVE COVERAGE (the durable guard): every word surviving the self-cert mask must be on the closed
  // benign allowlist. A residual content word (any bar noun, named or unnamed) → escalate. Closes the noun-form /
  // conditional-connective / orphaned-actor leaks TEST(3) could not enumerate without becoming a treadmill.
  if (!positivelySelfCertCovered(sentence, spans)) return false;
  return true;                                                     // every bar + obligation is bidder-self-determinable → demote
}
// Unified gate: which demotion predicate the notice-body floor consults, given the two independent flags. The CLASS
// flag (card #516) is a strict SUPERSET of the §509 size-standard flag; when it is off we fall back to the size-only
// predicate so the currently-armed AUDIT_SIZE_STANDARD_SELF_CERT behaviour is unchanged. Both off ⇒ returns false ⇒
// the floor is byte-identical to pre-card-509 (Rule 61).
function isSelfCertDemotableSentence(sentence: string, declaredSetAside?: string | null): boolean {
  if (SELF_DET_CLASS_ENABLED()) return isBidderSelfDeterminableSentence(sentence, declaredSetAside);
  if (SIZE_STANDARD_SELF_CERT_ENABLED()) return isBareSizeStandardSentence(sentence);
  return false;
}

export function noticeBodyEligibilityUngrounded(fullSource: string, findings: TypedFinding[], noticeBodyText?: string | null, declaredSetAside?: string | null): boolean {
  // Prefer the EXPLICIT notice-body text (delimiter-independent). The assembled fullSource DROPS the
  // "==== DOCUMENT: … ====" delimiter for a single-doc package (assembleFullSource writes it only when docs>1), so a
  // SYNOPSIS-ONLY notice collapses to one unnamed "(primary solicitation)" region and would be unfindable by name →
  // UNDER_ABSTAIN on the charter case. The executor passes noticeBody.text through ctx; region-by-name is the fallback
  // for the delimited multi-doc package (and the unit tests). BOUNDED either way — only the notice-body text is scanned.
  const noticeText = (noticeBodyText && noticeBodyText.trim())
    ? noticeBodyText
    : (docRegions(fullSource).find((r) => r.name === NOTICE_BODY_DOC_NAME)?.text ?? "");
  if (!hasEngineText(noticeText)) return false;                          // no notice-body text / unreadable → nothing to floor
  const nNotice = norm(noticeText);                                      // regex + excerpt spans share this coordinate space
  // Decision-bearing (non-`dropped`) findings grounded IN the notice body, as [start,end) spans over nNotice. A finding
  // COVERS a bar only when its grounded span OVERLAPS the bar's matched span — so a benign decision-bearing finding
  // grounded ELSEWHERE in the notice can never mask an eligibility bar (the UNDER_ABSTAIN=0 guarantee). A `dropped`
  // (boilerplate) finding is not decision-bearing and credits nothing (mirrors documentsCovered #372 B).
  const covering: Array<[number, number]> = [];
  for (const f of findings) {
    if (disposeFinding(f) === "dropped") continue;
    const ex = norm(analyzedExcerptOf(f) || "");
    if (!ex) continue;
    const s = nNotice.indexOf(ex);
    if (s >= 0) covering.push([s, s + ex.length]);
  }
  // EVERY eligibility-bar occurrence must be covered by an overlapping decision-bearing finding; ANY ungrounded bar →
  // fail-toward-disqualifier. Global scan (not just the first hit) so a second, unsurfaced bar is never masked. Bias =
  // fire (abstain): OVER_ABSTAIN is a reduction target, UNDER_ABSTAIN is a hard zero. ELIGIBILITY_BAR_RE is bounded-
  // quantifier (ReDoS-reviewed); a global clone is linear over the notice text.
  const scan = new RegExp(ELIGIBILITY_BAR_RE.source, "gi");
  for (const m of nNotice.matchAll(scan)) {
    const hs = m.index ?? 0, he = hs + m[0].length;
    if (!covering.some(([s, e]) => s < he && hs < e)) {
      // Card #509/#516 — an ungrounded match whose ENCLOSING SENTENCE is BIDDER-SELF-DETERMINABLE (a bare size standard,
      // a socioeconomic set-aside the firm self-certifies, SAM registration, reps & certs, or a bare generic-eligible
      // fragment) is NOT a firm-only bar: it does NOT count as an ungrounded eligibility bar (routes to a self-cert
      // caveat via emitSelfDeterminableCaveats/emitSizeStandardCaveats instead). Sentence-precise (not a window) so a
      // real third-party bar elsewhere in the notice can never be masked. Both flags OFF ⇒ this branch never runs ⇒
      // byte-identical (Rule 61).
      {
        let ss = hs; while (ss > 0 && !".!?".includes(nNotice[ss - 1])) ss--;
        let se = he; while (se < nNotice.length && !".!?".includes(nNotice[se])) se++;
        if (isSelfCertDemotableSentence(nNotice.slice(ss, se), declaredSetAside)) continue;
      }
      console.warn(`[coverage] notice-body ELIGIBILITY-BAR floor: ungrounded bar in "${NOTICE_BODY_DOC_NAME}" ("${m[0].slice(0, 90)}") → fail-toward-disqualifier (INCOMPLETE)`);
      return true;
    }
  }
  return false;
}

// D2-B (Brain card 441, flag AUDIT_NOTICE_BODY_ELIG_FLOOR — the SAME revert unit as noticeBodyEligibilityUngrounded above).
// The detector returns a BOOLEAN (routes NHR) but emits NO finding, so the B3-severity floor (siteVisitEligStoppers,
// audit-decide.ts) has nothing in dispositions[] to promote → an ungrounded notice-body eligibility/site-visit bar buries
// as a P2 "advisory" instead of a bid-deciding show-stopper. This is the missing SIBLING to emitSetAsideNoticeFindings:
// emit ONE grounded eligibility-bar finding per UNGROUNDED bar span so the floor has a disqualifier to promote.
//   RULED CONDITION (Brain card 441, LOAD-BEARING): at most ONE finding per bar span, and a span already covered by a
//   decision-bearing finding is NEVER re-emitted — double-promotion inflating showStoppers[] is the over-fire class.
// Reuses the detector's EXACT notice-text resolution + covering-overlap logic (same nNotice coordinate space), so the
// emitter and the detector agree on which spans are ungrounded. requiredAttribute is intentionally UNSET (a completed
// site visit / notice-body bar is not firm-clearable) → firmStatus stays "unknown" → the floor promotes it (over-tag =
// a recoverable NHR conditional bar; under-tag = a buried show-stopper). Pure → gate-tested. Flag off ⇒ never called
// (gated on noticeBodyBarUngrounded at the call site) ⇒ byte-identical (Rule 61).
const NOTICE_SITE_VISIT_RE = /\bsite[\s-]?(?:visit|tour|inspection)\b|\bjob[\s-]?walk\b|\bpre[\s-]?(?:proposal|bid)\s+(?:conference|meeting)\b|\bwalk[\s-]?(?:through|thru)\b/i;
const NOTICE_CLEARANCE_RE = /\bclearance\b|\bclassified\b|\btop[\s-]?secret\b|\bts[\s/]?sci\b|\bsecret\b/i;
// SITE_VISIT_CONCLUDED_RE (the SAM-body / UPDATE-line held/concluded/closed past-marker) is the SHARED contract
// regex imported from audit-site-visit-patterns — the SAME one the B3-severity guard (audit-decide) recognizes,
// so the emitter's conditional-concluded frame and the guard's promotion never drift (card #453/#454).
const NOTICE_EVENT_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/i;
// BROADER date matcher for the single-visit guard's date-count ONLY (not display) — ALSO catches the day-first
// "15 August 2026" military/SAM format the display regex misses, so two visits stated in different date formats
// still count as two (Gate-2: undercounting dates re-enabled the multi-visit mis-frame). Over-counting is the safe
// direction (fallback off → human review), so a permissive date detector here can only fail toward not-reframing.
const SV_GUARD_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/i;
export function emitNoticeBodyEligBarFindings(fullSource: string, findings: TypedFinding[], noticeBodyText?: string | null, declaredSetAside?: string | null): TypedFinding[] {
  const noticeText = (noticeBodyText && noticeBodyText.trim())
    ? noticeBodyText
    : (docRegions(fullSource).find((r) => r.name === NOTICE_BODY_DOC_NAME)?.text ?? "");
  if (!hasEngineText(noticeText)) return [];
  const nNotice = norm(noticeText);
  // covering = decision-bearing (non-`dropped`) findings grounded IN the notice body, as [start,end) spans over nNotice.
  const covering: Array<[number, number]> = [];
  for (const f of findings) {
    if (disposeFinding(f) === "dropped") continue;
    const ex = norm(analyzedExcerptOf(f) || "");
    if (!ex) continue;
    const s = nNotice.indexOf(ex);
    if (s >= 0) covering.push([s, s + ex.length]);
  }
  // Expand a match to its enclosing SENTENCE (bounded by .!? in the SAME nNotice coordinate space). ELIGIBILITY_BAR_RE's
  // bare "\beligib" arm matches a lone token; the sentence is the meaningful, still-verbatim grounded excerpt, and it lets
  // the site-visit / clearance classification read real content. Dedup on the sentence span ⇒ multiple bar hits inside one
  // sentence collapse to ONE finding (the ruled "at most one finding per bar span").
  const sentenceSpan = (at: number): [number, number] => {
    let s = at; while (s > 0 && !".!?".includes(nNotice[s - 1])) s--;
    let e = at; while (e < nNotice.length && !".!?".includes(nNotice[e])) e++;
    return [s, e < nNotice.length ? e + 1 : e];
  };
  const out: TypedFinding[] = [];
  const emitted: Array<[number, number]> = [];
  const seenExcerpt = new Set<string>();
  // SINGLE-VISIT guard for the notice-wide concluded fallback: the fallback may only attribute a lone concluded
  // marker to a bar when the notice describes exactly ONE site visit — else a multi-visit notice (one concluded +
  // one upcoming) would be mis-framed. Counting bar SENTENCES alone undercounts (a concluded visit narrated as a
  // plain UPDATE line is not itself an eligibility-bar sentence — Gate-2 finding), so the guard ALSO keys off
  // DISTINCT site-visit EVENT DATES across bar sentences AND concluded markers: two different dates ⇒ two visits.
  const svBarSpans = new Set<string>();
  const svDates = new Set<string>();
  for (const m of nNotice.matchAll(new RegExp(ELIGIBILITY_BAR_RE.source, "gi"))) {
    const [s, e] = sentenceSpan(m.index ?? 0);
    const sent = nNotice.slice(s, e);
    if (NOTICE_SITE_VISIT_RE.test(sent)) { svBarSpans.add(`${s}:${e}`); const d = SV_GUARD_DATE_RE.exec(sent); if (d) svDates.add(d[0].toLowerCase()); }
  }
  for (const m of nNotice.matchAll(new RegExp(SITE_VISIT_CONCLUDED_RE.source, "gi"))) {
    const [s, e] = sentenceSpan(m.index ?? 0);
    const d = SV_GUARD_DATE_RE.exec(nNotice.slice(s, e)); if (d) svDates.add(d[0].toLowerCase());
  }
  // ≤1 site-visit bar AND ≤1 distinct site-visit date. Over-counting dates (same date, two formats) only makes the
  // guard MORE conservative (fallback off → routes to human review via the severity floor) — the safe direction.
  const singleSiteVisit = svBarSpans.size <= 1 && svDates.size <= 1;
  const scan = new RegExp(ELIGIBILITY_BAR_RE.source, "gi");
  for (const m of nNotice.matchAll(scan)) {
    const [ss, se] = sentenceSpan(m.index ?? 0);
    if (covering.some(([s, e]) => s < se && ss < e)) continue;     // owned by a decision-bearing finding → do NOT re-emit
    if (emitted.some(([s, e]) => s < se && ss < e)) continue;      // at most ONE finding per bar span/sentence (ruled dedup)
    const excerpt = nNotice.slice(ss, se).trim().slice(0, 240);
    if (!excerpt || seenExcerpt.has(excerpt)) continue;            // identical bar sentence at another position → one finding
    // Card #509/#516 — a BIDDER-SELF-DETERMINABLE sentence (bare size standard, socioeconomic set-aside, SAM
    // registration, reps & certs, generic-eligible fragment) is never a firm-only bar. The dedicated caveat emitter
    // surfaces it as a gate-to-clear on the committal; skip here so it is never a bar (and not double-emitted). Both
    // flags OFF ⇒ never skips ⇒ byte-identical.
    if (isSelfCertDemotableSentence(excerpt, declaredSetAside)) continue;
    seenExcerpt.add(excerpt);
    emitted.push([ss, se]);
    // COMPLETION (Brain card #453/#454) — for a mandatory-attendance SITE-VISIT bar, if the notice body / UPDATE
    // lines carry a concluded/held/closed past-marker, emit the finding with the TEMPORAL FRAME (event date ·
    // concluded · attendance non-retroactive) and an excerpt that spans BOTH the bar and the concluded marker (a
    // single verbatim span so grounding holds). That correctly-framed finding is PROMOTED as a conditional-concluded
    // show-stopper ("bars award unless attendance confirmed", #432 register); a mis-framed live-sounding lens finding
    // (concluded only in source) stays NOT-promoted by the built guard. Live/upcoming visit → the live-gate frame.
    let requirement: string;
    let outExcerpt = excerpt;
    // Scope the concluded-marker search to a WINDOW around THIS bar sentence (not the whole notice) so a concluded
    // marker for a DIFFERENT, earlier site visit can't mis-frame a separate live/upcoming bar as concluded. The
    // window is generous enough to catch an adjacent SAM-body UPDATE line tied to this bar.
    const WIN = 600;
    const winStart = Math.max(0, ss - WIN);
    const winEnd = Math.min(nNotice.length, se + WIN);
    const windowText = nNotice.slice(winStart, winEnd);
    // Concluded-marker search: the tight ±600 WINDOW first (avoids cross-framing a DIFFERENT visit's marker onto
    // this bar). If the window MISSES and this is a site-visit bar, a NOTICE-WIDE fallback (flag
    // AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE, default-OFF) uses a concluded marker anywhere in the notice — but ONLY
    // when it is UNIQUE (exactly ONE site-visit concluded marker in the whole notice body), so a lone concluded
    // UPDATE line placed far from the original "you must attend" bar (the SAM chronological-UPDATE layout, e.g.
    // FA813726R0033 where "held and concluded May 28" sits >600 chars from the bar) reframes the bar correctly,
    // while a notice carrying two distinct visits (one concluded, one live) never cross-frames. Card #461.
    const windowRel = new RegExp(SITE_VISIT_CONCLUDED_RE.source, "i").exec(windowText);
    let cAbs: number | null = windowRel && windowRel.index != null ? winStart + windowRel.index : null;
    const fromWindow = cAbs != null;
    if (cAbs == null && NOTICE_SITE_VISIT_RE.test(excerpt) && singleSiteVisit && process.env.AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE === "true") {
      const wideMatches = [...nNotice.matchAll(new RegExp(SITE_VISIT_CONCLUDED_RE.source, "gi"))];
      if (wideMatches.length === 1 && wideMatches[0].index != null) cAbs = wideMatches[0].index;
    }
    if (NOTICE_SITE_VISIT_RE.test(excerpt) && cAbs != null) {
      const [cs, ce] = sentenceSpan(cAbs);
      const concludedSentence = nNotice.slice(cs, ce).trim();
      const eventDate = (NOTICE_EVENT_DATE_RE.exec(concludedSentence) || [])[0] || "";
      // Window path: ONE verbatim span covering BOTH bar and marker (they are close). Notice-wide path: the marker is
      // far from the bar, so use the concluded sentence itself as the grounded excerpt (still verbatim in the notice).
      outExcerpt = fromWindow
        ? nNotice.slice(Math.min(ss, cs), Math.max(se, ce)).trim().slice(0, 600)
        : concludedSentence.slice(0, 600);
      // Vehicle F · D1 (flag AUDIT_ELIG_OPERATIVE_EXCERPT, default-OFF) — item E (hasOperativeEligibilityLanguage) keys
      // off the EXCERPT; a bare "held and concluded" recital fails it, so item A leaves the gate unnamed (e63bd1e7 tier-1
      // was 1 of 2). When the notice ALSO carries the OPERATIVE attendance-eligibility sentence ("must attend … to be
      // considered eligible to propose"), prepend it to the grounded excerpt (still verbatim in the notice) so E passes
      // and the gate is named. Flag-OFF ⇒ outExcerpt unchanged ⇒ byte-identical.
      if (process.env.AUDIT_ELIG_OPERATIVE_EXCERPT === "true") {
        const opM = new RegExp(SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i").exec(nNotice);
        if (opM && opM.index != null) {
          const [os, oe] = sentenceSpan(opM.index);
          const opSentence = nNotice.slice(os, oe).trim();
          if (opSentence && !outExcerpt.includes(opSentence)) outExcerpt = `${opSentence} ${outExcerpt}`.slice(0, 600);
        }
      }
      // The requirement ALWAYS carries a CONCLUDED_RE-matchable frame ("site visit … was held/concluded"), with or
      // without a parseable date — the guard keys promotion off this frame, so it must match even when eventDate="".
      requirement = `Mandatory site visit stated in the SAM notice body was held/concluded${eventDate ? ` ${eventDate}` : " (date not stated in the notice)"}; attendance is non-retroactive — this BARS AWARD unless the firm's attendance at the concluded site visit is confirmed (conditional-concluded, not a live gate): "${concludedSentence.slice(0, 200)}"`;
    } else if (NOTICE_SITE_VISIT_RE.test(excerpt)) {
      requirement = `Mandatory site visit / pre-proposal conference stated in the SAM notice body — attendance gates eligibility to propose; verify and plan to attend: "${excerpt}"`;
    } else if (NOTICE_CLEARANCE_RE.test(excerpt)) {
      requirement = `Security/facility clearance stated as an eligibility bar in the SAM notice body — only cleared offerors are eligible; verify the firm holds it: "${excerpt}"`;
    } else {
      requirement = `Eligibility bar stated in the SAM notice body — verify the firm meets it before bidding: "${excerpt}"`;
    }
    out.push({
      requirement,
      citation: NOTICE_BODY_DOC_NAME,
      excerpt: outExcerpt,
      kind: "eligibility_bar",
      controllability: "bidder_cannot_move",
      curableInWindow: false,
      grounded: true,
      lens: "notice_body_elig_detector",
    });
  }
  // B2 (card #461, flag AUDIT_NOTICE_BODY_BOA_EMIT, default-OFF) — SURFACE a BOA/IDIQ/BPA/GWAC vehicle HOLDER-ONLY
  // ordering restriction that ELIGIBILITY_BAR_RE does not carry. An ITO/order against a multiple-award vehicle is
  // competable ONLY by existing holders; a non-holder cannot bid at all — the single most controlling eligibility
  // fact, and the panel's #1 miss on FA813726R0033 ("Tinker AFB - MAC BOA Holders ONLY" 7× in body, 0× in report).
  // Deduped vs spans a decision-bearing lens finding already owns (the B2 keep-class handles THAT one) and vs bars
  // already emitted above. The keep-class (AUDIT_BOA_IDIQ_HOLDER_KEEP) routes the emitted bar to a conditional NHR.
  if (process.env.AUDIT_NOTICE_BODY_BOA_EMIT === "true") {
    const bscan = new RegExp(BOA_HOLDER_ONLY_EMIT_RE.source, "gi");
    for (const m of nNotice.matchAll(bscan)) {
      const [ss, se] = sentenceSpan(m.index ?? 0);
      if (covering.some(([s, e]) => s < se && ss < e)) continue;   // a lens finding already owns it → keep-class covers that one
      if (emitted.some(([s, e]) => s < se && ss < e)) continue;    // already surfaced as an ELIGIBILITY_BAR bar this run
      const excerpt = nNotice.slice(ss, se).trim().slice(0, 240);
      if (!excerpt || seenExcerpt.has(excerpt)) continue;          // identical bar sentence elsewhere → one finding
      seenExcerpt.add(excerpt);
      emitted.push([ss, se]);
      out.push({
        requirement: `Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA/GWAC/MAS) stated in the SAM notice body — this ITO/order can only be proposed by an existing holder of the underlying vehicle; a firm that does not hold it CANNOT bid. Confirm the firm holds the vehicle before pursuing: "${excerpt}"`,
        citation: NOTICE_BODY_DOC_NAME,
        excerpt,
        kind: "eligibility_bar",
        controllability: "bidder_cannot_move",
        curableInWindow: false,
        grounded: true,
        lens: "notice_body_boa_holder_detector",
      });
      break; // the holder-only gate is BINARY (hold the vehicle or not) — one grounded finding, not N restatements.
    }
  }
  return out;
}

/** Card #509 (Brain-ratified, flag AUDIT_SIZE_STANDARD_SELF_CERT default-OFF) — surface a BARE NAICS size-standard
 *  statement in the SAM notice body as a bidder-self-determinable gate-to-clear CAVEAT (controllability
 *  bidder_controls ⇒ NOT a bar-class finding, never a show-stopper, never downgrades the verdict) so it rides a
 *  committal as a reps-&-certs self-cert reminder — instead of the notice-body floor mis-typing it as a firm-only
 *  eligibility bar → false NHR. Bare ONLY (isBareSizeStandardSentence): a size standard coupled to another substantive
 *  bar is left to the bar path. Dedups against decision-bearing findings that already own the span (no double surface).
 *  Reuses the emitter's EXACT notice-text resolution + covering logic (same nNotice coordinate space). Pure →
 *  gate-tested. Flag-OFF ⇒ never called (gated at the call site) ⇒ byte-identical (Rule 61). */
export function emitSizeStandardCaveats(fullSource: string, findings: TypedFinding[], noticeBodyText?: string | null): TypedFinding[] {
  const noticeText = (noticeBodyText && noticeBodyText.trim())
    ? noticeBodyText
    : (docRegions(fullSource).find((r) => r.name === NOTICE_BODY_DOC_NAME)?.text ?? "");
  if (!hasEngineText(noticeText)) return [];
  const nNotice = norm(noticeText);
  const covering: Array<[number, number]> = [];
  for (const f of findings) {
    if (disposeFinding(f) === "dropped") continue;
    const ex = norm(analyzedExcerptOf(f) || "");
    if (!ex) continue;
    const s = nNotice.indexOf(ex);
    if (s >= 0) covering.push([s, s + ex.length]);
  }
  const sentenceSpan = (at: number): [number, number] => {
    let s = at; while (s > 0 && !".!?".includes(nNotice[s - 1])) s--;
    let e = at; while (e < nNotice.length && !".!?".includes(nNotice[e])) e++;
    return [s, e < nNotice.length ? e + 1 : e];
  };
  const out: TypedFinding[] = [];
  const seen = new Set<string>();
  const scan = new RegExp(SIZE_STANDARD_RE.source, "gi");
  for (const m of nNotice.matchAll(scan)) {
    const [ss, se] = sentenceSpan(m.index ?? 0);
    if (covering.some(([s, e]) => s < se && ss < e)) continue;   // a decision-bearing finding already surfaces it
    const excerpt = nNotice.slice(ss, se).trim().slice(0, 240);
    if (!excerpt || seen.has(excerpt)) continue;
    if (!isBareSizeStandardSentence(excerpt)) continue;          // coupled to another bar → not a self-cert caveat
    seen.add(excerpt);
    out.push({
      requirement: `Confirm the firm meets the applicable SBA small-business size standard — self-certified in SAM (FAR 52.212-3 reps & certs); verify size status before bidding: "${excerpt}"`,
      citation: NOTICE_BODY_DOC_NAME,
      excerpt,
      kind: "eligibility_bar",
      controllability: "bidder_controls",
      curableInWindow: true,
      grounded: true,
      lens: "notice_body_size_standard_selfcert",
    });
  }
  return out;
}

/** Card #516 (Brain CLASS ruling, flag AUDIT_SELF_DETERMINABLE_ELIG_CLASS default-OFF) — the generalization of
 *  emitSizeStandardCaveats to the FULL **BIDDER-STATUS-KNOWABLE** class (see the naming ruling at the R1/R2 block
 *  above: the discriminator is whether the BIDDER CAN ANSWER TODAY WITH CERTAINTY, not who issues the paper — so
 *  third-party-GRANTED but firm-KNOWN statuses like 8(a)/HUBZone/SDVOSB belong here alongside genuinely
 *  self-certified WOSB/size/SAM). For every ungrounded ELIGIBILITY_BAR_RE hit whose enclosing sentence is
 *  bidder-status-knowable (isBidderSelfDeterminableSentence), surface a class-appropriate **named-gate** CAVEAT
 *  (controllability bidder_controls ⇒ never a show-stopper, never downgrades the verdict) so the fact rides a
 *  committal as a reps-&-certs reminder instead of the floor mis-typing it as a firm-only bar → false NHR.
 *  Bars the bidder CANNOT answer (clearance / site-visit / ITAR / QPL — a third party must investigate, adjudicate
 *  or grant) are R2 → skipped here and left to the bar path. Dedups against decision-bearing findings that already
 *  own the span. Flag-OFF ⇒ never called (gated at the call site) ⇒ byte-identical (Rule 61). */
export function emitSelfDeterminableCaveats(fullSource: string, findings: TypedFinding[], noticeBodyText?: string | null, declaredSetAside?: string | null): TypedFinding[] {
  const noticeText = (noticeBodyText && noticeBodyText.trim())
    ? noticeBodyText
    : (docRegions(fullSource).find((r) => r.name === NOTICE_BODY_DOC_NAME)?.text ?? "");
  if (!hasEngineText(noticeText)) return [];
  const nNotice = norm(noticeText);
  const covering: Array<[number, number]> = [];
  for (const f of findings) {
    if (disposeFinding(f) === "dropped") continue;
    const ex = norm(analyzedExcerptOf(f) || "");
    if (!ex) continue;
    const s = nNotice.indexOf(ex);
    if (s >= 0) covering.push([s, s + ex.length]);
  }
  const sentenceSpan = (at: number): [number, number] => {
    let s = at; while (s > 0 && !".!?".includes(nNotice[s - 1])) s--;
    let e = at; while (e < nNotice.length && !".!?".includes(nNotice[e])) e++;
    return [s, e < nNotice.length ? e + 1 : e];
  };
  const out: TypedFinding[] = [];
  const seen = new Set<string>();
  for (const m of nNotice.matchAll(new RegExp(ELIGIBILITY_BAR_RE.source, "gi"))) {
    const [ss, se] = sentenceSpan(m.index ?? 0);
    if (covering.some(([s, e]) => s < se && ss < e)) continue;   // a decision-bearing finding already surfaces it
    const excerpt = nNotice.slice(ss, se).trim().slice(0, 240);
    if (!excerpt || seen.has(excerpt)) continue;
    if (!isBidderSelfDeterminableSentence(excerpt, declaredSetAside)) continue;   // a third-party bar → leave to the bar path
    seen.add(excerpt);
    // Class-appropriate self-cert reminder (all bidder_controls / curable).
    let requirement: string;
    if (SETASIDE_PROGRAM_RE.test(excerpt)) {
      requirement = `A bid is viable ONLY if the firm holds the required SBA certification for this set-aside program at offer — WOSB/EDWOSB (13 CFR 127), SDVOSB/VOSB (13 CFR 128), 8(a) (13 CFR 124) and HUBZone (13 CFR 126) are SBA-certification-gated (self-certification was eliminated); confirm active certification in SAM before bidding: "${excerpt}"`;
    } else if (REGISTRATION_TOKEN_RE.test(excerpt) && SAM_TOKEN_RE.test(excerpt)) {
      requirement = `Confirm the firm holds an active SAM registration (FAR 52.204-7) — bidder-self-executed; verify it is active before bidding: "${excerpt}"`;
    } else if (REPS_CERTS_RE.test(excerpt)) {
      requirement = `Confirm the firm's representations & certifications (FAR 52.212-3) are complete and current in SAM — offeror-self-completed: "${excerpt}"`;
    } else if (SIZE_STANDARD_RE.test(excerpt)) {
      requirement = `Confirm the firm meets the applicable SBA small-business size standard — self-certified in SAM (FAR 52.212-3 reps & certs); verify size status before bidding: "${excerpt}"`;
    } else {
      requirement = `Confirm the firm meets the stated bidder-self-determinable eligibility condition before bidding: "${excerpt}"`;
    }
    out.push({
      requirement,
      citation: NOTICE_BODY_DOC_NAME,
      excerpt,
      kind: "eligibility_bar",
      controllability: "bidder_controls",
      curableInWindow: true,
      grounded: true,
      lens: "notice_body_self_determinable_selfcert",
    });
  }
  return out;
}

/** T0-5 (engine line-audit 2026-07-06) — partition the residue-doctrine's UNVERIFIED INFORMATIONAL findings out
 *  of the claim/verdict set. Such a finding (skeptic never ruled; GUARANTEED non-bar / non-verdict-driving by the
 *  marker's guard at audit-verifier.ts:87) must NOT read as a VERIFIED finding, but is RETAINED (returned in
 *  `excluded`) for telemetry — the residue-doctrine contract (verifier line 55) that previously had ZERO readers.
 *  Applied AFTER coverage (so an unverified finding still legitimately counts a section/doc as analyzed) and
 *  BEFORE the verdict. Pure + exported for the gate suite. */
export function excludeUnverifiedInformational(findings: TypedFinding[]): { kept: TypedFinding[]; excluded: TypedFinding[] } {
  const excluded = findings.filter((f) => f.unverified);
  return { kept: excluded.length ? findings.filter((f) => !f.unverified) : findings, excluded };
}

/** Brain card 289 — PART36 per-doc coverage with SEALED full-text ATTESTATION (card-285 Fix-2 generalized to
 *  attachments; gate UNCHANGED, only the per-doc CONDITION is stated via attestation). For each binding attachment:
 *   • HARD LINE — no sealed attestation OR no machine-readable text (hasText=false) ⇒ UNREAD ⇒ never attestable ⇒
 *     uncovered ⇒ INCOMPLETE (read-and-empty ≠ unread);
 *   • obligation-FREE over FULL text (groundableObligations===0) ⇒ ATTESTED "read in full · hash-bound · swept ·
 *     zero groundable obligations" ⇒ covered WITHOUT a finding-in-doc (the drawings-PDF relief valve);
 *   • has obligations ⇒ still needs a grounded finding IN the doc's region (never suppresses a real obligation —
 *     Fix-2 condition 3). Attestation reads the SEALED FULL-TEXT sweep, never the digest self-certifying. */
export function constructionDocumentsCovered(ctx: AuditToolContext, findings: TypedFinding[]): { complete: boolean; uncovered: string[] } {
  const regions = docRegions(ctx.fullSource);
  if (regions.length <= 1) return { complete: true, uncovered: [] };
  const attByName = new Map((ctx.constructionManifest?.docAttestations ?? []).map((a) => [a.name, a]));
  const primaryNorm = norm(regions.find((r) => r.isPrimary)?.text ?? "");
  const uncovered: string[] = [];
  // R7 D3 / R8 P2 (Gauntlet Gate-2) — CROSS-ATTACHMENT excerpt norms, built ONCE (mirrors documentsCovered's line-368
  // hoist; the per-region rebuild was O(N²·L)). Keyed by name so the in-loop check can exclude the current region.
  // Flag-gated under AUDIT_ATTACHMENT_COVERAGE ⇒ empty flag-OFF ⇒ byte-identical to legacy.
  const otherAttNorms = ATTACHMENT_COVERAGE_ENABLED ? regions.filter((x) => !x.isPrimary).map((x) => ({ name: x.name, t: norm(x.text) })) : [];
  for (const r of regions) {
    if (r.isPrimary) continue;
    if (!isBindingDoc({ role: "attachment", name: r.name })) continue; // offeror-fill exempt
    const att = attByName.get(r.name);
    if (!att || !att.hasText) { uncovered.push(r.name); continue; }    // HARD LINE — unread/no-text can NEVER be attested
    // (B) Brain card 291 — SWEEP-based attestation (complement): a construction ELEMENT sealed IN this doc (verbatim
    // span + full-text hash at ingest) attests the doc was read + its binding content captured, without a proposer
    // finding — reduces per-doc passes. Insufficient alone for a doc carrying NO element (e.g. a drawings/spec set).
    if (ctx.constructionManifest?.elements.some((e) => e.present && e.sourceDoc === r.name)) continue;
    if (att.groundableObligations === 0) {
      // DETERMINISTIC FLOOR on the construction read-and-empty valve too (Gauntlet #350 ADD-7 — the THIRD emitter of the
      // hard-bar-bypass class, parallel to documentsCovered's read_no_obligation valve): a VERB-LESS clearance/
      // eligibility/set-aside bar yields 0 groundable obligation SENTENCES yet is a real disqualifier; it must NOT attest
      // read-and-empty. Card #370 R2: the floor is ELIGIBILITY-only — a construction "shall not deviate"/boilerplate no
      // longer trips it (routes to Gate-4), only a true eligibility bar does. Fall through to the grounded-finding check
      // below. Flag-gated (AUDIT_ATTACHMENT_COVERAGE) ⇒ flag-OFF byte-identical, so this part36 path goes live with the arc.
      if (!(ATTACHMENT_COVERAGE_ENABLED && ELIGIBILITY_BAR_RE.test(r.text))) continue;   // ATTESTED read-and-empty (obligation-free full text)
      console.warn(`[coverage] construction read-and-empty valve REJECTED for "${r.name}" — ELIGIBILITY-BAR language present though groundableObligations=0 (verb-less bar); requires a grounded finding → uncovered`);
    }
    const nRegion = norm(r.text);                                      // has obligations ⇒ require a grounded finding-in-doc
    // an excerpt shared with ANOTHER attachment (a flow-down phrase in both) must NOT certify THIS doc as analyzed
    // → false COMPLETE; exclude it (mirrors documentsCovered line ~397).
    if (!findings.some((f) => {
      const ex = norm(analyzedExcerptOf(f) || "");
      if (!(ex.length > 0 && nRegion.includes(ex) && !primaryNorm.includes(ex))) return false;
      if (otherAttNorms.some((o) => o.name !== r.name && o.t.includes(ex))) return false;   // shared with ANOTHER attachment → doesn't prove THIS one analyzed
      return true;
    })) uncovered.push(r.name);
  }
  return { complete: uncovered.length === 0, uncovered };
}

// C-19 INTERIM GUARD (Brain C.f — resolution is its OWN tranche; here: detect + disclose, NEVER a verdict cap).
const AMENDMENT_RE = /\b(?:SF[-\s]?30\b|amendment\s+of\s+solicitation|amendment\s+(?:no\.?|number|#)?\s*0*\d)/i;
/** Deterministic amendment presence — either an ingestion doc tagged role "amendment" (passed via docNames roles)
 *  or an SF-30 / "Amendment of Solicitation" marker in the source. Detection only — supersession is NOT resolved. */
export function detectAmendments(fullSource: string): boolean {
  return docRegions(fullSource).some((r) => AMENDMENT_RE.test(r.name) || AMENDMENT_RE.test(r.text.slice(0, 4000)));
}

// Brain card 288 RULING 2 (interim, until the amendment-resolution tranche) — unresolved SF-30 supersession with no
// deterministic resolution → INCOMPLETE honest-fail (never decide over possibly-superseded terms). The deterministic
// resolver does not exist yet, so "unresolved" = a supersession-AMBIGUITY signal: ≥2 distinct amendment/modification
// numbers (the supersession ORDER cannot be resolved without the resolver) OR any term-REVISION / supersession
// language. FAIL-SAFE toward INCOMPLETE — a bare due-date-extension single amendment with no revision language
// proceeds; anything that revises/replaces terms, or a second amendment, honest-fails. (Hardened per adversarial
// review: "Modification No." is now counted, and generic "revise/change … to read / delete / replace" trips it.)
const AMEND_NUM_RE = /\b(?:amendment|modification|mod)\s+(?:no\.?|number|#)?\s*0*(\d{1,3})\b/gi;
const SUPERSEDE_RE = /\b(?:supersed|in\s+lieu\s+of|deleted\s+in\s+its\s+entirety|replaced?\s+in\s+its\s+entirety|hereby\s+(?:deleted|replaced|amended)|(?:is|are|hereby)\s+(?:revised|changed|deleted|replaced)|(?:revised|changed|amended|deleted|replaced)\s+to\s+read|change[sd]?\s+(?:section|clause|paragraph))/i;
export function amendmentSupersessionUnresolved(fullSource: string): boolean {
  // NEW-HOLE fix (Rule-69 re-review): the shared detectAmendments/AMENDMENT_RE recognizes SF-30 / "amendment of
  // solicitation" / "amendment No." but NOT "Modification No." — so a modification-only revising doc would slip the
  // short-circuit and never reach the broadened counters below (catastrophic false-COMPLETE direction). Recognize
  // modifications HERE (scoped to this fail-safe, leaving the shared disclosure detector byte-identical).
  const hasAmendmentOrMod = detectAmendments(fullSource) || /\b(?:modification|mod)\s+(?:no\.?|number|#)?\s*0*\d/i.test(fullSource ?? "");
  if (!hasAmendmentOrMod) return false;
  const nums = new Set<string>();
  for (const m of (fullSource ?? "").matchAll(AMEND_NUM_RE)) nums.add(m[1]);
  if (nums.size >= 2) return true;                 // ≥2 distinct amendments/mods — ordering ambiguous without the resolver
  return SUPERSEDE_RE.test(fullSource ?? "");      // explicit term-revision / supersession language on an amended buy
}
/** Per-finding document PROVENANCE (which assembled doc a finding's excerpt is grounded in) — persisted so a
 *  reviewer can see which document (primary vs a specific attachment/amendment) each finding came from. */
// card #704 (routed item F, Option A with the C-ready shape) — provenance now carries the VERBATIM excerpt per
// finding, not just {id, doc}, so a finding can be re-grounded post-hoc without the (often 404'd) live source.
// The excerpt is written verbatim (never fabricated) and only when the finding actually carries one — the loop
// already skips excerpt-less findings, so an absent excerpt is simply not an entry (never a null-fabrication).
// SECURITY: excerpt is source-/model-derived text (attacker-influenceable, like `doc`). Inert today (no renderer
// reads finding_provenance); ANY future UI surfacing it MUST route through escapeHtml (stored-XSS), like `doc`.
export function findingProvenance(fullSource: string, findings: TypedFinding[]): Array<{ id: string; doc: string; excerpt: string }> {
  const regions = docRegions(fullSource).map((r) => ({ name: r.name, n: norm(r.text) }));
  const out: Array<{ id: string; doc: string; excerpt: string }> = [];
  for (const f of findings) {
    if (!f.id || !f.excerpt) continue;
    // Attribution asks which DOCUMENT the analysis read, so it matches on the analyzed span. The displayed
    // excerpt is re-grounded against `groundingSource`, which on a compressed-digest run is not the text
    // these regions are built from — matching it here returns "(ungrounded)" for a finding that is grounded.
    const ex = norm(analyzedExcerptOf(f));
    out.push({ id: f.id, doc: regions.find((r) => r.n.includes(ex))?.name ?? "(ungrounded)", excerpt: f.excerpt });
  }
  return out;
}

/** P4 (B-corrected · Brain card-48) — completeness = OBLIGATION-coverage, not per-section ≥1 finding:
 *    1. every binding section must be READ (tool-pulled) — else INCOMPLETE (preserves the §C guarantee);
 *    2. a section with a direct grounded finding is covered;
 *    3. a READ section with no direct finding is covered ONLY if every obligation sentence in it is grounded
 *       ELSEWHERE by a verbatim n-gram match, with the specific finding IDs cited (silence ≠ coverage);
 *       a read section that carries no obligation sentence is covered (genuinely thin).
 *  Returns per-section attestations so the trace can be adjudicated (thin vs miss) before BID is accepted. */
// 5b §M evaluation-DEPTH tokens (Brain card 137) — a genuine award BASIS carries at least one of these. Two
// non-criteria text sources must NOT satisfy the check: (a) the §M TITLE ("…EVALUATION FACTORS FOR AWARD") that
// readSection includes — so the literal "evaluation factor(s)" is excluded; (b) TRAILING content — §M is the last
// UCF section so its text bleeds to EOF, dragging in appended attachments. So bare generic words ("acceptable",
// "weight", "past performance") are excluded — only award-BASIS-specific phrases remain, which a wage determination
// or past-performance form won't carry. The scan is ALSO region-bounded (criteria sit right under the heading).
const EVAL_FACTOR_RE = /\bLPTA\b|lowest[\s-]priced|technically\s+acceptable|best\s+(?:overall\s+)?value|greatest\s+(?:overall\s+)?value|\btrade[\s-]?off|highest[\s-]?rated/i;
// §M is the LAST UCF section, so readSection("M").text bleeds to EOF, dragging in appended attachments. Delimit the
// real CRITERIA region: lines under the heading up to the first document-structure boundary. Both the token check
// AND the thinness check run on THIS — so a trailing past-performance/wage attachment can neither satisfy the token
// check nor inflate the word count (which would otherwise defeat the "thin" condition). Heuristic; "thin" = a small
// word count. Mechanism is deliberately simple — final calibration deferred to the regen/re-panel stage (card 137).
const M_BOUNDARY_RE = /^\s*(?:ATTACHMENT|EXHIBIT|APPENDIX|ANNEX|ADDENDUM|WAGE\s+DETERMINATION|PAST\s+PERFORMANCE\s+QUESTIONNAIRE|SECTION\s+[A-Z]\b)/i;
function sectionMCriteria(text: string): string {
  const lines = text.split("\n"); const out: string[] = [];
  for (let i = 1; i < lines.length; i++) { if (M_BOUNDARY_RE.test(lines[i])) break; out.push(lines[i]); }
  return out.join("\n").slice(0, 2000);
}
const isThin = (s: string): boolean => s.trim().split(/\s+/).filter(Boolean).length < 12;
// Fixed allowlist for boilerplate attestation (card 285 Fix 2). The ONLY sections a holistic read may attest covered
// without per-obligation grounding — incorporated FAR-clause lists (§I) and reps/certs (§K). Never a binding-
// obligation section (§C/§F/§L/§M). An internal clamp so no caller of the exported completenessOf can widen it.
const BOILERPLATE_ATTESTABLE = new Set(["I", "K"]);
// T1-12 — the binding OBLIGATION sections. A single direct grounded finding must
// NOT blanket-cover these via covered_direct (that skipped the per-obligation
// ungrounded→INCOMPLETE proof); they are certified per-obligation instead.
const PER_OBLIGATION_SECTIONS = new Set(["L", "M"]);

// PHASE 4 (Brain, flag AUDIT_COVERED_DIRECT_BAR_FLOOR) — COVERED_DIRECT HARD-BAR FLOOR helper. The covered_direct
// blanket short-circuit certifies a WHOLE non-per-obligation binding section ({B,C,D,E,F,H}) covered on a SINGLE
// grounded finding cited to it, so a CO-RESIDENT ungrounded bidder-DISQUALIFIER (a §H facility-clearance/CMMC bar, a §C
// set-aside restriction) sitting next to one benign grounded finding is NEVER enumerated → invisible to BOTH the V1
// coverageComplete veto AND (prod state) gradeCoverageV2's importanceOf disqualifier scan (which reads status===covered
// _direct as isCovered). §L/§M are already protected (T1-12 per-obligation fall-through); these six sections were not,
// and they carry the bars. This helper mirrors the RATIFIED notice-body/attachment eligibility floors EXACTLY (same
// covering-overlap + global ELIGIBILITY_BAR_RE scan + isSelfCertDemotableSentence over-fire reducer, cards #421/#441/
// #509/#516) and returns the surviving ungrounded bar SENTENCES so the caller can emit obligations_ungrounded with the
// REAL sentence — routing escalation through the engine's OWN importanceOf authority in BOTH flag states (V1: missing→
// INCOMPLETE; V2: disqualifierUncovered→escalate). A clean section (no hard-bar) returns [] ⇒ covered_direct unchanged
// BY CONSTRUCTION ⇒ zero over-fire on clean text. Over-fire (covered section → human review) is the SAFE direction;
// under-fire (bar slips) is a hard zero. Pure → $0 gate-testable.
// PHASE 4 R1→R2 (red-team over-fire remediation, project_covdirect-r1-findings) — the covered_direct floor scans the FULL
// §B/C/D/E/F/H prose, a far larger + denser surface than the ratified notice-body floor, where ELIGIBILITY_BAR_RE's
// subject-AGNOSTIC tokens (eligib/ineligible, "top secret", "iso 9001", a form-block "8(a)", a bare "size standard")
// collocate on a WORK-PRODUCT / DATA / GOOD / FORM-FIELD rather than the bidder: "all welds shall conform to ISO 9001",
// "documents classified up to Top Secret shall be stored…", "nonconforming units are ineligible for acceptance", "the
// NAICS code and its size standard are listed…", "enter the value in block 8(a)". None is a bidder-eligibility bar →
// crying-wolf false-INCOMPLETE (the cardinal sin per the quantity-ambiguity doctrine). CONVERGED POSITIVE INVARIANT
// (recognizer-doctrine pivot [[feedback_reconstruction_treadmill_pivot_recognizer]]): skip a match whose sentence is
// CONFIDENTLY about a non-offeror THING (a thing-noun — through an optional offeror genitive — leads it, or it is a
// form-field ref, or an acceptance-of-goods object frame) — and pass EVERYTHING ELSE through. TWO BELTS guarantee the
// airtight under-fire BY CONSTRUCTION: (1) belt-1 — an offeror DIRECTLY bound to an eligibility token ("eligible
// offeror", "offeror shall be registered") ⇒ never skip; (2) belt-2 — any FIRM-INHERENT credential (a clearance/CMMC/
// set-aside/8(a)-program/registration/debarment a GOOD can never hold) ⇒ never skip. Genuine ambiguity (no thing-subject,
// no belt) still FLOORS (fails toward escalation). Converged R1→R4 under 3 independent adversarial passes; 37/37.
// FIRM-INHERENT credentials — a good/document/weld can NEVER hold one, so naming it is itself bidder-direction (belt 2).
// R3→R4: 8(a) as a socioeconomic PROGRAM is a firm-inherent SBA status like hubzone/sdvosb — but the 8(a) branch is
// ANCHORED to a restriction/award verb (restrict/limit/reserve/award-to/available-to/open-to/eligible-to/performed-by)
// or a program noun (participant/concern/certified-firm/designation/program-participant/set-aside), NOT a bare
// "program"/"only"/"award" co-occurrence — so a form-block "program described in block 8(a)" / "only block 8(a)
// requires an entry" / "section 8(a) of the FAR" falls through to FORM_FIELD_8A_RE and SKIPS (the R3 8(a)-reverse
// ordering defect the final DRY-cert caught).
const FIRM_CREDENTIAL_RE = /\b(?:facility|security|personnel|secret|top[\s-]?secret|ts[\s/]?sci|sci|interim)\s+clearance\b|\bclearance\s+(?:level|required|eligibilit)\b|\bcmmc\b|\bcleared\s+(?:to|at|for)\b|\bddtc\b|\bitar\b|\bset[\s-]?aside\b|\b(?:sdvosb|hubzone|wosb|edwosb|service[\s-]?disabled)\b|\b(?:restrict\w*|limit\w*|reserv\w*|award(?:ed)?\s+(?:only\s+)?to|available[^.!?]{0,15}?to|open[^.!?]{0,15}?to|eligible\s+(?:to|for)|performed\s+by)[^.!?]{0,30}?\b8\s?\(?a\)?\b|\b8\s?\(?a\)?\b[^.!?]{0,25}?(?:participants?|concerns?|certified\s+(?:firms?|business(?:es)?|concerns?|entit(?:y|ies)|small)|designations?|program\s+participants?|set[\s-]?aside)\b|\bregistered\s+in\s+sam\b|\bactive\s+sam(?:\.gov)?\s+registration\b|\bdebarr?ed\b|\bexcluded\s+part/i;
// The sentence LEADS with a WORK-PRODUCT / DATA / GOOD / informational subject (the confident non-bidder case). R4:
// an OPTIONAL offeror-genitive/attributive prefix ("the firm's samples", "contractor personnel") is allowed BEFORE the
// thing-noun so a genitive possessor does not mask the thing subject (the belt-1 genitive over-fire the DRY-cert caught).
const THING_LEAD_RE = /^(?:the\s+|all\s+|any\s+|each\s+|every\s+|nonconforming\s+|applicable\s+|a\s+|an\s+|its\s+|final\s+|delivered\s+|classified\s+)*(?:(?:offer(?:or|er)s?|bidders?|contractors?|subcontractors?|firms?|vendors?|concerns?|compan(?:y|ies)|prime)(?:'s|s')?\s+)?(?:supplies|goods|deliverables?|items?|products?|materials?|articles?|units?|lots?|shipments?|samples?|documents?|records?|data|files?|drawings?|welds?|parts?|components?|work|workmanship|services?|invoices?|packages?|containers?|personnel|naics(?:\s+code)?|codes?|size\s+standards?|clauses?|provisions?|values?|entries|fields?)\b/i;
const FORM_FIELD_8A_RE = /\b(?:block|blk|line|item|box|field|section|entry|column|cell|part)\s*(?:no\.?\s*|number\s*|#\s*)?8\s?\(?a\)?\b/i;
const ACCEPTANCE_OBJECT_RE = /\b(?:in)?eligib(?:le|ility)\b[^.!?]{0,25}?\bfor\s+(?:final\s+|government\s+)?(?:acceptance|payment|reimbursement|delivery|inspection)\b/i;
// belt-1 (R4 DIRECT-BINDING, replaces the R3 30-char adjacency) — an offeror-class noun forces a floor ONLY when it is
// DIRECTLY bound to an eligibility token as the party whose eligibility is at stake: "eligible OFFEROR", "OFFEROR that
// is eligible", "OFFEROR shall be eligible/registered-in-sam/possess". A genitive possessor of a thing ("the firm's
// samples shall be registered", "contractor personnel shall be registered") does NOT match → falls to the thing test
// (the belt-1 adjacency over-fire the final DRY-cert caught). Ambiguity (offeror + eligibility but not directly bound)
// falls to the thing test rather than force-floor — under-fire stays sealed by belt-2 + the firm-credential belt.
const _OFF = "(?:offer(?:or|er)s?|bidders?|contractors?|subcontractors?|firms?|concerns?|vendors?|proposers?|quoters?|awardees?|applicants?)";
// Gate-2 P0 (2026-07-19): belt-1 must also floor the POST-MODIFIER participle order — an offeror-class noun DIRECTLY
// followed by a bare eligibility participle ("supplied only by offerors CERTIFIED to ISO 9001", "vendors ACCREDITED to
// AS9100") is a genuine who-may-supply/bid bar the forward-order ("certified offeror") + directive arms missed, so a
// THING-lead sentence ("Products shall be supplied by …") laundered the bar to covered_direct. Added "accredited"/
// "approved"/"listed" to the participle set (forward + reversed). Reversed order is fail-toward-floor (safe direction).
const OFFEROR_ELIG_BOUND_RE = new RegExp(`\\b(?:not\\s+)?(?:eligible|ineligible|qualified|certified|accredited|approved|listed|registered|cleared|responsible|debarred)\\s+(?:small\\s+business\\s+|prospective\\s+|apparent\\s+)?(?:${_OFF}|entit(?:y|ies)|participants?)\\b|\\b${_OFF}\\s+(?:that\\s+(?:are|is)|who\\s+(?:are|is))\\s+(?:not\\s+)?(?:eligible|ineligible|qualified|certified|accredited|approved|listed|registered|cleared|responsible)\\b|\\b${_OFF}\\s+(?:shall|must|will|is|are|to)\\s+(?:be\\s+)?(?:not\\s+)?(?:eligible|ineligible|qualified|certified|registered\\s+in\\s+sam|cleared|responsible|debarred|possess|hold|maintain)\\b|\\b${_OFF}\\s+(?:not\\s+)?(?:eligible|ineligible|qualified|certified|accredited|approved|listed|cleared|debarred)\\b`, "i");
function isNonBidderEligibilitySentence(sentence: string): boolean {
  if (FIRM_CREDENTIAL_RE.test(sentence)) return false;      // belt 2 — a firm-inherent credential a good can't hold → floor
  if (OFFEROR_ELIG_BOUND_RE.test(sentence)) return false;   // belt 1 — offeror directly bound to the eligibility → floor
  return THING_LEAD_RE.test(sentence) || FORM_FIELD_8A_RE.test(sentence) || ACCEPTANCE_OBJECT_RE.test(sentence);
}

// ── PHASE 5 (Brain card #560, flag AUDIT_ELIG_BAR_PASSIVE_FRAME default-OFF) — PASSIVE / NOUN-FRAME eligibility-bar SIBLING.
// ELIGIBILITY_BAR_RE catches the ACTIVE-VERB frame ("[offeror] shall/must HOLD a [clearance]") but MISSES the passive /
// noun frame ("a TS/SCI clearance IS REQUIRED", "an FCL at the Secret level", "Authorized reseller letter from …") AND a
// class of OUT-OF-VOCAB firm-credential / supply-chain nouns (TS/SCI · DOE Q/L access authorization · FCL · polygraph ·
// VAR / authorized dealer-distributor-reseller · ITAR/DDTC · NADCAP/Berry/FedRAMP · QPL/QML · CBA signatory). A bar in
// this class is INVISIBLE to the WHOLE chain → the catastrophic false-COMPLETE Gate-2 Row-1 exposes (the load-bearing
// pre-filter miss). Sibling detector — DOCTRINE #515: POSITIVE NOUN ALLOWLIST (no bar-vocabulary blocklist).
// GAUNTLET R1→R3 PIVOT (recognizer-doctrine [[feedback_reconstruction_treadmill_pivot_recognizer]]): a naive "requirement
// frame" is a TWO-SIDED treadmill (26 over-fires on benign credential MENTIONS — glossary/QPL-goods/"cover letter"/
// "overhead clearance" — while STILL missing "will be found nonresponsive"/"ineligible for award"). The POSITIVE INVARIANT
// that holds BY CONSTRUCTION: FLAG = a chartered credential NOUN + a BID/AWARD-SCOPED ELIGIBILITY CONSEQUENCE (the firm at
// bid/award is ineligible / nonresponsive / not-considered / not-awardable / restricted-out — OR a DIRECTIVE-governed
// possession of the noun ["offeror must possess an FCL"] OR the firm-credential noun immediately followed by "is required/
// mandatory"), AND NOT a benign DEFINITION / incumbent-narrative / goods-installed-BY-agent / POST-AWARD-curable onboarding
// / self-cert. Consequence/possession is the LOAD-BEARING gate; the noun is a bounded chartered allowlist. "personnel" is
// deliberately NOT a thing here (a personnel clearance IS a firm bar) — the noun allowlist excludes the 19 personnel-Tier/
// NACLC/SSBI INVESTIGATION specimens BY CONSTRUCTION (a process, never a standing credential). PRODUCT-COMPLIANCE nouns
// (NADCAP/Berry/FedRAMP/QPL/QML) + labor CBA flag only via a STRONG bid-consequence or an OFFEROR-subject possession — a
// bare "[product] is required / must appear on the QPL" is a product/process spec, not a firm bid bar (rounds 2-3).
// SCOPE (banked for the CEO batch ruling, NOT chased — anti-treadmill): OUT-OF-VOCAB credential nouns (SCIF/COMSEC/JCP-
// DD2345/FOCI/AS9100/DMEA) + genuinely-ambiguous performance/site-access framings ("condition of access", "precondition to
// receiving the TDP") are documented under-fires, not defects. BINDING (card #560): the passive match routes through the
// SAME demotion authority as ELIGIBILITY_BAR_RE (isSelfCertDemotableSentence, :765/:960/:977) — the self-cert path can
// NEVER launder a passive bar (a coupled "registered in SAM AND an authorized reseller" escalates via TEST 4) — AND the
// SAME emission channel (obligations_ungrounded → importanceOf escalation, both flag states). Over-fire (covered section →
// human review) is the SAFE direction; under-fire (a firm bar → false-COMPLETE) is a hard zero. Pure → $0 gate-testable.
// Gauntlet-DRY: R1 corpus 31/31 · 3 adversarial red-team rounds (79 specimens) 0 clear over-fire; certs
// `_cert-phase5-{passive-corpus,coupling-prodpath,gauntlet-judge}.ts`.
// GAUNTLET R1→R2 PIVOT (recognizer-doctrine [[feedback_reconstruction_treadmill_pivot_recognizer]]): a loose "requirement"
// frame is a TWO-SIDED treadmill — it over-fires on 26 benign credential MENTIONS (a glossary "TS/SCI means…", a QPL goods
// spec, a "cover letter", an "overhead clearance", a warranty "authorized dealer") while STILL missing the eligibility
// idioms ("will be found nonresponsive", "ineligible for award", "need not respond"). The POSITIVE INVARIANT that holds
// BY CONSTRUCTION: a passive eligibility bar = a chartered credential NOUN + an OFFEROR-scoped PRE-AWARD ELIGIBILITY
// CONSEQUENCE (the firm, at bid/award, is disqualified / nonresponsive / not-considered / not-awardable, OR must POSSESS
// the credential governed by a possession verb at a pre-award milestone) — and NOT a benign DEFINITION, a POST-AWARD-
// curable onboarding, or a GOODS-installed-BY-agent workmanship. Consequence/possession is the load-bearing gate; the
// noun stays a chartered allowlist (scope = card #560's explicit vocab; OOV credentials SCIF/COMSEC/JCP/FOCI/DMEA are
// banked for the batch ruling, NOT chased — doctrine #515 anti-treadmill). Ambiguity FAILS TOWARD FLAG (human review).
const PASSIVE_CREDENTIAL_NOUN_RE = new RegExp([
  "\\bts[\\s/]?sci\\b",                                                   // TS/SCI
  "\\b[ql]\\s+access\\s+authorization\\b",                               // DOE Q / L access authorization (level-specific)
  "\\baccess\\s+authorization\\b",                                       // DOE access authorization (generic)
  "\\bfcl\\b",                                                            // facility clearance level (abbrev) — consequence gate carries it
  "\\b(?:facility|security|personnel|interim|top[\\s-]?secret|secret)\\s+clearance\\b", // spelled clearance
  "\\bscif\\b|\\bsensitive\\s+compartmented\\s+information\\s+facilit\\w*\\b", // SCIF (card #562 Item 1) — WEAK-isreq (a bare "a SCIF is required to store …" is a facility spec)
  "\\bcomsec\\s+account\\b",                                             // COMSEC ACCOUNT (card #562 Item 1) — the firm credential (bare "COMSEC is required for transmissions" = encryption, not a bar)
  "\\bfoci\\b|\\bforeign\\s+ownership,?\\s+control",                    // FOCI / foreign ownership control or influence (card #562 Item 1)
  "\\bpolygraph\\b",                                                     // polygraph (CI-scope / full-scope / lifestyle)
  "\\bvalue[\\s-]?added\\s+res\\w*\\b",                                  // Value Added Reseller (typo-tolerant: "Resaler")
  "\\bauthorized\\s+(?:dealer|distributor|resell?er)\\b",                // authorized dealer / distributor / reseller
  "\\bitar\\b|\\bddtc\\b",                                               // ITAR / DDTC registration
  "\\bnadcap\\b|\\bberry[\\s-]amendment\\b|\\bfedramp\\b",               // NADCAP / Berry(-)Amendment / FedRAMP (hyphen-tolerant)
  "\\bqpl\\b|\\bqml\\b|\\bqualified\\s+products?\\s+list\\b",            // QPL / QML product qualification
  "\\bcollective\\s+bargaining\\s+agreement\\b",                        // CBA signatory
].join("|"), "i");
// (A) DEFINITION / GLOSSARY / ACRONYM / PAST-PERFORMANCE-NARRATIVE context — the noun is DESCRIBED (or predicated of the
// INCUMBENT), not required of THIS offeror (sentence-level). No bare-parenthetical arm — a real bar routinely parenthesises
// its own acronym ("must be a Value Added Reseller (VAR)"); only an explicit definition verb / narrative subject skips.
const PASSIVE_DEFINITION_CONTEXT_RE = /\b(?:means|refers?\s+to|is\s+defined\s+as|shall\s+mean|stands?\s+for|abbreviations?\s+(?:table|list)|as\s+used\s+herein)\b/i;
// Gate-2 P1 (2026-07-19): incumbent / predecessor NARRATIVE — a credential predicated of the INCUMBENT (past-performance
// context), NOT required of THIS offeror. Split out of PASSIVE_DEFINITION_CONTEXT_RE because the old bare sentence-scoped
// token was POSITION-BLIND: a comparative bar that merely NAMES the incumbent ("Unlike the incumbent, any new offeror
// lacking a facility clearance is ineligible for award"; "The incumbent holds a TS/SCI clearance; the offeror must
// possess an FCL and will be found nonresponsive without it") was wrongly suppressed. Release on incumbent-narrative ONLY
// when the sentence carries NO offeror-scoped eligibility CONSEQUENCE and NO offeror SUBJECT — i.e. the credential really
// is the incumbent's, not this offeror's (ambiguity fails toward FLAG; over-fire is the safe direction).
const PASSIVE_INCUMBENT_NARRATIVE_RE = /\bincumbent\b|\bpredecessor\s+contract\b|\bunder\s+the\s+(?:predecessor|prior|current)\s+contract\b/i;
// (B) OFFER-LEVEL ELIGIBILITY CONSEQUENCE — the offeror/firm is gated at bid/award (sentence-level; the strong signals).
// NOTE: bare pre-award-milestone timing tokens ("as of the date of award", "at proposal submission") are NOT consequences
// on their own (they falsely fired on of-18's NEGATED "no offeror is required to hold … at proposal submission") — they
// only count when a possession verb governs the credential (handled in (C) below).
// GAUNTLET R2→R3: every consequence token is BID/AWARD-scoped — round 2 proved the broad forms ("mandatory",
// "ineligible", "condition of access", "precondition", "contingent on", "disqualif", bare "not acceptable") over-fire on
// PERFORMANCE / SITE-ACCESS / PRODUCT / PERSON eligibility that shares a credential noun. A credential framed only as a
// SITE/IT-access or performance condition ("a clearance is a condition of access to Building 7", "precondition to
// receiving the workstation image") is NOT flagged here — that framing is banked for the CEO batch ruling as an
// ambiguous performance/access boundary (safe direction: avoid crying wolf, the co-resident explicit bar still catches).
const PASSIVE_ELIG_CONSEQUENCE_RE = new RegExp([
  "\\bineligib(?:le|ility)\\s+(?:for\\s+(?:award|consideration|this\\s+(?:procurement|acquisition|solicitation)|bid)|to\\s+(?:bid|propose|compete|be\\s+(?:considered|awarded)))\\b",
  "\\beligib(?:le|ility)\\s+(?:for\\s+(?:award|consideration|this\\s+(?:procurement|acquisition|solicitation)|bid)|to\\s+(?:bid|propose|compete|be\\s+considered|be\\s+awarded|participate))\\b",
  "\\beligibility\\s+is\\s+(?:restricted|limited)\\b",
  "\\b(?:threshold\\s+|mandatory\\s+)?eligibility\\s+requirement\\b",
  "\\b(?:restricted|limited)\\s+to\\s+[^.!?]{0,40}?(?:holders?|offer(?:or|er)s?|firms?|concerns?|contractors?|vendors?|suppliers?|manufacturers?|bidders?)\\b",
  "\\bnon[\\s-]?responsi(?:ve|ble|bility)\\b",
  "\\bfound\\s+(?:to\\s+be\\s+)?(?:non[\\s-]?responsi(?:ve|ble)|ineligible|not\\s+responsible)\\b",
  "\\bunawardable\\b",
  "\\baward\\s+(?:may\\s+only\\s+be\\s+made|will\\s+be\\s+made\\s+only|is\\s+contingent|may\\s+not\\s+be\\s+made)\\b",
  "\\bcontingent\\s+(?:up)?on\\s+[^.!?]{0,40}?(?:holding|possess|\\bhold\\b|the\\s+(?:offeror|prime|firm|contractor|awardee)|being\\s+(?:a|an)|award\\s+to)\\b",
  "\\bcondition\\s+of\\s+(?:award|eligibility|consideration)\\b",
  "\\bprecondition\\s+(?:to|for|of)\\s+(?:award|bid|eligib|consideration|being\\s+considered|proposal\\s+submission)\\b",
  // Gate-2 P0 (2026-07-19): 'prerequisite' is the load-bearing synonym of the covered 'precondition' — an in-vocab
  // chartered credential framed "is a prerequisite for award / to submitting a proposal" is a real firm bar the active
  // ELIGIBILITY_BAR_RE also misses (noun frame, no possession verb). Broader object list to catch the gerund forms.
  "\\bprerequisite\\s+(?:to|for|of)\\s+(?:award|bid|bidding|eligib|consideration|being\\s+considered|proposal\\s+submission|submitting|proposing|competing|participating)\\b",
  "\\bmandatory\\s+for\\s+(?:consideration|award|eligibility|bid)\\b",
  "\\bwill\\s+not\\s+be\\s+considered\\b",
  "\\bwill\\s+be\\s+considered\\s+for\\s+award\\b",
  "\\bwill\\s+not\\s+be\\s+(?:able\\s+to\\s+(?:perform|bid|compete|propose)|evaluated)\\b",
  "\\bneed\\s+not\\s+(?:respond|apply|bid|submit|propose)\\b",
  "\\bmay\\s+not\\s+(?:bid|propose|participate|compete|submit|be\\s+considered|be\\s+assigned)\\b",
  "\\bdisqualif\\w*\\s+(?:from\\s+(?:award|the\\s+(?:award|competition|procurement|solicitation)|consideration|bidding|being\\s+considered)|for\\s+award)\\b",
  "\\bonly\\s+[^.!?]{0,45}?(?:holders?|offer(?:or|er)s?|firms?|concerns?|contractors?|vendors?|suppliers?|manufacturers?|bidders?|quoters?)[^.!?]{0,45}?(?:may\\s+(?:bid|propose|participate|compete|perform|be\\s+awarded)|are\\s+eligible|will\\s+be\\s+considered|eligible\\s+to\\s+bid)\\b",
  "\\b(?:vendors?|offer(?:or|er)s?|firms?|suppliers?|quoters?|bidders?|contractors?)\\s+(?:who|that)\\s+(?:are|is)\\s+not\\s+(?:the\\s+)?(?:oem|an?\\s+)",  // conditional gate on non-credentialed offerors
  "\\brejected\\s+(?:without\\s+evaluation|as\\s+(?:technically\\s+)?(?:unacceptable|nonresponsive|noncompliant))\\b",
  "\\bnon-?(?:listed|compliant|qualified|conforming)\\s+[^.!?]{0,20}?(?:items?|products?|parts?|offers?|units?)\\s+(?:are|will\\s+be)\\s+(?:not\\s+acceptable|rejected|(?:technically\\s+)?unacceptable)\\b",  // bid-time product-qualification rejection
  "\\bmust\\s+appear\\s+on\\b[^.!?]{0,45}?\\bat\\s+(?:the\\s+)?(?:time\\s+of\\s+(?:bid|proposal|award|submission)|bid\\s+opening|proposal\\s+submission)\\b",  // "must appear on the QPL AT THE TIME OF BID OPENING" (bid-time, not delivery)
  "\\bauthorized\\s+(?:dealer|distributor|resell?er)\\s+letter\\b",
  "\\bletter\\s+of\\s+(?:supply|authorization)\\b",
  "\\b(?:facility|security|personnel)\\s+clearance\\s+requirement\\b",
  "\\bsignatory\\s+to\\b",
].join("|"), "i");
// (C) POSSESSION governing the credential — a possession verb within ~5 words BEFORE the noun ("shall possess an active
// [DOE Q]", "obtain and maintain a [polygraph]", "must provide the [authorized distributor] letter"). Copula "be" is
// SEPARATED out ("be a/an/the/active/current/valid [VAR]") so a passive verb ("be performed at a [NADCAP] facility",
// "be transferred") never falsely governs. Tested per-noun on the ~55-char pre-window so a distant verb (of-13's "must be
// signed" ahead of a far CBA) never governs.
// NOTE: "furnish"/"provide" are OMITTED — they collide with the ADJECTIVE forms ("Government-furnished equipment",
// "contractor-provided") that are not possession of a credential (of-18 GFE over-fire); the corpus FLAGs that use them
// ("shall provide an authorized distributor letter", "must provide traceability") are already carried by CONSEQUENCE
// (the "authorized … letter" / conditional-non-credentialed-vendor arms), so possession does not need them.
const PASSIVE_POSSESSION_GOVERN_RE = /\b(?:possess(?:es|ing|ion)?|hold(?:s|ing)?|maintain(?:s|ing)?|obtain(?:s|ing)?|have|has|having|appear(?:s|ing)?|signatory|enroll\w*|registered)\b(?:\s+[\w,'()./\-]+){0,5}\s*$/i;
const PASSIVE_COPULA_GOVERN_RE = /\bbe\s+(?:a|an|the|active|current|valid|able\s+to\s+\w+)(?:\s+[\w,'()./\-]+){0,4}\s*$/i;
// (C2) PASSIVE "[credential] IS REQUIRED" — the noun is the SUBJECT of a requirement predicate immediately after it
// ("a TS/SCI clearance IS REQUIRED", "an FCL is mandatory"). The canonical passive frame card #560 names. GATED to
// FIRM-CREDENTIAL nouns only — a PRODUCT-COMPLIANCE noun (NADCAP/Berry/FedRAMP/QPL/QML) "is required/mandatory" is
// usually a PRODUCT/PROCESS spec ("compliance with the Berry Amendment is mandatory for textile deliverables"), not a
// firm bid bar (round 2, r2-22); those flag only on a STRONG consequence (rejected / not-acceptable-offer / must-appear-on).
const PASSIVE_IS_REQUIRED_AFTER_RE = /^[\s\w,'()./\-]{0,22}?\b(?:is|are|was|were|shall\s+be|will\s+be|remains?|being)\s+(?:required|mandatory)\b/i;
// PRODUCT-COMPLIANCE / labor nouns — a NADCAP/Berry/FedRAMP/QPL/QML PRODUCT spec, or CBA "adherence is mandatory for the
// workforce" (SCA performance), is not a firm bid bar on a bare requirement/possession. These flag ONLY via a STRONG
// bid-consequence (rejected-at-evaluation / non-listed-not-acceptable / must-appear-on-at-bid-time / ineligible-for-award
// / only-X-may-bid) OR an OFFEROR-SUBJECT directive possession ("the offeror must possess NADCAP accreditation"), never a
// goods-subject possession ("all delivered valves must appear on the QPL") nor a bare "[noun] is required/mandatory".
const PASSIVE_WEAK_ISREQ_NOUN_RE = /\bnadcap\b|\bberry[\s-]amendment\b|\bfedramp\b|\bqpl\b|\bqml\b|\bqualified\s+products?\s+list\b|\bcollective\s+bargaining\s+agreement\b|\bscif\b|\bsensitive\s+compartmented\s+information\s+facilit\w*\b/i;
const PASSIVE_OFFEROR_SUBJECT_RE = /\b(?:offer(?:or|er)s?|firms?|contractors?|vendors?|bidders?|prime|concerns?|compan(?:y|ies)|awardees?|subcontractors?|proposers?|quoters?|applicants?)\b/i;
// (C3) records-admin — the noun immediately governs "records/documentation/file(s)" → maintaining paperwork, not holding
// the credential ("maintain the facility clearance RECORDS for the duration of performance") → skip that match.
const PASSIVE_RECORDS_ADMIN_RE = /^\s*(?:records?|documentation|files?|logs?|registers?)\b/i;
// (D) POST-AWARD / PERFORMANCE cure timing — the credential is OBTAINED after award / maintained through performance /
// required at DELIVERY (a curable onboarding or product spec), with NO pre-award anchor → SKIP (safe: it is not a bid gate).
// Bare "prior to performing/accessing" is DELIBERATELY excluded — "clearance required prior to performance" with NO cure
// window is a real bar (corpus synth-01/07); only an explicit cure WINDOW / interim-acceptable / sponsorship demotes.
const PASSIVE_POST_AWARD_CURE_RE = /\bwithin\s+(?:\d+|\w+)\s+(?:days?|months?|weeks?)\s+(?:of|after|from)\s+(?:contract\s+)?(?:award|start|the\s+start|commencement|performance|delivery|the\s+effective\s+date)\b|\bthroughout\s+(?:the\s+)?(?:period\s+of\s+)?(?:contract\s+)?performance\b|\b(?:during|for)\s+(?:the\s+)?(?:period\s+of\s+)?(?:duration\s+of\s+)?performance\b|\bfor\s+the\s+duration\s+of\s+(?:performance|the\s+contract)\b|\bafter\s+(?:contract\s+)?award\b|\bwill\s+sponsor\b|\bgovernment\s+will\s+(?:sponsor|process|arrange|obtain)\b|\bat\s+time\s+of\s+delivery\b|\binterim\s+(?:eligibility|clearance)\s+(?:is\s+)?acceptable\b/i;
const PASSIVE_PRE_AWARD_ANCHOR_RE = /\bas\s+of\s+the\s+(?:date\s+of\s+award|proposal\s+due\s+date|award\s+date|closing\s+date)\b|\bat\s+(?:the\s+)?(?:time\s+of\s+(?:award|proposal|bid|submission)|proposal\s+submission|bid\s+opening)\b|\bprior\s+to\s+award\b|\bunawardable\b|\bineligible\s+for\s+(?:award|consideration)\b|\bnon[\s-]?responsi\w*\b/i;
// (E) ACCESS-TO-BID carve-out (card #562 Item 2) — a credential that gates RECEIPT of the materials required to prepare a
// responsive quote (the TDP / bid package / solicitation drawings) is a BID-eligibility bar → FLAG (NHR). This is the
// COMPLEMENT of the frozen JCP/DD-2345 decision-gate key (`detectJcpGate`/`JCP_RE` in audit-engine.ts — NOT touched here):
// that key stays inert when no TDP is required; this fires when a clearance/credential gates a REQUIRED TDP. Access-to-
// PERFORM ("condition of access to Building 7", "may access the reading room") is NOT here — it stays SKIP. Ambiguity →
// fail-toward-review (the credential + a receive/obtain-the-bid-materials shape), never a silent skip.
const PASSIVE_ACCESS_TO_BID_RE = /\b(?:precondition|prerequisite|required|contingent(?:\s+(?:up)?on)?|condition\s+precedent|necessary)\b[^.!?]{0,45}?\b(?:to\s+)?(?:receiv\w+|obtain\w+|access(?:ing)?|be\s+(?:furnished|provided|granted|given))\b[^.!?]{0,30}?\b(?:the\s+)?(?:technical\s+data\s+package|\btdp\b|bid\s+(?:package|documents?|materials?|set)|solicitation\s+(?:package|documents?|attachments?|drawings?)|proposal\s+(?:package|materials?)|rfp\s+(?:package|documents?)|drawings?\s+(?:and\s+specifications?\s+)?(?:required|needed|necessary)|data\s+package)\b/i;
// A GOOD installed / serviced / fabricated BY a supply-chain agent — the credential is predicated of the installer, not
// the bidder. Physical-workmanship verbs only (NOT "provide"/"perform" — those are what the OFFEROR does).
const SUPPLY_AGENT_INSTALL_RE = /\b(?:install|assembl|servic|maintain|repair|erect|mount|fabricat)\w*\s+(?:[\w,/:.\-]+\s+){0,4}?by\s+(?:an?\s+|the\s+)?(?:authorized\s+(?:dealer|distributor|installer|resell?er)|manufacturer|oem)\b/i;
export function passiveFrameEligBarSentence(sentence: string, declaredSetAside?: string | null): boolean {
  if (!PASSIVE_CREDENTIAL_NOUN_RE.test(sentence)) return false;         // no chartered credential / supply-chain noun → not this class
  if (PASSIVE_DEFINITION_CONTEXT_RE.test(sentence)) return false;       // (A) glossary / acronym-legend describing the term → not a requirement
  // (A2) incumbent/predecessor NARRATIVE — release ONLY when the credential is the incumbent's, i.e. NO offeror-scoped
  // consequence and NO offeror subject in the sentence (Gate-2 P1: the old bare token suppressed comparative offeror bars).
  if (PASSIVE_INCUMBENT_NARRATIVE_RE.test(sentence) && !PASSIVE_ELIG_CONSEQUENCE_RE.test(sentence) && !PASSIVE_ACCESS_TO_BID_RE.test(sentence) && !PASSIVE_OFFEROR_SUBJECT_RE.test(sentence)) return false;
  if (SUPPLY_AGENT_INSTALL_RE.test(sentence)) return false;             // a GOOD installed BY a dealer (workmanship agent) → not a bidder bar
  // (D) POST-AWARD-curable onboarding / product-delivery spec with NO pre-award anchor → SKIP (a bid gate it is not).
  // Gate-2 P1: a bid/award CONSEQUENCE (or access-to-bid) VETOES the cure-release — a clearance "maintained throughout
  // performance" that ALSO carries "will not be considered" / "only firms … may propose" is still a pre-award bar. The
  // curable-timing phrase only releases when NO bid-scoped consequence rides along (PASSIVE_PRE_AWARD_ANCHOR_RE is a strict
  // subset of the consequences, so it alone left this gap).
  if (PASSIVE_POST_AWARD_CURE_RE.test(sentence) && !PASSIVE_PRE_AWARD_ANCHOR_RE.test(sentence) && !PASSIVE_ELIG_CONSEQUENCE_RE.test(sentence) && !PASSIVE_ACCESS_TO_BID_RE.test(sentence)) return false;
  if (isSelfCertDemotableSentence(sentence, declaredSetAside)) return false; // BINDING — same demotion authority; self-cert cannot launder a passive bar
  // (B/C) the load-bearing POSITIVE gate: an offeror-scoped eligibility CONSEQUENCE anywhere in the sentence, OR a
  // possession verb GOVERNING (within ~5 words before) some credential-noun match. Ambiguity (noun present, no
  // consequence, no governing possession) → SKIP (a bare mention is not a bar; the safe direction is proven by the
  // over-fire corpus). A genuine bar always carries one or the other.
  // Gate-2 P1 (assessed, deliberately NOT narrowed): a co-resident consequence about a DIFFERENT subject ("the pricing
  // narrative will not be considered; welding is performed in the secret clearance annex") can over-fire here. Every
  // attempted proximity/same-clause narrowing REGRESSED real split-clause bars into the catastrophic UNDER-fire direction
  // (e.g. "Items offered must appear on the QPL at bid opening; non-listed items are not acceptable" — noun and the
  // operative consequence legitimately live in different clauses). Over-fire is the SAFE direction (covered section →
  // human review); under-fire is a hard zero. Per [[feedback_reconstruction_treadmill_pivot_recognizer]] this stays an
  // accepted over-fire rather than a deeper reconstruction of the seam. The co-resident explicit bar still catches.
  if (PASSIVE_ELIG_CONSEQUENCE_RE.test(sentence)) return true;
  if (PASSIVE_ACCESS_TO_BID_RE.test(sentence)) return true;            // (E) credential gates receipt of the quote-prep materials → bid bar
  for (const m of sentence.matchAll(new RegExp(PASSIVE_CREDENTIAL_NOUN_RE.source, "gi"))) {
    const ns = m.index ?? 0, ne = ns + m[0].length;
    const pre = sentence.slice(Math.max(0, ns - 72), ns);              // wide enough for "obtain and maintain a favorably adjudicated … [noun]"
    const post = sentence.slice(ne, ne + 42);
    if (/\b(?:no|not|without|n['’]t)\b[\s\w,'()./\-]{0,20}$/i.test(pre)) continue;    // negated ("no offeror is required to hold [X]") → not governing
    if (PASSIVE_RECORDS_ADMIN_RE.test(post)) continue;                                // "[clearance] records" → paperwork admin, not holding it
    if (/\blower[\s-]?tier\b|\bsub[\s-]?tier\b/i.test(pre)) continue;                 // "any LOWER-TIER supplier shall be an authorized distributor" → flow-down spec, not the prime's bid
    // The possession / copula branch fires only when a DIRECTIVE governs it (must/shall/required to) — round 2 proved a
    // BARE participle ("only personnel HOLDING a clearance may access") is a descriptive site-access rule, not a bid bar.
    // Directive is checked in a WIDER window (~110) since "must" can sit ahead of a compound verb ("must be able to obtain
    // and maintain a … polygraph"), while the possession verb itself stays in the tight ~72 pre-window.
    const wide = sentence.slice(Math.max(0, ns - 110), ns);
    const directive = /\b(?:must|shall|required\s+to|will\s+need\s+to|are\s+required\s+to|to\s+be)\b/i.test(wide);
    // a PRODUCT-COMPLIANCE / labor noun needs an OFFEROR subject to be a firm-possession bar (else it is a product spec).
    const okScope = !PASSIVE_WEAK_ISREQ_NOUN_RE.test(m[0]) || PASSIVE_OFFEROR_SUBJECT_RE.test(wide);
    if (directive && okScope && PASSIVE_POSSESSION_GOVERN_RE.test(pre)) return true;  // "shall possess an active [FCL]", "must … maintain a [polygraph]"
    if (directive && okScope && PASSIVE_COPULA_GOVERN_RE.test(pre)) return true;      // "must be a [VAR]"
    if (!PASSIVE_WEAK_ISREQ_NOUN_RE.test(m[0]) && PASSIVE_IS_REQUIRED_AFTER_RE.test(post)) return true; // "[TS/SCI clearance] is required" (firm-credential only)
  }
  return false;
}

function sectionUngroundedEligBars(text: string, findings: TypedFinding[], declaredSetAside?: string | null): string[] {
  if (!hasEngineText(text)) return [];                                   // unread / unreadable region — nothing to floor
  const nText = norm(text);                                             // regex + excerpt spans share this coordinate space
  // Decision-bearing (non-`dropped`) findings grounded IN this section, as [start,end) spans over nText. A finding COVERS
  // a bar only when its grounded span OVERLAPS the bar's matched span — a benign finding grounded ELSEWHERE in the
  // section can never mask an eligibility bar (the UNDER_ABSTAIN=0 guarantee; mirrors noticeBodyEligibilityUngrounded).
  const covering: Array<[number, number]> = [];
  for (const f of findings) {
    if (disposeFinding(f) === "dropped") continue;
    const ex = norm(analyzedExcerptOf(f) || "");
    if (!ex) continue;
    const s = nText.indexOf(ex);
    if (s >= 0) covering.push([s, s + ex.length]);
  }
  const bars: string[] = [];
  const barSentences = new Set<string>();                              // dedupe: a bar caught by BOTH scans emits once
  // BOUNDED WALK (DRY-stamp perf caveat): cap the boundary scan at ±SENT_WINDOW so a pathological terminator-free giant
  // input is O(n) overall, not O(n²). Real solicitation sentences are far shorter than the window, so the extracted
  // sentence is IDENTICAL on realistic (period-terminated) prose — fidelity-preserving; only a degenerate no-`.!?`
  // mega-string is capped (which only makes the recognizer see LESS context ⇒ fails toward the floor, the safe pole).
  const SENT_WINDOW = 600;
  const enclosingSentence = (hs: number, he: number): string => {
    let ss = hs; const ssMin = Math.max(0, hs - SENT_WINDOW); while (ss > ssMin && !".!?".includes(nText[ss - 1])) ss--;
    let se = he; const seMax = Math.min(nText.length, he + SENT_WINDOW); while (se < seMax && !".!?".includes(nText[se])) se++;
    return nText.slice(ss, se).trim();
  };
  const scan = new RegExp(ELIGIBILITY_BAR_RE.source, "gi");             // global clone; bounded-quantifier → linear
  for (const m of nText.matchAll(scan)) {
    const hs = m.index ?? 0, he = hs + m[0].length;
    if (covering.some(([s, e]) => s < he && hs < e)) continue;          // grounded by an overlapping finding → analyzed
    // enclosing sentence — sentence-precise (not a window) so a real bar elsewhere is never masked by a benign neighbour.
    const sentence = enclosingSentence(hs, he);
    if (isSelfCertDemotableSentence(sentence, declaredSetAside)) continue; // bidder-self-determinable → not a firm-only bar
    if (isNonBidderEligibilitySentence(sentence)) continue;               // R1 — goods-acceptance / form-field eligibility, not a bidder bar
    if (sentence) { barSentences.add(sentence); bars.push(sentence); }    // push every match (Phase-4 byte-identical); Set only feeds the passive cross-dedup
  }
  // PHASE 5 — passive / noun-frame scan (flag-gated; OFF ⇒ this block never runs ⇒ byte-identical to Phase 4, Rule 61).
  // Same covering-overlap → enclosing-sentence → passiveFrameEligBarSentence (which itself routes the self-cert demotion
  // authority). A passive firm-credential / supply-chain bar co-resident with a benign grounded finding surfaces here.
  // KNOWN SCOPE (Gate-2 P2, accepted): this passive scan runs ONLY over §{B,C,D,E,F,H} section text (its sole caller is the
  //   COVERED_DIRECT floor). Two documented residuals, both narrow: (P2-1) AUDIT_ELIG_BAR_PASSIVE_FRAME is functionally
  //   SUBORDINATE to AUDIT_COVERED_DIRECT_BAR_FLOOR — the passive scan cannot run unless the covered_direct floor is also
  //   armed (making them independent would run the covered_direct floor when its own flag is OFF, breaking that flag's
  //   byte-identity the other way). The arming plan flips BOTH together (verified in the pre-fire checklist). (P2-2) a
  //   passive-frame bar in the NOTICE BODY (not a §-lettered section) is out of this scan's scope; the notice-body floor
  //   still catches it whenever the credential noun is an ACTIVE ELIGIBILITY_BAR_RE bare token (facility/security clearance,
  //   TS/SCI-cleared, CMMC, AS9100, ISO9001, ITAR, eligible/ineligible/debarred, set-aside, socioeconomic programs) — the
  //   residual is only a passive-framed bar whose noun is passive-vocab-only (e.g. bare polygraph / VAR / QPL) stated in the
  //   synopsis body. Both are under-fire residuals in the safe-to-defer tail, carded for the CEO scope batch, NOT chased here.
  if (process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME === "true") {
    for (const m of nText.matchAll(new RegExp(PASSIVE_CREDENTIAL_NOUN_RE.source, "gi"))) {
      const hs = m.index ?? 0, he = hs + m[0].length;
      if (covering.some(([s, e]) => s < he && hs < e)) continue;        // grounded by an overlapping finding → analyzed
      const sentence = enclosingSentence(hs, he);
      if (!sentence || barSentences.has(sentence)) continue;            // already emitted by the active-verb scan → once
      if (!passiveFrameEligBarSentence(sentence, declaredSetAside)) continue; // noun+frame+not-agent+not-self-cert gate
      barSentences.add(sentence); bars.push(sentence);
    }
  }
  return bars;
}

export function completenessOf(ctx: AuditToolContext, required: string[], findings: TypedFinding[], sectionsRead: Set<string>, opts?: { sectionMDepth?: boolean; boilerplateAttest?: { sections: string[]; swept: boolean }; declaredSetAside?: string | null }): { covered: string[]; missing: string[]; attestations: SectionAttestation[] } {
  const attestations: SectionAttestation[] = [];
  // Brain card 288 — PART36 construction path (ANCHOR-based, compression-boundary-safe). `required` here is the sealed
  // construction element set. An element is covered iff (1) its compression-STABLE ANCHOR SURVIVED into the read source
  // (the compressor did NOT drop this binding content) AND (2) a grounded finding carries that anchor. A present
  // element the compressor dropped → uncovered ⇒ INCOMPLETE (the false-COMPLETE-via-digest interceptor). Certifies
  // against the SEALED anchor set from FULL text, never the digest self-certifying (Brain #1). :574 formula untouched.
  if (ctx.constructionManifest && procurementPart(ctx) === "part36-construction") {
    const nrm = (s: string) => (s || "").replace(/[‐-―]/g, "-").replace(/\s+/g, " ").toLowerCase().trim();
    // Which documents carry a GROUNDED finding — an element is analyzed if a finding lands in the doc that carries it
    // (findingProvenance maps each finding's excerpt to its assembled-doc region; "(ungrounded)" excluded).
    const analyzedDocs = new Set(findingProvenance(ctx.fullSource, findings).map((p) => p.doc).filter((d) => d && d !== "(ungrounded)"));
    // THE HAYSTACK DIRECTION — the one place widening can manufacture coverage rather than lose it.
    // constructionCoverage does `nExcerpts.some((ex) => ex.includes(nAnchor))` (audit-construction-manifest.ts:227):
    // the excerpt is the HAYSTACK and the manifest element's anchor is the needle. Everywhere else in this
    // file the excerpt is the needle, where a longer span can only be harder to match. Here a head widened
    // backward across an extractor wrap that carries a NEIGHBOURING element's anchor — a Davis-Bacon WD
    // header, a CSI code — marks that element ANALYZED, and the part-36 completeness proof returns COMPLETE
    // for an element no finding examined.
    const cov = constructionCoverage(ctx.constructionManifest, ctx.fullSource, findings.map((f) => analyzedExcerptOf(f) || ""), analyzedDocs);
    for (const e of ctx.constructionManifest.elements) {
      if (!e.present) continue;
      const covered = cov.covered.includes(e.key);
      const dropped = cov.droppedByCompressor.includes(e.key);
      // Provenance backstop (adversarial review): a covered element cites the findings whose excerpt carries its anchor.
      // Same haystack direction as the line above, and worse in consequence: this one CITES the finding's id
      // as the provenance backstop, so a swallowed neighbouring anchor does not just certify the element —
      // it names a finding as the proof for text that finding never analyzed.
      const cited = covered && e.anchor ? findings.filter((f) => f.id && nrm(analyzedExcerptOf(f) || "").includes(nrm(e.anchor!))).map((f) => f.id!) : [];
      attestations.push({
        section: e.key,
        status: covered ? "covered_direct" : "obligations_ungrounded",
        obligations: covered ? [] : [dropped
          ? `[compressor-dropped] construction element '${e.key}' sealed at ingest but its anchor is absent from the read source — cannot certify complete`
          : `construction element '${e.key}' present in source but no grounded finding analyzed it`],
        citedFindingIds: cited,
        ungrounded: covered ? [] : [e.key],
        ...(e.regionHash ? { sectionHash: e.regionHash } : {}),
      });
    }
    return { covered: cov.covered, missing: cov.missing, attestations };
  }
  for (const sec of required) {
    // C-3 (Brain C.c): the completeness PROOF reads the FULL section (uncapped), NOT the lens's capped view — an
    // obligation past the lens read-cap must surface as ungrounded, never be invisible. `lensTruncated` records
    // that the LENS saw only a slice (so a section with no direct finding + a truncated lens view cannot be
    // certified thin/covered — it is a truncation event ⇒ INCOMPLETE below).
    const text = sectionFullText(ctx, sec); const nText = norm(text);
    const lensTruncated = readSection(ctx, sec).truncated;
    if (!sectionsRead.has(sec)) { attestations.push({ section: sec, status: "unread", obligations: [], citedFindingIds: [], ungrounded: [] }); continue; }
    // S7 (Brain card 274) — a section is covered_direct ONLY by a finding CITED TO THAT SAME SECTION whose excerpt is
    // in the section text. Without the findingSection guard, a §B-cited finding whose sentence coincidentally appears
    // in §H/§M text falsely certified §H/§M covered → false-COMPLETE. Same guard the covered_attested path uses (groundedBy).
    // Needle direction (safe — a longer span can only fail to match), but still the wrong question: this asks
    // whether the ANALYSIS covered the section. The head pass grounds against `groundingSource`, while
    // `nText` comes from ctx.sections/fullSource; on a compressed-digest run the widened span is verbatim in
    // the former and absent from the latter, so covered_direct is LOST and the run goes false INCOMPLETE.
    const direct = findings.filter((f) => f.excerpt && findingSection(f) === sec && nText.includes(norm(analyzedExcerptOf(f))));
    // PHASE 4 (Brain, flag AUDIT_COVERED_DIRECT_BAR_FLOOR) — COVERED_DIRECT HARD-BAR FLOOR. Before the covered_direct
    // blanket short-circuit (below) OR the read_no_obligation valve can certify a non-per-obligation binding section
    // ({B,C,D,E,F,H}) covered, refuse if the section carries an UNGROUNDED (non-self-cert-demotable) eligibility bar
    // co-resident with the grounded finding. Emit the REAL bar sentence as obligations_ungrounded so escalation flows
    // through the engine's OWN importanceOf authority in BOTH flag states (V1 missing→INCOMPLETE · V2 disqualifier
    // Uncovered→escalate). Scoped away from §L/§M (already per-obligation) and §I/§K (boilerplate-attest + self-cert).
    // Clean sections return [] ⇒ byte-identical. Flag default-OFF ⇒ guard never runs ⇒ byte-identical (Rule 61).
    if (process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR === "true" && !PER_OBLIGATION_SECTIONS.has(sec) && !BOILERPLATE_ATTESTABLE.has(sec)) {
      const eligBars = sectionUngroundedEligBars(text, findings, opts?.declaredSetAside);
      if (eligBars.length) {
        console.warn(`[coverage] covered_direct HARD-BAR floor: §${sec} carries ${eligBars.length} ungrounded eligibility bar(s) ("${eligBars[0].slice(0, 90)}") co-resident with a grounded finding — blanket covered_direct REFUSED → obligations_ungrounded (escalate via importanceOf)`);
        attestations.push({ section: sec, status: "obligations_ungrounded", obligations: eligBars, citedFindingIds: direct.map((f) => f.id!).filter(Boolean), ungrounded: eligBars });
        continue;
      }
    }
    // T1-12 — restrict the covered_direct blanket short-circuit to NON-per-obligation sections. For §L/§M a
    // single grounded obligation cannot flip the whole section covered; fall through to the per-obligation
    // proof below (the direct findings still count there via groundedBy, so a fully-grounded §L/§M certifies
    // covered_attested — but a long §L with grounded head + ungrounded tail now correctly reads INCOMPLETE).
    if (direct.length && !PER_OBLIGATION_SECTIONS.has(sec)) { attestations.push({ section: sec, status: "covered_direct", obligations: [], citedFindingIds: direct.map((f) => f.id!).filter(Boolean), ungrounded: [] }); continue; }
    // Fix 2 (Brain card 285) — BOILERPLATE ATTESTATION. A configured boilerplate section (§I/§K) with no direct
    // finding may be ATTESTED covered — but ONLY when the deterministic §I/§K trap detectors SWEPT it (condition 2:
    // opts.boilerplateAttest.swept, set by the orchestrator when the trap sweep ran) AND the section text is present
    // (condition 1: hash-bound — the attestation carries sha256 of the section text). This certifies COVERAGE only;
    // it can NEVER suppress a detector hit (condition 3) — a trap-sweep finding cited to this section already
    // returned covered_direct above and drives the verdict. Fires only for the read, present, configured sections.
    // Adversarial-review hardening (card 285): (a) INTERNAL clamp — completenessOf is exported public API, so a
    // caller passing sections:["M"] must NEVER boilerplate-attest a binding-obligation section; the fixed allowlist
    // {I,K} governs regardless of the arg. (b) A lens-TRUNCATED section is NOT attestable — its unread tail may carry
    // a bar the trap sweep never saw; fall through to the truncation→INCOMPLETE path (honest, never a false-COMPLETE).
    if (opts?.boilerplateAttest?.swept && BOILERPLATE_ATTESTABLE.has(sec) && opts.boilerplateAttest.sections.includes(sec) && !lensTruncated && text.trim().length > 0) {
      attestations.push({ section: sec, status: "covered_attested_boilerplate", obligations: [], citedFindingIds: [], ungrounded: [], sectionHash: createHash("sha256").update(text, "utf8").digest("hex") });
      continue;
    }
    // 5b §M DEPTH — REFINED (Brain card 137 ruling), flag-gated, §M ONLY (never §L/§C or the coreMissing path).
    // Fire "not evaluated" ONLY when ALL THREE hold: (1) NO direct grounded finding (the covered_direct check
    // above already returned for that case), (2) NO award-basis token in the criteria region, AND (3) the criteria
    // region is genuinely THIN (a stub). So a POPULATED non-token §M (weighted/adjectival) is NOT flagged
    // (condition 3 fails) — false-negative closed. Both checks run on the boundary-delimited criteria region, so a
    // trailing attachment can neither false-PASS (token) nor inflate the word count (thin). OFF ⇒ identical.
    if (opts?.sectionMDepth && sec === "M") {
      const crit = sectionMCriteria(text);
      if (!EVAL_FACTOR_RE.test(crit) && isThin(crit)) {
        attestations.push({ section: sec, status: "obligations_ungrounded", obligations: ["evaluation criteria not found / not evaluated"], citedFindingIds: [], ungrounded: ["evaluation criteria not found / not evaluated"] }); continue;
      }
    }
    const { obligations, truncated: obTruncated } = obligationsOf(text);
    // ENGINE-5-ROOT #1 — commercial §L false-INCOMPLETE fix. On a Part-12 commercial buy, §L is the
    // incorporated standard FAR 52.212-1 provision + the agency Addendum; the canned 52.212-1 (a)-(l)
    // sentences are never quoted verbatim by a finding, so grading them per-obligation vetoes an
    // otherwise-complete §L. Drop ONLY that boilerplate from the graded set — but ONLY when §L was
    // demonstrably READ+analyzed (≥1 direct §L-cited grounded finding, `direct` above). The agency
    // Addendum bars still require grounding, so a genuinely-missed agency instruction still reads
    // INCOMPLETE. FAIL-SAFE stack: an unread §L never reaches here (`unread` at line 466); a read §L
    // with zero §L findings has direct.length===0 → filter does NOT fire → full per-obligation proof.
    let obligationSet = obligations;
    // Fork-1(ii): the 52.212-1 pre-filter was part12-commercial-only; extend it to Part-15/Part-36 under the B1 flag
    // so a construction/negotiated §L that incorporates the canned FAR provision isn't vetoed by its boilerplate.
    // (A no-op where no 52.212-1 boilerplate is present — safe, fail-toward-covered on boilerplate only.)
    if (sec === "L" && direct.length > 0 && (procurementPart(ctx) === "part12-commercial" || (COVERAGE_LEDGER_V2 && procurementPart(ctx) !== "unknown"))) {
      obligationSet = obligations.filter((ob) => !isFar52121Boilerplate(ob));
    }
    // C-3/C-7: a section the LENS could only partially read (lensTruncated) or whose obligation set overflowed the
    // proof cap (obTruncated) cannot be certified "thin"/covered — the unread tail may carry a bar. A truncation
    // event with no direct grounded finding ⇒ obligations_ungrounded ⇒ INCOMPLETE (never a silent COMPLETE).
    if (!obligationSet.length) {
      if (lensTruncated) { attestations.push({ section: sec, status: "obligations_ungrounded", obligations: [], citedFindingIds: [], ungrounded: [`[truncated] §${sec} exceeds the lens read-cap — tail not read, cannot certify complete`] }); continue; }
      // UNIT #12 (Brain, obligationsOf orthography) — GARBLE FLOOR on the read_no_obligation relief valve. obligationsOf finds
      // obligations by matching whole-sentence `shall/must/provide/…` verbs; on an OCR-MOJIBAKE section those verbs are corrupted,
      // so the section returns ZERO obligations and would FALSELY attest "read_no_obligation" → covered → false coverageComplete →
      // deriveVerdict skips its INCOMPLETE cap. The dangerous failure for THIS gate is OVER-FIRE (a clean-but-unusual section →
      // false-INCOMPLETE → a covered section to human review), so the discriminator is a POSITIVE corruption signal (`looksMojibake`
      // — hard-corruption char density OR ≥30% non-ASCII), NOT common-word density: clean wage/CLIN/price tables, clause-number
      // lists, and acronym blocks are LOW on common words BY NATURE and must NEVER floor (Gauntlet R1). Clean ASCII text scores ~0
      // on the corruption axis ⇒ zero over-fire by construction; a homoglyph-that-stays-clean-Latin-1 is a SAFE under-fire (stays
      // covered = status quo). Dropped-periods/glue instead UNDER-count to one mega-sentence (non-empty → grounded-or-ungrounded
      // path), already fail-safe. Flag default-OFF ⇒ unchanged.
      if (process.env.AUDIT_OBLIGATION_GARBLE_FLOOR === "true" && looksMojibake(text)) {
        console.warn(`[coverage] read_no_obligation valve REJECTED for §${sec} — section text is OCR-mojibake (looksMojibake: corruption-char density); obligationsOf cannot certify "no obligation" on garbage → obligations_ungrounded (INCOMPLETE)`);
        attestations.push({ section: sec, status: "obligations_ungrounded", obligations: [], citedFindingIds: [], ungrounded: [`[garbled] §${sec} text is OCR-garbled — obligationsOf cannot be trusted to certify "no obligation"; requires clean text or a grounded finding`] }); continue;
      }
      attestations.push({ section: sec, status: "read_no_obligation", obligations: [], citedFindingIds: direct.map((f) => f.id!).filter(Boolean), ungrounded: [] }); continue;
    }
    const cited = new Set<string>(); const ungrounded: string[] = [];
    for (const ob of obligationSet) { const ids = groundedBy(ob, findings, sec, nText); if (ids.length) ids.forEach((i) => cited.add(i)); else ungrounded.push(ob); }
    if (obTruncated) ungrounded.push(`[truncated] §${sec} has more than ${MAX_OBLIGATIONS} obligation sentences — tail not proven`);
    // Fork-1(i): a READ §L/§M whose ungrounded obligations are ALL boilerplate (and none are a [truncated] marker) →
    // covered-with-signal, not missing. Any disqualifier/ambiguous ungrounded obligation, or a truncation marker,
    // keeps status obligations_ungrounded → escalates (the non-negotiable invariant). Only PER_OBLIGATION §L/§M.
    let status: SectionAttestation["status"];
    if (!ungrounded.length) status = "covered_attested";
    // #3 (Brain card #472) — the ledger now also accepts #1's DEMOTED classes (govt-eval methodology + conditional-frame
    // TINA non-bar) via the SHARED isLedgerDemotableNonBar truth, so a fully-read §L whose only ungrounded residual is a
    // conditional-15.403-1 recital reads covered instead of false-missing (the 6439ac27 driver). MIXED-SECTION INVARIANT
    // (card #472, non-negotiable): the `importanceOf(u) !== "disqualifier"` veto sits FIRST inside the .every, so even one
    // real ungrounded disqualifier among a crowd of demotable strings fails the .every → section STAYS missing → the bar
    // STILL escalates. isLedgerDemotableNonBar is self-guarded too (can't fire on a bar); the explicit veto is the belt.
    // Flag-OFF (COVERAGE_LEDGER_V2 or the demotion gates) ⇒ demotable predicate returns false ⇒ byte-identical to B1.
    else if (COVERAGE_LEDGER_V2 && PER_OBLIGATION_SECTIONS.has(sec)
      && ungrounded.every((u) => !/^\[(truncated|compressor-dropped)\]/i.test(u)
            && importanceOf(u) !== "disqualifier"
            && (importanceOf(u) === "boilerplate" || isLedgerDemotableNonBar(u))))
      status = "covered_boilerplate_signal";
    else status = "obligations_ungrounded";
    attestations.push({ section: sec, status, obligations: obligationSet, citedFindingIds: [...cited], ungrounded });
  }
  const covered = attestations.filter((a) => a.status === "covered_direct" || a.status === "covered_attested" || a.status === "covered_attested_boilerplate" || a.status === "covered_boilerplate_signal" || a.status === "read_no_obligation").map((a) => a.section);
  return { covered, missing: required.filter((s) => !covered.includes(s)), attestations };
}

// ── UNIT 2.2 (cards #548/#549) — TRUE-LOCATION attribution for the gate reason ─────────────────────────
// On commercial packages the attestation's `section` key is a routed approximation (routeCommercialSections
// carves by content anchor) — dccce793's NHR banner said "in §L" for a sentence that lives at PWS §7.3.2,
// a fabricated attribution on the customer's verdict banner. This locator resolves an obligation sentence
// to its true position: the document region that contains it + the nearest preceding heading shape, plus
// any adjacent reference-only/scope note (carried INFORMATIONALLY into the reason — the pole never moves).
// Deterministic; heading/scope detection is SHAPE-based (numbered headings, SECTION letters, PWS labels;
// scope notes = explicit "reference only"-class phrases), never a vocabulary judgment about bar language.
// R1-F2 — heading candidates are VALIDATED, not just shape-matched: the numbered alternative captures the
// number AND its same-line tail; acceptance requires every outline component ≤ 99 (kills dotted dates
// "12.31.2025"), 2–4 components, and a letter-bearing tail (a real heading names something — kills bare
// wage-rate/table numerics "23.55" at line starts, ubiquitous in extracted WD tables).
// R3-F5 — 4th alternative: a BARE outline number alone on its line (title on the NEXT line — ubiquitous
// PDF-extraction rendering). Neither invisible (no decline) nor blindly accepted: headingAt validates it
// against the next line (depth ≥3 + letter-bearing next line ⇒ accepted heading; anything else ⇒ a
// rejected-numbered candidate that forces the decline).
const HEADING_SHAPE_RE = /(?:^|\n)[ \t]*(?:(?:PWS|SOW)\s*)?(?:§\s*)?(\d+(?:\.\d+){1,3})([.)\t ]+)([^\n]{0,80})|(?:^|\n)[ \t]*(SECTION\s+[A-M]\b[^\n]{0,60})|(?:^|\n)[ \t]*((?:PWS|Performance Work Statement|Statement of Work)\b[^\n]{0,60})|(?:^|\n)[ \t]*(?:§\s*)?(\d+(?:\.\d+){1,3})[ \t]*(?=\n|$)/gi;
const headingLabelOf = (m: RegExpExecArray): string | null => {
  if (m[1]) {
    const parts = m[1].split(".");
    if (parts.length < 2 || parts.length > 4 || parts.some((p) => Number(p) > 99)) return null;
    if (!/[A-Za-z]{2,}/.test(m[3] ?? "")) return null; // a heading names something — bare numerics rejected
    // R1-F2 (round 2): a DEPTH-2 number must be punctuation-delimited ("7.2. Key personnel" / "7.2)") —
    // a space-delimited two-component number with a text tail is the wage-rate/table shape
    // ("23.55 per hour"). Depth ≥3 ("7.3.2 Maintain…") reads as outline regardless of delimiter.
    if (parts.length === 2 && !/^[.)]/.test(m[2] ?? "")) return null;
    return `§${m[1]}`;
  }
  return (m[4] || m[5] || "").trim() || null;
};
const SCOPE_NOTE_RE = /[^.\n]{0,120}\b(?:for reference only|reference only|reference staffing|position is only for|only billable position|not (?:a )?required line items?|for (?:information(?:al)?|estimating) (?:purposes )?only|no separate payment)\b[^.\n]{0,120}/i;
export function locateObligationContext(fullSource: string, ob: string): { locatedAt: string; contextNote?: string } | null {
  if (!groundingVariantToleranceEnabled()) return null;
  // EXACT-FIRST: the obligation is a source sentence — a whitespace-tolerant literal search on its head
  // pins THE sentence (a variant-tolerant needle would hit a punctuation twin, mislocating again — the
  // exact failure being fixed). Variant needle only as fallback (e.g. extraction-normalized whitespace).
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = ob.trim().slice(0, 80).trim();
  const exactNeedle = head.length >= 20 ? new RegExp(esc(head).replace(/\s+/g, "\\s+"), "i") : null;
  // fallback needle from RAW leading tokens (articles KEPT — they exist in the source; only plural drift
  // and the punctuation class are tolerated)
  const rawTokens = ob.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).slice(0, 6);
  const variantNeedle = rawTokens.length >= 4
    ? new RegExp(rawTokens.map((t) => `${esc(t.length >= 4 && t.endsWith("s") ? t.slice(0, -1) : t)}s?`).join("[^a-z0-9]{1,6}"), "i")
    : null;
  if (!exactNeedle && !variantNeedle) return null;
  // TWO-PHASE region scan: the exact needle across ALL regions first — only when the literal sentence
  // exists nowhere does the variant fallback run (else the fallback hits a punctuation TWIN in an earlier
  // region and mislocates — the exact failure class being fixed). R1-F8: PRIMARY region scanned first per
  // phase (a cover letter quoting the PWS must not steal the attribution).
  const all = docRegions(fullSource ?? "");
  const regions = [...all.filter((r) => r.isPrimary), ...all.filter((r) => !r.isPrimary)];
  // For a heading candidate at a hit: scan to the END OF THE HIT'S LINE (not the hit index) — when the
  // outline number prefixes the located sentence itself ("7.4.1. Personnel who fail…"), cutting at the
  // hit would leave the heading tail empty and reject the TRUE heading.
  const headingAt = (regionText: string, index: number): { label: string; pos: number } | null => {
    const lineEnd = regionText.indexOf("\n", index);
    const scanText = regionText.slice(0, lineEnd === -1 ? regionText.length : lineEnd);
    let heading: { label: string; pos: number } | null = null;
    let rejectedNumberedPos = -1;
    const hre = new RegExp(HEADING_SHAPE_RE.source, "gi");
    let hm: RegExpExecArray | null;
    // R3-F5 + R4-F4 — bare-number line handler: accept as a heading ONLY when the LINE is just a deep
    // outline number (≥3 components, all ≤99), the NEXT line carries the title (letter-bearing), AND the
    // number is OUTLINE-CONSISTENT — a previously ACCEPTED numbered heading in this scan shares its first
    // component (real PDF-split outlines have their tree in-document; datelines "1.2.26" and version
    // numbers in cover letters don't). Else it is a rejected-numbered candidate that forces the decline.
    // Reached both via the dedicated bare alternative (m[6]) and via a first-alternative candidate whose
    // backtracked number+delimiter+tail reassembles to a bare number ("10.2.1" → "10.2"+"."+"1").
    const acceptedNumbers = new Set<string>(); // full accepted outline numbers — the R5-F4 parent-prefix key
    const bareNumberLabel = (matchStart: number, matchText: string): string | "rejected" => {
      const lineStart = matchText.startsWith("\n") ? matchStart + 1 : matchStart;
      const le = regionText.indexOf("\n", lineStart);
      const line = regionText.slice(lineStart, le === -1 ? regionText.length : le);
      const bare = /^[ \t]*(?:§\s*)?(\d+(?:\.\d+){1,3})[ \t]*$/.exec(line);
      if (!bare) return "rejected";
      const parts = bare[1].split(".");
      const nlEnd = le === -1 ? regionText.length : regionText.indexOf("\n", le + 1);
      const nextLine = regionText.slice(le + 1, nlEnd === -1 ? regionText.length : nlEnd);
      // R5-F4 — PARENT-PREFIX consistency (not first-component: root "1" is seeded by any outline and
      // datelines' first components 1-12 are all plausible roots): a bare "1.2.26" is accepted only when
      // "1.2" itself was an ACCEPTED heading. Residual (Brain-sanction pending): a real accepted parent
      // followed by a same-prefix dateline still fabricates — the inherent floor of any consistency gate.
      if (parts.length >= 3 && parts.length <= 4 && parts.every((p) => Number(p) <= 99)
        && /[A-Za-z]{2,}/.test(nextLine) && acceptedNumbers.has(parts.slice(0, -1).join("."))) return `§${bare[1]}`;
      return "rejected";
    };
    while ((hm = hre.exec(scanText)) !== null) {
      const label = headingLabelOf(hm);
      if (label) {
        heading = { label, pos: hm.index };
        const num = /^§([\d.]+)/.exec(label);
        if (num) acceptedNumbers.add(num[1]);
        continue;
      }
      if (hm[1] || hm[6]) {
        const bare = bareNumberLabel(hm.index, hm[0]);
        if (bare !== "rejected") {
          heading = { label: bare, pos: hm.index };
          acceptedNumbers.add(bare.slice(1));
        } else rejectedNumberedPos = hm.index;
      }
    }
    // R2-F2 — DECLINE, don't fall back: if a REJECTED numbered candidate sits NEARER the sentence than
    // the last accepted heading (mixed-delimiter docs, OCR-dropped dots), attributing to the farther
    // accepted heading is a confident misattribution. Null ⇒ the caller renders the legacy "in §<key>".
    if (rejectedNumberedPos > (heading?.pos ?? -1)) return null;
    return heading;
  };
  // R1-F8 (round 2) — a sentence DUPLICATED across documents (cover letters quote the PWS): collect the
  // exact hit in EVERY region and prefer (1) the primary region, (2) the deepest validated outline
  // heading (a §7.3.2 work-statement row outranks a cover letter's §1.1), (3) document order.
  const depthOf = (h: { label: string } | null) => (h && h.label.startsWith("§") ? h.label.split(".").length : h ? 1 : 0);
  let hit: { region: { name: string; text: string; isPrimary: boolean }; index: number; heading: { label: string; pos: number } | null } | null = null;
  if (exactNeedle) {
    const candidates = regions
      .map((region) => ({ region, m: exactNeedle.exec(region.text) }))
      .filter((c): c is { region: typeof regions[number]; m: RegExpExecArray } => !!c.m)
      .map((c) => ({ region: c.region, index: c.m.index, heading: headingAt(c.region.text, c.m.index) }));
    if (candidates.length) {
      // Depth outranks primary: write-order "primary" fallback (attachment-coverage flag OFF) can be a
      // cover letter quoting the PWS — the deepest validated outline heading is the sentence's true home.
      candidates.sort((a, b) => depthOf(b.heading) - depthOf(a.heading) || Number(b.region.isPrimary) - Number(a.region.isPrimary));
      hit = candidates[0];
    }
  }
  if (!hit && variantNeedle) {
    for (const region of regions) {
      const m = variantNeedle.exec(region.text);
      if (m) { hit = { region, index: m.index, heading: headingAt(region.text, m.index) }; break; }
    }
  }
  if (!hit) return null;
  {
    const { region, index, heading } = hit;
    const before = region.text.slice(0, index);
    // R1-F8: no VALIDATED heading ⇒ decline (the caller renders the legacy "in §<routed key>" reason) —
    // never a precise-sounding "(unheaded region)" on the customer banner.
    if (!heading) return null;
    // PWS/SOW context prefix when the numbered heading sits inside a work-statement region
    const pwsTail = /\b(?:PWS|Performance Work Statement|Statement of Work)\b/i.test(before) && heading.label.startsWith("§");
    const docName = region.name && region.name !== "(primary solicitation)" ? `${region.name} · ` : "";
    const locatedAt = `${docName}${pwsTail ? "PWS " : ""}${heading.label}`;
    // Scope note (R1-F3 + R2-F3): a note is ASSERTED as surrounding context ONLY when it sits in the
    // sentence's own outline node — in the near window AND with NO validated heading between note and
    // sentence (an intervening heading means the note belongs to the PREVIOUS node, e.g. a Physician
    // reference-note directly above a Nurse bar). Anything else — distant, or near-but-cross-node — is
    // carried in the LABELED verify-applicability form, which asserts nothing about governance.
    const windowStart = Math.max(0, index - 1200);
    const nearWindow = region.text.slice(windowStart, index + 600);
    const nearMatch = SCOPE_NOTE_RE.exec(nearWindow);
    let note: string | undefined;
    if (nearMatch) {
      const noteText = nearMatch[0].replace(/\s+/g, " ").trim();
      const noteAbs = windowStart + nearMatch.index;
      // same-node check (R2-F3 + R3-F8): the node STARTS at the located sentence's own accepted heading
      // (heading.pos) — a note BEFORE that heading belongs to the previous node (Physician note above a
      // Nurse bar). ALL forward notes (after the sentence) are labeled — a following note may open the
      // NEXT node; asserting it is never safe. Only a note between the sentence's own heading and the
      // sentence itself is ASSERTED as surrounding context.
      const crossNode = noteAbs < heading.pos;
      note = crossNode || noteAbs >= index
        ? (noteAbs < index ? `An earlier scope note appears in this document (verify it governs this requirement): "${noteText}".` : `A nearby scope note appears in this document (verify it governs this requirement): "${noteText}".`)
        : `Surrounding context: "${noteText}".`;
    } else {
      const sre = new RegExp(SCOPE_NOTE_RE.source, "gi");
      let far: string | undefined;
      let sm: RegExpExecArray | null;
      while ((sm = sre.exec(before)) !== null) far = sm[0];
      if (far) note = `An earlier scope note appears in this document (verify it governs this requirement): "${far.replace(/\s+/g, " ").trim()}".`;
    }
    return { locatedAt, ...(note ? { contextNote: note } : {}) };
  }
}

/** Default P2 — with no skeptic injected, soundness rests on Layer-1 grounding: every finding is already
 *  grounded (ungrounded ones were dropped in the loop), so the set is sound and all survive. A real
 *  adversarial skeptic (agentic refuter) is injected via opts.verify for paid runs. */
const groundingOnlyVerify: VerifyFn = async (_ctx, findings, _opts) => ({ sound: true, survived: findings, rejected: [] });

/** Run the full agentic audit cycle and DERIVE the verdict. Pure orchestration over injected model/verify. */
export async function runAgenticAudit(opts: OrchestratorInput): Promise<AuditResult> {
  const { ctx, experts, callModel, bidderProfile = null, maxTurns, signal } = opts;
  const verify = opts.verify ?? groundingOnlyVerify;

  // L3 (Brain card 265/267) — GROUNDED AGENTIC SECTION-FINDER, runs BEFORE everything else so a verified locate
  // augments ctx.sections for the experts, coverage, AND the completeness proof alike. Deterministic-primary:
  // fire ONLY on required sections coreMissingFor flags as not-located, and only the single-letter UCF keys
  // (A–M). A verified locate (anchor string-matches verbatim in source) is merged over the deterministic base;
  // a rejected/absent locate changes nothing → the section stays missing → INCOMPLETE (fail-safe, never a false
  // clear). Inert unless a finder was injected (AUDIT_SECTION_FINDER on) ⇒ flag-off is byte-identical.
  if (opts.sectionFinder) {
    const deterministicMissing = coreMissingFor(ctx, {
      requiresLM: requiresProposalSections(opts.noticeType),
      formIdentified: opts.formIdentified,
    });
    const targetKeys = deterministicMissing.filter((k) => /^[A-M]$/.test(k));
    if (targetKeys.length > 0) {
      const { located, attempts } = await runSectionFinder({ fullSource: ctx.fullSource, targetKeys, finder: opts.sectionFinder, signal });
      for (const a of attempts) {
        console.log(`[L3-finder] §${a.key}: ${a.reason}${a.rejected ? " [REJECTED — fail-safe INCOMPLETE]" : ""}`);
      }
      if (Object.keys(located).length > 0) {
        // Pin base ∪ located onto ctx.sections — once set, readSection reads it directly (no re-derivation),
        // so every downstream reader sees the located §L/§M. Located text is verbatim source, never model prose.
        ctx.sections = { ...materializeSections(ctx), ...located };
      }
    }
  }

  // P0 — manifest of binding sections present in this package.
  const required = buildManifest(ctx);

  // P1 — run the agentic experts in parallel; each grounds its own findings. Assign stable finding IDs +
  //       collect the pure-observer trace (sections read, tool calls) for completeness + adjudication.
  const perLens: Record<string, number> = {};
  const trace: AuditResult["trace"] = {};
  const sectionsRead = new Set<string>();
  const docsRead = new Set<string>();          // Brain #347 — union of read_document'd binding attachments (provably-read)
  const attestedDocs = new Set<string>();      // Brain #347 — union of "read, no operative obligation" attestations
  let findings: TypedFinding[] = [];
  let allConverged: boolean;

  if (opts.seedFindings) {
    // JUDGMENT-FIRST (Brain cards 276/279) — the holistic proposer already read the whole source and reasoned to
    // this finding set; SKIP the paid lenses and run the deterministic rail (P1.5→P5) over it. RE-GROUND the seed
    // against real source with the SAME isGrounded substring check the lenses use: a finding whose excerpt is NOT
    // verbatim in source has grounded set false and is DROPPED here (fail-safe — a hallucinated/paraphrased excerpt
    // never survives, Rule 64 / I3). This is the load-bearing re-grounding the proposer's grounded:false depends on.
    // MERGE NOTE (E1 × main, 2026-07-28) — E1 replaced the index-based `judgment#${j}` numbering with real id
    // uniqueness; main split the same map so the DROPPED subset is nameable for the grounding-backstop telemetry
    // below. Independent concerns, both kept: the map result is bound first, then filtered, then E1's id pass runs
    // on the survivors. The index-based numbering E1 deleted is NOT reinstated.
    const _seedRegrounded = opts.seedFindings.map((f) => ({ ...f, grounded: isGrounded(ctx, f) }));
    const reground = _seedRegrounded.filter((f) => f.grounded);
    // ID UNIQUENESS ON THE SEED PATH (review round 4, finding #2). This used to be `f.id ?? judgment#${j}` with
    // `j` the index AFTER the grounded filter — the one numbering the dupe-id fix did not convert. A seed is a
    // prior run's `result.findings`, which MIXES id-carrying rows with id-less ones: the notice-body eligibility
    // and size-standard caveat emitters push findings with no `id` at all. Drop three judgment rows in
    // re-grounding and the id-less rows slide onto indices a surviving `judgment#N` already holds — the exact
    // duplicate `applyHeadRepairsTo` matches on, which writes one finding's quote onto ANOTHER's requirement.
    // A seed banked before the dupe-id fix can also carry duplicates of its own, so uniqueness is enforced
    // across the whole set rather than only over the id-less rows: first claim wins, every later collision is
    // re-issued through the same helper the lens paths use.
    const claimed: TypedFinding[] = [];
    const reissue: TypedFinding[] = [];
    const seenSeedIds = new Set<string>();
    for (const f of reground) {
      if (f.id && !seenSeedIds.has(f.id)) { seenSeedIds.add(f.id); claimed.push(f); } else reissue.push(f);
    }
    assignUniqueFindingIds(reissue, "judgment", claimed);
    findings = reground;
    perLens["judgment"] = reground.length;
    // Same VERDICT-INERT grounding-backstop telemetry as the lens path below — this re-grounding drops findings by
    // the identical isGrounded gate, so its drops were equally invisible. Counted here rather than reported as zero.
    const _seedDrops = _seedRegrounded.filter((f) => !f.grounded);
    // Same cost discipline as the lens path: when the corpora do not diverge, isGrounded already ran the
    // identical fullSource search and returned false, so the count is provably 0 — don't pay to recompute a
    // constant. When they do, normalize once rather than per finding.
    const _seedDiverged = !!ctx.groundingSource && ctx.groundingSource !== ctx.fullSource;
    const _seedNormedFull = _seedDiverged && _seedDrops.length ? normalizeForSearch(ctx.fullSource) : null;
    const _seedDropRead = _seedNormedFull === null ? 0
      : _seedDrops.filter((f) => f.excerpt && f.excerpt.trim().length >= 4 && phrasePresentInNormalized(_seedNormedFull, f.excerpt)).length;
    console.log(`[grounding-backstop] path=judgment-seed dropped=${_seedDrops.length} droppedInReadSource=${_seedDropRead} groundingDiverged=${_seedDiverged}`);
    if (_seedDropRead > 0)
      console.warn(`[grounding-backstop] ⚠ ${_seedDropRead} seed finding(s) were deleted whose excerpt IS verbatim in fullSource but absent from the grounding corpus — CONSISTENT WITH the divergence class rather than model invention. Not proof: presence in fullSource does not establish the text was SERVED (a truncated read leaves text present but unseen). Investigate, do not report as a confirmed count.`);
    // The proposer read the WHOLE assembled source → every present section counts as read for completeness (a
    // binding section whose obligations the proposer failed to ground still fails completenessOf → honest-fail).
    Object.keys(materializeSections(ctx)).forEach((s) => sectionsRead.add(s));
    trace["judgment"] = { converged: true, turns: 1, dropped: _seedDrops.length, droppedInReadSource: _seedDropRead, sectionsRead: [...sectionsRead], tools: [] };
    allConverged = true;
  } else {
    const _tExp = Date.now();
    const runs = await Promise.all(experts.map((spec) => runAgenticExpert(spec, ctx, { callModel, maxTurns, signal })));
    console.log(`[timing] expert-phase ${Date.now() - _tExp}ms · turns/lens ${experts.map((s, i) => `${s.key}:${runs[i].turns}`).join(" ")} · docsRead=${runs.reduce((n, r) => n + r.docsRead.length, 0)}`);
    // GROUNDING-BACKSTOP TELEMETRY (verdict-inert). runAgenticExpert has always returned `dropped`; until now
    // NOTHING read it, so findings deleted by the grounding backstop left no trace anywhere — no log, no field,
    // nothing persisted. That made the one question worth asking ("is the backstop deleting findings the lens
    // legitimately read?") unanswerable from production. Both counters are surfaced here and on the trace; neither
    // is read by deriveVerdict or by any coverage computation.
    //   dropped             — every ungrounded finding. A healthy, expected number: the backstop refusing invention.
    //   droppedInReadSource — the SUBSET whose excerpt IS verbatim in fullSource. Strongly suggests isGrounded
    //                         rejected text the model genuinely read, which happens when groundingSource diverges
    //                         from fullSource (audit-expert.ts:36 checks groundingSource ONLY and never falls
    //                         back). It is a SIGNAL, not a proof: presence in fullSource does not establish the
    //                         span was served to that lens — a truncated read_document leaves text present but
    //                         unseen, so an invented excerpt that happens to sit past the cut counts here too.
    const _dropTot = runs.reduce((n, r) => n + r.dropped, 0);
    const _dropRead = runs.reduce((n, r) => n + r.droppedInReadSource, 0);
    const _gDiverged = !!ctx.groundingSource && ctx.groundingSource !== ctx.fullSource;
    console.log(`[grounding-backstop] dropped=${_dropTot} droppedInReadSource=${_dropRead} groundingDiverged=${_gDiverged} · per-lens ${experts.map((s, i) => `${s.key}:${runs[i].dropped}/${runs[i].droppedInReadSource}`).join(" ")}`);
    if (_dropRead > 0)
      console.warn(`[grounding-backstop] ⚠ ${_dropRead} finding(s) were deleted whose excerpt IS verbatim in fullSource but absent from the grounding corpus (groundingDiverged=${_gDiverged}) — CONSISTENT WITH the divergence class rather than model invention. Not proof: presence in fullSource does not establish the text was SERVED to that lens (a truncated read leaves text present but unseen). Investigate, do not report as a confirmed count.`);
    experts.forEach((spec, i) => {
      assignUniqueFindingIds(runs[i].findings, spec.key, findings);
      perLens[spec.key] = runs[i].findings.length; findings.push(...runs[i].findings);
      runs[i].sectionsRead.forEach((s) => sectionsRead.add(s));
      runs[i].docsRead.forEach((d) => docsRead.add(d));
      runs[i].attestations.forEach((a) => attestedDocs.add(a));
      trace[spec.key] = { converged: runs[i].converged, turns: runs[i].turns, dropped: runs[i].dropped, droppedInReadSource: runs[i].droppedInReadSource, sectionsRead: runs[i].sectionsRead, tools: runs[i].trace };
    });
    allConverged = runs.every((r) => r.converged);
  }

  // P1.4 — PANEL FINDINGS MERGE (card #523, P2a-wire). The expert panel (agentic-panel-runner) is a FINDINGS
  //         PRODUCER: its VERIFIED claims arrive here already typed by panel-findings-bridge and are UNIONed into the
  //         finding set the deterministic rail disposes over — deriveVerdict remains the SOLE authority. Merged HERE
  //         (before the sweeps + dedup + every re-typing guard) so a panel finding is treated EXACTLY like a lens
  //         finding: same protective over-type softening, same dedup collapse. RE-GROUNDED against the assembled
  //         source with the SAME isGrounded gate the seed path uses — a panel excerpt not verbatim in ctx.fullSource
  //         is DROPPED (fail-safe, Rule 64 / I3). Panel ids ("panel:<ref>") are preserved for provenance. Only the
  //         executor supplies opts.panelFindings, and ONLY under AUDIT_PANEL_JUDGE ⇒ flag-OFF is byte-identical.
  // JOIN POINT (card #570) — resolve the producer findings from the direct array (serial) OR the promise (parallel).
  // This await sits AFTER the expert-phase (:2211) already ran, so awaiting the concurrently-started producer here
  // overlaps their wall-clock. The resolved set is merged at this SAME point in both paths ⇒ the finding union into
  // dedup/deriveVerdict is byte-identical; only latency differs. Exactly one of the two opts is set (executor-enforced).
  const panelFindingsResolved = opts.panelFindings ?? (opts.panelFindingsPromise ? await opts.panelFindingsPromise : undefined);
  if (panelFindingsResolved?.length) {
    const reground = panelFindingsResolved.map((f) => ({ ...f, grounded: isGrounded(ctx, f) })).filter((f) => f.grounded);
    reground.forEach((f, j) => { f.id = f.id ?? `panel#${j}`; });
    if (reground.length) { perLens["panel"] = reground.length; findings.push(...reground); }
    console.log(`[orchestrator] panel merge: ${panelFindingsResolved.length} verified typed finding(s) → ${reground.length} re-grounded (${panelFindingsResolved.length - reground.length} dropped: excerpt not in assembled source)`);
  }

  // P1.5 — DETERMINISTIC HIGH-SIGNAL GROUNDING SWEEP (Brain card 81 Step 1). DEFAULT-ON (Brain card 98 GO-LIVE
  //         step 1 — flip UNCOMMITTED, pending Brain review of the live runs). Grounds the failing archetypes
  //         (personnel quals / FAT preconditions / delivery windows / QPL / or-equal) directly from source so
  //         lens shared-miss can't drop them. Merged before dedup so it collapses with any lens duplicate.
  //         Set AUDIT_GROUNDING_SWEEP="false" to disable.
  if (process.env.AUDIT_GROUNDING_SWEEP !== "false") {
    const swept = highSignalSweep(ctx.fullSource);
    assignUniqueFindingIds(swept, "deterministic_sweep", findings);
    if (swept.length) { perLens["deterministic_sweep"] = swept.length; findings.push(...swept); }
  }

  // P1.5b — §I/§K BOILERPLATE-TRAP SWEEP (Brain card 285, Fix 2 · condition 2), gated on AUDIT_BOILERPLATE_ATTEST.
  //          Grounds the named §I/§K traps (52.219-14 limitations-on-subcontracting / 52.204-25 prohibited-source)
  //          the archetype sweep deliberately excludes — so the boilerplate attestation in completenessOf can NEVER
  //          swallow one (condition 3: a hit surfaces as a finding, drives the verdict). The sweep RUNNING is exactly
  //          condition 2 (detectors swept the section). Flag OFF ⇒ neither sweep nor attestation runs (byte-identical).
  const boilerplateAttestOn = process.env.AUDIT_BOILERPLATE_ATTEST === "true";
  if (boilerplateAttestOn) {
    const traps = boilerplateTrapSweep(ctx.fullSource);
    assignUniqueFindingIds(traps, "boilerplate_trap", findings);
    if (traps.length) { perLens["boilerplate_trap_sweep"] = traps.length; findings.push(...traps); }
  }

  // P1.6 — CROSS-CLAUSE TEMPORAL CHECK (Brain card 226 Fork-1) — UNCONDITIONAL always-run (both flags
  //         AUDIT_TEMPORAL_CONFLICT + AUDIT_TEMPORAL_SHARED_ARO RETIRED; a locked doctrine is not an opt-in).
  //         Consumes the sweep-grounded FAT precondition + delivery window and nets the tension to a KO-clarify
  //         CAUTION carrying the parsed arithmetic — the temporal arm can NEVER emit NO_BID (legacy emitter retired).
  {
    const before = findings.length;
    findings = applyTemporalConflict(findings);
    if (findings.length > before) { findings[findings.length - 1].id = "temporal_conflict#0"; perLens["temporal_conflict"] = 1; }
  }

  // J-1 — GROUNDED PRODUCER (Brain card 246), runs PRE-P2 so its findings flow through verify. Gated on BOTH the
  //       flag AND an injected caller ⇒ inert/byte-identical otherwise (no paid calls). Gap-A candidates = the
  //       ungrounded binding obligations completenessOf already surfaces (computed early here, re-run at P4).
  let judgmentCost: JudgmentCost = zeroCost();
  if (judgmentLayerEnabled() && opts.judgmentReason) {
    const early = completenessOf(ctx, required, findings, sectionsRead, { declaredSetAside: opts.setAside });
    const ungrounded = early.attestations.flatMap((a) => a.ungrounded);
    const _tJ1 = Date.now();
    const j1 = await runJudgmentProducer(findings, ctx.fullSource, ungrounded, { reason: opts.judgmentReason, log: (m) => console.log(`[j1] ${m}`) });
    console.log(`[timing] j1 ${Date.now() - _tJ1}ms`);
    findings = j1.findings; judgmentCost = j1.cost;
  }

  // P3 — reconcile: dedup + detect unresolved material conflict.
  findings = dedup(findings);
  const conflict = hasConflict(findings);

  // P2 — adversarial cross-examination → verifierSound + the surviving (possibly re-typed) finding set.
  //      bidderProfile flows in so the verifier can compute the knife-edge escalation set deterministically.
  const _tVer = Date.now();
  const ver = await verify(ctx, findings, { bidderProfile });
  console.log(`[timing] verify(P2) ${Date.now() - _tVer}ms`);
  findings = ver.survived;
  const verifierDrops = ver.correctedDrops ?? []; // card 274 RULING 1 — persisted to AuditResult (telemetry-visible)

  // J-2 — REGISTERED INDEPENDENT VERIFIER (Brain card 246), at the P2 seam. For each universalDefect-marked
  //       finding: 3-state entailment vs the cited excerpt + source (never J-1's reasoning) → VERIFIED writes
  //       verifiedBy; REFUTED strips the mark; UNVERIFIABLE leaves it unverified (NHR wall holds). Gated: flag + caller.
  if (judgmentLayerEnabled() && opts.judgmentEntail) {
    const _tJ2 = Date.now();
    const j2 = await runJudgmentVerifier(findings, ctx.fullSource, { entail: opts.judgmentEntail, log: (m) => console.log(`[j2] ${m}`) });
    console.log(`[timing] j2 ${Date.now() - _tJ2}ms`);
    findings = j2.findings;
    judgmentCost = { ...judgmentCost, j2Calls: j2.cost.j2Calls, j2InTokens: j2.cost.j2InTokens, j2OutTokens: j2.cost.j2OutTokens, degraded: { j1: judgmentCost.degraded.j1, j2: j2.cost.degraded.j2 } };
    console.log(`[judgment-cost] j1Calls=${judgmentCost.j1Calls} j1In=${judgmentCost.j1InTokens} j1Out=${judgmentCost.j1OutTokens} j2Calls=${judgmentCost.j2Calls} j2In=${judgmentCost.j2InTokens} j2Out=${judgmentCost.j2OutTokens} degraded=j1:${judgmentCost.degraded.j1}/j2:${judgmentCost.degraded.j2}`);
  }

  // P2.5 — PART-12 PROCEDURAL-COVERAGE PASS (Brain card 208-B), flag-gated AUDIT_PROCEDURAL_COVERAGE_LENS,
  //         default-OFF (⇒ findings byte-identical). Added AFTER verify (deterministic verbatim grounding needs no
  //         adversarial check, and post-verify placement guarantees the §L/§M procedural obligations reach
  //         completenessOf). COVERAGE-ONLY / inert: bidder_controls + kind procedural_obligation → never a bar,
  //         never an eligibility gate (invisible to the 206-A guarantee). part12-commercial gate is inside the pass.
  if (process.env.AUDIT_PROCEDURAL_COVERAGE_LENS === "true") {
    const proc = await proceduralCoveragePass(ctx, { extract: opts.proceduralExtract });
    assignUniqueFindingIds(proc, "procedural_coverage", findings);
    if (proc.length) {
      perLens["procedural_coverage"] = proc.length;
      findings.push(...proc);
      // The pass READ §L/§M and grounded their obligations — mark those sections read so completenessOf
      // evaluates covered_direct (it gates an 'unread' section out BEFORE the direct-finding match, so a
      // grounded finding in a section no expert lens happened to read would otherwise be skipped — code-review).
      for (const f of proc) { const m = f.citation.match(/§([A-M])\b/); if (m) sectionsRead.add(m[1]); }
    }
  }

  // P2.6 — EXCERPT RE-GROUNDING REPAIR (Brain card 221). Deterministic, no flag (Fork-A precedent). A model
  //         expert lens whose LAST finding's `excerpt` was clipped by a max_tokens stop (valid JSON, silently
  //         truncated) is re-grounded to the VERBATIM source span, extended to its natural boundary. Scoped to
  //         model lenses (procedural_coverage/sweep/temporal emit verbatim by construction → skipped, so a
  //         pre-Fork-A record stays byte-stable). Never model-completes, never drops; an unrepairable clip
  //         stays clipped and the run-quality gate fails as today. Runs AFTER procedural coverage so the
  //         repaired (longer, grounded) excerpt feeds completenessOf's covered_direct.
  const repair = repairClippedExcerpts(findings, ctx.fullSource);
  if (repair.repaired || repair.unrepairable) {
    console.log(`[orchestrator] excerpt-repair: re-grounded ${repair.repaired} clipped excerpt(s)${repair.unrepairable ? `, ${repair.unrepairable} unrepairable (left clipped)` : ""}` +
      (repair.changes.length ? ` — ${repair.changes.map((c) => c.id ?? c.lens).join(", ")}` : ""));
  }

  // HEAD-SIDE RE-GROUNDING WAS HERE (P2.6b) AND HAS MOVED — see the post-verdict block near the return.
  //
  // WHY IT MOVED (2026-07-27, `/code-review high` on PR #292, finding #1). At this position the widened
  // `f.excerpt` flowed into every classifier in audit-decide (~28 sites building `hay`/`blob` strings from
  // `f.excerpt`, lines 183-3455). The review reproduced a live flip with this PR's own fixture:
  // `isInquiryDeadlineBenign` returns true before widening and false after, so the finding stays
  // `no_one_can_move` and deriveVerdict escalates it — a BID becomes NHR/NO_BID on the strength of text the
  // analysis never examined.
  //
  // The first fix I reached for was to sweep all 28 sites with `analyzedExcerptOf`. That is the enumeration
  // pattern this arc keeps losing to: four row shapes each needed their own rule, and each was one shape
  // short. Twenty-eight call sites would be twenty-eight chances to miss one, and the next lens added to
  // audit-decide would reopen it silently.
  //
  // Widening a quote is a DISPLAY improvement. Running it after the verdict makes it STRUCTURALLY incapable
  // of reaching a classifier — no decide-layer site needs to change, and none can regress. The prior
  // placement was defended as "neutral for coverage, measured 0 deltas over 40 records"; that was true of the
  // banked corpus and false of the mechanism, which is exactly the kind of reassurance a corpus can give and
  // a structure cannot take away. [[feedback_display_span_vs_analyzed_span]]
  //
  // Nothing is lost by the move: coverage uses the excerpt as a NEEDLE, so the shorter (original) span can
  // only match more easily, and the customer-facing purpose — restoring the dropped citation head for the
  // reader — is served identically after the decision.

  // P4 — completeness (B-corrected): every binding section READ + obligation-coverage (direct or attested
  //      with cited finding IDs); experts must have converged. Attestations carried for trace adjudication.
  const { covered, missing, attestations } = completenessOf(ctx, required, findings, sectionsRead, {
    sectionMDepth: process.env.AUDIT_SECTION_M_DEPTH === "true",
    ...(boilerplateAttestOn ? { boilerplateAttest: { sections: ["I", "K"], swept: true } } : {}),
    // Phase 4 floor reuses the notice-body floor's declaredSetAside so a self-certifiable set-aside sentence is demoted
    // by the SAME authority (isSelfCertDemotableSentence); absent when the flag is off ⇒ helper never runs.
    declaredSetAside: opts.setAside,
  });
  // C-2 (Brain C.f) — a binding ATTACHMENT ingested-with-text but unanalyzed (no finding grounded in it, and it
  // carries obligations) is an incomplete read, just like an unread section.
  // Brain #347 (flag AUDIT_ATTACHMENT_COVERAGE) — pass the provably-read docs + honest-empty attestations so a
  // binding attachment the panel READ (and grounded an obligation in, OR attested no-obligation) is covered. Opts
  // only supplied when the flag is on ⇒ flag-OFF is byte-identical (documentsCovered's opts default to empty sets).
  const attCoverageOpts = ATTACHMENT_COVERAGE_ENABLED ? { docsRead: [...docsRead], attestations: [...attestedDocs] } : undefined;
  // SOURCE (Gauntlet #350 R6 — REVERTS the R3 groundingSource alignment): documentsCovered parses DOCUMENT regions by
  // the "==== DOCUMENT: name ====" delimiter, which ONLY fullSource carries (assembleFullSource writes one per doc when
  // >1). groundingSource is `docs.map(d=>d.text).join` — DELIMITER-LESS → parseDocRegions finds 0 regions → collapses
  // to a single primary → documentsCovered short-circuits COMPLETE (the false-COMPLETE bypass #1). R3's concern (a
  // digest fullSource may compress a disqualifier away) is unreachable via groundingSource (can't region-parse it) AND
  // already handled upstream: chunked-ingest content-loss forces documents_complete=false, and in the live LOSSLESS
  // path fullSource IS the whole binding text WITH delimiters.
  const docCoverage = (ctx.constructionManifest && procurementPart(ctx) === "part36-construction")
    ? constructionDocumentsCovered(ctx, findings)   // Brain card 289 — sealed full-text attestation for attachments
    : documentsCovered(ctx.fullSource, findings, attCoverageOpts);
  // Brain card 288 RULING 2 — interim amendment-resolution fail-safe (flag-gated; OFF ⇒ byte-identical). Unresolved
  // SF-30 supersession → INCOMPLETE, never a decided verdict over possibly-superseded terms. Full resolution is a
  // later tranche; this is detection + fail-safe only.
  const amendmentUnresolved = process.env.AUDIT_AMENDMENT_RESOLUTION === "true" && amendmentSupersessionUnresolved(ctx.fullSource);
  // Brain card #320 ruling — `allConverged` (per-lens react-loop self-signal) is DEMOTED to telemetry only: it
  // measures answer STABILITY, not coverage — a category error that keys the false-INCOMPLETE veto off a flaky
  // signal (external research whnm9ishz + engine panel wf_d2d5e1cd). Completeness now rests on the DETERMINISTIC
  // signals only (binding sections located + per-doc coverage + amendment fail-safe). `allConverged` is retained in
  // the trace log below (never a verdict gate). Correct in BOTH flag states; GATE_V2 additionally remaps the veto.
  // B3 (Brain card 421 Fork-3, flag AUDIT_NOTICE_BODY_ELIG_FLOOR, default-OFF): an ungrounded hard eligibility bar in
  // the SAM notice body (mandatory site visit / set-aside / clearance) that documentsCovered's attachment-scoped floor
  // never sees. Routed through its OWN verdict gate (noticeBodyBarUngrounded), NOT the coverageComplete veto — the
  // latter is BYPASSED when GATE_V2 + coverageV2 are on (audit-decide:1581), which is the prod flag state. Flag off ⇒
  // short-circuits false ⇒ never set on VerdictInputs ⇒ byte-identical.
  const noticeBodyBarUngrounded = process.env.AUDIT_NOTICE_BODY_ELIG_FLOOR === "true" && noticeBodyEligibilityUngrounded(ctx.fullSource, findings, ctx.noticeBodyText, opts.setAside);
  const coverageComplete = missing.length === 0 && required.length > 0 && docCoverage.complete && !amendmentUnresolved;
  if (amendmentUnresolved) console.log(`[orchestrator] amendment-resolution: unresolved SF-30 supersession → INCOMPLETE (fail-safe, interim)`);
  if (noticeBodyBarUngrounded) console.log(`[orchestrator] notice-body eligibility floor: ungrounded hard bar in notice body → NEEDS_HUMAN_REVIEW (fail-safe, B3)`);
  if (process.env.CONSTRUCTION_DEBUG === "true") {
    const provCount: Record<string, number> = {};
    for (const p of findingProvenance(ctx.fullSource, findings)) provCount[p.doc] = (provCount[p.doc] ?? 0) + 1;
    console.log(`[CONSTRUCTION_DEBUG] part=${procurementPart(ctx)} coverageComplete=${coverageComplete} | allConverged=${allConverged} required=${JSON.stringify(required)} missing=${JSON.stringify(missing)} docCoverage.complete=${docCoverage.complete} docUncovered=${JSON.stringify(docCoverage.uncovered)} amendmentUnresolved=${amendmentUnresolved} coreMissing=${JSON.stringify(coreMissingFor(ctx, { requiresLM: requiresProposalSections(opts.noticeType), formIdentified: opts.formIdentified }))}`);
    console.log(`[CONSTRUCTION_DEBUG] findings=${findings.length} provenance=${JSON.stringify(provCount)}`);
  }

  // CORE-PRESENCE (panel blocker / fail-safe #10): buildManifest/`required` only contains sections DETECTED
  // PRESENT, so a genuinely-absent core section never appears in `missing` and an unanalyzed one could render a
  // clean BID. coreMissingFor discloses absent core sections FORMAT-AWARELY off procurementPart (the single
  // deterministic source — Step 8): Part-15 UCF → §C/§L/§M (unchanged); Part-12 commercial → honest-fail ONLY if
  // BOTH the 52.212-1≡§L instructions AND the 52.212-2≡§M evaluation are absent (flag-gated; off ⇒ commercial
  // unchanged = today's free pass). Disclosure only; verdict unchanged except the manifest cap below.
  // Layer-2 (Brain card 262): scope the §L/§M requirement to solicitation-type buys (requiresLM), and use
  // form_identified to close the misclassified-commercial bypass (review finding D) — a SOW-only source that
  // classifies commercial off a stray "SF 1449"/"RFQ" string but has NO recognized primary form → capped
  // flag-independently, while a genuine SF-1449 RFQ (form_identified=true) stays byte-identical.
  const coreMissing = coreMissingFor(ctx, {
    commercialHonestFail: process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS === "true",
    requiresLM: requiresProposalSections(opts.noticeType),
    formIdentified: opts.formIdentified,
  });

  // T0-5 (engine line-audit 2026-07-06) — ENFORCE the residue-doctrine contract (verifier line 55): an UNRESOLVED
  //      INFORMATIONAL finding (the skeptic never ruled on it; GUARANTEED non-bar / non-verdict-driving by the
  //      marker's own guard at verifier:87) is KEPT for telemetry but EXCLUDED from report CLAIMS + the verdict — it
  //      must never read as a VERIFIED finding. Placed AFTER coverage (completenessOf / documentsCovered / coreMissing
  //      above already legitimately counted it as "section/doc analyzed") and BEFORE the re-typing guards + deriveVerdict.
  //      Previously the `unverified:true` marker had ZERO readers, so a never-verified finding flowed to the report as a
  //      claim. Non-silent (logged, not dropped-in-the-dark); only fires under AUDIT_VERIFIER_BATCHING (the sole writer).
  const residue = excludeUnverifiedInformational(findings);
  if (residue.excluded.length) {
    findings = residue.kept;
    console.log(`[orchestrator] residue: excluded ${residue.excluded.length} UNVERIFIED informational finding(s) from report claims + verdict (kept for telemetry; never a bar): ${residue.excluded.map((f) => `"${f.requirement}"`).join(", ")}`);
  }

  // P4.2b — OR-EQUAL CARVE-OUT (Brain card 139, Step 6), default-OFF (=== "true"). Runs FIRST among the re-typing
  //      gates: a "brand name OR EQUAL" / salient-characteristics bar (mis-typed structural via bare "brand name")
  //      → bidder_controls + cautionFloor (furnish an approved equal). A co-stated restrictive qualifier (only /
  //      no substitution / sole source) VETOES it → stays a bar. Once re-typed, every downstream structural gate
  //      and firmStatus skips it. NEVER touches a non-brand-name bar (QPL/clearance). Flag off ⇒ unchanged.
  findings = applyOrEqualCarveout(findings, { enabled: process.env.AUDIT_OREQUAL_CARVEOUT === "true" });

  // Brain #334 (Direction C, part A) — deterministic set-aside NOTICE detector. The governing set-aside notice(s) in
  // the clause matrix were systematically NOT surfaced as findings (FA1068: all lenses missed 52.219-3 HUBZone +
  // 52.219-6 Total-SB), so the verdict never considered the set-aside eligibility basis AND detectSetAsideConflict was
  // STARVED. Emit one grounded eligibility finding per notice marked applicable (dedup vs a lens finding that already
  // covers it). Placed HERE — BEFORE the award-basis/firm-status guard chain (pre-live review #334, Brain #338 reversal
  // of #335) — so a single set-aside rides the SAME positive-set-aside path as a lens-surfaced one: null/open-world →
  // softened to a curable BID_WITH_CAUTION (verify-language, no no-bid phrasing); closed-world holder → BID (firmStatus
  // reconciles the canonical requiredAttribute); non-holder → INELIGIBLE. A multi-program doc still → NHR (the conflict
  // gate below reads the raw matrix independently and DOMINATES). Same flag as the gate (one revert unit).
  if (process.env.AUDIT_SETASIDE_CONFLICT_GATE === "true") {
    findings = mergeSetAsideNoticeFindings(findings, emitSetAsideNoticeFindings(ctx.fullSource));
  }

  // P4.3 — AWARD-BASIS OVER-TYPE GUARD (Brain card 108; Fork-3 card 226/238). FLAG-DRIFT CORRECTED (card 240 §5):
  //      the guard is DEFAULT-ON — `enabled = AUDIT_AWARDBASIS_OVERTYPE_GUARD !== "false"` (`setAsideOvertypeGuardOpts`,
  //      audit-decide.ts:410) — and is verdict-affecting by default, RATIFIED by CEO Rule-61 on the Fork-3 ship
  //      (`beb9cd1`); the prior "default-OFF (Rule 61)" comment was stale. Re-types an award-basis /
  //      evaluation-methodology finding mis-typed no_one_can_move → bidder_controls (award basis is never a universal
  //      bar), and routes a positively-classified socioeconomic/small-business set-aside (Fork-3 `isPositiveSetAside`)
  //      by eligibility in EVERY profile mode (null/open-world → NHR; closed-world holder → BID, non-holder →
  //      INELIGIBLE). NEVER touches temporal_conflict / a real delivery impossibility / a genuine structural or
  //      size-disqualification bar. Only AUDIT_AWARDBASIS_OVERTYPE_GUARD="false" disables it (findings pass through).
  findings = applyAwardBasisOvertypeGuard(findings, bidderProfile, setAsideOvertypeGuardOpts(process.env)); // card 164/167 guard-fix + card 187: AUDIT_SETASIDE_OVERTYPE_GUARD (default-OFF) ON ⇒ hardcoded "nhr" disposition (mis-typed no_one_can_move set-aside → NEEDS_HUMAN_REVIEW, never false INELIGIBLE); flag OFF ⇒ byte-identical to pre-card-187

  // P4.3a — SET-ASIDE / SIZE FIRM-STATUS GATE (Brain card 125, doctrine #1), default-OFF (=== "true"). The
  //      Total-Small-Business / size pool the award-basis guard leaves untouched: a set-aside a lens vouched
  //      already_satisfied is MET only when the profile PROVES it (firmStatus==='satisfies'); a null/unverified
  //      profile → unverified caution gate (never a green vouch — the #1 legal-exposure); a closed-world FAIL →
  //      eligibility_bar. Runs AFTER the award-basis guard so a socioeconomic set-aside (already re-typed) is not
  //      double-processed. Flag off ⇒ findings pass through unchanged.
  // Enabled by its own flag OR by AUDIT_ELIGIBLE_TRISTATE (card 206-A): the null-profile eligibility guarantee's
  // mandatory firm-status typing (behavior a) — placed HERE, in the guard chain, so the re-typed finding is the one
  // both persisted/rendered AND handed to deriveVerdict (no grid-vs-verdict divergence). Idempotent if both on.
  findings = applySetAsideFirmStatusGate(findings, bidderProfile, { enabled: process.env.AUDIT_SETASIDE_FIRMSTATUS_GATE === "true" || process.env.AUDIT_ELIGIBLE_TRISTATE === "true" });

  // P4.3a-bis — NONMANUFACTURER RULE GATE (Brain card 132) — RETIRED (Brain card 242). The SAM-facts cautionFloor
  //      emitter is deleted; the keyfact detector (below) is now the SOLE NMR-attribute emitter and the Fork-7
  //      who-can-win gate (P4.6, before deriveVerdict) types it. See audit-decide.ts + `_BAR-CHANGE-LOG.md`.

  // P4.3a-quater — KEY-FACT DETECTOR (Brain card 215 Fork B), default-OFF (=== "true"). Surfaces the three
  //      high-value facts the substantive lenses under-cover (quote DEADLINE · DELIVERY schedule · NON-
  //      MANUFACTURER RULE), source-grounded + dedup'd vs lens findings. deadline/delivery are verdict-INERT
  //      (bidder_controls, no requiredAttribute); NMR is an eligibility_bar+requiredAttribute+bidder_controls
  //      that rides the card-206-A unverified-gate path (committal + null profile → eligible=null verify-caution;
  //      NEVER a show-stopper, NEVER flips eligible false). POST-VERIFY (skeptic can't cull). Flag off ⇒ unchanged.
  {
    const before = findings.length;
    findings = applyKeyfactDetector(findings, ctx.fullSource, { enabled: process.env.AUDIT_KEYFACT_DETECTOR === "true", procurementPart: procurementPart(ctx) });
    // COLLISION-FREE IDS. This numbered from zero unconditionally, so it re-issued an id the set was already
    // using whenever the incoming findings already carried keyfact ids — which is exactly the judgment-first /
    // replay shape, where the seed is a previous run's persisted findings. A banked record carrying
    // keyfact_detector#0 and #1 came back with TWO findings answering to #0, one of them the Nonmanufacturer
    // Rule and the other a delivery schedule. Found by running the rail, not by reading it: the duplicate made
    // an id-keyed differential harness silently compare unrelated findings.
    //
    // Live runs are unaffected — the lenses emit no keyfact ids, so nothing is ever taken and the numbering is
    // identical to before. It only diverges where it would otherwise have produced a duplicate.
    assignUniqueFindingIds(findings.slice(before), "keyfact_detector", findings.slice(0, before));
    if (findings.length > before) perLens["keyfact_detector"] = findings.length - before;
  }

  // P4.3a-ter — KNOWN-CLAUSE SEMANTICS GUARD (Brain card 135, Step 5a), default-OFF (=== "true"). CAP-ONLY map
  //      keyed on the finding's grounded citation field (exact clause match): 52.204-7 (SAM) → curable caution;
  //      52.246-15 (Certificate of Conformance) → non-blocking. Runs BEFORE the structural-bar whitelist so the
  //      verified per-clause disposition is AUTHORITATIVE over the whitelist's generic fail-safe. Flag off ⇒ unchanged.
  findings = applyClauseSemanticsGuard(findings, { enabled: process.env.AUDIT_CLAUSE_SEMANTICS_GUARD === "true" });

  // P4.3b — STRUCTURAL-BAR WHITELIST (Brain card 114), default-OFF (Rule 61). The general rule the award-basis /
  //      set-aside guards were special cases of: a non-curable bidder_cannot_move bar under a NULL profile is kept
  //      only if it is a recognized GENUINE structural impossibility (sole-source/QPL/clearance/TDP-less source);
  //      a bidder-resolvable compliance/representation item (size-standard, OCI, reps&certs) → caution; an
  //      unrecognized one is LEFT (→ human review), never silently BID. NEVER touches no_one_can_move or a loaded
  //      profile. Flag off ⇒ findings pass through unchanged.
  findings = applyStructuralBarWhitelist(findings, bidderProfile, { enabled: process.env.AUDIT_STRUCTURAL_BAR_WHITELIST !== "false" });

  // P4.4 — PRECONDITION OVER-TYPE FLOOR (Brain card 92), default-OFF (Rule 61). Re-types a time-curable
  //      precondition (FAT/source-approval/qualification-testing) that a lens mis-typed no_one_can_move with
  //      NO co-stated window conflict → bidder_controls, so a feasible precondition with an adequate window is
  //      not a false universal NO_BID. NEVER touches the temporal_conflict finding or structural bars. Runs
  //      BEFORE caution-floor; deriveVerdict untouched. Flag off ⇒ findings pass through unchanged.
  findings = applyPreconditionOvertypeFloor(findings, { enabled: process.env.AUDIT_PRECONDITION_OVERTYPE_FLOOR === "true" });

  // P4.4-bis — ROUTINE-CLAUSE OVER-TYPE GUARD (Guard 2), default-OFF (=== "true"). Corrects the per-doc construction
  //      proposer's residual typing variance: an Availability-of-Funds contingency (52.232-18/-19) mis-typed
  //      no_one_can_move → bidder_controls, and a bonding requirement (52.228-1/-15/-16) mis-typed bidder_cannot_move
  //      → bidder_controls (the bidder obtains the bond). Narrow FAR-clause-specific regexes; NEVER touches a verified
  //      universal defect. Reduces false honest-fail NHR on routine construction clauses. Flag off ⇒ unchanged.
  findings = applyRoutineClauseOvertypeGuard(findings, { enabled: process.env.AUDIT_ROUTINE_CLAUSE_GUARD === "true" });

  // Vehicle A–E item D (flag AUDIT_CYBER_RFI_RECONCILE, default-OFF) — demote an over-claimed DFARS cyber obligation
  // to informational ONLY when the package's RFI responses ground a CO withdrawal (no CUI/FCI + "no longer a
  // requirement"). Over-claim class (own independent seat). Flag-OFF ⇒ byte-identical.
  findings = applyCyberRfiReconciliation(findings, ctx.fullSource, { enabled: process.env.AUDIT_CYBER_RFI_RECONCILE === "true" });

  // P4.4-ter — ELIGIBILITY-AUTHORITY ALLOW-LIST (Brain card 329), default-OFF (=== "true"). Kills the fabricated
  //      trade-agreement / end-product-origin / publicizing DISQUALIFIER class (live root, audit a80a9a13): a lens
  //      that types a "not subject to WTO GPA/FTA, per FAR 5.101" statement as a hard bidder show-stopper inflates
  //      the abstain → forces NHR. Allow-by-AUTHORITY: a hard eligibility/no_one_can_move bar is valid ONLY if its
  //      cited clause is an enumerated bidder-eligibility/size/set-aside authority (FAR 19 / 52.219-x / 13 CFR
  //      121-128 / 52.204-8 / 52.212-3 / 52.209); else → bidder_controls + cautionFloor. NEVER touches a verified
  //      universal defect, a temporal/delivery impossibility, a genuine structural bar (clearance/QPL/sole-source),
  //      or a positive set-aside — all preserved. Runs after the sibling over-type guards; deriveVerdict untouched.
  //      Flag off ⇒ findings pass through unchanged.
  //      B2 (Brain card 421 Fork-2, sub-flag AUDIT_BOA_IDIQ_HOLDER_KEEP, default-OFF): a BOA/IDIQ/BPA/GWAC holder-
  //      status bar has no FAR-19 authority, so the allow-list would phantom-demote it to a caution. Holder status
  //      is an UNSTATED profile attribute — keep the bar so it routes to NEEDS_HUMAN_REVIEW ("confirm holder
  //      status"), never a silent caution, never INELIGIBLE (that needs a closed-world profile — a future path).
  findings = applyEligibilityAuthorityAllowlist(findings, { enabled: process.env.AUDIT_ELIGIBILITY_AUTHORITY_ALLOWLIST === "true", boaIdiqKeep: process.env.AUDIT_BOA_IDIQ_HOLDER_KEEP === "true" });

  // P4.4-quater — INQUIRY-DEADLINE BENIGN GUARD (Brain card 520, R1), default-OFF (Rule 61, === "true"). A lens
  //      mis-types an information-exchange milestone (questions/inquiries/RFI-submission window, Q&A answer-posting
  //      date) as no_one_can_move — a routine schedule fact read as a universal impossibility → false NHR via
  //      Fork-2's unmarkedUniversalClaim (live driver, seq-1 run 5d0477e7). SHAPE allowlist: demote a positively
  //      information-exchange-shaped no_one_can_move finding → bidder_controls (informational). HARD BOUNDARY:
  //      a participation-prerequisite deadline (mandatory site visit / pre-proposal conference registration,
  //      vehicle/BOA/IDIQ enrollment/on-ramp) or a real offer-submission deadline STAYS a universal-path candidate
  //      (veto). Ambiguity → escalate. Runs after the sibling over-type guards; deriveVerdict untouched. Flag off ⇒
  //      findings pass through byte-identical.
  findings = applyInquiryDeadlineBenignGuard(findings, { enabled: process.env.AUDIT_INQUIRY_DEADLINE_BENIGN === "true" });

  // P4.5 — DETERMINISTIC CAUTION-FLOOR (Brain card 75-R2 / 78-R1), default-OFF (Rule 61). When enabled, it
  //      marks caution-archetype findings (quantified personnel-quals / professional cert / QPL-QML / or-equal)
  //      so deriveVerdict floors to BID_WITH_CAUTION minimum. Flag off ⇒ findings pass through unchanged.
  findings = applyCautionFloor(findings, { enabled: process.env.AUDIT_CAUTION_FLOOR !== "false" });

  // P4.6 — FORK-7 NMR MECHANISM (Brain card 240 + card 242 ruling), default-OFF (=== "true"). The SINGLE NMR
  //      mechanism now that card-132's applyNonmanufacturerRuleGate is RETIRED. Runs LAST (after every re-typing
  //      guard, right before deriveVerdict) so nothing re-types the NMR after it. (1) applyNmrSingleEmitter — the
  //      keyfact detector is the SOLE NMR-attribute emitter; a co-occurring model-lens NMR attribute is stripped to
  //      advisory (a lone model-lens NMR is fail-closed PROMOTED, never dropped). (2) applyNmrFirmStatusGate — types
  //      the single NMR attribute onto the Fork-3 who-can-win path via canonical firm-status (card 242 Finding-1):
  //      compliant→already_satisfied (MET, eligible=true — kills P-8); closed-world canonical-noncompliant→INELIGIBLE
  //      (attribute-specific); unknown / unrecognized synonym→NHR with curability text. Never universal, never NO_BID;
  //      order-independent. Flag off ⇒ findings pass through byte-identical (keyfact NMR keeps its card-206-A path).
  if (process.env.AUDIT_NMR_FIRMSTATUS_GATE === "true") {
    findings = applyNmrSingleEmitter(findings);
    findings = applyNmrFirmStatusGate(findings, bidderProfile, { enabled: true });
  }

  // P4.6-bis — NMR NAICS-DORMANCY GATE (Phase 3 Unit 2, Brain cards #548/#550), default-OFF (=== "true"). The NMR
  //      (52.219-33 / 13 CFR 121.406) governs SUPPLY buys only; on a services/construction ASSIGNED NAICS it is
  //      legally dormant (13 CFR 121.406(b)(3)-(4)). Keys on the SAM-resolved NAICS FACT (opts.naics, Rule 64 — not
  //      a source regex), so a ☒-checked 52.219-33 on a services set-aside (the seq-2 dccce793 false-AUTO-F, NAICS
  //      561320) is demoted to a verdict-inert P2 applicability flag regardless of which lens emitted it. Runs after
  //      the firm-status gate (its own flag, so it fires even when AUDIT_NMR_FIRMSTATUS_GATE is off) and before
  //      deriveVerdict. Null/unknown NAICS ⇒ NO demotion (fail-toward-escalation). Flag off ⇒ byte-identical.
  findings = applyNmrNaicsDormancy(findings, opts.naics, { enabled: process.env.AUDIT_NMR_NAICS_DORMANCY === "true" });

  // P4.6-ter — CHECKBOX-STATE FIDELITY GATE (Phase 3 Unit 3, Brain card #551 design C), default-OFF (=== "true"). The
  //      Section I clause matrix records incorporation MECHANICS (☒/☐), never obligation existence. When a finding
  //      frames a clause as checked/incorporated but the matrix shows an unambiguous ☐ (the seq-2 dccce793 fabricated
  //      "☒ 52.219-14 checked in Section I" while source is ☐), CORRECT the checkbox-state provenance and re-attribute
  //      to a verified-present basis, KEEPING the obligation at severity (non-destructive; box-state is not a
  //      suppression authority). Fail-toward-keep on any ambiguity. Flag off ⇒ byte-identical.
  findings = applyCheckboxStateFidelity(findings, ctx.fullSource, { enabled: process.env.AUDIT_CHECKBOX_STATE_FIDELITY === "true" });

  // P4.6-quater — PERF-OBLIGATION INSURANCE DO-THE-WORK GATE (Phase 3 Unit 1), default-OFF (=== "true"). Insurance is a
  //      do-the-work gate the bidder CLEARS by obtaining a policy (self-acquirable in the window, exactly like a bond) —
  //      NEVER a non-curable profile credential. The seq-2 dccce793 record typed "must maintain professional liability
  //      insurance $1M/occ $3M aggregate throughout performance" (#49) as a bidder_cannot_move eligibility_bar — a
  //      fabricated show-stopper contributing to the false AUTO-F — while the SAME requirement is correctly typed as a
  //      do-the-work submission elsewhere (#74). This gate re-types a bidder_cannot_move finding whose trigger positively
  //      matches the insurance do-the-work SHAPE → bidder_controls + curable. Strict safety (a demotion is the dangerous
  //      direction): keep-the-bar veto on STRUCTURAL_BAR_RE_114, never a verified universal defect, positive-shape
  //      allowlist on citation+requirement only. Own flag (fires independent of the other guards). Flag off ⇒ byte-identical.
  findings = applyPerfObligationInsuranceTyping(findings, { enabled: process.env.AUDIT_PERF_OBLIGATION_INSURANCE === "true" });

  // CLAUSE-KEYED TYPING FLOOR (Brain card #609-(2)a, AUDIT_CLAUSE_TYPING_FLOOR default-OFF) — deterministic re-typing for
  // the ratified closed self-clearable clause set (52.219-14 · insurance · SAM/52.204-7 · state-licensure · size-self-cert),
  // possession/long-lead OVERRIDE (never stamp curable). Runs pre-deriveVerdict/-deriveShadowVerdict. Flag OFF ⇒ byte-identical.
  findings = applyClauseKeyedTypingFloor(findings, { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" });

  // P4.6-quinquies — STRUCTURAL-ASSERTION FIDELITY GATE (Phase 3 Unit 4, Brain #551 Unit-3/Unit-4 boundary), default-OFF
  //      (=== "true"). A finding may attribute its clause/obligation to a UCF SECTION heading absent from the ingested
  //      source (the seq-2 dccce793 commercial RFQ has only Sections G/L/M, yet findings cite "Section I/B/C …" —
  //      grounded excerpts decorated with an INVENTED location). Build the present-section set by positive-shape parse;
  //      when a finding's CITATION attributes it to an absent letter, APPEND an honest structural-provenance correction
  //      and mark it, KEEPING kind/controllability/severity/excerpt. VERDICT-INERT (deriveVerdict does not read the
  //      marker) — this only stops a fabricated section heading from reaching render as verified provenance. Source
  //      with no detectable sections ⇒ fail-toward-keep. Own flag. Flag off ⇒ byte-identical.
  findings = applyStructuralAssertionFidelity(findings, ctx.fullSource, { enabled: process.env.AUDIT_STRUCTURAL_ASSERTION_FIDELITY === "true" });

  // P4.6-sexies — QUANTITY-AMBIGUITY FIDELITY GATE (Phase 3 Unit 5), default-OFF (=== "true"). A solicitation may pose
  //      a MATERIAL quantity as an EXPLICIT, unresolved either/or — the seq-2 dccce793 Q&A asks "Is the total requirement
  //      520 hours or 1,040 hours?" (Schedule says 520; 20 hrs/wk × 52 wks = 1,040 — a 2× LOE/pricing spread the CO did
  //      NOT settle) — while a lens LAUNDERED it into "base period estimated at 520 hours" (#3), hiding the risk (silent
  //      under-caution toward committal). This DETERMINISTIC BACKSTOP parses the source for the positive shape of a
  //      source-posed quantity question (two same-unit DIFFERING quantities joined by "or", inside an interrogative) and
  //      EMITS one caution finding surfacing the UNRESOLVED ambiguity, floored to BID_WITH_CAUTION (cautionFloor — never
  //      a bar, never NHR/NO_BID). ADDITIVE + NON-DESTRUCTIVE (no existing finding mutated; deduped if a lens already
  //      flagged the pair as unresolved). Latent numeric conflicts (no explicit question) are OUT of scope — a latent
  //      detector is the over-fire treadmill. No interrogative either/or shape ⇒ byte-identical. Own flag.
  findings = applyQuantityAmbiguityFidelity(findings, ctx.fullSource, { enabled: process.env.AUDIT_QUANTITY_AMBIGUITY_FIDELITY === "true" });

  // P5 — DECIDE deterministically from the typed grounded facts. manifestComplete enforces the card-58
  //      asymmetry cap: a no-bar verdict (BID/CAUTION) on a package with an unfetched manifest attachment,
  //      an over-budget source, OR a MISSING CORE UCF SECTION (panel B-2) is capped to INCOMPLETE — the
  //      engine cannot confidently BID over evaluation factors / §C / §L it never found. `coreMissing` is
  //      already FORMAT-AWARE (UCF only; commercial/simplified state these inline → empty), so this never
  //      caps a legitimately-inline commercial buy. Bar-found verdicts (NO_BID/INELIGIBLE) are NOT capped.
  // C-1/C-13 (Brain C.e): `documentsComplete` carries the executor's SINGLE reconciliation truth (opts.manifestComplete
  // = agenticManifestComplete: truncation + manifest reconciliation + binding-content-loss) → the committal INCOMPLETE
  // cap. `manifestComplete` now carries ONLY the card-58 no-bar signals — the weak page-count heuristic manifestComplete(ctx)
  // (C-13, SUBORDINATED: it can only add caution, never certify) + a missing CORE UCF section. The reconciliation signal
  // no longer hides inside the ctx-heuristic AND; the two are separate inputs the verdict caps on independently.
  // GUARD 1 — DETERMINISTIC null-profile set-aside eligibility clamp (card 206-A generalized), default-OFF
  //   (=== "true"). When the SEALED construction manifest detected a set-aside/socioeconomic element in source AND
  //   no bidder profile was provided, the engine cannot verify award eligibility — so a committal verdict must carry
  //   eligible=null + a verify-caution, INDEPENDENT of whether the proposer emitted a correctly-typed eligibility_bar
  //   finding (the residual the card-291 prompt could not make reliable). Sourced from the manifest (source-grounded),
  //   NOT the unreliable SAM typeOfSetAside metadata. Only bites under AUDIT_ELIGIBLE_TRISTATE; flag off ⇒ unchanged.
  const detectedUnverifiableEligibilityGate = process.env.AUDIT_SETASIDE_ELIG_CLAMP === "true"
    && bidderProfile == null
    && !!ctx.constructionManifest?.elements.some((e) => e.key === "set_aside" && e.present);
  // GATE V2 (AUDIT_GATE_V2, default OFF — ceo/ENGINE-ARCHITECTURE-RESEARCH): re-read the SAME attestations through
  // the importance-weighted / grounding-as-signal lens and thread the result so deriveVerdict can replace the
  // blanket `!coverageComplete → INCOMPLETE` veto (the false-INCOMPLETE root) with abstain-only-on-unreadability.
  // Flag OFF ⇒ coverageV2 absent ⇒ deriveVerdict runs the exact V1 line (byte-identical). Proven: scripts/audit-ai/prove-gate-v2*.ts.
  // Brain card #320 — NAME the gap so an INCOMPLETE tells the customer WHICH doc/section blocked a verdict
  // (deterministic signals only; never affects the verdict, only enriches the honest-fail reason).
  // Vehicle A–E · item B: strip any region that is the grounded source of a decision-bearing finding from the gap
  // list (invariant: gapList ∩ groundedSourceRegions === ∅). Flag-OFF ⇒ groundedSrc null ⇒ uncoveredForGap ===
  // docCoverage.uncovered ⇒ byte-identical.
  const groundedSrcRegions = coverageCounterSplitEnabled() ? groundedSourceRegionNames(ctx.fullSource, findings) : null;
  const uncoveredForGap = groundedSrcRegions
    ? (docCoverage.uncovered ?? []).filter((n) => !groundedSrcRegions.has((n || "").replace(/\s+/g, " ").trim().toLowerCase()))
    : docCoverage.uncovered;
  const coverageGap = [
    uncoveredForGap?.length ? `document(s) not confirmed read/grounded: ${uncoveredForGap.join(", ")}` : "",
    missing.length ? `binding section(s) not located: ${missing.join(", ")}` : "",
    coreMissing.length ? `required section(s) absent: ${coreMissing.join(", ")}` : "",
  ].filter(Boolean).join("; ") || undefined;
  // Brain #332 + #334-B — set-aside conflict. detectSetAsideConflict now also reads the RAW clause matrix (not only
  // findings): SAM-vs-doc AND doc-internal multi-program ambiguity both DOMINATE → NHR (CO clarification), never a
  // silent pick. Flag-gated (default-OFF); flag off ⇒ undefined ⇒ deriveVerdict byte-identical.
  // #2 SET-ASIDE STRUCTURAL-IMPOSSIBILITY DOWNGRADE (Brain #344, flag AUDIT_SETASIDE_STRUCTURAL_DOWNGRADE, default OFF).
  //   When SAM + the doc AGREE on ONE governing program AND the un-scrubbed-matrix structural tell is present
  //   (52.219-3 set-aside + 52.219-4 price-preference both applicable = mutually-exclusive = un-scrubbed), the STRAY
  //   pool-definer notice is re-typed to a non-blocking P2 doc-integrity flag (surfaced, verdict-inert) and the
  //   multi-program conflict is SUPPRESSED → committal-<governing> instead of NHR. HARD: only the structural tell
  //   licenses this; SAM/doc agreement alone never does. Flag OFF ⇒ downgrade null ⇒ byte-identical to today.
  const structuralDowngrade = applySetAsideStructuralDowngrade(findings, ctx.fullSource, opts.setAside, { enabled: process.env.AUDIT_SETASIDE_STRUCTURAL_DOWNGRADE === "true" });
  findings = structuralDowngrade.findings;
  if (structuralDowngrade.downgrade) {
    console.log(`[orchestrator] set-aside structural downgrade: governing ${structuralDowngrade.downgrade.governing}; stray notice(s) [${structuralDowngrade.downgrade.strays.join(", ")}] → P2 doc-integrity flag; conflict SUPPRESSED (committal-${structuralDowngrade.downgrade.governing})`);
  }
  const setAsideConflict = process.env.AUDIT_SETASIDE_CONFLICT_GATE === "true" && !structuralDowngrade.downgrade
    ? detectSetAsideConflict(opts.setAside, findings, ctx.fullSource)
    : undefined;
  // Card #370 R1 — PRIMARY INDETERMINATE (flag-gated): a multi-doc package where identity detection cannot confidently
  // name the base solicitation → NHR fail-toward (never a silent first-doc default). Flag OFF ⇒ undefined ⇒ byte-identical.
  const _primaryRegions = ATTACHMENT_COVERAGE_ENABLED ? docRegions(ctx.fullSource) : [];
  const primaryIndeterminate = ATTACHMENT_COVERAGE_ENABLED && _primaryRegions.length > 1 && !resolvePrimary(_primaryRegions).confident;
  // D2-B (Brain card 441, flag AUDIT_NOTICE_BODY_ELIG_FLOOR) — the detector (:977) routed NHR on an ungrounded notice-body
  // eligibility bar but emitted NO finding; emit it NOW so the in-branch B3-severity floor has a disqualifier in
  // dispositions[] to promote. Placed AFTER every re-typing guard (so the eligibility_bar is not softened off the
  // disqualifying pole) and gated on noticeBodyBarUngrounded (itself flag-gated at :977 ⇒ flag-OFF byte-identical). The
  // load-bearing dedup (at most one finding per bar span; never re-emit a covered span) lives inside the emitter.
  if (noticeBodyBarUngrounded) {
    findings = [...findings, ...emitNoticeBodyEligBarFindings(ctx.fullSource, findings, ctx.noticeBodyText, opts.setAside)];
  }
  // Card #509/#516 (flags AUDIT_SIZE_STANDARD_SELF_CERT · AUDIT_SELF_DETERMINABLE_ELIG_CLASS, both default-OFF) —
  // surface a bidder-self-determinable eligibility statement in the notice body as a gate-to-clear CAVEAT (never a bar),
  // so it rides a committal verdict as a reps-&-certs self-cert reminder instead of blocking it. Runs regardless of the
  // bar gate (the demotion in noticeBodyEligibilityUngrounded means these no longer fire that gate). The CLASS flag is a
  // superset (set-aside/SAM/reps-certs/size); when it is on it OWNS the caveat emission (else size-only). Both OFF ⇒
  // never called ⇒ byte-identical. Each emitter dedups against decision-bearing findings that already own the span.
  if (SELF_DET_CLASS_ENABLED()) {
    findings = [...findings, ...emitSelfDeterminableCaveats(ctx.fullSource, findings, ctx.noticeBodyText, opts.setAside)];
  } else if (SIZE_STANDARD_SELF_CERT_ENABLED()) {
    findings = [...findings, ...emitSizeStandardCaveats(ctx.fullSource, findings, ctx.noticeBodyText)];
  }
  // 2c (card #523) — DETERMINISTIC ABSENCE-GROUNDING over the FULL finding set (v3 lens findings + any merged panel
  // findings), the v3-side half of Brain's declaration ≠ presence condition. DROP a finding whose requirement asserts
  // the ABSENCE of a checkable element (UCF section / clause / named artifact) the assembled package DEMONSTRABLY
  // CONTAINS — a producer SAYING "no Section B" is not evidence when the deterministic scan finds Section B present. A
  // genuine-absence finding (element truly missing) is untouched → survives. Flag AUDIT_ABSENCE_GROUNDING_GATE
  // default-OFF ⇒ byte-identical. Runs LAST (after every re-typing guard/emitter), right before deriveVerdict.
  if (process.env.AUDIT_ABSENCE_GROUNDING_GATE === "true") {
    const absMarkers = scanPackageMarkers(ctx.fullSource);
    const beforeAbs = findings.length;
    findings = findings.filter((f) => !absenceClaimContradicted(f.requirement ?? "", absMarkers));
    if (findings.length < beforeAbs) console.log(`[orchestrator] absence-grounding: dropped ${beforeAbs - findings.length} contradicted absence finding(s) — asserted absence of an element the package contains`);
  }
  // P4.6-septies (Phase 3 Unit 6) — FINDING-DEDUP. The agentic panel concatenates two expert passes, so the SAME FAR/DFARS
  //      clause is surfaced 2–3× by the equivalent lens of each pass (dccce793: 93 rows for ~35 concerns; 52.217-8 ×3, 52.219-33
  //      ×3 splitting one bar across typed+untyped rows). Collapse same-single-clause rows into ONE, keeping the MOST-CONSERVATIVE
  //      disposition (controllability most-disqualifying, severity=max, curability least, cautionFloor OR, grounded OR) and
  //      PRESERVING every distinct requirement facet. VERDICT-SAFE by construction: the show-stopper set + logicalShowStopperCount
  //      are unchanged, so deriveVerdict reaches the same pole (hard-tested OFF==ON). Over-merge-guarded (exactly-one-clause key,
  //      citation+requirement only, facets kept). Runs LAST — after every re-typing guard/emitter — right before deriveVerdict.
  //      Flag AUDIT_FINDING_DEDUP default-OFF ⇒ byte-identical.
  // CAPTURE-ONLY (card #582, verdict-inert) — snapshot the pre-dedup finding set + counts for the run-record bank /
  // coverage-stage replay. Rides the AUDIT_BANK_RUN_RECORD flag: when banking is off the snapshot is never taken and
  // `_bankDiag` stays undefined ⇒ AuditResult.diagnostics absent ⇒ byte-identical. Never read by deriveVerdict.
  const _bankInstrOn = process.env.AUDIT_BANK_RUN_RECORD === "true";
  // Per-finding copies, not `.slice()` (review round 3, finding #1). A shallow array copy holds the SAME
  // objects, so the post-verdict head pass would rewrite the excerpts inside this "pre-processing" snapshot
  // too — a diagnostic whose entire value is showing the findings as they stood at this stage.
  const _preDedupFindings = _bankInstrOn ? findings.map((f) => ({ ...f })) : null;
  findings = applyFindingDedup(findings, { enabled: process.env.AUDIT_FINDING_DEDUP === "true" });
  // CROSS-FLEET DEADLINE-DEDUP (Phase 3 Unit 6 follow-on) — collapses the no-clause cross-fleet inflation the clause gate
  // can't reach: plain rows restating one dated deadline across the two paraphrasing panels. Runs right after the clause
  // gate, on its output. Verdict-safe by the same protected-passthrough construction (plain-only; survivor plain). Flag
  // AUDIT_CROSS_FLEET_DEDUP default-OFF ⇒ byte-identical.
  findings = applyCrossFleetDedup(findings, { enabled: process.env.AUDIT_CROSS_FLEET_DEDUP === "true" });
  const _bankDiag: RunDiagnostics | undefined = _preDedupFindings
    ? { preProcessingFindings: _preDedupFindings, stageCounts: { preDedup: _preDedupFindings.length, postDedup: findings.length }, ...(ver.ledger ? { verifierLedger: ver.ledger } : {}) }
    : undefined;
  const coverageV2 = GATE_V2_ENABLED ? gradeCoverageV2(attestations, { locate: (ob) => locateObligationContext(ctx.fullSource, ob), verifyRecitalPresence: (ob) => verifyRecitalInSource(ctx.fullSource, ob) }) : undefined;
  // card #576 — an ordinary-course performance-upkeep recital demoted off NHR (coverageV2.caveatRecital, present ONLY
  // flag-ON) is surfaced as a BID_WITH_CAUTION-floor caveat before deriveVerdict. Flag-OFF ⇒ caveatRecital absent ⇒
  // emitter is a no-op ⇒ byte-identical.
  if (coverageV2?.caveatRecital?.length) findings = emitPerformanceUpkeepCaveats(findings, coverageV2.caveatRecital);
  // ④ SOLE-SOURCE LOCK (card #746, flag AUDIT_SOLE_SOURCE_LOCK default-OFF) — DETECT the named-vendor lock over the
  // assembled source; deriveVerdict runs the over-fire carve-out pre-gate + routing. Flag-OFF ⇒ null ⇒ byte-identical.
  const soleSourceLock = process.env.AUDIT_SOLE_SOURCE_LOCK === "true" ? detectSoleSourceLock(ctx.fullSource) : null;
  // ── GROUNDING RECOMPUTE (ARC #747 · CEO option A, flag AUDIT_GROUNDING_RECOMPUTE default-OFF) ─────────
  // `grounded` is documented as a deterministic check that the excerpt is present in the source. It is not:
  // it is a hardcoded `true` at 22 emitter sites, and the only real verifier had ONE production caller (the
  // model path). So every deterministic emitter declared itself grounded, and one of them synthesized the
  // excerpt it was declaring. Recompute it HERE, once, where the full source is in hand — a computed fact
  // instead of 22 promises, and one a future emitter cannot bypass by adding a 23rd declaration.
  // Flag-OFF: measured and logged, nothing mutated ⇒ byte-identical.
  {
    const gr = recomputeGrounding(findings, ctx.fullSource, { enabled: process.env.AUDIT_GROUNDING_RECOMPUTE === "true" });
    findings = gr.findings;
    if (gr.stats.demoted > 0 || gr.stats.promoted > 0) {
      try {
        console.log(`[grounding] declared=${gr.stats.declaredTrue} computed=${gr.stats.computedTrue} ` +
          `DEMOTED=${gr.stats.demoted} promoted=${gr.stats.promoted} noExcerpt=${gr.stats.noExcerpt} ` +
          `applied=${process.env.AUDIT_GROUNDING_RECOMPUTE === "true"} byLens=${JSON.stringify(gr.stats.demotedLenses)}`);
      } catch { /* logging never affects the verdict */ }
    }
  }
  // SNAPSHOT, not the live array (review round 3, finding #1). `inputs` is what the verdict was derived from,
  // and `audit-run-record.ts` both PERSISTS it and REPLAYS `deriveVerdict(rec.result.inputs)` off it. The
  // post-verdict head pass below mutates findings IN PLACE, so sharing the objects would let a span widened
  // for the reader travel into the banked record and be re-decided on replay — `isInquiryDeadlineBenign` flips
  // and a BID re-derives as NHR. Placement after `deriveVerdict` protects the live verdict; only a copy
  // protects the recorded one. Shallow per-finding copies: the fields decide reads are all primitives, and
  // nothing downstream compares finding identity across the two arrays (checked). Values are identical at this
  // point, so a flag-OFF run banks byte-identical JSON.
  const inputs: VerdictInputs = { findings: findings.map((f) => ({ ...f })), bidderProfile, samSetAside: opts.setAside ?? null, coverageComplete, verifierSound: ver.sound, conflict, documentsComplete: opts.manifestComplete, manifestComplete: manifestComplete(ctx) && coreMissing.length === 0, source: ctx.fullSource, detectedUnverifiableEligibilityGate, coverageGap, setAsideConflict, primaryIndeterminate, ...(opts.dispositiveCompletenessForEligibility !== undefined ? { dispositiveCompletenessForEligibility: opts.dispositiveCompletenessForEligibility } : {}), ...(noticeBodyBarUngrounded ? { noticeBodyBarUngrounded: true } : {}), ...(process.env.AUDIT_SITEVISIT_SEVERITY_FLOOR === "true" ? { siteVisitSeverityFloor: true } : {}), ...(coverageV2 ? { coverageV2 } : {}), ...(soleSourceLock ? { soleSourceLock } : {}), ...(opts.temporal ? { temporalSnapshot: opts.temporal.snapshot, liveSam: opts.temporal.liveSam, ingestedAmendmentComplete: opts.temporal.ingestedAmendmentComplete, today: opts.temporal.today, nowIso: opts.temporal.nowIso ?? null } : {}) };
  // Phase-1 SHADOW (cards #596/#597) — compute the positive-shape pole BESIDE the real verdict and bank it. VERDICT-INERT:
  // the shadow is never routed on; the live deriveVerdict below is untouched. Gated on AUDIT_POSITIVE_VERDICT_POLE (default-
  // OFF ⇒ never computed ⇒ byte-identical) AND banking on (the diagnostics carrier). naics is the SAM fact (Rule 64).
  if (_bankDiag && process.env.AUDIT_POSITIVE_VERDICT_POLE === "true") {
    try { _bankDiag.shadowVerdict = deriveShadowVerdict(inputs, { naics: opts.naics }); }
    catch (e) { console.log(`[shadow] deriveShadowVerdict threw (verdict-inert, ignored): ${e instanceof Error ? e.message : e}`); }
  }
  if (process.env.CONSTRUCTION_DEBUG === "true") {
    const kc: Record<string, number> = {}, dc: Record<string, number> = {};
    for (const f of findings) { kc[f.kind] = (kc[f.kind] ?? 0) + 1; const d = disposeFinding(f); dc[d] = (dc[d] ?? 0) + 1; }
    console.log(`[CONSTRUCTION_DEBUG] DECIDE-INPUTS verifierSound=${ver.sound} conflict=${conflict} findings=${findings.length} verifierDrops=${ver.rejected?.length ?? 0} manifestComplete=${manifestComplete(ctx) && coreMissing.length === 0} documentsComplete=${opts.manifestComplete}`);
    console.log(`[CONSTRUCTION_DEBUG] kinds=${JSON.stringify(kc)} dispositions=${JSON.stringify(dc)}`);
    for (const f of findings.filter((f) => f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move")) {
      console.log(`[CONSTRUCTION_DEBUG] BAR kind=${f.kind} ctrl=${f.controllability} req="${(f.requirement || "").slice(0, 90)}" cite="${(f.citation || "").slice(0, 40)}" excerpt="${(f.excerpt || "").slice(0, 90)}"`);
    }
  }
  // Ruling (i) AUDIT BOUNDARY — the coupling-lock decision-time BACKSTOP (EngineInvariantError) converts HERE to
  // a billing-safe failed state: log the config error and re-throw the typed terminal failure. The caller routes
  // it to a 'failed' status; because the throw precedes any persist/decrementAuditQuota, the customer is NOT
  // charged. This is a logged, typed terminal failure — never a raw 500, never an NHR verdict.
  let decision: Decision;
  try {
    decision = deriveVerdict(inputs);
  } catch (e) {
    if (e instanceof EngineInvariantError) {
      console.error(`[ENGINE-CONFIG] billing-safe failed-state (no charge) — ${e.message}`);
      throw e;  // typed terminal failure → worker 'failed' before persist/charge; NOT a raw 500, NOT an NHR verdict
    }
    throw e;
  }

  // MERGE ORDER (E1 × E2, 2026-07-28) — E2's citation gate runs FIRST and rebinds `findings`/`decision` to the
  // objects that actually ship; E1's head re-grounding then runs on those. E2's own note below predicted this
  // merge and set the condition: once the locals and the returned graph are the same objects, order does not
  // matter, and the two passes write disjoint fields anyway (E2: citation/requirement · E1: excerpt). Running
  // E1 before the rebind would have been the one wrong arrangement — it would mutate objects E2 then replaces.
  //
  // ARC #747 · E2 — CITATION FIDELITY. Deliberately applied AFTER deriveVerdict, and deliberately only to the
  // RETURNED findings, never to `inputs`.
  //
  // This is the E1 lesson applied at a different layer. A withheld citation is an answer to the DISPLAY
  // question — what may we print at this customer? It must not become an answer to the ANALYSIS question —
  // what did the engine examine, and what did it decide on. `f.citation` is read by roughly forty detectors in
  // audit-decide (eligibility-authority allow-listing, clause-keyed typing, set-aside routing); rewriting it
  // before the verdict would let a citation-hygiene pass move a bid/no-bid call, which is not a trade this
  // gate is entitled to make. So `inputs` keeps the findings the decision was actually made on — a replay of
  // the banked record re-derives the identical verdict — while the customer-facing set carries the
  // withholding. [[feedback_display_span_vs_analyzed_span]]
  //
  // Flag-OFF returns the same array reference, so byte-identity is structural rather than re-proved.
  //
  // BOTH PERSISTED SETS ARE GATED, and that is not belt-and-braces. `buildV3Payload`
  // (audit-executor-v3.ts:668) persists `res.findings` AND `res.decision.showStoppers` — two independent
  // arrays. Gating only `findings` would have left the show-stopper block, the most prominent section of the
  // report and the one that carries the verdict, rendering the citation the gate just refused everywhere
  // else. `decision.dispositions` is deliberately NOT gated: it is not persisted or rendered, and it is the
  // record of what the engine decided on — the analysis side of the same display/analysis split.
  // See `citationSource` on the opts interface: ctx.groundingSource is undefined on the production path, so
  // the old `ctx.groundingSource ?? ctx.fullSource` silently judged against the possibly-filtered digest while
  // the executor's fold gate judged against the complete text. The explicit option is what makes the two
  // agree; the ctx fallbacks stay as the last resort for callers that do set them (runJudgmentFirstAudit).
  const citeSource = opts.citationSource ?? ctx.groundingSource ?? ctx.fullSource;
  const citeGate = gateFindingCitations(findings, citeSource);
  const stopperGate = gateFindingCitations(decision.showStoppers, citeSource);
  // THE HEADLINE, which the first cut of this gate missed entirely. `decision.reason` is composed by
  // deriveVerdict from `showStoppers[].requirement`, persisted as `v3.reason`, and rendered VERBATIM as the
  // report's "Bottom line" (build-data.ts:600 → render.ts:146, render-deck, render-pdf) plus
  // compliance_summary and bid_recommendation. Gating findings and show-stoppers while leaving it alone
  // meant the report could print "[citation withheld …]" in the show-stopper block and "DFARS 215-2" in the
  // sentence directly above it — the exact leak this gate claimed to close. (Review finding #2 on PR #294.)
  const reasonGate = citationFidelityEnabled()
    ? gateCitationsInText(decision.reason ?? "", citeSource, "reason")
    : { text: decision.reason ?? "", withheld: [] as typeof citeGate.withheld };
  // DISTINCT WITHHOLDINGS, not one per surface (review round 4, finding #4). `decision.showStoppers` are
  // COPIES of the finding objects — `dispositions` is `deciding.map(f => ({...f, disposition}))` and
  // show-stoppers are filtered from those — so gating `findings` and `showStoppers` rewrites the SAME rejected
  // token twice, three times when it also reaches `decision.reason`. The ledger is meant to be a record of
  // what was refused, so a token appears once; the console count was overstating withholdings by the number
  // of surfaces the finding happened to reach.
  const seenWithheld = new Set<string>();
  const withheldAll = [...citeGate.withheld, ...stopperGate.withheld, ...reasonGate.withheld]
    .filter((w) => {
      const k = `${w.corpus}|${w.number}|${w.raw}|${w.field ?? ""}`;
      if (seenWithheld.has(k)) return false;
      seenWithheld.add(k);
      return true;
    });
  if (withheldAll.length) {
    console.warn(`[orchestrator] citation-fidelity: withheld ${withheldAll.length} unresolvable citation(s) across ${citeGate.touched} finding(s) + ${stopperGate.touched} show-stopper(s) — ` +
      withheldAll.map((w) => `${w.raw} (${w.field})`).join("; "));
  }
  // Same-reference when nothing was withheld ⇒ flag-OFF and clean-record runs return the identical object.
  const decisionOut = (stopperGate.touched || reasonGate.withheld.length)
    ? { ...decision, ...(stopperGate.touched ? { showStoppers: stopperGate.findings } : {}), ...(reasonGate.withheld.length ? { reason: reasonGate.text } : {}) }
    : decision;

  // REBIND, don't only return (review round 3, finding #3). This gate produces COPIES for every touched row
  // and, until now, handed them straight to the `return` while `findings` and `decision` still pointed at the
  // originals. Any pass appended after this block — E1's head re-grounding on the sibling branch is exactly
  // that, and both branches add their block immediately before this same return — would then mutate objects
  // that never ship, and its work would vanish for precisely the rows this gate touched. Nothing here depends
  // on merge order once the locals and the returned graph are the same objects; the gate reads `citation` and
  // `requirement`, E1 writes `excerpt`, so the two are on disjoint fields in either order. Untouched runs
  // rebind to the identical references, so flag-OFF stays a same-reference passthrough.
  findings = citeGate.findings;
  decision = decisionOut;

  // ── HEAD-SIDE RE-GROUNDING (ARC #747 · E1, flag AUDIT_EXCERPT_HEAD_REGROUND, default OFF) ──────────────
  // Moved here from P2.6b. The verdict is already derived and `inputs` already holds the findings it was
  // derived from, so nothing this pass does can reach a classifier. See the note at the old site for why
  // structure beat sweeping 28 call sites.
  //
  // CLASSIFIER-INVARIANCE GUARD. Placement protects the VERDICT; it does not protect the READER. Review
  // finding #2 showed a widened quote for a questions-deadline finding reading
  // "Offerors must possess a Top Secret facility clearance at time of proposal submission questions shall be
  // submitted…" — verbatim, and corroborating an obligation it does not belong to. Finding #3 showed a
  // title-case heading crossing the walk and flipping `isPositiveSetAside`. No refusal rule catches either,
  // because the extractor emitted no terminator between the clauses.
  //
  // So the guard is not another shape rule: a widening that CHANGES WHAT THE SPAN WOULD BE CLASSIFIED AS is
  // not a repair, it is a rewrite, and it is refused. That is a semantic test on the outcome rather than a
  // guess about the layout, so it closes the shapes we have not thought of too — including the title-case
  // heading this branch had recorded as a KNOWN GAP.
  const headRepair = repairHeadClippedExcerpts(findings, ctx.groundingSource ?? ctx.fullSource, {
    rejectIfClassificationMoves: (before, after) => classificationSignature(before) !== classificationSignature(after),
  });
  // REACH BOTH PERSISTED SETS (review round 3, finding #2). `deriveVerdict` decides on COPIES — `dispositions`
  // is `deciding.map(f => ({...f, disposition}))` and `showStoppers` is a subset of those — and it took them
  // before this pass ran, because this pass is deliberately post-verdict. `audit-v3-report.ts` then persists
  // the show-stopper band from `decision.showStoppers`, not from `findings`. So the restored head reached the
  // whole report EXCEPT the one tile the founding clipped excerpt renders in. Post-verdict and display-only:
  // the span was already accepted for this finding above, `excerptPreReground` travels with it, and a widening
  // the classifier guard refused was never in `changes` to begin with.
  const stopperRepairs = applyHeadRepairsTo(
    (decision as { showStoppers?: Array<{ id?: string; lens?: string; excerpt?: string; excerptPreReground?: string }> }).showStoppers,
    headRepair.changes);
  const dispositionRepairs = applyHeadRepairsTo(
    (decision as { dispositions?: Array<{ id?: string; lens?: string; excerpt?: string; excerptPreReground?: string }> }).dispositions,
    headRepair.changes);
  if (headRepair.repaired || headRepair.unrepairable || headRepair.skipped.length) {
    console.log(`[orchestrator] excerpt-head-reground: restored ${headRepair.repaired} clipped head(s)` +
      `${stopperRepairs ? `, ${stopperRepairs} propagated to show-stopper(s)` : ""}` +
      `${dispositionRepairs ? `, ${dispositionRepairs} to disposition(s)` : ""}` +
      `${headRepair.unrepairable ? `, ${headRepair.unrepairable} left as emitted` : ""}` +
      `${headRepair.skipped.length ? `, ${headRepair.skipped.length} skipped (${[...new Set(headRepair.skipped.map((s) => s.reason))].join(" · ")})` : ""}` +
      (headRepair.changes.length ? ` — ${headRepair.changes.map((c) => c.id ?? c.lens).join(", ")}` : ""));
  }

  return { decision, inputs, findings, coverage: { required, covered, missing, attestations, coreMissing }, perLens, conflict, sectionsRead: [...sectionsRead], trace, ...(withheldAll.length ? { citationsWithheld: withheldAll } : {}), ...(verifierDrops.length ? { verifierDrops } : {}), ...(judgmentLayerEnabled() && (opts.judgmentReason || opts.judgmentEntail) ? { judgmentCost } : {}), ...(_bankDiag ? { diagnostics: _bankDiag } : {}) };
}

/** Every decide-layer reading of a finding that could move on a widened excerpt, collapsed to one string.
 *  If this differs before and after a repair, the repair changed what the engine would conclude — so the
 *  repair is refused and the customer keeps the excerpt the model emitted.
 *
 *  These are the classifiers the review reproduced flips on, plus their nearest siblings on the same axes
 *  (set-aside, structural bar, eligibility authority, benign-inquiry, site-visit). It is deliberately a
 *  SIGNATURE rather than a list of guards to re-run: adding a classifier here is cheap, and a classifier
 *  that is missing can only make the guard less willing to refuse — never more willing to accept a rewrite
 *  it should have caught, because refusal is the safe direction. */
function classificationSignature(f: TypedFinding): string {
  return [
    isPositiveSetAside(f),
    isInquiryDeadlineBenign(f),
    hasOperativeEligibilityLanguage(f.excerpt ?? ""),
    ELIGIBILITY_AUTHORITY_RE.test(`${f.citation ?? ""} ${f.requirement ?? ""} ${f.excerpt ?? ""}`),
    SITE_VISIT_CONCLUDED_RE.test(f.excerpt ?? ""),
    SITE_VISIT_MANDATORY_ATTENDANCE_RE.test(f.excerpt ?? ""),
  ].join("|");
}
