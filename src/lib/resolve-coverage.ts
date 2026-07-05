// L4 (front-door notice-body parity) — the PURE, $0 coverage logic the Run-Audit door uses,
// factored out of app/api/audit/resolve/route.ts so it is unit-testable without a live request.
//
// WHY: the full audit (post-L1) ingests the SAM NOTICE BODY as a first-class doc, so a combined
// synopsis/solicitation that carries §C/§L/§M INLINE in the body — with a thin or absent form
// file — is read completely by the engine. The door previously read only a posted ATTACHMENT and
// was blind to the body (ledger gap "front-door excludes body"), so body-borne sections surfaced
// as "absent"/"unverified" up front while the audit found them — a false alarm (the cardinal sin
// the three-state design fights) and the notice-body-blind class (80NSSC).
//
// L4 closes the gap deterministically and for FREE: the door reads the SAME notice body the engine
// does and credits any section it can positively detect. It does NOT run the agentic L3 finder
// (cost + latency have no place in a 30s door); narrative §L/§M that only L3 can locate stay
// UNVERIFIED at the door (never "absent") whenever a notice body is in play — the MAP/L3 confirms.
import { detectSections } from "./section-boundary-detector";
import type { ExtractedDocument } from "./pdf-text-extractor";

export type ContentSections = { C: boolean; L: boolean; M: boolean; I: boolean };
export type SectionState = "present" | "absent" | "unverified";

// Mirror agentic-executor.MIN_DOC_TEXT_CHARS — below this the resolved body is not substantive
// enough to treat as read.
export const NOTICE_BODY_MIN_CHARS = 50;
// A body at least this large stands in as the primary solicitation when no form file was posted
// (engine parity: "no form → the notice body IS the primary"). Higher than the detect floor so a
// one-line synopsis stub does not flip MAIN present.
export const NOTICE_BODY_MAIN_CHARS = 400;

// Build an ExtractedDocument from resolved notice-body text so the line-based section detector can
// run on it. resolveSamDescription strips HTML and collapses whitespace to single spaces, so the
// body arrives as ONE long line. The detector's section patterns are LINE-ANCHORED (^…), so break
// before each reliable heading marker to give it line-starts to match: "SECTION X" / "PART <roman>"
// UCF headers AND FAR clause numbers (52.212-1 §L, -2 §M, -4/-5 §I — the commercial combined-RFQ
// markers this closes). Prose title phrases without a marker stay undetected → "unverified" (honest;
// only the audit's L3 finder authoritatively locates narrative sections).
export function bodyTextToDoc(text: string): ExtractedDocument {
  const lines = text
    .split(/\r?\n/)
    .flatMap((l) => l.split(/(?=\bSECTION\s+[A-M]\b|\bPART\s+[IVX]+\b|\b5?2\.21\d-\d\b)/i))
    .map((l) => l.trim())
    .filter(Boolean);
  const finalLines = lines.length ? lines : [text];
  return {
    pages: [{ pageNum: 1, text, lines: finalLines }],
    rawText: text,
    pageCount: 1,
    extractionMethod: "pdf-parse",
    warnings: [],
  };
}

// Run the SAME section detection the audit pipeline uses over the notice-body text. Returns which
// of §C/§L/§M/§I are POSITIVELY detected (deterministic — narrative sections only L3 can locate are
// not asserted here; they degrade to "unverified" via sectionStateFor below).
export function detectBodySections(text: string): ContentSections {
  const bag = detectSections(bodyTextToDoc(text));
  const s = bag.sections;
  return { C: !!s["C"], L: !!s["L"], M: !!s["M"], I: !!s["I"] };
}

// The honest three-state resolver, L4-aware. Reading the body deterministically here is NOT
// authority to declare a narrative section absent — only the audit's L3 finder can. So a
// not-detected core section is "absent" ONLY when we did a content read AND there is no notice
// body in play; otherwise it is "unverified" (the full audit confirms). Never present as missing.
//
// COUPLING (surfaced by adversarial review, both hold in prod):
//   1. This defers narrative §L/§M to the audit's L3 finder, which is LIVE in prod
//      (AUDIT_SECTION_FINDER=true). If L3 were disabled, the door ("unverified") and audit
//      ("absent") would SOFT-disagree — both non-catastrophic; "unverified" still fails safe.
//   2. The door↔audit disagreement is one-directional and acceptable: the door defers (never
//      false-alarms), and the audit remains AUTHORITATIVE — it honestly reports INCOMPLETE (and
//      no-charges on honest-fail) when a core section it deferred on is genuinely absent.
export function sectionStateFor(
  present: boolean,
  coverageBasis: "content" | "name_only",
  noticeBodyInPlay: boolean
): SectionState {
  if (present) return "present";
  if (coverageBasis === "content" && !noticeBodyInPlay) return "absent";
  return "unverified";
}
