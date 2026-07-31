// REPORT-TRUTH #8 — A FABRICATED MODAL QUALIFIER (flag AUDIT_FORCE_GROUNDING, default OFF).
//
// THE DEFECT, from live run 61aaaa95 (W9123826QA032). Two findings told the customer:
//     #18  "Mandatory site visit: Site visit will be held at … on 13 August 2026 at 11:00am PDT."
//     #30  "A mandatory site visit is scheduled at … on 13 August 2026 at 11:00am PDT."
// The word "mandatory" appears ZERO times in the run's 135,074 characters. Both findings' OWN grounding excerpt is
// the same sentence — "Site visit will be held at …" — which schedules an event and obligates nobody. The engine
// read a scheduling statement and published an attendance requirement.
//
// WHY THIS IS A DIFFERENT CLASS FROM REPORT-TRUTH #7, AND WHY #7 DID NOT TOUCH IT. #7 reconciles ASSERTED ABSENCE
// ("the PWS is not provided") against the run's own ledger. This is asserted PRESENCE OF FORCE — the finding invents
// a modal the source never used. I previously characterised #7 as killing "both surviving AUTO-Fs"; it killed one,
// because I described the fix by the failure that motivated it instead of by the predicate it implements. This
// module implements the other predicate.
//
// WHY RULE 64 DOES NOT ALREADY CATCH IT. Rule 64 requires every claim to carry a verbatim source excerpt and checks
// that the EXCERPT is really in the document. It is: "Site visit will be held at …" is verbatim source. What Rule 64
// never checks is whether the CLAIM says what its excerpt says. A finding can carry a perfectly grounded excerpt and
// assert something the excerpt flatly does not support, and pass. This gate closes that gap for modal force only —
// the narrowest slice where the mismatch is deterministically decidable.
//
// FAILURE DIRECTION — the load-bearing choice. Wrongly stripping force from a REAL requirement would soften a live
// obligation and under-warn the bidder, which is the dangerous direction. So every enumeration in this file is
// oriented so that being INCOMPLETE makes the gate fire LESS:
//   · the force-qualifier set (mandatory/compulsory/obligatory) — a phrasing we miss is simply not corrected;
//   · the obligation-marker set — the BROADER it is, the more often the gate stands down. Adding a marker can only
//     ever suppress a correction, never cause one.
// That is the opposite orientation from a bar-vocabulary blocklist (card #515), where an unenumerated term leaks
// through into a wrong DEMOTION. Here an unenumerated term leaves the status quo in place.
//
// SCOPE — TEXT ONLY. This module rewrites the assertion. It does NOT touch `disposition`, `severity` or
// `controllability`, so it cannot move the verdict or the gate. Whether a non-mandatory site visit should still be
// dispositioned `gate_to_clear` is a separate question owned by audit-decide.ts, which already has grounded
// machinery for it (AUDIT_SITEVISIT_MANDATORY_GROUNDED, card #703). Deterministic, $0, no model call.

import { SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "./audit-site-visit-patterns";

export const FORCE_CORRECTED_PREFIX = "CORRECTED — ";

export interface ForceGroundingResult<T> {
  findings: T[];
  corrected: Array<{ id: string; force: string; subject: string; before: string; after: string }>;
}

/** ABSOLUTE force adjectives. Deliberately NOT "required" / "must": those are ordinary obligation words that appear
 *  in legitimately grounded findings constantly, and treating them as suspect would put the gate in the path of
 *  routine true statements. These three assert categorical force and nothing else. Incomplete ⇒ fires less. */
const FORCE_QUALIFIER = /\b(mandatory|compulsory|obligatory)\b/i;

/** Any language by which a source sentence could impose an obligation. BREADTH IS THE SAFETY PROPERTY — every
 *  addition makes the gate stand down more often. Includes bare-noun and consequence forms, because an obligation
 *  need not be modal-anchored ("attendance is a prerequisite", "failure to attend will render the offer ineligible"). */
const OBLIGATION_MARKER = /\b(?:shall|must|mandatory|compulsory|obligatory|require[sd]?|requirement|prerequisite|precondition|condition\s+of|obligated|ineligible|disqualif\w*|nonresponsive|non-?responsive|barred|precluded|will\s+not\s+be\s+(?:considered|evaluated|accepted)|may\s+not\s+(?:bid|submit|propose))\b/i;

/** Words carrying no subject identity — dropped before the subject phrase is matched against the source. */
const SUBJECT_STOP = new Set(["a", "an", "the", "this", "that", "these", "those", "at", "for", "during", "of", "to", "in", "on", "any", "all", "its", "their"]);

/** The report renders `requirement` through `truncateOnWord(..., 400)` (src/app/audit/[id]/_view-model.ts, both the
 *  routed-row and matrix-title paths). Anything past that is silently dropped on the page while looking complete in
 *  the engine — which is how a correction can verify perfectly here and reach the customer with its evidence missing.
 *  So the module truncates to the SAME budget itself: what is persisted is then exactly what renders, and any loss is
 *  a deliberate, word-boundary one we chose rather than a silent tail-cut. Keep in step with the renderer. */
export const RENDER_BUDGET = 400;
export function fitToRender(s: string, budget = RENDER_BUDGET): string {
  if (s.length <= budget) return s;
  // The ellipsis counts against the budget. Slicing to `budget` and THEN appending it returned budget+1 characters,
  // so the renderer would still shave the tail — the exact silent divergence this function exists to prevent.
  const room = budget - 1;
  const cut = s.slice(0, room);
  const sp = cut.lastIndexOf(" ");
  return (sp > room * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, "") + "…";
}

/** The noun phrase the force qualifier modifies, read out of the finding at runtime — never from a list, so this
 *  cannot become a site-visit special case. Two shapes:
 *    attributive  "Mandatory SITE VISIT: …"          → words after the qualifier
 *    predicative  "ATTENDANCE at the site visit is mandatory" → words before the copula
 *  Returns "" when no confident subject can be read, and an unreadable subject means the gate does not fire. */
function qualifiedSubject(text: string, forceIdx: number, forceWord: string): string {
  const after = text.slice(forceIdx + forceWord.length);
  // The cap was {0,3} — four tokens total — which silently decapitated longer phrases: "Mandatory attendance at the
  // site visit" yielded "attendance site", losing the head noun and printing that nonsense back to the customer in
  // the correction sentence. The stop-word filter and the copula cut below are what actually bound the phrase, so
  // the token cap only needs to be a runaway guard, not a shaping rule.
  const attributive = (after.match(/^[\s,]*((?:[A-Za-z][A-Za-z-]*\s+){0,6}[A-Za-z][A-Za-z-]*)/) || [])[1] || "";
  const attrWords = attributive.split(/\s+/).filter(Boolean);
  // Stop at a copula or auxiliary — past it we are in the predicate, not the subject.
  const cut = attrWords.findIndex((w) => /^(?:is|are|was|were|will|shall|has|have|had|may|can)$/i.test(w));
  const attr = (cut >= 0 ? attrWords.slice(0, cut) : attrWords).filter((w) => !SUBJECT_STOP.has(w.toLowerCase()));
  if (attr.length) return attr.join(" ");

  // Predicative: "<NP> is/are mandatory" — read backwards from the copula that precedes the qualifier.
  const before = text.slice(0, forceIdx);
  const pre = (before.match(/([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,4})\s+(?:is|are|was|were|will\s+be|shall\s+be)\s*$/i) || [])[1] || "";
  const preWords = pre.split(/\s+/).filter((w) => w && !SUBJECT_STOP.has(w.toLowerCase()));
  return preWords.length ? preWords.join(" ") : "";
}

/** Every source sentence naming this subject. The subject's content words must appear in order, allowing small gaps
 *  ("site visit" also matches "site inspection visit"), so a rephrasing in the source still counts as naming it. */
function sentencesNaming(source: string, subject: string): string[] {
  const words = subject.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^A-Za-z-]/g, "")).filter(Boolean);
  if (!words.length) return [];
  // \b at both ends: without them "bond" matched inside "Bonding is waived" and "visit" inside "The revisit was
  // cancelled", so sentences that never discuss the subject counted as naming it — and one could then be selected as
  // the verbatim proof quote and attributed to a subject it never mentions.
  const re = new RegExp("\\b" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+(?:\\w+\\s+){0,2}") + "\\b", "i");
  return source.split(/(?<=[.!?])\s+|\n+/).filter((s) => re.test(s));
}

