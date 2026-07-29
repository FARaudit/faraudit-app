// PRIMARY-DOCUMENT RESOLUTION — leaf module (extracted VERBATIM from audit-tools.ts, 2026-07-29, root-b U1).
// Moved so section-boundary-detector can consult the SAME ratified election (Card #370 R1) that docRegions uses —
// audit-tools imports the detector, so the detector could not import audit-tools back (cycle). audit-tools re-exports
// parseDocRegions/resolvePrimary, keeping every existing consumer's import path byte-compatible. NO behavior change.

/** ReDoS-PROOF parse of the assembled source into DOCUMENT regions (Gauntlet #349 R3). The delimiter
 *  "==== DOCUMENT: name ====" is always written on its OWN line by assembleFullSource, so we scan LINE-BY-LINE with
 *  pure string ops (startsWith/endsWith/slice) — never a backtracking regex. The prior split regex (.+?)/([^=]{1,300}?)
 *  with \s+…\s+ around a whitespace-matching class was empirically quadratic (16k spaces ≈ 43s). A line that does NOT
 *  both start and end with "====" is rejected in O(1), so a pathological whitespace run can't blow up. Byte-identical
 *  regions to the old split on well-formed input. Exported + shared so audit-orchestrator.docRegions uses the same. */
const DOC_NAME_RE = /^DOCUMENT:\s*(.+)$/; // runs ONLY on the bounded inner slice between the ==== fences — linear, no overlap
/** Parse a single delimiter LINE ("==== DOCUMENT: name ===="); returns the doc name or null. Shared by
 *  parseDocRegions and the section detector's line-indexed region walk (same fence logic, one definition). */
export function parseDelimiterName(line: string): string | null {
  const t = line.trim();
  if (t.length >= 8 && t.startsWith("====") && t.endsWith("====")) {
    const m = DOC_NAME_RE.exec(t.slice(4, -4).trim());
    if (m) return m[1].trim();
  }
  return null;
}
export function parseDocRegions(src: string): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  let name: string | null = null;
  let buf: string[] = [];
  for (const line of (src ?? "").split("\n")) {
    const hitName = parseDelimiterName(line);
    if (hitName !== null) { if (name !== null) out.push({ name, text: buf.join("\n") }); name = hitName; buf = []; }
    else if (name !== null) buf.push(line);
  }
  if (name !== null) out.push({ name, text: buf.join("\n") });
  return out;
}

