// Shared site-visit pattern constants (card #453/#454). The conditional-concluded promotion is a two-file
// contract: the notice-body EMITTER (audit-orchestrator.ts) frames a finding as concluded, and the B3-severity
// GUARD (audit-decide.ts) recognizes that frame to PROMOTE it. Both sides MUST test the SAME regex — a drift
// between two copies would silently break the arc (the emitter emits a frame the guard no longer recognizes →
// the finding is suppressed to human-review instead of promoted). So the contract regex lives here, imported by
// both, never duplicated.

// A UCF/notice site-visit / tour / job-walk / pre-proposal-conference mention (CONTENT match).
export const SITE_VISIT_RE = /\bsite[\s-]?(?:visit|tour|inspection)\b|\bjob[\s-]?walk\b|\bpre[\s-]?(?:proposal|bid)\s+(?:conference|meeting)\b|\bwalk[\s-]?(?:through|thru)\b/i;

// A SAM-body / UPDATE-line past-marker that the site visit already HELD / CONCLUDED / CLOSED. Contract regex:
// the emitter frames against it and the guard recognizes it. Any tuning happens HERE, once.
export const SITE_VISIT_CONCLUDED_RE = /\bsite[\s-]?(?:visit|tour|inspection)\b[^.\n]{0,80}\b(?:was\s+held|has\s+been\s+held|(?:was|is|has\s+been)\s+(?:concluded|closed|conducted)|already\s+(?:past|held|occurred|concluded)|(?:is|are)\s+now\s+(?:closed|concluded|past))\b|\b(?:held\s+and\s+(?:concluded|closed)|now\s+closed|has\s+concluded)\b[^.\n]{0,60}\bsite[\s-]?(?:visit|tour)\b/i;

// MANDATORY-ATTENDANCE-PRECONDITION language (repair-unit item B, card #703). A concluded/past site visit is an
// ATTRIBUTE, not a disqualifying bar, UNLESS the source itself grounds that attendance is a PRECONDITION of award /
// eligibility. This regex matches only that grounding — "mandatory site visit", "attendance is required/mandatory/a
// prerequisite", "must/shall attend", "failure to attend → ineligible/bars/disqualified", "only firms that attended
// … eligible". It deliberately does NOT match a neutral "site visit was held and concluded" (the FA813726R0033 shape),
// so a model-asserted "BARS AWARD" in a finding's REQUIREMENT can never confer bar-status without a grounded EXCERPT.
// SHARED contract regex — tested against the verbatim EXCERPT (grounded source text), never the model requirement.
// Branch set HARDENED by the item-B adversarial seat (card #703/#705): the original single-literal missed genuine
// mandatory phrasings the seat surfaced as FALSE-DEMOTIONS (a real precondition demoted to a harmless attribute) —
// "site visit is required", "attendance at the pre-proposal visit is a condition of eligibility", "offers from firms
// that did not attend will not be evaluated / disqualified", "only those offerors that participated … permitted to
// submit". The NEW branches (b2b/b3b/b5-widened/b6-widened) close those; the OPTIONAL/ENCOURAGED discrimination set
// ("recommended but not required", "encouraged to attend", "attendance is optional", "registration is required to
// obtain the drawings" [N6], "attendance at the optional site visit is not required" [N5]) stays UNMATCHED — the
// tight no-`;`/`.` windows + the (?!not) guard on b3b prevent gap-swallow over-match. Verified match/no-match, 8 miss
// + 7 must-not — EXTENDED 2026-07-31 with three NON-MANDATORY negation cases the original must-not set never
// contained (see MANDATORY_NEGATION_LOOKBEHIND below and `_cert-mandatory-negation.ts`); the "7 must-not" figure
// describes the pre-2026-07-31 battery only. Array-join form (sibling BOA_HOLDER_ONLY_EMIT_RE idiom) — tune the
// individual branches HERE, once.
/** NEGATION-PREFIX GUARD (flag AUDIT_MANDATORY_NEGATION_GUARD, default-OFF ⇒ empty string ⇒ the branch below is
 *  byte-identical to prod-today).
 *
 *  `\bmandatory\b` matches INSIDE "NON-MANDATORY": a hyphen is a non-word character, so the word boundary the
 *  branch relies on sits between "NON-" and "MANDATORY". A solicitation stating in terms that the site visit is
 *  NOT mandatory therefore reads as mandatory, permissively, at every consumer of this regex.
 *
 *  Found by the TIER-V design panel 2026-07-31 and reproduced independently three ways. This file's own header
 *  claims the pattern was "Verified match/no-match, 8 miss + 7 must-not" — the must-not set never contained a
 *  NON-MANDATORY case, so the battery certified its author's imagination rather than the recognizer.
 *
 *  Lookbehind rather than a negated character class: the offending token is a PREFIX on the word we already match,
 *  so the guard belongs where the prefix is, and every other branch keeps its exact shape.
 *
 *  SHARED, NOT COPIED — this file's own contract ("both sides MUST test the SAME regex … tune the branches HERE,
 *  once"). `ELIGIBILITY_BAR_RE` in audit-orchestrator carries the identical defect on its own mandatory arm and
 *  imports this constant rather than restating the lookbehind. The first version of this fix DID restate it, and
 *  the two copies had already drifted before either shipped — one carried a redundant third lookbehind the other
 *  lacked. That is the two-file drift this module exists to prevent. */
