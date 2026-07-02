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

import type { VerdictInputs, TypedFinding, BidderProfile, Controllability } from "./audit-findings";

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
// Flag-gated; default OFF (Rule 61) ⇒ findings unchanged byte-for-byte.
const AWARD_BASIS_RE = /lowest price technically acceptable|\bLPTA\b|evaluation methodology|basis (?:for|of) award|source selection|screened (?:by|for) price|\bbest value\b|trade.?off|non-price factor|evaluation factor|technically acceptable|proposals?(?: will| are)? (?:initially )?(?:be )?screened/i;
// Exclusion for the award-basis (a) downgrade: a no_one_can_move finding is NOT an
// award-basis artifact — and must NEVER be downgraded to bidder_controls — when ANY
// genuine impossibility/structural language is present, even if an LPTA/evaluation phrase
// also appears in the verbatim excerpt (panel B-1: an excerpt coincidence must not erase a
// real universal show-stopper). Covers delivery/precondition impossibility AND supply/
// sole-source impossibility (discontinued / no-acceptable-substitute / single-source).
const DELIVERY_IMPOSSIBILITY_RE = /first.?article|\bFAT\b|delivery window|\bARO\b|precondition|non-?waivable|cannot complete|deliver within|production delivery|universal delivery|sole.?source|brand.?name|named (?:oem|manufacturer|source)|single (?:source|approved|authorized)|no (?:acceptable )?substitut|no longer (?:manufactured|available|produced|in production)|out of production|discontinu|unobtainable|only (?:one |a single )?(?:source|manufacturer)|\bQPL\b|\bQML\b|proprietary|technical data package|\bTDP\b|data rights|approved source|export.?control|no other (?:source|firm|manufacturer|offeror|vendor) can|exceeds?\b[^.]{0,30}\b(?:production|capacity)|insufficient (?:production )?capacity/i;
const SOCIOECONOMIC_SETASIDE_RE = /8\(a\)|\bHUBZone\b|\bSDVOSB\b|service.?disabled.?veteran|\bWOSB\b|\bEDWOSB\b|women.?owned|economically disadvantaged/i;

/** Re-type the #1 false-NO_BID class (Brain card 108). Pure → gate-tested. (a) award-basis no_one_can_move →
 *  bidder_controls (never the temporal_conflict finding or a real delivery/precondition impossibility);
 *  (b) a specific socioeconomic set-aside under a NULL profile → cautionFloor. Flag-gated; OFF ⇒ unchanged. */
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