// PRIMARY-DOCUMENT IDENTITY (Gauntlet Card #370 RULING 1 — write-order primary detection is a defect, same failure
// class as amendment/supersession blindness: on an amended multi-doc buy assembleFullSource may write an amendment
// FIRST, so `i === 0` tags the amendment as the solicitation and the real solicitation as an attachment). resolvePrimary
// keys the primary off DOCUMENT IDENTITY, not write-order: a solicitation FORM (SF-1449/1442/33/18) or UCF section
// density scores a doc as the primary; an AMENDMENT marker (SF-30 / "AMENDMENT OF SOLICITATION" / am_/mod filename)
// DISQUALIFIES a doc from primary candidacy outright — even one that copies the base solicitation's form. Fail-toward:
// when no doc confidently qualifies (`confident=false`), the CALLER routes to a manifest/readability honest-fail (NHR),
// never a silent first-doc default. Head-scan only (forms/UCF headers live at the top) → linear, $0.
const SOLICITATION_FORM_RE = /\bSF ?1449\b|SOLICITATION\/CONTRACT\/ORDER FOR COMMERCIAL|STANDARD FORM 1449|\bSF ?1442\b|SOLICITATION,? OFFER,? AND AWARD|STANDARD FORM 1442|\bSF ?33\b|STANDARD FORM 33|\bSF ?18\b|REQUEST FOR QUOTATIONS?\b/i;
// SF-30 amendment IDENTITY — the SF-30 form TITLE ("AMENDMENT OF SOLICITATION/MODIFICATION OF CONTRACT") or the form
// number, in the doc HEAD only (the form title sits at the very top). Deliberately NOT a bare "AMENDMENT OF SOLICITATION"
// substring: that phrase appears in base-solicitation §L amendment-acknowledgment instructions (52.215-1/52.214-3, SF-1449
// block 14) and a loose match would FALSE-DISQUALIFY the real primary → spurious primaryIndeterminate/NHR (Card #370
// code-review finding). Named amendments (am_/amd/mod + digit) are caught by filename regardless; this body regex is the
// backstop for an UN-named SF-30. Blind-ultracode #372 fixes: (1) match the SF-30 form TITLE only (drop the bare
// "standard form 30" substring, which a CONFORMED base solicitation can carry in its amendment-acknowledgment block →
// false-disqualify); (2) scan the SAME 20000-char head window resolvePrimary uses — a 3000-char window let a cover-paged
// SF-30 (title past char 3000) evade disqualification while its "Request for Quotations" body still scored it as primary.
const AMENDMENT_DOC_RE = /amendment of solicitation[\s\/]{0,3}modification of contract\b/i;
const AMENDMENT_NAME_RE = /(?:^|[^a-z])(?:am|amd|amend(?:ment)?|mod(?:ification)?)[_\- .]?\d/i;
// ANCHOR EXTENSION (root-b U1, panel-on-design 2026-07-29: "extend resolvePrimary if its anchors are thin" —
// measured confident=false on BOTH live CERT-5 packages). VA names amendment notices "SOL# 000N.docx" — no am/amd
// filename token, no SF-30 form title — but their body carries the standard amendment-cover sentence ("The purpose
// of this amendment is to extend the close date…"). Same 20000-char head window as every other identity anchor.
// Direction note: a CONFORMED reissue that embeds an amendment cover page would be disqualified by this anchor —
// that falls to confident=false → the caller's NHR routing, never a silent wrong pick (conservative).
const AMENDMENT_PURPOSE_RE = /the purpose of this (?:amendment|modification) is/i;
const isAmendmentRegion = (r: { name: string; text: string }) => {
  const head = r.text.slice(0, 20000);
  return AMENDMENT_NAME_RE.test(r.name) || AMENDMENT_DOC_RE.test(head) || AMENDMENT_PURPOSE_RE.test(head);
};
/** Pick the primary solicitation region by IDENTITY (Card #370 R1). Returns the chosen index and whether the pick is
 *  CONFIDENT (a real solicitation form / strong UCF structure was found on a non-amendment doc). `confident=false` on a
 *  multi-doc package means no doc looks like the solicitation → the caller must fail-toward NHR. `index` is a best-effort
 *  non-amendment fallback purely so downstream region math stays total; it is NEVER trusted when confident=false. */
export function resolvePrimary(regions: Array<{ name: string; text: string }>): { index: number; confident: boolean } {
  if (regions.length === 0) return { index: -1, confident: false };
  if (regions.length === 1) return { index: 0, confident: true };
  let best = -1, bestScore = -1;
  regions.forEach((r, i) => {
    if (isAmendmentRegion(r)) return;                                   // amendment markers DISQUALIFY from primary
    const head = r.text.slice(0, 20000);
    // UCF density: LINE-ANCHORED "SECTION X" headers only (a real UCF solicitation prints them as headings), NOT inline
    // "see Section C" cross-references — else a compliance-matrix / flow-down attachment that merely cites UCF sections
    // could out-score the true solicitation and be confidently mis-picked as primary (Card #370 code-review finding).
    const ucf = Math.min((r.text.match(/^\s*SECTION [A-M]\b/gim) || []).length, 13);
    // ANCHOR EXTENSION (root-b U1, panel-authorized 2026-07-29) — two solicitation identities that carry NO form:
    //   · a LETTER RFP ("Letter Request for Proposal", the DLA SPRRA2-26-R-0034 shape), and
    //   · a FAR 12.603 COMBINED SYNOPSIS/SOLICITATION (its definitional boilerplate IS the identity — the same
    //     pattern the section detector's format pass uses; the 36C24126Q0569 shape).
    // Both are form-grade identity statements (+100 class), not density heuristics.
    const identity = SOLICITATION_FORM_RE.test(head)
      || /letter request for proposal/i.test(head)
      || /combined\s+synopsis\s*\/?\s*solicitation|format\s+(?:prescribed\s+)?in\s+(?:FAR\s+)?subpart\s+12\.6/i.test(head);
    const score = (identity ? 100 : 0) + ucf * 5;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  // CONFIDENT only when a real solicitation form OR strong UCF density (≥5 sections) was found on a non-amendment doc.
  if (best >= 0 && bestScore >= 25) return { index: best, confident: true };
  const firstNonAmend = regions.findIndex((r) => !isAmendmentRegion(r)); // best-effort fallback (NHR-routed, never trusted)
  return { index: firstNonAmend >= 0 ? firstNonAmend : 0, confident: false };
}
