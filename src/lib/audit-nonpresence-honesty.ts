// REPORT-TRUTH #2 — the AFFIRMATIVE NON-PRESENCE claim class (flag AUDIT_NONPRESENCE_HONESTY, default OFF).
//
// THE DEFECT. Live run 95698f91 shipped three findings that told the customer something was NOT in the solicitation
// while it demonstrably was:
//   • "no set-aside designation is visible"  — 52.219-6 sits at raw line 1434
//   • "no escalation clause visible"         — 52.222-43 sits at raw line 1463
//   • "SCA wage rates … are unknown"         — WD 2015-5631 Rev 27 sits at raw line 2930, all 21 rates present
// The middle one is the expensive one: a bidder who believes there is no escalation clause pads four option years of
// SCA escalation that 52.222-43 reimburses, and loses a price-only competition on price.
//
// WHY THE OBVIOUS GATES DON'T WORK.
//   (a) Refute by citation match — only 1 of the 4 non-presence claims on that run names a clause in its own text, and
//       that one (#21, "FAR 52.237-1 (Site Visit) is incorporated … is not stated") cites the clause in SUPPORT of its
//       positive half. A cite-match refuter cannot distinguish a supporting citation from a denied one, so it would
//       have dropped the one harmless finding and kept all three expensive ones. Rejected by design, not oversight.
//   (b) Match the DENIED SUBJECT against the source — needs a vocabulary of things-to-look-for, which is the blocklist
//       treadmill the Brain permanently ruled out (card #515: SHAPE ALLOWLISTS ONLY). Federal text is also adversarial
//       to token matching — presence of a token is not presence of the operative meaning.
//   (c) REWRITE the assertion in place ("no escalation clause visible" → "…was located by this audit"). Built, run
//       against the real four claims, and REJECTED on the evidence: 3 of 4 rewrites came out wrong. Rewrites cascaded
//       (one shape's output re-matched the next shape, yielding "in the was located by this audit text"); replacing a
//       participle with a finite verb broke sentences that were participial ("with no escalation clause was located
//       by this audit in…"); and idiom defeated it ("Attendance is not stated as mandatory" → "is not located by this
//       audit as mandatory"). Editing inside a sentence cannot be made safe without parsing it, and parsing it is a
//       vocabulary problem again. The preview that caught this is scripts/audit-ai/_rt2-rescope-preview.ts.
//
// WHAT THIS DOES INSTEAD — structural, and it needs none of the above.
// Absence is the ONE claim that cannot be grounded in a verbatim excerpt: no span of a document exhibits the
// non-existence of a thing. Under Rule 64 every claim reaching a verdict must be grounded in a verbatim source
// excerpt, so an affirmative non-presence assertion is STRUCTURALLY ungroundable and must never ship as a bare
// statement about the DOCUMENT. The SENTENCE carrying it is WRAPPED — never edited inside — with what the engine can
// actually support, a statement about the audit:
//
//   "…the contractor bears the full delta with no escalation clause visible in the provided sections."
//     ⇒ "UNVERIFIED ABSENCE — …with no escalation clause visible in the provided sections (this audit did not locate
//        it; absence was not verified against the source — confirm directly in the solicitation)."
//
// The prefix stops a skimmer BEFORE the false clause; the suffix says what to do about it. Wrapping is grammatically
// safe for every input by construction, cannot cascade (detection is one pass, and the wrap adds no matchable shape),
// and never inspects what is being denied — so it carries no domain vocabulary and cannot grow one.
//
// DIRECTION OF FAILURE. A genuinely-true absence claim gains a caveat it does not strictly need (cosmetic). A false
// absence claim stops reading as fact (catastrophic → corrected). No input is made stronger by this pass, so
// over-matching the shape is safe and under-matching is the only real risk — which is why the perception-verb set is
// deliberately generous.

/** Perception verbs assert that a search of the document came back empty. These are the words that silently promote
 *  "the audit did not find X" into "X is not there" — the entire defect, in one word class. Not a domain vocabulary:
 *  none names a procurement concept, and the set is closed over English perception/attestation verbs. Generous on
 *  purpose (see DIRECTION OF FAILURE) — every one of these only ever fires INSIDE a negation shape below. */
const PERCEPTION = "visible|found|present|stated|provided|included|specified|identified|indicated|reproduced|attached|listed|shown|given|apparent|discernible|evident|mentioned|noted|disclosed";

/** SHAPE rules — the grammatical forms of an asserted absence. Detection only: nothing here edits inside a sentence,
 *  so the rules never need to agree with each other and cannot corrupt one another's output. The denied SUBJECT is
 *  bounded by clause punctuation so a match cannot run across a conjunction into an unrelated clause. */
