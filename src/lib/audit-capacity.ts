// ── SINGLE-PASS CAPACITY — can this package be READ at all? (Brain ruling R2) ─────────────────────────
//
// THE QUESTION NOBODY WAS ASKING. A lens gets `AUDIT_LENS_MAX_TURNS` turns (default 8) and the last one is
// FORCED to submit_findings, so it has at most `maxTurns - 1` turns in which to call read_document — one
// document per turn. A lens that OWNS 12 documents therefore cannot read 12 documents. Not slowly, not
// expensively: it structurally cannot. Today it fails at this SILENTLY — it reads a few, submits, and the
// documents it never opened are indistinguishable from documents that held nothing.
//
// Ruling R2, CEO-approved 2026-08-17: a package beyond single-pass capacity is an HONEST-FAIL case, not a
// target. The engine names it and refuses. Do not engineer around it. ONE implementation, not two.
//
// ⛔ THE THRESHOLD IS DERIVED, NEVER HARDCODED. Measured over 50 banked packages, the busiest lens owns
// p50 3 · p90 7 · max 12 documents — and the read budget is 7. So the population sitting beyond capacity is
// a function of the BUDGET, not a property of the packages:
//
//     maxTurns  8 →  3 of 50 beyond capacity   (flagship W911SG27BA002 over by ONE document)
//     maxTurns 10 →  1 of 50                   (flagship within)
//     maxTurns 16 →  0 of 50
//
// A hardcoded "3 packages are too big" would have frozen a claim about the corpus that is really a claim
// about a config value, and it would have gone stale the first time anyone touched the budget. Reading the
// budget at call time means raising it automatically shrinks the refusal, with no edit here.
//
// ⚠ WHAT THIS DOES NOT SAY. Capacity is about whether a lens CAN OPEN a document, not whether it analyses
// it well. The sweep above says a bigger budget removes the structural block; it says nothing about whether
// the extra reads produce grounded findings. That is a live-run question and it is not answered here.
//
// Deterministic. $0. No model call, no I/O.
import { ownerOf, isSpecBulk, type LensKey } from "./audit-doc-ownership";
import { RESIDUE_OWNER } from "./audit-doc-router";
import { NOTICE_BODY_DOC_NAME } from "./audit-coverage-definition";

export const SIZE_REFUSAL_ENABLED = (): boolean => process.env.AUDIT_SIZE_REFUSAL === "true";

/** The last turn is forced to submit_findings, so it is never available for a read. */
export const readTurnsFor = (maxTurns: number): number => Math.max(0, maxTurns - 1);

export type LensLoad = { lens: LensKey; documents: string[] };
export type CapacityAssessment = {
  /** false ⇒ at least one lens owns more documents than it has turns to open them */
  withinCapacity: boolean;
  /** the read budget this was measured against — the number that moves, not the packages */
  readTurns: number;
  perLens: LensLoad[];
  /** the lens with the most owned documents, and how many */
  busiest: { lens: LensKey; documents: number } | null;
  /** documents owned by an over-capacity lens BEYOND its budget — the honest gap, NAMED.
   *  Order is the package's own order, so the same package always names the same documents. */
  beyondCapacity: string[];
};

/**
 * Assess whether every owned document can be opened in one pass.
 *
 * `specBulkToExtraction` mirrors the live routing: under AUDIT_DOC_EXTRACTION_SPEC_BULK the homogeneous
 * specification pile goes to per-document extraction rather than to a lens, so it does not consume a lens's
 * turns and must not count against its budget. Passing the wrong value here would produce a refusal that
 * does not match what the engine actually does — which is worse than no refusal at all.
 */
export function assessSinglePassCapacity(
  docNames: string[],
  opts?: { maxTurns?: number; specBulkToExtraction?: boolean },
): CapacityAssessment {
  const readTurns = readTurnsFor(opts?.maxTurns ?? (Number(process.env.AUDIT_LENS_MAX_TURNS) || 8));
  const specBulkToExtraction = opts?.specBulkToExtraction ?? false;

  const byLens = new Map<LensKey, string[]>();
  for (const name of docNames) {
    if (name === NOTICE_BODY_DOC_NAME) continue;                       // UNIVERSAL — every lens reads it, owned by none
    if (specBulkToExtraction && isSpecBulk(name)) continue;            // routed to extraction, costs no lens turn
    const { owner } = ownerOf(name);
    const lens: LensKey = owner === "RESIDUE" ? RESIDUE_OWNER : owner; // residue owner BY RULE
    byLens.set(lens, [...(byLens.get(lens) ?? []), name]);
  }

  const perLens: LensLoad[] = [...byLens.entries()].map(([lens, documents]) => ({ lens, documents }));
  const busiest = perLens.reduce<{ lens: LensKey; documents: number } | null>(
    (acc, l) => (acc && acc.documents >= l.documents.length ? acc : { lens: l.lens, documents: l.documents.length }),
    null,
  );

  // The documents past the budget, per lens. Which SPECIFIC ones are past it is arbitrary — the lens
  // chooses its own reading order — so this names the OVERFLOW COUNT's worth from the end of each
  // over-capacity lane. The honest claim is "this lane cannot reach all of these", and the count is exact.
  const beyondCapacity: string[] = [];
  for (const l of perLens) {
    if (l.documents.length > readTurns) beyondCapacity.push(...l.documents.slice(readTurns));
  }

  return { withinCapacity: beyondCapacity.length === 0, readTurns, perLens, busiest, beyondCapacity };
}

/**
 * The customer-facing sentence. Refusing without NAMING does the hard half and skips the half a prospect
 * can verify in ninety seconds (ownership doctrine rule 4, Rule 61). It states the mechanism in plain words
 * — no flag names, no turn arithmetic — because the reader needs to know what was not read and what to do,
 * not how the budget is configured.
 */
export function capacityRefusal(a: CapacityAssessment, opts?: { maxNamed?: number }): string | null {
  if (a.withinCapacity) return null;
  const max = opts?.maxNamed ?? 6;
  const named = a.beyondCapacity.slice(0, max);
  const rest = a.beyondCapacity.length - named.length;
  return [
    `This package is larger than one audit pass can read. `,
    `${a.beyondCapacity.length} binding document${a.beyondCapacity.length === 1 ? "" : "s"} could not be opened, `,
    `so nothing in this report reflects ${a.beyondCapacity.length === 1 ? "it" : "them"}: `,
    named.join("; "),
    rest > 0 ? `; and ${rest} more` : "",
    `. Read ${a.beyondCapacity.length === 1 ? "that document" : "those documents"} directly before pricing or bidding. `,
    `Re-running will not change this.`,
  ].join("");
}
