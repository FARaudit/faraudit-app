// PANEL WIRING ARC (card #523, 2c) — DETERMINISTIC ABSENCE-GROUNDING GATE. Brain condition (2026-07-15):
// DECLARATION ≠ PRESENCE. A lens/skeptic SAYING an element is absent ("there is no Section B", "§M is not
// included", "clause 52.212-1 is missing") is NOT evidence — only a deterministic scan of the ACTUAL package
// contents is. So an absence claim about a DETERMINISTICALLY CHECKABLE element (a UCF section, a FAR/DFARS clause
// number, an enumerated named artifact) is resolved against the real package:
//   • the scan finds the element PRESENT  → the absence claim is FALSE → DROP it (the seq-1 "no Section B" bug).
//   • the scan confirms it GENUINELY MISSING → the absence claim is corroborated → KEEP it (a real coverage gap;
//     a genuine-absence counter-probe downgrade must survive).
//   • the claim is NOT an absence-of-checkable-element assertion → the gate ABSTAINS (leave to normal handling).
//
// DOCTRINE ALIGNMENT: this is NOT a bar-vocab blocklist — it is a position-checked SHAPE detector over an ALLOWLIST
// of deterministically-checkable subjects, and it FAILS TOWARD KEEP (never silently drops a finding it cannot
// confidently prove is a false absence claim). Pure & deterministic → $0 gate-testable / bankable. Feeds BOTH the
// panel verifier (→ REFUTED) and the v3 finding set (→ drop, flag-gated).
import { detectSections } from "./section-boundary-detector";
import type { ExtractedDocument } from "./pdf-text-extractor";

export interface PackageMarkers {
  /** UCF section keys genuinely present in the package (from detectSections — real content, not a mention). */
  sections: Set<string>;
  /** FAR/DFARS clause tokens present verbatim in source (e.g. "52.212-1", "252.204-7012"). */
  clauses: Set<string>;
  /** enumerated named artifacts present (canonical key), each detected by a deterministic presence marker. */
  artifacts: Set<string>;
}

/** local string→ExtractedDocument shim (mirrors panel-adapter.asExtractedDoc — no cross-module coupling). */
function asExtractedDoc(text: string): ExtractedDocument {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return { pages: [{ pageNum: 1, text, lines }], rawText: text, pageCount: 1, extractionMethod: "fallback", warnings: [] };
}

// FAR/DFARS clause token — 52.xxx-n or 252.xxx-n (the checkable clause-number shape).
const CLAUSE_TOKEN_RE = /\b((?:52|252)\.\d{3}-\d{1,4})\b/g;

// CHECKABLE named artifacts (SHAPE allowlist) → canonical key + a deterministic presence marker. Kept small +
// high-precision; an artifact absent from this list is simply not gate-checkable (the gate abstains on it).
const ARTIFACT_MARKERS: Array<{ key: string; present: RegExp }> = [
  { key: "wage_determination", present: /\bwage determination\b|\bWD\s*\d{2}-\d/i },
  { key: "dd254", present: /\bDD[\s-]?(?:Form[\s-]?)?254\b/i },
];
// how an absence claim REFERS to each artifact (the subject phrase in the claim text).
const ARTIFACT_REF: Array<{ key: string; ref: RegExp }> = [
  { key: "wage_determination", ref: /\bwage determination\b/i },
  { key: "dd254", ref: /\bDD[\s-]?(?:Form[\s-]?)?254\b/i },
];

/** Deterministically index what the package GENUINELY CONTAINS. `opts.sections` lets a caller (the panel runner)
 *  supply an already-detected section set (from buildPanelInputs over the real fullSource) instead of re-detecting. */
export function scanPackageMarkers(fullSource: string, opts?: { sections?: Set<string> }): PackageMarkers {
  const src = fullSource ?? "";
  const sections = opts?.sections
    ? new Set(opts.sections)
    : new Set(
        Object.entries(detectSections(asExtractedDoc(src)).sections)
          .filter(([, s]) => s?.text && s.text.trim().length > 0)
          .map(([k]) => k),
      );
  const clauses = new Set<string>();
  const re = new RegExp(CLAUSE_TOKEN_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) clauses.add(m[1]);
  const artifacts = new Set(ARTIFACT_MARKERS.filter((a) => a.present.test(src)).map((a) => a.key));
  return { sections, clauses, artifacts };
}