//
// TWO GUARDS on the bare-`no` shape, both found by the falsification leg of the test, both closed sets of English
// function words — neither names a procurement concept, so neither is the start of a vocabulary:
//
//   (1) COMPARATIVE-QUANTIFIER `no`. In "no later than the date stated in block 8", `no` is a degree modifier, not a
//       negation of existence — and "no later than" is how every solicitation states its DEADLINE. Without this guard
//       the gate stamps UNVERIFIED ABSENCE on the most decision-critical finding class in the report, which is worse
//       than the defect it fixes.
//   (2) CLAUSE-CROSSING subject. A lazy subject span lets `no` bind to a perception verb an entire clause away — "at
//       no cost to the Government, materials shall be provided" reads as "no … provided". Barring auxiliaries and
//       modals from the span keeps the subject a NOUN PHRASE, which is the only position where `no` negates existence.
const NO_QUANTIFIER = "later|earlier|more|less|fewer|greater|sooner|longer|higher|lower|sooner";
const NOT_CLAUSAL = "(?:(?!\\b(?:shall|will|must|may|should|could|can|be|been|being|has|have|had)\\b)[^.;:,])";
const SHAPES: Array<{ name: string; re: RegExp }> = [
  { name: "copula-negated-perception", re: new RegExp(`\\b(?:is|are|was|were)\\s+not\\s+(?:${PERCEPTION})\\b`, "i") },
  { name: "no-subject-perception", re: new RegExp(`\\bno\\s+(?!(?:${NO_QUANTIFIER})\\b)${NOT_CLAUSAL}{2,70}?\\s+(?:(?:is|are|was|were)\\s+)?(?:${PERCEPTION})\\b`, "i") },
  { name: "unknown-state", re: /\b(?:is|are|remains?|remain)\s+(?:unknown|undetermined|unspecified|unavailable)\b/i },
  { name: "does-not-perceive", re: /\bdoes\s+not\s+(?:appear|contain|include|reference|cite|specify|state)\b/i },
  { name: "absent-from", re: /\b(?:absent|omitted|missing)\s+from\b/i },
  { name: "not-in-the-provided", re: /\bnot\s+[^.;:,]{0,40}?\bin\s+the\s+(?:provided|available|supplied|furnished)\b/i },
];

export const NONPRESENCE_PREFIX = "UNVERIFIED ABSENCE — ";
export const NONPRESENCE_SUFFIX = " (this audit did not locate it; absence was not verified against the source — confirm directly in the solicitation)";

export interface NonPresenceRewrite { id: string; shape: string; before: string; after: string; }

/** True when the text carries at least one affirmative non-presence assertion. Pure; no I/O; no model. */
export function hasNonPresenceClaim(text: string): boolean {
  return SHAPES.some((s) => s.re.test(text || ""));
}

/** Split on sentence terminators, KEEPING the terminator with its sentence, so a rewrite can reassemble the text
 *  byte-for-byte when nothing matches. Abbreviation-tolerant by design: an over-split only scopes the wrap more
 *  narrowly, it never drops or reorders text. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

/** Wrap every SENTENCE that carries an affirmative non-presence assertion. The sentence itself is never edited.
 *  Returns the text plus the shapes that fired; no match ⇒ the original string, unchanged. Pure; deterministic; $0. */
export function rescopeNonPresence(text: string): { text: string; shapes: string[] } {
  if (!text) return { text, shapes: [] };
  // Idempotent: a finding already wrapped by a previous pass is left exactly as it is.
  if (text.includes(NONPRESENCE_PREFIX)) return { text, shapes: [] };
  const shapes: string[] = [];
  const out = sentences(text).map((raw) => {
    const hit = SHAPES.filter((s) => s.re.test(raw));
    if (!hit.length) return raw;
    shapes.push(...hit.map((h) => h.name));
    // Keep the sentence's own trailing terminator OUTSIDE the suffix so the result reads as one sentence.
    // [\s\S] rather than . with the dotAll flag — the build targets pre-es2018, where `s` is a compile error.
    const m = /^([\s\S]*?)([.!?]?)(\s*)$/.exec(raw)!;
    return `${NONPRESENCE_PREFIX}${m[1]}${NONPRESENCE_SUFFIX}${m[2] || "."}${m[3]}`;
  }).join(" ");
  return shapes.length ? { text: out, shapes: [...new Set(shapes)] } : { text, shapes: [] };
}

/** Apply the gate across a finding set. Rewrites `requirement` — the sentence the customer reads as the claim — and
 *  leaves `excerpt` UNTOUCHED: the excerpt is verbatim source text and must never be edited (Rule 64; an edited
 *  excerpt would break every downstream grounding check that substring-matches it against the document).
 *
 *  Returns new finding objects; the input array is not mutated. Callers gate on the flag — this function does not read
 *  env, so it stays pure and testable in both states. */
export function applyNonPresenceHonesty<T extends { id?: string; requirement?: string }>(
  findings: T[],
): { findings: T[]; rewrites: NonPresenceRewrite[] } {
  const rewrites: NonPresenceRewrite[] = [];
  const out = findings.map((f) => {
    const before = f.requirement ?? "";
    const { text, shapes } = rescopeNonPresence(before);
    if (!shapes.length) return f;
    rewrites.push({ id: f.id ?? "(unidentified)", shape: shapes.join("+"), before, after: text });
    return { ...f, requirement: text };
  });
  return { findings: out, rewrites };
}
