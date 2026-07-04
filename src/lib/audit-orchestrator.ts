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

import { runAgenticExpert, type CallModel, type ExpertSpec } from "./audit-expert";
import { readSection, sectionFullText, procurementPart, requiresProposalSections, type AuditToolContext } from "./audit-tools";
import { isBindingDoc } from "./sam-attachments";
import { proceduralCoveragePass, type ProceduralExtractor } from "./audit-procedural-coverage";
import { repairClippedExcerpts } from "./audit-excerpt-repair";
import { deriveVerdict, applyCautionFloor, applyTemporalConflict, applyPreconditionOvertypeFloor, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts, applyStructuralBarWhitelist, applySetAsideFirmStatusGate, applyNmrSingleEmitter, applyNmrFirmStatusGate, applyClauseSemanticsGuard, applyOrEqualCarveout, EngineInvariantError, type Decision } from "./audit-decide";
import { applyKeyfactDetector } from "./audit-keyfact-detector";
import { judgmentLayerEnabled, runJudgmentProducer, runJudgmentVerifier, type ReasonCaller, type EntailmentCaller, type JudgmentCost, zeroCost } from "./audit-judgment-layer";
import { highSignalSweep } from "./audit-grounding-sweep";
import type { TypedFinding, BidderProfile, VerdictInputs } from "./audit-findings";

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

export interface VerifyResult { sound: boolean; survived: TypedFinding[]; rejected: TypedFinding[]; }
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
  judgmentCost?: JudgmentCost;                                                            // J-1/J-2 per-audit token/call ledger (card 246 acceptance h); absent when the layer is off
}

/** P0 — the manifest: binding UCF sections that are actually PRESENT (non-empty) in this package's source. */
export function buildManifest(ctx: AuditToolContext): string[] {
  return BINDING_SECTIONS.filter((k) => readSection(ctx, k).present);
}

/** Manifest-completeness detector (Brain card-58 production cap). CONSERVATIVE: flags an unfetched attachment
 *  only when the source itself NAMES an attachment with a page count whose volume alone (≈1000 chars/page,
 *  deliberately lenient to avoid false caps) exceeds the ENTIRE assembled source — i.e. that attachment
 *  cannot physically be present (the #5 459-pg-spec-in-a-221KB-source signature). A package whose named
 *  attachments are all plausibly contained returns true. Tunable; intentionally errs toward NOT capping. */