/**
 * Correct findings that assert categorical force their own grounding never establishes.
 *
 * Fires only when ALL FOUR hold — each one alone would be too loose:
 *   1. the requirement carries an absolute force qualifier, and a subject for it can be read;
 *   2. the finding's OWN excerpt carries no obligation language — its grounding does not support the force;
 *   3. the force word appears NOWHERE in the full source. If the document ever uses it, we do not second-guess
 *      which occurrence the lens meant;
 *   4. the source names the subject, and NO sentence naming it carries obligation language.
 *
 * Condition 4 is why this is subject-scoped rather than document-scoped, and on the specimen it is decisive: run
 * 61aaaa95's source DOES contain "must attend" — of the PRIME, at a post-award pre-work meeting, in a sentence that
 * never mentions a site visit. A whole-document obligation scan would have called the fabrication grounded and stood
 * down. Only the sentences naming the subject can answer the question.
 */
export function groundModalForce<T extends { id?: string; requirement?: string; excerpt?: string }>(
  findings: T[],
  fullSource: string,
): ForceGroundingResult<T> {
  const corrected: ForceGroundingResult<T>["corrected"] = [];
  const source = fullSource || "";
  if (!source) return { findings, corrected };

  const out = findings.map((f) => {
    const before = f.requirement ?? "";
    // Re-entry guard. The prefix is shared with REPORT-TRUTH #7 (audit-absence-reconcile), which runs FIRST in the
    // executor, so this also means a finding #7 already corrected is out of scope here. That is deliberate: #7's
    // output is a rebuilt sentence, and re-correcting it would emit "CORRECTED — CORRECTED — …". A finding whose
    // #7 correction happens to carry a fabricated qualifier therefore keeps it — the status-quo direction, safe.
    if (!before || before.startsWith(FORCE_CORRECTED_PREFIX)) return f;

    const fm = FORCE_QUALIFIER.exec(before);
    if (!fm) return f;
    const forceWord = fm[1];

    // (3) the force word is used nowhere in the document.
    if (new RegExp(`\\b${forceWord}\\b`, "i").test(source)) return f;

    // (2) the finding's own grounding carries no obligation.
    const excerpt = f.excerpt ?? "";
    if (OBLIGATION_MARKER.test(excerpt) || SITE_VISIT_MANDATORY_ATTENDANCE_RE.test(excerpt)) return f;

    // (1) read the subject the force is asserted of.
    const subject = qualifiedSubject(before, fm.index, forceWord);
    if (!subject) return f;

    // (4) no sentence in the source that names the subject imposes an obligation.
    const named = sentencesNaming(source, subject);
    if (!named.length) return f; // subject not discussed in the source — cannot prove fabrication here
    if (named.some((s) => OBLIGATION_MARKER.test(s) || SITE_VISIT_MANDATORY_ATTENDANCE_RE.test(s))) return f;

    // Strip the fabricated qualifier, keep the substance the lens actually reported (dates, places, clause refs —
    // all of it real and useful), then state the correction. SUBSTANCE LEADS: the customer needs the site visit
    // details first and the provenance note second, not a correction notice with the facts buried behind it.
    // PREDICATIVE FORM FIRST. The strip below assumes the qualifier is ATTRIBUTIVE ("mandatory site visit"); when it
    // is the predicate complement ("Separate registration is mandatory."), deleting the word leaves a dangling copula
    // and an orphan period — "Separate registration is ." — published to the customer. There is nothing to salvage in
    // such a sentence: its entire assertion IS the fabricated force, and the correction sentence below states the
    // truth in its place. So drop the whole sentence rather than mutilate it. Sentences making some OTHER point are
    // untouched, which is why this is a per-sentence filter and not a whole-text bail.
    const predicative = new RegExp(`\\b(?:is|are|was|were|will\\s+be|shall\\s+be)\\s+${forceWord}\\b`, "i");
    const stripped = before
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !predicative.test(s))
      .join(" ")
      .replace(new RegExp(`\\b(?:a|an|the)\\s+${forceWord}\\b`, "gi"), "the")
      .replace(new RegExp(`\\b${forceWord}\\s*:?\\s*`, "gi"), "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,:—–-]+/, "")
      // A label prefix repeating the subject ("site visit: Site visit will be held…") is left behind by the strip
      // and reads as a stutter on the page.
      .replace(new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:—–-]\\s*`, "i"), "")
      .trim();
    const head = stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : "";

    // The proof quote: prefer the finding's OWN grounding excerpt when it names the subject — that is the sentence
    // the lens actually read — else the most informative sentence naming it. Picking named[0] blindly quoted
    // "52.237-1 Site Visit.", a row from the incorporated-by-reference table, which proves nothing to a reader.
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const excerptNames = excerpt && sentencesNaming(excerpt, subject).length > 0;
    const best = excerptNames ? norm(excerpt) : norm([...named].sort((x, y) => y.length - x.length)[0]);
    // Suppress the quote when the head already carries it — otherwise the correction spends its budget saying the
    // same thing twice and the head's genuinely additional detail (clause refs, dates) is what falls off the end.
    // Compared by OPENING WORDS, not by a raw character window: a 60-char prefix compare called two sentences
    // different because the lens wrote "at the Valley Resident Office" where the source wrote "at US Army Corps of
    // Engineers-Valley Resident Office", so the quote was kept and the FAR clause reference was pushed past the cut.
    const headNorm = norm(head).toLowerCase();
    const opening = norm(best).toLowerCase().split(" ").slice(0, 6).join(" ");
    const redundant = opening.length > 0 && headNorm.includes(opening);
    const proof = redundant ? "" : ` What the source says is: "${best.slice(0, 140)}"`;

    // ORDER IS A BUDGET DECISION, not a style one. Substance used to lead, which read better but put the correction
    // and its proof quote LAST — and on the live specimen the whole quote fell past the 400-character render cut, so
    // the customer was told a claim had been corrected and shown no evidence for it. Under a hard budget the two
    // things that must survive are the correction and the source quote that lets the reader check it; the lens's
    // restatement of the details is the expendable part, and much of it is inside the quote anyway. The subject is
    // named up front so the sentence has an antecedent when it leads.
    // The subject now sits mid-sentence, so a sentence-initial capital carried over from the finding reads as a
    // typo ("this Separate registration"). Lower only a leading capital followed by lowercase — an all-caps token
    // is an acronym and keeps its case.
    const subjectInline = /^[A-Z][a-z]/.test(subject) ? subject.charAt(0).toLowerCase() + subject.slice(1) : subject;
    const after = fitToRender(
      `${FORCE_CORRECTED_PREFIX}the source does not state that this ${subjectInline} is ${forceWord.toLowerCase()}: ` +
      `the word appears nowhere in it, and no sentence naming it imposes attendance or eligibility consequences.` +
      `${proof}${head ? ` ${head.replace(/\s*$/, "").replace(/([^.!?])$/, "$1.")}` : ""}`,
    );

    corrected.push({ id: f.id ?? "(unidentified)", force: forceWord, subject, before, after });
    return { ...f, requirement: after };
  });

  return { findings: out, corrected };
}

/** Exported for probes only — so a probe measures the SHIPPED predicates rather than a copy that can drift. */
export const FORCE_GROUNDING_INTERNALS_FOR_TEST = { FORCE_QUALIFIER, OBLIGATION_MARKER, qualifiedSubject, sentencesNaming };
