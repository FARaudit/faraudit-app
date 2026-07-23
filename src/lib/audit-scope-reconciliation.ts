// FINDING-#46 RECONCILIATION (repair-unit item C, card #703/#707/#705 · flag AUDIT_SCOPE_OPACITY_RECONCILE, default-OFF).
//
// DEFECT (FA813726R0033, first live run): a model lens read the terse UCF Section C body ("WWYK260007 RENOVATE
// PRATT AND WHITNEY AREA B3001") and emitted a P0 gate finding — "Scope opacity … no SOW, drawings, or
// specifications visible in the solicitation sections provided; bidder cannot price or schedule without the full
// OPR package" — WHILE the same audit had ingested and read ATT10_260007_SOW (the Statement of Work, grounded by a
// separate finding). The scope is NOT opaque; it is in the attachment the lens did not reconcile against. The
// finding is materially false to the customer (a P0 "cannot price" alarm on a package whose SOW was read).
//
// FIX (SHAPE allowlist, deterministic — mirrors the item-B guard): a finding whose requirement ASSERTS that the
// scope documents are ABSENT / NOT VISIBLE is DEMOTED from the P0 gate band to a P2 attribute/caveat ONLY when the
// document set PROVES a SOW/specifications/drawings attachment was read (a grounded finding whose excerpt/citation
// names an ATT*_SOW-class doc / "Statement of Work" / Section J attachment). If NO scope attachment was read
// (scope genuinely absent), the finding is UNTOUCHED and still promotes. Flag-OFF ⇒ findings pass through
// byte-identical.
//
// SHAPE, not blocklist: matches the ABSENCE claim ("scope opacity", "no SOW … visible", "specifications … not …
// provided"), never a normal REQUIREMENT finding ("must price all scope defined in ATT10_260007_SOW" — a §J
// submission gate — carries no absence claim, so it never matches and never demotes).

import type { TypedFinding } from "./audit-findings";

// The OVERCLAIM shape: a finding asserting the scope/SOW/specs/drawings are absent or not-visible in what was read.
export const SCOPE_OPACITY_OVERCLAIM_RE =
  /\bscope opacity\b|\bno\b[^.\n]{0,30}\b(?:sow|statement[\s-]of[\s-]work|specifications?|specs?|drawings?|scope)\b[^.\n]{0,45}\b(?:visible|provided|available|attached|included|present|furnished|found)\b|\b(?:sow|statement[\s-]of[\s-]work|specifications?|drawings?|scope|opr\s+package)\b[^.\n]{0,45}\b(?:not|are\s+not|is\s+not|were\s+not|no)\b[^.\n]{0,35}\b(?:visible|provided|in\s+the\s+(?:solicitation\s+)?sections|attached|included|available|present|furnished)\b/i;

// PROOF a scope document was read: a GROUNDED field (excerpt/citation) naming a SOW / specifications / drawings
// attachment. Tested against excerpt+citation (the grounded spans), never `requirement` (the model narrative) —
// so the overclaim finding cannot self-satisfy this from its own "no SOW" narrative.
export const SCOPE_DOC_ATTACHMENT_RE =
  /\bATT\s*[-_ ]?\d+[^.\n]{0,30}\b(?:SOW|statement[\s-]of[\s-]work|spec(?:ification)?s?|drawings?)\b|\b_SOW\b|\bstatement[\s-]of[\s-]work\b|\bSection\s+J\b[^.\n]{0,30}\battachment|\b(?:specifications?|drawings?)\b[^.\n]{0,25}\b(?:attachment|package|\.pdf|\.dwg)\b/i;

/** True when the finding set carries GROUNDED proof that a SOW/spec/drawings attachment was read. */
export function scopeDocReadInSet(findings: TypedFinding[], source?: string | null): boolean {
  for (const f of findings) {
    if (SCOPE_DOC_ATTACHMENT_RE.test(f.excerpt ?? "")) return true;
    if (SCOPE_DOC_ATTACHMENT_RE.test(f.citation ?? "")) return true;
  }
  // Fallback: the assembled source itself names a Statement of Work attachment (an ATT*_SOW / "Statement of Work"
  // document line). Conservative — the grounded-finding signal above is the primary; this only widens to a package
  // whose SOW was read but not separately findings-grounded.
  return /\bATT\s*[-_ ]?\d+[^.\n]{0,30}\b(?:SOW|statement[\s-]of[\s-]work)\b|\b_SOW\b\s*(?:statement[\s-]of[\s-]work)?/i.test(source ?? "");
}

/** Demote a scope-opacity OVERCLAIM finding from the P0 gate band to a P2 attribute/caveat when a scope attachment
 *  was proven read. Pure; returns the finding unchanged when the flag is off, the shape doesn't match, the finding
 *  isn't in the gate band, or no scope doc was read. */
export function reconcileScopeOpacity(
  findings: TypedFinding[],
  source: string | null | undefined,
  enabled: boolean
): TypedFinding[] {
  if (!enabled) return findings;                         // flag-OFF ⇒ byte-identical
  if (!scopeDocReadInSet(findings, source)) return findings; // scope genuinely absent ⇒ untouched, still promotes
  return findings.map((f) => {
    // Only demote a GATE-BAND finding (P0) that carries the absence overclaim in its own requirement. A finding
    // already advisory (P2) or one that merely requires SOW compliance is left exactly as-is.
    const isGateBand = f.severity === "P0";
    const isOverclaim = SCOPE_OPACITY_OVERCLAIM_RE.test(f.requirement ?? "");
    if (isGateBand && isOverclaim) {
      return { ...f, severity: "P2" as const, scopeReconciledDemoted: true };
    }
    return f;
  });
}
