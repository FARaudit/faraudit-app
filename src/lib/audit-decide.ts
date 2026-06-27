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
  eligible: boolean;
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
export function firmStatus(f: TypedFinding, profile: BidderProfile | null): "satisfies" | "fails" | "unknown" {
  if (!profile || !f.requiredAttribute) return "unknown";
  return profile.satisfiedAttributes.includes(f.requiredAttribute) ? "satisfies" : "fails";
}

const mk = (verdict: Verdict, eligible: boolean, reason: string, dispositions: DecidedFinding[], showStoppers: DecidedFinding[]): Decision =>
  ({ verdict, eligible, reason, dispositions, showStoppers });

/** Derive the verdict deterministically from typed grounded findings. The LLM experts supply the FACTS
 *  (requirement + grounded excerpt + kind + controllability); this code makes the DECISION. The ladder is
 *  the same one that used to live in the chief-judge prompt — relocated from prose to TypeScript so it is
 *  stable, reproducible, and auditable. */
export function deriveVerdict(inp: VerdictInputs): Decision {
  const dispositions: DecidedFinding[] = inp.findings.map((f) => ({ ...f, disposition: disposeFinding(f) }));

  // 1. Coverage first — you cannot decide over content you did not read/ground (honest-fail, no false green).
  if (!inp.coverageComplete)
    return mk("INCOMPLETE", false, "Coverage not complete — not all binding content was read and grounded.", dispositions, []);

  // 2. Verification soundness — if adversarial verification did not succeed, the findings aren't trustworthy.
  if (!inp.verifierSound)
    return mk("NEEDS_HUMAN_REVIEW", false, "Adversarial verification did not succeed — findings not trustworthy enough to decide.", dispositions, []);

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
    return mk(elig ? "NO_BID" : "INELIGIBLE", elig,
      `Bar(s) that cannot be cleared: ${showStoppers.map((s) => s.requirement).join("; ")}`, dispositions, showStoppers);
  }

  // 4. Unresolved material conflict between experts the loop could not reconcile.
  if (inp.conflict)
    return mk("NEEDS_HUMAN_REVIEW", true, "Unresolved material conflict between experts.", dispositions, []);

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
    return mk("NEEDS_HUMAN_REVIEW", true,
      `Disqualifying bar(s) missing required typing (requiredAttribute / curableInWindow) — fail closed to human review, never a silent caution: ${names(untyped)}`, dispositions, untyped);

  // 5b. NON-CURABLE structural bar (curableInWindow === false) under unknown status. Top-line verdict is
  //     NEEDS_HUMAN_REVIEW (the determining fact — does the firm already hold it — is absent, so the engine
  //     must not over-assert NO_BID). But the PAYLOAD carries the decisive conditional-NO_BID so the customer
  //     gets the call, not mush (Brain card-45 refinement): hold-it-or-walk.
  const nonCurable = unknownBars.filter((f) => f.curableInWindow === false);
  if (nonCurable.length)
    return mk("NEEDS_HUMAN_REVIEW", true,
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
    if (manifestIncomplete) return mk("INCOMPLETE", false, "A manifest-named attachment went unfetched — a 'caution' (no-bar) verdict cannot stand on an incomplete read.", dispositions, []);
    const reasons = [
      residual.length ? `residual curable risk(s) to confirm within the window: ${names(residual)}` : "",
      floored.length ? `qualification caution(s) to verify: ${names(floored)}` : "",
    ].filter(Boolean).join("; ");
    return mk("BID_WITH_CAUTION", true, `Eligible; ${reasons}`, dispositions, []);
  }

  // 6. Default — open, eligible, every unmet item is a bidder-controllable gate-to-clear → BID — UNLESS the read
  //    was incomplete (then we cannot assert "no bar found").
  if (manifestIncomplete)
    return mk("INCOMPLETE", false, "A manifest-named attachment went unfetched — a 'no bar found' (BID) verdict cannot stand on an incomplete read.", dispositions, []);
  return mk("BID", true, "Open, eligible; all unmet items are bidder-controllable gates to clear (the work of bidding).", dispositions, []);
}
