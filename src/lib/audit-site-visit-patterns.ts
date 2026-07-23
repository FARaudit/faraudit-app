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
export const SITE_VISIT_MANDATORY_ATTENDANCE_RE = /\bmandatory\b[^.\n]{0,40}\b(?:site[\s-]?visit|attend|walk|tour|conference|job[\s-]?walk)\b|\b(?:site[\s-]?visit|walk[\s-]?through|job[\s-]?walk|tour|attendance|conference)\b[^.\n]{0,40}\b(?:is|are|will\s+be|shall\s+be)\s+mandatory\b|\battendance\s+(?:is\s+)?(?:required|mandatory|compulsory|a\s+(?:prerequisite|precondition|condition))\b|\b(?:must|shall|are?\s+required\s+to)\s+attend\b|\bfailure\s+to\s+attend\b[^.\n]{0,70}\b(?:ineligibl|disqualif|not\s+be\s+considered|bar(?:s|red)|preclud|reject)|\bonly\s+(?:offerors?|firms?|contractors?|bidders?|those)\s+(?:who|that)\s+(?:attend|attended|participate)[^.\n]{0,70}\b(?:eligible|may\s+(?:bid|submit|propose)|be\s+considered|for\s+award)\b/i;

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