export const MANDATORY_NEGATION_LOOKBEHIND = "(?<!non[-\\s])(?<!not\\s)";
/** True when the negation guard should apply. `AUDIT_SITEVISIT_LITERAL_HONEST` IMPLIES it: that flag's honest
 *  literal decides whether to print the word "Mandatory" by testing this very regex, so arming it against an
 *  UNGUARDED pattern would make it assert "the notice states attendance conditions eligibility" on a notice that
 *  says the opposite — a NEW fabrication the legacy string never made. The two flags are therefore not
 *  independent, and the dependency is enforced here rather than left to whoever arms them. */
export const mandatoryNegationGuardOn = (): boolean =>
  process.env.AUDIT_MANDATORY_NEGATION_GUARD === "true" || process.env.AUDIT_SITEVISIT_LITERAL_HONEST === "true";
const NEG = mandatoryNegationGuardOn() ? MANDATORY_NEGATION_LOOKBEHIND : "";
export const SITE_VISIT_MANDATORY_ATTENDANCE_RE = new RegExp([
  // b1 — "mandatory" ADJ before an event noun ("mandatory site visit", "mandatory job walk")
  NEG + "\\bmandatory\\b[^.\\n]{0,40}\\b(?:site[\\s-]?visit|attend|walk|tour|conference|job[\\s-]?walk)\\b",
  // b2 — event noun … is/are/will-be/shall-be mandatory
  "\\b(?:site[\\s-]?visit|walk[\\s-]?through|job[\\s-]?walk|tour|attendance|conference)\\b[^.\\n]{0,40}\\b(?:is|are|will\\s+be|shall\\s+be)\\s+mandatory\\b",
  // b2b — event NOUN + "is/are required | a prerequisite/precondition/condition" (tight no-;/. window blocks N6)
  "\\b(?:site[\\s-]?visit|site[\\s-]?inspection|pre[\\s-]?(?:proposal|bid)\\s+(?:conference|meeting)|job[\\s-]?walk|walk[\\s-]?through)\\b[^.\\n;]{0,15}\\b(?:is|are)\\s+(?:required|compulsory|a\\s+(?:prerequisite|precondition|condition))\\b",
  // b3 — "attendance is required/mandatory/compulsory/a prerequisite…"
  "\\battendance\\s+(?:is\\s+)?(?:required|mandatory|compulsory|a\\s+(?:prerequisite|precondition|condition))\\b",
  // b3b — "attendance at/for/during <event NOUN> is <modal>" (gap sits BEFORE the noun; (?!not) blocks N5)
  "\\battendance\\s+(?:at|for|during)\\s+[^.\\n;]{0,30}?\\b(?:site[\\s-]?visit|site[\\s-]?inspection|conference|meeting|walk[\\s-]?through|job[\\s-]?walk|tour)\\b\\s+(?:is\\s+)?(?!not\\b)(?:required|mandatory|compulsory|a\\s+(?:prerequisite|precondition|condition))\\b",
  // b4 — "must/shall/are required to attend"
  "\\b(?:must|shall|are?\\s+required\\s+to)\\s+attend\\b",
  // b5 — failure/fail/did-not/non-attendance … ineligible|disqualified|not (considered|evaluated|eligible|accepted)|nonresponsive|barred|precluded|rejected
  "\\b(?:failure\\s+to\\s+attend|fail(?:s|ed|ing)?\\s+to\\s+attend|(?:do|does|did|will|who|that)\\s+not\\s+attend|non-?attendance)\\b[^.\\n]{0,70}\\b(?:ineligibl|disqualif|not\\s+be\\s+(?:considered|evaluated|eligible|accepted)|will\\s+not\\s+be\\s+(?:considered|evaluated|accepted)|nonresponsive|non-?responsive|bar(?:s|red)|preclud|reject)",
  // b6 — "only (those) offerors/firms who|that attended|participated … eligible|may bid/submit|permitted/allowed to bid|for award"
  "\\bonly\\s+(?:those\\s+)?(?:offerors?|firms?|contractors?|bidders?)?\\s*(?:who|that)\\s+(?:attend|attended|participat(?:e|ed|ing))[^.\\n]{0,70}\\b(?:eligible|may\\s+(?:bid|submit|propose)|(?:permitted|allowed|eligible)\\s+to\\s+(?:bid|submit|propose|compete)|be\\s+(?:considered|permitted|allowed)|for\\s+award)\\b",
].join("|"), "i");