export function manifestComplete(ctx: AuditToolContext): boolean {
  let maxPages = 0;
  for (const m of ctx.fullSource.matchAll(/(\d{2,4})\s*(?:pgs?\b|pages\b)/gi)) maxPages = Math.max(maxPages, parseInt(m[1], 10));
  return !(maxPages * 1000 > ctx.fullSource.length); // a single named attachment can't exceed the whole source → unfetched
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
  if (part === "part15-ucf") return ["C", "L", "M"].filter((k) => !present(k));
  if (part === "part12-commercial") {
    // Commercial core EQUIVALENTS: 52.212-1 ≡ §L, 52.212-2 ≡ §M. Cap ONLY when BOTH absent (a single one missing is
    // plausibly inline/by-reference — no false scare).
    const bothAbsent = !present("L") && !present("M");
    if (opts?.commercialHonestFail) return bothAbsent ? ["52.212-1", "52.212-2"] : []; // Brain card 135 Step 8 — unchanged; OFF ⇒ byte-identical for GENUINE commercial
    // Layer-2 (Brain card 262 · adversarial-review finding D) — FLAG-INDEPENDENT close of the misclassified-commercial
    // bypass: a SOW-only source classifies part12-commercial off a STRAY "SF 1449"/"RFQ" string yet has NO recognized
    // primary FORM (form_identified===false) and located neither 52.212-1 nor 52.212-2 → it is the 80NSSC SOW-only
    // class hiding in the commercial branch → cap regardless of the flag. A REAL commercial RFQ has form_identified=true
    // (its SF-1449 IS the form) → unaffected, so flag-OFF stays byte-identical for genuine commercial buys.
    if (requiresLM && opts?.formIdentified === false && bothAbsent) return ["52.212-1", "52.212-2"];
    return [];
  }
  if (part === "unknown") {
    // C-5 (Brain C.f) — an UNRECOGNIZED format where NONE of the core sections can be located cannot certify its core
    // set ⇒ INCOMPLETE (structureless blob). Unchanged.
    const anyCore = ["C", "L", "M"].some(present);
    const commercialRef = /\b5?2\.212-[12]\b/.test(ctx.fullSource ?? ""); // a bare Part-12 synopsis references 52.212-1/-2 — leave it to the C-10 flag path, never a C-5 false-flag
    if (commercialRef) return [];
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

export interface SectionAttestation { section: string; status: "covered_direct" | "covered_attested" | "read_no_obligation" | "unread" | "obligations_ungrounded"; obligations: string[]; citedFindingIds: string[]; ungrounded: string[]; }

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
 *  (assembleFullSource writes one per doc when >1). `isPrimary` marks the FIRST region (the primary solicitation).
 *  Single-doc packages carry no delimiter → one primary region. */
export function docRegions(fullSource: string): Array<{ name: string; text: string; isPrimary: boolean }> {
  const parts = (fullSource ?? "").split(/={4}\s+DOCUMENT:\s+(.+?)\s+={4}/); // EXACT assembleFullSource delimiter (4 equals) — strict, matches section-boundary-detector
  if (parts.length <= 1) return [{ name: "(primary solicitation)", text: fullSource ?? "", isPrimary: true }];
  const out: Array<{ name: string; text: string; isPrimary: boolean }> = [];
  for (let i = 1; i + 1 < parts.length; i += 2) out.push({ name: parts[i], text: parts[i + 1] ?? "", isPrimary: out.length === 0 });
  return out;
}

export function documentsCovered(fullSource: string, findings: TypedFinding[]): { complete: boolean; uncovered: string[] } {
  const regions = docRegions(fullSource);
  if (regions.length <= 1) return { complete: true, uncovered: [] }; // single-doc package — section completeness governs
  const primaryNorm = norm(regions.find((r) => r.isPrimary)?.text ?? "");
  const uncovered: string[] = [];
  for (const r of regions) {
    if (r.isPrimary) continue;                                           // primary solicitation — handled by section completeness
    if (!isBindingDoc({ role: "attachment", name: r.name })) continue;   // non-binding attachment (offeror-fill) — exempt
    if (!obligationsOf(r.text).obligations.length) continue;             // read_no_obligation — a thin binding attachment is covered
    const nRegion = norm(r.text);
    // A finding proves this attachment was ANALYZED only if its excerpt is grounded IN the attachment AND is not a
    // coincidental duplicate of a phrase already present in the PRIMARY (a flow-down sentence appearing in both) —
    // else a primary finding could falsely certify an unanalyzed attachment (a false COMPLETE, the dangerous direction).
    if (!findings.some((f) => { const ex = norm(f.excerpt || ""); return ex.length > 0 && nRegion.includes(ex) && !primaryNorm.includes(ex); })) uncovered.push(r.name);
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

export function completenessOf(ctx: AuditToolContext, required: string[], findings: TypedFinding[], sectionsRead: Set<string>, opts?: { sectionMDepth?: boolean }): { covered: string[]; missing: string[]; attestations: SectionAttestation[] } {
  const attestations: SectionAttestation[] = [];
  for (const sec of required) {
    // C-3 (Brain C.c): the completeness PROOF reads the FULL section (uncapped), NOT the lens's capped view — an
    // obligation past the lens read-cap must surface as ungrounded, never be invisible. `lensTruncated` records
    // that the LENS saw only a slice (so a section with no direct finding + a truncated lens view cannot be
    // certified thin/covered — it is a truncation event ⇒ INCOMPLETE below).
    const text = sectionFullText(ctx, sec); const nText = norm(text);
    const lensTruncated = readSection(ctx, sec).truncated;
    if (!sectionsRead.has(sec)) { attestations.push({ section: sec, status: "unread", obligations: [], citedFindingIds: [], ungrounded: [] }); continue; }
    const direct = findings.filter((f) => f.excerpt && nText.includes(norm(f.excerpt)));
    if (direct.length) { attestations.push({ section: sec, status: "covered_direct", obligations: [], citedFindingIds: direct.map((f) => f.id!).filter(Boolean), ungrounded: [] }); continue; }
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
    // C-3/C-7: a section the LENS could only partially read (lensTruncated) or whose obligation set overflowed the
    // proof cap (obTruncated) cannot be certified "thin"/covered — the unread tail may carry a bar. A truncation
    // event with no direct grounded finding ⇒ obligations_ungrounded ⇒ INCOMPLETE (never a silent COMPLETE).
    if (!obligations.length) {
      if (lensTruncated) { attestations.push({ section: sec, status: "obligations_ungrounded", obligations: [], citedFindingIds: [], ungrounded: [`[truncated] §${sec} exceeds the lens read-cap — tail not read, cannot certify complete`] }); continue; }
      attestations.push({ section: sec, status: "read_no_obligation", obligations: [], citedFindingIds: [], ungrounded: [] }); continue;
    }
    const cited = new Set<string>(); const ungrounded: string[] = [];
    for (const ob of obligations) { const ids = groundedBy(ob, findings, sec); if (ids.length) ids.forEach((i) => cited.add(i)); else ungrounded.push(ob); }
    if (obTruncated) ungrounded.push(`[truncated] §${sec} has more than ${MAX_OBLIGATIONS} obligation sentences — tail not proven`);
    attestations.push({ section: sec, status: ungrounded.length ? "obligations_ungrounded" : "covered_attested", obligations, citedFindingIds: [...cited], ungrounded });
  }
  const covered = attestations.filter((a) => a.status === "covered_direct" || a.status === "covered_attested" || a.status === "read_no_obligation").map((a) => a.section);
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

  // P0 — manifest of binding sections present in this package.
  const required = buildManifest(ctx);

  // P1 — run the agentic experts in parallel; each grounds its own findings. Assign stable finding IDs +
  //       collect the pure-observer trace (sections read, tool calls) for completeness + adjudication.
  const perLens: Record<string, number> = {};
  const trace: AuditResult["trace"] = {};
  const sectionsRead = new Set<string>();
  const runs = await Promise.all(experts.map((spec) => runAgenticExpert(spec, ctx, { callModel, maxTurns, signal })));
  let findings: TypedFinding[] = [];
  experts.forEach((spec, i) => {
    runs[i].findings.forEach((f, j) => { f.id = `${spec.key}#${j}`; });
    perLens[spec.key] = runs[i].findings.length; findings.push(...runs[i].findings);
    runs[i].sectionsRead.forEach((s) => sectionsRead.add(s));
    trace[spec.key] = { converged: runs[i].converged, turns: runs[i].turns, sectionsRead: runs[i].sectionsRead, tools: runs[i].trace };
  });
  const allConverged = runs.every((r) => r.converged);

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
    const j1 = await runJudgmentProducer(findings, ctx.fullSource, ungrounded, { reason: opts.judgmentReason, log: (m) => console.log(`[j1] ${m}`) });
    findings = j1.findings; judgmentCost = j1.cost;
  }

  // P3 — reconcile: dedup + detect unresolved material conflict.
  findings = dedup(findings);
  const conflict = hasConflict(findings);

  // P2 — adversarial cross-examination → verifierSound + the surviving (possibly re-typed) finding set.
  //      bidderProfile flows in so the verifier can compute the knife-edge escalation set deterministically.
  const ver = await verify(ctx, findings, { bidderProfile });
  findings = ver.survived;

  // J-2 — REGISTERED INDEPENDENT VERIFIER (Brain card 246), at the P2 seam. For each universalDefect-marked
  //       finding: 3-state entailment vs the cited excerpt + source (never J-1's reasoning) → VERIFIED writes
  //       verifiedBy; REFUTED strips the mark; UNVERIFIABLE leaves it unverified (NHR wall holds). Gated: flag + caller.
  if (judgmentLayerEnabled() && opts.judgmentEntail) {
    const j2 = await runJudgmentVerifier(findings, ctx.fullSource, { entail: opts.judgmentEntail, log: (m) => console.log(`[j2] ${m}`) });
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
  const { covered, missing, attestations } = completenessOf(ctx, required, findings, sectionsRead, { sectionMDepth: process.env.AUDIT_SECTION_M_DEPTH === "true" });
  // C-2 (Brain C.f) — a binding ATTACHMENT ingested-with-text but unanalyzed (no finding grounded in it, and it
  // carries obligations) is an incomplete read, just like an unread section.
  const docCoverage = documentsCovered(ctx.fullSource, findings);
  const coverageComplete = allConverged && missing.length === 0 && required.length > 0 && docCoverage.complete;

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

  // P4.2b — OR-EQUAL CARVE-OUT (Brain card 139, Step 6), default-OFF (=== "true"). Runs FIRST among the re-typing
  //      gates: a "brand name OR EQUAL" / salient-characteristics bar (mis-typed structural via bare "brand name")
  //      → bidder_controls + cautionFloor (furnish an approved equal). A co-stated restrictive qualifier (only /
  //      no substitution / sole source) VETOES it → stays a bar. Once re-typed, every downstream structural gate
  //      and firmStatus skips it. NEVER touches a non-brand-name bar (QPL/clearance). Flag off ⇒ unchanged.
  findings = applyOrEqualCarveout(findings, { enabled: process.env.AUDIT_OREQUAL_CARVEOUT === "true" });

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
  const inputs: VerdictInputs = { findings, bidderProfile, coverageComplete, verifierSound: ver.sound, conflict, documentsComplete: opts.manifestComplete, manifestComplete: manifestComplete(ctx) && coreMissing.length === 0 };
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

  return { decision, inputs, findings, coverage: { required, covered, missing, attestations, coreMissing }, perLens, conflict, sectionsRead: [...sectionsRead], trace, ...(judgmentLayerEnabled() && (opts.judgmentReason || opts.judgmentEntail) ? { judgmentCost } : {}) };
}
