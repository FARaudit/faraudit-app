// ── AGENTIC VERIFICATION ENGINE · Layer-2: DETERMINISTIC DECISION (the moat) ────────────────────────
// Brain card 43, build order #1 (Layer 2 FIRST — pure code, testable in isolation, where the stability
// AND the moat live). The verdict + dispositions are NO LONGER sampled from a stochastic LLM judge —
// they are DERIVED here, in code, from the typed grounded findings (audit-findings.ts). Same input →
// identical verdict, always (pure function). That sentence — "every verdict derived in code from
// grounded findings, never sampled from a model" — is what a Gemini/GPT wrapper cannot say. This is the
// proprietary layer ON TOP of Anthropic's agentic primitives (structured outputs / subagents / Outcomes
// / memory) that the experts (Layer 1) are built from. Anthropic productizes the agent + verification;
// the DETERMINISTIC DECISION is ours.
//
// NO LLM, NO network, NO randomness. Pure → gate-testable. The controllability rule (Brain card 41) is a
// `switch` here, not prose in a prompt — that is the entire point.

import { createHash } from "node:crypto"; // Fork-5 (card 240): deterministic sha256 for the verified-defect excerpt binding (server-side, same as agentic-ingest/model-runs). Pure — no network, no randomness.
import type { VerdictInputs, TypedFinding, BidderProfile, Controllability, RequirementKind } from "./audit-findings";
import { NMR_CAUTION } from "./audit-keyfact-detector"; // the canonical NMR requirement text — the positive-shape allowlist for the dormancy gate (Gauntlet Unit 2 R3)
import { deriveTemporalDisposition, type TemporalDisposition } from "./audit-temporal"; // VERDICT ARC move 4 (flag AUDIT_TEMPORAL_VERDICT default-OFF)
import { deriveSetAsideBackstop, type SetAsideBackstopDisposition } from "./audit-setaside-backstop"; // VERDICT ARC move-4, part B (flag AUDIT_SETASIDE_BACKSTOP default-OFF, SHADOW-ONLY; part A retired — card #677)
import { GATE_V2_ENABLED, gateV2Outcome, hasLongLeadCredential, hasPreAwardPossession } from "./audit-gate-v2";
import { SITE_VISIT_RE, SITE_VISIT_CONCLUDED_RE, BOA_IDIQ_HOLDER_BAR_RE } from "./audit-site-visit-patterns";
import { demoteMmEvidenceFactor, hasGroundedLeadTimeBasis } from "./mm-evidence-factor"; // card #538 (flag AUDIT_MM_EVIDENCE_FACTOR_DEMOTION)
import { classifyGateShape } from "./panel-findings-bridge"; // ratified positive who-can-win shape classifier — the Unit-1 perf-obligation gate's keep-the-bar veto (Gauntlet R1: no bar-vocab blocklist). Type-only elsewhere ⇒ no import cycle.

export type Verdict = "BID" | "BID_WITH_CAUTION" | "NO_BID" | "INELIGIBLE" | "NEEDS_HUMAN_REVIEW" | "INCOMPLETE";
export type Disposition = "met" | "gate_to_clear" | "disqualifying" | "dropped";

export interface DecidedFinding extends TypedFinding { disposition: Disposition; }
export interface Decision {
  verdict: Verdict;
  eligible: boolean | null;  // null = "not determined" (honest-fail under AUDIT_ELIGIBLE_TRISTATE) — never false on an undetermined verdict (doctrine #6)
  reason: string;
  dispositions: DecidedFinding[];      // every finding with its derived disposition
  showStoppers: DecidedFinding[];      // disqualifying bars the firm PROVABLY fails (the only NO_BID/INELIGIBLE drivers)
  // VERDICT ARC (move 4/5) — set ONLY on a live-confirmed CLOSED solicitation (verdict "NO_BID"). Keeps the
  // 6-word Verdict invariant intact (no new verdict word → no NO_BID-consumer blast radius) while letting the
  // report render the distinct "closed — recompete-watch" state instead of a generic no-bid. Absent ⇒ unchanged.
  temporalClosed?: boolean;
}

// ── LOGICAL show-stopper count (Brain card-53 ruling) ────────────────────────────────────────────────
// maxShowStoppers counts DISTINCT LOGICAL BARS, not finding rows — a fact about the solicitation, not about
// dedup plumbing ("one sole-source bar corroborated at C.14, CLIN-0001AA, L.6c" is ONE bar, three citations).
// This is REPORT-QUALITY POLISH only: it runs DOWNSTREAM of deriveVerdict over the show-stopper set and
// NEVER feeds back into deriveVerdict/firmStatus (the proven deterministic core is untouched).
export interface LogicalShowStopper { requirement: string; controllability: Controllability; objectIds: string[]; citations: string[]; findings: DecidedFinding[]; }

/** Distinctive object identifiers in a string: tokens ≥4 chars carrying BOTH a letter and a digit (part
 *  numbers / CAGE codes like DGMT1002, 1PN61) — the strongest "same named object" signal. */
function objectIdsOf(f: TypedFinding): Set<string> {
  const out = new Set<string>();
  for (const src of [f.requiredAttribute, f.requirement, f.excerpt]) {
    for (const tok of (src || "").toLowerCase().split(/[^a-z0-9]+/))
      if (tok.length >= 4 && /[a-z]/.test(tok) && /[0-9]/.test(tok)) out.add(tok);
  }
  return out;
}

/** Collapse show-stoppers that refer to the SAME underlying restriction — CONSERVATIVE merge key (Brain
 *  card-53): same controllability AND a shared distinctive object identifier. NOT an OR over section-cite or
 *  loose tokens (two distinct bars can share a section or the word "OEM" by coincidence). When in doubt — no
 *  shared distinctive object — DO NOT merge (preserves the over-fire signal). All citations are retained. */
export function logicalShowStoppers(showStoppers: DecidedFinding[]): LogicalShowStopper[] {
  const groups: Array<{ controllability: Controllability; ids: Set<string>; findings: DecidedFinding[] }> = [];
  for (const f of showStoppers) {
    const ids = objectIdsOf(f);
    const g = ids.size ? groups.find((g) => g.controllability === f.controllability && [...ids].some((i) => g.ids.has(i))) : undefined;
    if (g) { ids.forEach((i) => g.ids.add(i)); g.findings.push(f); }
    else groups.push({ controllability: f.controllability, ids: new Set(ids), findings: [f] });
  }
  return groups.map((g) => ({ requirement: g.findings[0].requirement, controllability: g.controllability, objectIds: [...g.ids], citations: g.findings.map((f) => f.citation), findings: g.findings }));
}

/** The graduation-graded count: distinct logical bars (Brain card-53). */
export function logicalShowStopperCount(showStoppers: DecidedFinding[]): number { return logicalShowStoppers(showStoppers).length; }

// ── KNIFE-EDGE detection (Brain card-54 doctrine) ────────────────────────────────────────────────────
// The edge is finding-DISPOSITION contestability, decided by a DETERMINISTIC sensitivity test — never a
// model "feels close" call (that would reintroduce the single-evaluator failure). A finding is knife-edge
// iff: (a) it is BOUNDARY-CLASS — its disposition is NOT locked by evidence (firmStatus must be "unknown";
// a profile-PROVEN fail/satisfy is anchored to a known fact, not contestable — so #3's Dillon bars, proven
// fails, are NOT knife-edge); AND (b) bumping its disposition ONE NOTCH flips the top-line verdict. Only
// disqualifying-class findings can move the verdict, so only they are tested. Pure + auditable.
// Card #374 ADD-7 (field-strip class): this is an INTENTIONAL minimal projection, NOT an orphan — knife-edge testing
// deliberately holds coverage/verifier/conflict at a clean baseline to ISOLATE a single finding's disposition effect;
// spreading the caller's other VerdictInputs fields here would corrupt that isolation. Do not "spread-preserve" this.
const provisional = (findings: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false });

/** Adjacent re-typings of a disqualifying finding — "one notch" along the disposition ladder. */
function bumpOneNotch(f: TypedFinding): TypedFinding[] {
  if (f.controllability === "bidder_cannot_move")
    return [{ ...f, controllability: "bidder_controls" }, { ...f, curableInWindow: f.curableInWindow === false ? true : false }];
  if (f.controllability === "no_one_can_move")
    return [{ ...f, controllability: "bidder_cannot_move", curableInWindow: false }, { ...f, controllability: "bidder_controls" }];
  return [];
}

const isBarClass = (f: TypedFinding) => f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move";

/** Cluster finding indices that share a distinctive object id (same named part/cert/OEM) — the units across
 *  which lenses can DISAGREE on disposition. Greedy, conservative (same key as the dedup). */
function clusterByObject(findings: TypedFinding[]): number[][] {
  const clusters: Array<{ ids: Set<string>; idx: number[] }> = [];
  findings.forEach((f, i) => {
    const ids = objectIdsOf(f);
    if (!ids.size) return;                                                            // no distinctive object → no cluster
    const c = clusters.find((c) => [...ids].some((x) => c.ids.has(x)));
    if (c) { ids.forEach((x) => c.ids.add(x)); c.idx.push(i); }
    else clusters.push({ ids: new Set(ids), idx: [i] });
  });
  return clusters.map((c) => c.idx).filter((idx) => idx.length > 1);                  // only multi-finding clusters can disagree
}

/** Indices of the knife-edge findings — the ONLY ones worth the expensive Opus re-type (Brain card-54/55).
 *  TWO deterministic triggers, both gated by a sensitivity flip; never a model "feels close" call:
 *    (1) BAR→CAUTION — a bar-typed, boundary-class (firmStatus unknown) finding whose one-notch bump flips
 *        the verdict (catches an OVER-typed bar that's really a caution). Evidence-locked bars are excluded.
 *    (2) UNDER-TYPED BAR via LENS DISAGREEMENT — findings on the SAME object typed with DIFFERENT
 *        controllability (one a bar, one not) where resolving the cluster toward the SEVERE typing flips the
 *        top-line. This is the dangerous edge (a genuine bar a lens mis-typed DOWN → false BID); it relies on
 *        multi-lens diversity, not on any single model noticing. */
export function knifeEdgeIndices(findings: TypedFinding[], profile: BidderProfile | null): number[] {
  const base = deriveVerdict(provisional(findings, profile)).verdict;
  const edges = new Set<number>();

  // (1) bar→caution
  findings.forEach((f, i) => {
    if (firmStatus(f, profile) !== "unknown" || !isBarClass(f)) return;
    for (const v of bumpOneNotch(f))
      if (deriveVerdict(provisional(findings.map((g, j) => (j === i ? v : g)), profile)).verdict !== base) { edges.add(i); break; }
  });

  // (2) under-typed bar via lens disagreement on the same object. Fire only when there is a genuine
  //     bar-vs-nonbar disagreement, the bar side is NOT evidence-locked (firmStatus unknown → contestable;
  //     excludes #3's profile-proven Dillon bars), and the verdict DEPENDS on how the disagreement resolves
  //     (severe-resolution verdict ≠ lenient-resolution verdict).
  for (const idx of clusterByObject(findings)) {
    const bars = idx.filter((i) => isBarClass(findings[i]));
    const nonbars = idx.filter((i) => !isBarClass(findings[i]));
    if (!bars.length || !nonbars.length) continue;                                    // need a real disagreement
    if (!bars.some((i) => firmStatus(findings[i], profile) === "unknown")) continue;  // evidence-locked bar → not contestable
    const severe = findings.map((g, j) => (idx.includes(j) ? { ...g, controllability: "bidder_cannot_move" as const, curableInWindow: false } : g));
    const lenient = findings.map((g, j) => (idx.includes(j) ? { ...g, controllability: "bidder_controls" as const } : g));
    if (deriveVerdict(provisional(severe, profile)).verdict !== deriveVerdict(provisional(lenient, profile)).verdict) idx.forEach((i) => edges.add(i));
  }

  return [...edges].sort((a, b) => a - b);
}

// ── DETERMINISTIC CAUTION-FLOOR (Brain card 75-R2 / 78-R1) ───────────────────────────────────────────
// A pure, no-model pass that runs on findings BEFORE deriveVerdict (independent of lens consensus — the
// same override slot as the knife-edge re-typing). It recognizes CAUTION ARCHETYPES and marks the matching
// finding with `cautionFloor`, which floors the verdict to BID_WITH_CAUTION minimum. It does NOT re-type
// the finding into a profile-checked bar, so it can NEVER create a show-stopper (never INELIGIBLE) and —
// checked only after the disqualifying/human-review branches — NEVER downgrades a NO_BID/INELIGIBLE.
// Gated by a default-OFF flag (Rule 61); flag off ⇒ no marks ⇒ deriveVerdict behaves byte-for-byte as before.
const ROLE_RE = /\b(?:senior|lead|chief|principal|project|fine\s+art|architectural|registered)?\s*(?:conservator|architect|engineer|scientist|geologist|hydrologist|hygienist|surveyor|estimator|superintendent|inspector|specialist|technician|designer|planner|toxicologist|archaeologist|biologist|chemist)s?\b/i;
const YEARS_RE = /\b(?:\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|twenty[-\s]five|thirty)\b\s*(?:\(\s*\d{1,2}\s*\)\s*)?years?\b/i;
const EXP_CONTEXT_RE = /\b(?:experience|minimum|at least|no less than|not less than|shall have|must have|years of)\b/i;
const CERT_RE = /\b(?:professional engineer|registered architect|licensed (?:professional|architect|engineer|surveyor)|\bP\.?E\.?\b\s*licen|certified industrial hygienist|\bCIH\b|\bPMP\b|\bCISSP\b|state[-\s]licensed|professional (?:license|licensure|certification|registration|credential)|board[-\s]certified)\b/i;
const PERSONNEL_RE = /\b(?:personnel|staff|conservator|architect|engineer|key personnel|team member|specialist|technician|project director|on-site)\b/i;
const QPL_RE = /\b(?:QPL|QML)\b|qualified products? list|qualified manufacturers? list/i;
const OREQUAL_RE = /\bor[-\s]equal\b|salient characteristic|prove(?:n)? equivalen|approved equal|brand name or equal/i;
// responsibility/SAM/set-aside/boilerplate context that must NOT, by itself, trip the professional-cert arm.
const EXCLUDE_RE = /\b(?:SAM registration|System for Award Management|active registration|responsib|52\.209-5|conflict of interest|debarr|suspend|set[-\s]aside|small business (?:pool|status|set)|equal opportunity|\bEEO\b|trafficking|bytedance|tiktok)\b/i;

/** Does a finding match a CAUTION archetype? Pure. FIRES on: (a) a named role + a QUANTIFIED experience
 *  minimum; (c) QPL/QML membership; (d) an "or-equal" qualification burden; (b) a specialized professional
 *  certification/license OF PERFORMING PERSONNEL (gated by NOT a responsibility/SAM/set-aside context).
 *  Does NOT fire on generic "qualified/experienced personnel", SAM/responsibility boilerplate, or plain
 *  set-aside pool membership. */
export function isCautionArchetype(f: TypedFinding): { fires: boolean; archetype?: string } {
  const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
  if (ROLE_RE.test(hay) && YEARS_RE.test(hay) && EXP_CONTEXT_RE.test(hay)) return { fires: true, archetype: "named-role+experience-years" };
  if (QPL_RE.test(hay)) return { fires: true, archetype: "QPL/QML-membership" };
  if (OREQUAL_RE.test(hay)) return { fires: true, archetype: "or-equal-qualification-burden" };
  if (CERT_RE.test(hay) && PERSONNEL_RE.test(hay) && !EXCLUDE_RE.test(hay)) return { fires: true, archetype: "professional-cert/license-of-personnel" };
  return { fires: false };
}

/** Mark caution-archetype findings with `cautionFloor` so deriveVerdict floors to BID_WITH_CAUTION minimum.
 *  FLOOR-ONLY: skips findings already bar-class (bidder_cannot_move/no_one_can_move) so it can never soften a
 *  bar; leaves controllability/kind untouched (no show-stopper can be created). Flag-gated; OFF (the default)
 *  returns the findings unchanged. Pure. */
export function applyCautionFloor(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged
  return findings.map((f) => {
    if (f.kind === "procedural_obligation") return f; // card 208-B: coverage-only, never floored — keeps the class inert even if a §L/§M span contains a caution archetype
    if (f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move") return f; // already ≥caution — never downgrade
    return isCautionArchetype(f).fires ? { ...f, cautionFloor: true } : f;
  });
}

// ── PRECONDITION OVER-TYPE FLOOR (Brain card 92 — Option 1 deterministic guard) ───────────────────────
// Override-slot guard (same layer as caution-floor, BEFORE deriveVerdict; deriveVerdict UNTOUCHED). A
// time-curable PRECONDITION (first-article/FAT, source-approval, qualification-testing) is NOT a universal
// bar — every bidder can perform it; it becomes universal ONLY when its minimum duration EXCEEDS the
// delivery window, which the deterministic `temporal_conflict` finding DERIVES. A lens that types the BARE
// precondition `no_one_can_move` — with NO window/duration conflict co-stated in its four corners — has
// OVER-typed it (a false NO_BID on a feasible package). This guard re-types that finding to
// `bidder_controls`. It NEVER mutates the `temporal_conflict` finding (the real, derived impossibility),
// NEVER a structural bar (sole-source/QPL/clearance), and NEVER a finding that co-states a window/duration
// conflict. Flag-gated; default OFF (Rule 61) ⇒ findings unchanged byte-for-byte (legacy preserved).
const PRECONDITION_BASIS_RE = /\bfirst[-\s]?article\b|\bFAT\b|source approval|qualification testing|qualification test\b|pre[-\s]?production (?:test|approval|qualification)/i;
const STRUCTURAL_BAR_RE = /\bsole[-\s]?source\b|named (?:OEM|manufacturer|brand|source)|\bQPL\b|\bQML\b|qualified products? list|qualified manufacturers? list|security clearance|facility (?:clearance|security|certification)|unobtainable|exclusive (?:license|distributor|dealer)|single authorized/i;
// A window/duration conflict CO-STATED in the finding's four corners (an ARO/delivery-window duration, or an
// explicit impossibility phrase). GENEROUS by design — when a conflict is co-stated the guard MUST NOT fire
// (a real universal bar must never be downgraded → that would re-arm the false BID). A bare precondition
// finding ("FAT is non-waivable") carries none of these.
const WINDOW_CONFLICT_RE = /\bARO\b|after receipt of order|delivery within\b|\b\d+[-\s]?day\s+(?:delivery|production|performance)\b|cannot (?:complete|be met|deliver|comply)|no bidder can|universal(?:ly)?\s+(?:impossib|unmeetable|delivery)|exceeds?\b[^.]{0,40}\bwindow|inside\b[^.]{0,40}\bwindow|longer than\b[^.]{0,40}\bwindow/i;

/** Re-type a precondition mis-typed `no_one_can_move` → `bidder_controls` (Brain card 92). Pure → gate-tested.
 *  FIRES only on a `no_one_can_move` finding whose basis is a time-curable precondition AND which is neither
 *  the derived `temporal_conflict` finding, nor a structural bar, nor co-states a window/duration conflict.
 *  Flag-gated; OFF (default) ⇒ unchanged. */
export function applyPreconditionOvertypeFloor(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged (legacy bug preserved)
  return findings.map((f) => {
    if (f.controllability !== "no_one_can_move") return f;        // only over-typed universals are candidates
    if (f.lens === "temporal_conflict") return f;                 // NEVER mutate the derived conflict
    const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
    // Altitude (uniform with the other downgrade arms): the precondition basis must be in the
    // lens's REQUIREMENT, not the verbatim excerpt — else an excerpt coincidentally quoting
    // "first article"/"FAT" downgrades a genuine universal impossibility. STRUCTURAL/WINDOW
    // exclusions stay on `hay` (keeping a bar universal is the conservative direction).
    if (!PRECONDITION_BASIS_RE.test(f.requirement)) return f;     // not a precondition basis (requirement-driven)
    if (STRUCTURAL_BAR_RE.test(hay)) return f;                    // genuine structural bar → leave universal
    if (WINDOW_CONFLICT_RE.test(hay)) return f;                   // co-states a window conflict → leave universal
    return { ...f, controllability: "bidder_controls", preconditionOvertypeFloored: true };
  });
}

// ── ROUTINE-CLAUSE OVER-TYPE GUARD (Guard 2) ─────────────────────────────────────────────────────────
// Override-slot guard (same layer as the precondition floor / award-basis guard, BEFORE deriveVerdict;
// deriveVerdict UNTOUCHED). The construction proposer, run once per binding document, AMPLIFIES a typing
// variance the card-291 prompt could not make reliable: it occasionally types two classes of ROUTINE federal
// clause as a bar, and the DISPOSE rail then honest-fails the whole package (NHR) on a non-bar. Two narrow,
// deterministic re-types close it, keyed on construction-SPECIFIC clause tokens (NOT generic vocabulary):
//   (a) AVAILABILITY OF FUNDS (52.232-18 / 52.232-19 / "subject to the availability of appropriations") mis-typed
//       no_one_can_move → bidder_controls. This is a routine appropriations contingency present in almost every
//       federal solicitation; it is NEVER a universal impossibility (no_one_can_move is only a self-contradictory
//       or unmeetable-by-any-offeror solicitation). A false no_one_can_move here is a false NO_BID / false NHR.
//   (b) BONDING (52.228-1/-15/-16 / bid guarantee / performance & payment bond) mis-typed bidder_cannot_move →
//       bidder_controls. Furnishing a bond is a do-the-work gate the bidder CLEARS by obtaining the bond — it is
//       never a non-curable PROFILE credential the firm must independently hold.
// SAFETY (adversarial): (a) only fires on no_one_can_move (never softens a bidder_cannot_move profile bar into a
// clean BID), and NEVER on a finding carrying a VERIFIED universal-defect mark (universalDefect / verifiedBy) — a
// genuine, evidence-backed universal impossibility is left untouched. The regexes are FAR-clause-specific, so a
// finding merely mentioning "funds" or "bond" in passing does not match. Flag-gated; OFF (default) ⇒ unchanged.
const AVAILABILITY_OF_FUNDS_RE = /\b52\.232-(?:18|19)\b|availability of funds|subject to the availability of (?:funds|appropriations)|availability of appropriations/i;
const BONDING_CLAUSE_RE = /\b52\.228-(?:1|15|16)\b|bid guarantee|performance and payment bonds?|performance bond|payment bond/i;

/** Re-type a ROUTINE federal clause the proposer over-typed as a bar → bidder_controls (Guard 2). Pure →
 *  gate-tested. Two arms: Availability-of-Funds no_one_can_move → bidder_controls; bonding bidder_cannot_move →
 *  bidder_controls. NEVER touches a verified universal defect. Flag-gated; OFF (default) ⇒ unchanged. */
export function applyRoutineClauseOvertypeGuard(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // default-off ⇒ byte-for-byte unchanged
  return findings.map((f) => {
    // A VERIFIED universal defect (evidence-backed contradictory/unmeetable terms) is NEVER downgraded — the guard
    // corrects proposer MIS-typing, not a proven impossibility. (Note: on the judgment-first proposer path
    // projectProposedFinding strips these marks, so this check alone is NOT load-bearing — the requirement-scoped
    // trigger + the structural keep-the-bar exclusion below are the real protection. Adversarial-review card.)
    if (f.universalDefect || f.verifiedBy) return f;
    // TRIGGER on citation + requirement ONLY — NEVER the verbatim excerpt. Altitude discipline borrowed from the
    // sibling applyPreconditionOvertypeFloor (which keys its downgrade basis on `requirement`, not `excerpt`, for
    // exactly this reason): a genuine bar (facility clearance / QPL / sole-source) whose grounded excerpt happens to
    // quote a NEIGHBORING bonds or appropriations clause must not be downgraded → that was a false-BID / suppressed-
    // INELIGIBLE hole (adversarial-review catastrophic finding). The proposer's actual over-type carries the routine
    // clause in its OWN requirement/citation, so the guard still fires on the real target.
    const trigger = `${f.citation ?? ""} ${f.requirement ?? ""}`;
    // KEEP-THE-BAR exclusion on the FULL hay (incl. excerpt): if a genuine structural-impossibility token is co-stated
    // ANYWHERE, never downgrade — keeping a bar is the conservative zero-contract-loss direction (mirrors the sibling).
    // Uses the COMPREHENSIVE STRUCTURAL_BAR_RE_114 (not the narrow STRUCTURAL_BAR_RE): a genuine non-curable bar whose
    // OWN requirement co-states a routine bond/appropriations clause (e.g. a DoD construction+cyber bundle: "maintain
    // CMMC Level 2 at award and furnish performance & payment bonds") must keep the CMMC/ATO/TDP/clearance/cert-at-
    // award bar — the narrow regex missed those whole classes → residual false-BID (second adversarial pass). Erring
    // toward keep-the-bar can only leave a routine clause un-downgraded (→ honest-fail NHR), never a false BID.
    const hay = `${trigger} ${f.excerpt ?? ""}`;
    if (STRUCTURAL_BAR_RE_114.test(hay)) return f;
    // (a) Availability of Funds mis-typed as a universal impossibility → routine contingency, biddable.
    if (f.controllability === "no_one_can_move" && AVAILABILITY_OF_FUNDS_RE.test(trigger))
      return { ...f, controllability: "bidder_controls", curableInWindow: true, routineClauseGuard: true };
    // (b) Bonding mis-typed as a non-curable profile bar → the bidder obtains the bond (do-the-work gate).
    if (f.controllability === "bidder_cannot_move" && BONDING_CLAUSE_RE.test(trigger))
      return { ...f, controllability: "bidder_controls", curableInWindow: true, routineClauseGuard: true };
    return f;
  });
}

// ── PERFORMANCE-OBLIGATION INSURANCE DO-THE-WORK GATE (Phase 3 Unit 1, flag AUDIT_PERF_OBLIGATION_INSURANCE default-OFF) ──
// Insurance is a DO-THE-WORK gate the bidder CLEARS by obtaining a policy — self-acquirable inside the window, exactly
// like a bond (applyRoutineClauseOvertypeGuard arm (b)). It is NEVER a non-curable PROFILE credential the firm must
// independently already hold (that is a facility clearance / QPL / CMMC-at-award / cert-to-be-held — those stay bars).
// The seq-2 dccce793 record (12318726Q0165) typed "Drug/Alcohol Abuse Counselor must maintain professional liability
// insurance $1M/occurrence $3M aggregate throughout performance" (finding #49) as a NON-CURABLE eligibility_bar /
// bidder_cannot_move — a fabricated show-stopper that contributed to the false AUTO-F — while the SAME requirement also
// appears CORRECTLY typed as a do-the-work submission elsewhere in the record (#74: bidder_controls / curable, "provide
// required insurance with proof at award"). This gate re-types a bidder_cannot_move finding whose trigger positively
// matches the INSURANCE do-the-work SHAPE → bidder_controls + curable, so deriveVerdict stops failing the package on it.
//
// STRIP-THEN-RESIDUAL POSITIVE GATE (Gauntlet Unit 1 R1+R2 lessons — [[feedback_no_blocklist_shape_allowlist_doctrine]]).
//   R1 proved a keep-the-bar BAR-VOCAB BLOCKLIST leaks (held bars outside the enumerated vocab demote → false BID). R2
//   proved that replacing it with a positive HELD-CREDENTIAL SHAPE whose verb-list + noun-class are FIXED ENUMERATIONS
//   is "a blocklist in disguise for the RESIDUAL" — held/conferred bars outside the shape (OEM-authorized, approved-by-a-
//   body, FedRAMP authorization, in-good-standing, listed-on-a-roster) still demoted → false BID; and the co-stated
//   insurance verb "provide … insurance" contaminated classifyGateShape(WHOLE trigger) into "do_the_work", clearing the
//   credential side. The doctrine's terminal rule (R2 prescription #3): AMBIGUITY MUST FAIL TOWARD KEEP-THE-BAR, and the
//   gate must be broad enough that a NOVEL-but-genuine held bar co-stated with insurance ESCALATES BY DEFAULT.
//
//   The design that satisfies that: RECOGNIZE + REMOVE the insurance obligation span (with its governing modal), then
//   treat ANY substantive RESIDUAL obligation/status as keep-the-bar — the gate demotes ONLY when insurance is
//   essentially the SOLE operative obligation. A novel bar co-stated with insurance leaves residual content (a second
//   modal-obligation, a held/conferred status, a set-aside) → KEEP by default, with no dependence on enumerating the
//   bar's vocabulary. Classifying the RESIDUAL (not the whole trigger) also removes the R2 insurance-verb contamination.
//   FIRE requires ALL of:
//     (1) controllability === "bidder_cannot_move" (only a NON-curable mis-type is a candidate; never softens an
//         already-biddable finding or a no_one_can_move universal defect).
//     (2) NOT universalDefect / verifiedBy (a verified impossibility stands) AND NOT requiredAttribute (a finding that
//         carries its own eligibility attribute IS a typed who-can-win gate — never demote it, whatever the prose).
//     (3) POSITIVE insurance shape on the TRIGGER (citation+requirement), INSURANCE_DOWORK_RE — it IS an insurance
//         obligation. Trigger only (never the excerpt): the proposer's actual over-type carries insurance in its OWN
//         requirement. A bare industry "insurance" (NAICS / "Federal Deposit Insurance" / a firm named "…Insurance Co")
//         does not match.
//     (4) The RESIDUAL — the trigger with every insurance-obligation span (and its governing modal) STRIPPED via
//         INSURANCE_STRIP_RE — carries NO second obligation or held/conferred eligibility status. ANY of the following in
//         the residual ⇒ KEEP-THE-BAR (fail toward keep; a novel bar escalates by default):
//         (4a) RESIDUAL_OBLIGATION_RE — a leftover modal-obligation ("must / shall / is required to / responsible for /
//              be <certified|licensed|authorized|approved|…>"). Because the insurance clause's own modal was stripped in
//              (4)'s span, a SURVIVING modal signals a SECOND, distinct obligation of unknown nature → keep.
//         (4b) classifyGateShape(residual) ∈ {profile_bar, set_aside_caution} — the ratified classifier, now run on the
//              insurance-stripped residual (no do-the-work-verb contamination), recognizes a bar / set-aside.
//         (4c) HELD_CREDENTIAL_SHAPE(residual) — a possession/state verb-or-adjective over a generic credential-class
//              noun, board-certified/-eligible, a clearance level, or bonding-capacity.
//         (4d) CONFERRED_STATUS_SHAPE(residual) — a THIRD-PARTY-conferred held status (authorized/authorization,
//              approved-by/approved-source, accredited, designated, enrolled, member, in-good-standing, eligible,
//              qualified, listed-on-an-approved/qualified/vendor list-or-roster, source-approval, prequalified). This is
//              the "conferral" family R2 surfaced — a status GRANTED BY ANOTHER PARTY, not self-acquirable.
//         (4e) SOCIOECONOMIC_SETASIDE_RE(residual) — set-aside shape backstop.
//         (4f) NARROW STRUCTURAL_BAR_RE on the FULL hay incl. excerpt — a genuine HARD bar (clearance/QPL/sole-source)
//              quoted ANYWHERE; secondary backstop that can only ADD keep-the-bar conservatism.
// Flag-gated; OFF (default) ⇒ findings unchanged byte-for-byte.
const INSURANCE_DOWORK_RE = /(?:maintain|carr(?:y|ies|ied)|provid(?:e|es|ed|ing)|furnish(?:es|ed)?|obtain(?:s|ed|ing)?|procure|secure|purchase|hold|keep)\b[^.\n]{0,40}?\binsur(?:ance|ed)\b|\binsur(?:ance|ed)\b[^.\n]{0,60}?(?:per occurrence|aggregate|\$[\d,]+|policy limits?|limits? of (?:liability|insurance|not less than|at least)|coverage of)|(?:certificate|proof|evidence|acord)\b[^.\n]{0,25}?\binsur(?:ance|ed)\b|professional liability insurance|general liability insurance|commercial general liability|workers.{0,4}comp(?:ensation)? insurance|errors (?:and|&) omissions|\bE&O\b|automobile liability insurance|umbrella (?:liability )?insurance|cyber (?:liability )?insurance/i;
// INSURANCE OBLIGATION SPAN (global, for STRIPPING) — consumes the insurance clause INCLUDING an optional governing
// subject + modal + do-work verb, plus trailing coverage descriptors/magnitudes, so what remains (the residual) is the
// NON-insurance content and no dangling modal is left behind to look like a second obligation.
// INSURANCE_MOD — the closed class of insurance-TYPE modifiers allowed BETWEEN the do-work verb and the "insurance"
// noun. Restricting the verb→insurance gap to these (not arbitrary \w) stops the strip from swallowing a CO-STATED bar
// that sits between the verb and a later "insurance" (R2 "submit proof of manufacturer authorization and carry … insurance").
const INSURANCE_MOD = "(?:(?:the|a|an|its|their|any|all|such|required|appropriate|adequate|sufficient|minimum|maximum|commercial|general|public|professional|automobile|auto|motor|vehicle|umbrella|excess|cyber|technology|workers'?|workmen'?s?|comp(?:ensation)?|liability|business|employers?|property|casualty|primary|statutory|contractual|e&o|errors|omissions|malpractice|indemnity|bodily|injury|medical|aviation|marine|pollution|builders?[-\\s]?risk)\\s+)"; // NOTE: 'and' deliberately excluded — it must NOT let MOD* bridge across a clause boundary to a second insurance noun (Gauntlet R3 FAA-145 false-clear); "errors and omissions" is handled by the named-line arms.
const INSURANCE_STRIP_RE = new RegExp([
  "(?:(?:the\\s+)?(?:contractor|offeror|firm|bidder|awardee|vendor|subcontractor|prime|provider|personnel|staff|employees?|counselor)\\s+)?(?:(?:must|shall|will|is\\s+to|are\\s+to|is\\s+required\\s+to|are\\s+required\\s+to|required\\s+to|to)\\s+)?(?:(?:purchase|procure|obtain)\\s+and\\s+maintain|maintain|carr(?:y|ies|ied)|provid(?:e|es|ed|ing)|furnish(?:es|ed)?|obtain(?:s|ed|ing)?|procure|secure|purchase|keep|show|submit|demonstrate|have|be\\s+insured|remain\\s+insured)\\s+(?:proof\\s+of\\s+|evidence\\s+of\\s+|a\\s+certificate\\s+of\\s+|certificates?\\s+of\\s+)?" + INSURANCE_MOD + "*insur(?:ance|ed)\\b",
  "(?:a\\s+)?(?:certificate|proof|evidence|acord)s?\\s+of\\s+insur(?:ance|ed)",
  "professional\\s+liability\\s+insurance|general\\s+liability\\s+insurance|commercial\\s+general\\s+liability|workers.{0,4}comp(?:ensation)?\\s+insurance|errors\\s+(?:and|&)\\s+omissions|\\bE&O\\b|automobile\\s+liability\\s+insurance|umbrella\\s+(?:liability\\s+)?insurance|cyber\\s+(?:liability\\s+)?insurance",
  "\\binsur(?:ance|ed)\\b",
  "(?:at\\s+(?:a\\s+)?minimum(?:\\s+of)?\\s+)?\\$[\\d,]+(?:\\.\\d+)?(?:\\s*(?:per\\s+occurrence|/|aggregate|million|mil\\b|m\\b|k\\b))?",
  "per\\s+occurrence|aggregate|policy\\s+limits?|limits?\\s+of\\s+(?:liability|insurance|not\\s+less\\s+than|at\\s+least)|coverage(?:\\s+of)?|throughout\\s+(?:the\\s+)?(?:entire\\s+)?performance(?:\\s+period)?|during\\s+(?:the\\s+)?(?:entire\\s+)?performance(?:\\s+period)?|acceptable\\s+to\\s+the\\s+[A-Z]{2,3}\\b|prior\\s+to\\s+(?:commencing|starting|contract\\s+start|award)|with\\s+proof|proof\\s+being\\s+submitted",
].join("|"), "gi");
// RESIDUAL SECOND-OBLIGATION signal — ANY surviving modal ("must"/"shall"/…) or "be <held-status>" after the insurance
// span (incl. its own governing modal) was stripped ⇒ a SECOND, distinct obligation of UNKNOWN nature ⇒ keep-the-bar.
// This is the doctrine linchpin (R2 #3): a novel co-stated bar escalates BY DEFAULT — its modal survives the strip.
const RESIDUAL_OBLIGATION_RE = /\b(?:must|shall|will\s+(?:be|have|hold|possess|remain)|is\s+required\s+to|are\s+required\s+to|is\s+to\s+be|are\s+to\s+be|responsible\s+for|be\s+(?:certified|licensed|accredited|authorized|approved|registered|enrolled|eligible|cleared|bonded|a\s+member))\b/i;
// POSITIONAL HELD-CREDENTIAL SHAPE — a possession/state verb-or-adjective governing a GENERIC credential-class noun, a
// professional-cert adjective, a clearance level, or a held financial capacity (run on the residual). The "of insurance"
// lookahead keeps a do-the-work certificate-of-insurance token from reading as a held certification.
const HELD_CREDENTIAL_SHAPE = /(?:hold|holds|holding|possess(?:es|ing)?|maintain(?:s|ing)?|\bhave\b|\bhas\b|\bhad\b|current|active|valid|interim|existing|registered|licensed|accredited|cleared|granted|require[ds]?)\b[^.\n]{0,45}?\b(?:licens(?:e|ure|ed)|clearance|certificat(?:e|ion)|accreditat\w*|registrat(?:ion)?|credential)\b(?!\s+of\s+insurance)|board[-\s]?(?:certified|eligible)|(?:hold|holds|possess(?:es|ing)?|require[ds]?|granted|interim|active|final|current|existing|need[s]?)\s+(?:a\s+|an\s+)?(?:top[-\s]?secret|secret|ts\/sci)\b|\btop[-\s]?secret\b|\bts\/sci\b|security clearance|facility (?:security )?clearance|\bpolygraph\b|\bpoly\b|bond(?:ing)?\s+capacit\w*|bondabilit\w*/i;
// CONFERRED-STATUS SHAPE — a held status GRANTED BY A THIRD PARTY (not self-acquirable): authorization / approved-by /
// accreditation / designation / enrollment / membership / good-standing / eligibility / qualification / listed-on-an-
// approved-list / source-approval / prequalification. This is the R2 "conferral" family; a positional/relational shape
// (a conferral relationship), not an enumeration of specific named programs.
const CONFERRED_STATUS_SHAPE = /\bauthoriz(?:e|es|ed|ation)\b|approv(?:ed|al)\s+(?:by|source|vendor|manufacturer|supplier|dealer|provider|list)|\boem[-\s]?authorized\b|original\s+equipment\s+manufacturer|accredit(?:ed|ation)|\bdesignat(?:ed|ion)\b|enroll(?:ed|ment)|member(?:ship)?\s+(?:in|of|with)|in\s+good\s+standing|\bgood\s+standing\b|eligib(?:le|ility)|qualif(?:ied|ication)|listed\s+(?:on|in|with)\b|on\s+(?:the\s+)?(?:approved|qualified|preferred|vendor)\s+(?:list|roster|source|register)|source\s+approval|pre[-\s]?qualif|\bin[-\s]?network\b/i;
// CITATION-SLOT BENIGN-REFERENCE ALLOWLIST (Gauntlet Unit 1 R4). The terminal anchor (5) inspects `f.requirement`
// only; a bare-noun bar smuggled into `f.citation` ("Section L, TWIC/Insurance", "This is an AbilityOne mandatory
// source item") escapes both the modal/verb-anchored residual vetoes (4a-4f, which R3 proved miss bare nouns) and the
// requirement-only anchor → false CLEAR. The citation is a STRUCTURED REFERENCE field; a legitimate insurance-finding
// citation is a pure section/clause pointer (the real dccce793 record: "PWS §7.2.2", "Section L, Insurance/Bonding",
// "AGAR 452.204-71; FAR 52.204-9"). So every citation TOKEN must be a benign reference / insurance-family / generic-UCF
// word — a POSITIVE allowlist. Any UNRECOGNIZED token (a credential/program noun: TWIC/SCIF/AbilityOne/FAA-Part-145/…)
// ⇒ keep-the-bar (fail-toward-keep; a novel program noun escalates by default, no bar-vocab enumeration). Cost: an
// insurance finding with a wordy non-benign citation is left as a bar — a SAFE false-negative (honest NHR).
const CITATION_BENIGN_TOKEN = /^(?:section|sect|attachment|attach|exhibit|appendix|annex|clause|clauses|part|paragraph|para|article|schedule|item|items|note|notes|pws|sow|qasp|rfp|rfq|rfi|sf|clin|slin|amendment|amend|mod|provision|header|list|checked|reference|ref|see|submission|submit|question|questions|q&a|qa|response|deliverable|deliverables|task|tasks|period|acceptance|offer|offers|factor|factors|technical|management|past|performance|cost|price|pricing|evaluation|security|general|special|requirement|requirements|instructions|instruction|solicitation|addendum|table|figure|volume|tab|line|page|pages|and|or|of|for|to|the|a|an|at|in|on|no|number|nbr|per|insurance|insured|bonding|bond|bonds|coverage|liability|surety|indemnity|errors|omissions|e&o|far|dfars|agar|dfar|dod|dodi|cfr|usc|nfs|hhsar|dear|[a-z]|[ivxlcdm]+|\d[\d.,-]*)$/i;
// AFFIRMATIVELY-INSURANCE-ONLY OBLIGATION TEMPLATE (Gauntlet Unit 1 R3 — the terminal "ambiguity fails toward keep"
// inversion). R3 proved the verb/modal-anchored residual vetoes miss a genuine bar phrased as a BARE DECLARATIVE NOUN
// PHRASE ("TWIC card required", "SCIF access is a prerequisite", "This is an AbilityOne mandatory source item", "FAA
// Part 145 repair station certification") — it carries no surviving modal/status token, so the residual classifies as
// "neither" and the bar is demoted → false CLEAR. The fix: the gate FIRES ONLY when the WHOLE requirement anchor-matches
// a single pure-insurance obligation SENTENCE — an optional subject/role lead-in (no clause/sentence boundary), an
// optional governing modal, a do-work verb, the insurance noun (with only INSURANCE_MOD adjectives between), and only
// benign coverage/limit/period descriptors trailing to end-of-string. A CO-STATED bar clause (bare-noun or otherwise)
// leaves material OUTSIDE this template, so the anchored match FAILS → keep-the-bar. Novel bars escalate BY DEFAULT: any
// requirement that is not affirmatively-recognized as insurance-only keeps (a missed pure-insurance phrasing is only a
// safe false-NEGATIVE → honest NHR, never a false BID). The leading class excludes sentence/clause punctuation (. ; :)
// so the subject lead-in cannot span a second clause.
const INSURANCE_ONLY_OBLIGATION_RE = new RegExp(
  "^\\s*" +
  // optional subject / role / citation lead-in — TEMPERED: each word must NOT be a clause-word (and/or/is/are/…), an
  // obligation predicate (required/mandatory/prerequisite/must/shall/…), or a held-verb (hold/possess/…) — so the lead
  // is a pure noun-phrase SUBJECT and cannot span a co-stated bar clause (R3 "…item AND the vendor shall …" false-clear).
  "(?:(?!(?:and|or|is|are|was|were|be|been|being|its|their|required|mandatory|prerequisite|must|shall|will|should|prior|hold|holds|holding|possess|possesses|maintain|maintains|carry|carries|provide|provides|furnish|obtain|submit|have|has|had|approved|authorized|accredited|certified|licensed|eligible|enrolled|listed|member|certification|certificate|clearance|licen[sc]e|licensure|accreditation|registration|credential|authorization|designation|membership|qualification)\\b)[\\w§'/-]+[ ,]+){0,8}?" +
  "(?:(?:must|shall|will|is\\s+to|are\\s+to|is\\s+required\\s+to|are\\s+required\\s+to|required\\s+to|to|should)\\s+)?" + // optional governing modal
  "(?:(?:(?:purchase|procure|obtain)\\s+and\\s+maintain|maintain|carr(?:y|ies|ied)|provid(?:e|es|ed|ing)|furnish(?:es|ed)?|obtain(?:s|ed|ing)?|procure|secure|purchase|keep|show|submit|demonstrate|have|hold|be\\s+insured|remain\\s+insured|be\\s+covered\\s+by)\\s+)?" + // OPTIONAL do-work verb (longest arm first; passive "X insurance … required" also fires)
  "(?:proof\\s+of\\s+|evidence\\s+of\\s+|a\\s+certificate\\s+of\\s+|certificates?\\s+of\\s+|adequate\\s+|sufficient\\s+|the\\s+following\\s+)?" +
  "(?:" + INSURANCE_MOD + "*insur(?:ance|ed)|errors\\s+(?:and|&)\\s+omissions|\\be&o\\b|professional\\s+liability|general\\s+liability|commercial\\s+general\\s+liability)\\b" + // the insurance noun (INSURANCE_MOD adjectives) or a named commercial line
  "(?:" + [                                                              // benign coverage / limit / period tail (repeatable), to end-of-string — NONE of these can begin a co-stated bar noun
    "\\s+(?:coverage|policy|policies|limits?|protection|insurance)",
    "\\s+(?:with|of|at|in|on|for|to|not|no|less|than|least|a|an|the|and|&|its|their|any|all|each|both|either|up)\\b",
    "\\s+per\\s+(?:occurrence|claim|person|accident|year|loss)", "\\s+aggregate", "\\s+combined\\s+single\\s+limit", "\\s+bodily\\s+injury", "\\s+property\\s+damage",
    "\\s*\\$\\s?[\\d,]+(?:\\.\\d+)?", "\\s*(?:per\\s+occurrence|million|mil|m|k|each)\\b", "\\s*/\\s*",
    "\\s+(?:throughout|during|for|over)\\s+(?:the\\s+)?(?:entire\\s+)?(?:performance|contract|project|period|term|life)(?:\\s+(?:period|term|of\\s+the\\s+contract))?",
    "\\s+(?:prior\\s+to|before|upon|at)\\s+(?:commencing|commencement|starting|start\\s+of|contract\\s+start|award|performance|work|notice\\s+to\\s+proceed)",
    "\\s+acceptable\\s+to\\s+the\\s+[A-Za-z]{2,}", "\\s+as\\s+(?:required|specified|set\\s+forth|described|applicable)", "\\s+(?:is\\s+)?(?:required|mandatory)\\b",
    "\\s+(?:at\\s+all\\s+times|hereunder|in\\s+effect|in\\s+force)", // NOTE: 'and bonds/bonding' deliberately NOT a tail token (Gauntlet R4-2) — it could swallow a co-stated bond obligation; bonds are handled by the routine-clause bonding guard.
    "\\s+for\\s+(?:all\\s+)?(?:on-?site\\s+)?(?:personnel|employees?|staff|workers|its\\s+employees|the\\s+work|the\\s+services|the\\s+project|the\\s+duration|liability)",
    "\\s+(?:commencing\\s+)?(?:work|services|performance)", "\\s+minimum", "\\s+combined", "\\s+naming\\s+the\\s+government",
    "\\s*/?\\s*(?:e&o|occ|agg|ea|yr|pp)\\b",                            // common coverage shorthand: (E&O), /occ, /agg, /ea
    "[\\s,;./:()&-]+",                                                  // trailing punctuation / whitespace (incl. parens for "(E&O)")
  ].join("|") + ")*" +
  "\\s*$",
  "i"
);

/** Re-type an INSURANCE do-the-work obligation the proposer over-typed as a non-curable profile bar → bidder_controls
 *  + curable (Phase 3 Unit 1). Pure → gate-tested. STRIP-THEN-RESIDUAL (Gauntlet R1+R2): fires ONLY on a
 *  bidder_cannot_move finding that IS an insurance obligation AND whose insurance-stripped residual carries NO second
 *  obligation / held-or-conferred eligibility status. Ambiguity fails toward keep-the-bar; a novel co-stated bar
 *  escalates by default. Flag-gated; OFF (default) ⇒ byte-identical. */
export function applyPerfObligationInsuranceTyping(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // default-off ⇒ byte-for-byte unchanged
  return findings.map((f) => {
    if (f.controllability !== "bidder_cannot_move") return f;          // (1) only a NON-curable mis-type is a candidate
    if (f.universalDefect || f.verifiedBy || f.requiredAttribute) return f; // (2) verified defect / typed eligibility gate → never demote
    // (2b) CITATION-SLOT guard (Gauntlet R4): the anchor (5) inspects f.requirement only; a bare-noun bar in the
    //      citation slot escapes both the residual vetoes and the anchor. The citation is a structured reference — every
    //      token must be a benign reference/insurance/UCF word; an unrecognized token (a credential/program noun) ⇒ keep.
    const citTokens = (f.citation ?? "").split(/[\s/,;:()&.–—§#-]+/).filter((t) => t.length > 0);
    if (citTokens.some((t) => !CITATION_BENIGN_TOKEN.test(t))) return f;
    const trigger = `${f.citation ?? ""} ${f.requirement ?? ""}`;
    const hay = `${trigger} ${f.excerpt ?? ""}`;
    if (!INSURANCE_DOWORK_RE.test(trigger)) return f;                  // (3) it IS an insurance obligation (trigger only)
    // (4) STRIP the insurance obligation span(s) → the residual is the NON-insurance content. ANY residual obligation /
    //     held-or-conferred status ⇒ keep-the-bar. Fail toward keep; a novel co-stated bar escalates by default.
    const residual = trigger.replace(INSURANCE_STRIP_RE, " ").replace(/\s+/g, " ").trim(); // collapse whitespace ONLY — preserve "8(a)"/"set-aside" punctuation the veto shapes key on
    if (RESIDUAL_OBLIGATION_RE.test(residual)) return f;              // (4a) a surviving second modal-obligation
    const gsR = classifyGateShape(residual);
    if (gsR === "profile_bar" || gsR === "set_aside_caution") return f; // (4b) residual classifies as a bar / set-aside (no insurance-verb contamination)
    if (HELD_CREDENTIAL_SHAPE.test(residual)) return f;              // (4c) positional held-credential shape
    if (CONFERRED_STATUS_SHAPE.test(residual)) return f;            // (4d) third-party-conferred held status (R2 conferral family)
    if (SOCIOECONOMIC_SETASIDE_RE.test(residual)) return f;         // (4e) set-aside shape backstop
    if (STRUCTURAL_BAR_RE.test(hay)) return f;                      // (4f) narrow hard-bar backstop on the full hay (incl. excerpt)
    // (5) TERMINAL POSITIVE GATE (Gauntlet R3 inversion): FIRE only when the WHOLE requirement anchor-matches a single
    //     pure-insurance obligation sentence. A bare-declarative-noun bar co-stated with insurance ("TWIC card required;
    //     … maintain insurance") leaves content OUTSIDE the template → no match → keep. Ambiguity fails toward keep; a
    //     requirement that is not affirmatively insurance-only keeps (a missed pure-insurance phrasing is a safe false-
    //     negative → honest NHR, never a false BID).
    if (!INSURANCE_ONLY_OBLIGATION_RE.test(f.requirement ?? "")) return f;
    return { ...f, controllability: "bidder_controls", curableInWindow: true, perfObligationGuard: true };
  });
}

// ── AWARD-BASIS OVER-TYPE GUARD (Brain card 108) ─────────────────────────────────────────────────────
// Override-slot guard (same layer as caution-floor, BEFORE deriveVerdict; deriveVerdict UNTOUCHED). Two
// deterministic re-types that fix the #1 false-NO_BID class:
//   (a) An AWARD-BASIS / evaluation-methodology / source-selection finding (LPTA, "lowest price technically
//       acceptable", screened-by-price, non-price factor, basis of award) is the award MECHANISM — it is NEVER
//       a universal impossibility. A lens that types it `no_one_can_move` produces a FALSE NO_BID. Re-type to
//       `bidder_controls`. NEVER touches the `temporal_conflict` finding or a REAL delivery/precondition
//       impossibility (FAT/ARO/non-waivable/delivery-window) — the moat's genuine universal bars stand.
//   (b) A SPECIFIC socioeconomic set-aside (8(a)/HUBZone/SDVOSB/WOSB/EDWOSB) under a NULL bidder profile is an
//       UNVERIFIED eligibility gate — surface it as a caution (mark `cautionFloor`), NOT an assumed
//       `already_satisfied`. A broad Total-Small-Business pool is NOT socioeconomic → left untouched (no
//       over-caution). With a known profile (non-null) the existing firmStatus path governs.
// AWARD_BASIS_RE was REMOVED with clause (a) (Brain card 275 RULING 1 — no silent award-basis downgrade).
// DELIVERY_IMPOSSIBILITY_RE remains: it is the structural/impossibility exclusion `isPositiveSetAside` uses to
// refuse to classify a genuine delivery/precondition OR supply/sole-source impossibility as a who-can-win set-aside
// (discontinued / no-acceptable-substitute / single-source / clearance).
const DELIVERY_IMPOSSIBILITY_RE = /first.?article|\bFAT\b|delivery window|\bARO\b|precondition|non-?waivable|cannot complete|deliver within|production delivery|universal delivery|sole.?source|brand.?name|named (?:oem|manufacturer|source)|single (?:source|approved|authorized)|no (?:acceptable )?substitut|no longer (?:manufactured|available|produced|in production)|out of production|discontinu|unobtainable|only (?:one |a single )?(?:source|manufacturer)|\bQPL\b|\bQML\b|proprietary|technical data package|\bTDP\b|data rights|approved source|export.?control|no other (?:source|firm|manufacturer|offeror|vendor) can|exceeds?\b[^.]{0,30}\b(?:production|capacity)|insufficient (?:production )?capacity|(?:security|secret|top[-\s]?secret|personnel|interim|active|dod)\b[^.\n]{0,25}?clearance|\bTS\/SCI\b|\bpolygraph\b/i;
const SOCIOECONOMIC_SETASIDE_RE = /8\(a\)|\bHUBZone\b|\bSDVOSB\b|service.?disabled.?veteran|\bWOSB\b|\bEDWOSB\b|women.?owned|economically disadvantaged/i;

/** Re-type the #1 false-NO_BID class (Brain card 108). Pure → gate-tested. Clause (a) (award-basis no_one_can_move
 *  → bidder_controls) was REMOVED per Brain card 275 RULING 1 — no silent downgrade; the finding flows to Fork-2 →
 *  NEEDS_HUMAN_REVIEW. The set-aside clauses remain: a socioeconomic set-aside under a NULL/open-world profile →
 *  curable cautionFloor, and a mis-typed no_one_can_move set-aside → NHR (default) — never a false INELIGIBLE. */
// ── OR-EQUAL CARVE-OUT (Brain card 139 — Step 6) ──────────────────────────────────────────────────────────
// A "brand name OR EQUAL" line is PERMISSIVE — the bidder furnishes an approved equal meeting the salient
// characteristics → bidder_controls, NEVER a structural bar. But it matches the structural patterns
// (DELIVERY_IMPOSSIBILITY_RE / STRUCTURAL_BAR_RE_114 / NON_SELF_CLEARABLE_BAR_RE) via the bare "brand name"
// token, so a lens that typed it a bar would survive every downstream structural gate → a false NO_BID/INELIGIBLE.
// This carve-out runs FIRST (ahead of those gates) and re-types such a bar to bidder_controls + cautionFloor.
// NEGATION-AWARE: a restrictive qualifier co-stated on the finding (only / no substitution / sole source / no
// equal) VETOES the carve-out — those stay structural bars (restrictive wins; conservative, never clears a real
// bar). Re-types controllability only; invents no findings; never touches a non-brand-name bar (QPL/QML/clearance,
// which don't match OREQUAL_RE). Flag-gated; default OFF (Rule 61) ⇒ findings unchanged byte-for-byte.
// The VETO — any token here means the line is NOT a permissive or-equal carve-out and STAYS a bar. It must model
// the structural-bar vocabulary the carve-out runs ahead of (proprietary/QPL/TDP/clearance/sole-source/single-
// authorized/discontinued/named-OEM), trailing-AND-leading prohibitive negation of or-equal/substitution
// ("or equal not permitted", "substitutions prohibited", "no exceptions", "will not be accepted"), AND the literal
// no-substitution/brand-only tokens — EXCLUDING the bare "brand name" token (which is permissive in or-equal
// context). Conservative by construction: when in doubt it keeps the bar (never a false BID). Adversarial-hardened.
const OREQUAL_RESTRICTIVE_RE = /\bno\s+(?:acceptable\s+)?substitut|\bsole[-\s]?source\b|brand[-\s]?name\s+only\b|\bno\s+(?:or.?)?equals?\b|\bno\s+equivalent|\bonly\b[^.\n]{0,25}\b(?:brand|named|manufacturer|oem|source|product|model|part)|\b(?:brand|named|manufacturer|oem|source|product|model)\b[^.\n]{0,25}\bonly\b|\bor[-\s]equal\b[^.\n]{0,30}\b(?:not\s+(?:permitted|allowed|authorized|accepted|acceptable|considered)|prohibit|will\s+not)|\bsubstitut\w*[^.\n]{0,20}\b(?:prohibit|not\s+(?:permitted|allowed|accepted|acceptable|authorized))|\b(?:prohibited|not\s+permitted|not\s+authorized|not\s+acceptable|will\s+not\s+be\s+(?:accepted|considered))\b|\bno\s+exceptions?\b|\bno\s+deviation|\b(?:mandatory|designated|required|directed)\s+source\b|non[-\s]?competit|directed\s+award|\bproprietary\b|\bQPL\b|\bQML\b|qualified\s+(?:products?|manufacturers?)\s+list|technical\s+data\s+package|\bTDP\b|security\s+clearance|facility\s+(?:clearance|security|certification)|\bunobtainable\b|single\s+(?:source|authorized|approved)|exclusive\s+(?:license|distributor|dealer)|approved\s+(?:source|manufactur)|named\s+(?:oem|manufacturer|source|dealer)|no\s+longer\s+(?:manufactured|available|produced|in\s+production)|out\s+of\s+production|discontinu/i;
export function applyOrEqualCarveout(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged
  return findings.map((f): TypedFinding => {
    if (f.controllability !== "bidder_cannot_move" && f.controllability !== "no_one_can_move") return f; // only bars
    const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`; // read requiredAttribute too (sibling-guard parity)
    if (!OREQUAL_RE.test(hay) || OREQUAL_RESTRICTIVE_RE.test(hay)) return f; // not or-equal, OR a restrictive/structural token present → stays a bar
    return { ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, orEqualCarveout: true,
      requirement: `${f.requirement} — furnish an approved equal meeting the stated salient characteristics; price the equal` };
  });
}

// ── POSITIVE SET-ASIDE DETECTOR (Brain card 226 Fork-3, RATIFIED) ────────────────────────────────────
// A socioeconomic / small-business set-aside is a WHO-CAN-WIN restriction — NEVER a universal impossibility,
// in ANY profile mode. It is classified POSITIVELY, over requirement AND excerpt (P-5: an excerpt-only set-aside
// must not escape detection because the requirement field happens to be silent), and it SUBORDINATES the §K/size
// NOTICE boilerplate: set-aside identity wins over set-aside-adjacent regulatory text ("size standard", "small
// business concern under", "annual receipts", "N employees") that the legacy blanket NON_SELF_CLEARABLE_BAR_RE
// mis-read as a "structural" bar → false INELIGIBLE (P-3). But it must NEVER fire on a finding that ALSO carries a
// GENUINE universal/structural bar — else that real show-stopper is softened/cleared for a cert-holding firm
// (adversarial review, two independent finders). So the detector EXCLUDES, on requirement+excerpt+attribute:
//   (1) GENUINE_STRUCTURAL_BAR_RE — sole-source / brand-name / named-firm / no-substitute / single-source /
//       QPL/QML / TDP / proprietary / non-competitive / directed-award / clearance (test-#6 invariant).
//   (2) DELIVERY_IMPOSSIBILITY_RE — the SAME exclusion clause (a) carries: discontinued / out-of-production /
//       no-other-source-can / export-control / first-article / capacity / sole-source (a production impossibility
//       that merely co-quotes a set-aside token is NOT a who-can-win set-aside).
//   (3) SIZE_DISQUALIFICATION_RE — a genuine size BAR framed as a disqualification ("a concern OTHER THAN small is
//       ineligible", "EXCEEDS the size standard", "affiliation rule"). The benign §K NOTICE tokens that merely
//       describe the pool ("size standard", "small business concern under", "N employees", "annual receipts") are
//       DELIBERATELY absent here so a pure §K notice still reads as a positive set-aside (P-3).
// IDENTITY altitude: an unambiguous socioeconomic PROGRAM (8a/HUBZone/SDVOSB/WOSB/EDWOSB/VOSB/econ-disadvantaged)
// is an identity on its own; the GENERIC small-business / ownership tokens ("small business concern", "total
// small business", "women-owned", "veteran-owned") — which also appear in subcontracting plans, participation
// goals, size reps and SAM boilerplate — count ONLY inside explicit set-aside FRAMING (adversarial-review
// over-match fix). Belt-and-suspenders reads requiredAttribute too.
const SETASIDE_PROGRAM_RE = /8\(a\)|\bHUBZone\b|\bSDVOSB\b|service.?disabled.?veteran|\bWOSB\b|\bEDWOSB\b|\bVOSB\b|economically disadvantaged/i;
const SETASIDE_GENERIC_RE = /small business concern|total small business|small business set.?aside|wom[ae]n.?owned|veteran.?owned/i;
const SETASIDE_FRAMING_RE = /set.?aside|reserved (?:for|exclusively)|restricted to|competition[^.]{0,30}restricted|100\s*(?:%|percent)/i;
const GENUINE_STRUCTURAL_BAR_RE = /sole.?source|brand.?name|named (?:oem|manufacturer|source|dealer|firm|awardee)|single (?:source|approved|authorized|firm|awardee)|non.?competit|directed award|(?:other than|without)\s+full and open|full and open competition|justification and approval|\bJ&A\b|\bQPL\b|\bQML\b|qualified (?:products?|manufacturers?) list|approved (?:source|manufactur)|technical data package|\bTDP\b|no substitut|proprietary|(?:security|secret|top[-\s]?secret|personnel|interim|active|dod)\b[^.\n]{0,25}?clearance|\bTS\/SCI\b|\bpolygraph\b|facility (?:clearance|certification|security)/i;
const SIZE_DISQUALIFICATION_RE = /other than small|(?:exceed\w*|\babove\b|\bover\b|in excess of)[^.]{0,25}\bsize\b|affiliation rule/i;
// A SUBCONTRACTING goal / plan / participation target is about the AWARDEE's subcontracts, NOT who can win the
// PRIME — even a socioeconomic PROGRAM token ("5% SDVOSB subcontracting participation goal") is not a prime
// set-aside there (adversarial review). Targets goal/plan/"shall subcontract" language ONLY — NOT the set-aside
// performance rule "limitation on subcontracting" (FAR 52.219-14), so a genuine set-aside naming that rule still fires.
const SUBCONTRACTING_GOAL_RE = /subcontract\w*\s+(?:goal|plan|participation)|(?:participation|subcontracting)\s+goals?|shall\s+subcontract|small business subcontracting/i;
/** Positively classify a WHO-CAN-WIN socioeconomic / small-business set-aside (Brain card 226 Fork-3). Pure.
 *  Fires on a set-aside IDENTITY (a socioeconomic program, or a generic small-business token inside explicit
 *  set-aside framing) present in requirement/excerpt/attribute that is NOT bundled with a genuine structural bar,
 *  a delivery/production impossibility, or a size DISQUALIFICATION, and is NOT a subcontracting goal/plan.
 *  Subordinates the benign §K/size NOTICE boilerplate (P-3); never softens a real universal show-stopper that
 *  merely co-quotes a set-aside token, and never mis-reads a subcontracting participation goal as a prime set-aside. */
export function isPositiveSetAside(f: TypedFinding): boolean {
  const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
  const identity = SETASIDE_PROGRAM_RE.test(hay) || (SETASIDE_GENERIC_RE.test(hay) && SETASIDE_FRAMING_RE.test(hay));
  return identity && !GENUINE_STRUCTURAL_BAR_RE.test(hay) && !DELIVERY_IMPOSSIBILITY_RE.test(hay)
    && !SIZE_DISQUALIFICATION_RE.test(hay) && !SUBCONTRACTING_GOAL_RE.test(hay);
}

// ── SAM-vs-DOCUMENT SET-ASIDE CONFLICT DETECTION (Brain #332 — source-of-truth defect) ───────────────────────
// SAM's `typeOfSetAside` code is the system of record for the set-aside PROGRAM; the doc-grounded findings carry the
// incorporated set-aside clause. When they name DIFFERENT programs the engine must NOT silently adopt one (that
// inverts eligibility → zero-contract-loss both ways) — it surfaces the conflict → NHR. Pure; conservative (fires
// only when BOTH the SAM code AND a doc set-aside are confidently identified AND they genuinely differ). Flag-gated
// at the orchestrator; the helper itself is pure + always safe to call (returns undefined when no basis to conflict).
// SAM typeOfSetAside code → canonical program (mirrors canonicalizeEligibilityAttr's se: space; sb:total for Total-SB).
const SAM_SETASIDE_CANON: ReadonlyArray<{ re: RegExp; canon: string }> = [
  { re: /^8AN?$/i, canon: "se:8a" },
  { re: /^HZ[CS]$/i, canon: "se:hubzone" },
  { re: /^SDVOSB[CS]?$/i, canon: "se:sdvosb" },
  { re: /^EDWOSB(SS)?$/i, canon: "se:edwosb" },
  { re: /^WOSB(SS)?$/i, canon: "se:wosb" },
  { re: /^(VSA|VSS|VOSB)$/i, canon: "se:vosb" },
  { re: /^(SBA|SBP)$/i, canon: "sb:total" },
  // NOTE: Indian Economic Enterprise (ISBEE/IEE/BI) and Local-Area (LAS) SAM codes are intentionally NOT mapped —
  // there is no doc-side 52.219 producer for them, so a mapping could only ever fire ONE-sided (pre-live review #334);
  // an unmapped SAM code → canonicalizeSamSetAside null → no conflict (conservative, no false NHR). Add only with a
  // matching doc-side notice detector.
];
export function canonicalizeSamSetAside(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  for (const c of SAM_SETASIDE_CANON) if (c.re.test(s)) return c.canon;
  return null; // unknown/unmapped code → no basis to conflict (conservative, never a false conflict)
}
// Human-readable label for a canonical program (for the CO-clarification message).
const SETASIDE_LABEL: Record<string, string> = {
  "se:8a": "8(a)", "se:hubzone": "HUBZone", "se:sdvosb": "SDVOSB", "se:edwosb": "EDWOSB",
  "se:wosb": "WOSB", "se:vosb": "VOSB", "sb:total": "Total Small Business", "se:indian": "Indian Economic Enterprise (Buy Indian)",
};
const setAsideLabel = (canon: string): string => SETASIDE_LABEL[canon] ?? canon;
// A set-aside CITATION (52.219-x family) → canonical program. -6/-7 = Total-SB; -3/-4 = HUBZone; -27 = SDVOSB;
// -29 = EDWOSB; -30 = WOSB; -18 = 8(a) award. NOT a base-solicitation pool program → ignored: -14 = Limitations on
// Subcontracting, -8/-9 = subcontracting utilization/plan, -13 = Notice of Set-Aside of ORDERS (order-level under an
// MAC — out of scope here; the base solicitation's set-aside governs the audit, not a future order's).
function citationSetAsideCanon(hay: string): string | null {
  if (/52\.219-30\b/.test(hay)) return "se:wosb";
  if (/52\.219-29\b/.test(hay)) return "se:edwosb";
  if (/52\.219-27\b/.test(hay)) return "se:sdvosb";
  if (/52\.219-18\b/.test(hay)) return "se:8a";
  if (/52\.219-[34]\b/.test(hay)) return "se:hubzone";
  if (/52\.219-[67]\b/.test(hay)) return "sb:total";
  return null;
}

// ── SET-ASIDE NOTICE DETECTOR (Brain #334, Direction C part A) ────────────────────────────────────────────────
// The governing set-aside NOTICE clause(s) in a solicitation's clause matrix were systematically NOT surfaced as
// findings (FA1068: every lens missed 52.219-3 HUBZone + 52.219-6 Total-SB → the verdict never considered the
// set-aside eligibility basis AND detectSetAsideConflict was STARVED). This deterministic clause-matrix scan emits
// one grounded eligibility finding per set-aside NOTICE marked applicable, and gives detectSetAsideConflict a
// raw-source doc-side program set (part B) that does not depend on the lenses. NOT LLM judgment.
//
// Only clauses that DEFINE THE ELIGIBLE POOL (mutually exclusive) count as a set-aside notice. Deliberately EXCLUDES
// 52.219-4 (HUBZone PRICE-EVALUATION PREFERENCE — rides on top of ANY competition, not a pool definer) and
// 52.219-8/-14/-33 (subcontracting utilization / limitations / nonmanufacturer — obligations, not pool definers).
// (Contrast citationSetAsideCanon above, which maps -3 AND -4 → hubzone for finding-text matching; here -4 is out.)
const SETASIDE_NOTICE_SPECS: ReadonlyArray<{ num: RegExp; canon: string; clause: string }> = [
  { num: /52\.219-3\b/,    canon: "se:hubzone", clause: "FAR 52.219-3 (Notice of HUBZone Set-Aside or Sole-Source Award)" },
  { num: /52\.219-27\b/,   canon: "se:sdvosb",  clause: "FAR 52.219-27 (Notice of SDVOSB Set-Aside)" },
  { num: /52\.219-29\b/,   canon: "se:edwosb",  clause: "FAR 52.219-29 (Notice of EDWOSB Set-Aside)" },
  { num: /52\.219-30\b/,   canon: "se:wosb",    clause: "FAR 52.219-30 (Notice of WOSB Set-Aside)" },
  { num: /52\.219-18\b/,   canon: "se:8a",      clause: "FAR 52.219-18 (Notice of 8(a) Set-Aside/Award)" },
  { num: /52\.219-[67]\b/, canon: "sb:total",   clause: "FAR 52.219-6/-7 (Notice of Total/Partial Small Business Set-Aside)" },
];
// A FAR/DFARS clause NUMBER token (52.xxx-N / 252.xxx-N). Every clause-matrix row begins with one, so it is the
// reliable, format-independent row boundary — NOT the "RFO/Clause/Provision" anchor WORDS (pre-live review #334:
// those words also appear MID-row as a designation column or a "(see FAR 19.502)" prescription, truncating the row
// before its Yes/No cell; and flattened PDF extraction drops them entirely, letting the window bleed into a later
// clause's cell). `19.502` (a FAR PART, no -N suffix) is deliberately NOT matched, so a mid-row part reference never
// splits a row. Global-flag instances are created per call site.
const CLAUSE_NUMBER_RE = /\b\d{2,3}\.\d{2,4}-\d+\b/;
// The clause-matrix ROW for the clause at `at`, plus the clause number's offset WITHIN that row. Bounded between the
// PREVIOUS and NEXT clause numbers around `at` on its physical line — so it reads only this clause's neighbourhood
// (a leading applicability column is kept, adjacent rows' cells excluded, a mid-row "(see FAR 19.x)" never truncates).
// The search is a bounded window AROUND `at` (not a whole flattened line), so a clause far into a newline-free blob is
// still read correctly (pre-live review #334 fix: the old `lineStart+400` cap dropped clauses past char 400).
function setAsideRowWindow(src: string, at: number): string {
  // WRAPPED-ROW SUPPORT (flag AUDIT_SETASIDE_WRAPPED_ROWS, default OFF — Gauntlet 2026-07-08). Real SAM matrices
  // WRAP one logical row across several PHYSICAL lines (clause# / wrapped title / date / "Yes" each on its own
  // line — FA1068 marks 52.219-3/-4/-6 all "Yes" this way, but the physical-line window below reads only the
  // clause#+partial-title line and MISSES the "Yes" cell → set-asides under-read → wrong conflict pole). When ON,
  // the window spans newlines up to a char cap; the prev/next clause-number bounds (not the physical line) are what
  // prevent bleed into an adjacent row's cell. Flag OFF ⇒ the exact physical-line window as before (byte-identical).
  const spanWrapped = process.env.AUDIT_SETASIDE_WRAPPED_ROWS === "true";
  const lineStart = src.lastIndexOf("\n", at) + 1;
  let lineEnd = src.indexOf("\n", at);
  if (lineEnd < 0) lineEnd = src.length;
  const backLimit = spanWrapped ? Math.max(0, at - 300) : Math.max(lineStart, at - 200);
  const fwdLimit = spanWrapped ? Math.min(src.length, at + 400) : Math.min(lineEnd, at + 300);
  const seg = src.slice(backLimit, fwdLimit);
  const rel = at - backLimit;                                            // THIS clause number's offset within seg
  // row END = the next clause number after this one within seg. Blank THIS number first so it isn't re-found.
  const numLen = seg.slice(rel).match(/^\d{2,3}\.\d{2,4}-\d+[A-Za-z]?/)?.[0].length ?? 8;
  const afterCur = seg.slice(0, rel) + " ".repeat(numLen) + seg.slice(rel + numLen);
  const nextRel = afterCur.slice(rel).search(new RegExp(CLAUSE_NUMBER_RE.source));
  const end = nextRel >= 0 ? rel + nextRel : seg.length;
  // row START = just after the PREVIOUS clause number within seg (drops the prior row's cell), else seg start.
  const prev = [...seg.slice(0, rel).matchAll(new RegExp(CLAUSE_NUMBER_RE.source, "g"))].pop();
  const start = prev ? prev.index + prev[0].length : 0;
  return seg.slice(start, Math.max(start, end));
}
// Applicable ⇔ the LAST applicability marker in the row is a POSITIVE one. "Last" (not "nearest") is chosen for
// SAFETY: the dominant matrix layout is a TRAILING applicability column, where the last marker is this clause's own
// cell; "nearest" would grab a preceding clause's trailing cell → a FALSE positive (the dangerous direction). Cost:
// a LEADING-column matrix PACKED multiple-clauses-per-line (rare) reads as not-applicable → a conservative MISS, never
// a false conflict (newline-separated leading columns still work — one marker per row). Recognizes only UNAMBIGUOUS
// markers: positive Yes / standalone X (incl. col-0) / checkmark ✓✔☑; negative No / N/A / "Not Applicable". NOT the
// words "Applicable"/"Applies"/"Incorporated" — prose-common ("as applicable"), they would MANUFACTURE conflicts.
function setAsideRowApplicable(row: string): boolean {
  const marks = row.match(/\bNot\s+Applicable\b|\b(?:Yes|No|N\/A)\b|[✓✔☑]|(?:(?<=\s)|^)X(?=\s|$)/gi);
  if (!marks || !marks.length) return false;
  return /^(?:yes|x|[✓✔☑])$/i.test(marks[marks.length - 1].trim());
}
export interface SetAsideNoticeHit { canon: string; clause: string; excerpt: string; }
/** Deterministic scan of the raw source clause matrix for set-aside NOTICE clauses marked applicable. Pure.
 *  Dedups by canonical program (one hit each). Returns [] when none is marked applicable (conservative). */
export function detectSetAsideNotices(source: string | null | undefined): SetAsideNoticeHit[] {
  const src = source ?? "";
  if (!src) return [];
  const out = new Map<string, SetAsideNoticeHit>();
  for (const spec of SETASIDE_NOTICE_SPECS) {
    const re = new RegExp(spec.num.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const row = setAsideRowWindow(src, m.index);
      if (!setAsideRowApplicable(row)) continue;
      // Excerpt = the grounded set-aside IDENTITY only. 52.219-3's official title is "Notice of HUBZone Set-Aside
      // OR SOLE-SOURCE AWARD" — the verbatim "Sole-Source" tail would trip the structural-bar guard (isPositiveSetAside)
      // and mis-route the finding. End the span at the first "Set-Aside" token (still a verbatim source substring); for
      // a notice with no "Set-Aside" token (e.g. -18 "Notice of 8(a) Award"), drop any sole-source tail as a fallback.
      const saMatch = row.match(/^[\s\S]*?set[\s-]?aside/i);
      const excerpt = (saMatch ? saMatch[0] : row.split(/\bsole[\s-]?source/i)[0]).replace(/\s+$/, "").trim().slice(0, 240);
      if (!out.has(spec.canon)) out.set(spec.canon, { canon: spec.canon, clause: spec.clause, excerpt });
      break; // one applicable row per program is enough
    }
  }
  return [...out.values()];
}
// Plain-language requirement + the profile-matched required attribute per program (so the finding routes through the
// SAME positive-set-aside eligibility machinery every set-aside finding uses — isPositiveSetAside + the award-basis
// overtype guard soften it to a curable caution under a null/open-world profile; firmStatus governs a closed-world one).
const SETASIDE_NOTICE_REQ: Record<string, string> = {
  "se:hubzone": "HUBZone Set-Aside: this acquisition is set aside for SBA-certified HUBZone small business concerns; only certified HUBZone firms are eligible for award.",
  "sb:total":   "Total Small Business Set-Aside: this acquisition is set aside for small business concerns; only firms small under the assigned NAICS size standard are eligible for award.",
  "se:sdvosb":  "SDVOSB Set-Aside: this acquisition is set aside for Service-Disabled Veteran-Owned Small Business concerns; only SBA-verified SDVOSBs are eligible for award.",
  "se:edwosb":  "EDWOSB Set-Aside: this acquisition is set aside for Economically Disadvantaged Women-Owned Small Business concerns; only certified EDWOSBs are eligible for award.",
  "se:wosb":    "WOSB Set-Aside: this acquisition is set aside for Women-Owned Small Business concerns; only certified WOSBs are eligible for award.",
  "se:8a":      "8(a) Set-Aside/Award: this acquisition is offered under the SBA 8(a) Business Development program; only 8(a)-certified concerns are eligible for award.",
};
// requiredAttribute uses the CANONICAL program token (matches what a closed-world profile stores in `held`) so
// deriveVerdict's firmStatus reconciles a holder → satisfies → BID (pre-live review #334 / Brain #338). The human-
// readable program name lives in `requirement` (SETASIDE_NOTICE_REQ) for display.
const SETASIDE_NOTICE_ATTR: Record<string, string> = {
  "se:hubzone": "se:hubzone", "sb:total": "sb:total",
  "se:sdvosb": "se:sdvosb", "se:edwosb": "se:edwosb", "se:wosb": "se:wosb", "se:8a": "se:8a",
};
/** Emit one grounded positive-set-aside eligibility finding per set-aside notice marked applicable (Brain #334-A).
 *  Pure. Grounds the verdict basis and the report; the finding rides the existing positive-set-aside path. */
export function emitSetAsideNoticeFindings(source: string | null | undefined): TypedFinding[] {
  return detectSetAsideNotices(source).map((n) => ({
    requirement: SETASIDE_NOTICE_REQ[n.canon] ?? `Set-aside applies (${setAsideLabel(n.canon)}).`,
    citation: n.clause,
    excerpt: n.excerpt,
    kind: "eligibility_bar" as RequirementKind,
    controllability: "bidder_cannot_move" as Controllability,
    requiredAttribute: SETASIDE_NOTICE_ATTR[n.canon] ?? setAsideLabel(n.canon),
    curableInWindow: false,
    grounded: true,
    lens: "setaside_notice_detector",
  }));
}
/** The canonical set-aside PROGRAM a finding names, for the set-aside backstop's program-keyed suppression
 *  (GAUNTLET R1 BRK-5). Three sources, widest-safe last: the positive-set-aside classifier; the variant→canonical
 *  attribute map; then an identity passthrough for an attribute that is ALREADY canonical (`se:*` / `sb:*`), which
 *  the map itself returns null for. Used ONLY to SUPPRESS a backstop hit — never to create a pool — so resolving a
 *  program too eagerly can only forgo a caution, never manufacture an eligibility claim. Pure. */
export function setAsideBackstopFindingProgram(f: TypedFinding): string | null {
  const byClassifier = findingSetAsideCanon(f);
  if (byClassifier) return byClassifier;
  const attr = (f.requiredAttribute ?? "").trim();
  if (!attr) return null;
  return canonicalizeEligibilityAttr(attr) ?? (/^(?:se|sb):/i.test(attr) ? attr.toLowerCase() : null);
}

/** PANEL RULING 3's set-aside UNION for the move-4 set-aside backstop: clause-matrix notices ∪ the SAM `setAside`
 *  metadata program. GAUNTLET R1 BRK-10 — `emitSetAsideNoticeFindings` requires an APPLICABLE matrix row, so an
 *  SF1449 package carrying no matrix (common) surfaced NO notice at all; SAM's own recorded program is then the
 *  only evidence the pool exists, and without it the backstop cannot raise the caveat it exists to raise.
 *  Pure. The SAM program is appended only when the document notices did not already carry it. */
export function setAsideBackstopNotices(
  source: string | null | undefined,
  samSetAside: string | null | undefined,
): Array<{ excerpt: string; requirement: string; requiredAttribute?: string }> {
  const notices = emitSetAsideNoticeFindings(source).map((n) => ({
    excerpt: n.excerpt, requirement: n.requirement, requiredAttribute: n.requiredAttribute,
  }));
  const samCanon = canonicalizeSamSetAside(samSetAside);
  if (!samCanon) return notices;
  const attr = SETASIDE_NOTICE_ATTR[samCanon] ?? samCanon;
  if (notices.some((n) => n.requiredAttribute === attr)) return notices;
  return [...notices, {
    // No document excerpt exists in this path by construction — SAM metadata IS the evidence. `requirement` is the
    // anchor deriveSetAsideBackstop falls back to, and it names the source of the claim rather than quoting the doc.
    excerpt: "",
    requirement: `SAM records this solicitation as ${setAsideLabel(samCanon)}.`,
    requiredAttribute: attr,
  }];
}

/** Add set-aside-notice findings that no existing finding already covers (dedup by canonical program), so a lens
 *  that DID surface the set-aside is not duplicated. Pure; returns the input array unchanged when nothing is added. */
export function mergeSetAsideNoticeFindings(findings: TypedFinding[], notices: TypedFinding[]): TypedFinding[] {
  const have = new Set<string>();
  for (const f of findings) { const c = findingSetAsideCanon(f); if (c) have.add(c); }
  const add = notices.filter((n) => {
    const c = canonicalizeEligibilityAttr(n.requiredAttribute ?? "") ?? citationSetAsideNoticeCanon(n.citation);
    return c ? !have.has(c) : true;
  });
  return add.length ? [...findings, ...add] : findings;
}
// Pool-definer citation canon for the CONFLICT UNION — like citationSetAsideCanon but EXCLUDES 52.219-4 (HUBZone
// PRICE-EVALUATION preference: rides on any competition, not a pool definer — pre-live review #334). So a lens-
// surfaced -4 finding no longer injects a phantom HUBZone pool alongside a genuine Total-SB set-aside.
function citationSetAsideNoticeCanon(hay: string): string | null {
  if (/52\.219-30\b/.test(hay)) return "se:wosb";
  if (/52\.219-29\b/.test(hay)) return "se:edwosb";
  if (/52\.219-27\b/.test(hay)) return "se:sdvosb";
  if (/52\.219-18\b/.test(hay)) return "se:8a";
  if (/52\.219-3\b/.test(hay)) return "se:hubzone";       // -3 only, NOT -4
  if (/52\.219-[67]\b/.test(hay)) return "sb:total";
  return null;
}
// The doc-side pool-definer program a FINDING contributes to the set-aside union (conflict detection + merge dedup),
// or null. Applies the SAME pool-definer criterion detectSetAsideNotices uses (pre-live review #334): a price-
// preference-only finding (52.219-4 / "price evaluation preference", no genuine pool-definer notice co-cited)
// contributes NOTHING; and a prose-only Total-SB (no clause number) is canonicalized so a lens-surfaced Total-SB
// still both conflicts and dedups symmetrically.
function findingSetAsideCanon(f: TypedFinding): string | null {
  const hay = `${f.citation ?? ""} ${f.requirement ?? ""} ${f.excerpt ?? ""}`;
  const byCite = citationSetAsideNoticeCanon(hay);
  if (byCite) return byCite;                                     // a genuine pool-definer notice citation
  if (!isPositiveSetAside(f)) return null;
  if (/price[-\s]?evaluation preference|52\.219-4\b/i.test(hay) && !/52\.219-(?:3|6|7|18|27|29|30)\b/.test(hay)) return null; // price-pref only, no pool-definer
  if (f.requiredAttribute) { const a = canonicalizeEligibilityAttr(f.requiredAttribute); if (a) return a; }
  if (/total small business|small business set[\s-]?aside/i.test(hay)) return "sb:total"; // prose-only Total-SB
  return null;
}
// ── SUBSET-AWARE SET-ASIDE CONFLICT (card #534 Brain ruling, flag AUDIT_SETASIDE_SUBSET_AWARE, default OFF) ──────
// Roots the conflict gate in set-THEORY. The socioeconomic programs are all SUBSETS of the small-business pool — a
// WOSB/EDWOSB/SDVOSB/8(a)/HUBZone set-aside IS a small-business set-aside restricted further to that program — so a
// {se:*, sb:total} pairing is NESTED, not competing (the narrower program governs). EDWOSB ⊂ WOSB likewise. A GENUINE
// conflict is two NON-NESTED governing markings (e.g. WOSB vs HUBZone — different, neither contains the other).
const SETASIDE_SUPERSETS: Record<string, ReadonlyArray<string>> = {
  "se:wosb":    ["sb:total"],
  "se:edwosb":  ["sb:total", "se:wosb"],    // EDWOSB ⊂ WOSB ⊂ small business
  "se:vosb":    ["sb:total"],               // VOSB ⊂ small business
  "se:sdvosb":  ["sb:total", "se:vosb"],    // SDVOSB ⊂ VOSB ⊂ small business
  "se:8a":      ["sb:total"],
  "se:hubzone": ["sb:total"],
};
// a is nested within b ⇔ b is a superset/ancestor of a (b broader, a narrower).
const isNestedSetAside = (a: string, b: string): boolean => (SETASIDE_SUPERSETS[a] ?? []).includes(b);
// Reduce a canon set to its maximal-specificity ANTICHAIN: drop any canon that is a SUPERSET of another present canon
// (the narrower program governs). The remainder is pairwise non-nested — size ≥ 2 ⇔ a genuine multi-pool conflict.
function reduceNestedSetAsides(canons: Set<string>): Set<string> {
  const present = [...canons];
  return new Set(present.filter((c) => !present.some((o) => o !== c && isNestedSetAside(o, c))));
}
// Root B — MARKING SOURCE. A set-aside program is a MARKING only from operative text (SF block 10 / masthead / §L
// operative set-aside statement / SAM field) — NEVER a by-reference clause-table entry. A finding whose set-aside
// signal is a clause "incorporated by reference" (with no operative "set aside for …" framing) is boilerplate residue,
// not a governing marking, and must not feed the conflict union (card #534: the FA303026Q0020 52.219-6 by-ref leak).
const SETASIDE_BY_REFERENCE_RE = /incorporated by reference|clauses?\s+incorporated|by reference/i;
const SETASIDE_OPERATIVE_MARKING_RE = /set[\s-]?aside for|reserved (?:for|exclusively)|restricted to|100\s*(?:%|percent)|this (?:acquisition|requirement|solicitation|procurement) is (?:a |being )?set[\s-]?aside|is (?:a )?100/i;
function isByReferenceMarkingOnly(f: TypedFinding): boolean {
  // Gate purely on OPERATIVE-MARKING EVIDENCE (Gauntlet round 2). A marking is operative text — a masthead / SF block 10
  // / §L "set aside FOR …" statement / SAM field — NOT a clause-table entry incorporated by reference. Typed-ness
  // (requiredAttribute) is deliberately NOT the discriminator: the panel bridge (card #528) types set-aside findings,
  // so a TYPED 52.219-6/-3 by-reference boilerplate would wrongly survive and re-open card #534. A genuine governing
  // second pool is stated operatively (it IS the governing set-aside) → its "set aside for" text survives this gate; a
  // bare clause-table citation with the noun-form FAR title ("Notice of Total Small Business Set-Aside … incorporated by
  // reference") carries no operative trigger → drops. A finding with BOTH by-ref AND operative "set aside for" text →
  // operative evidence wins (not dropped). Note: findings from an APPLICABLE matrix row (emitSetAsideNoticeFindings)
  // carry operative "set aside for …" requirement text, so they always survive this gate.
  const hay = `${f.citation ?? ""} ${f.requirement ?? ""} ${f.excerpt ?? ""}`;
  return SETASIDE_BY_REFERENCE_RE.test(hay) && !SETASIDE_OPERATIVE_MARKING_RE.test(hay);
}

/** Detect a set-aside conflict (Brain #332 + #334-B). Pure. Doc-side programs come from the RAW clause matrix
 *  (authoritative, does not depend on the lenses) UNIONED with the findings. Returns a conflict (both programs +
 *  a CO-clarification note) when EITHER (a) TWO OR MORE mutually-exclusive set-aside programs are marked applicable
 *  in the document — a genuine ambiguity the engine must NOT self-resolve, fires INDEPENDENT of SAM (the line-431
 *  short-circuit fix: doc carrying HUBZone ALONGSIDE Total-SB is NOT "agreement"), OR (b) the document names a
 *  SINGLE program DIFFERENT from SAM's. Undefined otherwise (no doc set-aside identified, or a single doc program
 *  that equals SAM / has no SAM to differ from). */
export function detectSetAsideConflict(samSetAside: string | null | undefined, findings: TypedFinding[], source?: string | null): { sam: string; doc: string; note: string } | undefined {
  const samCanon = canonicalizeSamSetAside(samSetAside);
  // Doc-detected set-aside programs — UNION of two sources (Brain #334-B):
  //   (1) the RAW clause matrix (detectSetAsideNotices) — authoritative, complete, independent of the lenses; and
  //   (2) the findings (a genuine positive set-aside's canonical requiredAttribute OR its 52.219 citation) — a
  //       belt-and-suspenders catch for a prose-only set-aside a lens surfaced but the matrix scan didn't.
  // The union biases toward SURFACING ambiguity (→ NHR, the zero-contract-loss pole), never toward a silent pick.
  const subsetAware = process.env.AUDIT_SETASIDE_SUBSET_AWARE === "true";
  const docCanons = new Set<string>();
  for (const n of detectSetAsideNotices(source)) docCanons.add(n.canon);
  for (const f of findings) {
    if (subsetAware && isByReferenceMarkingOnly(f)) continue; // root B — by-reference clause-table entry is not a marking
    const c = findingSetAsideCanon(f); if (c) docCanons.add(c);     // pool-definers only (excludes -4 price-pref)
  }
  if (docCanons.size === 0) return undefined;      // doc set-aside not identified → no conflict (conservative)
  // Root A (card #534) — collapse NESTED programs (WOSB/EDWOSB/… ⊂ small business; EDWOSB ⊂ WOSB) so a {se:*, sb:total}
  // pairing is a refinement, not a competition. Flag OFF ⇒ effectiveDoc === docCanons ⇒ byte-identical.
  const effectiveDoc = subsetAware ? reduceNestedSetAsides(docCanons) : docCanons;
  // (a) DOC-INTERNAL MULTI-PROGRAM (Brain #334-B) — two or more mutually-exclusive set-aside programs marked
  //     applicable is itself an NHR trigger, INDEPENDENT of SAM. A line item can't be set aside under two pools;
  //     "the doc also carries the SAM program" must NOT read as agreement (the old line-534 short-circuit did).
  //     With subset-awareness the count is over NON-NESTED programs only (a genuine multi-pool ambiguity).
  if (effectiveDoc.size >= 2) {
    const progs = [...effectiveDoc].map(setAsideLabel);
    return {
      sam: samCanon ? setAsideLabel(samCanon) : "(no single program recorded in SAM)",
      doc: progs.join(" / "),
      note: `The solicitation marks MULTIPLE mutually-exclusive set-aside programs applicable (${progs.join(", ")})${samCanon ? `, and SAM records ${setAsideLabel(samCanon)}` : ""}. These define DIFFERENT eligible pools and a line item cannot be set aside under more than one — confirm the governing set-aside (and which CLINs it covers) with the Contracting Officer before bidding.`,
    };
  }
  // (b) SINGLE doc program vs SAM (original Brain #332 root: SAM=HUBZone vs a lone doc Total-SB clause).
  if (!samCanon) return undefined;                 // a single doc program with no SAM to differ from → it's the basis, not a conflict
  if (effectiveDoc.has(samCanon)) return undefined;   // doc program == SAM → agreement, no conflict
  if (subsetAware) {
    // DIRECTION MATTERS. A doc program NESTED WITHIN SAM (doc is the NARROWER refinement — e.g. SAM=Total-SB vs
    // doc=WOSB) → the doc governs, no conflict. The REVERSE — SAM narrower than a BROADER doc program (e.g. SAM=HUBZone
    // vs doc=Total-SB, the original Brain #332 root) — STAYS a conflict: the doc under-restricts vs the system of record.
    const [d] = [...effectiveDoc];
    if (isNestedSetAside(d, samCanon)) return undefined;
  }
  const doc = [...effectiveDoc].map(setAsideLabel).join(" / ");
  return { sam: setAsideLabel(samCanon), doc, note: "Confirm the governing set-aside with the Contracting Officer before bidding — the eligible pool differs between SAM and the solicitation document." };
}

// ── #2 SET-ASIDE STRUCTURAL-IMPOSSIBILITY DOWNGRADE (Brain #344, co-required with #1) ──────────────────────────
// A clause matrix that marks BOTH 52.219-3 (HUBZone SET-ASIDE — restricts competition to HUBZone firms) AND
// 52.219-4 (HUBZone PRICE-EVALUATION PREFERENCE — applies in FULL & OPEN competition) applicable is STRUCTURALLY
// IMPOSSIBLE as a live procurement: a set-aside and a full-and-open price preference cannot both govern one
// requirement. Their co-presence PROVES the matrix was not scrubbed for this buy, so a STRAY pool-definer notice
// alongside the governing program is copy-paste residue, not a genuine second program. This structural tell is the
// ONLY thing that licenses collapsing a multi-program conflict to the governing program — SAM/synopsis agreement
// ALONE never does (a genuine tiered / multi-CLIN set-aside is indistinguishable without the tell → stays NHR).
// NOTE: 52.219-4 is deliberately EXCLUDED from the pool-definer set (detectSetAsideNotices), so it never inflates
// docCanons — it is read here purely as the un-scrubbed-matrix signature.
const STRUCTURAL_IMPOSSIBILITY_PAIRS: ReadonlyArray<{ a: RegExp; b: RegExp; note: string }> = [
  {
    a: /52\.219-3\b/,
    b: /52\.219-4\b/,
    note: "FAR 52.219-3 (HUBZone SET-ASIDE) and 52.219-4 (HUBZone PRICE-EVALUATION PREFERENCE) are both marked applicable — a set-aside restricts competition to HUBZone firms while the price preference applies only in full and open competition; they cannot both govern one requirement, which proves the clause matrix was not scrubbed for this buy",
  },
];

export interface StructuralImpossibility { present: boolean; evidence: string | null; }
/** Detect the un-scrubbed-matrix structural tell — a mutually-exclusive clause pair BOTH marked applicable in the
 *  raw clause matrix (grounded via the SAME row-applicability logic detectSetAsideNotices uses). Pure. */
export function detectSetAsideStructuralImpossibility(source: string | null | undefined): StructuralImpossibility {
  const src = source ?? "";
  if (!src) return { present: false, evidence: null };
  const applicableRow = (re: RegExp): string | null => {
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(src))) {
      const row = setAsideRowWindow(src, m.index);
      if (setAsideRowApplicable(row)) return row.replace(/\s+/g, " ").trim().slice(0, 200);
    }
    return null;
  };
  for (const pair of STRUCTURAL_IMPOSSIBILITY_PAIRS) {
    const ea = applicableRow(pair.a);
    const eb = applicableRow(pair.b);
    if (ea && eb) return { present: true, evidence: `${pair.note} [row A: ${ea} · row B: ${eb}]` };
  }
  return { present: false, evidence: null };
}

export interface SetAsideStructuralDowngrade { governing: string; strays: string[]; note: string; evidence: string; }
/** #2 — decide whether a multi-program set-aside conflict is a DOC-INTEGRITY artifact that collapses to the governing
 *  program. Applies ONLY when ALL THREE hold: (a) SAM records a single program (samCanon); (b) the doc DECLARES that
 *  program (samCanon ∈ docCanons — SAM/synopsis and the doc AGREE on the governing program); (c) the structural-
 *  impossibility tell is present. (a)+(b) alone NEVER downgrade — only (c) licenses it; without (c) a genuine tiered/
 *  multi-CLIN set-aside is indistinguishable → stays a conflict → NHR. Returns the governing + stray program(s), or
 *  null. Pure — does not mutate findings (the orchestrator applies the re-type via applySetAsideStructuralDowngrade). */
export function setAsideStructuralDowngrade(samSetAside: string | null | undefined, findings: TypedFinding[], source?: string | null): SetAsideStructuralDowngrade | null {
  const samCanon = canonicalizeSamSetAside(samSetAside);
  if (!samCanon) return null;                          // (a) no single SAM program → no governing anchor
  const docCanons = new Set<string>();
  for (const n of detectSetAsideNotices(source)) docCanons.add(n.canon);
  for (const f of findings) { const c = findingSetAsideCanon(f); if (c) docCanons.add(c); }
  if (!docCanons.has(samCanon)) return null;           // (b) doc does not declare SAM's program → not agreement, not our case
  if (docCanons.size < 2) return null;                 // no stray to collapse (nothing to downgrade)
  const tell = detectSetAsideStructuralImpossibility(source);
  if (!tell.present) return null;                      // (c) HARD — only the structural tell licenses the downgrade
  const strays = [...docCanons].filter((c) => c !== samCanon);
  // (d) SCOPE THE COLLAPSE (Gauntlet F2). The tell proves the matrix is un-scrubbed, but a SPECIFIC socioeconomic
  //     stray (SDVOSB / 8(a) / WOSB / EDWOSB / VOSB) is almost never template residue — it signals a GENUINE second
  //     eligible pool. Only a GENERIC Total-Small-Business notice (sb:total) is the classic un-scrubbed default that
  //     rides alongside a specific governing program. If ANY stray is a specific socioeconomic program, DO NOT
  //     collapse — keep the conflict → NHR (fail-toward-human-review, never silently mask a real eligibility bar).
  if (strays.some((c) => c !== "sb:total")) return null;
  return {
    governing: samCanon,
    strays,
    note: `Governing set-aside is ${setAsideLabel(samCanon)} (SAM and the solicitation agree). The additionally-marked ${strays.map(setAsideLabel).join(", ")} notice(s) are residue of an un-scrubbed clause matrix — downgraded to a documentary-integrity flag (verify with the Contracting Officer, but not a bid bar).`,
    evidence: tell.evidence ?? "",
  };
}

/** Apply the #2 downgrade: re-type each STRAY program's set-aside finding to a non-blocking P2 documentary-integrity
 *  flag (kind→other, bidder_controls, requiredAttribute dropped) so ONLY the governing program drives eligibility →
 *  committal-<governing> instead of NHR. The stray stays IN the findings (surfaced in the report, never hidden) but
 *  is verdict-inert. Returns the re-typed findings + the downgrade decision (null ⇒ untouched). The caller must ALSO
 *  suppress the conflict signal when `downgrade` is non-null (the raw matrix still carries both clauses). Pure. */
export function applySetAsideStructuralDowngrade(
  findings: TypedFinding[],
  source: string | null | undefined,
  samSetAside: string | null | undefined,
  opts?: { enabled?: boolean },
): { findings: TypedFinding[]; downgrade: SetAsideStructuralDowngrade | null } {
  if (!opts?.enabled) return { findings, downgrade: null };
  const downgrade = setAsideStructuralDowngrade(samSetAside, findings, source);
  if (!downgrade) return { findings, downgrade: null };
  const strays = new Set(downgrade.strays);
  const next = findings.map((f) => {
    const c = findingSetAsideCanon(f);
    if (!c || !strays.has(c)) return f;
    return {
      ...f,
      kind: "other" as RequirementKind,
      controllability: "bidder_controls" as Controllability,
      requiredAttribute: undefined,
      curableInWindow: true,
      severity: "P2" as const,
      requirement: `Documentary-integrity flag: a ${setAsideLabel(c)} set-aside notice appears in an un-scrubbed clause matrix alongside the governing ${setAsideLabel(downgrade.governing)} set-aside — not a separate eligibility pool for this buy. ${downgrade.evidence} Confirm with the Contracting Officer.`,
    };
  });
  return { findings: next, downgrade };
}

export function applyAwardBasisOvertypeGuard(findings: TypedFinding[], profile: BidderProfile | null, opts?: { enabled?: boolean; normalizeNoOneCanMoveSetAside?: boolean; setAsideOvertypeDisposition?: "nhr" | "caution" }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged
  return findings.map((f) => {
    const hay = `${f.requirement} ${f.excerpt ?? ""}`;
    // FORK-3 (Brain card 226): a positively-classified set-aside is a WHO-CAN-WIN restriction, never universal —
    // detect it ONCE (over requirement+excerpt, subordinating §K/size boilerplate) and give it PRECEDENCE over
    // every clause below. It is routed by ELIGIBILITY (firmStatus), in EVERY profile mode, never cleared as a
    // mere award-methodology bar (which would drop the who-can-win dimension → a false clean BID for a proven
    // non-holder) and never left as a `no_one_can_move` universal (→ false NO_BID/INELIGIBLE).
    const positiveSetAside = isPositiveSetAside(f);
    // (a) REMOVED — Brain card 275 RULING 1 (NHR POLE). This clause pre-emptively re-typed a `no_one_can_move`
    // award-basis finding → `bidder_controls` — a SILENT clean BID off an UNVERIFIED heuristic downgrade — and by
    // re-typing BEFORE deriveVerdict it PRE-EMPTED the Fork-2 `unmarkedUniversalClaim → NHR` safety. Ruling: no
    // such silent downgrade. The finding stays `no_one_can_move` and flows to Fork-2 → NEEDS_HUMAN_REVIEW. A
    // caution-floored award-basis downgrade may return ONLY behind a tight GROUNDED award-basis allowlist
    // (four-walls style) — NOT this run. (The set-aside re-type clauses below are a separate FORK-3 doctrine
    // invariant — who-can-win set-asides route by eligibility, never NO_BID — and are unaffected.)
    // (b) An UNVERIFIED specific socioeconomic eligibility (8a/HUBZone/SDVOSB/WOSB) under a NULL profile is a CAUTION
    //     REGARDLESS of how a lens typed it — the lenses disagree (already_satisfied vs bidder_cannot_move/non-curable
    //     on the same setaside object, card 110). Normalize ANY such typing to a curable caution gate so step-5b
    //     (non-curable bar) cannot pre-empt the caution branch. NOT a universal bar (excluded above), NOT a Total-SB pool
    //     (regex), and NOT touched when a real profile is loaded (then firmStatus governs → satisfies/fails as appropriate).
    // OPEN-WORLD (self-asserted capability statement) is treated like NULL here: it is a
    // mostly-unknown profile, so the same socioeconomic over-type normalization applies (a
    // firm WITH a profile must not lose this protection and get a worse verdict than an
    // unknown firm — panel B-3). A held cert still softens the set-aside to a curable caution
    // (conservative for self-asserted data); firmStatus governs only CLOSED-WORLD profiles.
    // Same altitude discipline as (a): the set-aside identity must be in the REQUIREMENT (the
    // lens's characterization), NOT the verbatim excerpt — else an uncontrolled excerpt quoting
    // a set-aside line softens a genuine non-curable STRUCTURAL bar (clearance / sole-source) to
    // an exportable caution (final-greenlight EXPLOIT-3). AND a structural-bar exclusion (the same
    // NON_SELF_CLEARABLE_BAR_RE firmStatus uses) so a clearance/sole-source/size bar is never
    // softened even if it names a set-aside; a PURE set-aside (no structural language) still softens.
    //     GUARD-FIX (card 164/167, AUDIT_SETASIDE_OVERTYPE_GUARD, default-OFF): a lens may MIS-TYPE a pure
    //     socioeconomic set-aside as `no_one_can_move` (a who-can-win bar is never truly universal). Under the
    //     new opt, include `no_one_can_move` in the softened set so it normalizes to a curable caution like the
    //     bidder_cannot_move path — never a false INELIGIBLE under a null/open-world profile (zero-contract-loss).
    //     PER-FINDING: this re-types ONLY the matched set-aside finding; a coexisting genuine universal bar
    //     (sole-source/brand-name — excluded by NON_SELF_CLEARABLE_BAR_RE, never matches SOCIOECONOMIC_SETASIDE_RE)
    //     is untouched and still reaches Step 3. Opt false ⇒ this clause is byte-identical to before.
    // FORK-3 altitude: classify via the POSITIVE detector (requirement+excerpt, §K-boilerplate-subordinating),
    // not the requirement-only SOCIOECONOMIC_SETASIDE_RE + blanket-NON_SELF_CLEARABLE veto. This closes P-5 (an
    // excerpt-only set-aside no longer escapes the softener) and P-3 (§K NOTICE boilerplate quoted in the excerpt
    // no longer disarms the softener → no false INELIGIBLE). A GENUINE structural bar still fails isPositiveSetAside.
    const setAsideSoftenable = (profile === null || !profile.closedWorld) && positiveSetAside;
    // already_satisfied / bidder_cannot_move socioeconomic set-aside → curable caution (unchanged, opt-independent).
    if (setAsideSoftenable && (f.controllability === "already_satisfied" || f.controllability === "bidder_cannot_move"))
      return { ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, awardBasisGuard: true };
    // CARD 177 RULING: a mis-typed `no_one_can_move` socioeconomic set-aside (a who-can-win bar is never truly
    // universal) routes per the CALLER'S disposition — an honest-fail choice, opt-gated (still behind the
    // default-OFF AUDIT_SETASIDE_OVERTYPE_GUARD via `enabled`). NHR is the conservative default for the pole:
    //   "nhr"     → non-curable bidder_cannot_move bar → deriveVerdict step-5b → NEEDS_HUMAN_REVIEW (never a
    //               false INELIGIBLE, never a silent BID) — zero-contract-loss.
    //   "caution" (or legacy normalizeNoOneCanMoveSetAside===true) → curable caution like the bidder_cannot_move path.
    //   neither set → UNTOUCHED (byte-identical to pre-ruling — the finding falls through unchanged).
    // BRAIN CARD 224 FORK 3 — PROMOTED TO AN ALWAYS-RUN DOCTRINE INVARIANT (no longer gated behind the
    // default-OFF AUDIT_SETASIDE_OVERTYPE_GUARD). A who-can-win socioeconomic set-aside is NEVER a universal
    // impossibility, so a mis-typed no_one_can_move set-aside must NEVER reach step-3 as no_one_can_move
    // (→ false INELIGIBLE/NO_BID under a null/open-world profile — THE catastrophic zero-contract-loss error).
    // When the award-basis guard runs (enabled, default-ON), ALWAYS re-type it off no_one_can_move. Default pole
    // = NHR (bidder_cannot_move, non-curable → deriveVerdict step-5b → NEEDS_HUMAN_REVIEW); a caller may elect
    // the softer "caution" disposition. Structural bars are already excluded above (NON_SELF_CLEARABLE_BAR_RE),
    // so this only ever touches a PURE set-aside. (The flag's default-ON flip for the REMAINING guard behavior
    // stays a separate CEO checkpoint — Rule 61; this invariant supersedes what the flag did for this case.)
    if (setAsideSoftenable && f.controllability === "no_one_can_move") {
      if (opts?.setAsideOvertypeDisposition === "caution" || opts?.normalizeNoOneCanMoveSetAside === true)
        return { ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, awardBasisGuard: true };
      return { ...f, controllability: "bidder_cannot_move", curableInWindow: false, awardBasisGuard: true };
    }
    // FORK-3 CLOSED-WORLD (Brain card 226, folds in P-4): the softener above is gated on null/open-world, so under
    // a CLOSED-WORLD profile a mis-typed `no_one_can_move` set-aside would reach deriveVerdict as an unmarked
    // universal claim — a firm that PROVABLY HOLDS the cert lands in unmarkedUniversalClaim → false NHR, and the
    // universal character bypasses firmStatus entirely. Re-type it off no_one_can_move to a profile-dependent
    // eligibility bar so firmStatus GOVERNS in every mode: satisfies → cleared (BID); provably fails → INELIGIBLE
    // (attribute-specific, card-228 Ruling ii) — NEVER NO_BID (default-deny guarantees), never structural. Only a
    // PURE set-aside reaches here (a genuine structural bar fails isPositiveSetAside). Fail-safe: can only REMOVE a
    // universal show-stopper, never add one.
    if (profile !== null && profile.closedWorld && f.controllability === "no_one_can_move" && positiveSetAside)
      return { ...f, controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false, awardBasisGuard: true };
    return f;
  });
}

/** Card 187: the orchestrator's env → opts mapping for the setaside-overtype guard, factored out so the wiring
 *  is unit-testable and cannot drift from the orchestrator gate (which calls this exact helper). Rule 61: flag
 *  AUDIT_SETASIDE_OVERTYPE_GUARD OFF/unset → byte-identical to pre-card-187 ({ enabled, normalizeNoOneCanMoveSetAside:
 *  false }, NO disposition key). Flag === "true" → HARDCODED "nhr" disposition (Brain card 177/187 ruling — a
 *  mis-typed no_one_can_move socioeconomic set-aside → NEEDS_HUMAN_REVIEW); there is no env knob for the disposition
 *  itself. `enabled` continues to honor AUDIT_AWARDBASIS_OVERTYPE_GUARD (default-ON) unchanged. Pure. */
export function setAsideOvertypeGuardOpts(env: Record<string, string | undefined>): { enabled: boolean; normalizeNoOneCanMoveSetAside?: boolean; setAsideOvertypeDisposition?: "nhr" } {
  const enabled = env.AUDIT_AWARDBASIS_OVERTYPE_GUARD !== "false";
  return env.AUDIT_SETASIDE_OVERTYPE_GUARD === "true"
    ? { enabled, setAsideOvertypeDisposition: "nhr" }
    : { enabled, normalizeNoOneCanMoveSetAside: false };
}

// ── SET-ASIDE / SIZE FIRM-STATUS GATE (Brain card 125, doctrine #1) ──
// The Total-Small-Business / size pool the award-basis guard deliberately leaves untouched (it handles only the
// SPECIFIC socioeconomic set-asides). A set-aside/size finding a lens vouched `already_satisfied` ("firm qualifies")
// is a green MET vouch ONLY when the bidder profile PROVES it (firmStatus==='satisfies'); under a null/unverified
// profile it becomes an UNVERIFIED caution gate (the #1 legal-exposure — a false vouch invites a size protest / FCA);
// a closed-world profile that PROVES the firm fails → a real eligibility_bar (→ INELIGIBLE via the single producer,
// Step-2 invariant satisfied). Mirrors the award-basis guard; the orchestrator runs it AFTER that guard so a
// socioeconomic set-aside (already re-typed away from already_satisfied) is never double-processed. Default-OFF.
const SETASIDE_SIZE_RE = /small business set.?aside|total small business|set.?aside for small|small business concern|size standard|small under (?:the )?naics|\bNAICS\b.{0,24}\bsize\b|\b8\(a\)|\bHUBZone\b|\bSDVOSB\b|\bWOSB\b|\bEDWOSB\b/i;
export function applySetAsideFirmStatusGate(findings: TypedFinding[], profile: BidderProfile | null, opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings;  // default-OFF → byte-identical
  return findings.map((f): TypedFinding => {
    // Only a set-aside/size finding a lens vouched already_satisfied. (Socioeconomic set-asides the award-basis
    // guard already re-typed are no longer already_satisfied → skipped here: no double-caution, #1 constraint.)
    if (f.kind !== "eligibility_bar" || f.controllability !== "already_satisfied" || f.cautionFloor === true || !SETASIDE_SIZE_RE.test(f.requirement)) return f;
    const fs = firmStatus(f, profile);
    if (fs === "satisfies") return f;  // profile PROVES the firm qualifies → keep already_satisfied (met)
    if (fs === "fails")                // profile PROVES the firm does NOT → a real eligibility_bar (→ INELIGIBLE)
      return { ...f, controllability: "bidder_cannot_move", curableInWindow: false };
    // unknown (null/unverified profile, or no requiredAttribute) → unverified caution gate, never a green met vouch
    return { ...f, controllability: "bidder_controls", cautionFloor: true,
      requirement: `${f.requirement} — confirm your firm's size/eligibility under the solicitation's NAICS before relying on this` };
  });
}


// ── NONMANUFACTURER RULE GATE (Brain card 132) — RETIRED (Brain card 242 ruling) ─────────────────────
// `applyNonmanufacturerRuleGate` (the SAM-facts cautionFloor emitter) + its helpers (NMR_SB_SETASIDE_CODES /
// NMR_SB_SETASIDE_RE / NMR_SUPPLY_SECTORS / NMR_ADDRESSED_RE / addressesNmr / naicsSector) are DELETED. Per Brain
// card 242 the NMR mechanism is now SINGLE: the deterministic keyfact detector is the SOLE NMR-attribute emitter
// and the who-can-win firm-status gate (applyNmrFirmStatusGate, below) types it. The old soft-caution floor
// disagreed with the who-can-win path on the unknown verdict (caution vs NHR); the two are reconciled by retiring
// the floor. History: git + `_BAR-CHANGE-LOG.md`.

// ── FORK-7 (Brain card 240) — NMR SINGLE ATTRIBUTE EMITTER ───────────────────────────────────────────
export const NMR_ATTRIBUTE = "nonmanufacturer:compliant";
// FORK-7 CANONICAL NMR TOKEN (Brain card 242 Finding-1; hardened per adversarial review) — mirrors
// canonicalizeEligibilityAttr. NMR compliance is a per-bid SUPPLY ARRANGEMENT, not a standing cert, so a
// closed-world profile's mere ABSENCE of the token is NOT proof of ineligibility. Therefore INELIGIBLE fires
// ONLY on a POSITIVE canonical NON-compliance token (a firm affirmatively declaring it will not comply); a
// compliant token → satisfies; EVERYTHING ELSE (empty / unrelated / a genuine manufacturer's "OEM/fabricate"
// phrasing / an unparseable synonym) → null → unknown → NHR — never a false INELIGIBLE (the walk-away class the
// zero-contract-loss doctrine forbids). This is the literal reading of card-242 "INELIGIBLE ONLY on canonical-
// token match". Negation-aware: a "not … compliant" token is treated as NON-compliance, never compliance.
export function canonicalizeNmrAttr(raw: string | null | undefined): "nmr:compliant" | "nmr:noncompliant" | null {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return null;
  if (s === NMR_ATTRIBUTE) return "nmr:compliant";
  // (1) must reference the Non-Manufacturer Rule SPECIFICALLY — never a bare "rule" (which caught unrelated rules,
  //     e.g. "affiliation rule noncompliant" → false INELIGIBLE, adversarial-review Defect A).
  if (!/non-?manufacturer|\bnmr\b/.test(s)) return null;
  // (2) must make a compliance assertion at all.
  if (!/complian(?:t|ce)/.test(s)) return null;
  // (3) NON-compliance iff an explicit non-/not- negates the compliance assertion. The "not" may be gapped from the
  //     assertion by adverbs ("not currently nmr compliant"), bounded to 40 chars so a distant unrelated "not"
  //     ("nmr compliant, will not subcontract") does NOT flip it (adversarial-review Defect B). Bounded = ReDoS-safe.
  // (3a) A MITIGATED / WAIVED / RESOLVED non-compliance is NOT a positive non-compliance STATUS — a granted
  //      waiver may permit award. It is ambiguous → UNKNOWN (→ NHR, human review), never a false INELIGIBLE
  //      (adversarial-review 2026-07-04, Finding C) nor a false clean-BID. Absence-is-not-proof still holds.
  const positiveNoncompliant = /\bnon-?complian/.test(s) || /\bnot\b[\s\S]{0,40}?complian/.test(s);
  if (positiveNoncompliant) {
    if (/\b(?:waiv|mitigat|resolv|correct|cured|remediat|exempt)\w*/.test(s)) return null; // waived/mitigated → NHR, not fails
    return "nmr:noncompliant";
  }
  return "nmr:compliant";
}
/** FORK-7 NMR canonical firm-status (card 242 Finding-1, review-hardened). satisfies ⇔ a canonical compliant
 *  token; fails (→ INELIGIBLE) ⇔ a POSITIVE canonical NON-compliance token; everything else → unknown → NHR
 *  (absence is never proof of NMR ineligibility). Shared by the gate and firmStatus so both resolve identically. */
function nmrFirmStatus(profile: BidderProfile | null): "satisfies" | "fails" | "unknown" {
  if (!profile) return "unknown";
  const attrs = profile.satisfiedAttributes ?? [];
  if (attrs.some((a) => canonicalizeNmrAttr(a) === "nmr:compliant")) return "satisfies";
  if (attrs.some((a) => canonicalizeNmrAttr(a) === "nmr:noncompliant")) return "fails";
  return "unknown";
}
/** SINGLE EMITTER: the deterministic keyfact detector is the SOLE emitter of the NMR eligibility attribute. Any
 *  OTHER finding (a model lens) that carries `nonmanufacturer:compliant` is RETIRED from attribute-emission →
 *  advisory context only (the attribute is stripped; the narrative stays, but is NEVER typed into eligibility).
 *  Pure + ORDER-INDEPENDENT — keyed on `lens`, not position — so the same finding set yields the same result
 *  regardless of orchestrator emitter order (kills P-9). */
export function applyNmrSingleEmitter(findings: TypedFinding[]): TypedFinding[] {
  const carriers = findings.filter((f) => f.requiredAttribute === NMR_ATTRIBUTE);
  if (carriers.length <= 1) return findings; // 0 or 1 emitter → nothing to reconcile (FAIL-CLOSED: a SOLE model-lens
  // NMR is PROMOTED, not dropped — the eligibility signal is never silently lost when the deterministic detector
  // happened to miss an unusually-phrased NMR obligation, per adversarial review). Order-independent.
  // Multiple emitters → keep the attribute on ONE canonical (prefer the deterministic keyfact detector); strip it
  // from the rest → advisory. The single surviving carrier is what the firm-status gate then types.
  const canonical = carriers.find((f) => f.lens === "keyfact_detector") ?? carriers[0];
  return findings.map((f) => (f.requiredAttribute === NMR_ATTRIBUTE && f !== canonical)
    ? { ...f, requiredAttribute: undefined }
    : f);
}
/** TRISTATE MAPPING (Brain card 240 Fork-7, kills P-8): the NMR attribute rides the Fork-3 who-can-win path as a
 *  REQUIRED ATTRIBUTE — never universal, never NO_BID — governed by `firmStatus` in EVERY profile mode:
 *    • proven-compliant (firmStatus "satisfies")   → already_satisfied (MET) — contributes true, NEVER pins the
 *        committal eligibility to null (the P-8 "null forever" bug: a bidder_controls NMR gate was stuck in
 *        unverifiedGates because it could never resolve to satisfies);
 *    • closed-world noncompliant (firmStatus "fails") → a disqualifying eligibility_bar → INELIGIBLE with an
 *        attribute-specific reason (deriveVerdict provenFails path, card-228 Rulings A/ii);
 *    • unknown / null (firmStatus "unknown")        → a non-curable eligibility_bar → NHR when verdict-decisive
 *        (deriveVerdict step-5b nonCurable) — the same fail-safe a Fork-3 set-aside takes under a null profile.
 *  Runs AFTER applyNmrSingleEmitter, so it acts on the SINGLE keyfact-sourced NMR attribute. Pure; order-independent
 *  (per-finding, keyed on the attribute). Default-OFF via the caller. */
export function applyNmrFirmStatusGate(findings: TypedFinding[], profile: BidderProfile | null, opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-identical
  return findings.map((f): TypedFinding => {
    if (f.requiredAttribute !== NMR_ATTRIBUTE) return f;
    const st = nmrFirmStatus(profile); // NMR-canonical status (Finding-1) — NOT the generic firmStatus
    // cautionFloor is CLEARED on re-type: a MET (compliant) NMR must not be floored to a caution by a prior
    // caution-floor pass (that would turn compliant→BID into CAUTION); a bar carries its own disposition.
    if (st === "satisfies") return { ...f, controllability: "already_satisfied", cautionFloor: undefined, nmrGuard: true }; // proven-compliant → MET (never pins null)
    // fails (closed-world canonical-noncompliant) OR unknown (null/open-world/unrecognized synonym) → who-can-win
    // eligibility bar: firmStatus (NMR-canonical, Finding-1) decides — fails → provenFails → INELIGIBLE
    // (attribute-specific); unknown → the FORK-7 NMR-unknown NHR branch (curability text), never a lead-time bar.
    return { ...f, controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false, cautionFloor: undefined, nmrGuard: true };
  });
}

// ── NMR NAICS-DORMANCY GATE (Phase 3 Unit 2 · Brain cards #548/#550, flag AUDIT_NMR_NAICS_DORMANCY default-OFF) ──
// The Nonmanufacturer Rule (FAR 52.219-33 / 13 CFR 121.406) governs SUPPLY acquisitions only. On a solicitation whose
// ASSIGNED NAICS is a services/construction code the NMR is LEGALLY DORMANT — 13 CFR 121.406(b)(3)-(4): it does not
// apply to a services-classified buy (nor to its incidental supply component). The seq-2 false-AUTO-F (dccce793,
// 12318726Q0165, NAICS 561320 Total SB) rendered a ☒-checked 52.219-33 as a P0 show-stopper despite the assigned NAICS
// being services. This gate NEUTRALIZES that NMR AUTO-F contributor (it does NOT by itself clear the seq-2 verdict — a
// separate professional-liability-insurance bar in that record is out of scope, likely its own mis-type). It keys on
// the SAM-resolved NAICS *fact* (opts.naics, Rule 64 — NEVER a source regex, which would recreate the keyfact
// detector's T1-9 circular-signal trap) and DEMOTES a finding that is UNAMBIGUOUSLY the NMR (see isNmrFinding) to a
// verdict-inert P2 applicability flag on a non-supply sector. It runs over the WHOLE rail (after every NMR emitter)
// so it catches the bar regardless of which lens raised it, without false-clearing a distinct bar that merely co-cites it.
//
// APPLICABILITY TABLE — 13 CFR 121.406(b)(3): the NMR applies to procurements assigned a "manufacturing or supply
//   NAICS code, OR the Information Technology Value Added Resellers (ITVAR) exception to NAICS code 541519". Supply
//   NAICS 2-digit sector ∈ {31,32,33 Manufacturing · 42 Wholesale Trade · 44,45 Retail Trade}; PLUS the exact ITVAR
//   code 541519 (a sector-54 SERVICES code where the NMR nonetheless applies by statutory exception — Gauntlet Unit 2
//   R1 P0). Every OTHER sector (services, construction 23, agriculture 11, etc.) → DORMANT. Fail-toward-LIVE on the
//   exception (keep the bar on 541519) and fail-toward-ESCALATION on unknown NAICS (a null/unparseable code is NOT
//   demoted — the bar stands and routes to human review, never a silent clear).
export const NMR_SUPPLY_SECTORS: ReadonlySet<string> = new Set(["31", "32", "33", "42", "44", "45"]);
export const NMR_ITVAR_NAICS = "541519"; // 13 CFR 121.406(b)(3) ITVAR exception — NMR is LIVE here despite sector 54
/** True iff the assigned NAICS is one the NMR governs (13 CFR 121.406(b)(3)): a supply sector, OR the ITVAR 541519
 *  exception. Unknown/malformed ⇒ false (not provably applicable — the caller then leaves the bar rather than demote
 *  on a guess). The ITVAR carve-out is fail-toward-LIVE: on 541519 we keep the bar (never false-clear a live NMR). */
export function isNmrApplicableNaics(naics: string | null | undefined): boolean {
  const digits = (naics ?? "").replace(/\D/g, "");
  if (digits.length < 2) return false;
  if (digits.slice(0, 6) === NMR_ITVAR_NAICS) return true;  // ITVAR exception (R1 P0); slice(0,6) is robust to a trailing/decimal digit (R2 P3) — fail-toward-live
  return NMR_SUPPLY_SECTORS.has(digits.slice(0, 2));
}
// NMR-FINDING IDENTITY — POSITIVE-SHAPE ALLOWLIST (Gauntlet Unit 2 R3; doctrine [[feedback_no_blocklist_shape_allowlist_doctrine]]).
// R1/R2 tried to identify "an NMR finding co-stating a DISTINCT bar" via a BLOCKLIST of foreign-bar vocabulary
// (FOREIGN_BAR_RE) — R3 proved that blocklist leaks (EAR/DCAA/bonding/ISO-9001/CMMC/AS9100/FAA-145/Buy-American all
// absent → 10/10 false-CLEAR leaks), exactly the #507 vocab treadmill Brain permanently forbade. The doctrine-correct
// identity is a POSITIVE shape, not a negative vocabulary: demote ONLY a finding positively recognized as the pure
// keyfact NMR — `requiredAttribute === NMR_ATTRIBUTE` AND `requirement === NMR_CAUTION` (the exact fixed text the sole
// NMR-attribute emitter, audit-keyfact-detector, produces; applyNmrSingleEmitter guarantees a single such carrier).
// A finding of that exact shape is PURE NMR by construction — nothing else to erase — so demotion is safe. EVERY other
// finding (bundled citation, fused requirement, foreign attribute, bare prose, a distinct bar merely quoting 52.219-33
// in its grounding excerpt) FAILS TOWARD ESCALATION — left intact, never false-cleared. No bar vocabulary is enumerated.
const isNmrFinding = (f: TypedFinding): boolean =>
  f.requiredAttribute === NMR_ATTRIBUTE && f.requirement === NMR_CAUTION;

/** Demote NMR-family findings to a verdict-inert P2 applicability flag when the solicitation's assigned NAICS is a
 *  non-supply (services/construction) sector, per 13 CFR 121.406(b)(3)-(4). Mirrors the structural-downgrade re-type
 *  (kind "other" · bidder_controls · P2 · requiredAttribute + cautionFloor cleared) so nothing downstream types it as
 *  an active eligibility bar. Keys on the NAICS FACT only — a null/unknown NAICS demotes NOTHING (fail-toward-
 *  escalation). MIXED-SOLICITATION boundary (Brain build-note b): a services-classified buy with incidental supply
 *  CLINs is STILL governed by its ASSIGNED NAICS — the gate demotes (dormant), because SBA size/NMR applicability
 *  follows the assigned code, not embedded CLIN language. Default-OFF via caller; a supply-sector NAICS ⇒ byte-
 *  identical. Pure; order-independent. */
export function applyNmrNaicsDormancy(
  findings: TypedFinding[],
  naics: string | null | undefined,
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                 // Rule 61 default-off ⇒ byte-identical
  const digits = (naics ?? "").replace(/\D/g, "");
  // A real NAICS is EXACTLY 6 digits. Anything else (null, truncated, padded, decimal-suffixed, leading-zero — R2 P3)
  // is malformed ⇒ we cannot confidently classify the sector ⇒ leave the bar (fail-toward-escalation, never a false
  // clear). This is stricter than the SAM path needs (opts.naics = solicitation.naicsCode is a clean 6-digit code)
  // but closes the whole malformed-NAICS family deterministically.
  if (digits.length !== 6) return findings;
  if (isNmrApplicableNaics(digits)) return findings;   // supply sector or ITVAR 541519 ⇒ NMR is live ⇒ untouched
  const sector = digits.slice(0, 2);
  let touched = false;
  const next = findings.map((f): TypedFinding => {
    if (!isNmrFinding(f)) return f;
    touched = true;
    return {
      ...f,
      kind: "other" as RequirementKind,
      controllability: "bidder_controls" as Controllability,
      requiredAttribute: undefined,
      curableInWindow: true,
      cautionFloor: undefined,
      severity: "P2" as const,
      nmrGuard: true,
      requirement: `Applicability flag: the Nonmanufacturer Rule (FAR 52.219-33) is legally DORMANT on this acquisition — the assigned NAICS ${digits} (sector ${sector}) is not a supply/manufacturing/wholesale/retail code, so 13 CFR 121.406(b)(3)-(4) makes the NMR inapplicable (it governs supply buys only). Present in the clause matrix but not an eligibility bar for this buy; confirm scope with the Contracting Officer.`,
    };
  });
  if (touched) console.log(`[decide] NMR NAICS-dormancy: assigned NAICS ${digits} (sector ${sector}) non-supply → 52.219-33 demoted to P2 applicability flag (13 CFR 121.406(b)(3)-(4))`);
  return touched ? next : findings;
}

// ── CHECKBOX-STATE FIDELITY GATE (Phase 3 Unit 3 · Brain card #551 design C, flag AUDIT_CHECKBOX_STATE_FIDELITY default-OFF) ──
// The Section I clause matrix records INCORPORATION MECHANICS (☒ checked / ☐ unchecked), NEVER obligation EXISTENCE
// (Brain #551: box-state is not a suppression authority — option A rejected). The seq-2 AUTO-F asserted "☒ 52.219-14
// (checked in Section I)" while source is "☐ 52.219-14 Limitations on Subcontracting" — a FABRICATED checkbox state
// (the box is unchecked; the 52.219-14 limitation is nonetheless real, CO-affirmed in the Q&A). Fix (design C,
// NON-DESTRUCTIVE): build the authoritative ☐/☒ matrix map by POSITIVE-SHAPE parse; when a finding FRAMES a clause as
// checked/clause-list-incorporated but the matrix shows an UNAMBIGUOUS ☐, CORRECT the checkbox-state provenance (state
// the true ☐; re-attribute the obligation to a VERIFIED-PRESENT basis, anchored not asserted) and KEEP the obligation
// at its severity/typing. Fail-toward-keep: NO clause suppressed, NO severity lowered; any ambiguity (clause absent
// from the matrix, both-states, unparseable) leaves the finding byte-identical. UNIT-3/UNIT-4 BOUNDARY: this gate acts
// only on a clause that IS in a real Section-I matrix with a legible ☐; a fabricated SECTION/structure (an invented
// heading a finding cites) is a fabricated-structural-assertion — Unit 4's domain, never touched here.
const CB_CHECKED_RE = /[☒☑]/;
const CB_UNCHECKED_RE = /☐/;
const CB_INCORP_FRAMING_RE = /clause list|checked|incorporated|\bsection\s*[IK]\b|☒|☑/i;          // the fabricated "it is checked/incorporated" framing
const CB_CLAUSE_RE = /\b((?:8?52|252|53)\.\d{3}-\d{1,3}[A-Za-z]?)\b/g;                            // clause numbers (global — a finding may cite several)

// The between-glyph-and-clause span of a GENUINE checkbox-matrix row is a PURE lead-in — whitespace, table borders,
// list/outline markers, punctuation — NO words. This is the positive shape (Unit-2 doctrine): the ubiquitous FAR
// by-reference form "☐ Alternate I (Nov 2025) of 52.240-91" (the ☐ governs the ALTERNATE, the BASE clause is
// incorporated) has WORDS ("Alternate", "of") between the ☐ and the trailing clause number, so it is REJECTED —
// never mis-attributing the Alternate's ☐ to the base clause (R4 BREAK 1, live-record fabrication).
const CB_PURE_LEADIN_RE = /^[\s()[\]|>*·.,:;#–—-]*$/;
export function parseCheckboxMatrix(source: string | null | undefined): Map<string, "checked" | "unchecked"> {
  const checked = new Set<string>();
  const unchecked = new Set<string>();
  // WRAP-JOIN only a GLYPH-ONLY row (a glyph alone on its line) to its next-line clause — never a checkbox-AFTER-label
  // row like "<clause> <label> ☒" (R4 BREAK 2: that would drop the glyph's true owner and fabricate state on the next clause).
  const merged = (source ?? "").replace(/^([^\S\n]*[☒☑☐][^\S\n]*)\n/gm, "$1 ");
  for (const line of merged.split(/\r?\n/)) {
    for (const m of line.matchAll(CB_CLAUSE_RE)) {
      const prefix = line.slice(0, m.index ?? 0);
      const gi = Math.max(prefix.lastIndexOf("☒"), prefix.lastIndexOf("☑"), prefix.lastIndexOf("☐"));
      if (gi < 0) continue;                                   // no glyph before this clause on its row → absent from the matrix
      if (!CB_PURE_LEADIN_RE.test(prefix.slice(gi + 1))) continue; // words between glyph and clause (e.g. "Alternate I … of") → not a matrix row
      if (prefix[gi] === "☐") unchecked.add(m[1]); else checked.add(m[1]);
    }
  }
  const map = new Map<string, "checked" | "unchecked">();
  for (const c of checked) map.set(c, "checked");
  for (const c of unchecked) if (!checked.has(c)) map.set(c, "unchecked");
  return map;
}

const cbClauses = (s: string | null | undefined): string[] => [...new Set([...(s ?? "").matchAll(CB_CLAUSE_RE)].map((m) => m[1]))];

/** The clause the gate would correct: the SOLE matrix-present clause the finding cites, and ONLY if it is ☐ unchecked
 *  with NO checked matrix-clause co-cited (R1 #4: a positional first-match could grab an unchecked cross-ref instead of
 *  the finding's real checked subject). Mixed/multiple/none ⇒ null ⇒ fail-toward-keep. */
const cbTargetClause = (f: TypedFinding, matrix: Map<string, "checked" | "unchecked">): string | null => {
  const cited = [...cbClauses(f.citation), ...cbClauses(f.requirement)];
  const inMatrix = [...new Set(cited)].filter((c) => matrix.has(c));
  const unchecked = inMatrix.filter((c) => matrix.get(c) === "unchecked");
  const checked = inMatrix.filter((c) => matrix.get(c) === "checked");
  return unchecked.length === 1 && checked.length === 0 ? unchecked[0] : null; // exactly one ☐, no co-cited ☒ → unambiguous
};

/** Correct a fabricated ☒/checked framing on a finding whose clause is UNAMBIGUOUSLY ☐ in the Section-I matrix, keeping
 *  the obligation at severity (Brain #551 design C). Default-OFF via caller; supply-clean ⇒ byte-identical. Pure. */
export function applyCheckboxStateFidelity(
  findings: TypedFinding[],
  source: string | null | undefined,
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                       // Rule 61 default-off ⇒ byte-identical
  const matrix = parseCheckboxMatrix(source);
  if (matrix.size === 0) return findings;
  let touched = false;
  const next = findings.map((f): TypedFinding => {
    const clause = cbTargetClause(f, matrix);
    if (!clause) return f;                                              // absent / checked / ambiguous / mixed-cite → keep
    if (!CB_INCORP_FRAMING_RE.test(`${f.citation ?? ""} ${f.requirement ?? ""}`)) return f; // no fabricated framing → nothing to correct
    // VERIFIED-PRESENT basis (Brain #551: anchor, don't assert): the finding's OWN grounded excerpt is present-by-
    // definition; we do NOT claim the body "affirms" (R1 #1 — the clause number appearing elsewhere ≠ affirmation).
    const basis = (f.grounded === true && !!f.excerpt) ? "the obligation is grounded in the solicitation text (see the excerpt)"
      : "a basis outside the Section I checkbox — confirm the obligation with the Contracting Officer";
    touched = true;
    // APPEND the correction — never REPLACE (R2 #1): a wholesale rewrite deletes provenance phrases downstream guards
    // key on (e.g. "incorporated by reference", which isByReferenceMarkingOnly / detectSetAsideConflict read from the
    // citation — card #534). Appending preserves the original citation intact AND states the true ☐; the
    // checkboxCorrected marker carries the structured signal for the render.
    return {
      ...f,                                                             // KEEP kind, controllability, severity, curableInWindow, excerpt, original citation — the obligation stands
      citation: `${f.citation ?? ""} · [checkbox-state correction: ${clause} is UNCHECKED (☐) in the Section I clause matrix — the box records incorporation mechanics, not the obligation; ${basis}.]`,
      checkboxCorrected: true,
    };
  });
  if (touched) console.log("[decide] checkbox-state fidelity: corrected fabricated ☒/checked framing → true ☐ state (obligation KEPT at severity)");
  return touched ? next : findings;
}

// ── STRUCTURAL-ASSERTION FIDELITY GATE (Phase 3 Unit 4 · Brain #551 Unit-3/Unit-4 boundary, flag AUDIT_STRUCTURAL_ASSERTION_FIDELITY default-OFF) ──
// A finding may attribute its clause/obligation to a UCF SECTION heading that DOES NOT EXIST in the ingested
// solicitation — a fabricated STRUCTURE (distinct from Unit 3's fabricated checkbox-STATE on a real matrix row).
// The seq-2 dccce793 record is a commercial SF1449 RFQ whose ingested source contains only Sections G, L, M, yet
// 8 findings cite "Section I …", 5 cite "Section B …", 1 cites "Section C …" — grounded excerpts decorated with an
// INVENTED UCF location. The structure is fabricated even though the underlying obligation (the quoted excerpt) is
// real. Fix (mirror Unit 3 design C, NON-DESTRUCTIVE + VERDICT-INERT): build the set of section letters GENUINELY
// present in the source by positive-shape parse; when a finding's CITATION attributes it to a section letter absent
// from that set, APPEND an honest structural-provenance correction (never replace — downstream guards key on the
// original citation text; card #534) and mark structuralAssertionCorrected, KEEPING kind/controllability/severity/
// excerpt untouched (this gate NEVER changes a verdict — deriveVerdict does not read the marker; it only stops a
// fabricated section heading from reaching render as verified provenance). Fail-toward-keep: if the source has NO
// detectable section letters at all (we cannot prove this doc is UCF-sectioned — e.g. a garbled/OCR ingest), the
// gate is byte-identical; a cited letter that IS present is left intact. UNIT-3/UNIT-4 BOUNDARY: Unit 3 owns a real
// matrix row lying about ☐/☒; Unit 4 owns a section heading that isn't there.
//
// R1 REMEDIATION (Gauntlet round 1, P0) — ASYMMETRIC parsers. Over-fire (defaming a REAL grounded citation as
// fabricated) is the CARDINAL sin; under-fire (missing a fabrication) is the safe direction. So the two sides use
// DELIBERATELY DIFFERENT regexes:
//   • SOURCE-side present-set = WIDE. Any plausible section reference marks the letter present — the abbreviation
//     "Sec."/"Sec", spaced/tab/NBSP separators, a hyphenated PDF page-wrap ("Section-\nI"), a plain line-wrap, an
//     "§" glyph. Widening the SOURCE parser can ONLY ENLARGE the present-set ⇒ it can only SUPPRESS a correction
//     (fail-toward-keep), NEVER create a false one. The letter must be the first alnum after the heading token
//     (heading shape), so prose like "Section 5.2, item M" or "second" never spuriously marks a letter present.
//   • CITATION-side = STRICT (the original "Section <L>" form). A finding that cites an abbreviated/roman/§ form is
//     simply not parsed ⇒ not corrected ⇒ under-fire (safe). Keeping this strict means widening the source side can
//     never grow over-fire.
// Net: on a doc that abbreviates the very section a finding cites in full, the letter is now PRESENT ⇒ no false
// correction. The 14 live seq-2 B/C/I fabrications still fire (those letters appear in NO form in that source).
//
// R2–R5 REMEDIATION → R5 DOCUMENT-CLASS PIVOT. Five rounds proved that deciding "is UCF Section X present in messy
// extracted source" by parsing HEADINGS is a treadmill with an IRREDUCIBLE two-horned failure: a detector wide enough
// to catch every real bare-header form (all-caps / paraphrased / decorated / next-line) inevitably matches short PROSE
// sentences that begin with a lone A–M letter + a title keyword ("I. Clauses apply as written." → drops the live
// Section-I corrections; R5-F2/P1 gate-defeat), while any detector tight enough to reject that prose misses real
// paraphrased headers ("BASIS FOR AWARD", "DELIVERABLES", "QUALITY ASSURANCE", "PERFORMANCE WORK STATEMENT" → defames
// a true grounded citation; R5-F1/P0). Length/case/keyword shape signals cannot separate a short header from a short
// sentence. The REAL discriminator is not the heading — it is the DOCUMENT CLASS:
//   • A UCF-format solicitation (SF33/SF1442/negotiated, "Uniform Contract Format") HAS all Sections A–M by definition,
//     so ANY "Section X" citation is legitimate → the gate must NEVER fire (firing there is the cardinal over-fire).
//   • A COMMERCIAL / SIMPLIFIED-acquisition RFQ (SF1449, commercial products/services, FAR 12/13) has NO UCF A–M
//     structure — it uses the SF1449 + continuation sheets — so a finding that attributes a clause to "Section I/B/C"
//     is fabricating a UCF skeleton the doc does not have (the seq-2 dccce793 record IS exactly this: SF1449 + RFQ +
//     commercial, zero UCF markers; 14 findings cite absent B/C/I).
// So: FIRE only when the doc is POSITIVELY commercial/simplified AND carries NO UCF/negotiated marker; SUPPRESS
// (fail-toward-keep) otherwise. On a suppressed (UCF/ambiguous) doc, defaming a real UCF section is now STRUCTURALLY
// IMPOSSIBLE — which closes the entire R1–R5 over-fire class at its root. The bare-UCF-header detector is REMOVED
// (it was the sole source of both the recurring P0 misses and the P1 prose poison); the present-set is the inline
// word-form section detector ONLY. Trade-off: a fabricated UCF-section citation on a UCF-format doc is NOT caught
// (under-fire) — but on a UCF doc those sections are genuinely present, so there is little to catch and never a
// defamation. Verdict-inert throughout (this only annotates a citation's provenance for render).
const SA_CITED_SECTION_RE = /\bsection\s+([A-M])\b/gi;                             // STRICT — citation provenance: "Section I", "Section M – Evaluation Criteria"
// WIDE inline source heading detector: § | Sec/Sect/Section/Article/Part | letter-spaced "S E C T I O N" + single
// linear separator run (whitespace incl CRLF/blank-line, dot/colon/underscore/paren/comma/dash) + the FIRST [A-M].
const SA_PRESENT_SECTION_RE = /(?:§\s*|\b(?:sec(?:t(?:ion)?)?|article|part)\b\.?|\bs\W*e\W*c\W*t\W*i\W*o\W*n)[\s.:_(),–—-]*([A-M])\b/gi;
// DOCUMENT-CLASS markers. COMMERCIAL/SIMPLIFIED (gate active): SF1449, commercial products/services, RFQ/quote,
// combined synopsis, FAR 12/13 / simplified acquisition, SF18. UCF/NEGOTIATED (gate SUPPRESSED — A–M are real):
// SF33/SF1442/SF1447, "uniform contract format", "solicitation, offer and award" (the SF33 banner).
// R7 tightening — bare "commercial services" in a FAR-15 RFP's SCOPE prose is NOT a commercial-acquisition-method
// signal (an ambiguous over-fire trigger). Require the FAR-12 term "commercial item(s)" or the SF1449 title phrase
// "commercial products and/or commercial services". The live seq-2 doc carries the full SF1449 title (+ SF1449) so it
// still fires; a negotiated RFP that merely mentions "commercial services" in scope no longer trips the gate.
const SA_COMMERCIAL_DOC_RE = /\bSF[-\s]?1449\b|standard\s+form\s+1449|commercial\s+items?\b|commercial\s+products?\s+(?:and|or|\/|&)\s+commercial\s+services?|request\s+for\s+quot|\bRFQ\b|combined\s+synopsis|simplified\s+acquisition|\bFAR\s+(?:part\s+)?1[23]\b|\bSF[-\s]?18\b/i;
// R6 remediation — the banner spellings a real CO writes: FULL "Standard Form 1442/1447/33" (FAR 36.701(a) names the
// form verbatim "Standard Form 1442, Solicitation, Offer, and Award …") and the OXFORD-COMMA "Solicitation, Offer, and
// Award". Widening the UCF suppressor is strictly safe (can only SUPPRESS a correction). Verified inline: closes the 3
// R6-F1b defamations (STANDARD FORM 1442 / 1447 / SF-33 UCF docs mis-read as commercial).
// R7 remediation — the UCF/negotiated doc-class signals a real CO uses: period-dotted "S.F. 33/1442", and the
// negotiated-procurement class itself (FAR Part 15 / "negotiated procurement" / "Sections A through M") which is UCF
// BY REGULATION (FAR 15.204-1: negotiated solicitations use the uniform contract format = Sections A–M). All are
// strictly suppressor-side (safe). SF30 / DD1707 are deliberately EXCLUDED (an SF30 can amend a commercial SF1449).
// R8 — the FAR-14 sealed-bidding class ALSO uses the UCF (FAR 14.201-1). Add the genuine sealed-bid TELLS, but NOT
// the bare "IFB"/"RFP"/"Invitation for Bids" labels: the commercial SF1449 form prints ALL THREE solicitation-type
// checkboxes ("REQUEST FOR QUOTE (RFQ) / INVITATION FOR BID (IFB) / REQUEST FOR PROPOSAL (RFP)") as boilerplate — the
// live seq-2 SF1449 literally contains "(IFB)" and "(RFP)" — so those labels are NOT reliable UCF signals. The safe
// tells ("sealed bid(ding)", "FAR part 14", "publicly opened", "lowest responsive[,] responsible bidder") appear only
// on a genuine sealed-bid IFB, never on the SF1449 form (verified absent from the live source).
const SA_UCF_DOC_RE = /uniform\s+contract\s+format|\bS\.?\s*F\.?[-\s]?(?:33|144[27])\b|standard\s+form\s+(?:33|144[27])|solicitation,?\s+offer,?\s+and\s+award|\bnegotiated\s+(?:procurement|acquisition|solicitation)\b|\bFAR\s+(?:part\s+)?1[45]\b|\bsections?\s+a\s*(?:through|thru|to|[-–—])\s*m\b|\bsealed\s+bid(?:ding)?\b|\bpublicly\s+opened\b|\blowest\s+responsive,?\s+responsible\s+bidder\b/i;
/** True when the gate should fire: the ingested doc is positively a commercial/simplified-acquisition RFQ (which has
 *  NO UCF A–M structure) AND carries no UCF/negotiated marker. Fail-toward-keep on anything not positively commercial. */
const saGateApplies = (source: string | null | undefined): boolean => {
  const s = source ?? "";
  if (SA_UCF_DOC_RE.test(s)) return false;                                        // explicit UCF / negotiated form → A–M are real → never fire
  if (!SA_COMMERCIAL_DOC_RE.test(s)) return false;                                // not positively commercial → fail-toward-keep
  // STRUCTURAL UCF signal (marker-INDEPENDENT belt-and-suspenders for a banner-less / unusual-spelling UCF RFP): a
  // commercial SF1449 RFQ never lays out the early UCF SCHEDULE sections A–F (it uses the SF1449 form blocks +
  // continuation sheets), so an inline reference to ≥2 distinct early sections {A,B,C,D,E,F} is a UCF layout →
  // suppress. This escapes the classifier's vocabulary treadmill by keying on STRUCTURE, not a marker phrase. (The
  // live seq-2 present-set is {G,L,M} — ZERO early sections — so it still fires.)
  const present = new Set(saPresentSectionLetters(s));
  const earlySections = ["A", "B", "C", "D", "E", "F"].filter((l) => present.has(l)).length;
  if (earlySections >= 2) return false;                                           // UCF-structured schedule (banner-less) → suppress
  return true;
};
const saCitedSectionLetters = (s: string | null | undefined): string[] =>
  [...new Set([...(s ?? "").matchAll(SA_CITED_SECTION_RE)].map((m) => m[1].toUpperCase()))];
const saPresentSectionLetters = (s: string | null | undefined): string[] =>
  [...new Set([...(s ?? "").matchAll(SA_PRESENT_SECTION_RE)].map((m) => m[1].toUpperCase()))]; // inline word-form sections only
/** Correct a finding that attributes its obligation to a SECTION heading absent from the ingested source (Brain #551
 *  boundary). Provenance-only + verdict-inert; supply-clean ⇒ byte-identical. Pure → gate-tested. Default-OFF via caller. */
export function applyStructuralAssertionFidelity(
  findings: TypedFinding[],
  source: string | null | undefined,
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                                            // Rule 61 default-off ⇒ byte-identical
  if (!saGateApplies(source)) return findings;                                    // R5 doc-class gate: only a commercial/simplified RFQ lacks UCF A–M → fire; else fail-toward-keep
  const present = new Set(saPresentSectionLetters(source));                       // inline word-form sections the commercial doc genuinely references
  if (present.size === 0) return findings;                                        // no sections referenced at all → nothing to compare against → fail-toward-keep
  let touched = false;
  const next = findings.map((f): TypedFinding => {
    const cited = saCitedSectionLetters(f.citation);                              // STRICT: structural provenance lives in the CITATION, not the requirement/excerpt
    const fabricated = cited.filter((l) => !present.has(l));                      // section letters the finding claims that the source does not contain
    if (fabricated.length === 0) return f;                                        // cites only present sections (or none) → nothing fabricated
    touched = true;
    const presentList = [...present].sort().join(", ");
    const fabList = fabricated.sort().join(", ");
    // APPEND, never replace (Unit 3 doctrine): keep the original citation intact AND state the true structural fact.
    return {
      ...f,                                                                        // KEEP kind, controllability, severity, curableInWindow, excerpt, grounded — the obligation stands
      citation: `${f.citation ?? ""} · [structural-assertion correction: Section ${fabList} ${fabricated.length > 1 ? "are" : "is"} not present in the ingested solicitation (sections found: ${presentList}) — the obligation is grounded in the quoted excerpt, not that section heading.]`,
      structuralAssertionCorrected: true,
    };
  });
  if (touched) console.log("[decide] structural-assertion fidelity: caveated fabricated UCF-section attribution → grounded-excerpt provenance (obligation KEPT, verdict-inert)");
  return touched ? next : findings;
}

// ── QUANTITY-AMBIGUITY FIDELITY GATE (Phase 3 Unit 5, flag AUDIT_QUANTITY_AMBIGUITY_FIDELITY default-OFF) ──
// A solicitation may pose a MATERIAL quantity as an EXPLICIT, unresolved either/or — the seq-2 dccce793 record's Q&A
// asks verbatim "Is the total requirement 520 hours or 1,040 hours?" (the Schedule says "520 hrs"; 20 hrs/wk × 52 wks
// = 1,040 — a 2× level-of-effort/pricing spread the CO's answer did not settle). The audit's lens LAUNDERED this into a
// confident single number — finding #3 "base period estimated at 520 hours" — picking one horn of a patent, unanswered
// ambiguity and hiding the 2× pricing risk (silent under-caution toward committal). The engine flags such ambiguities
// only EMERGENTLY (whichever lens happens to catch it), so on the next record a lens miss → a silent 2× under-bid.
// This gate is the DETERMINISTIC BACKSTOP: parse the source for the POSITIVE SHAPE of a source-posed quantity question
// (two same-unit quantities that DIFFER, joined by "or", inside an interrogative sentence) and EMIT one caution finding
// surfacing the UNRESOLVED ambiguity, floored to BID_WITH_CAUTION (cautionFloor — never a bar, never NHR/NO_BID). It is
// ADDITIVE and NON-DESTRUCTIVE: no existing finding is mutated, so the laundered "estimated at 520" lens finding stands
// beside an explicit "actually unresolved: 520 OR 1,040 — confirm with the CO" caution the render now shows.
//
// DOCTRINE (no-blocklist / positive-shape; the over-fire cardinal sin for an EMITTER is crying wolf on every doc): the
// discriminator is STRUCTURE, not a number scan. A latent numeric conflict (Schedule says X, PWS math implies Y, nobody
// asked) is DELIBERATELY out of scope — a deterministic latent-conflict detector is the over-fire treadmill (every
// option-year schedule and every wage-determination "40 hours per week" table carries differing same-unit numbers). We
// fire ONLY on the doc's OWN explicit either/or QUESTION, which is the unambiguous signal that the source itself left a
// quantity unresolved. Fail-toward-keep: no interrogative either/or shape ⇒ byte-identical.
//   • QTY token = number + a measure-word (positive shape "a quantity is <n> <unit>", NOT a bar-vocab blocklist).
//   • Interrogative REQUIRED — "price 520 or 1,040 hours as directed" is a DIRECTIVE choice, not an unanswered ambiguity;
//     only a QUESTION ("Is it 520 or 1,040 hours?") signals the source did not resolve it. This is the primary over-fire
//     guard (a declarative option-menu never trips the gate).
//   • Same unit FAMILY + DIFFERING values required (520 hours vs 1,040 hours). Equal values / cross-unit ("2 hours or 2
//     days") are not a quantity ambiguity → skipped.
//   • Dedup: if a finding ALREADY presents this exact pair as unresolved/ambiguous, suppress the emission (no double).
const QA_UNIT_RE = "(hours?|hrs?|days?|weeks?|months?|years?|ftes?|units?|each|ea\\.?|positions?|copies|pages?|sets?|lots?|items?)";
// Two same-shape quantities joined by "or" (the either/or core). Family/difference/interrogative checked in code.
const QA_EITHER_OR_RE = new RegExp(`(\\d[\\d,]{0,7})\\s*${QA_UNIT_RE}\\s+or\\s+(\\d[\\d,]{0,7})\\s*${QA_UNIT_RE}`, "gi");
const qaNum = (s: string): number => parseInt(s.replace(/,/g, ""), 10);
const qaUnitFamily = (u: string): string => {
  const s = u.toLowerCase().replace(/\.$/, "");
  if (/^(hours?|hrs?)$/.test(s)) return "hour";
  if (/^days?$/.test(s)) return "day";
  if (/^weeks?$/.test(s)) return "week";
  if (/^months?$/.test(s)) return "month";
  if (/^years?$/.test(s)) return "year";
  if (/^ftes?$/.test(s)) return "fte";
  if (/^(each|ea)$/.test(s)) return "each";
  if (/^positions?$/.test(s)) return "position";
  if (/^copies$/.test(s)) return "copy";
  if (/^pages?$/.test(s)) return "page";
  if (/^sets?$/.test(s)) return "set";
  if (/^lots?$/.test(s)) return "lot";
  if (/^units?$/.test(s)) return "unit";
  if (/^items?$/.test(s)) return "item";
  return s;
};
// R1 REMEDIATION (Gauntlet R1, P0 — cardinal-sin OVER-FIRE). The prior guard declared a match "interrogative" iff a "?"
// appeared before the next .!\n — a PUNCTUATION scan mislabeled as a question check. So a DECLARATIVE same-unit either/or
// sharing a clause with an unrelated trailing "?" (FAQ "…; questions on this CLIN?", rhetorical "…, correct?", a "— which
// will the Gov confirm?" tail, a parenthetical aside) laundered into a false ambiguity caution → flipped a clean BID →
// BID_WITH_CAUTION (the emitter cardinal sin). ROOT FIX: the enclosing clause must be a QUESTION IN FORM — the clause that
// CONTAINS the either/or pair must OPEN with an interrogative marker (is/are/which/whether/isn't…), tested on the FIRST
// token only (so "Offerors shall price…" does NOT count off a mid-clause "shall"). Clause = delimited by [.!?;:\n] (so a
// "Question 4:" / "Q&A #1:" prefix is skipped to the real question head); a genuine "Which is correct: 520 or 1,040?" is
// kept by ALSO accepting an interrogative head on the segment BEFORE a leading ":". Fail-toward-keep: no interrogative-
// headed clause binds the pair to a terminating "?" ⇒ null (byte-identical). Validated vs the 7 R1 over-fires (all → no
// fire) + DRIVER + "Question N:" prefix + genuine "Isn't the requirement X or Y…?" (all → fire).
const QA_INTERROG_HEAD_RE = /^(is|are|was|were|do|does|did|has|have|had|shall|should|will|would|can|could|may|might|which|what|whether|how\s+(?:many|much)|is\s*n['’]?t|are\s*n['’]?t|was\s*n['’]?t|were\s*n['’]?t|do\s*n['’]?t|does\s*n['’]?t|did\s*n['’]?t|wo\s*n['’]?t|should\s*n['’]?t|could\s*n['’]?t|would\s*n['’]?t|ca\s*n['’]?t)\b/i;
// R2 REMEDIATION (Gauntlet R2, P0) — the R1 head test checked only the FIRST TOKEN, so a fronted auxiliary that is NOT a
// question mood laundered a benign either/or: (1) a CONDITIONAL/subjunctive PROTASIS ("Should offerors require 520 or
// 1,040 hours, they must request approval?" = "If offerors require…") and (2) a `\b`-tokenized DATE/HYPHEN-COMPOUND opener
// whose first token merely spells an auxiliary ("May 2026 …", "Should-cost analysis", "Will-call", "Would-be"). A first-
// token check is a word-position scan mislabeled as a syntactic-mood check. Tighten the head test: the aux must be a real
// standalone word (NOT hyphen-suffixed, NOT followed by a bare year/number — those are compound nouns / dates, not a
// clause subject). Verdict-safe: fail-toward-keep (reject ⇒ null ⇒ byte-identical).
const qaIsInterrogativeHead = (clause: string): boolean => {
  const m = clause.match(QA_INTERROG_HEAD_RE);
  if (!m) return false;
  const after = clause.slice(m[0].length);
  if (/^-/.test(after)) return false;                               // hyphenated compound noun (Should-cost, Will-call, Would-be, Can-do)
  if (/^\s+\d/.test(after)) return false;                           // aux followed by a bare number/year (May 2026) → a date opener, not a question
  return after === "" || /^\s+\S/.test(after) || /^['’]/.test(after); // a real word boundary (a subject follows), not a glued suffix
};
// R5 REMEDIATION (Gauntlet R5, P0) — R1's head test proved the clause OPENS with an interrogative marker but never bound the
// PAIR to the question's FOCUS, and R2–R4 only ever hardened the CONDITIONAL branch. So an INTERROGATIVE-headed sentence whose
// either/or pair is a DECLARATIVE ASIDE — the question asks about something else — still over-fired ("Does the offeror
// understand the estimate IS 520 or 1,040 hours?", "Are offerors required to price THE 520 or 1,040 hours reflected in
// Attachment 3?", "How many volumes COVER the 520 or 1,040 hours?"). ROOT FIX (verb-vocabulary-independent SHAPE): the pair
// must be the INTERROGATED CONTENT — (i) the SUBJECT region between the interrogative head and the pair is a bare noun phrase
// (NO embedded finite verb / complementizer, and NOT ending in a determiner/preposition that makes the pair an object), and
// (ii) the TAIL after the pair is TERMINAL (only a trailing SUBORDINATE clause allowed — never a main-clause apodosis /
// predicate). This UNIFIES + subsumes the R2–R4 conditional handling: a conditional protasis puts a finite verb in the
// subject region ("Should offerors REQUIRE…") or a main clause in the tail ("…, notify the KO?" / "…the CO will confirm?").
// R8 REMEDIATION (Gauntlet R8, P1 — DOCTRINE-DECISIVE). R5's subject-region check detected an embedded clause by a CLOSED
// report-verb list (lists|states|shows|covers|…) — a verb BLOCKLIST masquerading as a shape check, so an embedded declarative
// whose finite verb is OPEN-CLASS ("Is it clear the schedule ASSUMES 520 or 1,040 hours?" — assumes/projects/allocates/carries
// /yields…) slipped → over-fire. A verb list is always one open-class lemma behind (the treadmill R4 named, [[feedback_no_
// blocklist_shape_allowlist_doctrine]]). ROOT FIX (verb-vocabulary-INDEPENDENT, morphology+function-word SHAPE): a genuine
// which-quantity question has the pair as the interrogative head's own predicate complement, so the SUBJECT region between the
// head and the pair is a bare noun phrase with NO finite verb. Detect a finite verb by SHAPE:
//   • QA_AUX_RE — a closed set of grammatical FUNCTION words (auxiliary/copula/modal/complementizer). Closed by definition.
//   • QA_FINITE_MORPH_RE — 3rd-person-present (-s/-es, NOT a possessive 's) or past (-ed) VERB MORPHOLOGY, which catches the
//     unbounded open class of embedded finite verbs by inflection, not by lemma. (A plural-noun subject ending in -s becomes a
//     SAFE under-fire — fail-toward-keep.) This ends the verb-list treadmill: a bare-NP allowlist (POS shape), not a blocklist.
// NOTE: "be/been/being/am" are DELIBERATELY excluded — after a modal head ("Should the estimate BE 520 or 1,040 hours?")
// "be" is the question's OWN predicate copula, not an embedded finite verb; an embedded clause uses finite "is/are" (caught).
const QA_AUX_RE = /\b(is|are|was|were|isn'?t|aren'?t|wasn'?t|weren'?t|has|have|had|do|does|did|that|whether|who|whom|whose|which|shall|will|must|would|should|can|could|may|might)\b/i;
const QA_FINITE_MORPH_RE = /\b[a-z]{2,}(?:es|ed)\b|\b[a-z]+[^s'’\s]s\b/i;   // -es/-ed inflection, or a bare -s NOT preceded by an apostrophe (excludes possessive 's)
const qaSubjectHasFiniteVerb = (region: string): boolean => QA_AUX_RE.test(region) || QA_FINITE_MORPH_RE.test(region);
// R9 — frame-shaped guards (verb-vocabulary-independent) that close the base-form / no-morphology-irregular embedded verb:
const QA_EXPLETIVE_RE = /^(it|there)\b(.*\S.*)$/i;                          // expletive subject followed by MORE content (extraposition) → embedded clause
const QA_DO_SUPPORT_RE = /^(do|does|did)$/i;                                // a do-support head always embeds a lexical main verb
// R10 — POSITIONAL bare-NP shape (verb-vocabulary-independent, subsumes the R9 frame enumeration). A genuine which-quantity
// question has a SINGLE determiner-headed noun-phrase subject; an embedded content clause ("Is the assumption YOU bill…?",
// "Is the premise THE base run…?") introduces a SECOND clause-subject — a personal subject pronoun (with other content) or a
// SECOND determiner-headed NP. Either marks a second predication holding the pair → reject.
const QA_SUBJ_PRONOUN_RE = /\b(i|you|we|they|he|she|it)\b/i;                // a personal SUBJECT pronoun (not possessive your/our/their) — an embedded-clause subject
const QA_DETERMINER_G_RE = /\b(the|a|an|this|that|these|those)\b/gi;        // count determiner-headed NPs; ≥2 ⇒ a second NP ⇒ embedded clause
// R11 REMEDIATION (Brain #553 fast-follow — TERMINAL SINGLE-NP CHECK; bank the known terminal fix, don't leave permanent).
// R10's second-subject detection keyed on the 2nd subject's POS (subject pronoun / 2nd determiner-headed NP), so a
// BARE-noun / possessive-headed / proper-noun 2nd subject with an UNINFLECTED (base/irregular) verb slipped: "Is the
// assumption staff bill 520 hours or 1,040 hours?" (elided `that` + base verb `bill`) — the contrived-but-real R11-1 residual.
// DOCTRINE-CLEAN CLOSE (redteam-unit5-r11.md §4, "reject ANY second predication regardless of the 2nd subject's POS"):
// a genuine copula which-quantity subject is a SINGLE short noun phrase whose head IS the interrogative's predicate-complement
// subject; ANY second predication needs a 2nd subject PLUS a finite-verb-position token, which necessarily occupies a THIRD
// content slot after the NP head. So require the subject region — after an optional leading determiner/possessive NP-opener —
// to be ≤ 2 further whitespace tokens (one bounded NP: opener + modifier + head). A 3rd+ token is the embedded clause's verb
// position regardless of the 2nd subject's POS → reject. POS-INDEPENDENT (no verb/noun lemma list — the no-blocklist doctrine,
// [[feedback_no_blocklist_shape_allowlist_doctrine]]). Fail-toward-keep: a genuine 3-word subject NP ("the base period
// requirement") now UNDER-fires — the emitter's safe direction; the recall trade is measured at Ultra Gate-2 on a purpose-built
// corpus (Brain #553 caveat), NOT a dccce793 replay. PURELY ADDITIVE (a new rejection; can only under-fire, never add an
// over-fire). Fires "the total requirement" / "the offeror's base" / "CLIN 0001" / "staffing" / "these"; rejects the whole
// R11-1 bare/possessive/proper 2nd-subject family.
const QA_NP_OPENER_RE = /^(the|a|an|this|that|these|those|my|your|our|his|her|their|its)\b/i;
const qaSubjectIsSingleNP = (region: string): boolean => {
  const t = region.trim();
  if (t === "") return true;                                              // empty subject region (preColon "Which is correct: …") → fires
  const rest = t.replace(QA_NP_OPENER_RE, "").trim();                     // drop one leading NP-opener (determiner/possessive)
  const toks = rest === "" ? [] : rest.split(/\s+/);
  return toks.length <= 2;                                                // ≤2 further tokens = a single bounded NP; ≥3 = room for a 2nd subject+verb
};
// QA_OBJECT_MARKER_RE — a determiner/preposition as the LAST token of the subject region makes the pair an OBJECT noun phrase
// ("price the 520…", "questions on the 520…"), not the interrogative head's predicate complement.
// R8: require PRECEDING content (\S\s+) so a determiner is flagged only as a mid-region OBJECT head ("price the 520…"), not
// when a demonstrative is the WHOLE subject region (a pronoun subject — "Are these 520 or 1,040 hours?" fires).
const QA_OBJECT_MARKER_RE = /\S\s+(the|a|an|this|these|those|its|their|your|our|his|her|my|of|on|in|to|for|at|by|with|from|into|onto|over|under|per|about|regarding|concerning|between)\s*$/i;
// A trailing SUBORDINATE clause is allowed after the pair ("…3 FTEs or 5 FTEs, since the PWS is unclear?"); a main clause is not.
// R7 REMEDIATION (Gauntlet R6+R7, P1) — TERMINAL-PAIR PIVOT (ends the tail-clause treadmill). R5 allowed a trailing
// SUBORDINATE clause after the pair, stripped by a greedy `[^,?]*` run to the next comma/"?". That greedy strip was the
// persistent seam: a main-clause apodosis GLUED to a subordinator with no comma ("…per Attachment 3 notify the CO?" [R6],
// "…since funding lapsed proceed with the base only?" [R7]) had its whole tail swallowed → the terminal check saw nothing →
// over-fire. R6 shrank the strippable subordinator SET; R7 proved the greedy STRIP itself is the root (it re-opened on the
// kept causal set). Separating a genuine trailing subordinate clause from a glued apodosis by shape is an irreducible
// treadmill (same lesson as Unit 4's header-parsing pivot). ESCAPE: require the pair to be TERMINAL — nothing but whitespace/
// punctuation between the pair and the "?". A genuine which-quantity question puts the alternatives at the END ("Is the total
// requirement 520 hours or 1,040 hours?" — the live seq-2 defect, and the real dccce793 span, are terminal); every glued
// apodosis / conditional / declarative-aside has trailing words → rejected, with NO tail parsing to exploit. Trade-off: a
// genuine question with a trailing clause/PP/adverb ("…, since the PWS is unclear?", "…per Attachment 3?", "…annually?") is
// now a SAFE under-fire (recall traded for airtight over-fire robustness — the emitter's fail-toward-keep doctrine). This
// closes the R6/R7 glued-apodosis class at its root and removes the entire greedy-strip attack surface.
const qaEnclosingQuestion = (source: string, matchStart: number, matchEnd: number): string | null => {
  // (a) the pair's clause must END in "?" — the next terminator after the pair among [.!?\n] is a "?".
  const rest = source.slice(matchEnd);
  const q = rest.indexOf("?");
  const stop = rest.search(/[.!\n]/);
  if (q < 0 || (stop >= 0 && stop < q)) return null;                 // clause ends in .!\n before any "?" → not a question
  // (b) the enclosing SENTENCE = from the previous sentence terminator [.!?\n] to the terminating "?".
  const before = source.slice(0, matchStart);
  const sentStart = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n")) + 1;
  const sentPrefix = source.slice(sentStart, matchStart);           // sentence text up to the pair
  // (c) the pair's CLAUSE (delimited within the sentence by : ; or ,) must OPEN with an interrogative marker (question in
  //     form). "Question 4: Is the total…?" → clause head "Is …".
  const clauseStart = Math.max(sentPrefix.lastIndexOf(":"), sentPrefix.lastIndexOf(";"), sentPrefix.lastIndexOf(",")) + 1;
  const clauseHead = sentPrefix.slice(clauseStart).trimStart();
  // (d) SAFE widening — a genuine "Which is correct: 520 or 1,040 hours?" carries the marker BEFORE the ":"; accept it too.
  //     R6: use the LAST pre-pair colon and take the segment AFTER the previous boundary, so a label prefix ("Section L:" /
  //     "Q&A:") does not mask the real interrogative head ("Section L: Which is correct: 520 or 1,040?" → head "Which …").
  const colon = sentPrefix.lastIndexOf(":");
  const preColonBoundary = colon >= 0 ? Math.max(sentPrefix.slice(0, colon).lastIndexOf(":"), sentPrefix.slice(0, colon).lastIndexOf(";"), sentPrefix.slice(0, colon).lastIndexOf(".")) : -1;
  const preColonHead = colon >= 0 ? sentPrefix.slice(preColonBoundary + 1, colon).trimStart() : "";
  const clauseHeadOk = qaIsInterrogativeHead(clauseHead);
  // R10 — the preColon widening ("Which is correct: 520 or 1,040?") is valid only when the pre-colon body is the wh-word's OWN
  // copula predicate ("is correct"/"is right") with NO second subject: a do-support inversion or a determiner-headed / pronoun
  // second subject ("Which do THE PARTIES bill: 520 or 1,040?") means the pair is that clause's OBJECT, not a fronted subject.
  const preColonBody = colon >= 0 ? preColonHead.slice(preColonHead.match(QA_INTERROG_HEAD_RE)?.[0].length ?? 0) : "";
  const preColonOk = colon >= 0 && qaIsInterrogativeHead(preColonHead)
    && !/\b(do|does|did)\b/i.test(preColonBody)
    && !QA_SUBJ_PRONOUN_RE.test(preColonBody)
    && (preColonBody.match(QA_DETERMINER_G_RE) ?? []).length === 0;
  if (!clauseHeadOk && !preColonOk) return null;
  // (e) INTERROGATED-CONTENT check (R5): the SUBJECT region between the qualifying head and the pair must be a bare noun
  //     phrase. clauseHead path → the text AFTER the interrogative marker; preColon path → the POST-colon text (the pair
  //     lives after the ":"). An embedded finite verb/complementizer, or a trailing determiner/preposition, means the pair is
  //     NOT what the question interrogates.
  const subjectRegion = clauseHeadOk
    ? clauseHead.slice(clauseHead.match(QA_INTERROG_HEAD_RE)?.[0].length ?? 0)
    : sentPrefix.slice(colon + 1);
  // R9 REMEDIATION — the morphology check catches only INFLECTED finite verbs; a base-form ("you allocate") or a no-
  // morphology irregular ("the base ran") embedded verb evades it. Close the class POSITIONALLY by the FRAME (not the verb):
  // every such over-fire is an EXTRAPOSITION ("Is it clear <clause>…") or DO-SUPPORT ("Does <subj> <verb>…"), neither of which
  // a genuine which-quantity question uses. (Bare "Is it 520 or 1,040 hours?" — nothing after "it" — still fires.)
  const subjTrim = subjectRegion.trim();
  const headMarker = (clauseHeadOk ? clauseHead : preColonHead).match(QA_INTERROG_HEAD_RE)?.[0] ?? "";
  if (QA_DO_SUPPORT_RE.test(headMarker.trim())) return null;        // do-support head → the pair is a lexical verb's object, never the copula complement
  if (QA_EXPLETIVE_RE.test(subjTrim)) return null;                  // expletive "there …" (+ "it …") extraposition → embedded clause
  if (QA_SUBJ_PRONOUN_RE.test(subjTrim) && !/^(i|you|we|they|he|she|it)$/i.test(subjTrim)) return null; // R10: a subject pronoun + other content = an embedded clause subject (subsumes R9 "it/there" extraposition)
  if ((subjTrim.match(QA_DETERMINER_G_RE) ?? []).length >= 2) return null; // R10: a SECOND determiner-headed NP = an embedded content clause
  if (!qaSubjectIsSingleNP(subjTrim)) return null;                  // R11 (Brain #553): >1 NP-worth of content = a 2nd subject+verb (any POS) → reject
  if (qaSubjectHasFiniteVerb(subjectRegion)) return null;           // an embedded finite clause (inflected verb / aux, by morphology) holds the pair
  if (QA_OBJECT_MARKER_RE.test(subjectRegion)) return null;         // pair is an object NP, not the head's complement
  // (f) TERMINAL-PAIR check (R7 pivot): the pair must run straight to the "?" — any alphanumeric word between the pair and the
  //     "?" is a trailing clause (a conditional apodosis, a declarative-aside predicate, or a different question) → reject.
  if (/[A-Za-z0-9]/.test(rest.slice(0, q))) return null;
  return source.slice(sentStart, matchEnd + q + 1).trim();
};
type QaAmbiguity = { a: number; b: number; unit: string; sentence: string };
/** All EXPLICIT unresolved quantity ambiguities the source poses (two same-family differing quantities in a question). */
export function detectQuantityAmbiguities(source: string | null | undefined): QaAmbiguity[] {
  const s = source ?? "";
  const out: QaAmbiguity[] = [];
  const seen = new Set<string>();
  for (const m of s.matchAll(QA_EITHER_OR_RE)) {
    const fam1 = qaUnitFamily(m[2]), fam2 = qaUnitFamily(m[4]);
    if (fam1 !== fam2) continue;                                     // "2 hours or 2 days" — not a same-quantity ambiguity
    const a = qaNum(m[1]), b = qaNum(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue; // equal values → no ambiguity
    const sentence = qaEnclosingQuestion(s, m.index ?? 0, (m.index ?? 0) + m[0].length);
    if (!sentence) continue;                                         // not inside a question → a directive/option-menu, not an unanswered ambiguity
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = `${lo}|${hi}|${fam1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a: lo, b: hi, unit: fam1, sentence: sentence.slice(0, 300) });
  }
  return out;
}
/** Emit a caution finding for each EXPLICIT unresolved quantity ambiguity the source poses, unless an existing finding
 *  already presents that exact pair as unresolved/ambiguous. Additive + non-destructive + caution-floored (never a bar).
 *  Default-OFF via caller; no ambiguity shape ⇒ byte-identical. Pure → gate-tested. */
export function applyQuantityAmbiguityFidelity(
  findings: TypedFinding[],
  source: string | null | undefined,
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                              // Rule 61 default-off ⇒ byte-identical
  const ambiguities = detectQuantityAmbiguities(source);
  if (ambiguities.length === 0) return findings;                    // no source-posed either/or question → nothing to backstop
  // R4 REMEDIATION (Gauntlet R4, P1 — dangerous false dedup-suppression toward committal). The dedup must fire ONLY when a
  // prior finding ACTUALLY named THIS quantity pair as unresolved. Two tightenings: (1) the ambiguity marker no longer
  // includes a bare "or … ?" alternate (that matched nearly any §L/Q&A question containing "or" → silenced real emissions);
  // (2) hasNum is a DELIMITED token match, so a clause/CAGE/section digit-run that merely EMBEDS the digits (520 ⊂ 5W520,
  // 1040 ⊂ 52.219-1040, 520 ⊂ PWS 5.2.520) does NOT satisfy the number test.
  const AMBIG_MARK_RE = /\b(ambig|unresolved|which is (?:the )?correct|discrepan|conflict)/i;
  const hasNum = (blob: string, n: number): boolean => {
    const forms = [String(n), n.toLocaleString("en-US")].map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Delimited: reject a leading letter/digit/dot/comma/hyphen (so 520 ⊄ 5W520, 1040 ⊄ 52.219-1040, 520 ⊄ PWS 5.2.520);
    // on the RIGHT reject only a digit-continuation or glued letter (R5 P2: a trailing ./,/- punctuation like "1,040-hour",
    // "1,040." must STILL match a genuine prior finding → no double emission).
    return new RegExp(`(?<![\\w.,-])(?:${forms.join("|")})(?![\\w])(?![.,-]\\d)`).test(blob);
  };
  const emitted: TypedFinding[] = [];
  ambiguities.forEach((amb, i) => {
    // DEDUP — a lens already surfaced this exact pair AS unresolved (both numbers present + an ambiguity marker) → skip.
    const already = findings.some((f) => {
      const blob = `${f.requirement ?? ""} ${f.citation ?? ""} ${f.excerpt ?? ""}`;
      return hasNum(blob, amb.a) && hasNum(blob, amb.b) && AMBIG_MARK_RE.test(blob);
    });
    if (already) return;
    const ratio = amb.a > 0 ? Math.round((amb.b / amb.a) * 10) / 10 : 0;
    const risk = amb.unit === "hour" || amb.unit === "fte" || amb.unit === "week" || amb.unit === "month" || amb.unit === "year"
      ? "level-of-effort / pricing" : "quantity / pricing";
    emitted.push({
      id: `quantity_ambiguity#${i}`,
      requirement: `Unresolved quantity ambiguity: the solicitation poses the requirement as ${amb.a} ${amb.unit}(s) OR ${amb.b} ${amb.unit}(s)${ratio > 1 ? ` (a ${ratio}× spread)` : ""} and does not resolve it — a material ${risk} risk. Price both scenarios and/or submit a clarifying question to the Contracting Officer before bid.`,
      citation: "Solicitation / Q&A — explicit unresolved quantity question",
      excerpt: amb.sentence,                                        // verbatim source span (grounded by construction)
      kind: "pricing",
      controllability: "bidder_controls",                           // gate-to-clear (seek clarification / price both) — NEVER a bar
      grounded: true,
      lens: "quantity-ambiguity-fidelity",
      severity: "P1",
      curableInWindow: true,
      cautionFloor: true,                                           // floors verdict to BID_WITH_CAUTION minimum; never NHR/NO_BID, never a show-stopper
      quantityAmbiguityFlagged: true,
    });
  });
  if (emitted.length === 0) return findings;                        // every ambiguity already surfaced as unresolved → byte-identical
  console.log(`[decide] quantity-ambiguity fidelity: surfaced ${emitted.length} unresolved source-posed quantity question(s) as caution (BID_WITH_CAUTION floor; additive, non-destructive)`);
  return [...findings, ...emitted];
}

// ═══ PERFORMANCE-UPKEEP CAVEAT emitter — card #576 (flag AUDIT_PERFORMANCE_UPKEEP_CAVEAT, gated by the caller) ═══
// An ordinary-course "maintain <credential> during performance" recital that gradeCoverageV2 DEMOTED off the NHR path
// (coverageV2.caveatRecital) is surfaced here as a BID_WITH_CAUTION-floor CAVEAT naming the credential VERBATIM — so the
// customer gets a real committal verdict PLUS a prominent "confirm you can maintain X" note, never an NHR punt (the CEO
// customer-failure reframe, card #576). Fabrication-invariant compliant: the credential is grounded from the obligation
// (verbatim); the prose makes ZERO claim about whether the bidder holds it. Additive/non-destructive; a caution-floor,
// never a show-stopper, never NHR/NO_BID. Caller gates on the flag + supplies coverageV2.caveatRecital.
export function emitPerformanceUpkeepCaveats(findings: TypedFinding[], caveats: Array<{ section: string; obligation: string; credential: string }>): TypedFinding[] {
  if (!caveats?.length) return findings;
  const emitted: TypedFinding[] = caveats.map((c, i) => ({
    id: `performance_upkeep_caveat#${i}`,
    requirement: `Performance-period upkeep: you must maintain ${c.credential} during performance. This is an ordinary-course performance obligation, not a pre-award bar — confirm your firm can maintain it before award.`,
    citation: `Solicitation §${c.section} — performance-period upkeep obligation`,
    excerpt: c.obligation,                                           // verbatim source span (grounded by construction)
    kind: "other",
    controllability: "bidder_controls",                             // gate-to-clear (confirm you can maintain) — NEVER a bar
    grounded: true,
    lens: "performance-upkeep-caveat",
    severity: "P2",
    curableInWindow: true,
    cautionFloor: true,                                             // floors verdict to BID_WITH_CAUTION minimum; never NHR/NO_BID, never a show-stopper
  }));
  console.log(`[decide] performance-upkeep caveat: surfaced ${emitted.length} ordinary-course upkeep recital(s) as BID_WITH_CAUTION caveat (demoted off NHR; additive)`);
  return [...findings, ...emitted];
}

// ── FINDING-DEDUP GATE (Phase 3 Unit 6, flag AUDIT_FINDING_DEDUP default-OFF) ─────────────────────────────
// The agentic panel concatenates TWO expert passes (a snake_case fleet — `pricing_analyst`, `contracts_attorney`, … —
// and a Title-Case fleet — `Pricing & Contracts Risk Analyst`, `Proposal Compliance Manager`, …), so the SAME regulatory
// clause is surfaced two/three times by the equivalent lens of each pass. On the seq-2 dccce793 record that is 93 finding
// ROWS for ~35 distinct concerns — e.g. FAR 52.217-8 (Option to Extend) appears 3× as {P0, P2, untyped}; FAR 52.219-33
// (Nonmanufacturer Rule) appears 3× as {P2, untyped, bidder_cannot_move}. The inflated grid buries the real signal and, in
// the 52.219-33 case, SPLITS a single logical bar across a typed row and two untyped rows. This gate COLLAPSES same-clause
// rows into ONE, keeping the MOST-CONSERVATIVE disposition of the group (never softens; never drops a bar).
//
// VERDICT-SAFE BY CONSTRUCTION: the survivor's controllability = the most disqualifying in the group, severity = the group
// MAX, curableInWindow = the least curable among bar-class members, cautionFloor = OR, grounded = OR. So the show-stopper
// SET is preserved (a bar member ⇒ a bar survivor) and `logicalShowStopperCount` (card-53, clusters by object-id downstream)
// is unchanged — deriveVerdict reaches the same pole on the deduped set as on the full set (a HARD-TESTED invariant).
// OVER-MERGE is the cardinal sin (collapsing two genuinely DISTINCT obligations that merely share a clause number → a real
// concern vanishes from the grid). Guards: (1) only findings naming EXACTLY ONE distinct clause number merge (0 or ≥2 →
// left standalone, fail-toward-keep — a multi-clause finding is never absorbed); (2) the clause key is read from
// `citation`+`requirement` ONLY (NOT `excerpt`, which quotes neighbouring clauses → false-merge risk); (3) the survivor
// PRESERVES every distinct requirement facet (a member requirement that is not a near-restatement of the accumulated text
// is appended with " · "), so a same-clause-but-different-obligation pair keeps BOTH statements visible under one row.
// Idempotent (a merged survivor still has 1 clause key; singleton groups pass through). Flag OFF ⇒ byte-identical (Rule 61).
//
// SCOPE (Brain Gate-1): merge is keyed on the FAR/DFARS clause number only — the stable, unambiguous "same regulatory
// object" signal ([[feedback_token_substring_collision_doctrine]]: a DELIMITED clause token, not a loose keyword). Findings
// with NO clause number (capture/PP/technical prose) are DELIBERATELY out of scope — a text-similarity merge across the two
// paraphrasing panels is the over-merge treadmill (the panels phrase the same concern differently, so text similarity both
// misses real dups AND risks fusing distinct concerns). Under-merge (leaving a non-clause dup) is the safe direction.
// R2 REMEDIATION (Gauntlet R1, P2 — false clause key from a phone-number collision). The prior `\d{3}\.\d{3}-\d{1,4}`
// numeric shape matched a phone number ("252.555-1212") → fused an unrelated bar into a benign row. Every real FAR/DFARS/
// agency-supplement CLAUSE lives in SUBPART .2 (FAR 52.2xx, DFARS 252.2xx, GSAR 552.2xx, VAAR 852.2xx, …) — the subpart
// digit after the prefix dot is ALWAYS "2". Requiring `.2\d\d` keeps every real clause (all `.2xx` on the live record) and
// rejects a phone exchange like `.555` ([[feedback_token_substring_collision_doctrine]]: a token's numeric SHAPE ≠ its
// meaning; anchor on the stable structural fact). A residual `.2xx`-exchange phone is a P3 contrived edge (needs a phone in
// a citation/requirement field colliding with a real same-clause group) — under-key is the safe direction.
// R2 REMEDIATION (Gauntlet R2, P3-1): `.2\d{2}` blanket-missed the DFARS subpart-`.70` family (252.7003-1 …) — real clauses,
// recall loss. Widen the subpart anchor to `.2xx` OR `.7xxx` (the two shapes real FAR/DFARS/agency clauses take), which still
// rejects a 3-digit phone exchange (`.555`) — the P2 collision guard holds.
const FD_CLAUSE_RE = /\b(?:2?52|\d{3,4})\.(?:2\d{2}|7\d{3})-\d{1,4}\b/g;   // FAR 52.2xx-x / DFARS 252.2xx-xxxx + 252.70xx-x / agency-supp NNN.(2xx|7xxx)-x; -\d suffix excludes CFR "121.406(b)"
const FD_SEV_RANK: Record<string, number> = { P0: 3, P1: 2, P2: 1 };
const fdSevRank = (s?: string): number => (s ? (FD_SEV_RANK[s] ?? 0) : 0);
/** The distinct FAR/DFARS clause numbers a finding is ABOUT (citation + requirement only — never the source-quote excerpt). */
const fdClauseKeys = (f: TypedFinding): string[] => {
  const blob = `${f.citation ?? ""} ${f.requirement ?? ""}`;
  return [...new Set(blob.match(FD_CLAUSE_RE) ?? [])];
};
// R2 REMEDIATION (Gauntlet R1, P0/P1/P3 — `{...primary}` stripped verdict-load-bearing markers off ABSORBED non-primary
// members, flipping a verified NO_BID → NHR and dropping a distinct requiredAttribute). ROOT: deriveVerdict reads markers
// (`universalDefect`/`verifiedBy`/`requiredAttribute`/`nmrGuard`/`mmEvidenceFactor`/…) that can live on a non-primary member;
// the merge only re-derived the disposition ladder. FIX (ALLOW-LIST, not a marker block-list — [[feedback_no_blocklist_
// shape_allowlist_doctrine]]): a finding may be ABSORBED (dropped into a survivor) ONLY if EVERY key it carries is in the
// KNOWN-SAFE disposition set the merge provably preserves. ANY special marker / attribute (present OR future) ⇒ the finding
// is PROTECTED — it passes through UNTOUCHED (its full verdict weight reaches deriveVerdict), exactly the gate's existing
// "multi-clause never absorbed" conservatism. Fail-safe by default: a new marker not in this set makes its finding protected,
// never silently dropped.
export const FD_ABSORBABLE_KEYS = new Set<string>([
  "id", "requirement", "citation", "excerpt", "kind", "controllability", "grounded", "lens", "severity",
  "curableInWindow", "cautionFloor", "unverified", "documentProvenance", "locatedAt", "contextNote",
  // checkboxCorrected — card #609-(2) dedup normalization: a VERDICT-INERT render/telemetry marker (set at :1340, read
  // by NO verdict authority — deriveVerdict/disposeFinding/firmStatus/selfClearablePackageBars/killShotClass). Making it
  // absorbable lets same-clause provenance-suffixed dups (the checkbox-corrected 52.219-14 row) collapse with their
  // homogeneous siblings "irrespective of citation-provenance suffixes"; the marker is UNIONED onto the survivor below so
  // the render signal survives. The finding-dedup.test.ts structural contract FAILS if this were ever verdict-read.
  "checkboxCorrected",
]);  // NB: `requiredAttribute` is DELIBERATELY excluded — an attribute-bearing finding is verdict-load-bearing (R1 P1) → protected.
// BRAIN #555 STRUCTURAL-COMPLETENESS CONTRACT (converts the "verdict-safe" claim from inductive → structural). deriveVerdict
// is the SOLE verdict authority, so it must be the SOLE definition of "verdict-driving." The dedup is safe iff EVERY finding
// field the verdict authority reads — deriveVerdict/disposeFinding/firmStatus/nmrFirmStatus AND the deriveVerdict-CALLED
// package-wide recognizer selfClearablePackageBars (card #590, added to the guard's scanned set after cross-fleet R3) — is
// either (a) MERGE-PRESERVED (the survivor re-derives it from ALL members, so an absorbed member never loses it), (b)
// PROTECTION-TRIGGERING (∉ FD_ABSORBABLE_KEYS ⇒ its bearer is a PROTECTED finding, never absorbed/altered), or (c) documented
// VERDICT-INERT on the ABSORBABLE class. The structural guard test (`finding-dedup.test.ts`) FAILS if any verdict-read field
// is none of these. NB (DISPOSITION-HOMOGENEOUS pivot, card #604 ruling): `controllability`+`kind` are the GROUP KEY — every
// member of a collapsed group shares them and the survivor is a REAL member, so they are preserved by IDENTITY (never
// synthesized — the R1 kind ride-along and R3 kind×ctrl composite are impossible by construction).
export const FD_MERGE_PRESERVED_FIELDS = new Set<string>([
  "controllability",  // GROUP KEY — identical across the group; survivor is a real member (preserved by identity)
  "kind",             // GROUP KEY — identical across the group; survivor is a real member (never a synthesized composite)
  "severity",         // survivor = group max
  "cautionFloor",     // OR across members, STRICT === true (no off-domain-truthy laundering)
  "grounded",         // OR across members, STRICT === true
  "requirement",      // normalized-exact facet union (no distinct obligation text/meaning lost)
  "excerpt",          // UNION across members (card #590 selfClearablePackageBars scans excerpts PACKAGE-WIDE ⇒ no member's excerpt may be dropped)
]);
export const FD_VERDICT_INERT_ON_PLAINS = new Set<string>([
  // the verdict authority reads these, but they are inert for an ABSORBABLE (ctrl ∈ {bidder_controls, already_satisfied},
  // marker-free, attribute-free) finding:
  "curableInWindow",  // read only on a DISQUALIFYING finding (selfClearablePackageBars) / a BAR — an absorbable finding is neither by construction
  "citation",         // read only in reason-string assembly for bars/defects — inert on a plain finding's disposition
]);
// ── DISPOSITION-HOMOGENEOUS COLLAPSE CORE (Brain card #604 ruling — supersedes the 44c6f44 survivor-synthesis) ──────────
// The prior gate SYNTHESIZED a "most-conservative" survivor (worst ctrl → most-decision-bearing kind → sev-max). The
// cross-fleet Gauntlet R1–R3 proved that synthesis is a reconstruction treadmill against an evolving deriveVerdict:
//   R1 a boilerplate kind rides onto the survivor → disposeFinding drops it → BID→NHR;
//   R2 an off-enum/undefined controllability (blind-cast model output) is fail-closed to a show-stopper by disposeFinding
//      but is not a bar per isBarClass → absorbed → its escalation vanishes → NHR→BID;
//   R3 card #590 selfClearablePackageBars reads kind×ctrl JOINTLY + scans excerpts PACKAGE-WIDE → a synthesized composite /
//      a dropped excerpt flips the verdict. [[feedback_reconstruction_treadmill_pivot_recognizer]].
// THE PIVOT (positive invariant, ends the treadmill): NEVER synthesize a disposition. A group collapses only if
// DISPOSITION-HOMOGENEOUS — identical kind AND controllability, with controllability in the KNOWN-SAFE, non-escalating set
// {bidder_controls, already_satisfied} — so the survivor's (kind×ctrl) is a REAL member's pair (no composite manufactured),
// off-enum/undefined ctrl is NEVER absorbed (protected passthrough, R2 kill), and boilerplate never rides onto a decision-
// bearing survivor (R1 kill — the survivor IS a boilerplate member iff every member is boilerplate, matching flag-OFF). The
// survivor is a whole real member; severity=max; cautionFloor/grounded OR over STRICT === true (no off-domain-truthy
// laundering); EXCERPTS unioned (card #590 package-wide scan loses nothing); facets de-duped by NORMALIZED-EXACT equality
// (negation / ≤ / ≥ / ± / unicode distinguishers always kept). Verdict-invariant BY CONSTRUCTION — proven by the structural-
// completeness contract (now covering selfClearablePackageBars) AND a 2×3888 sweep under both AUDIT_SELF_CLEARABLE_PACKAGE
// states. Shared by applyFindingDedup (anchor = clause number) and applyCrossFleetDedup (anchor = calendar date).
const FD_ABSORBABLE_CTRL = new Set<string>(["bidder_controls", "already_satisfied"]);  // known-safe, non-escalating; anything else (bar/off-enum/undefined) → protected
const fdHomoAbsorbable = (f: TypedFinding): boolean =>
  FD_ABSORBABLE_CTRL.has(f.controllability as string) && Object.keys(f).every((k) => FD_ABSORBABLE_KEYS.has(k));
const fdNormReqEq = (s: string): string => (s || "").toLowerCase().replace(/\s+/g, " ").trim();  // normalized-exact key: only a verbatim dup drops
/** Collapse DISPOSITION-HOMOGENEOUS absorbable findings sharing anchorOf(f) (non-null) into one REAL-member survivor.
 *  Returns null ⇒ no eligible group ⇒ caller returns the input by reference (byte-identical). Pure. Order-stable (survivor =
 *  earliest member). markerOf attaches the gate-specific telemetry (findingDedupMerged/mergedClause · crossFleetMerged/mergedDateSig). */
function collapseHomogeneousByAnchor(
  findings: TypedFinding[],
  anchorOf: (f: TypedFinding) => string | null,
  markerOf: (members: TypedFinding[], sig: string) => Partial<TypedFinding>,
): TypedFinding[] | null {
  const groupByKey = new Map<string, number[]>();                   // (anchor, kind, ctrl) → member indices — homogeneous groups only
  const sigOf = new Map<number, string>();
  findings.forEach((f, i) => {
    if (!fdHomoAbsorbable(f)) return;                               // protected (bar / marker / attr / off-enum-ctrl) never groups
    const a = anchorOf(f); if (a == null) return;                  // no anchor ⇒ never merges (fail-toward-keep)
    sigOf.set(i, a);
    const key = `${a}\x00${f.kind ?? ""}\x00${f.controllability}`;
    (groupByKey.get(key) ?? groupByKey.set(key, []).get(key)!).push(i);
  });
  const merged = new Set<number>();
  const survivorPatch = new Map<number, TypedFinding>();
  for (const [, idx] of groupByKey) {
    if (idx.length < 2) continue;                                  // <2 homogeneous dups on this (anchor,kind,ctrl) → nothing to collapse
    const members = idx.map((i) => findings[i]);
    const anchor = Math.min(...idx);                               // survivor = the earliest member, WHOLE (real disposition, never synthesized)
    const base = findings[anchor];
    const maxSev = members.reduce((m, f) => Math.max(m, fdSevRank(f.severity)), 0);
    const survivorSeverity = (["P2", "P1", "P0"][maxSev - 1] as "P0" | "P1" | "P2" | undefined) ?? base.severity;
    const facets: string[] = []; const seen = new Set<string>();   // normalized-exact facet dedup (only a verbatim dup drops)
    for (const m of members) { const r = m.requirement ?? ""; const n = fdNormReqEq(r); if (r && !seen.has(n)) { seen.add(n); facets.push(r); } }
    facets.sort((a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0));
    const excerpts: string[] = []; const seenX = new Set<string>();  // UNION excerpts — a package-wide credential scan must see all of them
    for (const m of members) { const x = m.excerpt ?? ""; const n = fdNormReqEq(x); if (x && !seenX.has(n)) { seenX.add(n); excerpts.push(x); } }
    const survivor: TypedFinding = {
      ...base,                                                     // WHOLE real disposition — kind & ctrl are the group's shared, unsynthesized values
      requirement: facets.length ? facets.join(" · ") : (base.requirement ?? ""),
      ...(excerpts.length ? { excerpt: excerpts.join(" · ") } : {}),
      severity: survivorSeverity,
      ...(members.some((f) => f.grounded === true) ? { grounded: true } : { grounded: base.grounded }),
      ...(members.some((f) => f.cautionFloor === true) ? { cautionFloor: true } : {}),  // STRICT === true — no off-domain-truthy laundering
      ...(members.some((f) => (f as { checkboxCorrected?: boolean }).checkboxCorrected === true) ? { checkboxCorrected: true } : {}),  // card #609-(2) — verdict-inert render marker UNIONED onto the survivor (strict === true)
      ...markerOf(members, sigOf.get(anchor)!),
    };
    survivorPatch.set(anchor, survivor);
    idx.filter((i) => i !== anchor).forEach((i) => merged.add(i));
  }
  if (survivorPatch.size === 0) return null;
  return findings.map((f, i) => survivorPatch.get(i) ?? f).filter((_, i) => !merged.has(i));
}
/** Collapse DISPOSITION-HOMOGENEOUS findings that name the SAME single FAR/DFARS clause into one real-member, facet-
 *  preserving row (card #604 pivot — supersedes 44c6f44 synthesis). Verdict-safe by construction (no disposition synthesized;
 *  off-enum ctrl never absorbed; excerpts unioned). Default-OFF via caller; no eligible group ⇒ byte-identical. Order-stable. */
export function applyFindingDedup(
  findings: TypedFinding[],
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                              // Rule 61 default-off ⇒ byte-identical
  // Anchor = the finding's SINGLE FAR/DFARS clause number; 0 or ≥2 clauses ⇒ null ⇒ never absorbs (fail-toward-keep — a
  // multi-clause finding is never merged). Homogeneity (same kind+ctrl) + protection is enforced by the shared core.
  const out = collapseHomogeneousByAnchor(
    findings,
    (f) => { const k = fdClauseKeys(f); return k.length === 1 ? k[0] : null; },
    (members, clause) => ({ findingDedupMerged: true, mergedLensCount: members.length, mergedClause: clause }),
  );
  if (!out) return findings;
  console.log(`[decide] finding-dedup: collapsed ${findings.length} → ${out.length} rows (same-clause disposition-homogeneous groups; real-member survivor, excerpt-unioned, verdict-safe, facets preserved)`);
  return out;
}

// ── CROSS-FLEET DEADLINE-DEDUP GATE (Phase 3 Unit 6 follow-on, flag AUDIT_CROSS_FLEET_DEDUP default-OFF) ─────
// SIBLING of applyFindingDedup, running immediately after it. The clause-keyed gate collapses same-CLAUSE dups; this
// gate collapses the OTHER cross-fleet inflation source — no-clause obligations restated by the paired lens of the two
// paraphrasing panels (snake_case `pricing_analyst`… + Title-Case `Pricing & Contracts Risk Analyst`…). On the seq-2
// dccce793 record the single deadline "submit offer by July 22, 2026" surfaces 5× and "questions due July 14, 2026" 2×,
// each phrased differently by every lens (no clause number ⇒ the clause gate can't touch them). This gate keys on the
// STRUCTURED CALENDAR DATE — a specific solicitation date is overwhelmingly a single deadline obligation, and the stable,
// delimited "same obligation" signal for the no-clause axis (the date analogue of the clause number). Same-date plain rows
// collapse into ONE facet-preserving row.
//
// WHY DATE-ONLY (the doctrine-clean scope — [[feedback_no_blocklist_shape_allowlist_doctrine]] + the over-merge treadmill):
//   • A calendar DATE is a specific, structural, low-frequency anchor: distinct deadlines carry distinct dates ⇒ distinct
//     keys ⇒ no cross-deadline merge. It is the ONE no-clause anchor that reliably maps to a single obligation.
//   • MONEY / QUANTITY anchors are DELIBERATELY excluded: they are cited FACTS, not obligation identities — a wage rate
//     "$25.27" recurs across three DISTINCT pricing findings (floor-compliance, thin-margin risk, unresolved-fringe), so a
//     money key would FUSE distinct concerns. There is no exact/subset key that separates "same obligation, reworded" from
//     "distinct obligations, shared fact" (content-token overlap gives no clean threshold — that IS the paraphrase treadmill
//     the prior arc correctly refused). Date is the safe subset; the prose residual (price-list / FFP / tradeoff clusters,
//     no structured anchor) is an UPSTREAM problem (two paraphrasing fleets), not a downstream gate — see the exit card.
//
// VERDICT-SAFE BY A STRICTER CONSTRUCTION THAN applyFindingDedup (this gate is SELF-CONTAINED — it does NOT reuse the clause
// gate's survivor synthesis, which the cross-fleet Gauntlet R1–R3 proved is a reconstruction treadmill against an EVOLVING
// deriveVerdict). Three seams the naive "synthesize a most-conservative survivor" approach reopened one axis at a time:
//   R1 (kind): a ctrl-first `worst`-sort drags a `boilerplate` kind onto the survivor → disposeFinding drops it → BID→NHR.
//   R2 (ctrl): an off-enum/undefined controllability (blind-cast model output) is fail-closed to a show-stopper by
//              disposeFinding but is not a bar per isBarClass → absorbed → its escalation vanishes → NHR→BID.
//   R3 (composite + excerpt): card #590 `selfClearablePackageBars` (live under AUDIT_SELF_CLEARABLE_PACKAGE) reads kind×ctrl
//              JOINTLY and scans excerpts PACKAGE-WIDE — so a survivor whose kind and ctrl come from DIFFERENT members
//              manufactures a (kind×ctrl) pair that existed on no member, and absorbing a member DROPS its credential excerpt
//              → 270/3888 verdict flips. [[feedback_reconstruction_treadmill_pivot_recognizer]].
// THE PIVOT (positive invariant, ends the treadmill BY CONSTRUCTION): NEVER SYNTHESIZE a disposition. A group collapses only
// if its members are DISPOSITION-HOMOGENEOUS — identical `kind` AND identical `controllability` (both in the KNOWN-SAFE,
// non-escalating set {bidder_controls, already_satisfied}) — so the survivor's (kind×ctrl) is a REAL member's pair, present
// before and after (no composite manufactured; a package-wide kind×ctrl read is unchanged, its count merely N→1). Every
// member excerpt is UNIONED onto the survivor (no package-wide excerpt-scan input lost). severity=max, cautionFloor=OR over
// STRICT `=== true` (an off-domain truthy value is never laundered into a verdict-live floor), grounded=OR-strict. Requirement
// facets are de-duplicated by NORMALIZED-EXACT equality only (case/whitespace-insensitive, all other chars preserved) so a
// negation / ≤ / ≥ / ± / unicode distinguisher is ALWAYS kept — no obligation text or meaning lost. Protected passthrough for
// every bar / marker / attribute-bearer / off-enum-ctrl / mismatched-disposition finding. Flag OFF ⇒ byte-identical (Rule 61).
// Idempotent (a merged survivor still yields the same date+kind+ctrl key; singletons pass through). Order-stable.
const CFD_MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
const CFD_MONTH_NUM: Record<string, string> = {
  january:"01",jan:"01",february:"02",feb:"02",march:"03",mar:"03",april:"04",apr:"04",may:"05",june:"06",jun:"06",
  july:"07",jul:"07",august:"08",aug:"08",september:"09",sept:"09",sep:"09",october:"10",oct:"10",november:"11",nov:"11",december:"12",dec:"12",
};
// Four full, year-bearing calendar-date shapes (delimited-token, not a bare "22" or "2026"): month-first "July 22, 2026" /
// "Jul 22 2026", DoD day-first "22 July 2026" (R-CF attack-6 recall fix), and numeric "7/22/2026" / "07-22-2026". A
// year-less or bare month/day phrase is NOT an anchor (fail-toward-keep). Capture groups: [1..3]=monFirst mon,day,year;
// [4..6]=dayFirst day,mon,year; [7..9]=numeric m,d,year.
const CFD_DATE_RE = new RegExp(
  `\\b(?:(${CFD_MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})` +
  `|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${CFD_MONTHS})\\.?,?\\s+(\\d{4})` +
  `|(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4}))\\b`, "gi");
// Only a REAL calendar date is an anchor: month 1-12, day 1-31 (R-CF attack-5 — reject "13/13/2026" and other bogus keys).
const cfdValid = (y: string, mo: number, d: number): string | null =>
  (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
/** The distinct normalized calendar dates (YYYY-MM-DD) a finding names in its REQUIREMENT ONLY. R-CF attack-4: citation is
 *  DELIBERATELY excluded — a citation carries document-metadata dates (amendment-issuance "Amendment 0002, dated 07/15/2026")
 *  that are NOT deadlines, so keying on them fuses unrelated obligations; the actual deadline is stated in the requirement.
 *  Excerpt is excluded for the same reason the clause gate excludes it (quotes neighbouring dates). Empty ⇒ never merges. */
const cfdDateKeys = (f: TypedFinding): string[] => {
  const out = new Set<string>();
  for (const m of (f.requirement ?? "").matchAll(CFD_DATE_RE)) {
    let k: string | null = null;
    if (m[1]) k = cfdValid(m[3], Number(CFD_MONTH_NUM[m[1].toLowerCase()]), Number(m[2]));            // month-first
    else if (m[5]) k = cfdValid(m[6], Number(CFD_MONTH_NUM[m[5].toLowerCase()]), Number(m[4]));       // day-first (DoD)
    else if (m[7]) k = cfdValid(m[9], Number(m[7]), Number(m[8]));                                     // numeric m/d/y
    if (k) out.add(k);
  }
  return [...out].sort();
};
/** Collapse DISPOSITION-HOMOGENEOUS findings that name the SAME calendar date(s) into one real-member, facet-preserving row.
 *  Same shared core + verdict-safety construction as applyFindingDedup; anchor = the date signature instead of the clause.
 *  Default-OFF via caller; no eligible same-(date,kind,ctrl) group ⇒ byte-identical. Order-stable. */
export function applyCrossFleetDedup(
  findings: TypedFinding[],
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                              // Rule 61 default-off ⇒ byte-identical
  const out = collapseHomogeneousByAnchor(
    findings,
    (f) => { const k = cfdDateKeys(f); return k.length ? k.join("|") : null; },
    (members, sig) => ({ crossFleetMerged: true, mergedLensCount: members.length, mergedDateSig: sig }),
  );
  if (!out) return findings;
  console.log(`[decide] cross-fleet-dedup: collapsed ${findings.length} → ${out.length} rows (same-date disposition-homogeneous groups; real-member survivor, excerpt-unioned, verdict-safe, facets preserved)`);
  return out;
}

// ── KNOWN-CLAUSE SEMANTICS GUARD (Brain card 135 — Step 5a; verified clause→disposition map) ──────────────
// CAP-ONLY guard keyed on the finding's OWN `citation` field (Rule-64 grounded; exact clause-number match with
// digit-boundary lookarounds — NOT a fullSource keyword scan, which would be the surface-keyword trap). For a
// SMALL set of clauses whose legal meaning is SETTLED (a clause-level fact, not a solicitation-specific
// adjudication), a lens that mis-types the clause as a bar/eligibility show-stopper is corrected to the clause's
// true disposition. CAPS ONLY — never elevates; acts ONLY on a finding currently typed as a bar
// (bidder_cannot_move / no_one_can_move / eligibility_bar); a finding already bidder_controls/met is untouched.
// Runs BEFORE the structural-bar whitelist so for THESE verified clauses the precise map is AUTHORITATIVE over
// the whitelist's generic fail-safe. Exact-match discipline: 52.204-7 ≠ 52.204-8/-13; 52.246-15 ≠ 52.246-2/-23;
// 252.204-7xxx (DFARS) never matches. Map structured to EXTEND later (new entries gate on the same verification
// bar). Flag-gated; default OFF (Rule 61) ⇒ findings unchanged byte-for-byte.
//
// VERIFIED ENTRIES (exactly two):
//   52.204-7  System for Award Management — a CURABLE administrative prerequisite (any firm can register in SAM);
//             never an eligibility bar → bidder_controls + curable caution ("confirm active SAM registration…").
//   52.246-15 Certificate of Conformance — a quality/inspection ACCEPTANCE mechanism (FAR 46.315 / 46.504),
//             contractor-favorable, NOT a proposal/eligibility gate → cleared to a NON-BLOCKING bidder_controls.
// A finding that currently BLOCKS — i.e. disposeFinding(f) === "disqualifying". Keyed on controllability ONLY:
// kind "eligibility_bar" is NOT sufficient, because an eligibility_bar that is already_satisfied (met) or
// bidder_controls (gate-to-clear) is NOT a bar — capping it would downgrade a clean verdict (cap-only violation).
const clauseIsBar = (f: TypedFinding): boolean =>
  f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move";
const CLAUSE_SEMANTICS: ReadonlyArray<{ re: RegExp; apply: (f: TypedFinding) => TypedFinding }> = [
  { re: /(?<!\d)52\.204-7(?!\d)/, apply: (f) => ({
      ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, kind: "submission",
      requiredAttribute: undefined,
      requirement: /confirm active sam registration/i.test(f.requirement)
        ? f.requirement
        : `${f.requirement} — confirm active SAM registration at offer submission and at award`,
      clauseSemanticsGuard: true }) },
  { re: /(?<!\d)52\.246-15(?!\d)/, apply: (f) => ({
      ...f, controllability: "bidder_controls", curableInWindow: true, kind: "submission",
      requiredAttribute: undefined, clauseSemanticsGuard: true }) },
];
/** Re-type a bar-mis-typed known clause to its settled disposition (Brain card 135). Pure → gate-tested. CAP-ONLY
 *  (never elevates a non-bar); exact citation match only. Flag-gated; OFF (default) ⇒ findings unchanged. */
export function applyClauseSemanticsGuard(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings;                                          // Rule 61 default-off ⇒ byte-identical
  return findings.map((f): TypedFinding => {
    for (const c of CLAUSE_SEMANTICS) {
      if (!c.re.test(f.citation)) continue;
      return clauseIsBar(f) ? c.apply(f) : f;                                   // cap-only: never re-type a non-bar
    }
    return f;
  });
}

// ── ELIGIBILITY-AUTHORITY ALLOW-LIST (Brain card 329 — allow-by-authority, not a Part-25/Part-5 block-list) ──────
// Override-slot guard (same layer as the sibling over-type guards, BEFORE deriveVerdict; deriveVerdict UNTOUCHED).
// ROOT (live audit a80a9a13, /panel #329 + adversarial red-team UNANIMOUS): a lens STOCHASTICALLY over-types a
// TRADE-AGREEMENT / END-PRODUCT-ORIGIN / PUBLICIZING statement ("items are not subject to the WTO GPA/FTA, per FAR
// 5.101(4)(iii)") as a hard bidder show-stopper (no_one_can_move) — a FABRICATED disqualifier: FAR 5.101 is
// PUBLICIZING; trade agreements are FAR Part 25.4 = END-PRODUCT ORIGIN, NOT bidder eligibility, and are VOID on a SB
// set-aside per 25.401(a)(1). A raw no_one_can_move with no verified-defect mark inflates the abstain → forces NHR
// (deriveVerdict `unmarkedUniversalClaim`). DOCTRINE (allow-list, not block-list): a hard eligibility / who-can-
// compete show-stopper is STRUCTURALLY VALID only if its cited clause sits in an ENUMERATED bidder-eligibility /
// size / set-aside AUTHORITY. Everything else is structurally ineligible for that type → re-typed off the bar path.
// HARD EXCLUSIONS (each preserves a legitimate hard-bar class the allow-list must NEVER touch — conservative, zero-
// contract-loss): (1) a VERIFIED universal defect (universalDefect/verifiedBy); (2) a TEMPORAL/delivery impossibility
// (temporal_conflict lens / fat_precondition|delivery_window sweep / temporalEvidence); (3) a GENUINE STRUCTURAL bar
// (STRUCTURAL_BAR_RE_114 / NON_SELF_CLEARABLE_BAR_RE — sole-source/QPL/QML/clearance/CMMC/TDP), whose real authority
// is FAR 6/9.2/DFARS, not FAR 19 — kept by LANGUAGE, so its citation is never required to match; (4) a POSITIVE
// socioeconomic/size SET-ASIDE (isPositiveSetAside), routed by eligibility in the award-basis guard even with a weak
// citation. POSITIVE TRIGGER: fires only on a bar that PRESENTS as a bidder-eligibility / origin / trade-agreement
// exclusion (kind eligibility_bar, OR the who-can-compete / origin vocabulary) — so a genuine unverified TECHNICAL
// universal impossibility that is NOT eligibility-framed is left to its existing NHR path, never downgraded. Re-type
// = bidder_controls + curableInWindow + cautionFloor (a visible caution → BID_WITH_CAUTION floor; never a silent
// clean BID, never a forced NHR); requiredAttribute cleared so a phantom can't pin eligibility=null. Flag-gated;
// OFF (default) ⇒ findings unchanged byte-for-byte (Rule 61). Pure → gate-tested.
// Enumerated genuine bidder-eligibility / size / set-aside authorities (the ALLOW side). Digit-boundary anchored so
// 52.219-x ≠ 52.2190, 19.x ≠ 190.x. 13 CFR 121-128 = SBA size + socioeconomic program regs. 52.204-8 / 52.212-3 =
// annual/commercial offeror reps (size + socioeconomic self-certs). 52.209 = responsibility/qualification-to-award.
// Enumerated authorities (panel-corrected, Brain card 329 review): FAR 19 (3- AND 4-digit sections + bare subpart
// 19.1x); 52.219-x AND VAAR 852.219-x (own branch — the (?<!\d) 52.219 lookbehind rejects the "852." prefix); FAR
// "part/subpart 19"; VAAR part 819; 13 CFR 121-128 incl. "Part"/"§" forms (size + socioeconomic program regs); the
// VA Veterans-First statute/reg stack (38 U.S.C. 8127/8128, 38 CFR 74 — a DISTINCT authority the SME flagged); the
// Small Business Act statute (15 U.S.C. 644/637/657); 52.204-8 / 52.212-3 (annual/commercial offeror reps);
// 52.209-x (responsibility/qualification-to-award). Digit-boundary anchored (52.219-3 ≠ 52.2190).
const ELIGIBILITY_AUTHORITY_RE = /(?<!\d)52\.219-\d{1,2}\b|(?<!\d)852\.219-\d{1,2}\b|(?<!\d)19\.\d{3,4}\b|\b19\.1[1-9]\b|\bFAR\s+(?:part\s+|subpart\s+)?19\b|\b(?:sub-?)?part\s+19\b|\bVAAR\b|\b819\.\d|13\s*C\.?F\.?R\.?\s*(?:part\s+|§\s*)?12[1-8]\b|38\s*U\.?S\.?C\.?\s*(?:§\s*)?812[78]\b|38\s*C\.?F\.?R\.?\s*(?:part\s+)?74\b|15\s*U\.?S\.?C\.?\s*(?:§\s*)?(?:644|637|657[abf])\b|(?<!\d)52\.204-8\b|(?<!\d)52\.212-3\b|(?<!\d)52\.209-\d{1,2}\b/i;
// GENUINE non-set-aside bidder-eligibility bars that isPositiveSetAside + the structural regexes do NOT catch but
// which must NEVER be softened to a caution (red-team real-bar-suppression class): export control (ITAR/EAR = a
// US-person/registration eligibility constraint) and foreign ownership/control (FOCI). Over-keeping here is the
// conservative (zero-contract-loss) direction — it can only leave a bar as a bar (→ NHR), never create a false BID.
const GENUINE_NONSETASIDE_ELIG_KEEP_RE = /export.?control|\bITAR\b|international traffic in arms|arms export|export administration regulation|\bEAR\b|\bFOCI\b|foreign ownership|foreign.?owned|foreign control|owned or controlled by a foreign/i;
// B2 (Brain card 421 Fork-2) — a genuine bidder-eligibility bar keyed to HOLDER status on an existing acquisition
// vehicle (BOA/IDIQ/BPA/GWAC/MAS/FSS/MATOC on-ramp). Holder status is an UNSTATED profile attribute: under a null /
// open-world profile it is unknown, so the bar must ROUTE TO NEEDS_HUMAN_REVIEW ("confirm holder status"), NEVER a
// silent caution (the phantom-cite demotion) and NEVER INELIGIBLE (that needs closedWorld:true — a FUTURE path). Its
// authority is the vehicle's own ordering/eligibility terms, not FAR 19, so ELIGIBILITY_AUTHORITY_RE never matches it —
// without this keep-class it falls through to the phantom demotion. Keeping is the conservative (zero-contract-loss)
// direction: it can only leave a bar as a bar (→ NHR), never create a false BID. Own flag; matches requirement+excerpt.
// BOA_IDIQ_HOLDER_BAR_RE is the SHARED contract regex (audit-site-visit-patterns.ts) — the SAME one the notice-body
// emitter uses to SURFACE the bar (card #461 B2), so the emit and this keep-class never drift.
// The POSITIVE eligibility / who-can-compete / origin trigger — the bar must PRESENT as a bidder-directed exclusion.
const ELIGIBILITY_CLAIM_RE = /\bel[ie]gib|\bineligib|\bdisqualif|\bexclud|not\s+subject\s+to|\bWTO\b|\bGPA\b|\bTAA\b|free\s+trade|trade\s+agreement|buy\s+american|\bBAA\b|(?:domestic|foreign|non-?domestic)\s+end\s+product|country\s+of\s+origin|end\s+product|reserved\s+(?:for|exclusively)|restricted\s+to|who\s+(?:can|may)\s+(?:bid|compete|offer|be\s+awarded)/i;
/** Re-type a phantom-cite hard eligibility show-stopper off the bar path (Brain card 329). Pure → gate-tested.
 *  FIRES only on a hard bar (no_one_can_move, or bidder_cannot_move+eligibility_bar) that presents as a bidder-
 *  eligibility / origin exclusion, is NOT a verified universal defect / temporal impossibility / genuine structural
 *  bar / positive set-aside, AND whose citation is NOT in the enumerated eligibility/size/set-aside authority list.
 *  Re-types → bidder_controls + curable + cautionFloor (visible caution, never silent BID, never forced NHR).
 *  Flag-gated; OFF (default) ⇒ unchanged. */
export function applyEligibilityAuthorityAllowlist(findings: TypedFinding[], opts?: { enabled?: boolean; boaIdiqKeep?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged
  return findings.map((f): TypedFinding => {
    const hardBar = f.controllability === "no_one_can_move" || (f.controllability === "bidder_cannot_move" && f.kind === "eligibility_bar");
    if (!hardBar) return f;                                                       // only hard eligibility/universal bars are candidates
    // (1) VERIFIED universal defect — evidence-backed contradictory/unmeetable terms → never touched.
    if (f.universalDefect || f.verifiedBy) return f;
    // (2) TEMPORAL / delivery impossibility (the moat's genuine universal bars) → never touched. Kept by MARKER
    //     (lens/sweep/temporalEvidence) AND, per red-team re-review, by LANGUAGE too — a lens-typed delivery/window
    //     impossibility that lacks its sweep marker must still be preserved (mirrors the structural-bar language keep).
    if (f.lens === "temporal_conflict" || f.sweepArchetype === "fat_precondition" || f.sweepArchetype === "delivery_window" || f.temporalEvidence) return f;
    const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
    if (DELIVERY_IMPOSSIBILITY_RE.test(hay) || WINDOW_CONFLICT_RE.test(hay)) return f;
    // (3) GENUINE STRUCTURAL bar (clearance/QPL/sole-source/CMMC/TDP) — kept by LANGUAGE (its authority is FAR 6/9.2/
    //     DFARS, not FAR 19), so its citation is never required to match the eligibility allow-list. Read the full hay
    //     incl. excerpt: keeping a bar is the conservative direction (sibling-guard discipline).
    if (STRUCTURAL_BAR_RE_114.test(hay) || NON_SELF_CLEARABLE_BAR_RE.test(hay)) return f;
    // (3b) GENUINE non-set-aside eligibility bar (export-control/ITAR/EAR/FOCI/foreign-ownership) — not caught by the
    //      structural regexes or isPositiveSetAside, must NEVER be softened (red-team real-bar-suppression class).
    if (GENUINE_NONSETASIDE_ELIG_KEEP_RE.test(hay)) return f;
    // (3c) B2 — BOA/IDIQ/BPA/GWAC HOLDER-STATUS eligibility bar. Its authority is the vehicle's ordering terms, not
    //      FAR 19, so ELIGIBILITY_AUTHORITY_RE never matches it → without this it would fall to the phantom demotion.
    //      Holder status is an UNSTATED profile attribute (null/open-world → unknown) → KEEP the bar so it routes to
    //      NEEDS_HUMAN_REVIEW ("confirm holder status"), never a silent caution. NEVER INELIGIBLE here (that needs
    //      closedWorld:true — a FUTURE path, not built). Sub-flag gated (boaIdiqKeep); keeping is zero-contract-loss.
    if (opts?.boaIdiqKeep && BOA_IDIQ_HOLDER_BAR_RE.test(hay)) return f;
    // (4) POSITIVE socioeconomic/size SET-ASIDE — routed by eligibility in the award-basis guard even with a weak cite.
    if (isPositiveSetAside(f)) return f;
    // (4b) GENUINE SIZE DISQUALIFICATION — isPositiveSetAside DELIBERATELY excludes size bars (SIZE_DISQUALIFICATION_RE),
    //      so without this the citation regex is a size bar's SOLE backstop → a real "other than small is ineligible /
    //      exceeds the size standard" bar could be downgraded on a citation-format technicality (SME CRITICAL). Keep it.
    if (SIZE_DISQUALIFICATION_RE.test(hay)) return f;
    // POSITIVE TRIGGER: an eligibility-framed bar. A kind==eligibility_bar bar always qualifies; otherwise the
    // who-can-compete / origin vocabulary must be present (so a genuine unverified TECHNICAL universal impossibility
    // that is NOT eligibility-framed keeps its existing NHR path). Trigger reads requirement+excerpt+attribute.
    if (f.kind !== "eligibility_bar" && !ELIGIBILITY_CLAIM_RE.test(hay)) return f;
    // VALID iff cited in a genuine eligibility/size/set-aside authority (allow-by-authority). Citation OR requirement
    // may carry the authority (a lens sometimes states "FAR 52.219-6" in the requirement, not the citation field).
    if (ELIGIBILITY_AUTHORITY_RE.test(`${f.citation ?? ""} ${f.requirement}`)) return f; // real authority → keep, route by eligibility/firmStatus
    // PHANTOM: a bidder-eligibility bar whose cite is not a recognized eligibility authority. Structurally ineligible
    // to be a show-stopper → re-type off the bar path (visible caution, never silent BID / forced NHR).
    return { ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, requiredAttribute: undefined, eligibilityAuthorityGuard: true,
      requirement: `${f.requirement} — [cited clause is not a recognized bidder-eligibility/set-aside authority (FAR 19 / 13 CFR 121-128); treated as informational, not a show-stopper — confirm]` };
  });
}

// ── STRUCTURAL-BAR WHITELIST (Brain card 114 — the general rule the per-pattern guards were special cases of) ──
// A non-curable `bidder_cannot_move` bar under a NULL (unknown) profile routes to NEEDS_HUMAN_REVIEW (step 5b).
// The lenses STOCHASTICALLY over-type bidder-RESOLVABLE compliance/representation/clarification items as such bars
// (size-standard discrepancy, OCI rep, reps&certs, registration — a long tail; per-pattern guards are whack-a-mole).
// DOCTRINE: a non-curable bar is kept ONLY if it is a recognized GENUINE structural impossibility (sole-source /
// brand-name to a named OEM · QPL/QML lead-time · unobtainable clearance/facility cert · TDP-less approved-source).
// A clearly bidder-resolvable compliance/representation item → downgrade to a caution gate. SAFETY (hard, conservative
// by construction): an UNRECOGNIZED non-curable bar (neither whitelisted-structural nor clearly compliance) is LEFT
// AS-IS (→ NEEDS_HUMAN_REVIEW) — NEVER silently downgraded to BID. Only fires under a NULL profile (a real profile →
// firmStatus governs, so #3's proven Dillon fail stays INELIGIBLE via step 3). Never touches no_one_can_move (#6's
// temporal impossibility). Flag-gated on AUDIT_STRUCTURAL_BAR_WHITELIST — DEFAULT-ON in the orchestrator
// (!== "false"): this whitelist runs on every real audit unless explicitly disabled (NOT "off by default").
// Brain card 275 RULING 2 — POSSESSION-cert bars are STRUCTURAL, never a soft caution. A credential the firm must
// HOLD at award whose lead time exceeds a typical response window is non-curable: CMMC L1/L2/L3, facility/personnel
// clearances (already covered), an Authorization To Operate (ATO), and the generic "must hold/possess/maintain a …
// certification/accreditation". These are KEPT (→ NEEDS_HUMAN_REVIEW), never downgraded to BID_WITH_CAUTION.
const STRUCTURAL_BAR_RE_114 = /sole.?source|brand.?name|named (?:oem|manufacturer|source|dealer)|single (?:source|approved|authorized)|\bQPL\b|\bQML\b|qualified products? list|qualified manufacturers? list|approved (?:source|manufactur)|technical data package|\bTDP\b|no substitut|proprietary|(?:security|secret|top[-\s]?secret|personnel|interim|active|dod)\b[^.\n]{0,25}?clearance|\bTS\/SCI\b|\bpolygraph\b|facility (?:clearance|certification|security)|unobtainable|\bcmmc\b|cybersecurity maturity model|cmmc\s*(?:level|lvl|l)?\s*[123]\b|authorization to operate|\bATO\b|(?:hold|holds|holding|possess(?:es|ing)?|maintain(?:s|ing)?|obtain(?:s|ed|ing)?|current|active|valid)\b[^.\n]{0,40}?(?:certification|accreditation|accredited|certified)|(?:certification|accreditation)\b[^.\n]{0,25}?(?:at (?:time of )?award|prior to award|required at award|by award)/i;
// Brain card 275 RULING 2 — only REPRESENTATION FILINGS (a self-cert the firm EXECUTES) may soften to caution; a
// possession credential (matched structural above) may not. Bare "certif"/"registration" REMOVED — they conflated
// "file a representation" with "hold this credential". Softenable set = reps&certs, self-certs, SAM registration,
// size/NAICS reps, OCI/responsibility reps, socioeconomic self-certs (which the set-aside path also handles).
const COMPLIANCE_REP_RE = /size standard|small business size|\bNAICS\b|52\.204-8|organizational conflict|conflict of interest|\bOCI\b|reps? (?:and|&) certs?|representations? and certifications?|annual representations|online representations|\bSAM\b(?:\.gov)? registration|register(?:ed)? in \bSAM\b|set.?aside|8\(a\)|hubzone|sdvosb|wosb|self.?cert|inverted domestic|telecom|covered telecommunications|52\.209|responsib/i;

/** Generalize the over-type guards (Brain card 114): a non-curable bidder_cannot_move bar under a NULL profile is kept
 *  only if it is a recognized structural impossibility; a clearly compliance/representation item → caution; an
 *  unrecognized one is LEFT (→ human review), never silently BID. Pure → gate-tested. Flag-gated; OFF ⇒ unchanged. */
export function applyStructuralBarWhitelist(findings: TypedFinding[], profile: BidderProfile | null, opts?: { enabled?: boolean }): TypedFinding[] {
  // Apply under a NULL profile OR an OPEN-WORLD (self-asserted) profile — both are
  // mostly-unknown, so the over-type whitelist must still fire (panel B-3: a firm with a
  // capability statement must not bypass this protection). Skip ONLY for a CLOSED-WORLD
  // (trusted/complete) profile, where firmStatus genuinely governs.
  if (!opts?.enabled || (profile !== null && profile.closedWorld)) return findings;
  return findings.map((f) => {
    if (f.controllability !== "bidder_cannot_move" || f.curableInWindow !== false) return f; // only non-curable bars
    const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
    if (STRUCTURAL_BAR_RE_114.test(hay)) return f;                                            // genuine structural impossibility → KEEP (excerpt OK: keeping a bar is conservative)
    // DOWNGRADE triggers on the REQUIREMENT only (same altitude as the award-basis guard): an
    // uncontrolled excerpt that merely quotes NAICS/registration/set-aside text must not soften a
    // genuine non-curable bar. A bar the lens itself characterized as compliance/representation → caution.
    if (COMPLIANCE_REP_RE.test(f.requirement)) return { ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, structuralWhitelistGuard: true }; // bidder-resolvable → caution
    return f;                                                                                 // SAFETY: unrecognized → leave (→ human review), never silently BID
  });
}

// ── INQUIRY-DEADLINE BENIGN GUARD (Brain card 520, R1) ────────────────────────────────────────────────
// A lens types an information-exchange milestone (a questions/inquiries/RFI-submission window or a Q&A
// answer-posting date) as no_one_can_move — reading "questions can no longer be submitted" as a universal
// impossibility. But an information-exchange deadline is a ROUTINE SCHEDULE FACT: it does NOT gate offer
// submission or award eligibility (the RESPONSE/quote deadline is the bar, not the Q&A window). Left un-typed
// it lands in Fork-2's unmarkedUniversalClaim → a false NEEDS_HUMAN_REVIEW (live driver, seq-1 run 5d0477e7).
// SHAPE ALLOWLIST (Rule 61, default OFF): demote a positively information-exchange-shaped no_one_can_move
// finding → bidder_controls (informational; NOT even a caution — a passed Q&A window has nothing to cure).
//
// HARD BOUNDARY (Brain R1) — a PARTICIPATION-PREREQUISITE deadline is NOT benign: a mandatory site visit /
// pre-proposal conference registration, a vehicle/BOA/IDIQ/GWAC enrollment or on-ramp/open-season window, or
// ANY milestone whose lapse gates offer submission or award eligibility STAYS a universal-path candidate. Any
// such signal (or a genuine structural-bar token, or an offer/quote/proposal/response submission deadline)
// VETOES the demotion → the finding is left exactly as typed (→ escalation). Shape/position ONLY; NO vocab
// blocklist is the demotion basis (the demotion rests on the POSITIVE information-exchange shape; the veto only
// ever keeps MORE in the universal path). Ambiguity → ESCALATE (never demote on doubt). State applies
// regardless of open/closed/pending — a passed, active, or future Q&A window is equally benign.
//
// POSITIVE information-exchange SHAPE — an inquiry/RFI/Q&A subject bound to a submission-or-posting event.
// Position-checked (info-exchange noun within a short window of a schedule verb) so a §M "answer the following
// technical questions in your proposal" (a proposal-content gate, not a milestone) does NOT match.
const INQUIRY_MILESTONE_RE = /\b(?:questions?|inquir(?:y|ies)|requests?\s+for\s+information|\bRFIs?\b|clarification\s+questions?|q\s*&\s*a|q\s*and\s*a)\b[^.\n]{0,70}?\b(?:due|submit(?:ted|tal)?|deadline|no\s+later\s+than|by\b|cut[-\s]?off|received|accepted|posted|provided|answered|response\s+(?:date|deadline)|closing)\b/i;
const INQUIRY_ANSWER_RE = /\b(?:answers?|responses?)\b[^.\n]{0,40}?\bto\b[^.\n]{0,25}?\b(?:questions?|inquir(?:y|ies)|\bRFIs?\b)\b/i;
// VETO — the CONSEQUENCE-SHAPE test (card 520 R1, adversarial-hardened round 1). A genuinely benign inquiry
// milestone is a BARE SCHEDULE FACT — a Q&A date and nothing else. Every smuggler the red-team produced is a
// real bar (mandatory site-visit/conference attendance, IDIQ/BOA enrollment, a hard credential, a real quote
// deadline) that ATTACHES a consequence to inquiry-milestone wording. So the veto does NOT chase bar-VOCAB
// synonyms (the blocklist treadmill the doctrine forbids as a release basis); it fires whenever the finding
// asserts ANY CONSEQUENCE BEYOND a schedule fact — a participation/attendance/access event, an eligibility
// consequence, a prerequisite/condition, or an OFFER-submission condition/deadline. Bare category tokens need
// no proximity, so a period/newline split cannot separate a trigger from its object. Matched on the FULL hay.
// The demotion still rests on the POSITIVE inquiry shape; this veto only ever keeps MORE in the universal path
// (fails toward escalation). Ambiguity → ESCALATE.
const PARTICIPATION_PREREQ_RE = new RegExp([
  // ── participation / attendance / access events + enrollment (bare — presence anywhere vetoes) ──
  "site\\s+(?:visit|tour|inspection|walk|meeting)", "job\\s?walk", "walk[-\\s]?(?:through|down)", "walkdown",
  "(?:facility|plant|project)\\s+(?:tour|visit)", "\\borientation\\b", "teleconference", "roll\\s+call", "on[-\\s]?site", "in[-\\s]?person",
  "pre[-\\s]?(?:proposal|bid|award|quote|solicitation)\\s+(?:conference|meeting|briefing|session)",
  "\\bpre[-\\s]?bid\\b", "\\bconference\\b", "\\bwebinar\\b", "\\bbriefing\\b", "information\\s+session", "industry\\s+day",
  "\\bBOA\\b", "basic\\s+ordering\\s+agreement", "\\bIDIQ\\b", "\\bGWAC\\b", "\\bBPA\\b", "on[-\\s]?ramp", "open\\s+season",
  "(?:vehicle|schedule|contract)\\s+(?:enroll|eligib|on[-\\s]?ramp)",
  "\\battend(?:ance|ed|ing|ee)?\\b", "must\\s+be\\s+present", "\\bpresent\\s+(?:at|for|during|on|in\\s+person)", "expected\\s+to\\s+(?:attend|be\\s+present)",
  "\\bparticipat", "\\bRSVP\\b", "regist(?:er|ration|ered)", "enroll(?:ment|ed)?",
  "sign[-\\s]?up", "sign[-\\s]?in", "check[-\\s]?in", "\\bonboard", "credential", "\\bbadge\\b", "\\broster\\b", "accredit", "access\\s+(?:is\\s+)?(?:grant|restrict|limit)",
  // ── eligibility consequence (bare) ──
  "eligib", "ineligib", "disqualif", "\\bforfeit", "exclud(?:e|ed|ing)", "not\\s+be\\s+(?:considered|evaluated|eligible|permitted|accepted)", "\\breject",
  // ── prerequisite / condition (bare) ──
  "prerequisite", "precondition", "contingent", "condition(?:ed|al)?\\s+(?:on|upon|of|to)", "required\\s+(?:to|before|prior|for)",
  "must\\s+(?:first|have\\s+(?:attended|participated|registered|completed|submitted))",
  // ── the OFFER INSTRUMENT named as a noun (a pure Q&A milestone never mentions 'the offer/quote/proposal/bid';
  //    when it does — e.g. an RFI whose response CONSTITUTES the offer — the milestone is really an offer
  //    deadline in disguise → ambiguous → escalate). 'bidders' is not matched (\bbid\b needs a word boundary). ──
  "\\b(?:offers?|quotes?|proposals?|bids?)\\b",
  // ── real OFFER-submission condition / deadline (offer NOUN required, so 'questions must be submitted' never trips) ──
  "\\b(?:offers?|quotes?|proposals?|bids?)\\b[^.\\n]{0,40}?\\b(?:due|deadline|no\\s+later|received|closing|cut[-\\s]?off|accepted|considered|shall\\s+be\\s+submitted|will\\s+be\\s+accepted)\\b",
  "\\b(?:due|deadline|closing|cut[-\\s]?off)\\b[^.\\n]{0,40}?\\b(?:offers?|quotes?|proposals?|bids?)\\b",
  // ── 'only [firms/those who …] may submit/propose/be considered/eligible' access gate ──
  "\\bonly\\b[^.\\n]{0,70}?\\b(?:may|shall|will|can|are\\s+(?:eligible|permitted))\\b[^.\\n]{0,25}?\\b(?:submit|propose|offer|bid|quote|compete|participat|considered|evaluated|accepted|eligible)",
  "\\bonly\\b[^.\\n]{0,55}?\\b(?:firms?|offerors?|vendors?|contractors?|bidders?|those|attendees?)\\b[^.\\n]{0,45}?\\b(?:may|eligible|permitted|considered|evaluated)",
].join("|"), "i");

// CLAUSE-PURITY SHAPE GATE (card 520 R1, adversarial-hardened round 2 — the treadmill-ending structural fix).
// Round 2 proved a vocab veto is a losing game: a real bar dressed in synonyms outside the list (tender, sealed
// envelope, "on-site presence", "predicated on", "will not advance", "offeror") slips through. But EVERY smuggler
// shares one SHAPE: it CONJOINS a benign Q&A clause with a SEPARATE bar clause. A genuinely benign milestone is
// PURE — every clause is about the inquiry/Q&A schedule and nothing else. So instead of enumerating bar vocab, we
// require PURITY: split the finding into clauses; every clause must be EITHER an inquiry clause (names the Q&A
// subject) OR a trivial fragment (no obligation). A clause that carries an OBLIGATION/CONSEQUENCE verb but does
// NOT name the inquiry subject = a second proposition beyond "a Q&A date" → the finding is not a pure milestone →
// ESCALATE. This is position-checked SHAPE (per-clause), not a bar-vocab blocklist, and it fails toward escalation.
const CLAUSE_SPLIT_RE = /[.;:,\n—–]|\band\b|\bbut\b|\bhowever\b|\bprovided\b|\bexcept\b|\bwhile\b|\bwhereas\b|\bor\b|\bafter\s+which\b|\bwhereupon\b/i;
// The inquiry SUBJECT — tight on purpose (the ALLOWLIST side): only the Q&A subject nouns + "answers/responses TO
// questions/inquiries" + "answers posted/provided". Bare "answered"/"response" is NOT here — else a smuggler clause
// ("firms that answered the roll call may bid") would masquerade as an inquiry clause. A clause naming this is allowed.
const INQUIRY_SUBJECT_RE = /\b(?:questions?|inquir(?:y|ies)|requests?\s+for\s+information|\bRFIs?\b|clarification|q\s*&\s*a|q\s*and\s*a)\b|\b(?:answers?|responses?)\b[^.\n]{0,20}?\bto\b[^.\n]{0,20}?\b(?:questions?|inquir|\bRFIs?\b)\b|\banswers?\s+(?:posted|provided|will\s+be\s+(?:posted|provided))\b/i;
// A non-inquiry clause is DANGEROUS (→ escalate) when it names a bidder-side ACTOR, an OFFER INSTRUMENT, or a
// PARTICIPATION event. Rationale: a benign trailing Q&A clause is either passive ("can no longer be submitted") or
// about the government ("answers will be posted") — it never conditions something on the FIRM, the OFFER, or an
// EVENT. Every smuggler payload references exactly one of these three. This is SHAPE, not bar-vocab, and the actor/
// instrument axes are near-impossible to evade (a bar must say who/what it bars). Bare modals are deliberately NOT
// a trigger (they over-escalate benign govt clauses); a real bar pairs them with an actor/instrument/event.
const CLAUSE_ACTOR_RE = /\b(?:firms?|offerors?|bidders?|vendors?|contractors?|entrants?|attendees?|respondents?|participants?|awardees?|concerns?|proposers?|quoters?|part(?:y|ies)|entit(?:y|ies)|interested\s+part|your\s+(?:firm|company|team|representative|organization|personnel)|the\s+representative)\b/i;
const CLAUSE_INSTRUMENT_RE = /\b(?:offers?|quotes?|proposals?|bids?|tenders?|envelopes?|packages?|submissions?|submittals?)\b/i;
// A CONDITION → CONSEQUENCE shape (checked on EVERY clause, incl. inquiry clauses, to catch a bar FUSED into an
// inquiry clause — "answers to questions will be honored only where the earlier presence was logged"). A bare date
// announcement never states a conditional or a consequence-of-participation; a bar always does. This is the SHAPE
// of "eligibility/advancement turns on X", captured by connective + consequence-verb frames rather than by naming
// the event (which synonyms evade). Conservative: it can only ESCALATE. 'only' is scoped so "may only be submitted
// in writing" (benign) does not trip it.
const CLAUSE_CONSEQUENCE_RE = new RegExp([
  // conditional connectives that gate an outcome
  "\\bonly\\s+(?:those|firms?|offerors?|vendors?|bidders?|contractors?|entrants?|attendees?|participants?|respondents?|where|if|after|upon|by\\s+attending|those\\s+who)",
  "\\bunless\\b", "\\babsent\\s+(?:that|which|attendance|participation)", "provided\\s+that", "subject\\s+to\\b", "\\bcontingent\\b", "\\bconditioned\\b", "\\bpredicated\\b",
  "failure\\s+to\\b", "\\bthose\\s+who\\b", "\\bwhoever\\b", "any\\s+(?:firm|offeror|vendor|bidder|contractor|entrant)\\s+(?:that|who|not|failing)",
  "\\bdepends\\s+on\\b", "\\bturns\\s+on\\b", "\\bwhere\\s+the\\b[^.\\n]{0,40}\\b(?:was|were|is|are|has|have)\\b",
  // consequence-of-participation frames
  "is\\s+what\\s+(?:carries|settles|decides|governs|determines|qualifies|counts|matters|controls|advances)",
  "\\b(?:governs|decides|determines|settles|dictates|controls|qualifies)\\b[^.\\n]{0,25}\\b(?:who|whether|continuation|eligib|standing|advance|forward|remain)",
  "cannot\\s+(?:proceed|advance|go\\s+forward|continue|compete|move\\s+forward|be\\s+considered)", "will\\s+not\\s+(?:proceed|advance|be\\s+honored|count|continue|be\\s+considered)",
  "\\b(?:is|are|was|were|be|remains?)\\s+(?:compulsory|mandatory|obligatory|prerequisite|decisive|requisite)\\b", "\\bcompulsory\\b", "\\bmandatory\\b",
  // eligibility/award RESTRICTION frames (award narrowed to a class → a who-can-win bar; round 4: geographic /
  // membership / directed-award / domestic-source axes). 'restricted/limited/reserved to' is the shape of a bar.
  "\\b(?:restricted|limited|reserved|confined|available|open)\\s+(?:to|for|only\\s+to)\\b", "\\bsole\\s+(?:basis|source|award)\\b", "no\\s+other\\s+(?:source|firm|offeror|vendor)", "no\\s+further\\s+competition",
  "\\bdirected\\s+(?:award|to|acquisition)\\b", "placed\\s+with\\s+the\\b", "\\bnullif", "\\bincumbent\\b", "current\\s+(?:holder|contractor|provider)", "domestically\\s+(?:sourced|produced|manufactured)", "\\bBerry\\b", "members?\\s+of\\s+the\\b", "\\bmembership\\b",
].join("|"), "i");

/** Brain card 520 R1 — SHAPE allowlist: is this no_one_can_move finding a benign information-exchange milestone?
 *  Benign ONLY when it (1) POSITIVELY matches the inquiry/Q&A milestone shape, (2) matches NO participation-
 *  prerequisite / offer-submission / structural-bar veto, AND (3) is CLAUSE-PURE (every clause is an inquiry
 *  clause or a trivial fragment; no clause carries an obligation without naming the Q&A subject). Ambiguity →
 *  false (left as-is → escalate). Pure. */
export function isInquiryDeadlineBenign(f: TypedFinding): boolean {
  if (f.universalDefect || f.verifiedBy) return false;         // never override a marked/verified universal defect
  if (f.controllability !== "no_one_can_move") return false;   // scoped to the exact driver typing
  // NORMALIZE — strip zero-width / soft-hyphen chars (OCR/copy artifacts a smuggler could hide a token behind) and
  // collapse whitespace, so a token cannot be split by an invisible character (round 4b ZWSP break).
  const norm = (s?: string) => (s ?? "").replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "").replace(/\s+/g, " ");
  const req = norm(f.requirement), exc = norm(f.excerpt), cite = norm(f.citation);
  const subject = `${cite} ${req}`;                             // POSITIVE shape on the finding's own subject (altitude)
  if (!INQUIRY_MILESTONE_RE.test(subject) && !INQUIRY_ANSWER_RE.test(subject)) return false;
  const hay = `${cite} ${req} ${exc}`;                          // VETO on the full hay (conservative)
  if (PARTICIPATION_PREREQ_RE.test(hay)) return false;         // participation prereq / real submission deadline → keep
  if (STRUCTURAL_BAR_RE_114.test(hay)) return false;           // any genuine structural-bar token → keep
  if (DELIVERY_IMPOSSIBILITY_RE.test(hay)) return false;       // a delivery/temporal/source-approval impossibility on another axis → keep (round 4)
  if (/\b(?:deliver\w*|perform\w*|complet\w*|ship\w*|furnish\w*|install\w*)\b[^.\n]{0,45}\bwithin\s+(?:\w+\s+){0,2}(?:calendar\s+)?(?:day|hour|week|month)/i.test(hay) || /\brequired\s+within\b/i.test(hay)) return false; // a performance/delivery WINDOW on another axis → keep (round 4 P15)
  // MANDATORY-INQUIRY PARTICIPATION prerequisite (round 5) — a bar that you MUST HAVE submitted a question / raised
  // an inquiry to remain eligible (the Q&A-analogue of a mandatory site visit). Distinct from the benign deadline
  // "questions must be submitted by X" (a schedule fact): the bar is a PERFECT-TENSE mandate ("shall have submitted
  // a question") or an explicit "obligated/required to submit a question". The live driver ("questions must be
  // submitted by 10 Jul") never matches (no perfect-tense / obligated-to frame). → keep as universal-path candidate.
  if (/\b(?:shall|must|will|should)\s+have\s+(?:submitted|raised|asked|posed|filed|lodged)\b[^.\n]{0,30}\b(?:question|inquir|RFI)/i.test(hay)
    || /\b(?:question|inquir\w*|RFI)\b[^.\n]{0,30}\b(?:shall|must|will)\s+have\s+been\s+(?:submitted|raised|asked|posed|filed)/i.test(hay)
    || /\b(?:obligated|required|expected|compelled|bound)\s+to\s+(?:submit|raise|ask|pose|file|lodge)\b[^.\n]{0,25}\b(?:a\s+|one\s+|at\s+least\s+|the\s+)?(?:question|inquir|RFI)/i.test(hay)
    || /\bmust\s+(?:submit|raise|ask|pose|file)\b[^.\n]{0,25}\b(?:at\s+least\s+)?(?:one|a)\s+(?:question|inquir)/i.test(hay)) return false;
  // CLAUSE PURITY — every substantive clause (requirement AND excerpt) must be an inquiry clause. A non-inquiry
  // clause bearing an obligation/consequence = a bar smuggled beside a benign Q&A date → escalate.
  for (const raw of `${req} . ${exc}`.split(CLAUSE_SPLIT_RE)) {
    const c = raw.trim();
    if (c.length < 5) continue;                                // trivial fragment
    if (CLAUSE_CONSEQUENCE_RE.test(c)) return false;           // a condition→consequence shape (even fused into an inquiry clause) → escalate
    if (INQUIRY_SUBJECT_RE.test(c)) continue;                  // an inquiry clause → always allowed
    if (CLAUSE_ACTOR_RE.test(c) || CLAUSE_INSTRUMENT_RE.test(c) || PARTICIPATION_PREREQ_RE.test(c)) return false; // a bar clause → escalate
  }
  return true;
}

/** Re-type a benign information-exchange milestone mis-typed no_one_can_move → bidder_controls (informational).
 *  Pure → gate-tested. Flag-gated; OFF ⇒ byte-for-byte unchanged. deriveVerdict reads controllability only. */
export function applyInquiryDeadlineBenignGuard(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged
  return findings.map((f): TypedFinding =>
    isInquiryDeadlineBenign(f)
      ? { ...f, controllability: "bidder_controls", curableInWindow: true, inquiryDeadlineGuard: true }
      : f);
}

// ── CROSS-CLAUSE TEMPORAL-CONFLICT CHECK (Brain card 81, Step 2) ──────────────────────────────────────
// Pure, no-model. Consumes the sweep-grounded `fat_precondition` + `delivery_window` findings (Step 1) and
// detects a UNIVERSAL impossibility: a NON-WAIVABLE First-Article precondition whose minimum duration
// exceeds the production delivery window — no bidder can deliver within the window when a longer mandatory
// precondition must first elapse. Emits a `no_one_can_move` show-stopper → deriveVerdict returns NO_BID,
// exactly as it handles any universal impossibility. The moat holds: it derives the conflict from grounded
// clause durations (real excerpts), asserts no verdict itself. Default-OFF flag (Rule 61).
const SPELLED_DAYS: Record<string, number> = { ten: 10, fifteen: 15, twenty: 20, "twenty-five": 25, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, "one hundred": 100 };
/** Minimum day-count a clause excerpt commits to. Prefers a parenthetical digit ("SIXTY (60)"), then a bare
 *  digit-days, then a spelled number; returns the SMALLEST such value (the binding minimum). Pure. */
export function parseDays(excerpt: string): number | null {
  const vals: number[] = [];
  for (const m of excerpt.matchAll(/\(\s*(\d{1,3})\s*\)\s*(?:calendar\s+|business\s+|working\s+)?days?/gi)) vals.push(parseInt(m[1], 10));
  for (const m of excerpt.matchAll(/\b(\d{1,3})\s*(?:calendar\s+|business\s+|working\s+)?days?\b/gi)) vals.push(parseInt(m[1], 10));
  for (const m of excerpt.matchAll(/\b(ten|fifteen|twenty-five|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred)\b\s*(?:\(\s*\d{1,3}\s*\)\s*)?(?:calendar\s+|business\s+|working\s+)?days?/gi)) vals.push(SPELLED_DAYS[m[1].toLowerCase()]);
  return vals.length ? Math.min(...vals) : null;
}

// ── Step 7 (Brain card 140/141) ANCHORED-DURATION parsing — the Step-2 `parseDays` global-MIN is unsafe for the
// Option-B arithmetic prong: an incidental smaller day-count (a shipment-notice sub-deadline, a first-article
// SAMPLE due-date, another CLIN's window) poisons the delivery window into a FALSE impossibility. These helpers
// pin each duration to its GOVERNING anchor by proximity, so the arithmetic compares the gate duration to the
// DELIVERY window — not two unrelated numbers. Pure. (The verdict path uses ONLY these anchored helpers; the
// legacy global-min `parseDays` path is RETIRED (Fork-1) — `parseDays` remains only as a unit-tested string util.)
/** Every day-count (digit, parenthetical, spelled) with its source offset — so a duration can be matched to its
 *  governing phrase by proximity rather than a blind global min. Pure. */
function dayCountsWithPos(excerpt: string): Array<{ v: number; i: number }> {
  const out: Array<{ v: number; i: number }> = [];
  for (const m of excerpt.matchAll(/\(\s*(\d{1,3})\s*\)\s*(?:calendar\s+|business\s+|working\s+)?days?/gi)) out.push({ v: parseInt(m[1], 10), i: m.index ?? 0 });
  for (const m of excerpt.matchAll(/\b(\d{1,3})\s*(?:calendar\s+|business\s+|working\s+)?days?\b/gi)) out.push({ v: parseInt(m[1], 10), i: m.index ?? 0 });
  for (const m of excerpt.matchAll(/\b(ten|fifteen|twenty-five|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred)\b\s*(?:\(\s*\d{1,3}\s*\)\s*)?(?:calendar\s+|business\s+|working\s+)?days?/gi)) out.push({ v: SPELLED_DAYS[m[1].toLowerCase()], i: m.index ?? 0 });
  return out;
}
const NEAR = 40; // chars: a duration is "governed by" an anchor when within NEAR of it
// Window identification — POSITIVE UNIQUENESS (card 141 rounds 2-4). FOUR rounds of adversarial review each found a
// FALSE NO_BID where a SMALL incidental sub-deadline (shipment/inspection notice, first-article sample due-date,
// CDRL/plan data-item, another CLIN's window) was mistaken for the production-delivery window while the REAL (larger)
// window was unparsed ("120-day", "16 weeks", "four months") or anchor-detached in a flattened §F table. A denylist of
// "notice-type" phrasings is open-ended (round-4 broke it with a non-notice "deliver the Plan" verb). ROOT FIX: stop
// guessing WHICH duration is the window — fire ONLY when the delivery excerpt carries exactly ONE distinct unvoided
// duration SIGNAL of any kind. Any second distinct duration (parsed-days, weeks, months, hyphenated-day) ⇒ the window
// is unprovable ⇒ CAUTION ("PROVEN arithmetic — never estimate"). Explicitly VOIDED/superseded alternates are removed
// first (a "base 90-day / 8-month" term struck by "SUPERSEDES and VOIDS"); a bare "base period" is NOT treated as
// voided (round-4: that wrongly dropped a legitimate PoP window). prong1 separately requires the window be order-anchored.
// ANY non-day time unit (weeks/months/years/quarters) or recurrence (annual/quarterly/per-period) — a window the
// day-parser can't compare to a gate in days ⇒ unprovable window ⇒ CAUTION (round-5: year/annual/quarterly were the
// missing units). Days require a HYPHEN here ("30-day") since bare "N days" is already covered by dayCountsWithPos.
const UNPARSED_DUR_G = /\b\d{1,3}\s*-\s*(?:days?|weeks?|months?|years?|quarters?)\b|\b\d{1,3}\s+(?:weeks?|months?|years?|quarters?)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:weeks?|months?|years?|quarters?)\b|\bannual(?:ly)?\b|\bsemi-?annual(?:ly)?\b|\bbiannual(?:ly)?\b|\bquarterly\b|\bper\s+(?:year|quarter|annum|month|week)\b/gi;
const VOIDED_G = /supersede\w*|voids?|hereby\s+(?:deleted|replaced|struck)|is\s+replaced|no\s+longer\s+(?:applies|applicable|in\s+effect)/gi; // EXPLICIT supersession only — never a bare "base period"
// SUB-DEADLINE words: a day-count co-located with these is NOT the production window — it's a notice/sample/data-item
// deadline (round-4/6: the recurring false-NO_BID cause was a small sub-deadline mistaken for the window).
// Word-boundary-anchored (card 146 polish): leading \b on bare tokens so they don't substring-hit (e.g. \bmobiliz
// no longer matches "immobilize"; \badvance\b no longer matches "advanced"). Conservative direction — narrows the
// sub-deadline exclusion only; the temporal arm is CAUTION-only either way, so no false NO_BID surface is created.
const SUBDEADLINE_G = /\bnotice|\badvance\b|\binspection|\bsample|\bplan\b|\bCDRL\b|data\s+item|\breport\b|\bsubmit|prior\s+to\s+each|kick[\s-]?off|\breadiness|first[\s-]?article|first\s+lot|\blot\s+\d|initial\s+deliver|\binterim|\bincrement|partial\s+shipment|\bprototype|pre-?production|demonstration\s+unit|\bmobiliz/gi;
// Competing NON-DAY window FORMS (round-6): the real window stated as a calendar date / fiscal year / ordering or
// option period / attachment reference / unit-less ARO number — none parse as a day-count, so their presence (next
// to a lone small day-count) means the window is unprovable ⇒ CAUTION. NOT an estimate — a refusal to guess.
const NONDAY_WINDOW_G = /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\bFY\s?\d{2,4}\b|\bfiscal\s+year\b|period\s+of\s+performance|\bordering\s+period\b|\boption\s+period\b|throughout\s+the\b[^.]{0,30}\bperiod\b|in\s+accordance\s+with[^.]{0,40}attachment|delivery\s+schedule\s+in\s+(?:attachment|exhibit)|see\s+(?:attachment|exhibit)|\b\d{1,3}\s+(?:ARO\b|after\s+receipt\s+of\s+order)|contract\s+completion|contract\s+end|\bperformance\s+period\b|required\s+delivery\s+date|\bRDD\b|project\s+completion|\bmonth\s+\d{1,2}\b|master\s+production\s+schedule|\bby\s+20\d{2}\b/gi;
function indicesOf(excerpt: string, reG: RegExp): number[] { const o: number[] = []; for (const m of excerpt.matchAll(reG)) o.push(m.index ?? 0); return o; }
/** The DELIVERY-WINDOW duration — or null (⇒ CAUTION) unless the window is UNAMBIGUOUS. Fire only when: exactly ONE
 *  distinct unvoided, NON-sub-deadline parsed day-value remains, AND there is NO competing duration the parser can't
 *  compare (weeks/months/years/quarters/annual) AND NO competing non-day window FORM (calendar date / FY / period /
 *  attachment / unit-less-ARO number). Any competing signal ⇒ the real window may be the one we can't read ⇒ CAUTION.
 *  This is the ROOT fix after 6 adversarial rounds: never trust a lone small day-count as the production window. Pure. */
function deliveryWindowDays(excerpt: string): number | null {
  const voided = indicesOf(excerpt, VOIDED_G), subdl = indicesOf(excerpt, SUBDEADLINE_G);
  const isVoided = (i: number) => voided.some((v) => Math.abs(v - i) <= 60);
  const isSubdeadline = (i: number) => subdl.some((s) => Math.abs(s - i) <= NEAR);
  const dayVals = new Set<number>();
  for (const c of dayCountsWithPos(excerpt)) if (!isVoided(c.i) && !isSubdeadline(c.i)) dayVals.add(c.v);
  for (const m of excerpt.matchAll(UNPARSED_DUR_G)) {                  // a competing duration the day-parser can't compare ⇒ unprovable window
    const i = m.index ?? 0; if (isVoided(i)) continue;
    const num = m[0].match(/\d{1,3}/);
    if (/day/i.test(m[0]) && num != null && dayVals.has(parseInt(num[0], 10))) continue; // hyphenated restatement of an existing day window (e.g. "30-day")
    return null;
  }
  for (const m of excerpt.matchAll(NONDAY_WINDOW_G)) if (!isVoided(m.index ?? 0)) return null; // a non-day window FORM competes ⇒ unprovable ⇒ CAUTION
  return dayVals.size === 1 ? [...dayVals][0] : null;
}
// Gate anchors are TESTING-specific. Bare "evaluat*" was DROPPED (round-5: a source-selection "evaluation period
// is ninety (90) days" was admitted as a phantom gate) — only first-article/test evaluation counts.
// Hoisted to a module constant (card 146 polish) — compiled once, not per gateDays() call. matchAll clones the
// regex internally per spec, so reuse across calls is stateless/safe. Behavior byte-identical.
const GATE_ANCHOR_G = /requires?|conduct|testing|to\s+complete|to\s+process|government\s+testing|approval\s+notice|first\s+article\s+(?:approval|evaluat\w*|test)/gi;
// CLIN / line-item token matcher — hoisted to a module constant (card 146 polish); same matchAll-clone safety.
const CLIN_G = /\b(?:CLIN|SUBCLIN|line\s+item|item)\s*#?\s*([A-Z]?\d{2,4})\b/gi;
/** The GATE duration: the day-count co-located (±NEAR) with gate/testing language. Fire only when UNAMBIGUOUS =
 *  exactly ONE distinct gate-anchored value (so an unrelated number near a gate word — a field-evaluation period,
 *  a quantity — cannot OVER-state the gate via MAX and cause a FALSE fire; multiple distinct ⇒ CAUTION). Anchored
 *  (not global) so a warranty/sub-step duration elsewhere in the excerpt is ignored. null ⇒ CAUTION. Pure. */
function gateDays(excerpt: string): number | null {
  const anchors: number[] = [];
  for (const m of excerpt.matchAll(GATE_ANCHOR_G)) anchors.push(m.index ?? 0);
  const vals = new Set<number>();
  for (const c of dayCountsWithPos(excerpt)) if (anchors.some((a) => Math.abs(a - c.i) <= NEAR)) vals.add(c.v);
  return vals.size === 1 ? [...vals][0] : null;
}
/** CLIN / line-item tokens named in an excerpt (for the same-deliverable guard). Pure. */
function clinSet(excerpt: string): Set<string> {
  const s = new Set<string>();
  for (const m of excerpt.matchAll(CLIN_G)) s.add(m[1].toUpperCase());
  return s;
}

// ── Step 7 (Brain card 140) → FORK-1 (Brain card 226) — order-referenced SEQUENTIAL-GATE narrowing, now the ──
// ── ONLY temporal path (legacy no_one_can_move emitter + NONWAIVABLE_RE removed; four-prong CAUTION-only). ──
// The Step-2 universal-impossibility (no_one_can_move → NO_BID) is doctrinally correct ONLY for a genuine
// ORDER-REFERENCED sequential gate — NOT for a relative-scheduling term ("N days before delivery", a bidder-side
// schedule) nor for an unproven duration. The gold #6 source (FA860126Q00260001) proves a literal "both share an
// ARO token" test is WRONG: its delivery (F.2) is ARO-anchored but its FAT gate (F.1) is anchored to "receipt of
// the first article unit" (a post-order event, no ARO token) — yet it IS a genuine universal impossibility. What
// makes it universal is a non-waivable POST-ORDER gate whose duration is foreclosed against delivery and exceeds
// the window. So Option B fires no_one_can_move ONLY when ALL FOUR prongs hold; else KO-clarify CAUTION
// (cautionFloor on the FAT finding), never NO_BID. Default-OFF flag ⇒ legacy Step-2 path (byte-identical to 63e777f).
// Prong 3 — explicit NON-WAIVER (bare \bmandatory\b DROPPED: force/obligation ≠ immovability). Semantic class:
// genuine non-waiver synonyms (cannot/will-not/may-not be waived, waiver not permitted) so realistic phrasings
// aren't false-softened. Whitespace is \s+ (pdftotext breaks fixed phrases across newlines).
const NONWAIVABLE_TIGHT_RE = /\bnon-?waivable\b|shall\s+not\s+(?:waive|authorize|approve)|(?:may|will|can|shall)\s*not\s+be\s+waived|cannot\s+be\s+waived|waiver\s+(?:is\s+not\s+permitted|will\s+not\s+be\s+(?:granted|permitted))|not\s+subject\s+to\s+waiver|must\s+(?:complete|elapse|first)/i;
// Prong 1 — the DELIVERY window is order-anchored (fixed start ⇒ a window identical for all offerors). Semantic
// order-anchor class. NOTE (card 141): the upstream highSignalSweep grounds `delivery_window` ONLY on an ARO-class
// token, so non-ARO order anchors here are forward-compatible (not yet reachable until the sweep is broadened).
const DELIVERY_ORDER_ANCHOR_RE = /\bARO\b|after\s+receipt\s+of\s+(?:order|award)|(?:after|from)\s+(?:the\s+)?(?:date\s+of\s+)?(?:contract\s+)?award|(?:after|from)\s+issuance\s+of\s+(?:the\s+)?(?:task\s+|delivery\s+)?order|after\s+(?:the\s+)?effective\s+date\s+of\s+the\s+contract|after\s+notice\s+to\s+proceed|\bNTP\b/i;
// Prong 2a — the gate duration is measured from a POST-ORDER event (Government-side, not bidder-schedulable).
// Semantic class: receipt/acceptance/approval of a first article/sample, OR any order/award/NTP/commencement anchor.
// "government acceptance/approval" is REQUIRED to be OF a first article / sample (round-2 B-1: bare "Government
// approval of the invoice" is a payment term, NOT a post-order gate). FAR-canonical notification/return synonyms
// added (round-2 A-2). `\bARO\b`/after-receipt-of-order remain — the upstream sweep grounds fat_precondition ONLY
// on a first-article clause (FAT_RE), so the gate is inherently Government-conducted, not bidder-internal.
const POST_ORDER_GATE_ANCHOR_RE = /receipt\s+of\s+(?:the\s+)?(?:first\s+article|first\s+production|production\s+sample|test\s+sample)|government'?s?\s+(?:receipt|(?:written\s+)?notification)|government\s+(?:acceptance|approval)\s+of\s+(?:the\s+)?(?:first\s+article|first\s+production|production\s+sample|test\s+sample)|acceptance\s+of\s+the\s+(?:first\s+article|test\s+sample)|return\s+of\s+the\s+approved\s+first\s+article|after\s+receipt\s+of\s+(?:order|award)|(?:after|from)\s+(?:the\s+)?(?:date\s+of\s+)?(?:contract\s+)?award|issuance\s+of\s+(?:the\s+)?(?:task\s+|delivery\s+)?order|notice\s+to\s+proceed|\bNTP\b|effective\s+date\s+of\s+the\s+contract|contract\s+commencement|\bARO\b/i;
// Prong 2b — delivery is explicitly FORECLOSED until the gate closes (sequential, NOT a parallel/relative schedule).
// Semantic foreclosure class: prohibition / contingency / condition-precedent / withheld-until family. Each `[^.]{0,80}`
// gap is bounded to one sentence (no cross-sentence spurious match; also bounds backtracking). Round-2 fixes: the
// foreclosure object is DELIVER/SHIP only — NOT bare "produc" (B-2: "no production delays before…" is benign) — and
// the actor-agnostic "delivery … shall not … until" alt is DROPPED (B-3: it matched bidder-controlled scheduling).
const DELIVERY_FORECLOSE_RE = /\bno\b[^.]{0,80}\b(?:deliver|ship)[^.]{0,80}\b(?:before|until|prior)\b|(?:shall|may|will)\s+not[^.]{0,80}(?:authorize|approve|ship|deliver)[^.]{0,80}\buntil\b|until\s+first\s+article\s+approval|condition\s+precedent\s+to\s+(?:delivery|shipment)|contingent\s+upon[^.]{0,80}approval|(?:prohibited|not\s+permitted)\s+(?:prior\s+to|before|until)[^.]{0,80}approval|withheld\s+until[^.]{0,80}approval/i;
export function applyTemporalConflict(findings: TypedFinding[]): TypedFinding[] {
  // ── FORK-1 (Brain card 226) — the temporal arm NEVER emits NO_BID; four-prong CAUTION-only is the ALWAYS-RUN
  // default (no flag). The legacy `no_one_can_move → NO_BID` Step-2 emitter is RETIRED: deterministic ID of the
  // production-delivery window from messy §F text proved open-ended across 7 adversarial rounds, so a false NO_BID
  // is a structural (zero-contract-loss) risk. This path produces ONLY a KO-clarify CAUTION (four prongs hold on
  // proven anchored arithmetic) or a soft cautionFloor (tension present, not proven) — never a show-stopper. ──
  const fat = findings.find((f) => f.sweepArchetype === "fat_precondition");
  const delivery = findings.find((f) => f.sweepArchetype === "delivery_window");
  if (!fat || !delivery) return findings;

  const gDays = gateDays(fat.excerpt ?? ""), winDays = deliveryWindowDays(delivery.excerpt ?? "");  // ANCHORED durations (?? "" — sibling-consistent guard; .matchAll on undefined throws mid-run)
  const prong1 = DELIVERY_ORDER_ANCHOR_RE.test(delivery.excerpt);                                   // delivery is order-anchored
  const prong2 = POST_ORDER_GATE_ANCHOR_RE.test(fat.excerpt) && DELIVERY_FORECLOSE_RE.test(fat.excerpt); // post-order gate + delivery foreclosure (rejects relative scheduling)
  const prong3 = NONWAIVABLE_TIGHT_RE.test(fat.excerpt);                                            // explicit non-waiver (mandatory-only is NOT enough)
  const prong4 = gDays != null && winDays != null && gDays > winDays;                               // PROVEN arithmetic on anchored durations (never estimate)
  // same-deliverable guard: if BOTH excerpts name CLIN/line items and the sets are DISJOINT, the gate and the
  // window concern DIFFERENT deliverables ⇒ not a universal tension for either ⇒ do not fire (→ soft floor).
  const fatClins = clinSet(fat.excerpt ?? ""), delClins = clinSet(delivery.excerpt ?? ""); // ?? "" — sibling-consistent guard (clinSet → .matchAll)
  const crossDeliverable = fatClins.size > 0 && delClins.size > 0 && ![...fatClins].some((c) => delClins.has(c));
  // EVIDENCE the human adjudicates from — the parsed arithmetic, never silent (Brain card 226).
  const evidence = { gateDays: gDays, windowDays: winDays, gateExceedsWindow: prong4 };
  if (prong1 && prong2 && prong3 && prong4 && !crossDeliverable) {
    // Four prongs hold on PROVEN anchored arithmetic → a HIGH-confidence KO-clarify CAUTION (bidder_controls +
    // cautionFloor), CARRYING the evidence. deriveVerdict floors this to BID_WITH_CAUTION; never NO_BID/INELIGIBLE.
    const caution: TypedFinding = {
      requirement: `Likely universally unmeetable delivery schedule — CONFIRM the binding production window against the non-waivable First Article gate before bidding: a non-waivable, order-referenced FAT precondition (min ~${gDays} days, measured from a post-order event and foreclosing delivery until it closes) appears to exceed the production delivery window (~${winDays} days ARO).`,
      citation: `${fat.citation} + ${delivery.citation} (cross-clause temporal conflict)`,
      excerpt: fat.excerpt, // verbatim-grounded binding term (the FAT clause)
      kind: "technical_spec", controllability: "bidder_controls", curableInWindow: true,
      cautionFloor: true, temporalSharedAroGuard: true, temporalEvidence: evidence, grounded: true, lens: "temporal_conflict",
    };
    return [...findings, caution];
  }
  // Any prong fails / ambiguous arithmetic / cross-deliverable ⇒ a temporal tension is present but NOT proven → soft
  // KO-clarify floor (cautionFloor on the FAT finding, carrying whatever parsed), NEVER no_one_can_move/NO_BID.
  return findings.map((f) => (f === fat ? { ...f, cautionFloor: true, temporalSharedAroGuard: true, temporalEvidence: evidence } : f));
}

/** Disposition is a PURE function of controllability + kind — the Brain card-41 rule as CODE (was prose).
 *  boilerplate → dropped (never a gate); already_satisfied → met; bidder_controls → gate-to-clear (do the
 *  work, never disqualifying / never a downgrade); bidder_cannot_move → disqualifying bar. */
export function disposeFinding(f: TypedFinding): Disposition {
  if (f.kind === "boilerplate") return "dropped";
  if (f.controllability === "already_satisfied") return "met";
  if (f.controllability === "bidder_controls") return "gate_to_clear";
  return "disqualifying"; // bidder_cannot_move
}

// ── B3-SEVERITY (Brain card 429 · flag AUDIT_SITEVISIT_SEVERITY_FLOOR, default-OFF) ───────────────────
// FAIL-TOWARD-DISQUALIFIER on SEVERITY/BAND (not on the verdict). A COMPLETED / mandatory site-visit — or any
// surfaced hard eligibility — disqualifier that the NOTICE-BODY ELIGIBILITY FLOOR (B3-detection) routed to
// NEEDS_HUMAN_REVIEW must render BID-DECIDING, never a P2 "advisory". Mechanism: the V4 report's show-stopper band
// is sourced EXCLUSIVELY from persisted showStoppers[] (Brain card-293); the notice-body-floor branch returns
// showStoppers=[] (its driver bar is ungrounded), so a SEPARATE grounded disqualifier sitting in dispositions[]
// falls through v4-report severityOf() into the P2 "Advisories" band — exactly what buried finding[20] on 24f0b29e.
//
// SCOPED IN-BRANCH (ultracode Gate-2 — the ONLY coherent pole). The promotion is applied INSIDE the
// noticeBodyBarUngrounded NHR branch ALONE. Deliberate: every OTHER NHR pole is either already bar-carrying
// (nonCurable / unmarkedUniversalClaim / manifest-incomplete already pass the bar as showStoppers -> it renders
// bid-deciding without this floor) OR a META-AMBIGUITY pole where a promotion would be a FALSE committal on an NHR
// report (setAsideConflict = eligible pool ambiguous; primaryIndeterminate = base doc not anchored; unreadEvidence
// = the bar may be waived by an unread attachment; verifier-unsound / conflict = findings untrustworthy). A
// post-decision floor cannot tell those poles apart (all return showStoppers=[] before the verifier/conflict
// checks) -> the promotion lives in the branch that OWNS the pole. The customer render frames an NHR-pole
// show-stopper as a CONDITIONAL bar (Brain/Design ruling card 432), never committal "blocks award" copy.
// OVER-FIRE GUARDS (isSiteVisitOrEligBar): disposition===disqualifying (a benign site-visit-ENCOURAGED gate is
// bidder_controls -> excluded) · NOT curableInWindow===true (curable = a gate to clear, branch-5b parity) · NOT
// firmStatus==="satisfies" (the firm PROVES it holds the bar). Flag-OFF ⇒ the branch passes [] as before
// (byte-identical, Rule 61). Pure -> gate-tested.
// SITE_VISIT_RE + SITE_VISIT_CONCLUDED_RE are the SHARED contract regexes (audit-site-visit-patterns.ts) — the
// emitter frames against the SAME CONCLUDED_RE this guard recognizes; sharing prevents a drift that would silently
// break the conditional-concluded promotion (card #453/#454).
function isSiteVisitOrEligBar(f: DecidedFinding, profile: BidderProfile | null, source?: string): boolean {
  if (f.disposition !== "disqualifying") return false;             // over-fire guard: a real bar, never a gate-to-clear
  if (f.curableInWindow === true) return false;                    // curable in-window -> a gate to clear, not a blocker (branch-5b parity)
  if (firmStatus(f, profile, source) === "satisfies") return false; // the firm PROVES it holds the bar -> not a blocker
  const isSiteVisit = SITE_VISIT_RE.test(f.requirement ?? "") || SITE_VISIT_RE.test(f.excerpt ?? ""); // CONTENT only — NOT citation
  // STALENESS GUARD (card #453/#454 · additive to PR #201) — a SITE-VISIT bar whose SOURCE shows the visit already
  // concluded/held is only auto-suppressed when the FINDING is MIS-FRAMED (reads as a live "must attend to be
  // eligible" gate with no concluded frame in its own text). A CORRECTLY-FRAMED finding — the notice-body emitter's
  // conditional-concluded finding whose own requirement/excerpt carries the concluded marker — DOES promote (its
  // own copy supplies the "bars award unless attendance confirmed" #432 framing). Mis-framed live-sounding lens
  // findings (concluded only in the source) stay NOT-promoted — routed to human review, never a false "go attend" P0.
  const findingCarriesConcludedFrame = SITE_VISIT_CONCLUDED_RE.test(f.requirement ?? "") || SITE_VISIT_CONCLUDED_RE.test(f.excerpt ?? "");
  if (isSiteVisit && source && SITE_VISIT_CONCLUDED_RE.test(source) && !findingCarriesConcludedFrame) return false;
  if (f.kind === "eligibility_bar") return true;
  return isSiteVisit; // CONTENT only — NOT citation (keying P0 off a referenced doc NAME over-fires; ultracode re-review #2 P2)
}
/** The site-visit/eligibility disqualifiers to SURFACE as bid-deciding on the notice-body NHR pole, floored to P0.
 *  Applied ONLY inside that branch (see doctrine above) — never on meta-ambiguity poles. Pure. */
function siteVisitEligStoppers(dispositions: DecidedFinding[], profile: BidderProfile | null, source?: string): DecidedFinding[] {
  const stoppers = dispositions.filter((f) => isSiteVisitOrEligBar(f, profile, source)).map((f) => ({ ...f, severity: "P0" as const }));
  return dedupBandGates(stoppers);
}

// Card #480 — collapse show-stopper bars that assert the SAME eligibility GATE stated from two documents (the e8b616df
// band over-count: [0] MAC-BOA §L 1.1–1.2 + [2] "vehicle HOLDERS ONLY" SAM-body are ONE gate — "must hold the Tinker MAC
// BOA vehicle" — a firm cannot clear one and fail the other). Group by a gate SIGNATURE (requiredAttribute + requirement
// tokens), keep the first, and PRESERVE the merged bar's citation on the survivor (no citation lost). Flag-gated
// AUDIT_BAND_DEDUP, default-OFF ⇒ returns the list unchanged (byte-identical).
const bandDedupEnabled = () => process.env.AUDIT_BAND_DEDUP === "true";
function gateSignature(f: DecidedFinding): string {
  const combined = `${f.requiredAttribute ?? ""} ${f.requirement ?? ""}`.toLowerCase();
  // Site-visit is checked FIRST (most specific): the FA8137 notice body carries "MAC BOA Holders ONLY" adjacent to the
  // site-visit text, so a vehicle-holder-first order would false-collapse the DISTINCT site-visit bar into the holder gate.
  if (/site\s+visit/.test(combined)) return "gate:site-visit";
  if (/mac.?boa|boa.?holder|holders\s+only|vehicle.?hold|underlying\s+vehicle|\bidiq\b|\bbpa\b|\bgwac\b|\bmas\b/.test(combined)) return "gate:vehicle-holder";
  return `req:${(f.requirement ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 50)}`;
}
export function dedupBandGates(stoppers: DecidedFinding[]): DecidedFinding[] {
  if (!bandDedupEnabled()) return stoppers;
  const bySig = new Map<string, DecidedFinding>();
  for (const f of stoppers) {
    const sig = gateSignature(f);
    const kept = bySig.get(sig);
    if (!kept) { bySig.set(sig, { ...f }); continue; }
    // merge: preserve BOTH citations on the survivor (dedupe identical strings)
    const cites = Array.from(new Set([kept.citation, f.citation].filter(Boolean)));
    kept.citation = cites.join("; ");
  }
  return Array.from(bySig.values());
}

// Card #481 (ruling-4, #436 root-6) — REFRAME (never bare-suppress) a "no set-aside is present" finding when the row's
// set_aside field is AUTHORITATIVE (names a real program). A model lens sometimes reads the ORDER §I (no 52.219-6 clause)
// and headlines "No set-aside is present in this solicitation" — source-TRUE at the order level but contradicting the
// masthead's own "Set-aside: SBA" (the 41068f42 red-team's sole NO-STAMP). The reframe keeps the source-true observation
// (no order-level 52.219-6 clause) and adds the authoritative context (the parent vehicle carries the set-aside; order
// eligibility gates on the vehicle seat) so it no longer contradicts the masthead. Flag AUDIT_SETASIDE_REFRAME, default
// OFF ⇒ findings untouched (byte-identical). A genuinely-unrestricted solicitation (set_aside empty/none) ⇒ NOT reframed
// (the "no set-aside" finding is true) — the guard requires an authoritative set-aside.
const setAsideReframeEnabled = () => process.env.AUDIT_SETASIDE_REFRAME === "true";
// Match ONLY a finding that ASSERTS the ABSENCE of a set-aside (the masthead-contradicting claim) — not a benign mention
// of 52.219-6. Requires "no set-aside … present/applies/exists", "no … set-aside clause", or "there is no … 52.219-6".
const NO_SETASIDE_CLAIM_RE = /\bno\s+set[\s-]?aside\s+(?:restriction\s+|designation\s+)?(?:is\s+|are\s+)?(?:present|applies|exists|found|in\s+(?:this|the))|\bno\s+(?:\S+\s+){0,3}?set[\s-]?aside\s+clause\b|\bno\s+small\s+business\s+program\s+eligibility\s+bar|there\s+is\s+no\s+(?:far\s+)?52\.219-6\b|\b52\.219-6\s+is\s+(?:not|n['’]?t)\s+(?:in|present)/i;
/** True when set_aside names a real program (not empty/none/unrestricted/full-and-open). */
export function setAsideIsAuthoritative(setAside: string | null | undefined): boolean {
  const s = (setAside || "").trim().toLowerCase();
  if (!s) return false;
  // Word-boundary CONTAINS (not anchored) — SAM returns descriptive values like "Full and Open Competition" with trailing
  // words; an anchored ^…$ would mis-read those as authoritative and reframe a genuinely unrestricted solicitation.
  return !/\b(none|no set[\s-]?aside|n\/?a|full\s+and\s+open|unrestricted|not\s+set[\s-]?aside)\b/.test(s);
}
export function reframeNoSetAsideFindings<T extends { requirement: string }>(findings: T[], setAside: string | null | undefined): T[] {
  if (!setAsideReframeEnabled() || !setAsideIsAuthoritative(setAside)) return findings;
  const label = (setAside || "").trim();
  // VEHICLE-AGNOSTIC reframe (red-team #481): assert ONLY what SAM records — the {label} set-aside — plus the source-true
  // §I observation, and a verify instruction. NEVER fabricate a specific mechanism (a "BOA/IDIQ seat" would be invented on
  // a non-vehicle set-aside, e.g. a plain 8(a) RFP). Source-defensible for ANY authoritative set_aside.
  return findings.map((f) => {
    if (!NO_SETASIDE_CLAIM_RE.test(f.requirement || "")) return f;
    return { ...f, requirement: `No standalone FAR 52.219-6 set-aside clause was found in §I; however, SAM records this acquisition under the ${label} set-aside — confirm the controlling set-aside / eligibility basis against the latest solicitation and any parent contract vehicle.` };
  });
}

// Card #477 ruling 3 — the NAMED NHR reason-line (flag AUDIT_REASON_LINE_NAMED, default-OFF). When grounded eligibility
// bars drive the notice-body NHR, the reason NAMES them (from each bar's plain-language `requirement`) instead of the
// generic B3 fail-safe boilerplate ("a bidder-eligibility bar … could not be confirmed as analyzed"), which understated
// the audit's own grounded analysis — the 6a67c0f1 stamp-bar #6 miss. Deduped, first-clause-trimmed, ≤3 bars. Returns
// null when no named bar is available ⇒ the caller keeps the generic string (byte-identical). Flag-OFF ⇒ never called.
const reasonLineNamedEnabled = () => process.env.AUDIT_REASON_LINE_NAMED === "true";

/** Card #479 class-regression guard — clamp a DERIVED CUSTOMER-FACING string to `max` chars WITHOUT ever cutting
 *  mid-word or leaving a fake terminal period. Under the limit ⇒ returned EXACTLY as-is (byte-identical to a prior
 *  `.slice(0,max)` that never cut). Over ⇒ whitespace-normalised, trimmed to the last whole word, trailing punctuation
 *  stripped, explicit "…" elision appended. Use for EVERY reason/summary/rationale string that renders — a bare
 *  `.slice(0, N)` on such a string produced the 69dbbe9e "…proposed by an e." blocker. */
export function clampToWord(s: string, max: number): string {
  const t = s || "";
  if (t.length <= max) return t; // under the limit ⇒ EXACT as-is (byte-identical)
  const norm = t.replace(/\s+/g, " ").trim();
  if (norm.length <= max) return norm;
  return norm.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
}

export function namedEligibilityReason(stoppers: DecidedFinding[]): string | null {
  const bars: string[] = [];
  const seen = new Set<string>();
  for (const s of stoppers) {
    const req = (s.requirement || "").replace(/\s+/g, " ").trim();
    if (!req) continue;
    // Card #480 — prefer the natural CLAUSE boundary (";"/"."): take the first clause and clamp only if it exceeds a
    // GENEROUS limit, so a real clause renders as a complete thought instead of the e8b616df "…existing holder of…"
    // dangling-preposition elision. On any elision, strip a trailing function-word so it never ends on a preposition/article.
    let phrase = clampToWord((req.split(/(?<=[.;])\s/)[0] || req).replace(/[.;,\s]+$/, ""), 240);
    if (phrase.endsWith("…")) phrase = phrase.replace(/\s+(?:of|the|a|an|to|by|for|in|on|and|or|with|at|as|from|per)\s*…$/i, "…");
    const key = phrase.toLowerCase().slice(0, 40);
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    bars.push(phrase);
    if (bars.length >= 3) break;
  }
  if (bars.length === 0) return null;
  return `Human review required to confirm eligibility — the solicitation notice states bar(s) only your firm can confirm are cleared: ${bars.map((b, i) => `(${i + 1}) ${b}`).join("; ")}.`;
}

// SEAM FILL — card #472 (residual batch, flag AUDIT_COVERAGE_NHR_STOPPER_FILL, default-OFF). The COMPANION of the
// card-429 notice-body treatment for the OTHER coverage-NHR pole: the GATE_V2 coverage cap (gateV2Outcome cap ===
// "NEEDS_HUMAN_REVIEW", deriveVerdict step 1). Trace (6439ac27): a §L conditional-TINA false-NHR fired the GATE_V2 cap
// FIRST and returned showStoppers=[], STRANDING three GROUNDED bidder_cannot_move eligibility bars (BOA-holder,
// concluded site-visit, vehicle-holder) in dispositions[] — they rendered in the P2 advisory band, never the V4
// show-stopper band (which sources EXCLUSIVELY from persisted showStoppers[], card-293). #1 (conditional-TINA demotion)
// removes THAT false pole; this fill is the decision-layer defense-in-depth so a GENUINE coverage-NHR cap can never
// again strand a grounded eligibility/site-visit bar out of the persisted slot. DOCTRINE-COHERENT with card-429: the
// GATE_V2 coverage cap is a COVERAGE pole (a specific uncovered obligation), NOT a meta-ambiguity pole (setAsideConflict
// / primaryIndeterminate / unreadEvidence / verifier / conflict — where a promotion would be a false committal and which
// this fill NEVER touches). Reuses the SAME siteVisitEligStoppers filter (only genuine site-visit/eligibility_bar
// disqualifiers, floored P0, framed CONDITIONAL by the render — card 432), so a non-elig disqualifier is never promoted.
// Flag-OFF ⇒ passes [] exactly as today (byte-identical, Rule 61).
const coverageNhrStopperFillEnabled = () => process.env.AUDIT_COVERAGE_NHR_STOPPER_FILL === "true";

/** Against a disqualifying (bidder_cannot_move) bar, the firm's status is one of three — and that, not the
 *  bar's mere presence, decides the outcome (the standing facts-vs-analysis / no-blind-INELIGIBLE doctrine):
 *    "satisfies" — profile PROVES the firm holds the required qualification → the bar is cleared (a fact).
 *    "fails"     — profile PROVES the firm lacks it → a show-stopper (NO_BID / INELIGIBLE driver).
 *    "unknown"   — null profile or no concrete attribute to check → cannot prove either → residual caution.
 *  Pure. */
// Closed SOCIOECONOMIC vocabulary (limit N5) — the ONLY attribute class a self-asserted
// capability statement may use to CLEAR an eligibility bar, normalized so the model's
// free-form requiredAttribute and the firm's certs match in canonical space rather than
// by brittle exact string. NAICS-SIZE, clearance, OEM/sole-source, QPL/QML and every
// STRUCTURAL bar are deliberately ABSENT: a firm cannot self-clear those (they require
// independent confirmation), so they never canonicalize → stay "unknown" → human review.
// Order matters — the most specific pattern first (EDWOSB before WOSB, SDVOSB before VOSB).
export function canonicalizeEligibilityAttr(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/\b8\s*\(?\s*a\s*\)?\b/.test(s) || /section\s*8\s*a/.test(s)) return "se:8a";
  if (/hubzone/.test(s)) return "se:hubzone";
  if (/service.?disabled.?veteran|\bsdvosb\b/.test(s)) return "se:sdvosb";
  if (/economically.?disadvantaged.?wom|\bedwosb\b/.test(s)) return "se:edwosb";
  if (/wom[ae]n.?owned|\bwosb\b/.test(s)) return "se:wosb";
  if (/veteran.?owned|\bvosb\b/.test(s)) return "se:vosb";
  return null;
}

// A bar whose text carries STRUCTURAL / SOLE-SOURCE / SIZE-STANDARD language can NEVER be
// cleared by a self-asserted socioeconomic cert — even if the bar also mentions a set-aside
// (e.g. an 8(a) SOLE-SOURCE to a named firm, or "8(a) AND small under the NAICS size
// standard"). The set-aside token must not let a firm silently erase the structural/size
// dimension bundled into the same bar (panel Finding 2). Such a bar falls through to
// "unknown" → human review, never a canonical self-clear.
// PRECISE discriminators only (panel A2-1/A2-2): each term unambiguously marks a
// structural / sole-source / SIZE-STANDARD bar — NOT incidental prose. Bare tokens that
// over-blocked legitimate pure set-asides (incumbent / employees / affiliat / "average
// annual") were dropped in favor of size-specific phrases, so a pure 8(a)/SDVOSB set-aside
// still self-clears, while "8(a) AND small (business) under NAICS / size standard / N
// employees / annual receipts" does not.
const NON_SELF_CLEARABLE_BAR_RE = /sole.?source|brand.?name|named (?:oem|manufacturer|source|dealer|firm|awardee)|single (?:source|approved|authorized)|non.?competit|directed award|\bQPL\b|\bQML\b|qualified (?:products?|manufacturers?) list|approved (?:source|manufactur)|technical data package|\bTDP\b|no substitut|proprietary|(?:security|secret|top[-\s]?secret|personnel|interim|active|dod)\b[^.\n]{0,25}?clearance|\bTS\/SCI\b|\bpolygraph\b|facility (?:clearance|certification|security)|size standard|other than small|exceed(?:s|ed)? the size|small (?:business )?(?:concern )?under\b|under the size|\d+\s+employees|number of employees|annual receipts|affiliation rule/i;

/** Grounding gate for a closed-world INELIGIBLE bar (Brain card 284 / I8). The BAR must come from the DOCUMENT: a
 *  closed-world profile trusts firm FACTS, it never licenses a model-NAMED requirement. The requiredAttribute (or,
 *  for a canonical `ns:value` label, its `value` segment) must be a normalized substring of the assembled source;
 *  otherwise it is a FABRICATED bar. Pure. */
export function requiredAttributeGrounded(requiredAttribute: string, source: string): boolean {
  const norm = (s: string) => s.replace(/[_:-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const nSrc = norm(source);
  if (nSrc.length === 0) return false;
  const full = norm(requiredAttribute);
  if (full.length >= 4 && nSrc.includes(full)) return true;
  // canonical namespace labels (e.g. "oem:dillon-approved-source", "naics:333120-small") — check the value segment.
  // Min length 4 so a contrived namespaced attr with a common 3-char value (e.g. "x:the") can't borrow a stopword
  // hit in source; a real bar's value language is longer. Residual over-grounding still fails safe (stays gated).
  const value = norm(requiredAttribute.includes(":") ? requiredAttribute.slice(requiredAttribute.indexOf(":") + 1) : requiredAttribute);
  return value.length >= 4 && nSrc.includes(value);
}

export function firmStatus(f: TypedFinding, profile: BidderProfile | null, source?: string): "satisfies" | "fails" | "unknown" {
  if (!profile || !f.requiredAttribute) return "unknown";
  // FORK-7 Finding-1 (Brain card 242, review-hardened) — an NMR finding the Fork-7 gate has processed (nmrGuard)
  // resolves via the NMR-canonical status: compliant token → satisfies; POSITIVE non-compliance token → fails
  // (→ INELIGIBLE); everything else (absence included) → unknown → NHR (absence is never proof of NMR
  // ineligibility — the walk-away class). GATED ON nmrGuard so, with the Fork-7 flag OFF, this is inert and
  // firmStatus is byte-identical to pre-diff (the keyfact NMR keeps its card-206-A unverified-gate path).
  if (f.nmrGuard === true && f.requiredAttribute === NMR_ATTRIBUTE) return nmrFirmStatus(profile);
  const held = profile.satisfiedAttributes ?? []; // ?? [] — sibling-consistent guard (nmrFirmStatus already does this); a profile missing the array must not throw mid-verdict
  // Exact attribute match (trusted/gold closed-world profile) — unchanged.
  if (held.includes(f.requiredAttribute)) return "satisfies";
  // Canonical SOCIOECONOMIC match — OPEN-WORLD ONLY (a self-asserted capability statement).
  // Restricted to open-world so a closed-world/gold profile is never flipped fails→satisfies
  // by a non-exact socioeconomic string (code-review #3). And it is BLOCKED when the bar
  // carries structural/sole-source/size language (Finding 2) — a self-asserted set-aside cert
  // may clear a PURE set-aside eligibility bar, never a bundled structural/size show-stopper.
  // OPEN-WORLD is now the DEFAULT (Brain card-254 B): run this block unless the profile is EXPLICITLY closed-world.
  if (!profile.closedWorld) {
    const reqCanon = canonicalizeEligibilityAttr(f.requiredAttribute);
    if (reqCanon && held.some((a) => canonicalizeEligibilityAttr(a) === reqCanon)) {
      const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
      if (!NON_SELF_CLEARABLE_BAR_RE.test(hay)) return "satisfies";
      // bundled structural/size bar → don't self-clear; fall through to unknown (human review).
    }
    // OPEN-WORLD: a not-held attribute is NOT proof the firm fails — it may simply be
    // unstated → "unknown" (caution / human review), never a false INELIGIBLE.
    return "unknown";
  }
  // CLOSED-WORLD (trusted complete profile, e.g. gold): not-held = provably fails — BUT the BAR must come from the
  // DOCUMENT (Brain card 284 / I8). A closed-world profile trusts firm FACTS; it never licenses a model-NAMED
  // requirement. An UNGROUNDED requiredAttribute (not a normalized substring of the assembled source) is a
  // FABRICATED bar → fail SAFE to "unknown" (→ NHR), never a false INELIGIBLE. Grounded → unchanged. Gated on
  // `source` presence so pure-unit callers (no source) are byte-identical; the orchestrator threads ctx.fullSource.
  if (source !== undefined && !requiredAttributeGrounded(f.requiredAttribute, source)) return "unknown";
  return "fails";
}

// BRAIN CARD 226 FORK 2 — the UNIVERSAL_DEFECT allowlist. A committal NO_BID is reachable ONLY on a POSITIVE
// match to one of these classes (the solicitation contradicts itself, or is literally unmeetable by ANY
// offeror). Exhaustive today — no producer emits `universalDefect` yet, so NO_BID is DEFAULT-DENY until a
// finding is positively classified a universal defect. A who-can-win restriction is NEVER on this list (Ruling A:
// named-brand / sole-source / set-aside / size / QPL / clearance are who-can-win, not universal).
const UNIVERSAL_DEFECT_CLASSES: ReadonlySet<string> = new Set(["contradictory_mandatory_terms", "unmeetable_by_any_offeror"]);
function isUniversalDefect(f: TypedFinding): boolean {
  return f.universalDefect != null && UNIVERSAL_DEFECT_CLASSES.has(f.universalDefect);
}

// ── FORK-5 (Brain card 240) — VERIFICATION EVIDENCE for a committal NO_BID ───────────────────────────
/** sha256 of a grounded excerpt — the Rule-64 binding for a verified universal-defect mark. Deterministic, pure. */
export function excerptHash(excerpt: string): string { return createHash("sha256").update(excerpt ?? "", "utf8").digest("hex"); }

// ── FORK-5 HARDENING (Brain card 242, adversarial-review Finding 3) — VERIFIER ALLOWLIST ───────────────
// The wall-BEFORE-producer twin of the tristate coupling-lock (UNIVERSAL_DEFECT_PRODUCERS): a `verifiedBy` record
// only counts if its verifierId belongs to a REGISTERED, independent verifier. EMPTY today (no verifier registers)
// → every universalDefect mark is unverified → NHR in prod until J-1/J-2 registers a real verifier. This closes
// the self-signed-verifier hole surfaced in review: a self-asserted / unregistered verifierId can NEVER reach NO_BID.
// SECURITY (adversarial review): registration MUST be boot-only from STATIC trusted config — never from request-
// or model-controlled data. `verifierId` is a model-shaped finding field; if an attacker could both register an id
// and supply a matching `verifiedBy.verifierId`, that is privilege-escalation to a committal NO_BID. Today: empty,
// zero callers, so NO_BID is unreachable (default-deny). `_clearVerifiers` is a TEST seam (twin of
// `_clearUniversalDefectProducers`) — never call it in a request path (it would wipe NO_BID capability process-wide).
const VERIFIER_ALLOWLIST = new Set<string>();
/** Register an independent verifier permitted to affirm a committal universal defect (Fork-5, card 242). BOOT-ONLY. */
export function registerVerifier(id: string): void { if (id) VERIFIER_ALLOWLIST.add(id); }
/** Tests only — restore the allowlist to its empty prod state. */
export function _clearVerifiers(): void { VERIFIER_ALLOWLIST.clear(); }
/** A `universalDefect` mark is VERIFIED (may drive NO_BID) ONLY when it is GROUNDED, carries a well-formed
 *  `verifiedBy` from a REGISTERED verifier, and its `excerptHash` matches sha256 of the finding's excerpt.
 *  INTEGRITY NOTE (adversarial review): the source-truth control is `grounded===true` (a deterministic substring
 *  check against real source, audit-expert.ts) — that is what stops a fabricated/hallucinated excerpt. The
 *  `excerptHash` is a verify-time↔decide-time CONSISTENCY binding (the excerpt the verifier affirmed is byte-for-
 *  byte the one being decided on, even after later excerpt repair), NOT itself a proof of source authenticity. The
 *  allowlist ensures only an independent registered verifier's affirmation counts. Pure. */
export function isVerifiedUniversalDefect(f: TypedFinding): boolean {
  if (!isUniversalDefect(f)) return false;
  // The excerpt must be GROUNDED (deterministically present in source) and NON-EMPTY — this is the real integrity
  // control: the hash of a hallucinated span, or the known-constant sha256("") of an empty excerpt, must NEVER pass.
  if (f.grounded !== true || (f.excerpt ?? "").length === 0) return false;
  const v = f.verifiedBy;
  return !!v
    && typeof v.verifierId === "string" && v.verifierId.length > 0
    && VERIFIER_ALLOWLIST.has(v.verifierId)  // Fork-5 hardening (card 242 Finding 3): the verifier must be REGISTERED — a self-signed/unregistered id can never reach NO_BID
    && typeof v.affirmation === "string" && v.affirmation.length > 0
    && typeof v.excerptHash === "string" && v.excerptHash === excerptHash(f.excerpt);
}
/** FORK-5 fail-safe log — a marked-but-unverified committal is an invariant breach (a producer emitted a NO_BID
 *  mark without the required evidence). Logged (not thrown — that's the tristate coupling-lock's job) so the
 *  audit fails SAFE to NHR while surfacing the breach. Guarded so a logger failure never affects the verdict. */
function logInvariantBreach(msg: string): void { try { console.warn(`[engine-invariant-breach] ${msg}`); } catch { /* logging must never affect the verdict */ } }

// ── BRAIN CARD 228 RULING (i) — COUPLING-LOCK MOVED TO BOOT / REGISTRATION-TIME ────────────────────────────
// A universalDefect producer may run ONLY when a POSITIVE eligibility determination is reachable (tristate ON).
// The lock is now enforced at REGISTRATION/INIT (the process refuses to start) — never mid-audit as the default.
// A config error is NOT an uncertain document input, so it must NEVER surface as an NHR verdict (NHR PROHIBITED).
// The decision-time check below is retained ONLY as a backstop (a producer registered dynamically after boot);
// when it fires, the audit BOUNDARY converts it to a BILLING-SAFE FAILED STATE (no charge, logged config error)
// — never a raw 500, never an NHR verdict.

/** Engine config/ordering invariant breach. Thrown at registration/boot (Ruling i) and as a decision-time
 *  backstop / precedence pre-lock (Ruling ii). The audit boundary catches it → billing-safe terminal failure
 *  (thrown BEFORE persist ⇒ decrementAuditQuota never runs ⇒ no charge), NOT an NHR verdict, NOT a raw 500. */
export class EngineInvariantError extends Error {
  constructor(message: string) { super(message); this.name = "EngineInvariantError"; }
}

// Registry of producers that can positively mark a finding `universalDefect`. EMPTY today (no producer emits) →
// the check is a no-op in prod. A real producer self-registers at its module load; registering one while
// AUDIT_ELIGIBLE_TRISTATE is not "on" throws AT REGISTRATION (INIT), so the process refuses to start.
const UNIVERSAL_DEFECT_PRODUCERS = new Set<string>();
/** Register a universalDefect producer. Validates the coupling-lock AT REGISTRATION (Ruling i, INIT-time). */
export function registerUniversalDefectProducer(name: string): void {
  UNIVERSAL_DEFECT_PRODUCERS.add(name);
  validateUniversalDefectProducerConfig();  // fail at INIT (boot) — never mid-audit
}
/** Tests only — restore the registry to its empty prod state. */
export function _clearUniversalDefectProducers(): void { UNIVERSAL_DEFECT_PRODUCERS.clear(); }

/** BOOT/REGISTRATION-TIME coupling-lock (Ruling i). A registered universalDefect producer while tristate is OFF
 *  ⇒ throw at INIT (process refuses to start). No-op in prod (empty registry) and byte-identical when tristate ON. */
export function validateUniversalDefectProducerConfig(env: NodeJS.ProcessEnv = process.env): void {
  const tristate = env.AUDIT_ELIGIBLE_TRISTATE === "true";
  if (UNIVERSAL_DEFECT_PRODUCERS.size > 0 && !tristate)
    throw new EngineInvariantError(
      `FORK-2 coupling-lock (card 228 Ruling i, INIT): universalDefect producer(s) [${[...UNIVERSAL_DEFECT_PRODUCERS].join(", ")}] registered while AUDIT_ELIGIBLE_TRISTATE is not "on" — a committal NO_BID must carry a POSITIVE eligibility determination, never a default true. Enable the tristate or unregister the producer. Process refuses to start.`);
}
// Boot-time enforcement (belt-and-suspenders): runs at module load. No-op today (no producer self-registers),
// LOCKS the invariant the moment a universal-defect detector is wired without the tristate.
validateUniversalDefectProducerConfig();

const mk = (verdict: Verdict, eligible: boolean | null, reason: string, dispositions: DecidedFinding[], showStoppers: DecidedFinding[]): Decision =>
  ({ verdict, eligible, reason, dispositions, showStoppers });

// Doctrine #6 (Brain card 125) — an honest-fail verdict (INCOMPLETE / verifier-unsound NHR) must NOT assert
// eligible:false; "false" is an affirmative ineligibility claim and is itself false when the truth is
// "undetermined." Flag DEFAULT-OFF (=== "true"): ON → null ("not determined"); OFF → false, byte-identical to
// pre-flag behavior. A TRUE firm-credential bar (INELIGIBLE) always emits false and is NOT routed through here.
const honestFailEligible = (): boolean | null =>
  process.env.AUDIT_ELIGIBLE_TRISTATE === "true" ? null : false;

// Doctrine #2 (Brain card 125) — VERDICT-WORD INVARIANT (defensive backstop). INELIGIBLE asserts a FIRM-
// credential failure; it may stand ONLY when a real eligibility_bar show-stopper exists. A requirement-side
// impossibility (sole-source / brand-name-or-equal / universal supply) must route to NO_BID / NHR, never wear
// the credential label. Default-OFF (=== "true"). At the natural anchor the rule is tautologically satisfied
// (elig is derived from the same predicate); the value is catching a FUTURE refactor or any OTHER path that
// emits eligible:false. Exported for a $0 unit-proof against a crafted violation.
export function enforceVerdictWordInvariant(d: Decision): Decision {
  if (process.env.AUDIT_VERDICT_WORD_INVARIANT !== "true") return d;  // flag OFF → invariant does not run (byte-identical)
  if (d.eligible === false && !d.showStoppers.some((s) => s.kind === "eligibility_bar")) {
    if (process.env.NODE_ENV !== "production")
      throw new Error("invariant_violation:ineligible_without_eligibility_bar");  // dev/test: loud — catches the refactor
    // Production must NEVER crash a customer audit — refuse the INELIGIBLE label, route to human review.
    return { ...d, verdict: "NEEDS_HUMAN_REVIEW", eligible: null, reason: "invariant_violation:ineligible_without_eligibility_bar" };
  }
  return d;
}

// FABRICATION INVARIANT — the mechanic clause (Brain card #574, Option B by-construction). The single source of
// the "lead time exceeds the response window" mechanic literal: it is emitted ONLY by groundedMechanicClause, and
// ONLY when a finding carries a GROUNDED lead-time/possession-at-award basis. Reason templates hold no mechanic
// literal, so by construction no reason can assert a mechanic the findings don't ground. Returns "" when ungrounded.
const GROUNDED_LEADTIME_MECHANIC = " — lead time exceeds the response window";
function groundedMechanicClause(findings: Array<{ requirement?: string; excerpt?: string }>): string {
  return hasGroundedLeadTimeBasis(findings) ? GROUNDED_LEADTIME_MECHANIC : "";
}

// ── CLAUSE-KEYED TYPING FLOOR (Brain card #609-(2)a, flag AUDIT_CLAUSE_TYPING_FLOOR default-OFF) ──────────────
// Deterministic re-typing for a Brain-RATIFIED CLOSED clause set — closes the stochastic lens-typing divergence
// (cab687da: the lens emitted 52.219-14 as untyped bidder_cannot_move; the gold-set typed it bidder_controls+curable).
// For a finding whose OPERATIVE shape matches ONE of the ratified self-clearable clauses, stamp
// controllability=bidder_controls + curableInWindow=true + requiredAttribute, so disposeFinding yields gate_to_clear
// (a named caveat) instead of a disqualifying bar. SAFETY (Brain ruling): possession-frame OR long-lead/scarce-credential
// text OVERRIDES the floor — NEVER stamped curable (fail-closed on a hidden at-award possession or a clearance/QPL). The
// override is computed over requirement+EXCERPT only (NOT the citation label — the UCF section label "Insurance/Bonding"
// falsely trips the long-lead `bond` token; card #609-(4) collision). Flag-OFF ⇒ findings byte-identical.
// card #609-(8) part 2 — POSITIVE SELF-CLEARABLE SHAPE (not vocab-topic). Each arm requires the finding to positively
// exhibit a SELF-ACQUIRE / MAINTAIN OBLIGATION on the ordinary-course credential — a bare topic mention ("under the size
// standard", "in the System for Award Management", "licensure requirements apply") does NOT match, so an eligibility BAR
// that merely references the topic fails toward escalation ([[feedback_no_blocklist_shape_allowlist_doctrine]] + #507).
// 52.219-14 is matched on its specific clause identity (it IS the self-perform limitation); the rest require an obligation
// verb governing the credential. SIZE matches ONLY the self-CERTIFICATION shape (a size STANDARD the firm must meet is a
// who-can-win bar, never self-clearable — dropped). Combined with part-1 (attribute-bearers exempt) + the possession/
// long-lead override, a real 8(a)/HUBZone/size/scarce-licensure bar can never be floored.
const RATIFIED_TYPING_CLAUSES: Array<{ attr: string; re: RegExp }> = [
  // limitation-on-subcontracting: the clause is inherently a self-performance obligation the prime clears by staffing.
  { attr: "limitation_on_subcontracting_self_perform", re: /\b52\.219-14\b|limitation on subcontract|(?:self-?perform|perform)\w*\s+(?:at least\s+)?(?:50\s*%|the required percentage)/i },
  // SAM registration: require a REGISTER/REGISTRATION obligation adjacent to SAM — never a bare "System for Award Management" mention.
  { attr: "sam_registration", re: /\b52\.204-7\b|\b(?:register|registration|registered|registering)\b[^.\n]{0,25}\b(?:sam|system for award management)\b|\b(?:sam|system for award management)\b[^.\n]{0,25}\b(?:register|registration|registered|active registration)\b/i },
  // ordinary licensure: require a MAINTAIN/HOLD/OBTAIN/keep-current OBLIGATION on a license — not a bare "licensure requirements".
  { attr: "business_license_maintenance", re: /\b(?:maintain|obtain|keep|hold|carry|possess|acquire)\w*\s+(?:a\s+|the\s+|all\s+|any\s+|required\s+|applicable\s+|current\s+|valid\s+)*(?:state|business|professional|local|occupational|trade|operating)?\s*licens\w*|licens\w*\s+(?:must be|shall be|to be)\s+(?:maintained|obtained|kept current|renewed)/i },
  // size SELF-CERTIFICATION only (self-clearable); a size STANDARD the firm must meet is a who-can-win bar → NOT here.
  { attr: "size_standard_self_certification", re: /self-?certif\w*\s+(?:as\s+)?(?:a\s+)?small\b|(?:small business|size)\s+self-?certif\w*|represent\w*\s+(?:itself\s+)?as\s+(?:a\s+)?small\s+business/i },
  { attr: "insurance_maintenance", re: INSURANCE_DOWORK_RE },
];
export function applyClauseKeyedTypingFloor(findings: TypedFinding[], o: { enabled: boolean }): TypedFinding[] {
  if (!o.enabled) return findings;
  return findings.map((f) => {
    // Candidate: a still-UNTYPED disqualifying eligibility bar (never softens an already-typed or non-bar finding).
    if (f.kind !== "eligibility_bar" || f.controllability !== "bidder_cannot_move") return f;
    // card #609-(8) CARDINAL-SIN FIX (Brain ruling part 1): a requiredAttribute IS the who-can-win eligibility credential
    // (8(a)/HUBZone/size/socioeconomic — the firm must HOLD it; it is NOT self-acquirable in the response window). NEVER
    // floor an attribute-bearing bar — that demotes a real disqualifier to a gate-to-clear which bypasses firmStatus → a
    // false BID_WITH_CAUTION on a genuine eligibility failure. Mirrors applyPerfObligationInsuranceTyping's rule #2. The
    // cab687da target bars (52.219-14, insurance) are emitted with NO requiredAttribute, so the caveat fix is preserved.
    if (f.requiredAttribute) return f;
    const operative = `${f.requirement ?? ""} ${f.excerpt ?? ""}`;                // NB: NOT citation (Bonding label collision)
    // OVERRIDE (fail-closed): possession-at-award frame OR a scarce/long-lead credential ⇒ never stamp curable.
    if (hasPreAwardPossession(operative) || hasLongLeadCredential(operative)) return f;
    const match = RATIFIED_TYPING_CLAUSES.find((c) => c.re.test(operative));
    if (!match) return f;
    return { ...f, controllability: "bidder_controls" as Controllability, curableInWindow: true, requiredAttribute: f.requiredAttribute ?? match.attr };
  });
}

/** Derive the verdict deterministically from typed grounded findings. The LLM experts supply the FACTS
 *  (requirement + grounded excerpt + kind + controllability); this code makes the DECISION. The ladder is
 *  the same one that used to live in the chief-judge prompt — relocated from prose to TypeScript so it is
 *  stable, reproducible, and auditable. */
// ═══ SELF-CLEARABLE PACKAGE recognizer — card #590 Modified-B (flag AUDIT_SELF_CLEARABLE_PACKAGE, default-OFF) ═══
// POSITIVE-shape, verifier-SOVEREIGN (only reached AFTER deriveVerdict's verifierSound gate + coverage/documents gates +
// show-stopper gates), typed-input-to-deriveVerdict (never its own verdict). A package is self-clearable IFF EVERY
// disqualifying bar is bidder-self-determinable AND fully typed AND curable, and NO long-lead/scarce credential appears
// anywhere decision-bearing, and no disqualifying bar carries an at-award/possession frame. ANY exclusion ⇒ null (inert)
// ⇒ the existing NHR/INELIGIBLE ladder is byte-identical. On eligible, deriveVerdict floors to BID_WITH_CAUTION with the
// FULL named self-cert caveat list (never a plain BID). Red-team: packages that LOOK self-clearable but hide a
// CMMC/clearance/QPL bar, an at-award possession frame, or an untyped bar. Flag-OFF ⇒ never called ⇒ byte-identical.
const selfClearablePackageEnabled = () => process.env.AUDIT_SELF_CLEARABLE_PACKAGE === "true";
const incompletePrecedenceEnabled = () => process.env.AUDIT_INCOMPLETE_PRECEDENCE === "true"; // Brain #664 — documentsComplete=false not subordinate to coverage-pole NHR
function selfClearablePackageBars(dispositions: DecidedFinding[]): DecidedFinding[] | null {
  const live = dispositions.filter((f) => f.disposition !== "dropped");
  const hayOf = (f: DecidedFinding) => `${f.requirement ?? ""} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
  // The self-cert bars to ENUMERATE (Brain: "every bidder_controls bar" — SAM, licensure, insurance, size). No self-cert
  // eligibility bar to caveat ⇒ this is not the recognizer's case (a genuinely clean package keeps its own ladder pole).
  const selfCertBars = live.filter((f) => f.kind === "eligibility_bar" && f.controllability === "bidder_controls");
  if (selfCertBars.length === 0) return null;
  // PACKAGE-WIDE exclusion: a long-lead/scarce credential ANYWHERE decision-bearing (even mis-typed to a non-bar) means
  // the package is not clearable by an ordinary small business — the buried-CMMC/clearance/QPL red-team.
  for (const f of live) if (hasLongLeadCredential(hayOf(f))) return null;
  // ANY DISQUALIFYING bar must be bidder-self-determinable, TYPED, curable, and carry no at-award possession frame.
  // A single non-self-clearable disqualifier ⇒ the package is NOT self-clearable ⇒ inert (existing NHR/INELIGIBLE ladder).
  for (const f of live.filter((f) => f.disposition === "disqualifying")) {
    if (f.controllability === "no_one_can_move") return null;                             // universal impossibility
    if (f.controllability === "bidder_cannot_move" && f.curableInWindow !== true) return null;   // no self-clear pathway
    if (!f.requiredAttribute || f.curableInWindow === undefined) return null;             // untyped disqualifier = ineligible, never ignorable
    if (f.curableInWindow === false) return null;                                         // non-curable structural bar
    if (hasPreAwardPossession(hayOf(f))) return null;                                     // at-award / possession frame
  }
  return selfCertBars;                                                 // enumerate the bidder-self-determinable eligibility bars
}

// ── PHASE-1 SHADOW · POSITIVE-SHAPE VERDICT POLE (Brain-approved cards #596/#597) ─────────────────────────
// Flag AUDIT_POSITIVE_VERDICT_POLE default-OFF. SHADOW ONLY — computed BESIDE deriveVerdict and BANKED; NEVER
// authoritative (the live verdict is untouched ⇒ flag-OFF byte-identical). Mirrors the NO_BID pole's positive-
// allowlist / default-deny doctrine onto the NHR pole: ONLY a kill-shot-CLASS candidate in the DECIDING SET may veto;
// every other finding is enrichment (advisory-by-construction — cannot veto, even if a lens mis-typed its
// controllability). BINDING-a: unknown/unclassifiable kill-shot → NHR (positive-shape bounds vetoes, never caps honest
// uncertainty). Package gates split HARD (ingestion/integrity → honest-fail STANDS) vs SOFT (interpretive → a FIXED,
// corpus-tuned budget, zero learned params — Brain design-rulings 1+2). Triage runs AFTER the lens sweep as a
// deciding-vs-enrichment re-partition of the existing findings (Brain design-ruling 3).
export type KillShotClass = "socioeconomic_eligibility" | "size_standard" | "nmr_applicability" | "hard_credential" | "at_award_possession" | "bonding" | "limitation_on_subcontracting" | "mandatory_hard_gate";
export interface ShadowVerdict {
  verdict: Verdict; reason: string;
  decidingCount: number; enrichmentCount: number;
  killShotClasses: KillShotClass[]; vetoes: string[];
  softBudget: { disqualifierUncovered: number; noticeBodyBarUngrounded: boolean; unreadEvidence: number; tripped: boolean };
  hardGate: string | null;
}
const NMR_SHAPE_RE = /non-?manufacturer|52\.219-33/i;
/** POSITIVE kill-shot CLASS classifier — keyed on typed signals + the existing positional detectors, NEVER a bar-vocab
 *  blocklist ([[feedback_no_blocklist_shape_allowlist_doctrine]]). Returns null ⇒ ENRICHMENT (cannot veto). The class
 *  sub-labels (bond/limitation/etc.) are DIAGNOSTIC only — the actual veto/no-veto is decided by SHAPE downstream
 *  (recognizer: typed + curable + no possession), never by these labels. */
function killShotClass(f: TypedFinding, naics: string | null | undefined): KillShotClass | null {
  const hay = `${f.requirement ?? ""} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""} ${f.citation ?? ""}`;
  // NMR-applicability (folds R3a, the legally-correct fix): 52.219-33 is a kill-shot ONLY on a supply NAICS. On a
  // services/construction NAICS the rule is DORMANT (13 CFR 121.406(b)(3)-(4)) ⇒ enrichment, never a veto. A null NAICS
  // fails toward INCLUDE (cannot confirm dormancy ⇒ leave it a candidate → BINDING-a routes an untyped one to NHR).
  if (NMR_SHAPE_RE.test(hay)) return (isNmrApplicableNaics(naics) || !naics) ? "nmr_applicability" : null;
  // Positional at-award / long-lead detectors (catch a mis-typed buried kill-shot — the recognizer's red-team).
  if (hasLongLeadCredential(hay)) return "hard_credential";
  if (hasPreAwardPossession(hay)) return "at_award_possession";
  // A TYPED eligibility bar is a kill-shot candidate by construction (positive: kind=eligibility_bar).
  if (f.kind === "eligibility_bar") {
    if (/\bbond\b|bid guarantee|performance bond|payment bond/i.test(hay)) return "bonding";
    if (/limitation on subcontract|52\.219-14/i.test(hay)) return "limitation_on_subcontracting";
    if (canonicalizeEligibilityAttr(f.requiredAttribute ?? "") || /set-?aside|8\(a\)|hubzone|sdvosb|wosb|edwosb|vosb/i.test(hay)) return "socioeconomic_eligibility";
    if (/size standard|small business (size|concern)/i.test(hay)) return "size_standard";
    return "mandatory_hard_gate";
  }
  // Everything else (technical_spec · pricing · submission · past_performance · clause_flowdown · other · boilerplate ·
  // procedural_obligation) is ENRICHMENT — cannot veto even if mis-typed bidder_cannot_move (the LBJ CPARS case).
  return null;
}
/** Compute the Phase-1 SHADOW verdict over the SAME VerdictInputs deriveVerdict sees. Pure; reuses deriveVerdict's own
 *  helpers so the two poles share vocabulary. Verdict-inert (the caller banks it, never routes on it). */
export function deriveShadowVerdict(inp: VerdictInputs, opts?: { naics?: string | null }): ShadowVerdict {
  const naics = opts?.naics ?? null;
  const findings = inp.findings ?? [];
  const anyInp = inp as unknown as { coverageV2?: { disqualifierUncovered?: unknown[]; unreadable?: unknown[] }; noticeBodyBarUngrounded?: boolean; unreadEvidence?: unknown[]; setAsideConflict?: unknown };
  // TRIAGE — re-partition AFTER the lens sweep into deciding (kill-shot candidates) vs enrichment.
  const classOf = new Map<TypedFinding, KillShotClass>();
  for (const f of findings) { const k = killShotClass(f, naics); if (k) classOf.set(f, k); }
  const deciding = findings.filter((f) => classOf.has(f));
  const enrichmentCount = findings.length - deciding.length;
  const killShotClasses = [...new Set(classOf.values())];
  const cov2 = anyInp.coverageV2 ?? {};
  const softBudget = { disqualifierUncovered: (cov2.disqualifierUncovered ?? []).length, noticeBodyBarUngrounded: !!anyInp.noticeBodyBarUngrounded, unreadEvidence: (anyInp.unreadEvidence ?? []).length, tripped: false };
  const mk = (verdict: Verdict, reason: string, extra?: Partial<ShadowVerdict>): ShadowVerdict =>
    ({ verdict, reason, decidingCount: deciding.length, enrichmentCount, killShotClasses, vetoes: [], softBudget, hardGate: null, ...extra });

  // ── HARD package gates (ingestion/integrity → honest-fail STANDS) ──
  if (inp.primaryIndeterminate) return mk("NEEDS_HUMAN_REVIEW", "HARD: no base solicitation identified", { hardGate: "primaryIndeterminate" });
  if (anyInp.setAsideConflict) return mk("NEEDS_HUMAN_REVIEW", "HARD: set-aside conflict — eligible pool ambiguous", { hardGate: "setAsideConflict" });
  // COVERAGE/MANIFEST AUTHORITY (Brain #599-1): the GATE_V2 outcome, NOT the legacy `documentsComplete` boolean (retired
  // — it was contaminated by the false-INCOMPLETE root). Mirrors deriveVerdict's own coverage ladder exactly: GATE_V2
  // outcome when coverageV2 is present (INCOMPLETE cap = unreadable ingest; NHR cap = uncovered real disqualifier), else
  // the legacy coverageComplete fallback for pre-GATE_V2 records. This subsumes the old manual disqualifierUncovered SOFT
  // check (that bucket IS the GATE_V2 NHR cap).
  if (inp.coverageV2) {
    // B3: findings threaded so the banner can rank a TYPED eligibility_bar above a merely bar-shaped sentence.
    // Flag-OFF (`AUDIT_BANNER_BAR_RANKING`) the arg is ignored and `[0]` is selected exactly as before.
    const v2 = gateV2Outcome(inp.coverageV2, { findings: inp.findings });
    if (v2.cap === "INCOMPLETE") return mk("INCOMPLETE", `HARD (GATE_V2 coverage): ${v2.reason}`, { hardGate: "gateV2:incomplete" });
    if (v2.cap === "NEEDS_HUMAN_REVIEW") { softBudget.tripped = true; return mk("NEEDS_HUMAN_REVIEW", `GATE_V2 coverage cap — uncovered disqualifier: ${v2.reason}`, { hardGate: "gateV2:nhr" }); }
  } else if (inp.coverageComplete === false) {
    return mk("INCOMPLETE", "HARD: coverage not complete (legacy record, no coverageV2)", { hardGate: "coverageComplete" });
  }

  // ── DECIDING-SET soundness (the shadow verifier over the SMALL set — the whole thesis) ──
  // A deciding kill-shot candidate that is UNGROUNDED cannot be trusted → NHR (BINDING-a). Note: the shadow does NOT
  // read inp.verifierSound — that was soundness over the OLD ~90-finding set; the shadow's soundness is the deciding set.
  const decidingUngrounded = deciding.filter((f) => (f as unknown as { grounded?: boolean }).grounded === false);
  if (decidingUngrounded.length) return mk("NEEDS_HUMAN_REVIEW", `BINDING-a: ${decidingUngrounded.length} deciding kill-shot candidate(s) ungrounded → NHR`, { vetoes: decidingUngrounded.map((f) => f.citation) });

  // ── POSITIVE VETO over the deciding set ──
  const dispositions: DecidedFinding[] = deciding.map((f) => ({ ...f, disposition: disposeFinding(f) }));
  const provenFails = deciding.filter((f) => firmStatus(f, inp.bidderProfile, inp.source) === "fails");
  if (provenFails.length) return mk("INELIGIBLE", `Proven ineligible on ${provenFails.length} deciding gate(s)`, { vetoes: provenFails.map((f) => f.citation) });
  const decidingBars = dispositions.filter((d) => d.disposition === "disqualifying");
  // BINDING-a: an untyped deciding bar is unclassifiable → NHR (never a silent pass).
  const untypedBars = decidingBars.filter((f) => !f.requiredAttribute || f.curableInWindow === undefined);
  if (untypedBars.length) return mk("NEEDS_HUMAN_REVIEW", `BINDING-a: ${untypedBars.length} deciding disqualifying bar(s) unclassifiable (untyped) → NHR`, { vetoes: untypedBars.map((f) => f.citation) });
  // A real, non-self-clearable structural bar in the deciding set → NHR.
  const hardBars = decidingBars.filter((f) => f.controllability === "no_one_can_move" || (f.controllability === "bidder_cannot_move" && f.curableInWindow !== true) || f.curableInWindow === false);
  if (hardBars.length) return mk("NEEDS_HUMAN_REVIEW", `${hardBars.length} deciding structural bar(s) not bidder-self-determinable → NHR`, { vetoes: hardBars.map((f) => f.citation) });

  // NOTE (Brain #599-1): the disqualifierUncovered SOFT check is now the GATE_V2 NHR cap above (single authority) — a
  // record WITH coverageV2 and an uncovered real disqualifier already returned NHR there. softBudget stays reported for
  // diagnostics. noticeBodyBarUngrounded / unreadEvidence remain interpretive signals (advisory; not a unilateral veto).

  // ── COMMITTAL — every deciding kill-shot is bidder-self-determinable (or there are none) ──
  // ASYMMETRY CAP (mirrors deriveVerdict routes 21/22): never COMMIT over an incomplete manifest — a package whose
  // binding manifest was not fully read cannot green-light, even with a clean deciding set. Corpus-surfaced gap
  // (FA442726Q1068 8eab14c2 committed BID over manifestComplete=false). documentsComplete=false is already a HARD gate
  // above; this catches the computed manifestComplete=false case. → INCOMPLETE, an honest-fail, never a caution.
  // ⚠ ROOT-2 (Brain #648) PHASE-2 DEPENDENCY: this shadow pole retired `documentsComplete` (contaminated by the OLD
  // false-INCOMPLETE root) and caps ONLY on `manifestComplete`. ROOT-2's dropped-doc completeness truth (the EXISTS
  // denominator, agenticManifestComplete via the v2 resourceLinks cross-check) flows into `documentsComplete`, NOT
  // this `manifestComplete` input — so on the AUTHORITATIVE deriveVerdict pole it caps at 1b (:3255), but here it
  // does NOT. That is safe TODAY (this pole is flag-OFF/report-only, never authoritative — AUDIT_POSITIVE_VERDICT_POLE).
  // BEFORE any Phase-2 flip that makes this pole authoritative, the reconciliation truth MUST be re-threaded here
  // (either read documentsComplete for the dropped-doc case, or AND opts.manifestComplete into the manifestComplete
  // input at orchestrator:2757) or #648 reopens under the flip. Proven in the ROOT-2 gauntlet; residual in the design.
  const manifestIncomplete = (inp as unknown as { manifestComplete?: boolean }).manifestComplete === false;
  const scBars = selfClearablePackageBars(dispositions);
  if (manifestIncomplete) return mk("INCOMPLETE", `Deciding set clears but the binding manifest is incomplete — honest-fail, never a commit over an unread manifest`, { hardGate: "manifestComplete", vetoes: (scBars ?? []).map((f) => f.citation) });
  if (scBars && scBars.length) return mk("BID_WITH_CAUTION", `Self-clearable package — ${scBars.length} bidder-self-determinable eligibility bar(s); ${enrichmentCount} enrichment finding(s) advisory`, { vetoes: scBars.map((f) => f.citation) });
  return mk("BID", `Clean BID — deciding set (${deciding.length}) carries no disqualifying or self-cert bar`);
}

export function deriveVerdict(inp: VerdictInputs): Decision {
  // ── NULL-PROFILE ELIGIBILITY GUARANTEE (Brain card 206-A), single flag AUDIT_ELIGIBLE_TRISTATE, default-OFF.
  //    Graduates the tristate + adds two paired behaviors — ONE guarantee: the engine never asserts a firm is
  //    ELIGIBLE for an eligibility gate it could not VERIFY (null/unverified profile). Flag OFF ⇒ every branch
  //    below is byte-identical to pre-card behavior (guarded). Grounding rules untouched.
  const tristate = process.env.AUDIT_ELIGIBLE_TRISTATE === "true";
  // (a) MANDATORY FIRM-STATUS TYPING lives in the ORCHESTRATOR guard chain (applySetAsideFirmStatusGate, now also
  //     enabled by AUDIT_ELIGIBLE_TRISTATE) so the re-typed finding propagates to BOTH the persisted/rendered
  //     findings grid AND this decision — never a grid-vs-verdict divergence (code-review #1). So by here a
  //     null-profile already_satisfied set-aside is ALREADY a bidder_controls verify-caution.
  // §M EVIDENCE-FACTOR DEMOTION (Brain card #538 · AUDIT_MM_EVIDENCE_FACTOR_DEMOTION, default-OFF, Rule 61). A §M
  // evaluation/technical criterion whose substance is EVIDENCED INSIDE the submitted quote (capability statement /
  // past-performance / prior-experience narrative) is re-typed from a would-be non-curable bar to a curable
  // competitive caution BEFORE disposition, so it routes to the BID_WITH_CAUTION floor (branch 5c) — never the
  // non-curable / show-stopper poles. R2 vetoes (coupled true bar / possession-at-offer / who-may-bid ambiguity)
  // escalate; R3 source-contradiction ("preferred/not required") demotes. Flag OFF ⇒ inp.findings passes through
  // untouched ⇒ every branch below is byte-identical.
  const mmDemote = process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION === "true";
  const decidedFindings = mmDemote ? inp.findings.map((f) => demoteMmEvidenceFactor(f, inp.source)) : inp.findings;
  const dispositions: DecidedFinding[] = decidedFindings.map((f) => ({ ...f, disposition: disposeFinding(f) }));
  // (b/c) UNVERIFIED ELIGIBILITY GATES — a PROFILE-DEPENDENT eligibility gate (kind eligibility_bar carrying a
  //     specific requiredAttribute credential to check) the profile does not PROVE the firm satisfies. On a
  //     committal verdict these force eligible=null ("not determined", never a false green) + a mandatory
  //     verify-caution. requiredAttribute is REQUIRED so an attribute-less/bidder-controllable eligibility item
  //     (e.g. generic SAM registration) never false-fires a "not determined" on a verified firm (code-review #3/#4).
  //     A finding DEMOTED by the §M evidence-factor gate (card #538 R1) is EXCLUDED even though its kind/
  //     requiredAttribute survive the demote: it is a competitive caution, not an eligibility gate, and letting it
  //     through re-injects the "ELIGIBILITY NOT VERIFIED — confirm <ML-authored attribute>" framing the demote exists
  //     to remove (ultra #240 Finding B). The `mmEvidenceFactor` marker is LOAD-BEARING on this one filter.
  const unverifiedGates = dispositions.filter((f) => f.kind === "eligibility_bar" && !!f.requiredAttribute && !f.mmEvidenceFactor && firmStatus(f, inp.bidderProfile, inp.source) !== "satisfies");
  // GUARD 1 — the DETERMINISTIC manifest-sourced signal joins the finding-derived unverifiedGates. It fires the SAME
  //   "eligibility not verified" clamp WITHOUT depending on the proposer having emitted a correctly-typed
  //   eligibility_bar finding: the sealed construction manifest detected a set-aside in source under a null profile,
  //   so a committal verdict must not assert eligible=true. Only bites under the tristate; undefined ⇒ byte-identical.
  const manifestUnverifiableGate = inp.detectedUnverifiableEligibilityGate === true;
  const eligibilityUnverified = tristate && (unverifiedGates.length > 0 || manifestUnverifiableGate);
  const committalEligible = (): boolean | null => (eligibilityUnverified ? null : true);
  const committalCaution = (): string => {
    if (!eligibilityUnverified) return "";
    // Dedup (ultra #240 side-find): multiple findings carrying the SAME attribute rendered "setaside:WOSB" 5× in the
    // live Gate-3 clamp — customer-facing text lists each distinct gate once.
    const gates = unverifiedGates.length ? [...new Set(unverifiedGates.map((g) => g.requiredAttribute || g.requirement))].join("; ") : "the set-aside / socioeconomic eligibility gate";
    // Coherence (Brain #329 follow-up): the parenthetical must be TRUE to the input — a customer WITH a capability
    // statement on file was wrongly told "(bidder profile not provided)". When a profile IS present but does not
    // establish these specific gates (e.g. an SDVOSB cert vs a size/NMR/HUBZone gate; size/NMR are non-self-clearable),
    // say so. Null profile → unchanged wording (byte-identical for the no-profile callers).
    const provenance = inp.bidderProfile == null ? "bidder profile not provided" : "your profile on file does not establish these";
    return `⚠ ELIGIBILITY NOT VERIFIED — confirm ${gates} before relying on award eligibility (${provenance}). `;
  };
  const nhrEligible = (): boolean | null => (tristate ? null : true); // honest-fail NHR → null under the flag; OFF ⇒ true (unchanged)

  // ── VERDICT ARC (move 4/5, Brain card #668) — TEMPORAL DISPOSITION, flag AUDIT_TEMPORAL_VERDICT default-OFF ──
  //    Flag OFF, or the orchestrator did not thread the snapshot/today ⇒ temporal === null ⇒ every branch below is
  //    BYTE-IDENTICAL (no read, no write of temporalClosed). The disposition is computed by the PURE
  //    deriveTemporalDisposition, which — per the panel non-negotiable — returns CLOSED ONLY on live-confirmed
  //    currency (a snapshot date can never drive NO_BID; the missing doc may BE the extending amendment) AND a
  //    complete ingested amendment set. `ingestedAmendmentComplete ?? false` fails conservative: an unsupplied
  //    completeness signal is treated as incomplete ⇒ INDETERMINATE, never a false CLOSED.
  const temporal: TemporalDisposition | null =
    process.env.AUDIT_TEMPORAL_VERDICT === "true" && inp.temporalSnapshot && inp.today
      ? deriveTemporalDisposition(inp.temporalSnapshot, inp.liveSam ?? null, inp.ingestedAmendmentComplete ?? false, inp.today, inp.nowIso ?? null)
      : null;
  // CLOSED DOMINATES (design move 6): you cannot bid a closed solicitation regardless of read-completeness or which
  //   document is the base. eligible = null — a closed sol is a temporal fact, not an assertion the firm is ineligible
  //   (also sidesteps the verdict-word invariant, which only bites eligible===false). Distinct render via temporalClosed.
  if (temporal?.kind === "CLOSED")
    return { ...mk("NO_BID", null,
      `This solicitation is closed — ${temporal.reason} (${temporal.evidence}). A bid is no longer possible; monitor SAM for the recompete.`,
      dispositions, []), temporalClosed: true };
  // INDETERMINATE currency (live fetch failed / unread amendment / no decisive live signal) — the exact analog of an
  //   INCOMPLETE manifest read: it may NOT precede a real read bar (a proven show-stopper still wins below), and it
  //   need not override the honest NHR branches (those already escalate); it ONLY caps a would-be COMMITTAL
  //   (self-clearable BWC / curable BWC / default BID) to INCOMPLETE. Wired at those exits alongside manifestIncomplete.
  const temporalIndeterminate = temporal?.kind === "INDETERMINATE";
  const temporalCapReason = temporalIndeterminate ? (temporal as Extract<TemporalDisposition, { kind: "INDETERMINATE" }>).reason : "";

  // ── VERDICT ARC (move-4, Brain cards #668 → #677) — DETERMINISTIC SET-ASIDE BACKSTOP, flag
  //    AUDIT_SETASIDE_BACKSTOP default-OFF (SHADOW-ONLY). Flag OFF, or no source ⇒ setAsideBackstop === null ⇒
  //    capCommittal is identity ⇒ every committal exit (4b/5c/6) is BYTE-IDENTICAL.
  //
  //    PART A IS RETIRED (Brain Q3 ruling 2026-07-22, card #677, panel 3/3). The prose possession-frame detector
  //    that used to run here — 4 restriction frames, offer-time anchor set, exclusion stack, clearance/vehicle/
  //    CMMC/spec-reg classes — is DELETED, not shadowed. Grounds: a third grade-D across three architectures; H1
  //    killed by execution (the class-term allowlists gated SUPPRESSION too, so an unlisted phrasing produced a
  //    false NHR over a proven-met bar); vehicle_holder phantom on the SAM surface (FAR 5.202, 0 fires in 40);
  //    and the placebo-floor danger of an inert construct occupying the false-BID backstop seat. Specimens:
  //    ceo/GRAVEYARD-HARDBAR-PART-A.md — they gate nothing. Do NOT rebuild it here.
  //
  //    WHAT REMAINS is not a prose detector: it keys on STRUCTURED signals only (RULING-3 union of clause-matrix
  //    set-aside notices ∪ SAM's `setAside` metadata) and caps at BWC — it can never reach NHR (ruling 3:
  //    NHR-on-set-aside is the product-killing pole). Each disposed finding carries its CANONICAL set-aside
  //    program so suppression matches on program identity rather than text overlap (GAUNTLET R1 BRK-5: the lens
  //    grounds §L prose while the detector keys the matrix row — two textual homes that never share a word-run).
  //    It runs ONLY at the committal exits, past every show-stopper / NHR / INCOMPLETE / CLOSED / temporal-
  //    INDETERMINATE return, so it can never override a real bar or an honest fail. Downgrade-only.
  //
  //    NOT THE FALSE-BID BACKSTOP: per the re-scoped PANEL RULING 1, veto retirement is gated on MEASURED
  //    false-BID = 0 on the v2 obligation ledger at retirement time. This module's existence satisfies nothing.
  const setAsideBackstop: SetAsideBackstopDisposition | null =
    process.env.AUDIT_SETASIDE_BACKSTOP === "true" && inp.source
      ? deriveSetAsideBackstop(
          // program key: the positive-set-aside classifier first, then the finding's OWN canonical attribute —
          // findingSetAsideCanon carries several deliberate vetoes (size-disqualification, subcontracting-goal, …)
          // that correctly stop it CREATING a pool, but a finding already carrying `se:*`/`sb:total` names its
          // program regardless, and using it only to SUPPRESS is always the safe direction.
          dispositions.map((d) => ({
            f: d as TypedFinding,
            disposition: d.disposition,
            // (identity passthrough last: canonicalizeEligibilityAttr maps VARIANT spellings onto the canonical
            // space and returns null for a value that is already canonical, so `sb:total` would otherwise resolve
            // to nothing and the suppression would silently never match.)
            setAsideProgram: setAsideBackstopFindingProgram(d as TypedFinding),
          })),
          setAsideBackstopNotices(inp.source, inp.samSetAside),
        )
      : null;
  const capCommittal = (d: Decision): Decision => {
    // guard: only a committal (BID/BWC) is capped; any non-committal reaching here is returned untouched.
    if (!setAsideBackstop || (d.verdict !== "BID" && d.verdict !== "BID_WITH_CAUTION")) return d;
    // BWC cap — floor to BID_WITH_CAUTION, eligible=null (not determined past an unaccounted-for set-aside pool),
    // prepend the named caveat to whatever committal reason we were about to emit. There is no NHR path here by
    // construction: the backstop's cap type is the BWC literal.
    return enforceVerdictWordInvariant(mk("BID_WITH_CAUTION", null, `${setAsideBackstop.reason} ${d.reason}`.trim(), d.dispositions, d.showStoppers));
  };

  // 0. PRIMARY INDETERMINATE (Gauntlet Card #370 R1) — before any coverage/eligibility reasoning: on a multi-doc package
  //    where NO document confidently reads as the base solicitation (identity detection found no solicitation form / UCF
  //    structure on a non-amendment doc), the engine cannot tell the solicitation from its attachments/amendments. That
  //    is a manifest/readability failure and DOMINATES → NEEDS_HUMAN_REVIEW (honest-fail), never a silent first-doc
  //    default. Computed + flag-gated (AUDIT_ATTACHMENT_COVERAGE) in the orchestrator; absent/false ⇒ byte-identical.
  if (inp.primaryIndeterminate)
    return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), "Could not confidently identify the base solicitation among the uploaded documents (no document carries a solicitation form or contract structure) — human review required to confirm which document is the solicitation before an audit can be relied on.", dispositions, []);

  // 1-PRE. INCOMPLETE PRECEDENCE (Brain #664, flag AUDIT_INCOMPLETE_PRECEDENCE default-OFF). A posted binding DOCUMENT
  //   that could not be confirmed read in full (documentsComplete=false) is a COMPLETENESS failure that must NOT be
  //   masked by a coverage-pole / notice-body NHR grading the SAME unread content: "we could not read the document"
  //   (INCOMPLETE) is the honest label — not "we read it but cannot trust the findings" (NHR). This HOISTS the
  //   documentsComplete=false cap (formerly step 1b, subordinate to those NHR poles) above them. It stays BELOW the
  //   show-stopper block (step 3) exactly as 1b did, so a proven read bar's precedence is UNCHANGED. Flag-OFF ⇒ the cap
  //   remains at 1b ⇒ byte-identical. (CLOSED already returned above; INDETERMINATE currency is capped at the committal exits.)
  //   ── REGRESSION FIX (Brain ruling on card #687, 2026-07-22) — THE HOIST YIELDS TO AN UNCOVERED DISQUALIFIER.
  //   As first built this hoist OVER-REACHED: it swallowed the coverage-NHR on packages carrying an UNCOVERED
  //   DISQUALIFIER (measured on FA8137 `6439ac27` + `be69ce16` — gold-set 26/28).
  //   RULING BASIS: an uncovered disqualifier is READ content. The engine ENUMERATED the obligation from the
  //   document and merely failed to GROUND it — found-but-unverifiable ≠ unread. #664's ratified intent ("a real
  //   bar on read content wins; unread binding content caps to INCOMPLETE") therefore routes these to NHR.
  //   CUSTOMER-SAFETY TIEBREAK: the coverage-NHR reason NAMES a potential eligibility bar needing human
  //   verification; the INCOMPLETE reason hides it behind a manifest complaint. Fail-toward-disqualifier picks
  //   the message that names the bar.
  //   SCOPE: only this case yields. All other #664 behaviour (unread binding content → INCOMPLETE) is unchanged,
  //   and flag-OFF remains byte-identical.
  const uncoveredDisqualifierPresent = ((inp.coverageV2?.disqualifierUncovered ?? []) as unknown[]).length > 0;
  if (incompletePrecedenceEnabled() && inp.documentsComplete === false && !uncoveredDisqualifierPresent)
    return mk("INCOMPLETE", honestFailEligible(), "Document set not complete — a posted binding document could not be confirmed read in full (unfetched, scanned/no-text, or truncated)." + (inp.coverageGap ? ` Gap: ${inp.coverageGap}.` : ""), dispositions, []);

  // 1. Coverage first — you cannot decide over content you did not read/ground (honest-fail, no false green).
  // GATE V2 (AUDIT_GATE_V2, default OFF — ceo/ENGINE-ARCHITECTURE-RESEARCH): the V1 line below vetoed a verdict
  // whenever any binding obligation wasn't quoted by a ≥4-word VERBATIM n-gram — the root of chronic false-
  // INCOMPLETE (a fully-read doc with 74 grounded findings still capped INCOMPLETE). V2 re-maps that signal:
  // INCOMPLETE ONLY on genuine unreadability, a genuinely-uncovered DISQUALIFIER → NHR, else NO cap. Flag OFF or
  // coverageV2 absent ⇒ the exact V1 line runs (byte-identical). Proof: scripts/audit-ai/prove-gate-v2.ts.
  if (GATE_V2_ENABLED && inp.coverageV2) {
    // B3: findings threaded so the banner can rank a TYPED eligibility_bar above a merely bar-shaped sentence.
    // Flag-OFF (`AUDIT_BANNER_BAR_RANKING`) the arg is ignored and `[0]` is selected exactly as before.
    const v2 = gateV2Outcome(inp.coverageV2, { findings: inp.findings });
    if (v2.cap === "INCOMPLETE") return mk("INCOMPLETE", honestFailEligible(), v2.reason, dispositions, []);
    // SEAM FILL (card #472) — on the coverage-NHR cap ONLY (never INCOMPLETE: unreadable ⇒ findings untrustworthy), lift
    // any grounded site-visit/eligibility bar in dispositions[] into the persisted showStoppers[] slot so it renders in
    // the show-stopper band, not the P2 advisories. Same filter/flag family as the notice-body pole. OFF ⇒ [] (identical).
    if (v2.cap === "NEEDS_HUMAN_REVIEW") return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), v2.reason, dispositions,
      coverageNhrStopperFillEnabled() ? siteVisitEligStoppers(dispositions, inp.bidderProfile, inp.source) : []);
    // cap === null ⇒ no coverage veto; the documentsComplete gate (1b) below still applies (genuine unreadability).
  } else if (!inp.coverageComplete) {
    return mk("INCOMPLETE", honestFailEligible(), "Coverage not complete — not all binding content was read and grounded." + (inp.coverageGap ? ` Gap: ${inp.coverageGap}.` : ""), dispositions, []);
  }

  // 1a-notice. B3 (Brain card 421 Fork-3, flag-gated in the orchestrator) — an UNGROUNDED hard eligibility / disqualifier
  //     bar in the SAM notice body (mandatory site visit / set-aside / clearance) that the attachment-scoped coverage
  //     floor never saw. Its OWN gate, run AFTER the GATE_V2 / coverage block so a coverageV2 'no-cap' remap can NEVER
  //     wave a real notice-body bar through (the coverageComplete veto is bypassed whenever GATE_V2 + coverageV2 are on).
  //     Fail-toward-disqualifier → NEEDS_HUMAN_REVIEW, never a committal. Absent/false ⇒ byte-identical (flag-OFF).
  if (inp.noticeBodyBarUngrounded) {
    // B3-SEVERITY (card 429): on THIS pole (and only this one) surface any grounded site-visit/eligibility
    // disqualifier in dispositions[] as a bid-deciding showStopper (P0) instead of a P2 advisory — flag-gated;
    // flag-OFF ⇒ passes [] exactly as before (byte-identical). See doctrine at siteVisitEligStoppers.
    const noticeStoppers = inp.siteVisitSeverityFloor ? siteVisitEligStoppers(dispositions, inp.bidderProfile, inp.source) : [];
    // Card #477 ruling 3 — name the grounded bars in the reason-line (flag-gated); null ⇒ keep the generic string.
    const named = reasonLineNamedEnabled() ? namedEligibilityReason(noticeStoppers) : null;
    return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), named ?? "A bidder-eligibility bar stated in the solicitation notice (e.g. a mandatory site visit, set-aside, or required clearance/registration) could not be confirmed as analyzed — human review required to confirm eligibility before the verdict can be relied on.", dispositions,
      noticeStoppers);
  }

  // 1b. DOCUMENT completeness (C-1, Brain C.e) — the SINGLE reconciliation truth. A posted binding document the
  //     engine could not confirm it read in full (unfetched / scanned-no-text / mid-doc truncated / over-budget
  //     drop) caps EVERY pole to INCOMPLETE, committal included: an unread binding doc could carry OR waive a bar,
  //     so no verdict can be certified over a partial read. Explicit `=== false` ⇒ callers that omit it are unchanged.
  if (inp.documentsComplete === false)
    return mk("INCOMPLETE", honestFailEligible(), "Document set not complete — a posted binding document could not be confirmed read in full (unfetched, scanned/no-text, or truncated)." + (inp.coverageGap ? ` Gap: ${inp.coverageGap}.` : ""), dispositions, []);

  // 1c. AMENDMENT A (Brain card-304, F bake-off) — Candidate A's citation-grounded unread/missing-material signals are
  //     manifest-ADJACENT: a package can pass the deterministic manifest gate yet Candidate A observe a referenced
  //     attachment that is absent from the input. That can neither be waived nor decided over → NEEDS_HUMAN_REVIEW,
  //     never committal. Uses nhrEligible() (an undetermined verdict never asserts eligible=false — Gate-2 finding #4).
  //     Absent/empty unreadEvidence ⇒ byte-identical (no effect). Candidate A has NO verdict authority; this routes it.
  if (inp.unreadEvidence && inp.unreadEvidence.length)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), `Unread/missing referenced material observed — human verification needed: ${clampToWord(inp.unreadEvidence.map((u) => u.note).join("; "), 220)}`, dispositions, []);

  // 1d. SET-ASIDE CONFLICT (Brain #332) — SAM (system of record) and the document name DIFFERENT set-aside programs.
  //     This changes WHO is eligible (an ineligible firm could bid, or an eligible firm could walk — zero-contract-
  //     loss both ways), so the engine must NEVER silently adopt one → NEEDS_HUMAN_REVIEW naming BOTH values for CO
  //     clarification. Dominates the verdict (checked before verifier-soundness and every findings-derived pole).
  //     Absent ⇒ byte-identical (orchestrator supplies it only under AUDIT_SETASIDE_CONFLICT_GATE).
  //     The `note` carries the case-accurate explanation (SAM-vs-doc mismatch OR doc-internal multi-program), so it
  //     LEADS the reason — a hard-coded "SAM names a different program" lead is incoherent for a doc-internal conflict
  //     where SAM records no single program (pre-live review #334). SAM/document values follow as supporting detail.
  if (inp.setAsideConflict)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), `Set-aside conflict — the eligible pool is ambiguous and must be confirmed with the Contracting Officer before relying on eligibility. ${inp.setAsideConflict.note} (SAM: ${inp.setAsideConflict.sam}; document: ${inp.setAsideConflict.doc}.)`, dispositions, []);

  // 2. Verification soundness — if adversarial verification did not succeed, the findings aren't trustworthy.
  if (!inp.verifierSound)
    return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), "Adversarial verification did not succeed — findings not trustworthy enough to decide.", dispositions, []);

  // 2b. VERIFIED-FLOOR (Brain card 224 fork 1) — coverage is complete and verification reported sound, yet ZERO
  //     findings survive to decide over (none raised, or every one overturned). A committal verdict CANNOT rest
  //     on an empty verified set: the default ladder below would fall through to a clean BID that is
  //     byte-indistinguishable from a genuinely clean package. Fail honest → NEEDS_HUMAN_REVIEW (no charge),
  //     never a default BID. Defense-in-depth: makeAgenticVerifier already returns sound=false on an empty
  //     survivor set (caught at step 2); this guard also covers grounding-only / non-adversarial verify paths.
  // Brain card 275 RULING 3 — MATERIAL emptiness, not literal length. `disposeFinding` returns "dropped" for every
  // boilerplate finding, so an all-boilerplate / all-dropped set has length > 0 yet carries ZERO decision content —
  // it would sail past a `length === 0` test and fall through to a clean default BID. A materially-empty verified set
  // (no non-`dropped` survivor) → NEEDS_HUMAN_REVIEW, never a default BID. (`every` on [] is true → literal-empty covered.)
  if (dispositions.every((f) => f.disposition === "dropped"))
    return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), "No decision-bearing findings survived over complete coverage (empty or all-boilerplate verified set) — a clean BID cannot rest on a materially-empty set. Human review required.", dispositions, []);

  // 3. Show-stoppers — BRAIN CARD 226 FORK 2: DEFAULT-DENY NO_BID (positive-allow, not negative-deny). A committal
  //    NO_BID is reachable ONLY on a POSITIVE match to the UNIVERSAL_DEFECT allowlist (the solicitation is
  //    internally contradictory, or literally unmeetable by ANY offeror). No allowlist match → NO_BID is
  //    UNREACHABLE regardless of kind. Everything ELSE disqualifying is WHO-CAN-WIN (Ruling A: named-brand /
  //    sole-source / set-aside / size / QPL / clearance are who-can-win, NOT universal) → it can NEVER reach
  //    NO_BID: INELIGIBLE iff the profile PROVES non-qualification (firmStatus "fails"), else it flows to step 5
  //    and lands at NEEDS_HUMAN_REVIEW (null / open-world / unknown status) — never a default eligible:true.
  const disqualifying = dispositions.filter((f) => f.disposition === "disqualifying");
  const markedUniversalDefect = disqualifying.filter(isUniversalDefect);
  // COUPLING-LOCK DECISION-TIME BACKSTOP (card 228 Ruling i) — the PRIMARY lock is boot-time
  // (validateUniversalDefectProducerConfig, above); this fires ONLY if a producer marked a finding without the
  // tristate (a dynamic registration after boot). It throws EngineInvariantError — NOT an NHR verdict — and the
  // audit BOUNDARY converts the throw to a billing-safe failed state (no charge, logged config error). NEVER
  // default a NO_BID's eligibility to true. (Applies to ANY mark — verified or not — a config-level guard.)
  if (markedUniversalDefect.length && !tristate)
    throw new EngineInvariantError("FORK-2 coupling-lock (card 228 Ruling i, decision-time backstop): a universalDefect finding requires AUDIT_ELIGIBLE_TRISTATE=on — a committal NO_BID must carry a POSITIVE eligibility determination, never a default true.");
  // FORK-5 (Brain card 240) — EVIDENTIARY BAR: a `universalDefect` mark may drive NO_BID ONLY when it carries
  // VERIFICATION EVIDENCE (a `verifiedBy` record whose excerptHash binds the affirmation to the cited grounded
  // excerpt — Rule 64, never a model prior). Split the marks: only VERIFIED marks flow to the show-stopper /
  // NO_BID path; an UNVERIFIED mark is an invariant breach.
  const universalDefect = markedUniversalDefect.filter(isVerifiedUniversalDefect);
  const unverifiedUniversalDefect = markedUniversalDefect.filter((f) => !isVerifiedUniversalDefect(f));
  // A marked-but-UNVERIFIED committal may neither drive NO_BID nor silently clear to BID (it is excluded from the
  // verified show-stopper set AND from unmarkedUniversalClaim which filters !isUniversalDefect). Fail SAFE to NHR
  // + LOG the breach — same fail-safe family as the tristate coupling-lock — BEFORE any committal emission, so an
  // unverified mark can never reach a committal pole. (When J-1/J-2 wires a real verifier this path goes quiet.)
  if (unverifiedUniversalDefect.length) {
    const breach = `FORK-5 invariant breach (card 240): ${unverifiedUniversalDefect.length} finding(s) marked universalDefect WITHOUT verification evidence — a committal NO_BID may not rest on an unverified mark (no verifiedBy binding the defect to the cited excerpt, Rule 64). Fail-safe → NEEDS_HUMAN_REVIEW: ${unverifiedUniversalDefect.map((s) => s.requirement).join("; ")}`;
    logInvariantBreach(breach);
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), breach, dispositions, unverifiedUniversalDefect);
  }
  // CARD 275 RULING 4b (Brain) — SUPPRESS judgment-sourced committal NO_BID → NHR until the four-walls re-enable
  // (RULING 4a). Today a universalDefect is proven on a SINGLE J-2 entailment over a ±1KB window — one wall, not
  // four — and Gap-B re-arms the FAT/delivery temporal-tension class the temporal arm deliberately restricts to
  // caution-only (the RULING 4 RATCHET RULE: no arm may re-escalate a class a sibling restricted). Until a
  // document-wide supersession-aware refutation pass + a REGISTERED INDEPENDENT second entailment verifier seal it
  // (AUDIT_FOURWALLS_NOBID, default OFF ⇒ suppressed), a verified-but-not-four-walls universal defect fails SAFE to
  // NEEDS_HUMAN_REVIEW. Downgrade-only (PROPOSE/DISPOSE rail authority, card 276): the rail may never fabricate a
  // committal verdict the model's single-verifier judgment merely PROPOSED.
  if (universalDefect.length && process.env.AUDIT_FOURWALLS_NOBID !== "true") {
    const msg = `card 275 R4b: ${universalDefect.length} verified universalDefect(s) SUPPRESSED to NHR pending four-walls re-enable (single-verifier entailment is not four-walls): ${universalDefect.map((s) => s.requirement).join("; ")}`;
    try { console.log(`[card275-r4b] ${msg}`); } catch { /* logging must never affect the verdict */ } // a normal suppression, NOT an invariant breach
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), msg, dispositions, universalDefect);
  }
  // RULING A — a firmStatus-PROVEN who-can-win failure is INELIGIBLE by construction: normalize its kind to
  // eligibility_bar at the determination point so the show-stopper is coherent (eligible:false WITH an
  // eligibility_bar). An earned (proven-fail) INELIGIBLE is NEVER routed to NHR on a mis-typed kind string.
  const provenFails = disqualifying
    .filter((f) => !isUniversalDefect(f) && firmStatus(f, inp.bidderProfile, inp.source) === "fails")
    .map((f): DecidedFinding => (f.kind === "eligibility_bar" ? f : { ...f, kind: "eligibility_bar" }));
  // PRECEDENCE PRE-LOCK (card 228 Ruling ii) — universal-defect attribution is evaluated BEFORE firmStatus, so a
  // universalDefect-marked finding is attributed universal/requirement-side and is NEVER re-labeled by firmStatus
  // into a firm disqualification (provenFails). provenFails already excludes isUniversalDefect above; this assert
  // LOCKS that ordering the moment a producer emits (simulated in tests; no producer emits today).
  if (provenFails.some(isUniversalDefect))
    throw new EngineInvariantError("precedence_violation (card 228 Ruling ii): a universalDefect-marked finding was re-labeled by firmStatus as a firm disqualification — universal attribution must precede firmStatus.");
  const showStoppers = [...universalDefect, ...provenFails];
  if (showStoppers.length) {
    // ASYMMETRY-CAP EXTENSION (Brain card 224 fork 4) — LEFT EXACTLY AS-IS (correctly ordered FIRST): a
    // findings-derived hard pole may NOT stand on an INCOMPLETE manifest read — an unfetched amendment could
    // WAIVE or moot the bar → zero-contract-loss. Downgrade to NHR carrying the CONDITIONAL bar.
    if (inp.manifestComplete === false)
      return mk("NEEDS_HUMAN_REVIEW", nhrEligible(),
        `CONDITIONAL bar(s) on an INCOMPLETE read — a manifest-named document went unfetched and could waive or moot the following; confirm against the full package before treating as disqualifying: ${showStoppers.map((s) => s.requirement).join("; ")}`, dispositions, showStoppers);
    // POSITIVE eligibility determination (Ruling B) — proven-pass→true, proven-fail→false, else null; NEVER default true.
    const positiveEligible = (): boolean | null => {
      const gates = disqualifying.filter((f) => !!f.requiredAttribute);
      if (gates.some((f) => firmStatus(f, inp.bidderProfile, inp.source) === "fails")) return false;
      if (gates.length && gates.every((f) => firmStatus(f, inp.bidderProfile, inp.source) === "satisfies")) return true;
      return null;
    };
    if (universalDefect.length)
      // an allowlisted UNIVERSAL defect → NO_BID (no offeror can win; the firm is not the blocker).
      return enforceVerdictWordInvariant(mk("NO_BID", positiveEligible(),
        `Universal solicitation defect — no offeror can comply: ${universalDefect.map((s) => s.requirement).join("; ")}`, dispositions, showStoppers));
    // a PROVEN attribute failure → INELIGIBLE, eligible:false (positive non-qualification; kind normalized above).
    // Ruling (ii): NAME THE SPECIFIC FAILED ATTRIBUTE; do NOT assert a bar-type category ("who-can-win
    // restriction") the engine has not positively classified. The profile provably does not satisfy the
    // requiredAttribute firmStatus checked — that attribute is exactly what we state, nothing broader.
    return enforceVerdictWordInvariant(mk("INELIGIBLE", false,
      `Ineligible — the firm's profile does not satisfy the required attribute(s): ${provenFails.map((s) => s.requiredAttribute ?? s.requirement).join("; ")}`, dispositions, showStoppers));
  }
  // FORK-2 DEFENSE-IN-DEPTH (adversarial review) — an UNMARKED no_one_can_move finding CLAIMS universal
  // impossibility but is NOT a positively-classified universal defect. It must NEVER silently clear to BID via
  // firmStatus="satisfies" or curableInWindow:true (the retired `universal` bucket was immune to that mis-type).
  // If it isn't a proven who-can-win fail (handled above), it cannot be confidently cleared → NEEDS_HUMAN_REVIEW.
  const unmarkedUniversalClaim = disqualifying.filter((f) => !isUniversalDefect(f) && f.controllability === "no_one_can_move" && firmStatus(f, inp.bidderProfile, inp.source) !== "fails");
  if (unmarkedUniversalClaim.length)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(),
      `Finding(s) claim a universal impossibility (no_one_can_move) but are not a positively-classified universal defect, and the firm does not provably fail them — human review to classify or clear: ${unmarkedUniversalClaim.map((s) => s.requirement).join("; ")}`, dispositions, unmarkedUniversalClaim);

  // 4. Unresolved material conflict between experts the loop could not reconcile.
  if (inp.conflict)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), "Unresolved material conflict between experts.", dispositions, []);

  // 4b. SELF-CLEARABLE PACKAGE (card #590 Modified-B, flag AUDIT_SELF_CLEARABLE_PACKAGE, default-OFF). VERIFIER-SOVEREIGN
  //     — only reached with verifierSound=true (step 2) + coverage/documents complete + no show-stopper/universal defect
  //     (steps 1-3) + no unresolved conflict. If EVERY disqualifying bar is bidder-self-determinable + typed + curable
  //     and no long-lead/scarce credential or at-award frame appears, the package is a committal BID_WITH_CAUTION with
  //     the full named self-cert caveat list — NOT the stacked-honest-fail NHR the coverage/typing gates would return.
  //     ANY exclusion ⇒ null ⇒ falls through to the existing unknown-bar ladder (byte-identical). Flag-OFF ⇒ never runs.
  //     VERDICT ARC: temporalIndeterminate skips this committal BWC → falls through to the unknown-bar ladder, where the
  //     currency cap below re-routes it to INCOMPLETE (a self-clearable package still cannot be bid on a sol we cannot
  //     confirm is open). Flag-OFF/temporal-null ⇒ !false ⇒ condition unchanged ⇒ byte-identical.
  if (selfClearablePackageEnabled() && inp.verifierSound && !temporalIndeterminate) {
    const scBars = selfClearablePackageBars(dispositions);
    if (scBars)
      return capCommittal(enforceVerdictWordInvariant(mk("BID_WITH_CAUTION", null,
        `${committalCaution()}Self-clearable package — every requirement below is bidder-self-determinable; confirm each before bidding: ${scBars.map((f) => f.requirement).join("; ")}`,
        dispositions, [])));
  }

  // 5. Disqualifying bars whose firm-status is UNKNOWN (null profile, or no attribute to check). The old
  //    ladder blanket-routed these to BID_WITH_CAUTION — a hole (Brain card-44 §2): a NON-CURABLE structural
  //    bar under a null profile is the SPRS error re-armed (soft caution where the bidder cannot win and
  //    cannot cure). CURABILITY is a property of the GATE, independent of profile, so it is checked HERE —
  //    and an untyped bar FAILS CLOSED, never silently to caution.
  const unknownBars = disqualifying.filter((f) => firmStatus(f, inp.bidderProfile, inp.source) === "unknown");
  const names = (xs: DecidedFinding[]) => xs.map((x) => x.requirement).join("; ");

  // 5a. UNTYPED disqualifying bar (missing requiredAttribute or curableInWindow) → fail CLOSED to human review.
  const untyped = unknownBars.filter((f) => !f.requiredAttribute || f.curableInWindow === undefined);
  if (untyped.length)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(),
      `Disqualifying bar(s) missing required typing (requiredAttribute / curableInWindow) — fail closed to human review, never a silent caution: ${names(untyped)}`, dispositions, untyped);

  // 5b. NON-CURABLE structural bar (curableInWindow === false) under unknown status. Top-line verdict is
  //     NEEDS_HUMAN_REVIEW (the determining fact — does the firm already hold it — is absent, so the engine
  //     must not over-assert NO_BID). But the PAYLOAD carries the decisive conditional-NO_BID so the customer
  //     gets the call, not mush (Brain card-45 refinement): hold-it-or-walk.
  //     FORK-7 (card 242): an NMR bar is NOT a lead-time structural bar — exclude it here; it gets its own
  //     curability-carrying NHR branch below. A GENUINE structural non-curable bar (clearance/QPL/TDP) still leads.
  const nonCurable = unknownBars.filter((f) => f.curableInWindow === false && f.nmrGuard !== true);
  if (nonCurable.length) {
    // FABRICATION INVARIANT (Brain card #574, Option B by-construction · flag AUDIT_FABRICATION_INVARIANT, default-OFF,
    // Rule 61). The reason TEMPLATE below carries CONSEQUENCE ONLY — it holds no mechanic literal. The mechanic clause
    // is emitted solely by groundedMechanicClause(), which returns the lead-time/possession mechanic IFF a finding
    // carries a GROUNDED basis (clearance/QPL/CMMC/long-lead/hold-at-offer) and "" otherwise — so no code path can
    // assert a mechanic the findings don't ground (the FA303026Q0020 chapel fabrication class, engine-wide).
    //   Flag ON  → grounding decision is DECOUPLED from mmDemote: mechanic emits iff grounded (the invariant).
    //   Flag OFF → legacy mmDemote-coupled decision (card #538 R4), byte-identical to pre-#574 (grounded prose when
    //              !mmDemote OR a grounded basis exists; neutral consequence prose otherwise).
    const fabricationInvariant = process.env.AUDIT_FABRICATION_INVARIANT === "true";
    const mechanic = fabricationInvariant
      ? groundedMechanicClause(nonCurable)
      : ((!mmDemote || hasGroundedLeadTimeBasis(nonCurable)) ? GROUNDED_LEADTIME_MECHANIC : "");
    const lead = mechanic ? "Non-curable bar(s)" : "Structural bar(s) the firm may be unable to satisfy within the response window";
    const cure = mechanic ? " — it cannot be cured in the window" : "";
    const barLine = `${lead}${mechanic}. CONDITIONAL NO-BID: if your firm does not ALREADY hold the following and cannot obtain it before the deadline, this is a NO-BID${cure}: ${names(nonCurable)}`;
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), barLine, dispositions, nonCurable);
  }

  // 5b-NMR. FORK-7 (Brain card 242 item 4) — NMR unknown/unrecognized status. NOT a lead-time bar: a nonmanufacturer
  //     typically CURES by supplying a small U.S. manufacturer's product. Route to NHR carrying that curability path
  //     (honest verdict + a visible way through), never the generic "lead time exceeds window" framing, never NO_BID.
  //     Ordered AFTER the generic structural non-curable branch so a real structural bar's hold-it-or-walk leads.
  const nmrUnknown = unknownBars.filter((f) => f.nmrGuard === true && f.curableInWindow === false);
  if (nmrUnknown.length)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(),
      `Manufacturer/nonmanufacturer status not determined; if nonmanufacturer, Nonmanufacturer Rule compliance is typically achievable by supplying a small U.S. manufacturer's product — confirm status in profile: ${names(nmrUnknown)}`, dispositions, nmrUnknown);

  // ASYMMETRY CAP (Brain card-58): a "no-bar" verdict (CAUTION/BID) is valid only if the read was COMPLETE.
  // If a manifest-named attachment went unfetched, a clean verdict is the §C content-loss failure with a clean
  // label → cap to INCOMPLETE. (Show-stoppers already returned above: INELIGIBLE/NO_BID are NOT capped — a real
  // bar can't be un-found by adding documents.)
  const manifestIncomplete = inp.manifestComplete === false;

  // VERDICT ARC (move 4/5) — CURRENCY CAP. Reached only after every show-stopper (INELIGIBLE/NO_BID, step 3) and
  //   honest-fail NHR branch (conflict/untyped/nonCurable/nmr) has returned, so it can NEVER override a real read bar
  //   nor a genuine escalation — it caps ONLY the two committal exits that follow (5c curable BWC · 6 default BID). A
  //   solicitation whose live currency we could not confirm cannot carry a committal verdict → INCOMPLETE naming the
  //   gap. temporal-null / flag-OFF ⇒ temporalIndeterminate=false ⇒ not reached ⇒ byte-identical.
  if (temporalIndeterminate)
    return mk("INCOMPLETE", honestFailEligible(), `Cannot confirm the solicitation is still open — ${temporalCapReason}. A bid/caution verdict cannot stand until currency is confirmed on SAM.`, dispositions, []);

  // 5c. CURABLE bar (curableInWindow === true) under unknown status → a genuine residual risk → BID_WITH_CAUTION.
  //     The deterministic CAUTION-FLOOR (Brain card 75-R2 / 78-R1) joins here: a finding marked cautionFloor
  //     (a recognized caution archetype — quantified personnel-quals, professional cert/license, QPL/QML,
  //     or-equal) floors the verdict to BID_WITH_CAUTION minimum. It is reached ONLY after every disqualifying
  //     and human-review branch above, so it can never downgrade a NO_BID/INELIGIBLE; and it is NOT a
  //     disqualifying bar, so it can never become a show-stopper / INELIGIBLE. FLOOR-only by construction.
  const residual = unknownBars.filter((f) => f.curableInWindow === true);
  const floored = dispositions.filter((f) => f.cautionFloor === true);
  if (residual.length || floored.length) {
    if (manifestIncomplete) return mk("INCOMPLETE", honestFailEligible(), "A manifest-named attachment went unfetched — a 'caution' (no-bar) verdict cannot stand on an incomplete read.", dispositions, []);
    const reasons = [
      residual.length ? `residual curable risk(s) to confirm within the window: ${names(residual)}` : "",
      floored.length ? `qualification caution(s) to verify: ${names(floored)}` : "",
    ].filter(Boolean).join("; ");
    return capCommittal(committalEligible() === null
      ? mk("BID_WITH_CAUTION", null, `${committalCaution()}Eligibility not determined; ${reasons}`, dispositions, [])
      : mk("BID_WITH_CAUTION", true, `Eligible; ${reasons}`, dispositions, []));
  }

  // 6. Default — open, eligible, every unmet item is a bidder-controllable gate-to-clear → BID — UNLESS the read
  //    was incomplete (then we cannot assert "no bar found").
  if (manifestIncomplete)
    return mk("INCOMPLETE", honestFailEligible(), "A manifest-named attachment went unfetched — a 'no bar found' (BID) verdict cannot stand on an incomplete read.", dispositions, []);
  return capCommittal(committalEligible() === null
    ? mk("BID", null, `${committalCaution()}Open; eligibility not determined — verify the eligibility gate(s) above; all other unmet items are bidder-controllable gates to clear.`, dispositions, [])
    : mk("BID", true, "Open, eligible; all unmet items are bidder-controllable gates to clear (the work of bidding).", dispositions, []));
}