// A BOA/IDIQ/BPA/GWAC/MAS/FSS vehicle HOLDER-ONLY ordering restriction — an ITO/order issued against a multiple-
// award vehicle is competable only by existing holders of that vehicle; a non-holder cannot bid at all. SHARED
// contract regex (card #459/#461 B2): the notice-body EMITTER (audit-orchestrator) surfaces the bar when no lens
// caught it, and the B2 keep-class (audit-decide, AUDIT_BOA_IDIQ_HOLDER_KEEP) preserves it as a conditional NHR
// ("confirm holder status") rather than allow-listing it away. Both sides test the SAME regex — tune it HERE only.
export const BOA_IDIQ_HOLDER_BAR_RE = /(?:\b(?:BOA|IDIQ|ID\/IQ|BPA|GWAC|MAS|FSS|MATOC|SATOC|IDC)\b|basic ordering agreement|blanket purchase agreement|multiple[- ]award schedule|federal supply schedule|indefinite[- ]delivery(?:\/indefinite[- ]quantity)?|governmentwide acquisition contract)[^.\n]{0,60}?(?:holder|awardee|on-?ramp|participant|restricted|limited\s+to|eligible|reserved|open\s+only)|(?:holder|awardee|participant)s?\s+of\s+(?:the\s+|an?\s+|this\s+|these\s+)?(?:BOA|IDIQ|ID\/IQ|BPA|GWAC|MAS|FSS|MATOC|SATOC|basic ordering agreement|blanket purchase agreement|multiple[- ]award schedule|federal supply schedule|contract|vehicle|schedule)|(?:only|restricted to|limited to|reserved for|open only to|must be an?|must hold an?)\s+[^.\n]{0,40}?(?:contract|schedule|vehicle|agreement|BOA|IDIQ|BPA|GWAC)\s+holders?/i;

// EMIT-tight sibling of BOA_IDIQ_HOLDER_BAR_RE. The broad regex above is correct for the KEEP-CLASS (it only PRESERVES
// a bar a lens already made — over-match is safe there). But the notice-body EMITTER CREATES a finding, so over-match
// fabricates false disqualifiers (Gate-2: "the BOA awardee will receive orders" is not a holder-only bar). This tight
// regex fires ONLY on an explicit HOLDER-ONLY EXCLUSION: "[vehicle] holders only", "only [vehicle] holders/primes may
// bid", "restricted/limited/reserved/open-only to [vehicle] holders", or "must hold [the vehicle]". Informational
// vehicle mentions (awardee/eligible/reserved-funding/participant-roster/duration limits) do NOT match.
export const BOA_HOLDER_ONLY_EMIT_RE = new RegExp([
  "(?:\\b(?:BOA|IDIQ|ID\\/IQ|BPA|GWAC|MAS|FSS|MATOC|SATOC)\\b|basic ordering agreement|blanket purchase agreement|multiple[- ]award schedule|federal supply schedule)[^.\\n]{0,25}?holders?\\s+only\\b", // "MAC BOA Holders ONLY"
  "\\bonly\\b[^.\\n]{0,35}?(?:\\b(?:BOA|IDIQ|ID\\/IQ|BPA|GWAC|MAS|FSS|MATOC|SATOC)\\b|basic ordering agreement|multiple[- ]award schedule|schedule|vehicle|contract)[^.\\n]{0,35}?(?:holders?|prime\\s+contractors?|primes?)[^.\\n]{0,45}?(?:may|are\\s+eligible|shall\\s+be\\s+eligible|to\\s+(?:propose|bid|submit|compete))", // "only MAC BOA prime contractors may submit"
  "\\b(?:restricted\\s+to|limited\\s+to|reserved\\s+(?:for|exclusively)|open\\s+only\\s+to|available\\s+only\\s+to)\\b[^.\\n]{0,50}?(?:\\b(?:BOA|IDIQ|ID\\/IQ|BPA|GWAC|MAS|FSS|MATOC|SATOC)\\b|basic ordering agreement|multiple[- ]award schedule|contract|schedule|vehicle|agreement)\\s+holders?\\b", // "restricted to BOA holders"
  "\\bmust\\s+(?:hold|be\\s+an?\\s+(?:existing\\s+)?holder\\s+of)\\b[^.\\n]{0,40}?(?:\\b(?:BOA|IDIQ|ID\\/IQ|BPA|GWAC|MAS|FSS|MATOC|SATOC)\\b|basic ordering agreement|multiple[- ]award schedule|vehicle|schedule|agreement)\\b", // "must hold the BOA"
].join("|"), "i");
