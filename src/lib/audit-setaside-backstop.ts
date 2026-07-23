// ── VERDICT ARC (move-4, Brain cards #668 → #677) — DETERMINISTIC SET-ASIDE BACKSTOP ────────────────────────
// FORMERLY `audit-hardbar.ts` ("hard-bar floor"). Part A of that unit — the prose possession-frame detector
// (4 restriction frames · offer-time anchor set · exclusion stack · clearance/vehicle/CMMC/spec-reg classes) —
// was RETIRED WHOLESALE by Brain's Q3 ruling of 2026-07-22 (card #677). It is DELETED, not shadowed: no residue
// remains that could later be cited as a guard. Specimens live in `ceo/GRAVEYARD-HARDBAR-PART-A.md`; they
// document the class and GATE NOTHING.
//
// WHY PART A DIED (ruling basis, logged so a future session cannot rebuild it by forgetting):
//   1. THIRD grade-D on the same unit across three architectures (V1 co-occurrence → V2 blocklists → V3
//      anchor-pivot) — the reconstruction-treadmill recognizer's own stop condition.
//   2. H1 ("an incomplete allowlist fails toward under-fire, which is safe") is FALSE — verified BY EXECUTION.
//      The class-term allowlists fed BOTH the fire path and the SUPPRESSION path. A `met` clearance finding
//      reading "cleared at the SECRET level per the attached DD Form 254" matched nothing in TERM_CLEARANCE
//      ("DD Form 254" fails /\bDD[\s-]?254\b/), so classesOfFinding returned ∅, suppression was bypassed, and the
//      floor fired NHR over a bar the pipeline had already PROVEN met — a false NHR on an open competition.
//   3. `vehicle_holder` is substantially phantom on this product surface — FAR 5.202 exempts subpart 16.5 orders
//      from synopsis, so holders-only competitions largely never reach SAM's front door. Measured: 0 fires in 40.
//   4. PLACEBO-FLOOR DANGER — an inert construct occupying the false-BID backstop seat is worse than an honest
//      absence, because the veto-retirement gate then reads "backstop armed" against nothing.
// Panel (card #677, 3/3 seats): contracts AMEND · ex-KO AMEND + "retire part A, keep part B" · adversarial
// REJECT (grade D, "V3 = treadmill re-coated"). Seat files: ceo/PANEL-PIVOT-{CONTRACTS,EXKO,REDTEAM}.md.
//
// ── WHAT SURVIVES, AND WHY IT IS A DIFFERENT KIND OF THING ──────────────────────────────────────────────────
// Part B is NOT a prose detector and never was. It keys on STRUCTURED signals — the clause-matrix set-aside
// notice detector ∪ SAM's own `setAside` metadata field — so it has no frames, no anchors, no exclusion stack,
// and no vocabulary window to smuggle through. It is the only component of the retired unit with measured real
// fires (4/4, all at non-committal exits), it covers the customer base's most common genuine eligibility bar, it
// caps at BID_WITH_CAUTION and can NEVER reach NHR (ruling 3 — NHR-on-set-aside is the product-killing pole),
// and it carries `requiredAttribute` so a #575 bidder profile clears it as-declared. That is the correct
// architecture in miniature: structured solicitation-side fact → BWC caveat → profile resolves.
//
// NOT THE FALSE-BID BACKSTOP. Per the re-scoped PANEL RULING 1, retiring the verbatim veto is gated on MEASURED
// false-BID = 0 on the v2 obligation ledger, produced AT retirement time. This module's existence satisfies
// nothing. The eligibility registers part A could not see (enumerated (1)/(2)/(3) lists · submit-proof-with-offer
// §L · acceptability-gate §M prose · DD-254 form fields) are NAMED, DOCUMENTED GAPS assigned to the ledger, the
// panel lenses, and #575 — not seeds for rebuilding a prose floor. The unit is CLOSED.
//
// PURE: no I/O, no new Date(). Downgrade-only by construction — it can lower a would-be committal to BWC and
// nothing else.

import type { Disposition } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

/** The one class that survives. Kept as a named type so the render/telemetry side reads explicitly. */
export type SetAsideBackstopClass = "set_aside";

export interface SetAsideBackstopHit {
  cls: SetAsideBackstopClass;
  sentence: string;             // the notice anchor (clause-matrix excerpt, or the SAM-metadata statement)
  requirement: string;          // human-facing caveat
  requiredAttribute?: string;   // canonical program — so a #575 profile can clear it as-declared
}

export interface SetAsideBackstopDisposition {
  hits: SetAsideBackstopHit[];
  /** Structural invariant, not a computed field: this unit caps at BWC and can never escalate. */
  cap: "BID_WITH_CAUTION";
  reason: string;               // named, evidence-carrying reason string for the customer render
}

/** A disposed finding as deriveVerdict sees it, plus the caller's canonical set-aside program (GAUNTLET R1
 *  BRK-5). The program canonicalizer lives in audit-decide (which imports THIS module), so it is INJECTED
 *  rather than imported — the pure layer stays cycle-free and independently testable. */
