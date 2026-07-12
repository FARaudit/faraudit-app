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
import { readSection, sectionFullText, procurementPart, requiresProposalSections, materializeSections, parseDocRegions, resolvePrimary, ATTACHMENT_COVERAGE_ENABLED, type AuditToolContext } from "./audit-tools";
import { constructionRequired, constructionCoreMissing, constructionCoverage } from "./audit-construction-manifest";
import { runSectionFinder, type SectionFinderCall } from "./audit-section-finder";
import { isBindingDoc, hasEngineText } from "./sam-attachments";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";
import { proceduralCoveragePass, type ProceduralExtractor } from "./audit-procedural-coverage";
import { repairClippedExcerpts } from "./audit-excerpt-repair";
import { SITE_VISIT_CONCLUDED_RE } from "./audit-site-visit-patterns";
import { deriveVerdict, disposeFinding, applyCautionFloor, applyTemporalConflict, applyPreconditionOvertypeFloor, applyRoutineClauseOvertypeGuard, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts, applyStructuralBarWhitelist, applySetAsideFirmStatusGate, applyNmrSingleEmitter, applyNmrFirmStatusGate, applyClauseSemanticsGuard, applyOrEqualCarveout, applyEligibilityAuthorityAllowlist, detectSetAsideConflict, applySetAsideStructuralDowngrade, emitSetAsideNoticeFindings, mergeSetAsideNoticeFindings, EngineInvariantError, type Decision } from "./audit-decide";
import { applyKeyfactDetector } from "./audit-keyfact-detector";
import { judgmentLayerEnabled, runJudgmentProducer, runJudgmentVerifier, type ReasonCaller, type EntailmentCaller, type JudgmentCost, zeroCost } from "./audit-judgment-layer";
import { highSignalSweep, boilerplateTrapSweep } from "./audit-grounding-sweep";
import { createHash } from "node:crypto";
import type { TypedFinding, BidderProfile, VerdictInputs } from "./audit-findings";
import { GATE_V2_ENABLED, gradeCoverageV2, importanceOf } from "./audit-gate-v2";

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
export interface VerifyResult { sound: boolean; survived: TypedFinding[]; rejected: TypedFinding[]; correctedDrops?: CorrectedDrop[]; }
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
  // JUDGMENT-FIRST SEAM (Brain cards 276/279) — opt-in. When the holistic proposer supplies pre-found findings,
  // the orchestrator SKIPS the paid expert lenses (P1) and runs the FULL deterministic rail (P1.5→P5: sweep,
  // temporal, dedup, verify, completeness, every re-typing guard, deriveVerdict) over this seed instead. The seed
  // is RE-GROUNDED here against real source with the SAME isGrounded check the lenses use — the proposer never
  // self-asserts grounding (audit-judgment-first.ts). Absent ⇒ the ladder path (P1 experts) is byte-identical.
  seedFindings?: TypedFinding[];
}

export interface AuditResult {
  decision: Decision;
  inputs: VerdictInputs;
  findings: TypedFinding[];
  coverage: { required: string[]; covered: string[]; missing: string[]; attestations: SectionAttestation[]; coreMissing: string[] };
  perLens: Record<string, number>;
  conflict: boolean;
  sectionsRead: string[];                                                                 // union across all agents (pure-observer)
  trace: Record<string, { converged: boolean; turns: number; sectionsRead: string[]; tools: Array<{ turn: number; tools: Array<{ name: string; input: Record<string, unknown> }> }> }>; // per-lens
  verifierDrops?: CorrectedDrop[];                                                        // card 274 RULING 1 — skeptic drops (empty-corrected + overturned), telemetry-visible; absent when none
  judgmentCost?: JudgmentCost;                                                            // J-1/J-2 per-audit token/call ledger (card 246 acceptance h); absent when the layer is off
}

/** P0 — the manifest: binding UCF sections that are actually PRESENT (non-empty) in this package's source.
 *  Brain card 288 — FORMAT-AWARE carrier: a construction (SF-1442 / part36) package has no §A–M headers, so the UCF
 *  filter returns [] and the engine honest-fails the whole construction CLASS on FORMAT (:574 required.length>0). For
 *  part36 the carrier is the SEALED construction binding-content manifest (present elements = the §A–M analog),
 *  computed at ingest over FULL doc text. The :574 completeness FORMULA is untouched — only WHICH set populates
 *  `required` changes. Flag-off / no manifest ⇒ procurementPart never returns part36 ⇒ byte-identical UCF path. */
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
  const c = (f.citation || "").trim();
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