// ── ABSENCE-SHAPE detection (position-checked) ──────────────────────────────────────
// A negation cue GOVERNING a checkable subject. Two robust structures only (conservative — under-detection is the
// SAFE direction: a missed absence claim merely survives to normal handling; it is never wrongly suppressed):
//   (1) CUE-BEFORE:      "no / without / missing / absent / no such <SUBJECT>"
//   (2) SUBJECT-NEGATED: "<SUBJECT> ... is/are/was not (included|present|provided) | is/are missing | omitted"
const CUE_BEFORE = "(?:no|without|missing|absent|absence of|no such|lacks?|lacking|omit(?:s|ted)?)";
const NEG_PREDICATE = "(?:(?:is|are|was|were|been)\\s+(?:not\\s+(?:included|present|provided|attached|incorporated)|missing|absent|omitted)|not\\s+(?:included|present|provided|attached|incorporated))";

const SUBJECT_SECTION = "(?:section|§|part)\\s*([A-M])\\b";
const SUBJECT_CLAUSE = "((?:52|252)\\.\\d{3}-\\d{1,4})\\b";

type Resolution = "drop_present" | "keep_absent" | "not_applicable";

/** Resolve an absence claim against the deterministic package scan. Returns:
 *   drop_present  — the claim asserts absence of a checkable element the scan confirms PRESENT → suppress it.
 *   keep_absent   — the claim asserts absence of a checkable element the scan confirms GENUINELY MISSING → keep.
 *   not_applicable — not a checkable absence-of-element assertion → the gate abstains (normal handling).
 *  Pure. On any ambiguity the gate returns not_applicable (fails toward KEEP — never a silent drop). */
export function resolveAbsenceClaim(text: string, markers: PackageMarkers): Resolution {
  const t = text ?? "";
  const found: Array<{ present: boolean }> = [];

  const consider = (present: boolean) => found.push({ present });

  // (1) sections
  for (const re of [
    new RegExp(`\\b${CUE_BEFORE}\\s+${SUBJECT_SECTION}`, "ig"),
    new RegExp(`\\b${SUBJECT_SECTION}[^.\\n]{0,40}?\\b${NEG_PREDICATE}`, "ig"),
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) consider(markers.sections.has(m[1].toUpperCase()));
  }
  // (2) clauses
  for (const re of [
    new RegExp(`\\b${CUE_BEFORE}\\s+(?:clause\\s+)?${SUBJECT_CLAUSE}`, "ig"),
    new RegExp(`\\b${SUBJECT_CLAUSE}[^.\\n]{0,40}?\\b${NEG_PREDICATE}`, "ig"),
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) consider(markers.clauses.has(m[1]));
  }
  // (3) named artifacts — cue must govern the artifact reference (cue-before OR subject-negated, within a window)
  for (const a of ARTIFACT_REF) {
    if (!a.ref.test(t)) continue;
    const refSrc = a.ref.source;
    const cueBefore = new RegExp(`\\b${CUE_BEFORE}\\s+(?:a\\s+|an\\s+|the\\s+)?${refSrc}`, "i");
    const subjNeg = new RegExp(`${refSrc}[^.\\n]{0,40}?\\b${NEG_PREDICATE}`, "i");
    if (cueBefore.test(t) || subjNeg.test(t)) consider(markers.artifacts.has(a.key));
  }

  if (!found.length) return "not_applicable";
  // If ANY referenced checkable element is confirmed PRESENT, the absence claim is contradicted → drop. Otherwise
  // every referenced element is confirmed genuinely missing → the claim is corroborated → keep.
  return found.some((f) => f.present) ? "drop_present" : "keep_absent";
}

/** True when `text` is an absence claim CONTRADICTED by the package (a checkable element it calls absent is present).
 *  The panel verifier / v3 gate uses this to deterministically REFUTE/drop the claim. */
export function absenceClaimContradicted(text: string, markers: PackageMarkers): boolean {
  return resolveAbsenceClaim(text, markers) === "drop_present";
}
