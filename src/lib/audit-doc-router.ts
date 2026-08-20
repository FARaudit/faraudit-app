// ── THE DOCUMENT ROUTER — deterministic pre-panel assignment (flag `AUDIT_DOC_OWNERSHIP`, default OFF) ──
//
// Brain ruling, CEO-approved 2026-08-17. What it changes, in one line: today every non-coverage lens is
// handed the WHOLE binding-document list with "read the ones whose subject matter your lens owns; ignore
// the rest" — and that is an OFFER, because four of the five lanes are keyed to UCF SECTIONS and a posted
// attachment is not a section. Measured on the flagship: 48 of 49 obligation-carrying documents have NO
// POSSIBLE OWNER, so "the rest" is structurally unownable and nobody reads it.
//
// ⛔ ITS OWN FLAG, NEVER INHERITING `AUDIT_ATTACHMENT_COVERAGE`. That flag reads FALSE on the live
// worker, so anything routed through it ships INERT while passing its own tests — the exact shape that
// left the cross-attachment uniqueness guard dark in production. Same lesson, same paragraph, on purpose.
//
// ⛔ WHAT THIS DOES NOT DO. It does not fix VOLUME (ruling R1): ownership rebalances who reads what, and
// on the uncapped measure the busiest lane still holds 655,864 tokens against an 8-turn budget. The
// second axis — batched per-document extraction, `AUDIT_DOC_EXTRACTION` — is required, not optional.
//
// Deterministic. $0. No model call. Name-based only, allowlist shapes only, 1:1 with NO fan-out.
import { ownerOf, type LensKey } from "./audit-doc-ownership";
import { NOTICE_BODY_DOC_NAME } from "./audit-coverage-definition";

/** Residue owner BY RULE, not by name: `former_ko`'s lane is already "the whole package for show-stoppers
 *  and traps an evaluator would enforce" (audit-lenses.ts:60), which is exactly the disposition an
 *  unidentifiable binding document needs. Measured cost on the worst package: ~14k tok on top of its own
 *  21k. The residue does not disappear under routing — it becomes ONE lens's NAMED responsibility, which
 *  is the whole point, because today it is nobody's. */
export const RESIDUE_OWNER: LensKey = "former_ko";

export const DOC_OWNERSHIP_ENABLED = (): boolean => process.env.AUDIT_DOC_OWNERSHIP === "true";

export type Assignment = {
  /** document name → the ONE lens that owns it */
  byDoc: Array<{ doc: string; owner: LensKey; why: string; viaResidue: boolean }>;
  /** the documents no observed shape matched — NAMED, and assigned to RESIDUE_OWNER by rule */
  residue: string[];
  /** documents deliberately not routed: the notice body is UNIVERSAL, every lens already reads it */
  universal: string[];
};

/**
 * Assign every document to exactly one owning lens. TOTAL: every input name comes back either in
 * `byDoc` or in `universal`, and `residue` is a NAMED subset of `byDoc` — never a silent drop.
 */
export function assignDocuments(docNames: string[]): Assignment {
  const byDoc: Assignment["byDoc"] = [];
  const residue: string[] = [];
  const universal: string[] = [];
  for (const doc of docNames) {
    if (doc === NOTICE_BODY_DOC_NAME) { universal.push(doc); continue; }
    const { owner, why } = ownerOf(doc);
    if (owner === "RESIDUE") {
      residue.push(doc);
      byDoc.push({ doc, owner: RESIDUE_OWNER, why: "no observed shape matched — residue owner by rule", viaResidue: true });
    } else {
      byDoc.push({ doc, owner, why, viaResidue: false });
    }
  }
  return { byDoc, residue, universal };
}

/** The documents THIS lens owns, in the order they were listed. */
export function documentsOwnedBy(docNames: string[], lensKey: string): string[] {
  return assignDocuments(docNames).byDoc.filter((a) => a.owner === lensKey).map((a) => a.doc);
}