/** C-12 (Brain C.d, R8) — a ≥4-word verbatim n-gram shared between an obligation sentence and a grounded finding's
 *  excerpt, AND the finding must be CITED to the SAME section as the obligation. This closes the cross-section
 *  false-attestation (a §C finding sharing a 4-gram with a §M obligation no longer attests §M covered). The n-gram
 *  threshold stays FROZEN at ≥4 (R8 — no drift). Same-span + same-section is the Rule-64 "this obligation IS
 *  grounded by that finding" proof. */
function groundedBy(obligation: string, findings: TypedFinding[], sec: string): string[] {
  const words = norm(obligation).split(" ").filter(Boolean);
  const grams: string[] = [];
  for (let i = 0; i + 4 <= words.length; i++) grams.push(words.slice(i, i + 4).join(" "));
  const ids: string[] = [];
  for (const f of findings) {
    const ex = norm(f.excerpt || "");
    if (findingSection(f) === sec && grams.some((g) => ex.includes(g)) && f.id) ids.push(f.id);
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
      const ex = norm(f.excerpt || "");
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
export function noticeBodyEligibilityUngrounded(fullSource: string, findings: TypedFinding[], noticeBodyText?: string | null): boolean {
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
    const ex = norm(f.excerpt || "");
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
export function emitNoticeBodyEligBarFindings(fullSource: string, findings: TypedFinding[], noticeBodyText?: string | null): TypedFinding[] {
  const noticeText = (noticeBodyText && noticeBodyText.trim())
    ? noticeBodyText
    : (docRegions(fullSource).find((r) => r.name === NOTICE_BODY_DOC_NAME)?.text ?? "");
  if (!hasEngineText(noticeText)) return [];
  const nNotice = norm(noticeText);
  // covering = decision-bearing (non-`dropped`) findings grounded IN the notice body, as [start,end) spans over nNotice.
  const covering: Array<[number, number]> = [];
  for (const f of findings) {
    if (disposeFinding(f) === "dropped") continue;
    const ex = norm(f.excerpt || "");
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
  const scan = new RegExp(ELIGIBILITY_BAR_RE.source, "gi");
  for (const m of nNotice.matchAll(scan)) {
    const [ss, se] = sentenceSpan(m.index ?? 0);
    if (covering.some(([s, e]) => s < se && ss < e)) continue;     // owned by a decision-bearing finding → do NOT re-emit
    if (emitted.some(([s, e]) => s < se && ss < e)) continue;      // at most ONE finding per bar span/sentence (ruled dedup)
    const excerpt = nNotice.slice(ss, se).trim().slice(0, 240);
    if (!excerpt || seenExcerpt.has(excerpt)) continue;            // identical bar sentence at another position → one finding
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
    const concludedRel = new RegExp(SITE_VISIT_CONCLUDED_RE.source, "i").exec(windowText);
    if (NOTICE_SITE_VISIT_RE.test(excerpt) && concludedRel && concludedRel.index != null) {
      const cAbs = winStart + concludedRel.index;
      const [cs, ce] = sentenceSpan(cAbs);
      const concludedSentence = nNotice.slice(cs, ce).trim();
      const eventDate = (NOTICE_EVENT_DATE_RE.exec(concludedSentence) || [])[0] || "";
      // ONE verbatim span covering BOTH the bar and the concluded marker; cap generously so both survive.
      outExcerpt = nNotice.slice(Math.min(ss, cs), Math.max(se, ce)).trim().slice(0, 600);
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
      const ex = norm(f.excerpt || "");
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
export function findingProvenance(fullSource: string, findings: TypedFinding[]): Array<{ id: string; doc: string }> {
  const regions = docRegions(fullSource).map((r) => ({ name: r.name, n: norm(r.text) }));
  const out: Array<{ id: string; doc: string }> = [];
  for (const f of findings) {
    if (!f.id || !f.excerpt) continue;
    const ex = norm(f.excerpt);
    out.push({ id: f.id, doc: regions.find((r) => r.n.includes(ex))?.name ?? "(ungrounded)" });
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

export function completenessOf(ctx: AuditToolContext, required: string[], findings: TypedFinding[], sectionsRead: Set<string>, opts?: { sectionMDepth?: boolean; boilerplateAttest?: { sections: string[]; swept: boolean } }): { covered: string[]; missing: string[]; attestations: SectionAttestation[] } {
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
    const cov = constructionCoverage(ctx.constructionManifest, ctx.fullSource, findings.map((f) => f.excerpt || ""), analyzedDocs);
    for (const e of ctx.constructionManifest.elements) {
      if (!e.present) continue;
      const covered = cov.covered.includes(e.key);
      const dropped = cov.droppedByCompressor.includes(e.key);
      // Provenance backstop (adversarial review): a covered element cites the findings whose excerpt carries its anchor.
      const cited = covered && e.anchor ? findings.filter((f) => f.id && nrm(f.excerpt || "").includes(nrm(e.anchor!))).map((f) => f.id!) : [];
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
    const direct = findings.filter((f) => f.excerpt && findingSection(f) === sec && nText.includes(norm(f.excerpt)));
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
      attestations.push({ section: sec, status: "read_no_obligation", obligations: [], citedFindingIds: direct.map((f) => f.id!).filter(Boolean), ungrounded: [] }); continue;
    }
    const cited = new Set<string>(); const ungrounded: string[] = [];
    for (const ob of obligationSet) { const ids = groundedBy(ob, findings, sec); if (ids.length) ids.forEach((i) => cited.add(i)); else ungrounded.push(ob); }
    if (obTruncated) ungrounded.push(`[truncated] §${sec} has more than ${MAX_OBLIGATIONS} obligation sentences — tail not proven`);
    // Fork-1(i): a READ §L/§M whose ungrounded obligations are ALL boilerplate (and none are a [truncated] marker) →
    // covered-with-signal, not missing. Any disqualifier/ambiguous ungrounded obligation, or a truncation marker,
    // keeps status obligations_ungrounded → escalates (the non-negotiable invariant). Only PER_OBLIGATION §L/§M.
    let status: SectionAttestation["status"];
    if (!ungrounded.length) status = "covered_attested";
    else if (COVERAGE_LEDGER_V2 && PER_OBLIGATION_SECTIONS.has(sec)
      && ungrounded.every((u) => !/^\[(truncated|compressor-dropped)\]/i.test(u) && importanceOf(u) === "boilerplate"))
      status = "covered_boilerplate_signal";
    else status = "obligations_ungrounded";
    attestations.push({ section: sec, status, obligations: obligationSet, citedFindingIds: [...cited], ungrounded });
  }
  const covered = attestations.filter((a) => a.status === "covered_direct" || a.status === "covered_attested" || a.status === "covered_attested_boilerplate" || a.status === "covered_boilerplate_signal" || a.status === "read_no_obligation").map((a) => a.section);
  return { covered, missing: required.filter((s) => !covered.includes(s)), attestations };
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
    const reground = opts.seedFindings.map((f) => ({ ...f, grounded: isGrounded(ctx, f) })).filter((f) => f.grounded);
    reground.forEach((f, j) => { f.id = f.id ?? `judgment#${j}`; });
    findings = reground;
    perLens["judgment"] = reground.length;
    // The proposer read the WHOLE assembled source → every present section counts as read for completeness (a
    // binding section whose obligations the proposer failed to ground still fails completenessOf → honest-fail).
    Object.keys(materializeSections(ctx)).forEach((s) => sectionsRead.add(s));
    trace["judgment"] = { converged: true, turns: 1, sectionsRead: [...sectionsRead], tools: [] };
    allConverged = true;
  } else {
    const _tExp = Date.now();
    const runs = await Promise.all(experts.map((spec) => runAgenticExpert(spec, ctx, { callModel, maxTurns, signal })));
    console.log(`[timing] expert-phase ${Date.now() - _tExp}ms · turns/lens ${experts.map((s, i) => `${s.key}:${runs[i].turns}`).join(" ")} · docsRead=${runs.reduce((n, r) => n + r.docsRead.length, 0)}`);
    experts.forEach((spec, i) => {
      runs[i].findings.forEach((f, j) => { f.id = `${spec.key}#${j}`; });
      perLens[spec.key] = runs[i].findings.length; findings.push(...runs[i].findings);
      runs[i].sectionsRead.forEach((s) => sectionsRead.add(s));
      runs[i].docsRead.forEach((d) => docsRead.add(d));
      runs[i].attestations.forEach((a) => attestedDocs.add(a));
      trace[spec.key] = { converged: runs[i].converged, turns: runs[i].turns, sectionsRead: runs[i].sectionsRead, tools: runs[i].trace };
    });
    allConverged = runs.every((r) => r.converged);
  }

  // P1.5 — DETERMINISTIC HIGH-SIGNAL GROUNDING SWEEP (Brain card 81 Step 1). DEFAULT-ON (Brain card 98 GO-LIVE
  //         step 1 — flip UNCOMMITTED, pending Brain review of the live runs). Grounds the failing archetypes
  //         (personnel quals / FAT preconditions / delivery windows / QPL / or-equal) directly from source so
  //         lens shared-miss can't drop them. Merged before dedup so it collapses with any lens duplicate.
  //         Set AUDIT_GROUNDING_SWEEP="false" to disable.
  if (process.env.AUDIT_GROUNDING_SWEEP !== "false") {
    const swept = highSignalSweep(ctx.fullSource);
    swept.forEach((f, j) => { f.id = `deterministic_sweep#${j}`; });
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
    traps.forEach((f, j) => { f.id = `boilerplate_trap#${j}`; });
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
    const early = completenessOf(ctx, required, findings, sectionsRead);
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
    proc.forEach((f, j) => { f.id = `procedural_coverage#${j}`; });
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

  // P4 — completeness (B-corrected): every binding section READ + obligation-coverage (direct or attested
  //      with cited finding IDs); experts must have converged. Attestations carried for trace adjudication.
  const { covered, missing, attestations } = completenessOf(ctx, required, findings, sectionsRead, {
    sectionMDepth: process.env.AUDIT_SECTION_M_DEPTH === "true",
    ...(boilerplateAttestOn ? { boilerplateAttest: { sections: ["I", "K"], swept: true } } : {}),
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
  const noticeBodyBarUngrounded = process.env.AUDIT_NOTICE_BODY_ELIG_FLOOR === "true" && noticeBodyEligibilityUngrounded(ctx.fullSource, findings, ctx.noticeBodyText);
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
    findings = applyKeyfactDetector(findings, ctx.fullSource, { enabled: process.env.AUDIT_KEYFACT_DETECTOR === "true" });
    for (let k = before; k < findings.length; k++) { findings[k].id = `keyfact_detector#${k - before}`; }
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
  const coverageGap = [
    docCoverage.uncovered?.length ? `document(s) not confirmed read/grounded: ${docCoverage.uncovered.join(", ")}` : "",
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
    findings = [...findings, ...emitNoticeBodyEligBarFindings(ctx.fullSource, findings, ctx.noticeBodyText)];
  }
  const inputs: VerdictInputs = { findings, bidderProfile, coverageComplete, verifierSound: ver.sound, conflict, documentsComplete: opts.manifestComplete, manifestComplete: manifestComplete(ctx) && coreMissing.length === 0, source: ctx.fullSource, detectedUnverifiableEligibilityGate, coverageGap, setAsideConflict, primaryIndeterminate, ...(noticeBodyBarUngrounded ? { noticeBodyBarUngrounded: true } : {}), ...(process.env.AUDIT_SITEVISIT_SEVERITY_FLOOR === "true" ? { siteVisitSeverityFloor: true } : {}), ...(GATE_V2_ENABLED ? { coverageV2: gradeCoverageV2(attestations) } : {}) };
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

  return { decision, inputs, findings, coverage: { required, covered, missing, attestations, coreMissing }, perLens, conflict, sectionsRead: [...sectionsRead], trace, ...(verifierDrops.length ? { verifierDrops } : {}), ...(judgmentLayerEnabled() && (opts.judgmentReason || opts.judgmentEntail) ? { judgmentCost } : {}) };
}
