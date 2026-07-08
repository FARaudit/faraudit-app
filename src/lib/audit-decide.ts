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
import type { VerdictInputs, TypedFinding, BidderProfile, Controllability } from "./audit-findings";
import { GATE_V2_ENABLED, gateV2Outcome } from "./audit-gate-v2";

export type Verdict = "BID" | "BID_WITH_CAUTION" | "NO_BID" | "INELIGIBLE" | "NEEDS_HUMAN_REVIEW" | "INCOMPLETE";
export type Disposition = "met" | "gate_to_clear" | "disqualifying" | "dropped";

export interface DecidedFinding extends TypedFinding { disposition: Disposition; }
export interface Decision {
  verdict: Verdict;
  eligible: boolean | null;  // null = "not determined" (honest-fail under AUDIT_ELIGIBLE_TRISTATE) — never false on an undetermined verdict (doctrine #6)
  reason: string;
  dispositions: DecidedFinding[];      // every finding with its derived disposition
  showStoppers: DecidedFinding[];      // disqualifying bars the firm PROVABLY fails (the only NO_BID/INELIGIBLE drivers)
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
// The POSITIVE eligibility / who-can-compete / origin trigger — the bar must PRESENT as a bidder-directed exclusion.
const ELIGIBILITY_CLAIM_RE = /\bel[ie]gib|\bineligib|\bdisqualif|\bexclud|not\s+subject\s+to|\bWTO\b|\bGPA\b|\bTAA\b|free\s+trade|trade\s+agreement|buy\s+american|\bBAA\b|(?:domestic|foreign|non-?domestic)\s+end\s+product|country\s+of\s+origin|end\s+product|reserved\s+(?:for|exclusively)|restricted\s+to|who\s+(?:can|may)\s+(?:bid|compete|offer|be\s+awarded)/i;
/** Re-type a phantom-cite hard eligibility show-stopper off the bar path (Brain card 329). Pure → gate-tested.
 *  FIRES only on a hard bar (no_one_can_move, or bidder_cannot_move+eligibility_bar) that presents as a bidder-
 *  eligibility / origin exclusion, is NOT a verified universal defect / temporal impossibility / genuine structural
 *  bar / positive set-aside, AND whose citation is NOT in the enumerated eligibility/size/set-aside authority list.
 *  Re-types → bidder_controls + curable + cautionFloor (visible caution, never silent BID, never forced NHR).
 *  Flag-gated; OFF (default) ⇒ unchanged. */
export function applyEligibilityAuthorityAllowlist(findings: TypedFinding[], opts?: { enabled?: boolean }): TypedFinding[] {
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

/** Derive the verdict deterministically from typed grounded findings. The LLM experts supply the FACTS
 *  (requirement + grounded excerpt + kind + controllability); this code makes the DECISION. The ladder is
 *  the same one that used to live in the chief-judge prompt — relocated from prose to TypeScript so it is
 *  stable, reproducible, and auditable. */
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
  const dispositions: DecidedFinding[] = inp.findings.map((f) => ({ ...f, disposition: disposeFinding(f) }));
  // (b/c) UNVERIFIED ELIGIBILITY GATES — a PROFILE-DEPENDENT eligibility gate (kind eligibility_bar carrying a
  //     specific requiredAttribute credential to check) the profile does not PROVE the firm satisfies. On a
  //     committal verdict these force eligible=null ("not determined", never a false green) + a mandatory
  //     verify-caution. requiredAttribute is REQUIRED so an attribute-less/bidder-controllable eligibility item
  //     (e.g. generic SAM registration) never false-fires a "not determined" on a verified firm (code-review #3/#4).
  const unverifiedGates = dispositions.filter((f) => f.kind === "eligibility_bar" && !!f.requiredAttribute && firmStatus(f, inp.bidderProfile, inp.source) !== "satisfies");
  // GUARD 1 — the DETERMINISTIC manifest-sourced signal joins the finding-derived unverifiedGates. It fires the SAME
  //   "eligibility not verified" clamp WITHOUT depending on the proposer having emitted a correctly-typed
  //   eligibility_bar finding: the sealed construction manifest detected a set-aside in source under a null profile,
  //   so a committal verdict must not assert eligible=true. Only bites under the tristate; undefined ⇒ byte-identical.
  const manifestUnverifiableGate = inp.detectedUnverifiableEligibilityGate === true;
  const eligibilityUnverified = tristate && (unverifiedGates.length > 0 || manifestUnverifiableGate);
  const committalEligible = (): boolean | null => (eligibilityUnverified ? null : true);
  const committalCaution = (): string => {
    if (!eligibilityUnverified) return "";
    const gates = unverifiedGates.length ? unverifiedGates.map((g) => g.requiredAttribute || g.requirement).join("; ") : "the set-aside / socioeconomic eligibility gate";
    // Coherence (Brain #329 follow-up): the parenthetical must be TRUE to the input — a customer WITH a capability
    // statement on file was wrongly told "(bidder profile not provided)". When a profile IS present but does not
    // establish these specific gates (e.g. an SDVOSB cert vs a size/NMR/HUBZone gate; size/NMR are non-self-clearable),
    // say so. Null profile → unchanged wording (byte-identical for the no-profile callers).
    const provenance = inp.bidderProfile == null ? "bidder profile not provided" : "your profile on file does not establish these";
    return `⚠ ELIGIBILITY NOT VERIFIED — confirm ${gates} before relying on award eligibility (${provenance}). `;
  };
  const nhrEligible = (): boolean | null => (tristate ? null : true); // honest-fail NHR → null under the flag; OFF ⇒ true (unchanged)

  // 1. Coverage first — you cannot decide over content you did not read/ground (honest-fail, no false green).
  // GATE V2 (AUDIT_GATE_V2, default OFF — ceo/ENGINE-ARCHITECTURE-RESEARCH): the V1 line below vetoed a verdict
  // whenever any binding obligation wasn't quoted by a ≥4-word VERBATIM n-gram — the root of chronic false-
  // INCOMPLETE (a fully-read doc with 74 grounded findings still capped INCOMPLETE). V2 re-maps that signal:
  // INCOMPLETE ONLY on genuine unreadability, a genuinely-uncovered DISQUALIFIER → NHR, else NO cap. Flag OFF or
  // coverageV2 absent ⇒ the exact V1 line runs (byte-identical). Proof: scripts/audit-ai/prove-gate-v2.ts.
  if (GATE_V2_ENABLED && inp.coverageV2) {
    const v2 = gateV2Outcome(inp.coverageV2);
    if (v2.cap === "INCOMPLETE") return mk("INCOMPLETE", honestFailEligible(), v2.reason, dispositions, []);
    if (v2.cap === "NEEDS_HUMAN_REVIEW") return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), v2.reason, dispositions, []);
    // cap === null ⇒ no coverage veto; the documentsComplete gate (1b) below still applies (genuine unreadability).
  } else if (!inp.coverageComplete) {
    return mk("INCOMPLETE", honestFailEligible(), "Coverage not complete — not all binding content was read and grounded." + (inp.coverageGap ? ` Gap: ${inp.coverageGap}.` : ""), dispositions, []);
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
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), `Unread/missing referenced material observed — human verification needed: ${inp.unreadEvidence.map((u) => u.note).join("; ").slice(0, 220)}.`, dispositions, []);

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
  if (nonCurable.length)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(),
      `Non-curable bar(s) — lead time exceeds the response window. CONDITIONAL NO-BID: if your firm does not ALREADY hold the following and cannot obtain it before the deadline, this is a NO-BID — it cannot be cured in the window: ${names(nonCurable)}`, dispositions, nonCurable);

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
    return committalEligible() === null
      ? mk("BID_WITH_CAUTION", null, `${committalCaution()}Eligibility not determined; ${reasons}`, dispositions, [])
      : mk("BID_WITH_CAUTION", true, `Eligible; ${reasons}`, dispositions, []);
  }

  // 6. Default — open, eligible, every unmet item is a bidder-controllable gate-to-clear → BID — UNLESS the read
  //    was incomplete (then we cannot assert "no bar found").
  if (manifestIncomplete)
    return mk("INCOMPLETE", honestFailEligible(), "A manifest-named attachment went unfetched — a 'no bar found' (BID) verdict cannot stand on an incomplete read.", dispositions, []);
  return committalEligible() === null
    ? mk("BID", null, `${committalCaution()}Open; eligibility not determined — verify the eligibility gate(s) above; all other unmet items are bidder-controllable gates to clear.`, dispositions, [])
    : mk("BID", true, "Open, eligible; all unmet items are bidder-controllable gates to clear (the work of bidding).", dispositions, []);
}