export function applyAwardBasisOvertypeGuard(findings: TypedFinding[], profile: BidderProfile | null, opts?: { enabled?: boolean; normalizeNoOneCanMoveSetAside?: boolean; setAsideOvertypeDisposition?: "nhr" | "caution" }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ byte-for-byte unchanged
  return findings.map((f) => {
    const hay = `${f.requirement} ${f.excerpt ?? ""}`;
    // (a) award basis is never a universal bar. ROBUST altitude (panel B-1 + re-verify): the
    // award-basis trigger matches the REQUIREMENT (the lens's own characterization of WHAT the
    // bar is) — NOT the verbatim excerpt, which can incidentally quote LPTA/best-value language
    // while describing a genuine supply/structural impossibility. The impossibility exclusion is
    // kept on requirement+excerpt as belt-and-suspenders. So a real impossibility (proprietary /
    // sole-source / discontinued / capacity) is never downgraded by an excerpt coincidence; only
    // a finding the lens itself typed as an evaluation-methodology bar is.
    if (f.controllability === "no_one_can_move" && f.lens !== "temporal_conflict" && AWARD_BASIS_RE.test(f.requirement) && !DELIVERY_IMPOSSIBILITY_RE.test(hay))
      return { ...f, controllability: "bidder_controls", awardBasisGuard: true };
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
    const setAsideSoftenable = (profile === null || !!profile.openWorld) && SOCIOECONOMIC_SETASIDE_RE.test(f.requirement) && !NON_SELF_CLEARABLE_BAR_RE.test(hay);
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
    if (setAsideSoftenable && f.controllability === "no_one_can_move") {
      if (opts?.setAsideOvertypeDisposition === "nhr")
        return { ...f, controllability: "bidder_cannot_move", curableInWindow: false, awardBasisGuard: true };
      if (opts?.setAsideOvertypeDisposition === "caution" || opts?.normalizeNoOneCanMoveSetAside === true)
        return { ...f, controllability: "bidder_controls", curableInWindow: true, cautionFloor: true, awardBasisGuard: true };
    }
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

// ── NONMANUFACTURER RULE GATE (Brain card 132 — Step 4; the never-missed deterministic floor) ─────────────
// The frequently-missed obligation: on a SMALL-BUSINESS set-aside for a SUPPLY/MANUFACTURING acquisition, an
// offeror that does not itself manufacture the end item must (FAR 52.219-1 / 13 CFR 121.406) be small AND have
// ≤500 employees AND supply the product of a small-business manufacturer made in the U.S. — unless an FAR 19.505
// / SBA class waiver applies. Most small firms fail the "supply a small-business manufacturer's product" prong
// and lose the award. The product promise: we catch it EVERY TIME on a supply set-aside.
//
// PURE FACT-RULE (Rule 64) — fires off DETERMINISTIC scalar facts (SAM-resolved set-aside + NAICS sector), never
// a model claim or a source regex (that would be the Part-15 trap). Sector is deterministic arithmetic off the
// code's first two digits (31/32/33 manufacturing · 42 wholesale · 44/45 retail = the supply sectors; services /
// construction → silent). NAICS absent → HONEST SILENCE (uploads carry null), never a guess.
//
// EMIT gate (like temporal_conflict): ADDS one finding, never removes/re-types. Disposition is card-132:
// bidder_controls + cautionFloor → disposeFinding = gate_to_clear (NEVER a show-stopper, profile-INDEPENDENT),
// floors a clean BID to BID_WITH_CAUTION in deriveVerdict; reached only after every disqualifying/human-review
// branch, so it never downgrades a NO_BID/INELIGIBLE. NON-DUPLICATION: if an NMR finding (cites FAR 52.219-1, or
// lens === "nonmanufacturer_rule") is already present, do NOT double-emit — the small-business-counsel lens's own
// NMR analysis wins the slot. NMR (52.219-1) ≠ Limitations-on-Subcontracting (52.219-14), so a LoS finding never
// blocks this and the two never false-merge. Flag-gated; default OFF (Rule 61) ⇒ findings unchanged byte-for-byte.
// The audit row stores the SAM.gov set-aside CODE (e.g. "8A", "SBA", "HZC" — _view-model.ts:3078), NOT the
// description, so the trigger must match CODES first. These are the SBA socioeconomic programs FAR 52.219-1
// governs — total/partial SB · 8(a) · HUBZone · SDVOSB · WOSB/EDWOSB, incl. their sole-source variants.
// DELIBERATELY EXCLUDED (open Brain-ruling — see card): NONE/full-&-open, Local-Area (LAS), and the Buy-Indian
// programs (IEE/ISBEE), whose NMR applicability rides different authority. Conservative scope by construction.
const NMR_SB_SETASIDE_CODES = new Set([
  "SBA", "SBP",          // Total / Partial Small Business Set-Aside
  "8A", "8AN",           // 8(a) Set-Aside / Sole Source
  "HZC", "HZS",          // HUBZone Set-Aside / Sole Source
  "SDVOSBC", "SDVOSBS",  // SDVOSB Set-Aside / Sole Source
  "WOSB", "WOSBSS",      // WOSB Set-Aside / Sole Source
  "EDWOSB", "EDWOSBSS",  // EDWOSB Set-Aside / Sole Source
]);
// Friendly-name fallback — for doc-text-extracted uploads or descriptive values (not the SAM code path).
const NMR_SB_SETASIDE_RE = /total small business|partial small business|small business set.?aside|8\(a\)|hubzone|\bsdvosb\b|service.?disabled veteran|\bwosb\b|\bedwosb\b|women.?owned small/i;
const NMR_SUPPLY_SECTORS = new Set(["31", "32", "33", "42", "44", "45"]);
// A finding that ALREADY addresses the Nonmanufacturer Rule — by the gate's own lens, by an NMR-SPECIFIC
// authority (52.219-1 · 13 CFR 121.406 · FAR 19.505 waiver), or by naming the rule in its requirement text.
// Used for non-duplication so a small-business-counsel lens's own NMR analysis wins the slot. HARD CONSTRAINT:
// never key on 52.219-6 (the set-aside NOTICE clause present on nearly every SB set-aside) — that would suppress
// the floor on almost every audit, the false-negative that defeats "catch every time". 52.219-14 (Limitations on
// Subcontracting) is a DISTINCT obligation and is intentionally NOT matched (52\.219-1 lookahead excludes -14).
const NMR_ADDRESSED_RE = /52\.219-1(?!\d)|121\.406|\b19\.505\b/i;
function addressesNmr(f: TypedFinding): boolean {
  return f.lens === "nonmanufacturer_rule" || NMR_ADDRESSED_RE.test(f.citation) || /non-?manufacturer/i.test(f.requirement);
}
/** The two-digit NAICS sector iff the code is a real ≥2-digit numeric (a genuine SAM / SF-1449 Block-10 code).
 *  null otherwise (absent / malformed) → the caller stays silent. Pure deterministic arithmetic, no lookup. */
export function naicsSector(naics: string | null | undefined): string | null {
  const m = (naics ?? "").trim().match(/^(\d{2})\d{0,4}$/);
  return m ? m[1] : null;
}
/** Emit the NMR caution when (set-aside is a SB program) AND (NAICS is a supply/manufacturing sector). Pure →
 *  gate-tested. Additive + floor-only; profile-independent (card 132). Flag-gated; OFF (default) ⇒ unchanged. */
export function applyNonmanufacturerRuleGate(
  findings: TypedFinding[],
  facts: { naics?: string | null; setAside?: string | null },
  opts?: { enabled?: boolean },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                                          // Rule 61 default-off ⇒ byte-identical
  const naics = (facts.naics ?? "").trim();
  const sector = naicsSector(naics);
  if (!sector || !NMR_SUPPLY_SECTORS.has(sector)) return findings;             // services/construction/absent NAICS → silent (honest)
  const sa = (facts.setAside ?? "").trim();
  const code = sa.toUpperCase().replace(/[^A-Z0-9]/g, "");                     // "8(a) Set-Aside" → "8ASETASIDE"; "8A" → "8A"
  if (!sa || !(NMR_SB_SETASIDE_CODES.has(code) || NMR_SB_SETASIDE_RE.test(sa))) return findings; // not an SBA-program set-aside → NMR N/A (full-&-open / NONE / Indian / local-area → silent)
  if (findings.some(addressesNmr)) return findings; // non-duplication — a lens NMR analysis (under ANY NMR authority) wins the slot; 52.219-6/-14 never suppress it
  const nmr: TypedFinding = {
    requirement: `Nonmanufacturer Rule (FAR 52.219-1): this ${sa} is a supply acquisition under NAICS ${naics} (sector ${sector}). If your firm does NOT manufacture the end item, to be eligible you must (1) be small under the size standard, (2) have no more than 500 employees, and (3) supply the product of a small-business manufacturer made in the U.S. — unless an FAR 19.505 / SBA class waiver applies. Confirm your manufacturing status and, if a nonmanufacturer, all three prongs before relying on award eligibility.`,
    citation: "FAR 52.219-1",
    excerpt: `NAICS ${naics} · set-aside "${sa}" (deterministic SAM-resolved facts — supply sector ${sector})`,
    kind: "submission",
    controllability: "bidder_controls",
    cautionFloor: true,
    grounded: true,
    lens: "nonmanufacturer_rule",
  };
  return [...findings, nmr];
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
// temporal impossibility). Flag-gated; default OFF (Rule 61) ⇒ unchanged byte-for-byte.
const STRUCTURAL_BAR_RE_114 = /sole.?source|brand.?name|named (?:oem|manufacturer|source|dealer)|single (?:source|approved|authorized)|\bQPL\b|\bQML\b|qualified products? list|qualified manufacturers? list|approved (?:source|manufactur)|technical data package|\bTDP\b|no substitut|proprietary|security clearance|facility (?:clearance|certification|security)|unobtainable/i;
const COMPLIANCE_REP_RE = /size standard|small business size|\bNAICS\b|52\.204-8|organizational conflict|conflict of interest|\bOCI\b|representation|reps? (?:and|&) cert|certif|\bSAM\b|registration|set.?aside|8\(a\)|hubzone|sdvosb|wosb|self.?cert|inverted domestic|telecom|covered telecommunications|52\.209|responsib/i;

/** Generalize the over-type guards (Brain card 114): a non-curable bidder_cannot_move bar under a NULL profile is kept
 *  only if it is a recognized structural impossibility; a clearly compliance/representation item → caution; an
 *  unrecognized one is LEFT (→ human review), never silently BID. Pure → gate-tested. Flag-gated; OFF ⇒ unchanged. */
export function applyStructuralBarWhitelist(findings: TypedFinding[], profile: BidderProfile | null, opts?: { enabled?: boolean }): TypedFinding[] {
  // Apply under a NULL profile OR an OPEN-WORLD (self-asserted) profile — both are
  // mostly-unknown, so the over-type whitelist must still fire (panel B-3: a firm with a
  // capability statement must not bypass this protection). Skip ONLY for a CLOSED-WORLD
  // (trusted/complete) profile, where firmStatus genuinely governs.
  if (!opts?.enabled || (profile !== null && !profile.openWorld)) return findings;
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
// DELIVERY window — not two unrelated numbers. Pure. (Used ONLY by Option B; the legacy path keeps parseDays.)
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

/** Emit a `no_one_can_move` show-stopper when a NON-WAIVABLE FAT precondition's minimum duration EXCEEDS the
 *  delivery window (Brain card 81 Step 2). FLOOR-of-severity guard: only fires on a non-waivable precondition
 *  (a waivable one isn't universal — the CO could waive it). Adds a finding; never removes/downgrades. Pure.
 *  Default-OFF. */
const NONWAIVABLE_RE = /\bnon-?waivable\b|shall not (?:waive|authorize|approve)|may not be waived|\bmandatory\b|must (?:complete|elapse|first)/i;
// ── Step 7 (Brain card 140, AUDIT_TEMPORAL_SHARED_ARO) — OPTION B order-referenced SEQUENTIAL-GATE narrowing ──
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
export function applyTemporalConflict(findings: TypedFinding[], opts?: { enabled?: boolean; sharedAroGate?: boolean }): TypedFinding[] {
  if (!opts?.enabled) return findings; // Rule 61 default-off ⇒ unchanged
  const fat = findings.find((f) => f.sweepArchetype === "fat_precondition");
  const delivery = findings.find((f) => f.sweepArchetype === "delivery_window");
  if (!fat || !delivery) return findings;

  if (opts.sharedAroGate) {
    // ── OPTION B (Brain card 140/141, AUDIT_TEMPORAL_SHARED_ARO) — fire NO_BID only on a PROVEN sequential gate ──
    const gDays = gateDays(fat.excerpt), winDays = deliveryWindowDays(delivery.excerpt);              // ANCHORED durations (no global-min poisoning)
    const prong1 = DELIVERY_ORDER_ANCHOR_RE.test(delivery.excerpt);                                   // delivery is order-anchored
    const prong2 = POST_ORDER_GATE_ANCHOR_RE.test(fat.excerpt) && DELIVERY_FORECLOSE_RE.test(fat.excerpt); // post-order gate + delivery foreclosure (rejects relative scheduling)
    const prong3 = NONWAIVABLE_TIGHT_RE.test(fat.excerpt);                                            // explicit non-waiver (mandatory-only is NOT enough)
    const prong4 = gDays != null && winDays != null && gDays > winDays;                               // PROVEN arithmetic on anchored durations (never estimate)
    // same-deliverable guard: if BOTH excerpts name CLIN/line items and the sets are DISJOINT, the gate and the
    // window concern DIFFERENT deliverables ⇒ not a universal impossibility for either ⇒ do not fire (→ CAUTION).
    const fatClins = clinSet(fat.excerpt), delClins = clinSet(delivery.excerpt);
    const crossDeliverable = fatClins.size > 0 && delClins.size > 0 && ![...fatClins].some((c) => delClins.has(c));
    if (prong1 && prong2 && prong3 && prong4 && !crossDeliverable) {
      // OPTION 1 (Brain card 141 ruling): the temporal arm NEVER escalates to NO_BID — deterministic identification
      // of the production-delivery window from messy §F text is open-ended (7 adversarial rounds), so a false NO_BID
      // is a structural risk and NO_BID stays reserved for cleanly-named hard gates. The four-prong trigger now routes
      // to a HIGH-confidence KO-clarify CAUTION (bidder_controls + cautionFloor) — surfacing the tension, never asserting
      // universal impossibility. deriveVerdict floors this to BID_WITH_CAUTION; it can never produce NO_BID/INELIGIBLE.
      const caution: TypedFinding = {
        requirement: `Likely universally unmeetable delivery schedule — CONFIRM the binding production window against the non-waivable First Article gate before bidding: a non-waivable, order-referenced FAT precondition (min ~${gDays} days, measured from a post-order event and foreclosing delivery until it closes) appears to exceed the production delivery window (~${winDays} days ARO).`,
        citation: `${fat.citation} + ${delivery.citation} (cross-clause temporal conflict)`,
        excerpt: fat.excerpt, // verbatim-grounded binding term (the FAT clause)
        kind: "technical_spec", controllability: "bidder_controls", curableInWindow: true,
        cautionFloor: true, temporalSharedAroGuard: true, grounded: true, lens: "temporal_conflict",
      };
      return [...findings, caution];
    }
    // Any prong fails / ambiguous arithmetic / cross-deliverable ⇒ a temporal tension is present but NOT proven →
    // KO-clarify CAUTION (cautionFloor on the FAT finding), NEVER no_one_can_move/NO_BID.
    return findings.map((f) => (f === fat ? { ...f, cautionFloor: true, temporalSharedAroGuard: true } : f));
  }

  // ── legacy Step-2 path (flag OFF) — byte-identical to 63e777f ──
  if (!NONWAIVABLE_RE.test(fat.excerpt)) return findings;                 // waivable precondition ⇒ not universal
  const fatDays = parseDays(fat.excerpt), winDays = parseDays(delivery.excerpt);
  if (fatDays == null || winDays == null || fatDays <= winDays) return findings; // no conflict
  const ss: TypedFinding = {
    requirement: `Universal delivery impossibility: a non-waivable First Article precondition (min ~${fatDays} days) cannot complete inside the production delivery window (~${winDays} days ARO). No bidder can comply, regardless of capacity.`,
    citation: `${fat.citation} + ${delivery.citation} (cross-clause temporal conflict)`,
    excerpt: fat.excerpt, // verbatim-grounded binding term (the FAT clause)
    kind: "technical_spec", controllability: "no_one_can_move", curableInWindow: false,
    grounded: true, lens: "temporal_conflict",
  };
  return [...findings, ss];
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
const NON_SELF_CLEARABLE_BAR_RE = /sole.?source|brand.?name|named (?:oem|manufacturer|source|dealer|firm|awardee)|single (?:source|approved|authorized)|non.?competit|directed award|\bQPL\b|\bQML\b|qualified (?:products?|manufacturers?) list|approved (?:source|manufactur)|technical data package|\bTDP\b|no substitut|proprietary|security clearance|facility (?:clearance|certification|security)|size standard|other than small|exceed(?:s|ed)? the size|small (?:business )?(?:concern )?under\b|under the size|\d+\s+employees|number of employees|annual receipts|affiliation rule/i;

export function firmStatus(f: TypedFinding, profile: BidderProfile | null): "satisfies" | "fails" | "unknown" {
  if (!profile || !f.requiredAttribute) return "unknown";
  // Exact attribute match (trusted/gold closed-world profile) — unchanged.
  if (profile.satisfiedAttributes.includes(f.requiredAttribute)) return "satisfies";
  // Canonical SOCIOECONOMIC match — OPEN-WORLD ONLY (a self-asserted capability statement).
  // Restricted to open-world so a closed-world/gold profile is never flipped fails→satisfies
  // by a non-exact socioeconomic string (code-review #3). And it is BLOCKED when the bar
  // carries structural/sole-source/size language (Finding 2) — a self-asserted set-aside cert
  // may clear a PURE set-aside eligibility bar, never a bundled structural/size show-stopper.
  if (profile.openWorld) {
    const reqCanon = canonicalizeEligibilityAttr(f.requiredAttribute);
    if (reqCanon && profile.satisfiedAttributes.some((a) => canonicalizeEligibilityAttr(a) === reqCanon)) {
      const hay = `${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""}`;
      if (!NON_SELF_CLEARABLE_BAR_RE.test(hay)) return "satisfies";
      // bundled structural/size bar → don't self-clear; fall through to unknown (human review).
    }
    // OPEN-WORLD: a not-held attribute is NOT proof the firm fails — it may simply be
    // unstated → "unknown" (caution / human review), never a false INELIGIBLE.
    return "unknown";
  }
  // CLOSED-WORLD (trusted complete profile, e.g. gold): not-held = provably fails.
  return "fails";
}

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
  const unverifiedGates = dispositions.filter((f) => f.kind === "eligibility_bar" && !!f.requiredAttribute && firmStatus(f, inp.bidderProfile) !== "satisfies");
  const committalEligible = (): boolean | null => (tristate && unverifiedGates.length ? null : true);
  const committalCaution = (): string => (tristate && unverifiedGates.length
    ? `⚠ ELIGIBILITY NOT VERIFIED — confirm ${unverifiedGates.map((g) => g.requiredAttribute || g.requirement).join("; ")} before relying on award eligibility (bidder profile not provided). `
    : "");
  const nhrEligible = (): boolean | null => (tristate ? null : true); // honest-fail NHR → null under the flag; OFF ⇒ true (unchanged)

  // 1. Coverage first — you cannot decide over content you did not read/ground (honest-fail, no false green).
  if (!inp.coverageComplete)
    return mk("INCOMPLETE", honestFailEligible(), "Coverage not complete — not all binding content was read and grounded.", dispositions, []);

  // 2. Verification soundness — if adversarial verification did not succeed, the findings aren't trustworthy.
  if (!inp.verifierSound)
    return mk("NEEDS_HUMAN_REVIEW", honestFailEligible(), "Adversarial verification did not succeed — findings not trustworthy enough to decide.", dispositions, []);

  // 3. Show-stoppers → the only NO_BID / INELIGIBLE drivers. Two kinds (Brain card-45 typing guard):
  //    (a) UNIVERSAL impossibilities (no_one_can_move) — disqualify EVERY bidder regardless of profile, so
  //        they are PROVEN show-stoppers even under a null profile (do NOT soften to human-review); and
  //    (b) PROFILE-DEPENDENT bars the firm PROVABLY fails. A bar the firm provably SATISFIES is cleared; an
  //        UNKNOWN profile-dependent bar is handled by curability in step 5.
  const disqualifying = dispositions.filter((f) => f.disposition === "disqualifying");
  const universal = disqualifying.filter((f) => f.controllability === "no_one_can_move");
  const provenFails = disqualifying.filter((f) => f.controllability !== "no_one_can_move" && firmStatus(f, inp.bidderProfile) === "fails");
  const showStoppers = [...universal, ...provenFails];
  if (showStoppers.length) {
    const elig = !showStoppers.some((s) => s.kind === "eligibility_bar");
    return enforceVerdictWordInvariant(mk(elig ? "NO_BID" : "INELIGIBLE", elig,
      `Bar(s) that cannot be cleared: ${showStoppers.map((s) => s.requirement).join("; ")}`, dispositions, showStoppers));
  }

  // 4. Unresolved material conflict between experts the loop could not reconcile.
  if (inp.conflict)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(), "Unresolved material conflict between experts.", dispositions, []);

  // 5. Disqualifying bars whose firm-status is UNKNOWN (null profile, or no attribute to check). The old
  //    ladder blanket-routed these to BID_WITH_CAUTION — a hole (Brain card-44 §2): a NON-CURABLE structural
  //    bar under a null profile is the SPRS error re-armed (soft caution where the bidder cannot win and
  //    cannot cure). CURABILITY is a property of the GATE, independent of profile, so it is checked HERE —
  //    and an untyped bar FAILS CLOSED, never silently to caution.
  const unknownBars = disqualifying.filter((f) => firmStatus(f, inp.bidderProfile) === "unknown");
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
  const nonCurable = unknownBars.filter((f) => f.curableInWindow === false);
  if (nonCurable.length)
    return mk("NEEDS_HUMAN_REVIEW", nhrEligible(),
      `Non-curable bar(s) — lead time exceeds the response window. CONDITIONAL NO-BID: if your firm does not ALREADY hold the following and cannot obtain it before the deadline, this is a NO-BID — it cannot be cured in the window: ${names(nonCurable)}`, dispositions, nonCurable);

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