export interface DisposedForBackstop {
  f: TypedFinding;
  disposition: Disposition;
  setAsideProgram?: string | null;  // canonical program (e.g. "se:hubzone" / "sb:total"), when the caller knows it
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// ── already-HANDLED suppression ─────────────────────────────────────────────────────────────────────────────
// A notice is suppressed ONLY if a set-aside finding was actually HANDLED — disposition "disqualifying" (the
// ladder escalated it) or "met" (the firm PROVES it satisfies) — AND it identifies the SAME program (or, absent
// a program on either side, anchors on the same text). A boilerplateTrapSweep grounding is bidder_controls →
// "gate_to_clear": it NEVER suppresses, else the sweep — which manufactures a same-class finding on mere mention
// — would silence the backstop on exactly the packages it protects. "dropped" / "gate_to_clear" never suppress.
//
// DIRECTION OF FAILURE (ex-KO amendment A2, adopted): failing to suppress is the over-fire and is the worse
// error, so suppression is deliberately the generous side — program identity is tried first and text anchoring
// is a wide fallback. The cap is BWC and every hit carries `requiredAttribute`, so the residual cost of a
// redundant fire is one caveat a #575 profile clears, never a verdict escalation.
const SET_ASIDE_HAY =
  /\bset[-\s]?aside\b|\b52\.219-\d|\b8\(a\)\b|\bHUBZone\b|\bWOSB\b|\bEDWOSB\b|\bSDVOSB\b|\bVOSB\b|small\s+business\s+set/i;

/** Does this finding speak to the set-aside pool at all? (The citation legitimately counts here — for a
 *  set-aside the clause number IS the program identity.) */
function findingTouchesSetAside(f: TypedFinding): boolean {
  return SET_ASIDE_HAY.test(`${f.requirement} ${f.excerpt} ${f.citation} ${f.requiredAttribute ?? ""}`);
}

// anchor overlap — the handled finding's excerpt shares a run with the notice anchor. Mirrors how the *Ungrounded
// gates check the SPECIFIC sentence rather than the topic.
// BRK-12: a 5-word run made suppression hostage to verbatim excerpt fidelity — an abbreviated excerpt over a
// genuinely MET bar failed to anchor and the unit fired over it. Window is 4 words plus a content-token fallback.
function anchorsOn(excerpt: string, clause: string): boolean {
  const a = norm(excerpt), b = norm(clause);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const bt = b.split(" ");
  for (let i = 0; i + 4 <= bt.length; i++) {
    if (a.includes(bt.slice(i, i + 4).join(" "))) return true;
  }
  // short-excerpt fallback: the distinctive content words of a brief excerpt appear in the clause.
  const at = a.split(" ").filter((w) => w.length >= 4);
  if (at.length && at.length <= 12) {
    const shared = at.filter((w) => bt.includes(w)).length;
    if (shared >= 3 && shared / at.length >= 0.6) return true;
  }
  return false;
}

function suppressed(anchor: string, program: string | undefined, disposed: DisposedForBackstop[]): boolean {
  return disposed.some((d) => {
    if (!findingTouchesSetAside(d.f)) return false;
    const handled = d.disposition === "disqualifying" || d.disposition === "met" || d.f.cautionFloor === true;
    if (!handled) return false;
    // BRK-5: a set-aside's PROGRAM is its identity. The lens grounds §L operative prose ("100 percent set aside
    // for small business…") while the detector keys the clause-matrix row ("52.219-6 Notice of Total Small
    // Business Set-Aside") — the same program in two textual homes that never share a word-run, so text anchoring
    // systematically failed to suppress and capped proven-in-pool firms to BWC. Match on program identity first.
    if (program && d.setAsideProgram) return d.setAsideProgram === program;
    return anchorsOn(d.f.excerpt, anchor);
  });
}

/** PURE. Given the RULING-3 set-aside notice union (clause-matrix notices ∪ SAM `setAside` metadata, threaded by
 *  the caller so the pure layer needs no importer) and deriveVerdict's dispositions, emit a BWC caveat for every
 *  set-aside pool no HANDLED finding already accounted for. Returns null when nothing fires. */
export function deriveSetAsideBackstop(
  disposed: DisposedForBackstop[],
  setAsideNotices: Array<{ excerpt: string; requirement: string; requiredAttribute?: string }>,
): SetAsideBackstopDisposition | null {
  const hits: SetAsideBackstopHit[] = [];

  for (const n of setAsideNotices) {
    const anchor = n.excerpt || n.requirement;
    if (!anchor) continue;
    if (suppressed(anchor, n.requiredAttribute, disposed)) continue;
    // de-dup by requiredAttribute — BRK-14: keying on a possibly-undefined attribute collapsed two DIFFERENT
    // programs into one hit (undefined === undefined). Fall back to the anchor text when the attr is absent,
    // which the ruling-3 SAM-metadata caller can produce.
    const dedupKey = n.requiredAttribute ?? `anchor:${norm(anchor)}`;
    if (hits.some((h) => (h.requiredAttribute ?? `anchor:${norm(h.sentence)}`) === dedupKey)) continue;
    hits.push({
      cls: "set_aside",
      sentence: anchor,
      requirement: `Socioeconomic set-aside pool — award eligibility is limited to qualifying firms; confirm your firm's size/certification under the assigned NAICS before relying on eligibility${n.requiredAttribute ? ` (${n.requiredAttribute})` : ""}`,
      requiredAttribute: n.requiredAttribute,
    });
  }

  if (!hits.length) return null;
  return {
    hits,
    cap: "BID_WITH_CAUTION",
    // Non-exhaustive register (contracts amendment A5): this reads as a minimum to confirm, never as an
    // inventory the customer could rely on as complete.
    reason: `At minimum, confirm the following bidder-determinable eligibility condition(s) before bidding: ${hits.map((h) => h.requirement).join("; ")}`,
  };
}
