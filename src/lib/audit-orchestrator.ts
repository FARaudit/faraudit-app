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
import { readSection, procurementPart, type AuditToolContext } from "./audit-tools";
import { deriveVerdict, applyCautionFloor, applyTemporalConflict, applyPreconditionOvertypeFloor, applyAwardBasisOvertypeGuard, setAsideOvertypeGuardOpts, applyStructuralBarWhitelist, applySetAsideFirmStatusGate, applyNonmanufacturerRuleGate, applyClauseSemanticsGuard, applyOrEqualCarveout, type Decision } from "./audit-decide";
import { highSignalSweep } from "./audit-grounding-sweep";
import type { TypedFinding, BidderProfile, VerdictInputs } from "./audit-findings";

/** UCF sections that carry binding obligations — the ones completeness is measured against. */
export const BINDING_SECTIONS = ["B", "C", "H", "I", "L", "M"] as const;

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
export function coreMissingFor(ctx: AuditToolContext, opts?: { commercialHonestFail?: boolean }): string[] {
  const part = procurementPart(ctx);
  if (part === "part15-ucf") return ["C", "L", "M"].filter((k) => !readSection(ctx, k).present);
  if (opts?.commercialHonestFail && part === "part12-commercial")
    // Label the disclosure by the COMMERCIAL clause numbers (not §L/§M) so the gap reads honestly. Cap fires
    // ONLY when BOTH are absent — a single one missing is plausibly inline/by-reference (no false scare).
    return (!readSection(ctx, "L").present && !readSection(ctx, "M").present) ? ["52.212-1", "52.212-2"] : [];
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

/** Extract obligation sentences from a section — the clauses that impose a duty (shall/must/provide/...). */
function obligationsOf(text: string): string[] {
  return text.split(/(?<=[.;\n])/).map((s) => s.trim())
    .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s)).slice(0, 25);
}

/** A ≥4-word verbatim n-gram shared between an obligation sentence and a grounded finding's excerpt — a
 *  Rule-64 "same span" proof that the obligation IS grounded by that finding (not a model wave-off). */
function groundedBy(obligation: string, findings: TypedFinding[]): string[] {
  const words = norm(obligation).split(" ").filter(Boolean);
  const grams: string[] = [];
  for (let i = 0; i + 4 <= words.length; i++) grams.push(words.slice(i, i + 4).join(" "));
  const ids: string[] = [];
  for (const f of findings) { const ex = norm(f.excerpt || ""); if (grams.some((g) => ex.includes(g)) && f.id) ids.push(f.id); }
  return [...new Set(ids)];
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
    const text = readSection(ctx, sec).text; const nText = norm(text);
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
    const obligations = obligationsOf(text);
    if (!obligations.length) { attestations.push({ section: sec, status: "read_no_obligation", obligations: [], citedFindingIds: [], ungrounded: [] }); continue; }
    const cited = new Set<string>(); const ungrounded: string[] = [];
    for (const ob of obligations) { const ids = groundedBy(ob, findings); if (ids.length) ids.forEach((i) => cited.add(i)); else ungrounded.push(ob); }
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

  // P1.6 — CROSS-CLAUSE TEMPORAL-CONFLICT CHECK (Brain card 81 Step 2). DEFAULT-ON (Brain card 98 GO-LIVE
  //         step 1 — flip UNCOMMITTED, pending Brain review). Consumes the sweep-grounded FAT precondition +
  //         delivery window; emits a no_one_can_move show-stopper when a non-waivable precondition's min
  //         duration exceeds the delivery window → deriveVerdict → NO_BID. Set AUDIT_TEMPORAL_CONFLICT="false"
  //         to disable.
  if (process.env.AUDIT_TEMPORAL_CONFLICT !== "false") {
    const before = findings.length;
    findings = applyTemporalConflict(findings, { enabled: true, sharedAroGate: process.env.AUDIT_TEMPORAL_SHARED_ARO === "true" }); // Step 7 (Brain card 140): default-OFF order-referenced sequential-gate narrowing
    if (findings.length > before) { findings[findings.length - 1].id = "temporal_conflict#0"; perLens["temporal_conflict"] = 1; }
  }

  // P3 — reconcile: dedup + detect unresolved material conflict.
  findings = dedup(findings);
  const conflict = hasConflict(findings);

  // P2 — adversarial cross-examination → verifierSound + the surviving (possibly re-typed) finding set.
  //      bidderProfile flows in so the verifier can compute the knife-edge escalation set deterministically.
  const ver = await verify(ctx, findings, { bidderProfile });
  findings = ver.survived;

  // P4 — completeness (B-corrected): every binding section READ + obligation-coverage (direct or attested
  //      with cited finding IDs); experts must have converged. Attestations carried for trace adjudication.
  const { covered, missing, attestations } = completenessOf(ctx, required, findings, sectionsRead, { sectionMDepth: process.env.AUDIT_SECTION_M_DEPTH === "true" });
  const coverageComplete = allConverged && missing.length === 0 && required.length > 0;

  // CORE-PRESENCE (panel blocker / fail-safe #10): buildManifest/`required` only contains sections DETECTED
  // PRESENT, so a genuinely-absent core section never appears in `missing` and an unanalyzed one could render a
  // clean BID. coreMissingFor discloses absent core sections FORMAT-AWARELY off procurementPart (the single
  // deterministic source — Step 8): Part-15 UCF → §C/§L/§M (unchanged); Part-12 commercial → honest-fail ONLY if
  // BOTH the 52.212-1≡§L instructions AND the 52.212-2≡§M evaluation are absent (flag-gated; off ⇒ commercial
  // unchanged = today's free pass). Disclosure only; verdict unchanged except the manifest cap below.
  const coreMissing = coreMissingFor(ctx, { commercialHonestFail: process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS === "true" });

  // P4.2b — OR-EQUAL CARVE-OUT (Brain card 139, Step 6), default-OFF (=== "true"). Runs FIRST among the re-typing
  //      gates: a "brand name OR EQUAL" / salient-characteristics bar (mis-typed structural via bare "brand name")
  //      → bidder_controls + cautionFloor (furnish an approved equal). A co-stated restrictive qualifier (only /
  //      no substitution / sole source) VETOES it → stays a bar. Once re-typed, every downstream structural gate
  //      and firmStatus skips it. NEVER touches a non-brand-name bar (QPL/clearance). Flag off ⇒ unchanged.
  findings = applyOrEqualCarveout(findings, { enabled: process.env.AUDIT_OREQUAL_CARVEOUT === "true" });

  // P4.3 — AWARD-BASIS OVER-TYPE GUARD (Brain card 108), default-OFF (Rule 61). Re-types an award-basis /
  //      evaluation-methodology finding mis-typed no_one_can_move → bidder_controls (the award basis is never a
  //      universal bar — fixes the #1 false-NO_BID), and marks a specific socioeconomic set-aside (8(a)/HUBZone/
  //      SDVOSB/WOSB) under a NULL profile as a caution. NEVER touches temporal_conflict or a real delivery
  //      impossibility; a broad Total-SB pool is left untouched. Flag off ⇒ findings pass through unchanged.
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

  // P4.3a-bis — NONMANUFACTURER RULE GATE (Brain card 132, Step 4), default-OFF (=== "true"). The never-missed
  //      deterministic FLOOR: on a SMALL-BUSINESS set-aside for a SUPPLY/MANUFACTURING NAICS (sector 31-33/42/44/45),
  //      EMIT a bidder_controls + cautionFloor caution that a nonmanufacturer must supply a small-business
  //      manufacturer's U.S.-made product (FAR 52.219-1) — the prong most small firms miss. Fires off the
  //      DETERMINISTIC SAM facts (opts.naics + opts.setAside), never a source regex; NAICS absent → silent (honest).
  //      Runs POST-VERIFY so the adversarial skeptic can never cull the floor; non-duplicating vs a lens NMR
  //      finding (52.219-1 ≠ 52.219-14). Flag off ⇒ findings pass through unchanged.
  {
    const before = findings.length;
    findings = applyNonmanufacturerRuleGate(findings, { naics: opts.naics, setAside: opts.setAside }, { enabled: process.env.AUDIT_NONMANUFACTURER_RULE_GATE === "true" });
    if (findings.length > before) { findings[findings.length - 1].id = "nonmanufacturer_rule#0"; perLens["nonmanufacturer_rule"] = 1; }
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

  // P5 — DECIDE deterministically from the typed grounded facts. manifestComplete enforces the card-58
  //      asymmetry cap: a no-bar verdict (BID/CAUTION) on a package with an unfetched manifest attachment,
  //      an over-budget source, OR a MISSING CORE UCF SECTION (panel B-2) is capped to INCOMPLETE — the
  //      engine cannot confidently BID over evaluation factors / §C / §L it never found. `coreMissing` is
  //      already FORMAT-AWARE (UCF only; commercial/simplified state these inline → empty), so this never
  //      caps a legitimately-inline commercial buy. Bar-found verdicts (NO_BID/INELIGIBLE) are NOT capped.
  const inputs: VerdictInputs = { findings, bidderProfile, coverageComplete, verifierSound: ver.sound, conflict, manifestComplete: manifestComplete(ctx) && (opts.manifestComplete ?? true) && coreMissing.length === 0 };
  const decision = deriveVerdict(inputs);

  return { decision, inputs, findings, coverage: { required, covered, missing, attestations, coreMissing }, perLens, conflict, sectionsRead: [...sectionsRead], trace };
}
