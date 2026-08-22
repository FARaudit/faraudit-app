// GATE V2 — the completeness-gate rewrite (engine-architecture rebuild, ceo/ENGINE-ARCHITECTURE-RESEARCH-2026-07-07.md).
//
// THE PROBLEM IT FIXES: the V1 gate (audit-orchestrator.completenessOf → deriveVerdict:1108 `!coverageComplete`)
// forces INCOMPLETE whenever any binding obligation sentence isn't quoted by a ≥4-word VERBATIM n-gram — even on
// a document that was fully READ with dozens of grounded findings. That verbatim-coverage veto is the root of
// chronic false-INCOMPLETE (0728 ×2 INCOMPLETE despite 74 grounded findings). The research is unambiguous:
// grounding must be a graded SIGNAL, not a veto (finding #5); coverage must be IMPORTANCE-WEIGHTED so boilerplate
// can't veto while a real disqualifier still must be caught (finding #4); abstain ("INCOMPLETE") ONLY on genuine
// document-unreadability (finding #6), NOT because a sentence wasn't quoted.
//
// WHAT V2 DOES (pure, deterministic — the LLM findings are unchanged; this only re-reads the coverage signal):
//   • UNREADABLE (unread section / truncated / dropped-at-ingest) → still INCOMPLETE. The legitimate abstention.
//   • UNGROUNDED-BUT-READ boilerplate obligations → NO veto. They lower a coverage GRADE (surfaced), not the verdict.
//   • an UNGROUNDED obligation carrying genuine DISQUALIFICATION language → NEEDS_HUMAN_REVIEW (escalate to a human;
//     never a silent BID — the false-COMPLETE guardrail — and never a false-INCOMPLETE).
//
// This is a SIGNAL/VETO re-mapping only. It CANNOT invent coverage: an unread doc is still INCOMPLETE (that gate,
// deriveVerdict:1115 documentsComplete===false, is correct and untouched). FLAG-GATED at the call site
// (AUDIT_GATE_V2); with the flag off nothing here is reached and V1 is byte-identical.

import type { SectionAttestation } from "./audit-orchestrator";
import { isEnvOn } from "./env-flags";

export const GATE_V2_ENABLED = process.env.AUDIT_GATE_V2 === "true";

// Markers that completenessOf embeds in an attestation's `ungrounded[]` to mean "this section could not be fully
// READ" (as opposed to "read but an obligation wasn't quoted verbatim"). These are the GENUINE incompletes.
const UNREADABLE_MARKER = /^\[(truncated|compressor-dropped)\]/i;

// IMPORTANCE CLASSIFICATION — three-way, per Brain card-301 ruling #1: FAIL TOWARD DISQUALIFIER UNDER UNCERTAINTY.
// An ungrounded READ obligation is:
//   • "disqualifier" — carries explicit hard-bar language (eligibility bar / exclusion / mandatory award precondition);
//   • "boilerplate"  — clearly administrative/submission mechanics with NO bar (the ONLY class that may flow to a
//                      committal verdict);
//   • "ambiguous"    — neither of the above → TREATED AS DISQUALIFYING (→ NHR, never committal).
// WHY the ambiguous→disqualifier default (the AMENDMENT): the UNDER-tag path — a real bar mislabeled "boilerplate" —
// is the zero-contract-loss breach vector (R-14 proves this classifier class misfires). So an unquoted, unclassifiable
// obligation must escalate to human review, never silently pass as committal. Over-tagging costs an NHR (recoverable);
// under-tagging costs a lost contract (not). BOILERPLATE_RE is therefore kept TIGHT — only unambiguously safe language.
const DISQUALIFIER_RE = new RegExp([
  "will\\s+not\\s+be\\s+considered", "deemed\\s+(?:non-?responsive|ineligible)", "shall\\s+be\\s+(?:rejected|ineligible)",
  "is\\s+(?:required|mandatory)\\s+for\\s+award", "basis\\s+for\\s+(?:rejection|elimination)",
  "must\\s+(?:possess|hold|maintain)\\s+(?:a\\s+)?(?:active\\s+)?(?:clearance|certification|accreditation|CMMC|facility\\s+clearance)",
  "sole[-\\s]?source", "set[-\\s]?aside\\s+for", "eligibility\\s+(?:requirement|bar)",
  "failure\\s+to\\s+(?:comply|submit|provide).{0,40}(?:reject|ineligible|not\\s+be\\s+considered|disqualif)",
].join("|"), "i");
// CLEARLY-administrative boilerplate — the ONLY ungrounded class allowed to flow to a committal verdict. Kept TIGHT
// on purpose (see amendment above): submission mechanics, validity periods, format/copies, the standard 52.212-1
// provision. Anything an ungrounded obligation says that ISN'T unambiguously in here defaults to disqualifier.
const BOILERPLATE_RE = new RegExp([
  "\\b(?:shall|must|will|are\\s+to|should)\\s+(?:submit|provide|furnish|include|complete|sign|acknowledge|return|use|insert|fill|attach|list|identify|indicate)\\b",
  "valid\\s+for\\s+\\d+", "\\b(?:quotes?|offers?|proposals?)\\s+shall\\s+be\\s+valid\\b",
  "page\\s+limit", "\\bfont\\b", "margins?", "single-?sided", "double-?spaced", "number\\s+of\\s+copies", "electronic\\s+cop(?:y|ies)",
  "\\b52\\.212-1\\b", "in\\s+accordance\\s+with\\s+the\\s+(?:format|instructions)",
  "quotes?\\s+(?:shall|must|are\\s+to)\\s+be\\s+(?:submitted|received|emailed|sent|delivered)", "offers?\\s+(?:shall|must)\\s+be\\s+submitted",
].join("|"), "i");

// ARC #2 (flag AUDIT_PROTEST_CLAUSE_ALLOWLIST) — the FAR 52.233 PROTEST / DISPUTES family is procedural
// boilerplate for bid/no-bid: it imposes ZERO offeror eligibility or award precondition (protest-filing
// mechanics, the disputes procedure). It was falling to "ambiguous" → disqualifier → NHR — the exact false
// honest-fail the CBP /panel caught (FAR 52.233-2 "Service of Protest" text — "…served on the Contracting
// Officer… Government Accountability Office…" — mis-typed as a §M disqualifier). Allow-list it OUT.
//
// PRE-LIVE REVIEW HARDENING (blind skeptic): "safe-by-ordering" is INSUFFICIENT — DISQUALIFIER_RE is tight and
// misses most real-bar phrasings, and obligations are whole SENTENCES (obligationsOf splits only on .;\n), so a
// COMPOUND sentence ("must be a certified 8(a) participant and any protest may be filed with the GAO") would be
// laundered to boilerplate by the protest token. TWO guards close this: (1) PROTEST_DISPUTES_RE keeps ONLY
// unambiguous procedural phrases — bare "GAO" / "disputes clause" / bare "protest" DROPPED (too broad); (2) the
// flip additionally requires the sentence to carry NO eligibility-bar signal (BAR_SIGNAL_RE) — any bar-ish
// wording keeps it on the safe ambiguous→NHR pole (over-tag = recoverable NHR; under-tag = lost contract).
// Flag-OFF ⇒ not consulted ⇒ byte-identical.
const PROTEST_ALLOWLIST_ENABLED = process.env.AUDIT_PROTEST_CLAUSE_ALLOWLIST === "true";
const PROTEST_DISPUTES_RE = new RegExp([
  "\\b52\\.233-[1-4]\\b",                                  // Disputes / Service of Protest / Protest after Award / Applicable Law
  "service\\s+of\\s+protest", "served\\s+on\\s+the\\s+contracting\\s+officer",
  "government\\s+accountability\\s+office", "comptroller\\s+general",
  "agency[-\\s]?level\\s+protest", "contract\\s+disputes\\s+act",
].join("|"), "i");
// NEGATIVE GUARD — if the SAME sentence carries ANY eligibility/award-bar signal, never allow-list it (let it
// stay ambiguous→NHR). Tuned to catch the review's compound cases (8(a)/HUBZone/clearance/accreditation/
// accounting-system/registered) WITHOUT matching pure protest procedure ("must be SERVED on the CO" ≠ a bar).
const BAR_SIGNAL_RE = new RegExp([
  "\\bmust\\s+(?:possess|hold|maintain|be\\s+(?:a\\s+|an\\s+)?(?:certified|registered|accredited|licensed|qualified|eligible|approved|current|eligibility))",
  // SAM-registration bar cluster — HARDENED (card #459 corpus safety gate). The prior two tokens missed real FAR
  // 52.204-7 registration bars phrased "shall/required to be registered", spelled-out "System for Award Management",
  // "SAM.gov", or the bare "active/current registration" noun — those leaked as bar-signal-negative and would have
  // silently DEMOTED under the ambiguous-signal-demotion semantics (a real eligibility bar → contract loss). All are
  // unambiguous registration-bar vocabulary; adding them only routes a real bar toward the safe escalate pole.
  "\\b(?:must|shall|required\\s+to)\\s+be\\s+registered\\b", "\\bregistered\\s+in\\s+sam\\b",
  "\\bsystem\\s+for\\s+award\\s+management\\b", "\\bsam\\.gov\\b",
  "\\b(?:active|current|valid)\\s+(?:sam(?:\\.gov)?\\s+)?registration\\b", "\\bregistration\\s+in\\s+(?:sam\\b|the\\s+system\\s+for\\s+award)\\b",
  "\\beligib(?:le|ility)\\b", "\\bineligible\\b",
  "\\bset[\\s-]?aside\\b", "\\b8\\s?\\(?a\\)?\\b", "\\bhubzone\\b", "\\bsdvosb\\b", "\\bwosb\\b", "\\bedwosb\\b", "\\bservice[\\s-]?disabled\\b",
  "\\bclearance\\b", "\\bcertif(?:ied|ication)\\b", "\\baccredit", "\\blicens(?:e|ed|ing)\\b",
  "\\bsize\\s+standard\\b", "\\bpast\\s+performance\\b", "\\bbond(?:ing|ed)?\\b", "\\baccounting\\s+system\\b",
  // GATE-2 HARDENING (PR #202, foreign-tax member) — bar/access vocabulary the ORIGINAL guard missed. Two Gate-2 lenses
  // (contracts-attorney + adversarial-redteam) surfaced three collision classes against the 52.229-11 tax tokens:
  //  (a) ITAR/FOCI access + country-of-origin bars ("no foreign person shall have access…", FOCI, ITAR, TAA, Buy American);
  //  (b) a foreign-person TAX-REMITTANCE DUTY (FAR 52.229-11(b)/(e)(2)) — "foreign persons must remit the 2 percent tax…",
  //      "…subject to the section 5000C two-percent withholding" — a REAL at-award duty on a foreign offeror, NOT a no-op.
  // The duty verbs (remit / withhold / two-percent) + a bare "foreign person" are the CATEGORICAL closer for class (b):
  // they veto laundering for ANY foreign-person tax duty regardless of person/offeror/entity phrasing. They cost only the
  // benign "is not a foreign person" self-rep → the SAFE ambiguous→NHR pole; the PRIMARY FA8137 target (the
  // "…exemption…excise tax…" ELECTION, which carries none of these tokens) still launders correctly.
  "\\bforeign\\s+(?:national|ownership|owned|control|influence)\\b", "\\bfoci\\b", "\\bnispom\\b",
  "\\bitar\\b", "\\bexport[\\s-]?control(?:led|s)?\\b", "\\bshall\\s+have\\s+access\\b",
  "\\bcitizenship\\b", "\\bu\\.?s\\.?\\s+citizen", "\\btrade\\s+agreements?\\s+act\\b", "\\bbuy\\s+american\\b",
  "\\bforeign\\s+person", "\\bremit(?:s|ted|tance)?\\b", "\\bwithhold(?:ing|s|holds)?\\b", "\\btwo[\\s-]?percent\\b", "\\b2\\s*percent\\b",
  // GENERIC AWARD-BAR VERBS the guard was missing (adversarial-redteam, consistent since PR #202 v1) — these are real
  // award/responsiveness bars in ANY family member's compound sentence (e.g. a TAA "prohibited from award" cert
  // comma-joined with the 52.229-11 excise election). DISQUALIFIER_RE only had "will not be considered"/"deemed
  // non-responsive"; these cover the "…from award" / "non-responsive" / "will not be awarded" phrasings it missed.
  "\\bprohibited\\s+from\\b", "\\bbarred\\s+from\\b", "\\bnon-?responsive\\b", "\\bwill\\s+not\\s+be\\s+awarded\\b", "\\bcannot\\s+receive\\s+award\\b",
  // CATEGORICAL award-bar/exclusion verbs — closes the "guard misses a disqualification phrasing" class family-wide
  // (adversarial-redteam enumerated these one batch at a time; this covers the class, not one verb). All are unambiguous
  // award/responsiveness bars that never appear in a benign excise election or protest/debrief procedural sentence, so
  // adding them can only route a real-bar compound to the safe NHR pole — never re-block a genuine no-op.
  "\\bdisqualif(?:y|ied|ies|ication)\\b", "\\bexcluded\\s+from\\s+(?:award|consideration)\\b",
  "\\b(?:removed|eliminated|precluded)\\s+from\\s+(?:award|consideration|(?:the\\s+)?competition)\\b",
  "\\bnot\\s+be\\s+(?:selected|awarded)\\b", "\\bpassed\\s+over\\s+for\\s+award\\b", "\\bineligible\\s+for\\s+award\\b",
  // GATE-2 HARDENING (card #460 demotion, blind-skeptic) — award-removal consequence verbs the guard missed, so a real
  // §M "unacceptable/deficient → [consequence]" bar still ESCALATES independent of the "unacceptable" narrowing (a bar
  // whose rejection verb isn't here must never demote). Each is an unambiguous award/consideration exclusion.
  "\\bprecludes?\\s+(?:\\w+\\s+){0,3}?award\\b", "\\bnot\\s+(?:be\\s+)?further\\s+considered\\b",
  "\\bcannot\\s+be\\s+(?:selected|awarded|considered)\\b", "\\b(?:removed|eliminated|excluded)\\s+from\\s+(?:the\\s+)?competitive\\s+range\\b",
  "\\bnot\\s+eligible\\s+for\\s+award\\b",
  // GATE-2 HARDENING (D-1b clarification member, card #457) — the two most common bare §M rejection verbs the guard
  // missed. DISQUALIFIER_RE already catches "will not be considered"/"deemed non-responsive", but a compound sentence
  // whose ONLY bar token is "unacceptable" or "rejected" (e.g. "…its proposal will be deemed unacceptable") matched
  // CLARIFICATION_RIGHTS_RE and laundered to boilerplate.
  // BELT NARROWING (card #460 ruling #1) — "unacceptable" is CONSEQUENCE-FRAMED only (deemed/rated/found/is/are/be…
  // unacceptable), NOT the bare word, so the §M government RATING-SCALE description ("evaluated to determine whether
  // the proposal is acceptable or unacceptable, using the ratings…") no longer trips BAR_SIGNAL — that is evaluation
  // methodology, not a bidder bar. A real rejection ("its proposal will be deemed unacceptable") still matches.
  "\\b(?:deemed|rated|found|considered|assessed|be|is|are|remains?|otherwise)\\s+(?:technically\\s+)?unacceptable\\b", "\\breject(?:ed|ion|s|ing)?\\b",
].join("|"), "i");

// ARC #A (flag AUDIT_DEBRIEF_ALLOWLIST) — the FAR 15.503/15.505/15.506 DEBRIEFING + AWARD-NOTIFICATION family is
// procedural offeror-RIGHTS boilerplate: a debriefing is a post-decision ENTITLEMENT of the offeror (FAR 15.506),
// and award/exclusion notification is a Government procedure — neither imposes any eligibility or award precondition.
// FA813726R0033 /panel (audit be69ce16, 2026-07-11) was UNANIMOUS-adjacent (ex-KO/contracts-atty/proposal/source-
// selection + red-team AUTO-F): "Offerors desiring a debriefing must make their request IAW FAR 15.505 or 15.506"
// (FAR 52.215-1(f)(4) boilerplate) was mis-typed ambiguous → disqualifierUncovered → a FALSE NHR. Same class + same
// vector as the ARC #2 protest allow-list. SAME two guards apply: (1) DEBRIEF_NOTIFY_RE keeps ONLY the unambiguous
// offeror-rights phrases (a "debrief" is never a bar; the 15.50x sections are debriefing/notification procedure); (2)
// the flip additionally requires NO eligibility-bar signal (BAR_SIGNAL_RE) — a compound sentence that pairs a real
// bar with a debriefing mention stays on the safe ambiguous→NHR pole. Flag-OFF ⇒ not consulted ⇒ byte-identical.
const DEBRIEF_ALLOWLIST_ENABLED = process.env.AUDIT_DEBRIEF_ALLOWLIST === "true";
const DEBRIEF_NOTIFY_RE = new RegExp([
  "\\bdebrief(?:ing|ed|ings)?\\b",                                   // a debriefing is always a post-decision offeror RIGHT
  "\\b15\\.50[356]\\b",                                              // FAR 15.503 notifications · 15.505 preaward · 15.506 postaward debriefing
  "unsuccessful\\s+offerors?",                                       // the notification/debriefing context
  "notif(?:y|ication)\\s+(?:of\\s+)?(?:unsuccessful\\s+)?offerors?", // award/exclusion notification procedure
  "notification\\s+of\\s+(?:award|exclusion)",
].join("|"), "i");

// ARC D1 (Brain card 435, flag AUDIT_NOOP_REP_ALLOWLIST, default-OFF) — FAR 52.229-11/-12 "Tax on Certain Foreign
// Procurements": a §K self-REPRESENTATION that is a NO-OP for a domestic offeror. The 2% excise/withholding fires ONLY
// if the offeror checks "is a foreign person"; a domestic small business elects "no exemption / is not a foreign
// person" and nothing gates. FA8137 /panel (audit bd605b88) AUTO-F'd on the verbatim §K election "no exemption
// [Offeror must select one] from the excise tax." mis-typed disqualifierUncovered → a FALSE NHR (GATE_V2 cap that
// pre-empted the whole B-arc). Same offeror-rights/no-op family + the SAME two guards as protest/debrief.
//
// GATE-2 ROOT SCOPING (four contracts-attorney/red-team re-reviews): the member is now keyed ONLY to the offeror's own
// excise-tax EXEMPTION ELECTION — the single genuinely no-op 52.229-11 frame for a domestic offeror (the FA8137 target).
// The bare IDENTIFIER tokens that used to be here — clause number "52.229-11", the "tax on certain foreign procurements"
// title, "section 5000C"/"5000C", and bare "W-14"/"foreign person" — were ALL REMOVED. They match ANY sentence on the
// topic, including a REAL foreign-person tax DUTY (52.229-11(b)/(e)(2)): "foreign persons must remit the 2 percent tax…",
// "…subject to the section 5000C two-percent withholding", "if IRS Form W-14 is not submitted…exemptions will not be
// applied…under section 5000C". Those are bid-affecting duties on a foreign offeror, NOT no-ops, and a keyword BAR_SIGNAL_RE
// cannot enumerate every phrasing — so the identifier-token approach was structurally leaky (four residuals, four lenses).
// A real DUTY is never phrased as the offeror's "[full/partial/no] exemption … excise tax" self-election, so scoping to the
// election frame is the CATEGORICAL closer: only a genuine domestic exemption election launders; every duty/identifier
// sentence routes to the SAFE ambiguous→NHR pole (over-tag = recoverable; under-tag = lost contract). The BAR_SIGNAL_RE
// duty vocabulary (foreign person / remit / withhold / two-percent) is kept as defense-in-depth for the whole family.
const NOOP_REP_ALLOWLIST_ENABLED = process.env.AUDIT_NOOP_REP_ALLOWLIST === "true";
const FOREIGN_TAX_REP_RE = new RegExp([
  "(?:full|partial|no)\\s+exemption[^.]{0,40}excise\\s+tax",     // the FA8137 election sentence
  "excise\\s+tax[^.]{0,40}exemption",
].join("|"), "i");

// ARC D-1 (Brain card #445/#448, flag AUDIT_PRECEDENCE_ALLOWLIST, default-OFF) — DOCUMENT ORDER-OF-PRECEDENCE
// boilerplate (FAR 52.215-8 "Order of Precedence—Uniform Contract Format" / 52.214-29 / a MAC-BOA ITO-vs-BOA
// precedence clause). This is pure conflict-resolution METHODOLOGY between government instruments — it imposes
// ZERO offeror eligibility or award precondition, so it can never disqualify anyone. Convergence run 64b79916
// (FA813726R0033, /panel graded F, red-team-adjudicated) drove a FALSE NHR on the verbatim §L sentence "This ITO
// shall take precedence should there be any conflict between the Basic Ordering Agreement (BOA) and this ITO."
// mis-typed ambiguous → disqualifierUncovered → NHR cap (the exact same GATE_V2 seam as the §K protest/debrief/
// tax members). It belongs on the offeror-rights / no-op family as a DATA ENTRY — never a new arc branch.
//
// SCOPING (mirror the family discipline): DOC_PRECEDENCE_RE keeps ONLY unambiguous document-order-of-precedence
// frames — the clause numbers, the "order of precedence" term, and a precedence/govern/control verb TIED to a
// document conflict/inconsistency ("…take precedence should there be any conflict between…"). A bare "takes
// precedence" with no conflict/document frame is NOT matched. The SHARED negative guard (!BAR_SIGNAL_RE, applied
// once in importanceOf) keeps any COMPOUND sentence that pairs a real eligibility bar with precedence wording
// (e.g. "…the 8(a) set-aside eligibility requirements shall take precedence…") on the safe ambiguous→NHR pole.
// Flag-OFF ⇒ not consulted ⇒ byte-identical.
const PRECEDENCE_ALLOWLIST_ENABLED = process.env.AUDIT_PRECEDENCE_ALLOWLIST === "true";
const DOC_PRECEDENCE_RE = new RegExp([
  "\\border\\s+of\\s+precedence\\b",                                                     // 52.215-8 / 52.214-29 title + concept
  "\\b52\\.215-8\\b", "\\b52\\.214-29\\b",                                               // the FAR order-of-precedence clauses
  "(?:shall|will|to)\\s+take\\s+precedence[^.]{0,80}(?:conflict|inconsistenc|discrepanc|between)", // "…take precedence…conflict/between…"
  "(?:conflict|inconsistenc|discrepanc)[^.]{0,80}(?:shall|will)\\s+(?:take\\s+precedence|govern|control|prevail)", // "…conflict…shall govern/prevail"
].join("|"), "i");

// ARC D-1b (Brain card #457, flag AUDIT_CLARIFICATION_ALLOWLIST, default-OFF) — OFFEROR CLARIFICATION / ERROR-
// OMISSION-RIGHTS boilerplate. A §L instruction telling an offeror it MAY point out an error / omission / ambiguity /
// unsoundness in the solicitation (and how to raise a question to the KO) is a procedural offeror RIGHT — it imposes
// ZERO eligibility or award precondition on the bidder. Convergence run 66897b8a (D-1 held on precedence, but the §L
// family CYCLED) drove a FALSE GATE_V2 NHR on the verbatim §L sentence: "If an offeror believes that the requirements
// in these instructions contain an error, omission, or are otherwise unsound…" — mis-typed disqualifierUncovered,
// pre-empting the notice-body pole. A DATA ENTRY on the offeror-rights/no-op family, same discipline as the other
// members. CLARIFICATION_RIGHTS_RE keeps ONLY the "believes … error/omission/unsound" and "errors/omissions … brought
// to / submitted to the CO" clarification frames; the SHARED !BAR_SIGNAL_RE guard keeps any compound real bar
// (must-hold-clearance-and-report-errors) on the safe ambiguous→NHR pole. Flag-OFF ⇒ not consulted ⇒ byte-identical.
const CLARIFICATION_ALLOWLIST_ENABLED = process.env.AUDIT_CLARIFICATION_ALLOWLIST === "true";
const CLARIFICATION_RIGHTS_RE = new RegExp([
  "\\bbelieves?\\b[^.]{0,90}\\b(?:error|omission|ambiguit|unsound|discrepanc|conflict|defect)\\b",                 // "if an offeror believes … error/omission/unsound"
  "\\b(?:error|omission|ambiguit|discrepanc|defect)s?\\b[^.]{0,80}\\b(?:brought|reported|submitted|identified|raised|call(?:ed)?)\\b[^.]{0,40}\\b(?:contracting\\s+officer|attention|\\bCO\\b|\\bKO\\b)", // "errors … brought to the CO's attention"
  "\\bnotify\\s+the\\s+(?:contracting\\s+officer|\\bCO\\b|\\bKO\\b)[^.]{0,80}\\b(?:error|omission|ambiguit|discrepanc|unsound|defect)\\b",  // "notify the CO of any error/omission"
].join("|"), "i");

// The OFFEROR-RIGHTS / NO-OP-REPRESENTATION BOILERPLATE family (Brain card 435 D1) — procedural offeror rights or
// no-op self-representations that impose ZERO eligibility/award precondition. DATA-DRIVEN: add a member as an ENTRY
// here, NEVER a new arc branch. Each member carries its own enable flag; the SHARED negative guard (!BAR_SIGNAL_RE,
// applied once in importanceOf) keeps any COMPOUND sentence carrying a real bar signal on the safe ambiguous→NHR pole.
const NOOP_REP_FAMILY: Array<{ name: string; re: RegExp; enabled: boolean }> = [
  { name: "protest/disputes (52.233)", re: PROTEST_DISPUTES_RE, enabled: PROTEST_ALLOWLIST_ENABLED },
  { name: "debrief/notification (15.50x)", re: DEBRIEF_NOTIFY_RE, enabled: DEBRIEF_ALLOWLIST_ENABLED },
  { name: "foreign-procurement-tax rep (52.229-11)", re: FOREIGN_TAX_REP_RE, enabled: NOOP_REP_ALLOWLIST_ENABLED },
  { name: "document order-of-precedence (52.215-8 / ITO-BOA)", re: DOC_PRECEDENCE_RE, enabled: PRECEDENCE_ALLOWLIST_ENABLED },
  { name: "offeror clarification / error-omission rights (§L)", re: CLARIFICATION_RIGHTS_RE, enabled: CLARIFICATION_ALLOWLIST_ENABLED },
];

// ═══ LPTA EVAL-CONSEQUENCE RELEASE — OPTION 1: PURE-METHODOLOGY-ONLY (shape allowlist) ═══
// Brain card #507 fork, CEO-ratified. Flag AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS (default-OFF).
//
// THE PROBLEM (why v1/#225 was reverted): a generic LPTA "quotes failing to meet the technical criteria → not
// technically acceptable / will not be considered" §M sentence is award METHODOLOGY, not a bidder bar — but
// DISQUALIFIER_RE's "will not be considered" token over-tags it disqualifier → false NHR (FA303026Q0020). v1 tried
// to RELEASE it with a BLOCKLIST ("demote unless we recognize bar-vocabulary"). Two adversarial Gauntlet rounds proved
// a blocklist is a treadmill: an eligibility gate wearing the LPTA frame with UNENUMERATED vocabulary (DD254 facility
// security level, "U.S. nationals", Qualified Products List, a holders-only vehicle, sole-source) always slips through.
//
// OPTION 1 — invert to an ALLOWLIST OF SHAPE. A GENUINELY-BARE methodology sentence contains ONLY closed-vocabulary
// methodology words (the frame + the consequence + abstract references to "criteria/requirements"). A real bar wearing
// the frame ALWAYS injects a substantive out-of-vocabulary content word (BOA / DD254 / clearance / nationals / site /
// visit / products / sole-source …) — that word is the tell. So: release ONLY when the LPTA frame matches AND every
// content token is in METHODOLOGY_VOCAB. ANY out-of-vocab content word ⇒ REFUSE ⇒ the sentence keeps escalating.
// This CANNOT be defeated by an unenumerated bar (the bar's distinctive word is, by construction, not in the tiny
// methodology vocab) — the treadmill is closed. Cost is only conservative: an unusually-worded benign methodology
// sentence may fail the vocab check and stay NHR (over-tag = recoverable human review; under-tag = lost contract).
// Read at CALL time; flag-OFF ⇒ never consulted ⇒ importanceOf byte-identical.
const lptaConsequenceReleaseEnabled = () => process.env.AUDIT_LPTA_CONSEQUENCE_AMBIGUOUS === "true";
// The LPTA-consequence methodology FRAME (subject = quote/offer/proposal that FAILS TO MEET the TECHNICAL
// criteria/requirements). Necessary gate — but NOT sufficient on its own (that was v1's mistake); the vocab check below
// is what makes it safe.
const LPTA_CONSEQUENCE_RE = /\b(?:quote|quotation|offer|proposal)s?\b[^.]{0,90}?\b(?:fail(?:ing|s|ure)?(?:\s+to\s+meet)?|not\s+meet(?:ing)?|do(?:es)?\s+not\s+meet|that\s+(?:do\s+not|fail\s+to)\s+meet)\b[^.]{0,90}?\btechnical\b[^.]{0,40}?\b(?:criteri(?:a|on)|requirements?|factors?|standards?)\b/i;
// Closed methodology vocabulary. A BARE LPTA-consequence sentence draws ONLY from this set (plus 1-char tokens, which
// are never a substantive bar word). Deliberately EXCLUDES every noun that names a specific requirement/gate. Tuned so
// the genuine FA303026Q0020 driver + common LPTA-consequence phrasings pass, while any substantive gate word fails.
const METHODOLOGY_VOCAB = new Set<string>([
  // subject
  "quote","quotes","quotation","quotations","offer","offers","offeror","offerors","proposal","proposals","bid","bids","bidder","bidders","quoter","quoters",
  // fail/meet
  "fail","fails","failing","failure","failed","meet","meets","meeting","satisfy","satisfies","satisfying","satisfied","address","addresses","addressing","comply","complies","complying","conform","conforms","conforming",
  // criteria (abstract)
  "technical","technically","criterion","criteria","requirement","requirements","factor","factors","subfactor","subfactors","standard","standards","suitability","provision","provisions",
  // consequence
  "acceptable","unacceptable","acceptability","responsive","responsible","responsiveness","deem","deemed","deems","rate","rated","rating","ratings","found","find","consider","considered","considers","considering","consideration","evaluate","evaluated","evaluates","evaluation","reject","rejected","rejection","rejects","award","awarded","eliminate","eliminated","exclude","excluded","excluding","selection","selected","determine","determined","determination","competitive","range","further",
  // quantifiers / abstract references
  "one","more","all","any","each","both","either","neither","minimum","maximum","applicable","listed","enumerated","following","below","above","herein","stated","specified","identified","described","outlined","noted","set","forth","otherwise",
  // grammar / function words
  "not","no","will","shall","would","may","must","can","cannot","be","being","been","is","are","was","were","to","the","a","an","and","or","of","for","in","on","at","by","with","as","per","if","that","which","who","whose","their","its","it","this","these","those","such","from","than","then","when","whether","under","upon","into","full","fully","fail","up","meets",
]);
// SHAPE ALLOWLIST test: after the LPTA frame matches, EVERY content token (length ≥ 2) must be in METHODOLOGY_VOCAB.
// One out-of-vocab word ⇒ a substantive requirement is embedded ⇒ refuse the release.
function isBareLptaMethodology(ob: string): boolean {
  if (!LPTA_CONSEQUENCE_RE.test(ob)) return false;
  const tokens = ob.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 2);
  for (const t of tokens) if (!METHODOLOGY_VOCAB.has(t)) return false;
  return true;
}
export function isLptaConsequenceNonBar(ob: string): boolean {
  if (!isBareLptaMethodology(ob)) return false;
  if (hasBarSignal(ob)) return false; // defense-in-depth belt (redundant given the allowlist, but cheap and explicit)
  return true;
}

/** Three-way importance of an ungrounded obligation (Brain card-301 #1). Ambiguous defaults to disqualifier.
 *  Exported for the allow-list regression suite (audit-gate-v2-allowlist.test.ts) — the offeror-rights / no-op-rep
 *  family (protest + debriefing + foreign-procurement-tax + document order-of-precedence) must never silently narrow. */
// Brain step-4 ruling item 2 (card #682 named defect) — see the guard inside `importanceOf`. Default-OFF: this is a
// verdict-path change, so the arm is a CEO click, never Code's. Read at CALL time so it toggles per-invocation.
const boilerplateBarSignalGuardEnabled = () => process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD === "true";
// PARITY FIX — see the block at the NOOP-REP release inside `importanceOf`. Default-OFF for the same reason as
// its sibling directly above: a verdict-path change is armed by the CEO, not by Code. Read at CALL time.
const noopRepBarSignalParityEnabled = () => isEnvOn(process.env.AUDIT_NOOP_REP_BAR_SIGNAL_PARITY);
// B4 (Brain ruling, cards #690/#691) — see the banner block in `gateV2Outcome`. Verdict-inert, reason-only.
const bannerNoUnrankedBarClaimEnabled = () => process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM === "true";

export function importanceOf(ob: string): "disqualifier" | "boilerplate" | "ambiguous" {
  if (DISQUALIFIER_RE.test(ob)) {
    // OPTION 1 release (flag-gated + shape-allowlist guarded): a BARE LPTA eval-consequence sentence flows to
    // ambiguous → the proven bar-signal-negative demotion. Any embedded substantive word keeps it a disqualifier.
    if (!(lptaConsequenceReleaseEnabled() && isLptaConsequenceNonBar(ob))) return "disqualifier";
  }
  // ── NAMED DEFECT (Brain step-4 ruling item 2, promoted 2026-07-22; found by the red-team seat, card #682) ──
  // FAIL-TOWARD-DISQUALIFIER VIOLATION, live on the shipped engine and INDEPENDENT of veto retirement: this branch
  // returned "boilerplate" — a full release off the escalation path — even when the sentence carries an
  // eligibility-BAR signal. Its sibling one line below has carried the `!BAR_SIGNAL_RE` guard all along, so the
  // asymmetry was almost certainly an omission rather than a decision. Effect: a sentence matching BOTH a
  // boilerplate shape and a bar shape (e.g. a "shall submit <credential> with the quotation" §L instruction naming
  // a real credential) was released as boilerplate instead of routing to "ambiguous", where the ratified
  // ambiguous+bar-signal-POSITIVE semantics escalate it. Ambiguity must fail TOWARD the disqualifier; this failed
  // away from it.
  // FIX (flag `AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD`, default-OFF — verdict-path change, so arming is a CEO click):
  // the boilerplate release now requires the same no-bar-signal condition the NOOP-REP family already requires.
  // `hasBarSignal` (not raw BAR_SIGNAL_RE) is deliberate — it carries the #587b `bond paper` carve-out, so a §L
  // "submitted on SF-1444 or bond paper" format instruction cannot be re-classified as a bar by this fix.
  // DIRECTION: this ADDS escalation, so its risk is over-fire / crying-wolf, measured on the gold-set + corpus.
  if (BOILERPLATE_RE.test(ob)) {
    if (!(boilerplateBarSignalGuardEnabled() && hasBarSignal(ob))) return "boilerplate";
    return "ambiguous";   // bar-signal-positive: hand to the ambiguous pole, which escalates when armed
  }
  // OFFEROR-RIGHTS / NO-OP-REP family — allow-list OUT only when the sentence carries NO eligibility-bar signal.
  // (Preserves the prior protest/debrief behavior exactly: each member still gates on its own flag + RE + !BAR_SIGNAL.)
  //
  // ── PARITY FIX (flag `AUDIT_NOOP_REP_BAR_SIGNAL_PARITY`, default-OFF) ──────────────────────────────────────
  // This branch tests the RAW `BAR_SIGNAL_RE`; every sibling tests `hasBarSignal()`, which is that regex PLUS two
  // arms the raw one does not carry — `REGISTER_TOKENS_RE` (FCL · DD Form 254 · Part 145 · airworthiness
  // certificate; note `BAR_SIGNAL_RE`'s `certif(ied|ication)` does NOT match "certificate") and
  // `isPrivateIssuerCredentialBar`. Both are armed in production, as are all five NOOP-REP members, so at THIS
  // one branch they add no escalation at all. A "boilerplate" return is a FULL release — gradeCoverageV2 drops
  // it, so it never reaches `disqualifierUncovered` and never caps — which makes the failure direction FALSE-BID.
  // Measured 4/4 asymmetric at production parity: `scripts/audit-ai/_probe-gatev2-barsignal-asymmetry.ts`.
  //
  // The register half was documented at the REGISTER_TOKENS block as a known limitation, left because widening
  // this branch is a behaviour change. The private-issuer half was never documented: it was armed 2026-08-04 to
  // ADD escalation and here it added none. Reachability is NARROW — it needs a sentence with no DISQUALIFIER_RE
  // token, no BOILERPLATE_RE verb, a NOOP-REP frame, and a register/private-issuer bar carrying no BAR_SIGNAL_RE
  // token — so this is a correctness gap, not a fire.
  //
  // `hasBarSignal` also brings the #587b `bond paper` carve-out, which is the ONE direction where the raw regex
  // was stricter: "submitted on SF-1444 or bond paper" currently refuses the release on a paper-stock false hit.
  // Under the flag that release is permitted, matching the sibling branches. That is the carve-out working as
  // designed, and it is the only behaviour this fix LOOSENS — everything else it does is more escalation.
  //
  // DEFAULT-OFF because it is a verdict-path change: the arm is a CEO click, never Code's — the same posture as
  // AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD one branch above, which closed the mirror-image asymmetry.
  const barSignal = noopRepBarSignalParityEnabled() ? hasBarSignal(ob) : BAR_SIGNAL_RE.test(ob);
  if (!barSignal && NOOP_REP_FAMILY.some((m) => m.enabled && m.re.test(ob))) return "boilerplate";
  return "ambiguous";
}

/** Does the obligation carry ANY eligibility-bar signal (the shared !BAR_SIGNAL_RE guard, positive form)? Pure,
 *  flag-independent — exposes the existing guard for (a) the ARC-D-1c ambiguous-signal-demotion escalation semantics
 *  (Brain card #459: ambiguous+bar-signal-positive still ESCALATES the belt; ambiguous+bar-signal-negative demotes to
 *  the coverage-signal pole) and (b) the corpus safety proof that gates that build. No behavior change on its own. */
// TOKEN-COLLISION FIX — card #587b (flag AUDIT_BOND_PAPER_NONBAR, default-OFF). The BAR_SIGNAL_RE `\bbond\b` token (a
// surety/bid/performance BOND — a real pricing/eligibility bar) collides with "bond paper" (a PAPER STOCK), so the LBJ
// §L submission-format instruction "…submitted on SF-1444 or bond paper" (45f9bacd) reads as a bar-signal-POSITIVE →
// stays disqualifierUncovered → NHR, even after #587 demotes the insurance recital. Neutralize ONLY the "bond paper"
// paper-stock sense before the guard runs (strictly narrowing — it can only REMOVE a false surety hit, never add one;
// a real "bid bond"/"performance bond"/"payment bond" is untouched). Flag-OFF ⇒ byte-identical. Sibling of the Unit-5
// digit-collision + Unit-4 preprint-marker cases (feedback_token_substring_collision_doctrine).
const bondPaperNonBarEnabled = () => process.env.AUDIT_BOND_PAPER_NONBAR === "true";

// ── REGISTER TOKENS (Brain step-4 envelope item 2, flag `AUDIT_BAR_SIGNAL_REGISTER_TOKENS`, default-OFF) ─────
// Fire-side additions for the card-#680 registers, so the step-2 boilerplate guard has something to bite on:
//   · the 4b ruling's discriminator — a CLEARANCE fragment (`FCL`, `DD Form 254`, `facility clearance`, a bare
//     level paired with clearance vocabulary) that the existing tokens miss entirely;
//   · the SUBMIT-PROOF class — a named credential furnished WITH the offer (FAA Part 145 / repair station /
//     airworthiness certificate), which register R2 proved is invisible today (bucket = 0 in both flag states).
//
// ── NO-BLOCKLIST-DOCTRINE CHECK (required by the ruling; performed by ENUMERATING every consumer) ────────────
// Every consumer of BAR_SIGNAL_RE / hasBarSignal uses it in the NEGATIVE form, as a guard that BLOCKS a release
// or a demotion — verified by enumeration on 2026-07-22:
//   :286 `if (hasBarSignal(ob)) return false`            — blocks a non-bar classification
//   :318 `if (!(guard && hasBarSignal(ob))) return "boilerplate"` — a bar signal blocks the boilerplate release
//   :323 `if (!BAR_SIGNAL_RE.test(ob) && NOOP_REP…)`     — blocks the NOOP-REP release
//   :370 / :393 `return !hasBarSignal(stripped)`         — a surviving bar signal blocks the demotion
//   :446 `if (ledgerBroadAmbiguous && !hasBarSignal(ob))` — a bar signal blocks the broad-ambiguous demotion
// ⇒ ADDING a token can only block MORE releases/demotions ⇒ strictly MORE escalation ⇒ fail-toward-disqualifier.
// This is FIRE-SIDE SIGNAL EXPANSION, never release/demotion logic, so it does not touch the no-blocklist
// doctrine (which forbids a blocklist of bar vocabulary whose INCOMPLETENESS fails toward FIRE; here
// incompleteness fails toward NO-fire, the safe direction).
// KNOWN LIMITATION (documented, not silent): `:323` tests the raw `BAR_SIGNAL_RE`, not `hasBarSignal`, so the
// NOOP-REP release does not see these tokens. Left deliberately unchanged — widening it is a behaviour change to
// a ratified branch and is out of this item's scope.
// DIRECTION OF RISK: this ADDS escalation ⇒ over-fire / crying-wolf is the danger, measured on the corpus.
const registerTokensEnabled = () => process.env.AUDIT_BAR_SIGNAL_REGISTER_TOKENS === "true";
const REGISTER_TOKENS_RE = new RegExp([
  // 4b ruling — clearance-fragment discriminator
  "\\bFCL\\b",
  "\\bDD[\\s-]?(?:Form\\s*)?254\\b",
  "\\bfacility\\s+(?:security\\s+)?clearance\\b",
  "\\b(?:TOP\\s+SECRET|SECRET|CONFIDENTIAL)\\b[^.?!;]{0,40}\\bclearance\\b",
  "\\bclearance\\b[^.?!;]{0,40}\\b(?:TOP\\s+SECRET|SECRET|CONFIDENTIAL)\\b",
  // submit-proof class — a named credential furnished with the offer (register R2)
  "\\bPart\\s*145\\b", "\\brepair\\s+station\\s+certificate\\b", "\\bairworthiness\\s+certificate\\b",
].join("|"), "i");

// CREDENTIAL WITH A NAMED PRIVATE ISSUER (Brain ruling on card #800, flag AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR,
// default-OFF). The recognizer already carries credentials the bidder must HOLD, but every one of them is issued by
// a government or accreditation body (SBA, DCSA, a state board, a C3PAO). "…its status as an authorized OEM
// distributor for Caterpillar" is the SAME class with the issuer being a named private manufacturer — a missing
// ISSUER TYPE, not a new "status" class. Ruled so 2026-08-04; the taxonomy entry (OEM dealer · factory-authorized
// service center · franchised distributor) is Brain's.
//
// THE SHAPE, and why it survives paraphrase (no vocabulary blocklist — Brain's discriminator is the SUBJECT, not
// the noun). Three structural conditions, ALL required:
//   (1) BIDDER-BOUND — the bidder is the SUBJECT holding the credential ("its status as a …", "the offeror shall
//       be a …"), never a third party ("the contractor may procure FROM authorized distributors" — the distributor
//       is someone else, and the role must follow the binding CONTIGUOUSLY, so "shall be obtained from an
//       authorized dealer" cannot match on its "shall be");
//   (2) NAMED GRANTOR — a capitalized private issuer follows the role ("… distributor FOR Caterpillar"). A role
//       with no named grantor is ordinary supply-chain prose;
//   (3) TEMPORAL BINDING — "maintain" / "at time of award" / "during the period of performance" / "at all times".
//
// DIRECTION OF RISK, and why it is no longer symmetric. This ADDS escalation, so over-fire is the danger — but
// Rule 70 changed what over-fire COSTS: an escalated uncovered obligation now caps at BID_WITH_CAUTION with the
// item NAMED, it does not mute the verdict. A false escalate is a named line the bidder clears with one phone
// call; a false demote is a missed disqualifier, the FALSE-BID pole. Fail-toward-disqualifier decides it on
// structure. FREQUENCY STAYS OPEN: the fixture is 6 solicitations, so no over-fire RATE can honestly be measured
// here, and Brain ruled that waiting for one means waiting on customers we do not yet have. Flag-OFF ⇒ byte-identical.
const privateIssuerCredentialEnabled = () => process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR === "true";
// The credential a private issuer grants. ≤2 filler words carry "authorized OEM distributor" / "certified warranty
// service center" without opening the phrase to a whole clause.
const PRIVATE_CREDENTIAL_ROLE = "(?:authorized|factory[-\\s]?authorized|franchised|certified|approved)\\s+(?:[A-Za-z][A-Za-z-]*\\s+){0,2}(?:distributor|dealer|reseller|service\\s+cent(?:er|re)|repair\\s+(?:station|facility)|integrator|installer|partner)";
// The bidder holding it — possessive-status or an obligation verb, with the role CONTIGUOUS (condition 1).
// The determiner covers both orders the class is written in: "its status as an authorized distributor for X" and
// the possessive "maintain ITS authorized distributor status for X".
const BIDDER_BOUND_CREDENTIAL = "(?:\\b(?:its|their|his|her)\\s+status\\s+as\\s+|\\b(?:shall|must|will)\\s+(?:be|remain|become|maintain|hold)\\s+)(?:an?|its|their)?\\s*";
// An optional head-noun the role hangs off ("authorized distributor STATUS for X", "dealer AGREEMENT with X") —
// structural, not a vocabulary list: it only permits the grantor to sit one noun further right.
const CREDENTIAL_HEAD_NOUN = "(?:\\s+(?:status|standing|designation|authorization|certification|appointment|agreement|letter))?";
// A capitalized named grantor (condition 2) — "for Caterpillar", "of John Deere", "authorized by Cummins".
const NAMED_PRIVATE_GRANTOR = "\\s+(?:for|of|with|from|appointed\\s+by|authorized\\s+by)\\s+(?:the\\s+)?[A-Z][A-Za-z0-9&.'\\-]{2,}";
const PRIVATE_ISSUER_CREDENTIAL_RE = new RegExp(BIDDER_BOUND_CREDENTIAL + PRIVATE_CREDENTIAL_ROLE + CREDENTIAL_HEAD_NOUN + NAMED_PRIVATE_GRANTOR);
// Condition 3 — the duty is bound in time. Case-insensitive; the grantor above is deliberately case-SENSITIVE.
const CREDENTIAL_TEMPORAL_BINDING = /\bmaintain\b|\bduring\b[^.;]{0,40}\bperformance\b|\bat\b[^.;]{0,24}\baward\b|\bthroughout\b|\bfor\s+the\s+duration\b|\bat\s+all\s+times\b/i;
export function isPrivateIssuerCredentialBar(ob: string): boolean {
  return PRIVATE_ISSUER_CREDENTIAL_RE.test(ob) && CREDENTIAL_TEMPORAL_BINDING.test(ob);
}

export function hasBarSignal(ob: string): boolean {
  if (bondPaperNonBarEnabled()) ob = ob.replace(/\bbond(?:ed)?[\s-]+paper\b/gi, " ");   // "bond paper" (paper stock) ≠ a surety bond
  if (registerTokensEnabled() && REGISTER_TOKENS_RE.test(ob)) return true;
  if (privateIssuerCredentialEnabled() && isPrivateIssuerCredentialBar(ob)) return true;
  return BAR_SIGNAL_RE.test(ob);
}

// AMBIGUOUS-SIGNAL DEMOTION (Brain card #459/#460, flag AUDIT_AMBIGUOUS_SIGNAL_DEMOTION, default-OFF). The escalation
// semantics at gradeCoverageV2: disqualifier→escalate · ambiguous+bar-signal-POSITIVE→escalate (the belt: "uncertain
// about a bar" still fails toward disqualifier) · ambiguous+bar-signal-NEGATIVE→DEMOTE to the coverage-signal pole
// (ungroundedNonBarSignal — visible in the ledger, NEVER in disqualifierUncovered, NEVER silently dropped). Flag-OFF ⇒
// ambiguous ALWAYS escalates ⇒ byte-identical. Dissolves the §L/§M benign proposal-prep residuals (formatting, POC,
// page limits) that structurally over-escalated on a large negotiated §L, while every real bar keeps escalating.
// Read at CALL time (not module load) so the demotion toggles per-invocation, like the notice-body emitter flags.
const ambiguousSignalDemotionEnabled = () => process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION === "true";

// ZERO-ATTESTATION HONEST-FAIL (flag AUDIT_ZERO_ATTESTATION_INCOMPLETE, default-OFF; CEO ruling 2026-08-05,
// in-words: "cap it — an unattested package returns INCOMPLETE").
//
// A package whose completeness proof produced NO attestations was reported "Coverage complete (grade 100%)" with
// no cap. Measured, not reasoned: 2 of 111 banked records at production flag parity (both Part-12 commercial),
// and arming this flag moves 5 of 111 verdicts, every one NEEDS_HUMAN_REVIEW → INCOMPLETE (never toward a bid).
// Three conditions all hold in production — buildManifest returns [] (presence is header-regex; a commercial
// package has no UCF §B..§M headers), coreMissingFor returns [] (audit-orchestrator.ts:311 exits unconditionally
// for part12-commercial under AUDIT_COMMERCIAL_CLAUSE_APPLICABILITY), and gradeCoverageV2([]) scores 1.
//
// The V1 guard for exactly this — `coverageComplete = ... && required.length > 0` (audit-orchestrator.ts:2751) —
// is computed CORRECTLY and never read: deriveVerdict's only two reads of it (audit-decide.ts:3319, :3614) sit in
// the `else` of `if (inp.coverageV2)`, and coverageV2 is always present with GATE_V2 on. So this restores a guard
// the engine already had rather than inventing a new pole; it lives in gateV2Outcome so BOTH call sites (the
// shadow at :3316 and the main ladder) inherit it from one place and cannot drift apart.
//
// Rule 61: a failed dependency yields a VISIBLE failure state, never a plausible answer. "We examined nothing"
// is a failed dependency, and INCOMPLETE is what the engine already says for one.
const zeroAttestationIncompleteEnabled = () => isEnvOn(process.env.AUDIT_ZERO_ATTESTATION_INCOMPLETE);

// DEMOTION TAIL VETO (flag AUDIT_DEMOTION_TAIL_VETO, default-OFF). The card-#572/#576 severed-tail belt guards the
// benign-recital and performance-upkeep exits but NOT the ambiguous-signal demotion below it, which reads
// hasBarSignal on the obligation TEXT ALONE. obligationsOf splits on `[.;\n]`, so a bar living in the severed tail
// ("The contractor shall maintain the required insurance" ⟂ "and shall maintain bonding capacity of $5,000,000 with
// a Treasury-listed surety") is invisible at that exit and the whole obligation demotes — the last demotion exit is
// the only one with no tail defense. Applies the SAME recitalTailVeto to it: a POSITIVE tail bar refuses the
// demotion and the obligation escalates as before the demotion flag existed.
// SCOPE — deliberately narrow: only a verified-present recital whose tail POSITIVELY carries a bar refuses. An
// unlocatable recital keeps demoting, unlike the two exits above (which have a benign CLAIM to fail closed on;
// this exit has none, and failing closed on unlocatable would escalate the whole non-locatable population — a
// recall change far wider than the defect). Flag-OFF ⇒ branch skipped ⇒ byte-identical.
const demotionTailVetoEnabled = () => process.env.AUDIT_DEMOTION_TAIL_VETO === "true";

// GOVERNMENT-EVALUATION-FRAME refinement (card #460 ruling #2). A §M sentence whose SUBJECT is the government's
// evaluation methodology for cost/pricing DATA — "information/data other than certified cost or pricing data MAY BE
// REQUIRED to support price reasonableness / SHALL BE EVALUATED to support a determination" — trips BAR_SIGNAL only
// via the "certified … data" token (a TINA data-TYPE, not a bidder certification) and states what the GOVERNMENT does,
// not a bidder precondition. Demote it. GUARDED so it can NEVER demote a real bar: fires ONLY when (a) the sentence is
// government-eval-framed, (b) it references cost-or-pricing DATA, and (c) removing the certified-data phrase leaves NO
// OTHER bar signal — so a compound ("must hold a clearance; certified cost data shall be evaluated") still escalates.
// Bid-guarantee/bond and the offeror's own "shall submit certified cost or pricing data" duty are NOT eval-framed →
// they keep escalating (ruling #3: demoting real duties to hit a pre-declared outcome is REJECTED).
const GOVT_EVAL_FRAME_RE = /\b(?:shall|will|may|to)\s+be\s+evaluated\b|\bevaluated\s+to\s+(?:determine|support|establish)\b|\bto\s+support\s+(?:a\s+)?(?:determination|(?:price\s+)?reasonableness|realism|analysis)\b|\bmay\s+be\s+required\s+to\s+support\b|\bthe\s+government\s+(?:will|shall|may)\s+(?:evaluate|assess|determine|consider)\b/i;
const COST_PRICING_DATA_RE = /\b(?:certified\s+)?cost\s+(?:or|and)\s+pricing\s+data\b/i;
export function isGovtEvalMethodologyNonBar(ob: string): boolean {
  if (!GOVT_EVAL_FRAME_RE.test(ob) || !COST_PRICING_DATA_RE.test(ob)) return false;
  // Strip ONLY the TINA phrase (its own optional "certified" prefix is consumed with it) — NOT a standalone
  // "certified", which could be a real certification eligibility bar ("only offerors certified under the mentor-
  // protege program … cost or pricing data … the Government shall evaluate"). Global so multiple occurrences all clear.
  const stripped = ob.replace(new RegExp(COST_PRICING_DATA_RE.source, "gi"), " ");
  return !hasBarSignal(stripped); // a bar signal surviving the strip ⇒ a real bar ⇒ do NOT demote
}

// CONDITIONAL-FRAME TINA refinement (Brain card #468, flag AUDIT_CONDITIONAL_TINA_DEMOTION, default-OFF). Encodes the
// card #460 boundary EXPLICITLY for the recurring §L benign-string family: a certified-cost-or-pricing-DATA sentence that
// invokes the FAR 15.403-1 EXCEPTION framework ("…IAW 15.403-1…", "…none of the exceptions in FAR 15.403-1 apply, the
// offeror shall be required to submit…") is CONDITIONAL boilerplate — 15.403-1 is the *prohibition/exceptions* clause, so
// the "shall submit" duty fires only in the residual PCO-contingency path (no adequate price competition). Under adequate
// price competition it is NOT required (FAR 15.403-3(b)); it imposes ZERO pre-award bidder duty → demote. GUARDED exactly
// like the govt-eval predicate so it can NEVER demote a real bar: fires ONLY when (a) the sentence references cost-or-
// pricing DATA, (b) it cites FAR 15.403-1 (the exception clause — NOT 15.403-3 realism nor 15.403-4 requiring), and (c)
// removing the certified-data phrase leaves NO OTHER bar signal. The 6439ac27 driver ("403-1 apply, the offeror shall be
// required to submit certified cost or pricing data") demotes; an UNCONDITIONAL duty with no 15.403-1 citation ("the
// offeror shall be required to submit certified cost or pricing data prior to award") carries no 403-1 token → STAYS
// ESCALATED (card #460 ruling #3 is NOT reversed). Read at call time; flag-OFF ⇒ never consulted ⇒ byte-identical.
const conditionalTinaDemotionEnabled = () => process.env.AUDIT_CONDITIONAL_TINA_DEMOTION === "true";
// FAR 15.403-1 (prohibition on obtaining certified cost or pricing data / its exceptions) — the conditional-frame marker.
// Deliberately EXCLUDES 15.403-3 (price-analysis realism) and 15.403-4 (the REQUIRING clause) so a genuine "required per
// 15.403-4" duty never demotes. Matches "403-1" and "15.403-1"; the trailing (?!\d) stops "403-10"/"403-1x" false hits.
const TINA_EXCEPTION_CLAUSE_RE = /\b(?:15\.)?403-1(?!\d)\b/i;
export function isConditionalTinaBoilerplate(ob: string): boolean {
  if (!COST_PRICING_DATA_RE.test(ob) || !TINA_EXCEPTION_CLAUSE_RE.test(ob)) return false;
  // U-B (panel 2026-07-29, red-team-traced false-BID vector, probe S1-reproduced): the strip-then-hasBarSignal
  // belt is MEASURED blind to bid-guarantee/NMR/SPRS/50%-rule vocabulary, so a conditional-TINA sentence that
  // ALSO carries a co-sentenced kill-class duty ("…per 15.403-1; the offeror shall comply with the
  // nonmanufacturer rule at 52.219-33…") was demoted whole. With capture armed, any kill-class token in the
  // ORIGINAL sentence refuses the demotion (fail-toward-disqualifier). Flag-OFF ⇒ byte-identical.
  if (consequenceCaptureEnabled() && TINA_KILL_COSENTENCE_RE.test(ob)) return false;
  const stripped = ob.replace(new RegExp(COST_PRICING_DATA_RE.source, "gi"), " ");
  return !hasBarSignal(stripped); // a bar signal surviving the strip ⇒ a real compound bar ⇒ do NOT demote
}

// LEDGER DEMOTION TRUTH (Brain card #472, residual batch #3). The SINGLE predicate the orchestrator per-obligation
// ledger (completenessOf → covered_boilerplate_signal) consults to decide whether an ungrounded READ §L/§M obligation
// is a DEMOTED NON-BAR — reusing #1's exact classification predicates (isGovtEvalMethodologyNonBar +
// isConditionalTinaBoilerplate) so the ledger and gradeCoverageV2 can NEVER hold a parallel/divergent definition of
// "bar". Card #472 originally scoped this NARROWER than gradeCoverageV2's demotion (only the two TIGHT bar-guarded
// refinements — govt-eval + conditional-TINA — a deliberate "stricter belt"). Card #474 ruling #3 REVISED that on live
// evidence (see the broad-ambiguous path + flag below): the belt was too strict on a real large §L/§M. With
// AUDIT_LEDGER_BROAD_AMBIGUOUS on, the ledger's demotion MATCHES gradeCoverageV2 (one truth); with it off, the #472
// stricter belt is preserved. Each of the two tight predicates is self-guarding (strips its own token, then
// !hasBarSignal), so a real compound bar can never pass; the CALLER also hard-vetoes importanceOf==="disqualifier"
// upstream — the mixed-section invariant, laundering-behind-a-crowd defense. Gated like gradeCoverageV2's demotion (line
// 357): AMBIGUOUS_SIGNAL_DEMOTION governs govt-eval; conditional TINA requires BOTH it and CONDITIONAL_TINA_DEMOTION;
// the broad path requires AMBIGUOUS_SIGNAL_DEMOTION + LEDGER_BROAD_AMBIGUOUS. Flag-OFF on the gates ⇒ byte-identical.
// LEDGER BROAD-AMBIGUOUS DEMOTION (Brain card #474 ruling #3, flag AUDIT_LEDGER_BROAD_AMBIGUOUS, default-OFF). REVISES
// the #472 "stricter belt" scope on live evidence. The 8f56ecc4 investigation proved the belt is TOO strict on a real
// large §L/§M: the detector read §L (22,146 chars, high-conf) and §M (14,468, high-conf), but the ledger held BOTH
// false-missing because 40 §L + 20 §M ungrounded obligations are benign proposal-prep mechanics that classify
// "ambiguous"+bar-NEGATIVE ("Page size shall be 8", "Arial 12 points", "counted as two pages", "responsible offeror
// shall meet requirement spec", OPR terms) — NOT covered by the two tight refinements above. This path demotes the
// ambiguous+bar-negative class so the ledger's coverage.missing matches gradeCoverageV2's verdict-side demotion (line
// 357) — the two coverage systems finally agree (one truth). INVARIANT (proven on 8f56ecc4): after this demotion §M →
// 0 blockers (covered) and §L → held by EXACTLY 1 blocker, the bid-bond ("20% IAW FAR 28", bar-POSITIVE) — a real
// requirement that still escalates until grounded (ruling #1's grounding fast-follow). The caller vetoes
// importanceOf==="disqualifier" FIRST, and hasBarSignal keeps every real bar escalating, so nothing real is laundered.
// Flag-OFF ⇒ the #472 belt is byte-identical.
const ledgerBroadAmbiguousEnabled = () => process.env.AUDIT_LEDGER_BROAD_AMBIGUOUS === "true";
// UNIT 2.2 (cards #548/#549) — grounding-matcher variant tolerance + true-location attribution. Single flag for
// the unit; consumed by groundedBy (orchestrator), the gradeCoverageV2 locator wiring, and readable by tests.
export const groundingVariantToleranceEnabled = () => isEnvOn(process.env.AUDIT_GROUNDING_VARIANT_TOLERANCE); // R5-F5 — same tolerant parser as unit 2.1 (no per-flag drift within one card)
/** R2-F1 + R3-F2/F3 — ALL of the obligation's DISQUALIFIER-trigger substrings, each snapped FORWARD to
 *  the next word boundary (the failure-to alternative's regex ends mid-word on `reject`/`disqualif`
 *  prefixes — an unsnapped trigger is unlocatable in token space and the requirement would silently
 *  vanish). The relaxed grounding paths require EVERY trigger span to be covered by shared material —
 *  see passesSubstantiveBar (groundedBy). */
export function disqualifierTriggersOf(ob: string): string[] {
  const src = ob ?? "";
  const re = new RegExp(DISQUALIFIER_RE.source, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const cont = /^[A-Za-z0-9]+/.exec(src.slice(m.index + m[0].length))?.[0] ?? "";
    out.push(m[0] + cont);
    if (re.lastIndex === m.index) re.lastIndex++; // zero-width safety
  }
  return out;
}
export function isLedgerDemotableNonBar(ob: string): boolean {
  if (!ambiguousSignalDemotionEnabled()) return false;
  if (isGovtEvalMethodologyNonBar(ob)) return true;
  if (conditionalTinaDemotionEnabled() && isConditionalTinaBoilerplate(ob)) return true;
  if (ledgerBroadAmbiguousEnabled() && !hasBarSignal(ob)) return true; // ruling #3: ambiguous+bar-negative → demote (matches gradeCoverageV2)
  return false;
}

// ═══ BENIGN-IN-SOURCE RECITAL TRIAGE — card #572, flag AUDIT_BENIGN_RECITAL_COVERED (default-OFF) ═══
// THE PROBLEM: the coverage grader over-fires NHR on BENIGN in-source boilerplate recitals. A recital like the LBJ
// SOW "Maintain licensing/certification/accreditation and required insurance coverage during the entire performance
// period…" is a CONTINUING-performance obligation, NOT a pre-award eligibility gate — but it carries the licens/certif/
// accredit tokens so hasBarSignal is TRUE, which means the ratified AMBIGUOUS_SIGNAL_DEMOTION belt (bar-negative only)
// correctly REFUSES to demote it → it escalates to a FALSE NHR. This is the exact bar-signal-POSITIVE class the prior
// demotion cannot reach (autopsy corpus items 1 + 3).
//
// SCOPE AFTER THE GAUNTLET (2 code-review rounds): the card's original bar-signal-POSITIVE target (maintain-credential
// / SAM-registration recitals — autopsy items 1 + 3) was proven UNSAFE by shape (see the dropped-ARM-1 note below) and
// is DEFERRED to Brain. What ships here are the four bar-signal-NEGATIVE recital classes that DO separate cleanly:
// protest/GAO, reps-certs-completion, excise-tax-election, site-visit-logistics.
//
// THE FIX (grounding-precision ONLY — no committal threshold moves; deriveVerdict stays sole authority): a POSITIVE
// SHAPE ALLOWLIST (#507 doctrine — affirmatively define the benign frame, never a blocklist of NHR phrases) of four
// benign-recital classes, EACH position/context-checked, PLUS a load-bearing source-presence check (the recital's own
// text must be verifiably present in the assembled source), demotes a matched recital to an INFORMATIONAL
// benignCoveredRecital bucket (skipped, like boilerplate — never disqualifierUncovered). FAIL-TOWARD-DISQUALIFIER IS
// INTACT BY CONSTRUCTION: the block runs ONLY on the `ambiguous` class (AFTER importanceOf's disqualifier branch — a
// DISQUALIFIER_RE hit can never be claimed); three shared refusal guards (award-phase / rejection-consequence /
// restriction) plus a continuation-window tail veto (the obligationsOf `\n`/URL-dot split severs sentences — the
// severed tail is re-scanned for a bar) refuse anything ambiguous between benign and bar → falls through to the
// existing escalate path. Flag-OFF ⇒ the block short-circuits, the CoverageV2 field is omitted ⇒ byte-identical.
const benignRecitalCoveredEnabled = () => process.env.AUDIT_BENIGN_RECITAL_COVERED === "true";

// SHARED REFUSAL GUARDS — a hit on ANY of these over the obligation (or its severed tail) REFUSES the benign claim.
// These can only SHRINK the benign set (never define it) — the positive arm frame is what defines membership (#507).
// G-AWARD — award-phase possession framing is never a benign continuing recital (near-miss family: "…at (the) time of
// award", "…prior to award" possession, "certification required prior to award", "…through/until award"). (Gauntlet
// F5 — "at time of award" without "the" and "through/until award" were slipping the veto.)
const BENIGN_AWARD_PHASE_VETO_RE = /\b(?:at\s+(?:the\s+)?time\s+of\s+(?:award|offer)|prior\s+to\s+award|before\s+award|as\s+a\s+condition\s+of\s+award|upon\s+award|through\s+(?:contract\s+)?award|until\s+(?:contract\s+)?award)\b/i;
// G-CONSEQ — an explicit rejection / ineligibility / failure consequence rider ("…or be found nonresponsive", "…shall
// render the offer ineligible", "failure to X…"). Keys on "ineligible"/"not (be) eligible" (NOT bare "eligible", which
// appears in benign purpose tails) plus the categorical award-bar verbs. Note `\brender\b` requires an object (render +
// ineligible/unacceptable is already caught by those tokens; a bare "services rendered" is NOT a bar — Gauntlet nit).
const BENIGN_CONSEQUENCE_VETO_RE = /\bnon-?responsive\b|\bineligible\b|\bnot\s+(?:be\s+)?eligible\b|\breject(?:ed|ion|s|ing)?\b|\bwill\s+not\s+be\s+(?:considered|awarded)\b|\bdisqualif|\b(?:excluded|eliminated|removed|precluded)\s+from\b|\brender(?:s|ed|ing)?\s+the\b|\bdeemed\s+(?:technically\s+)?unacceptable\b|\bfailure\s+to\b/i;
// G-RESTRICT — access/attendance restriction framing ("Holders ONLY", "must attend", "restricted/limited to").
const BENIGN_RESTRICTION_VETO_RE = /\bonly\b|\bmust\s+attend\b|\brestricted\s+to\b|\blimited\s+to\b/i;
const benignGuardRefuses = (s: string): boolean =>
  BENIGN_AWARD_PHASE_VETO_RE.test(s) || BENIGN_CONSEQUENCE_VETO_RE.test(s) || BENIGN_RESTRICTION_VETO_RE.test(s);

// (ARM-1 "maintain-<credential>-during-performance" was DROPPED after the second Gauntlet round — the bar-signal-
// POSITIVE flagship class it targeted (LBJ item #1, SAM item #3) is SHAPE-INDISTINGUISHABLE from a real firm-inherent-
// credential bar and collides with CERTIFIED card #557. Proof: a coordinated "maintain the required insurance coverage,
// an active Secret facility clearance, and DCSA accreditation during the entire performance period" demotes by the exact
// same shape the LBJ recital relies on — the credential tokens that make LBJ read "benign" ARE the #557 bar tokens, so
// any residue/strip check that catches the clearance-list also refuses LBJ. The positive invariant is NOT in the
// sentence shape (reconstruction-treadmill signal). RELAYED for a Brain ruling: this class needs a non-shape
// discriminator — e.g. a bidder-profile cross-check (does the offeror actually HOLD the credential?) — not a regex.
// The four arms below are all bar-signal-NEGATIVE recital classes that DO separate cleanly by shape.)
// ARM-2 "protest/GAO recital" — the ratified PROTEST_DISPUTES_RE filing-mechanics frame PLUS the truncated copy-of-
// protest fragment the base RE misses (autopsy item 8b — "the copy of any protest must be received…").
const BENIGN_PROTEST_RECITAL_RE = new RegExp(PROTEST_DISPUTES_RE.source + "|\\bcop(?:y|ies)\\s+of\\s+(?:any\\s+|the\\s+)?protest\\b|\\bfiling\\s+a\\s+protest\\s+with\\b", "i");
// ARM-3 "reps-certs completion recital" — the reps/certs LIST as the object of a meet/complete/include enumeration;
// NEVER the substance of one specific representation (risk R5 — a covered-telecom FASCSA rep carries no list-reference).
const BENIGN_REPS_CERTS_RECITAL_RE = /\b(?:representations?\s+and\s+certifications?|annual\s+representations?)\b/i;
const BENIGN_REPS_CERTS_FRAME_RE = /\b(?:required\s+to\s+meet|shall\s+(?:complete|meet|provide\s+a\s+statement)|has\s+completed|to\s+include|completed\s+.{0,40}\belectronically)\b/i;
// ARM-4 "excise-tax election [select one]" — the ratified 52.229-11 election frame; the literal "[Offeror must select
// one]" bracket only counts when it CO-OCCURS with excise-tax context (Gauntlet F2 — a bare bracket alone matches §K
// reps of every kind, e.g. an 8(a) participation rep, which must keep escalating).
const BENIGN_EXCISE_ELECTION_RE = new RegExp(
  FOREIGN_TAX_REP_RE.source
  + "|excise\\s+tax[^.]{0,60}\\[\\s*offerors?\\s+must\\s+select\\s+one\\s*\\]"
  + "|\\[\\s*offerors?\\s+must\\s+select\\s+one\\s*\\][^.]{0,60}excise\\s+tax", "i");
// ARM-5 "site-visit logistics recital" — scheduling / RSVP mechanics ONLY. Attendance-conditioned-eligibility ("must
// attend … eligible to propose") NEVER matches this frame AND is vetoed by G-RESTRICT (`must attend`) — double belt.
const BENIGN_SITE_VISIT_LOGISTICS_RE = /\brsvp\b[^.]{0,90}\b(?:received|submitted|sent|email|forward)\b|\bsite\s+visit\b[^.]{0,90}\b(?:was\s+held|concluded|is\s+set\s+for|scheduled|sign[\s-]?in)\b/i;
// (ARM-6 SAM-registration maintenance was DROPPED after the Gauntlet: the FA3030 SAM recital enters NHR via the
// INDEPENDENT notice-body pole (noticeBodyBarUngrounded, audit-decide.ts) not the coverage grader, so demoting it here
// changed no verdict — all of the card #459 SAM-registration-hardening softening risk, zero verdict payoff. Relayed for
// Brain: if the notice-body pole is ever wired to this classifier, re-evaluate a SAM-maintenance arm with #459 in mind.)

// The benign arms as data entries (mirrors the NOOP_REP_FAMILY data-shape doctrine): [name, frame, optional extra
// predicate]. A member is claimed by the FIRST whose frame matches AND extra holds AND the RESIDUE belt passes.
const BENIGN_RECITAL_ARMS: Array<{ name: string; re: RegExp; extra?: (ob: string) => boolean }> = [
  { name: "protest-recital", re: BENIGN_PROTEST_RECITAL_RE },
  { name: "reps-certs-completion", re: BENIGN_REPS_CERTS_RECITAL_RE, extra: (ob) => BENIGN_REPS_CERTS_FRAME_RE.test(ob) },
  { name: "excise-tax-election", re: BENIGN_EXCISE_ELECTION_RE },
  { name: "site-visit-logistics", re: BENIGN_SITE_VISIT_LOGISTICS_RE },
];

/** POSITIVE benign-recital classifier (card #572). Returns the matching arm name, or null (⇒ existing fail-toward-
 *  disqualifier path). Pure, flag-independent — the flag gates the CALLER. Order: (1) a shared-guard hit on the
 *  obligation itself refuses BEFORE any arm; (2) the first arm whose frame+extra match; (3) the RATIFIED RESIDUE BELT —
 *  strip the matched benign span and require !hasBarSignal on the remainder, so a COMPOUND sentence pairing a benign
 *  clause with an unenumerated real bar ("…maintain insurance during performance AND shall hold a Secret clearance")
 *  refuses (Gauntlet F1; the same strip-then-!hasBarSignal pattern as isGovtEvalMethodologyNonBar). Exported for the
 *  asymmetric-proof suite. */
export function classifyBenignRecital(ob: string): string | null {
  if (benignGuardRefuses(ob)) return null;                                   // award-phase / consequence / restriction on the sentence itself
  for (const arm of BENIGN_RECITAL_ARMS) {
    const m = arm.re.exec(ob);
    if (!m) continue;
    if (arm.extra && !arm.extra(ob)) continue;
    const residue = ob.slice(0, m.index) + " " + ob.slice(m.index + m[0].length);
    if (hasBarSignal(residue)) return null;                                  // a co-resident bar outside the benign span ⇒ refuse the whole sentence
    return arm.name;
  }
  return null;
}

/** Continuation-window tail veto (card #572 fragmentation defense). obligationsOf splits on `[.;\n]` — a benign-looking
 *  fragment can be the head of a sentence whose SEVERED TAIL carries the bar. The tail is re-scanned with the FULL
 *  shared refusal predicate (award-phase / consequence / restriction) AND hasBarSignal — so the tail defense is at
 *  least as strong as the residue belt's (Gauntlet round 2: the guards alone are a weaker vocabulary than BAR_SIGNAL,
 *  so a severed "…and shall hold an active Secret facility clearance" tail slipped through). Recall trade: a benign
 *  tail carrying bar vocabulary refuses (the safe fail-toward-disqualifier direction). */
export function recitalTailVeto(continuation: string | undefined | null): boolean {
  return !!continuation && (benignGuardRefuses(continuation) || hasBarSignal(continuation));
}

const benignNorm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Load-bearing source-presence verifier (card #572). The recital must be VERIFIABLY PRESENT in the assembled source
 *  (normalized containment) with a ≥5-token substance floor (a trivial fragment can never be "verifiably present").
 *  The severed tails of EVERY occurrence (whitespace/case-tolerant match → next sentence terminator, ≤240 chars each)
 *  are concatenated and returned so the caller can tail-veto against ALL of them. FAIL-CLOSED (Gauntlet F3): if the
 *  recital normalizes-present but is NOT raw-locatable (OCR/caps drift the naive indexOf missed), return null ⇒ NO
 *  benign claim ⇒ fail toward disqualifier — the tail defense is never silently skipped, and a duplicated boilerplate
 *  recital can never hide a bar-carrying instance behind a benign twin. Pure; supplied to gradeCoverageV2. */
// LINE-WRAP CONTINUATION BRIDGE — card #587 (flag AUDIT_RECITAL_LINEWRAP_BRIDGE, default-OFF). The LBJ fire (45f9bacd)
// proved #576/#572/#575b are defeated by an OCR line-wrap: the recital "…required insurance coverage at a⏎minimum of
// $1M…during the entire performance⏎period with proof…" is severed at "…coverage at a", and the old continuation stops
// at the FIRST newline → the "during the entire performance period" frame (next lines) is never seen → escalate → NHR.
// FIX (positive shape, over-fire-guarded): BRIDGE a soft line-wrap — join a newline into the continuation ONLY when the
// next line's first content char is lowercase / digit / '$' (a wrapped clause continues), and STOP at a line that begins
// a NEW sentence (capital), a blank line (paragraph break), or an enumerator/bullet. This recovers the temporal frame
// WITHOUT bleeding into a genuinely-separate next-line obligation — critically, the pre-award "Proof of insurance is
// needed at time of award" that immediately follows the LBJ recital starts capitalized → STOP (never bridged, so its
// "at time of award" can never be laundered into the caveat frame). Flag-OFF ⇒ the old single-line behavior ⇒ byte-
// identical. Over-fire (bridging into a separate lowercase-led obligation) is the Gauntlet red-team focus.
const recitalLineWrapBridgeEnabled = () => process.env.AUDIT_RECITAL_LINEWRAP_BRIDGE === "true";

/** SOFT-WRAP PREDICATE — the ONE definition of "this newline continues the clause". Extracted from
 *  `recitalContinuation` (card #587) so the obligation splitter can ask the same question instead of
 *  carrying a second, silently-divergent copy of the rule. Byte-faithful to #587's inline form: same
 *  order (paragraph break -> enumerator -> lowercase/digit/$ -> capital), same 6-char enumerator window.
 *
 *  `s[nl]` is the newline. Returns the index to RESUME from on a soft wrap, or -1 when the newline ends
 *  the unit.
 *
 *  KNOWN LIMIT, carried deliberately: on a CRLF source `s[nl]` is CR, the whitespace scan stops at the
 *  following LF, and this returns -1 — a CRLF line ending reads as a paragraph break. That is #587's
 *  existing behaviour and AUDIT_RECITAL_LINEWRAP_BRIDGE is ARMED in production, so "fixing" it here would
 *  be an unflagged live change to the recital path. Measured 2026-08-21 across the 18 banked records
 *  carrying a fullSource: 83,002 newlines, ZERO CRLF — the limit is unreachable on ingested text. */
export function softWrapJoinAt(s: string, nl: number): number {
  let q = nl + 1;
  while (q < s.length && (s[q] === " " || s[q] === "\t" || s[q] === "\r")) q++;
  if (q >= s.length || s[q] === "\n") return -1;                          // blank line / EOF -> paragraph break
  if (/^(?:[-*•·]|\(?[a-z0-9]{1,3}[.)]|§|#)\s/i.test(s.slice(q, q + 6))) return -1;   // bullet / enumerator ("12.", "(a)", "-") -> new item
  if (/[a-z0-9$]/.test(s[q])) return q;                                   // soft wrap -> the clause continues
  return -1;                                                              // capital start -> new sentence
}

function recitalContinuation(after: string): string {
  if (!recitalLineWrapBridgeEnabled()) {                                    // flag-OFF — legacy: stop at the first newline
    const nl = after.indexOf("\n");
    const line = nl >= 0 ? after.slice(0, nl) : after;
    const end = line.search(/[.!?](?=\s|$)/);
    return (end >= 0 ? line.slice(0, end + 1) : line).trim();
  }
  let out = "";
  for (let p = 0; p < after.length; ) {
    const ch = after[p];
    if (ch === "\n" || ch === "\r") {
      const q = softWrapJoinAt(after, p);   // shared predicate — see softWrapJoinAt above
      if (q < 0) break;                     // paragraph break / enumerator / new sentence -> stop
      out += " "; p = q; continue;          // soft wrap: the next line continues the clause -> join
    }
    out += ch;
    if (/[.!?]/.test(ch) && (p + 1 >= after.length || /\s/.test(after[p + 1]))) break;   // real sentence terminator → stop
    p++;
  }
  return out.trim();
}

// ═══ U-B · RELEASE VISIBILITY + CONSEQUENCE CAPTURE (panel 2026-07-29 · probes scripts/audit-ai/_ub-probe.ts) ═══
// Two flags, default-OFF, byte-identical OFF:
//   AUDIT_RELEASE_LEDGER      — the silent boilerplate release is RECORDED (releasedBoilerplate bucket). Verdict-inert.
//   AUDIT_CONSEQUENCE_CAPTURE — a released-class duty whose SEVERED next-sentence window carries a rejection
//                               consequence ESCALATES instead of vanishing (obligationsOf splits on [.;\n], so
//                               "shall acknowledge all amendments." travels apart from "failure ... will not be
//                               considered." — measured 82/478 released items across the banked cohort); and the
//                               conditional-TINA demotion refuses a co-sentenced NMR/kill-class bar.
const releaseLedgerEnabled = () => process.env.AUDIT_RELEASE_LEDGER === "true";
const consequenceCaptureEnabled = () => process.env.AUDIT_CONSEQUENCE_CAPTURE === "true";
// Rejection-consequence SHAPE (allowlist, #507 doctrine). NARROWED per the U-B verification round (executed
// over-fires): `reject` not after "right to" (52.212-1(g) reserves-the-right boilerplate + performance-QA
// personnel rejection are standing government rights, not duty-specific kill consequences); `unacceptable`
// not inside the rating-scale enumeration "acceptable or unacceptable" and not the adjective "unacceptable
// risk" (pricing-adequacy prose — fired repeatedly on real 3726R0033 records). "rated Technically
// Unacceptable" remains a capture (V5b) — only the enumeration and the risk-adjective are excluded.
const CONSEQUENCE_TAIL_RE = /(?<!right\s+to\s+)\breject(?:ed|ion)?\b|(?<!acceptable\s+or\s+)\bunacceptable\b(?!\s+risk)|\bineligible\b|\bnon-?responsive\b|\bwill\s+not\s+be\s+considered\b|\bdisqualif\w*\b|\bno\s+further\s+consideration\b|\bremoved\s+from\s+consideration\b/i;
// Kill-class vocabulary hasBarSignal is MEASURED blind to (panel: bid guarantee / NMR / SPRS / 50%-rule) — the
// conditional-TINA strip-then-hasBarSignal belt cannot see these, so a co-sentenced bar was demoted (false-BID vector,
// reproduced by probe S1). Affirmative shape allowlist, never a blocklist.
// Verification-round F4/F5: the original class-level trailing \b DEADENED the "50%" spelling (\b after "%"
// requires a word char), so the guard's most common spelling never fired — and the bare token over-refused on
// benign progress-payment prose. The 50%-rule arm is now its own SCOPED shape: the percentage must co-occur
// (same [.;] segment, ≤80 chars) with cost/manufactur*/subcontract* — the limitations-on-subcontracting frame.
const TINA_KILL_TOKEN_RE = /\b(?:non-?manufacturer|52\.219-33|small\s+business\s+manufacturer|bid\s+guarantee|bid\s+bond|sprs)\b/i;
const TINA_50RULE_RE = /(?:50\s*(?:%|\bpercent\b)|\bfifty\s+percent\b)[^.;]{0,80}\b(?:cost|manufactur\w*|subcontract\w*)|\b(?:cost\s+of|manufactur\w*|subcontract\w*)\b[^.;]{0,80}(?:50\s*(?:%|\bpercent\b)|\bfifty\s+percent\b)/i;
const TINA_KILL_COSENTENCE_RE = { test: (ob: string): boolean => TINA_KILL_TOKEN_RE.test(ob) || TINA_50RULE_RE.test(ob) };
/** U-B consequence lookup — the NEXT-SENTENCE window after a duty, the OPPOSITE contract of verifyRecitalInSource's
 *  continuation (which deliberately STOPS at a sentence terminator; its purpose is a severed mid-sentence tail, and
 *  reading further would false-veto). Here the following sentence IS the target: a rejection consequence adjacent to a
 *  duty is the panel's sentence-pair unit. Whitespace/case-tolerant locate (same escaping as verifyRecitalInSource);
 *  bounded 300-char window; null when the obligation is not verbatim-locatable (⇒ capture declines, release stands —
 *  fail-open here is safe because the ledger still records it). ONE implementation shared by the orchestrator, the
 *  replay path, and the probes. */
export function consequenceTailsAfter(fullSource: string, ob: string): string[] {
  const src = fullSource ?? "";
  const needle = ob.trim();
  if (needle.length < 16) return [];
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const tails: string[] = [];
  try {
    // ALL occurrences (verification F2 — first-occurrence-only both missed the real §L pair behind an appendix
    // copy and captured a wrong-occurrence tail), bounded at 8. Each tail is CLAMPED at the next document
    // delimiter (verification F3 — a QASP's opening line is not the prior document's consequence) and at 300 chars.
    const re = new RegExp(pattern, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null && tails.length < 8) {
      let tail = src.slice(m.index + m[0].length, m.index + m[0].length + 450);
      const docCut = tail.indexOf("==== DOCUMENT:");
      if (docCut >= 0) tail = tail.slice(0, docCut);
      if (tail.trim()) tails.push(tail);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  } catch (err) {
    // Behaviour deliberately unchanged, and this one is NOT the Rule 61 class the
    // rest of this sweep was: the pattern is escaped before compiling, [] means no
    // consequence tail, capture declines and the release stands — which the
    // docblock above already reasons through and the ledger still records. Only
    // the silence changes: a regex that somehow failed to compile left no trace.
    console.error("[gate-v2] consequence tail scan failed", {
      needleLength: needle.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  return tails;
}
/** The sentence-pair KILL test (one place; probes + sweep share it). The examined unit is the first TWO
 *  SUBSTANTIVE sentences (≥25 chars) of the tail window — measured necessity (150c3ab3): a duty severed
 *  mid-sentence yields a rest-of-own-sentence fragment first ("…and virus checked prior to submission."),
 *  and URL/email dots produce degenerate micro-segments ("William." / "Shaver@va.gov."), so a strict
 *  single-first-sentence unit missed the genuine adjacent kill ("Quote submissions … shall result in the
 *  quote being rated Technically Unacceptable."). Anything further than two substantive sentences is
 *  adjacency noise (verification F1d) and never examined. EACH sentence gets the SAME release discipline
 *  the obligation side has: LPTA-methodology / government-eval-methodology sentences are not kill
 *  consequences (F1a), and the narrowed shape excludes the rating-scale / risk-adjective /
 *  reserves-the-right senses (F1b/F1c). */
export function isKillConsequenceTail(tail: string): boolean {
  const segs = tail.split(/(?<=[.!?])/).map((x) => x.trim()).filter((x) => x.length >= 25).slice(0, 2);
  for (const sent of segs) {
    if (!CONSEQUENCE_TAIL_RE.test(sent)) continue;
    if (isLptaConsequenceNonBar(sent) || isGovtEvalMethodologyNonBar(sent)) continue;
    return true;
  }
  return false;
}

export function verifyRecitalInSource(fullSource: string, ob: string): { present: boolean; continuation: string } | null {
  const src = fullSource ?? "";
  const nob = benignNorm(ob);
  if (nob.split(" ").filter(Boolean).length < 5) return null;               // substance floor
  if (!benignNorm(src).includes(nob)) return null;                          // must be verbatim-present (normalized)
  // Whitespace/case-tolerant locate over ALL raw occurrences (the escaped obligation is the needle — no injection).
  const pattern = ob.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  let continuation = "", found = false;
  try {
    const re = new RegExp(pattern, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      found = true;
      // The tail defense targets a sentence SEVERED mid-clause (obligationsOf split at a line-break or a URL-internal
      // dot). If the match ALREADY ends at a real sentence terminator, the sentence is complete — there is NO severed
      // tail, and reading further would bleed into the NEXT (possibly bar-carrying) sentence → a false veto. So scan a
      // continuation ONLY for a mid-sentence fragment (match does not end in .?!), up to the first real terminator
      // (terminator + whitespace/EOF, so a URL-internal "www.sam" dot doesn't cut the tail short). A tail on a NEW line
      // is a SEPARATE obligation (independently classified) → stop at the newline.
      if (!/[.!?]["')\]]?\s*$/.test(m[0])) {
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 300);   // card #587: window spans a wrap
        continuation += " " + recitalContinuation(after);
      }
      if (re.lastIndex === m.index) re.lastIndex++;                         // zero-width safety
    }
  } catch { found = false; }
  if (!found) return null;                                                  // normalized-present but raw-unlocatable ⇒ can't verify the tail ⇒ refuse
  return { present: true, continuation };
}

// ═══ CREDENTIAL-CONDITIONAL BAR — REASON-QUALITY SLICE — card #575b, flag AUDIT_CREDENTIAL_CONDITIONAL_REASON (OFF) ═══
// BRAIN REFRAME (binding, card #575): the flagship bar-signal-POSITIVE classes deferred by #572 —
// "maintain <credential> during performance" and "maintain an active SAM registration" — are CREDENTIAL-CONDITIONAL:
// benign IFF the offeror actually HOLDS the credential, which NO shape/source check can determine (the discriminator is
// a bidder-profile HOLD check, deferred to card #575 (a)+(c)+(d), platform-dependent). Pending it, their NHR routing is
// CORRECT fail-toward-disqualifier behavior, NOT a defect — the OPEN defect is REASON QUALITY only. This slice upgrades
// the NHR reason STRING from the opaque-disqualifier form to an actionable conditional ("this requires X — confirm your
// firm holds it before bidding"). VERDICT IS UNCHANGED (deriveVerdict sole authority; the gateV2Outcome CAP is byte-
// identical — only the reason prose differs). FABRICATION-INVARIANT COMPLIANT (mirror of the #574 defect class): the
// credential phrase is extracted VERBATIM from the obligation's own text (grounded, never invented); the phrasing is
// CONDITIONAL and makes ZERO claim about whether the bidder holds or lacks it. Flag-OFF ⇒ legacy reason byte-identical.
const credentialConditionalReasonEnabled = () => process.env.AUDIT_CREDENTIAL_CONDITIONAL_REASON === "true";
// A credential noun the "maintain … during performance" duty can govern (the firm-inherent-credential family, #557).
// Deliberately EXCLUDES "qualif*" (Gauntlet F3 — "maintain qualified personnel during performance" is a staffing duty,
// not a firm-inherent credential; the "confirm you hold it" framing would mislead).
const CREDENTIAL_TOKEN_RE = /\b(?:licens\w*|certificat\w*|certification|accreditat\w*|clearance|registration)\b/i;
// "maintain <objects> during/throughout performance" — capture the maintained objects VERBATIM (group 1). The class
// excludes ";" so the lazy capture can't swallow an intervening clause (Gauntlet F4).
const MAINTAIN_CREDENTIAL_RE = /\bmaintain\b([^.;]{0,180}?)\b(?:during\s+(?:the\s+)?(?:entire\s+)?(?:contract\s+|order\s+)?performance(?:\s+period)?|throughout\s+the\s+(?:life\s+of|period\s+of\s+performance|performance))\b/i;
// "maintain an active SAM registration" / "active registration in SAM" — SAM token MANDATORY (Gauntlet F1: an optional
// SAM token mislabeled ANY "maintain an active registration" — e.g. a state nursing-board registry — as SAM).
// U-A firm-fact noun set (U-A.1 verification F1) — a SUPERSET of CREDENTIAL_TOKEN_RE used ONLY by the
// firm_fact_bar possession arm in gateV2Outcome. Adds: permit / credential / qualification(s) (noun stem only —
// adjective "qualified" excluded by construction) / verb-form "registered" / rating (facility-clearance-adjacent,
// e.g. an interim DCSA facility rating) / authorization + Authority-to-Operate. CREDENTIAL_TOKEN_RE itself is
// NOT widened: it also gates the #575b cc prose branch, which is armed in prod.
const FIRM_FACT_NOUN_RE = new RegExp(
  CREDENTIAL_TOKEN_RE.source + String.raw`|\bpermit\w*\b|\bcredential\w*\b|\bqualificat\w*\b|\bregistered\b|\brating\b|\bauthori[sz]ation\w*\b|\bauthority\s+to\s+operate\b`,
  "i");
const SAM_ACTIVE_RE = /\bmaintain\s+an?\s+active\s+(?:sam(?:\.gov)?|system\s+for\s+award\s+management)\s+registration\b|\bactive\s+registration\s+in\s+(?:sam\b|the\s+system\s+for\s+award\s+management)\b/i;

// ── U-A.2 · A BOND TOKEN IS NOT A LONG-LEAD CREDENTIAL (flag AUDIT_UA_BOND_NOT_FIRM_FACT, default-OFF) ────────
// LONG_LEAD_CRED_RE carries a bare `bond(?:ing)?\b|surety|treasury-listed` group, and the U-A firm_fact_bar arm
// in gateV2Outcome fires on that regex ALONE (no noun/possession predicate required). Measured on the banked
// run-records: 10 of the 11 muted buckets are muted by a bond token and by nothing else. The token is wrong in
// BOTH directions at once, which is why neither direction can be called conservative:
//   TOO LOOSE — "submitted on SF-1444 or bond paper" (a PAPER STOCK) classifies as a scarce credential and mutes
//     the verdict (`_fire-45f9bacd`). This is the same collision #587b already fixed for BAR_SIGNAL_RE at
//     `bondPaperNonBarEnabled()`; the identical token in LONG_LEAD_CRED_RE was never carved out. One of two sites.
//   TOO TIGHT — `bond(?:ing)?\b` does not match the PLURAL: "performance bonds shall be furnished" and "payment
//     bonds and performance bonds are required" both score NEGATIVE, while the singular scores positive. A real
//     bonding bar written in the plural already evades the classifier entirely, so the status quo is not a
//     fail-closed posture that this change gives up — it is an arbitrary split on a trailing "s".
// WHAT RULE 70(c) ACTUALLY RESERVES THE MUTE FOR: "an unverifiable firm-fact a bar turns on" — a Top Secret
// facility clearance, CMMC, a QPL listing. The engine cannot know the firm's status and the credential takes
// months to obtain. A BID GUARANTEE is not that shape: it is furnished WITH the bid, it is priced into bid prep,
// and the bidder knows their own surety position. The engine's uncertainty about it is ordinary uncovered-
// obligation uncertainty — precisely the case Rule 70 says must CAP at BID_WITH_CAUTION naming the item, never
// mute. BONDING CAPACITY is the opposite: a threshold the firm must already carry, which a small sub can simply
// fail. That is a genuine firm fact and it KEEPS its mute here.
// SCOPE — U-A ONLY, exactly like the U-A.1 FIRM_FACT_NOUN_RE narrowing above. LONG_LEAD_CRED_RE itself is NOT
// edited: it also drives the #576 upkeep discriminator (Axis-2 negative) and the #590 self-clearable recognizer,
// both armed, and widening or narrowing it there would change served behaviour with no new flag.
// FAIL-CLOSED CONSTRUCTION — the strip runs, then `hasLongLeadCredential` is re-asked. A bond sitting alongside a
// real scarce credential ("a bid bond and a Top Secret facility clearance") still mutes on the clearance token.
const UA_BOND_TOKEN_RE = /\bbond(?:s|ing|ed)?\b|\bsurety\b|\btreasury[\s-]?listed\b/gi;
// The bonding shapes that ARE a firm fact: a capacity threshold, or bondability asserted of the firm itself.
const UA_BOND_FIRM_FACT_RE = /\bbond(?:ing)?\s+capacity\b|\bbondable\b|\bcapacity\s+to\s+bond\b|\baggregate\s+bonding\b|\bsurety\s+(?:capacity|limit)\b|\bbonding\s+(?:limit|program)\b/i;
const uaBondNotFirmFactEnabled = () => process.env.AUDIT_UA_BOND_NOT_FIRM_FACT === "true";
/** U-A-scoped long-lead test. Flag-OFF ⇒ the production predicate, unchanged (byte-identical). */
const uaHasLongLeadCredential = (ob: string): boolean => {
  if (!uaBondNotFirmFactEnabled()) return hasLongLeadCredential(ob);
  if (UA_BOND_FIRM_FACT_RE.test(ob)) return true;          // capacity/bondability → a real firm fact, mute holds
  return hasLongLeadCredential(ob.replace(UA_BOND_TOKEN_RE, " "));
};

/** Recognize a credential-conditional bar obligation and extract its credential phrase VERBATIM from the obligation
 *  (card #575b). Returns { credential } or null. Pure; the flag gates the CALLER (gateV2Outcome). The credential text is
 *  a grounded substring of `ob` (or a fixed grounded label for the SAM class) — it is NEVER a claim about the bidder. */
export function credentialConditionalRecital(ob: string): { credential: string } | null {
  // Prefer VERBATIM extraction from the maintain-during-performance duty (names the ACTUAL credential/registry — so a
  // non-SAM registration isn't mislabeled as SAM). The credential-token gate runs on the TRUNCATED, dangling-conjunction-
  // stripped string (Gauntlet F2) so the EMITTED phrase actually contains a credential noun — else we decline to legacy.
  const m = MAINTAIN_CREDENTIAL_RE.exec(ob);
  if (m) {
    let obj = (m[1] ?? "").trim().replace(/^(?:the|a|an|its|their|all|any|required)\s+/i, "").replace(/[,;:\s]+$/, "").trim();
    if (obj.length > 90) obj = obj.slice(0, 90).replace(/\s+\S*$/, "");                       // clean word-boundary truncation
    obj = obj.replace(/[,;:]?\s+(?:and(?:\/or)?|or|but|with|for|to|of|any|all)$/i, "").replace(/[,;:\s]+$/, "").trim(); // drop dangling trailing conjunction
    if (CREDENTIAL_TOKEN_RE.test(obj) && obj.length >= 3) return { credential: obj };
  }
  // SAM-active class (SAM token mandatory) — a fixed, grounded label for the registration the obligation names.
  if (SAM_ACTIVE_RE.test(ob)) return { credential: "an active System for Award Management (SAM) registration" };
  return null;
}

// ═══ ORDINARY-COURSE PERFORMANCE-UPKEEP → CAVEAT (not NHR) — card #576, flag AUDIT_PERFORMANCE_UPKEEP_CAVEAT (OFF) ═══
// BRAIN RULING (card #576, CEO customer-failure reframe): a "maintain <ORDINARY-COURSE credential> DURING performance"
// recital is a POST-AWARD performance obligation, NOT a pre-award eligibility bar — escalating it to NEEDS_HUMAN_REVIEW
// is a CUSTOMER FAILURE ("why did I pay you to tell me to review it myself"). It must stop driving NHR and instead attach
// as a prominent CAVEAT to a committal verdict. This RECALIBRATES fail-toward-disqualifier (does NOT abandon it): NHR
// stays reserved for pre-award gates, long-lead credentials, genuine ambiguity, and completeness failures.
//
// TWO-AXIS DISCRIMINATOR — BOTH axes must pass to demote; AMBIGUOUS ON EITHER → escalate (doctrine intact):
//   Axis 1 TEMPORAL — during/throughout-performance UPKEEP framing → demote-eligible. HOLD/POSSESS-at-award/at-offer/
//     prior-to-award → ESCALATE ALWAYS (a real pre-award gate). The temporal frame is checked over the obligation PLUS
//     its source continuation (the LBJ live fragment is line-wrap-severed BEFORE "…coverage during the performance
//     period" — Brain's production-shape acceptance binds us to demote THAT fragment, so the severed tail must be seen).
//   Axis 2 ORDINARINESS — an affirmative ordinary-course allowlist (#507: business licensing, insurance, SAM-registration
//     maintenance, generic quality/safety certs) → demote-eligible. A long-lead/scarce credential (facility clearance,
//     CMMC, FAA/airworthiness, QPL/QML, and the #574 grounded-mechanic taxonomy) → ESCALATE REGARDLESS of temporal frame.
const performanceUpkeepCaveatEnabled = () => process.env.AUDIT_PERFORMANCE_UPKEEP_CAVEAT === "true";
// Axis 1 — during/throughout-performance UPKEEP frame (post-award), and the maintain/keep verb.
const PERF_UPKEEP_TEMPORAL_RE = /\b(?:during|throughout)\s+(?:the\s+)?(?:entire\s+)?(?:contract\s+|order\s+|period\s+of\s+)?performance(?:\s+period)?\b|\bperiod\s+of\s+performance\b|\bthroughout\s+the\s+(?:life\s+of|term\s+of|duration\s+of)\b|\bfor\s+the\s+(?:entire\s+)?(?:duration|term|life)\s+of\s+the\s+(?:contract|order|performance)\b/i;
const UPKEEP_VERB_RE = /\b(?:maintain|keep|retain|have\s+and\s+(?:shall\s+)?maintain|hold\s+and\s+(?:shall\s+)?maintain|continue\s+to\s+(?:hold|maintain|keep))\b/i;
// Axis 1 NEGATIVE — pre-award possession framing ⇒ a real gate ⇒ escalate ALWAYS (checked over obligation + continuation).
const PREAWARD_POSSESSION_RE = /\b(?:at\s+(?:the\s+)?time\s+of\s+(?:award|offer|proposal\s+submission)|at\s+(?:the\s+)?(?:contract\s+)?award\b|prior\s+to\s+(?:award|contract\s+award|contract\s+start|commencement|the\s+start\s+of\s+performance|performance\s+start)|before\s+award|as\s+a\s+condition\s+of\s+award|as\s+of\s+(?:the\s+)?(?:date\s+of\s+)?award|upon\s+award|at\s+(?:the\s+)?time\s+of\s+submission|by\s+(?:the\s+)?(?:time\s+of\s+)?award|(?:shall|must|to)\s+(?:currently\s+)?(?:hold|possess)\b)\b/i;
// Axis 2 POSITIVE — ordinary-course credential allowlist (affirmative, #507). NOTE (Gauntlet F5): bare "active
// registration" was REMOVED (it matched scarce registries e.g. DEA); SAM registration is covered by its explicit tokens.
const ORDINARY_COURSE_CRED_RE = /\b(?:business\s+licens\w*|state\s+licens\w*|local\s+licens\w*|professional\s+licens\w*|licens\w*\s+requirements?|insurance|liability\s+(?:insurance|coverage)|workers'?\s+compensation|sam(?:\.gov)?\s+registration|registration\s+in\s+sam|system\s+for\s+award\s+management|iso\s?90{2}\d|iso\s?14001|osha)\b/i;
// Axis 2 NEGATIVE — long-lead / scarce credential ⇒ escalate REGARDLESS of temporal frame. Brain-listed + Gauntlet-F6
// additions (EAR/export-control, DEA, bonding/surety, OEM/brand authorization, NRC, AS9100/Nadcap). Defense-in-depth on
// top of the recitalTailVeto belt (which already catches BAR_SIGNAL-vocab bars in the severed tail).
const LONG_LEAD_CRED_RE = /\b(?:facility\s+(?:security\s+)?clearance|\bfcl\b|personnel\s+(?:security\s+)?clearance|security\s+clearance|top[\s-]?secret|\bts\/?sci\b|\bsecret\b\s+(?:clearance|facility)|cmmc|nist\s+sp?\s?800-171|\bfaa\b|part\s+145|airworthiness|type\s+certificat\w*|\bqpl\b|\bqml\b|qualified\s+products?\s+list|qualified\s+manufacturers?\s+list|\bfoci\b|\bitar\b|\bear\b|\bddtc\b|export\s+(?:administration|control|licens\w*)|dd[\s-]?254|nispom|\bdea\b|drug\s+enforcement|bond(?:ing)?\b|surety|treasury[\s-]?listed|authorized\s+(?:oem\s+)?(?:distributor|dealer|reseller)|\boem\b|nuclear\s+regulatory|\bnrc\b|as\s?9100|nadcap)\b/i;

/** Card #590 — the #576 Axis-2 scarce-credential + Axis-1 pre-award-possession predicates, exported for the
 *  SELF_CLEARABLE_PACKAGE recognizer (audit-decide). A long-lead/scarce credential or an at-award/possession frame
 *  anywhere in a bar means the package is NOT bidder-self-clearable. Pure, flag-independent. */
export const hasLongLeadCredential = (s: string): boolean => LONG_LEAD_CRED_RE.test(s);
export const hasPreAwardPossession = (s: string): boolean => PREAWARD_POSSESSION_RE.test(s);

/** Two-axis ordinary-course-performance-upkeep discriminator (card #576). Returns { credential } to DEMOTE (recital →
 *  caveat, not NHR), or null to ESCALATE. Pure. `continuation` = the source tail of a line-wrap-severed obligation
 *  (from verifyRecitalInSource), so the temporal frame + the long-lead/at-award negatives are seen even when the
 *  fragment was cut before them. AMBIGUOUS ON EITHER AXIS → null (escalate); the negatives are checked over BOTH the
 *  obligation and its continuation so a bar riding the severed tail can never be laundered. */
export function classifyPerformanceUpkeepRecital(ob: string, continuation?: string | null): { credential: string } | null {
  const full = `${ob} ${continuation ?? ""}`;
  if (PREAWARD_POSSESSION_RE.test(full)) return null;          // Axis 1 NEG: pre-award possession → escalate always
  if (LONG_LEAD_CRED_RE.test(full)) return null;               // Axis 2 NEG: long-lead/scarce → escalate regardless
  if (!UPKEEP_VERB_RE.test(ob)) return null;                   // the maintain/keep verb must be in the obligation itself
  if (!PERF_UPKEEP_TEMPORAL_RE.test(full)) return null;        // Axis 1 POS: during-performance frame (in ob or its tail)
  if (!ORDINARY_COURSE_CRED_RE.test(ob)) return null;          // Axis 2 POS: an ordinary-course credential in the obligation
  // credential = the maintained objects, extracted VERBATIM from the obligation (grounded; reuse the #575b extraction).
  const cc = credentialConditionalRecital(ob);
  if (cc) return cc;                                           // reuses the verbatim maintain-object / SAM-label extraction
  // fallback: name the ordinary-course object that matched (still verbatim from ob).
  const om = ORDINARY_COURSE_CRED_RE.exec(ob);
  return om ? { credential: om[0] } : null;
}

export interface CoverageV2 {
  /** Sections genuinely NOT fully read (unread / truncated / dropped-at-ingest) → legitimate INCOMPLETE. */
  unreadable: string[];
  /** Read sections whose (boilerplate) obligations weren't verbatim-grounded → the FALSE-INCOMPLETE source; no veto. */
  ungroundedRead: string[];
  /** Ungrounded obligations carrying genuine disqualification language → escalate to NEEDS_HUMAN_REVIEW.
   *  UNIT 2.2 (cards #548/#549): `locatedAt` is the obligation's TRUE location in the source (doc + nearest
   *  heading, e.g. "PWS §7.3.2"), resolved by the caller's locator — on a commercial package the `section`
   *  key is a routed approximation (the dccce793 NHR banner said "§L" for a PWS key-personnel row).
   *  `contextNote` carries adjacent scope context (e.g. a reference-only/non-billable note) so the rendered
   *  reason tells the reader what surrounds the sentence. INFORMATIONAL ONLY — never changes the pole. */
  disqualifierUncovered: Array<{ section: string; obligation: string; locatedAt?: string; contextNote?: string }>;
  /** Ungrounded, ambiguous, BAR-SIGNAL-NEGATIVE obligations (benign proposal-prep: formatting/POC/page-limits, or a
   *  government-eval-methodology sentence) DEMOTED off the escalation path to a coverage SIGNAL (card #460). Visible
   *  here, never in disqualifierUncovered, never dropped. Empty unless AUDIT_AMBIGUOUS_SIGNAL_DEMOTION is on.
   *  Optional so pre-existing partial CoverageV2 literals (older callers/tests) still typecheck; readers default []. */
  ungroundedNonBarSignal?: Array<{ section: string; obligation: string }>;
  /** Ungrounded obligations affirmatively classified as BENIGN in-source recitals (card #572, positive shape allowlist
   *  + verified source-presence): demoted OFF the escalation path to an informational bucket, never disqualifierUncovered.
   *  Present ONLY when AUDIT_BENIGN_RECITAL_COVERED is on ⇒ flag-OFF the serialized coverageV2 is byte-identical (do NOT
   *  copy ungroundedNonBarSignal's always-present-array shape — run-records serialize exactly the pre-#572 key set). */
  benignCoveredRecital?: Array<{ section: string; obligation: string; arm: string }>;
  /** Ordinary-course PERFORMANCE-UPKEEP recitals (card #576) demoted OFF the NHR path: a "maintain <ordinary-course
   *  credential> during performance" obligation is a post-award performance duty, NOT a pre-award bar — it stops driving
   *  NHR and instead attaches as a CAVEAT (credential named verbatim) to the committal verdict. Present ONLY when
   *  AUDIT_PERFORMANCE_UPKEEP_CAVEAT is on ⇒ flag-OFF the serialized coverageV2 is byte-identical. */
  caveatRecital?: Array<{ section: string; obligation: string; credential: string }>;
  /** U-B RELEASE LEDGER (panel 2026-07-29): obligations importanceOf() released as "boilerplate" — previously a
   *  SILENT drop (the :863 `continue`; measured 478/2680 = 18% of ungrounded READ obligations across the banked
   *  cohort, 82 with a kill consequence in the severed next sentence). Verdict-INERT observability: count + names
   *  ride the serialized coverageV2 into the run record. Present ONLY when AUDIT_RELEASE_LEDGER is on ⇒ flag-OFF
   *  the serialized coverageV2 is byte-identical (the caveatRecital pattern). */
  releasedBoilerplate?: Array<{ section: string; obligation: string }>;
  /** How many section attestations the completeness proof actually produced. THE POINT: `coverageGrade` reads 1 when
   *  NOTHING was attested (`totalWeight === 0 ? 1` below), so the grade alone cannot tell "everything covered" apart
   *  from "nothing examined" — measured reachable on 2 of 111 banked packages, both Part-12 commercial, where
   *  buildManifest returns [] because section presence is header-regex and a commercial package carries no UCF §B..§M
   *  headers. Present ONLY when AUDIT_ZERO_ATTESTATION_INCOMPLETE is on ⇒ flag-OFF the serialized coverageV2 is
   *  byte-identical (the caveatRecital pattern). */
  attestedCount?: number;
  /** Importance-weighted covered fraction in [0,1] — surfaced as a signal (never a veto). 1 when nothing required. */
  coverageGrade: number;
}

/** Re-read the V1 attestations through the V2 lens. Pure. Does NOT change any finding or invent coverage —
 *  it only classifies WHY a section is uncovered (genuinely unreadable vs read-but-unquoted) and weights it. */
export function gradeCoverageV2(attestations: SectionAttestation[], opts?: {
  /** UNIT 2.2 — resolve an obligation sentence to its TRUE source location (doc + nearest heading) plus any
   *  adjacent scope-context note. Supplied by the orchestrator (which holds ctx.fullSource); absent ⇒ entries
   *  carry only the routed section key (byte-identical to the pre-#548 shape). Informational only. */
  locate?: (ob: string) => { locatedAt: string; contextNote?: string } | null;
  /** card #572 — verify a benign-recital candidate is VERIFIABLY PRESENT in the assembled source (+ return its severed
   *  tail for the continuation veto). Supplied by the orchestrator (holds ctx.fullSource). Double-gated: a caller-
   *  supplied fn NEVER runs flag-OFF (the block short-circuits before it is consulted). Absent ⇒ no benign claim. */
  verifyRecitalPresence?: (ob: string) => { present: boolean; continuation: string } | null;
  /** U-B — all-occurrence next-sentence window lookup (consequenceTailsAfter). Absent ⇒ capture declines. */
  consequenceTails?: (ob: string) => string[];
}): CoverageV2 {
  const unreadable: string[] = [];
  const ungroundedRead: string[] = [];
  const disqualifierUncovered: Array<{ section: string; obligation: string; locatedAt?: string; contextNote?: string }> = [];
  const releasedBoilerplate: Array<{ section: string; obligation: string }> = [];
  const ungroundedNonBarSignal: Array<{ section: string; obligation: string }> = [];
  const benignCoveredRecital: Array<{ section: string; obligation: string; arm: string }> = [];
  const caveatRecital: Array<{ section: string; obligation: string; credential: string }> = [];
  const enrich = (e: { section: string; obligation: string }) => {
    // Double-gated (R1 probe 5b): the production locator self-guards on the flag, but a caller-supplied
    // locate fn might not — enrichment NEVER runs flag-OFF regardless of the injected fn.
    if (!groundingVariantToleranceEnabled()) return e;
    const loc = opts?.locate?.(e.obligation) ?? null;
    return loc ? { ...e, locatedAt: loc.locatedAt, ...(loc.contextNote ? { contextNote: loc.contextNote } : {}) } : e;
  };
  let coveredWeight = 0, totalWeight = 0;

  for (const a of attestations) {
    const isCovered = a.status === "covered_direct" || a.status === "covered_attested"
      || a.status === "covered_attested_boilerplate" || a.status === "covered_boilerplate_signal" || a.status === "read_no_obligation";
    // A binding-obligation section (L/M/C/F…) weighs more than an incorporated-clause list (I/K).
    const weight = ["I", "K"].includes(a.section) ? 1 : 2;
    totalWeight += weight;
    if (isCovered) { coveredWeight += weight; continue; }

    if (a.status === "unread") { unreadable.push(a.section); continue; }

    // obligations_ungrounded — split the reasons: unreadable markers vs genuinely read-but-unquoted obligations.
    const markers = a.ungrounded.filter((u) => UNREADABLE_MARKER.test(u));
    const realUngrounded = a.ungrounded.filter((u) => !UNREADABLE_MARKER.test(u));
    if (markers.length) { unreadable.push(a.section); continue; } // a truncated/dropped tail = genuine unreadability
    if (realUngrounded.length) {
      ungroundedRead.push(a.section);
      // Partial credit in the grade for a section that WAS read and has some grounding (importance-weighted signal).
      if (a.citedFindingIds.length) coveredWeight += weight * 0.5;
      // FAIL TOWARD DISQUALIFIER: an ungrounded obligation that is NOT boilerplate escalates. With the demotion flag
      // (card #460), an AMBIGUOUS one is split by bar signal: bar-signal-positive keeps escalating (the belt), while a
      // bar-signal-NEGATIVE ambiguous obligation (or a government-eval-methodology sentence) DEMOTES to the coverage
      // signal (ungroundedNonBarSignal). Flag-OFF ⇒ ambiguous always escalates ⇒ byte-identical.
      for (const ob of realUngrounded) {
        const imp = importanceOf(ob);
        if (imp === "boilerplate") {
          // U-B CONSEQUENCE CAPTURE: before releasing, read the SEVERED next-sentence window — a duty whose
          // adjacent consequence says reject/unacceptable/ineligible is a kill-gate obligationsOf split apart
          // ("shall acknowledge all amendments." ⟂ "failure ... will not be considered."). Escalate it to
          // disqualifierUncovered (under armed U-A that surfaces as the NAMED committal caution or holds via the
          // firm-fact spectrum — never a silent drop, never an ambient mute). Tail unlocatable ⇒ capture declines
          // and the release stands (the ledger below still records it). Flag-OFF ⇒ branch skipped ⇒ byte-identical.
          if (consequenceCaptureEnabled()) {
            const tails = opts?.consequenceTails?.(ob) ?? [];
            if (tails.some((t) => isKillConsequenceTail(t))) {
              disqualifierUncovered.push(enrich({ section: a.section, obligation: ob })); continue;
            }
          }
          // U-B RELEASE LEDGER: the silent drop becomes a RECORDED drop (verdict-inert; rides the run record).
          if (releaseLedgerEnabled()) releasedBoilerplate.push({ section: a.section, obligation: ob });
          continue;
        }
        if (imp === "disqualifier") { disqualifierUncovered.push(enrich({ section: a.section, obligation: ob })); continue; }
        // BENIGN-IN-SOURCE RECITAL TRIAGE (card #572, flag AUDIT_BENIGN_RECITAL_COVERED, default-OFF). Runs ONLY on the
        // ambiguous class (a DISQUALIFIER_RE hit already returned above — never laundered) and BEFORE the ambiguous
        // demotion, so a claimed recital is recorded as affirmatively-benign-and-present rather than merely bar-negative.
        // A positive arm match REQUIRES verified source-presence AND no severed-tail bar; any miss/absence ⇒ fall
        // through to the unchanged escalate path (fail-toward-disqualifier). Flag-OFF ⇒ this block is never reached.
        if (benignRecitalCoveredEnabled()) {
          const arm = classifyBenignRecital(ob);
          const ver = arm ? (opts?.verifyRecitalPresence?.(ob) ?? null) : null;
          if (arm && ver?.present && !recitalTailVeto(ver.continuation)) {
            benignCoveredRecital.push({ section: a.section, obligation: ob, arm }); continue;
          }
        }
        // ORDINARY-COURSE PERFORMANCE-UPKEEP → CAVEAT (card #576, flag AUDIT_PERFORMANCE_UPKEEP_CAVEAT, default-OFF). A
        // two-axis-qualifying "maintain <ordinary-course credential> during performance" recital STOPS driving NHR
        // (routed to caveatRecital, not disqualifierUncovered) — the verdict is decided by the remainder and a caveat
        // attaches. The source continuation is threaded so the LBJ line-wrap-severed fragment's "during performance"
        // tail + any long-lead/at-award negative are seen. Ambiguous on either axis ⇒ classifier returns null ⇒ escalate.
        if (performanceUpkeepCaveatEnabled()) {
          const ver = opts?.verifyRecitalPresence?.(ob) ?? null;
          // Gauntlet R1 (F1/F2/F3): demote ONLY when the recital is source-VERIFIED present (FAIL-CLOSED — a
          // paraphrased/raw-unlocatable obligation escalates, mirroring #572; also keeps the emitted excerpt genuinely
          // grounded, closing the #574 fabrication breach) AND its severed tail carries NO bar via recitalTailVeto
          // (hasBarSignal || benignGuardRefuses — strictly STRONGER than the two #576 negatives; catches bonding/surety
          // and any BAR_SIGNAL-vocab bar riding the tail that the enumerated long-lead list would miss).
          const up = (ver?.present && !recitalTailVeto(ver.continuation)) ? classifyPerformanceUpkeepRecital(ob, ver.continuation) : null;
          if (up) { caveatRecital.push({ section: a.section, obligation: ob, credential: up.credential }); continue; }
        }
        if (ambiguousSignalDemotionEnabled() && (!hasBarSignal(ob) || isGovtEvalMethodologyNonBar(ob)
              || (conditionalTinaDemotionEnabled() && isConditionalTinaBoilerplate(ob)))) {
          // DEMOTION TAIL VETO (see doctrine at the flag) — re-scan the SEVERED tail this exit is otherwise blind to.
          // Verified-present recital + POSITIVE tail bar ⇒ refuse the demotion ⇒ fall through to escalate.
          const tv = demotionTailVetoEnabled() ? (opts?.verifyRecitalPresence?.(ob) ?? null) : null;
          const tailVetoed = !!tv?.present && recitalTailVeto(tv.continuation);
          if (!tailVetoed) { ungroundedNonBarSignal.push({ section: a.section, obligation: ob }); continue; }
        }
        disqualifierUncovered.push(enrich({ section: a.section, obligation: ob }));
      }
    }
  }
  return {
    unreadable,
    ungroundedRead,
    disqualifierUncovered,
    ungroundedNonBarSignal,
    // card #572 — include the benign-recital bucket ONLY when the flag is on, so the flag-OFF serialized coverageV2
    // (persisted into run-records at result.inputs.coverageV2) keeps its exact pre-#572 key set (byte-identical).
    ...(benignRecitalCoveredEnabled() ? { benignCoveredRecital } : {}),
    // card #576 — include the caveat bucket ONLY when the flag is on ⇒ flag-OFF serialized coverageV2 byte-identical.
    ...(performanceUpkeepCaveatEnabled() ? { caveatRecital } : {}),
    // U-B — include the release ledger ONLY when the flag is on ⇒ flag-OFF serialized coverageV2 byte-identical.
    ...(releaseLedgerEnabled() ? { releasedBoilerplate } : {}),
    // ZERO-ATTESTATION — carry the SIZE of the proof set, because `coverageGrade` below cannot express it: an empty
    // attestation set scores 1, identically to a fully-covered package. Emitted ONLY when the flag is on ⇒ flag-OFF
    // serialized coverageV2 byte-identical. gateV2Outcome caps on `=== 0` (never on absent — a legacy record banked
    // before this field existed must replay unchanged, so "missing" means "unknown", not "empty").
    ...(zeroAttestationIncompleteEnabled() ? { attestedCount: attestations.length } : {}),
    coverageGrade: totalWeight === 0 ? 1 : coveredWeight / totalWeight,
  };
}

// `kind` (U-A cap-not-mute, panel ceo/VERDICT-INVERSION-PANEL-2026-07-29.md) discriminates WHICH NHR branch
// fired so deriveVerdict can route them differently under AUDIT_COVERAGE_CAP_NOT_MUTE: an "uncovered_obligation"
// NHR becomes a BID_WITH_CAUTION cap (never a mute), while a "credential_conditional" NHR keeps its full force
// (Rule 70 case (c): an unverifiable firm-fact a bar turns on). Additive — cap/reason are untouched, so every
// existing consumer is byte-identical whether or not it reads the field.
// "firm_fact_bar" (round-2 F-R2-2): a pre-award possession frame or long-lead/scarce credential anywhere in the
// firing bucket — the decisive end of the Rule 70(c) firm-fact spectrum. Kept muted by the consumer's fail-closed
// positive test exactly like "credential_conditional".
export type GateV2Outcome = { cap: "INCOMPLETE" | "NEEDS_HUMAN_REVIEW" | null; reason: string; kind?: "credential_conditional" | "firm_fact_bar" | "uncovered_obligation" };

// ── VERDICT ARC step 4 (moves 1+2) — VERBATIM-VETO RETIREMENT, flag `AUDIT_RETIRE_VERBATIM_VETO` default-OFF ──
// Move 2 as ratified: "retire the verbatim MATCH, keep the source-obligation ENUMERATION." This flag implements
// exactly that halving, at the ONE place the match becomes an authority:
//   · RETIRED — `disqualifierUncovered` stops being a verdict CAP. An obligation is no longer escalated to NHR
//     merely because no finding quoted it with a ≥4-word verbatim n-gram. Non-grounding is not evidence of a bar.
//   · KEPT — the enumeration itself. `gradeCoverageV2` still enumerates and classifies every obligation, the
//     `CoverageV2` object still flows to every consumer as classifier INPUT and render signal, and the bucket is
//     still reported (`softBudget.disqualifierUncovered`, run-record serialization) for measurement.
//   · UNTOUCHED — `unreadable` → INCOMPLETE. That is the honest-fail on genuinely unread binding content, not the
//     verbatim veto; retiring it would manufacture false committals over content nobody read.
// The independent `noticeBodyBarUngrounded` NHR pole (audit-decide.ts:3377) is a SEPARATE authority and also
// survives retirement untouched.
// SAFETY POSTURE: this REMOVES a deterministic escalation, so its failure direction is toward FALSE-BID — the
// cardinal sin, and the exact reason PANEL RULING 1 gates it on MEASURED false-BID = 0 (gold-set direct count AND
// itemized flip-adjudication over the banked run-records; Brain step-4 ruling PART 1, 2026-07-22). Flag-OFF is
// byte-identical: the branch below is entered exactly as before and the fall-through reason string is unchanged
// (the ledger note appends ONLY when the flag is on AND the bucket is non-empty).
const retireVerbatimVetoEnabled = () => process.env.AUDIT_RETIRE_VERBATIM_VETO === "true";

// ── STEP-4 OPTION (C) · VETO NARROWING (Brain ruling 2026-07-23, card #693) ─────────────────────────────────
// Flag `AUDIT_VETO_NARROW_UNIVERSAL`, default-OFF.
//
// ⛔⛔ **DO NOT ARM — END-GAUNTLET NON-GREEN (2026-07-23).** `ceo/GAUNTLET-ENDROUND-REDTEAM.md`, independently
// re-executed in `scripts/audit-ai/_verify-gauntlet-p0.ts`: **6 adversarial sentences carrying GENUINE pre-award
// bars are RELEASED by this predicate with `cap = null`** — a false-BID pathway, the cardinal sin. Confirmed
// releases include a bid guarantee (FAR 28.101-4), SAM registration (FAR 52.204-7), a Top Secret facility
// clearance, a DCAA-approved accounting system, and a GSA Schedule vehicle bar.
//
// ⛔ CLASS (a) IS UNSOUND **BY DESIGN**, not by regex gap. The charter claim below — that a responsibility
// determination is "not a bar the bidder can fail to possess in advance" — is **LEGALLY FALSE**. FAR 9.104-2
// (fetched 2026-07-23): special standards of responsibility "**shall be set forth in the solicitation** (and so
// identified) and **shall apply to all offerors**" — objective pre-award criteria (years of experience,
// licensing, bonding) that GAO reviews on protest precisely because a bidder CAN fail them. A single-clause
// definitive-responsibility-criterion sentence is SHAPE-INDISTINGUISHABLE from the universal recital, so no
// tightening of the clause detector can separate them (the #557 shape-collision pattern).
//
// Class (b) carries fixable vocabulary gaps (notably the "Schedule" token collision: an EVAL_FACTOR_RE
// evaluation factor vs a GSA **Schedule** contract vehicle bar — the ratified token-collision doctrine).
// BUT the measured target `SP3300-26-Q-0165` needs BOTH entries released to flip, so class (b) alone returns the
// narrowing's measured effect to ZERO. **Option (C) as ruled cannot be delivered safely — carded to Brain.**
// The code is retained flag-OFF and byte-identical so the measurement is reproducible; it is NOT a shippable unit.
//
// WHAT IT DOES: excludes from the veto's fire path the TWO UNIVERSAL classes measured on `SP3300-26-Q-0165` —
// the only record on which the veto was the sole deciding authority, and on which its catch was a FALSE
// POSITIVE both times:
//   (a) FAR Part 9 **responsibility-determination** recitals — a Contracting-Officer-side determination made at
//       award, present in essentially every solicitation. Not a bar the bidder can fail to possess in advance.
//   (b) **Government evaluation-methodology** prose ("the Government will evaluate X to determine acceptability").
//       The existing `isGovtEvalMethodologyNonBar` is TINA-scoped despite its name (it requires a cost-or-pricing-
//       data token), so this general class was never covered.
//
// ⚠ DOCTRINE CHECK — WHY THE RATIFIED 3-STEP SHAPE COULD NOT BE USED, AND WHAT REPLACED IT.
// The established shape for a demotion predicate is FRAME + SUBSTANCE + strip-then-require-no-surviving-bar-signal
// (see isGovtEvalMethodologyNonBar / isConditionalTinaBoilerplate). Its safety rests entirely on `hasBarSignal`
// catching anything real that survives the strip. **MEASURED, and it does not:**
//     hasBarSignal("shall furnish a bid guarantee of 20 percent of the bid price")            → FALSE
//     hasBarSignal("bid guarantee")                                                            → FALSE
//     hasBarSignal("must be a small business manufacturer or obtain an SBA nonmanufacturer waiver") → FALSE
// (The real FA8137 bid-guarantee obligation only registers because it contains the word "required".) A
// strip-then-recheck guard therefore **released a genuine bid guarantee and a genuine nonmanufacturer-rule bar**
// in the adversarial probe. On a RELEASE-side gate that is not an acceptable failure mode: the guard would be a
// placebo (L40 — an INERT guard whose output equals its PASSING output).
//
// THE PIVOT (reconstruction-treadmill recognizer): stop reconstructing the strip, use a POSITIVE STRUCTURAL
// INVARIANT. A sentence is released ONLY IF it is a **SINGLE operative clause whose subject IS the universal
// recital**. Any compound sentence — a coordinating conjunction introducing a second duty, or any semicolon/colon
// clause — is NEVER released, whatever vocabulary it carries. The property holds BY CONSTRUCTION and does not
// depend on `hasBarSignal` seeing the co-resident bar: a bar riding along a responsibility recital always makes
// the sentence compound, and compound sentences are excluded.
//
// FAILURE DIRECTION: incompleteness of the exclusion fails toward FIRE — an unrecognised boilerplate phrase
// merely keeps today's over-fire, which is the safe direction for a veto. The dangerous direction (releasing a
// genuine bar) is what the single-clause invariant closes.
const vetoNarrowUniversalEnabled = () => process.env.AUDIT_VETO_NARROW_UNIVERSAL === "true";

/** A SECOND operative duty riding the same sentence: a coordinating conjunction followed by a modal/copula duty,
 *  or any semicolon/colon-introduced clause. POSITIVE detection of compoundness — never a bar-vocabulary list. */
const SECOND_CLAUSE_RE = /\b(?:and|or)\s+(?:the\s+\w+\s+)?(?:shall|must|will|is|are)\b|[;:]/i;

/** (a) A single-clause FAR Part 9 responsibility-determination recital. */
const RESPONSIBILITY_RECITAL_RE = /\bdetermined?\s+to\s+be\s+responsible\b|\bdetermination\s+of\s+responsibility\b|\bresponsibility\s+determination\b/i;
export function isResponsibilityDeterminationRecital(ob: string): boolean {
  const t = ob.trim();
  if (!RESPONSIBILITY_RECITAL_RE.test(t)) return false;
  if (SECOND_CLAUSE_RE.test(t)) return false;                 // compound ⇒ never released
  return !/\b(?:only\s+if|provided\s+that|unless|conditioned\s+upon)\b/i.test(t);  // a conditional gate is not a bare recital
}

/** (b) Single-clause government evaluation-methodology prose (the general class; the TINA-scoped predicate above
 *  stays untouched and continues to own its own family). */
const GOVT_EVAL_GENERAL_RE = /\bthe\s+government\s+(?:will|shall|may)\s+(?:evaluate|assess|consider)\b|\b(?:proposals?|quotes?|offers?|quotations?)\s+(?:will|shall)\s+be\s+evaluated\b/i;

// ADVERSARIAL BREAK FOUND AND CLOSED (red-team pass, 2026-07-23). The frame + single-clause test alone RELEASED
// "The Government will assess each quoter's CMMC Level 2 certification status to determine acceptability." —
// a single-clause evaluation sentence that NAMES A GENUINE CREDENTIAL GATE, and CMMC L2 is one of the very
// register shapes this narrowing exists to preserve. Releasing it would have been a false-BID pathway.
//
// FIX — POSITIVE ALLOWLIST OF THE SAFE CASE, per the standing no-blocklist doctrine: a sentence is evaluation
// METHODOLOGY only when the thing being evaluated is a STANDARD EVALUATION FACTOR (FAR 15.304 — price/cost,
// past performance, technical, management, schedule, quality, capability). Evaluating a CREDENTIAL, CLEARANCE,
// CERTIFICATION or REGISTRATION is a GATE, never methodology, and is never released. An unrecognised eval
// subject falls through to KEEP FIRING — the safe direction.
const EVAL_FACTOR_RE = /\b(?:past\s+performance|price|cost|technical\s+(?:approach|capability|merit|factors?)|management\s+(?:approach|plan)|schedule|quality|delivery|small\s+business\s+participation|relevant\s+experience)\b/i;
/** Naming any of these makes the sentence a GATE regardless of its frame — the eval subject is a possession. */
const CREDENTIAL_SUBJECT_RE = /\b(?:cmmc|clearance|certification|certificate|accreditation|licens(?:e|ure)|registration|qualified\s+products?\s+list|qpl|facility\s+security|dd\s*form\s*254|iso\s*900\d|8\s?\(a\)|hubzone|sdvosb|wosb|edwosb)\b/i;

export function isGovtEvalMethodologyGeneralNonBar(ob: string): boolean {
  const t = ob.trim();
  if (!GOVT_EVAL_GENERAL_RE.test(t)) return false;
  if (SECOND_CLAUSE_RE.test(t)) return false;                 // compound ⇒ never released
  if (CREDENTIAL_SUBJECT_RE.test(t)) return false;            // evaluating a possession = a gate, not methodology
  if (!EVAL_FACTOR_RE.test(t)) return false;                  // POSITIVE allowlist: unrecognised subject ⇒ keep firing
  // An evaluation sentence that also states a CONSEQUENCE of not qualifying is a gate, not methodology.
  return !/\b(?:ineligible|unacceptable|will\s+not\s+be\s+considered|rejected|disqualified|only\s+if|must\s+possess|must\s+hold|must\s+be)\b/i.test(t);
}

/** The single predicate the veto consults. Flag-OFF ⇒ always false ⇒ byte-identical. */
export function isNarrowedUniversalNonBar(ob: string): boolean {
  if (!vetoNarrowUniversalEnabled()) return false;
  return isResponsibilityDeterminationRecital(ob) || isGovtEvalMethodologyGeneralNonBar(ob);
}

// ── B3 · BANNER BAR RANKING (Brain ruling 2026-07-23) ───────────────────────────────────────────────────────
const bannerBarRankingEnabled = () => process.env.AUDIT_BANNER_BAR_RANKING === "true";

/** Normalize for the tier-1 correspondence test: lowercase, collapse whitespace, drop punctuation. Deliberately
 *  NOT the grounding matcher — this decides DISPLAY ORDER only and can never change a cap, so a miss costs a
 *  less-apt excerpt, never a wrong verdict. */
const normForRank = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Tier of one bucket entry. LOWER IS MORE SIGNIFICANT.
 *   0 — corresponds to a TYPED `eligibility_bar` finding. The engine already decided this text is a bar, by its
 *       own authority, so it outranks anything the sentence-level classifiers infer.
 *   1 — `importanceOf` says disqualifier (positive classification).
 *   2 — `hasBarSignal` (weaker, bar-shaped vocabulary present).
 *   3 — none of the above; ordered by document position via the stable sort.
 *  Ambiguity never promotes: an entry only leaves tier 3 on a POSITIVE signal, matching the module's
 *  shape-allowlist doctrine (never a blocklist, never a demotion by absence). */
function rankTierOf(entry: { obligation: string }, barTexts: string[]): number {
  const ob = entry.obligation || "";
  if (barTexts.length) {
    const n = normForRank(ob);
    // Correspondence is CONTAINMENT IN EITHER DIRECTION on normalized text, with a length floor so a short
    // fragment cannot match half the document. This is intentionally conservative: a false negative just means
    // the entry is ranked by its classifier tier instead, which is still better than raw document order.
    if (n.length >= 24 && barTexts.some((b) => b.length >= 24 && (b.includes(n) || n.includes(b)))) return 0;
  }
  if (importanceOf(ob) === "disqualifier") return 1;
  if (hasBarSignal(ob)) return 2;
  return 3;
}

/** Returns the highest-ranked entry. PURE — never mutates the caller's array (the bucket flows on to other
 *  consumers and to run-record serialization, so re-ordering it in place would be a silent substrate change). */
function rankDisqualifiers<T extends { obligation: string }>(entries: T[], findings?: Array<{ kind?: string; requirement?: string; excerpt?: string }>): T {
  const barTexts = (findings ?? [])
    .filter((f) => f.kind === "eligibility_bar")
    .flatMap((f) => [f.requirement, f.excerpt])
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .map(normForRank);
  let best = entries[0], bestTier = rankTierOf(entries[0], barTexts);
  for (let i = 1; i < entries.length && bestTier > 0; i++) {
    const t = rankTierOf(entries[i], barTexts);
    if (t < bestTier) { best = entries[i]; bestTier = t; }   // strict < ⇒ stable: ties keep document order
  }
  return best;
}

/** Map V2 coverage → a verdict CAP (or null = no cap, the committal verdict flows). This replaces the V1 blanket
 *  `!coverageComplete → INCOMPLETE`. Order matters: genuine unreadability first (legitimate INCOMPLETE), then a
 *  genuinely-uncovered disqualifier (escalate, never silent-BID), else no cap — the false-INCOMPLETE is gone. */
export function gateV2Outcome(cov: CoverageV2, opts?: { findings?: Array<{ kind?: string; requirement?: string; excerpt?: string }> }): GateV2Outcome {
  // ZERO-ATTESTATION HONEST-FAIL — FIRST, so no later branch can shadow it. `=== 0` and never `!cov.attestedCount`:
  // absent means the field was not emitted (flag off, or a record banked before it existed) and must replay
  // unchanged, whereas 0 is a positive measurement that the proof set was empty. Reached only when the coverage
  // proof produced nothing, so `unreadable` is necessarily empty here too — the two never compete.
  if (cov.attestedCount === 0)
    return { cap: "INCOMPLETE", reason: "No binding section could be certified — the completeness proof is empty (0 sections attested), so coverage cannot be reported on this package at all. The honest incomplete." };
  if (cov.unreadable.length)
    return { cap: "INCOMPLETE", reason: `Could not fully read binding content: §${cov.unreadable.join(", §")} (unread/truncated at ingest) — the honest incomplete.` };
  // step-4 retirement: flag-ON, an ungrounded-but-bar-shaped obligation no longer CAPS the verdict — it stays in
  // the ledger as classifier input and falls through to the signal path below. Flag-OFF, the branch is entered
  // exactly as before (byte-identical).
  // OPTION (C) NARROWING — the two universal classes are excluded from the FIRE decision only. The entries are
  // NOT dropped: `cov.disqualifierUncovered` is untouched and still flows to every consumer, the run-record and
  // the ledger note below, exactly like the retirement flag's "retained as ledger input" posture. Flag-OFF the
  // filter is the identity function ⇒ byte-identical.
  const firing = vetoNarrowUniversalEnabled()
    ? cov.disqualifierUncovered.filter((d) => !isNarrowedUniversalNonBar(d.obligation))
    : cov.disqualifierUncovered;
  if (firing.length && !retireVerbatimVetoEnabled()) {
    // ── B3 (Brain ruling, 2026-07-23) — RANK the bucket so the banner quotes the MOST SIGNIFICANT obligation ──
    // Flag `AUDIT_BANNER_BAR_RANKING`, default-OFF. CAP-INVARIANT / SELECTION-VARIANT / VERDICT-INERT: this only
    // chooses WHICH entry is quoted. The cap, the bucket, its length, and every downstream consumer are untouched
    // — `cov.disqualifierUncovered` itself is never mutated (the sort runs on a copy).
    //
    // WHY IT NEEDED B4 FIRST: the bucket is in DOCUMENT ORDER and unranked, so `[0]` was simply the first
    // ungrounded obligation in the file. Ranking alone would still have emitted B4's false characterization on
    // whatever it promoted; B4 made the sentence honest, B3 now makes it the RIGHT sentence. Measured motivating
    // case `be69ce16`: a real bid guarantee sat unquoted in the bucket while a DEBRIEFING sentence was shown.
    //
    // PRECEDENCE (ratified): typed eligibility_bar → importanceOf=disqualifier → hasBarSignal → document order.
    // The sort is STABLE, so document order is preserved WITHIN every tier — the last tier is not a tie-break
    // rule so much as the guarantee that an unranked bucket comes out exactly as it went in.
    const d = bannerBarRankingEnabled() ? rankDisqualifiers(firing, opts?.findings) : firing[0];
    // UNIT 2.2 — report the obligation at its TRUE location when the locator resolved one (the routed section
    // key is an approximation on commercial packages; dccce793's "§L" banner was a PWS key-personnel row).
    // Any adjacent scope context (e.g. a reference-only note) rides along so the reader sees what the human
    // review is actually judging. Pole unchanged — fail-toward-disqualifier stands.
    const where = d.locatedAt ? `at ${d.locatedAt}` : `in §${d.section}`;
    // contextNote arrives PRE-LABELED by the locator (R1-F3: "Surrounding context…" when in the sentence's
    // own block; "An earlier scope note… (verify it governs…)" when document-level) — append verbatim.
    // R5-F6 — word-boundary clamp (the 69dbbe9e reason-garble class): never a mid-word cut with an
    // unclosed quote on the customer banner. Cap ≥ the locator's construction max (~380).
    const clampNote = (s: string): string => {
      if (s.length <= 380) return s;
      const cut = s.slice(0, 380).replace(/\s+\S*$/, "");
      return `${cut}…".`;
    };
    const ctxNote = d.contextNote ? ` ${clampNote(d.contextNote)}` : "";
    // card #575b (flag AUDIT_CREDENTIAL_CONDITIONAL_REASON, default-OFF) — for a CREDENTIAL-CONDITIONAL bar (maintain-
    // credential-during-performance / SAM-active), upgrade the reason prose to an actionable conditional. CAP is
    // UNCHANGED (still NEEDS_HUMAN_REVIEW — verdict untouched). The credential is grounded from the obligation and the
    // phrasing makes NO claim about the bidder (fabrication-invariant compliant). Flag-OFF ⇒ the legacy line below.
    // ── KIND TRUTH (U-A red-team F1/F2, 2026-07-29) — bucket-wide and FLAG-INDEPENDENT. Whether this NHR is a
    // firm-fact credential-conditional (Rule 70 case (c) — never released to a committal cap) is a property of
    // the WHOLE firing bucket, not of the quoted head and not of the #575b PROSE flag. Two defects this closes:
    //   F1 — kind was emitted only inside the credentialConditionalReasonEnabled() branch, so arming cap-not-mute
    //        without the prose flag silently capped every credential conditional (prose flag owned a verdict
    //        discriminator);
    //   F2 — kind was derived from the ranked head `d` alone, so a cc item at index ≥1 behind a higher-ranked
    //        non-cc item lost its mute (head-only prose selection silently promoted to verdict authority).
    // The prose upgrade below stays behind #575b exactly as shipped; cap/reason are untouched in every
    // pre-existing flag state (kind is additive — only the U-A consumer reads it).
    const ccHead = credentialConditionalRecital(d.obligation) ? d : undefined;
    const ccAny = ccHead ?? firing.find((f) => credentialConditionalRecital(f.obligation));
    // F-R2-2 (round-2 red-team, executed): Rule 70 case (c) is the firm-fact SPECTRUM, not the #575b prose
    // family alone. Without this, the DECISIVE end of the spectrum — "must possess a Top Secret facility
    // clearance at the time of award" (pre-award possession), CMMC/QPL/ITAR (long-lead credentials) — was
    // RELEASED to a billable committal cap while the routine end ("maintain an active SAM registration")
    // held its mute: severity inverted. Same pure, flag-independent classifiers the self-clearable
    // recognizer uses (card #590). "firm_fact_bar" keeps the mute via the consumer's fail-closed positive
    // test (it releases ONLY "uncovered_obligation") — no consumer change needed.
    // U-A.1 NARROWING (round-3 finding 1): the possession-frame arm holds ONLY with a credential noun in the
    // SAME obligation — the bare "must hold/possess" token alone re-muted §L submission mechanics ("hold prices
    // firm for 90 days", "shall hold a pre-bid conference"), silently re-muting a slice of the release cohort.
    // Scoped HERE only: PREAWARD_POSSESSION_RE itself is shared with the #576 upkeep discriminator and the #590
    // self-clearable recognizer and is untouched. The long-lead arm is unchanged (its tokens ARE credential nouns).
    // The noun set is FIRM_FACT_NOUN_RE (below), a U-A-scoped SUPERSET of CREDENTIAL_TOKEN_RE — the shared regex
    // is deliberately NOT widened (it also gates the #575b cc prose branch, armed in prod; widening it would
    // change served reasons with no new flag). U-A.1-verification F1 (executed): the bare CREDENTIAL_TOKEN_RE
    // set over-released credential-noun-by-reference ("qualifications described in Section H"), permits,
    // verb-form "registered", "credentials", facility RATING, and Authority to Operate — all firm-facts the
    // parent held. Adjective "qualified" is deliberately NOT matched (qualificat\w* only), so the
    // equipment-and-qualified-personnel mechanics class stays released (probe R4).
    // U-A.2 — `uaHasLongLeadCredential` is `hasLongLeadCredential` verbatim while AUDIT_UA_BOND_NOT_FIRM_FACT is
    // OFF; flag-ON it declines to treat a bare bond/surety token as a scarce credential. See its doctrine above.
    const firmFactAny = ccAny ? undefined : firing.find((f) =>
      (hasPreAwardPossession(f.obligation) && FIRM_FACT_NOUN_RE.test(f.obligation)) || uaHasLongLeadCredential(f.obligation));
    const kind: "credential_conditional" | "firm_fact_bar" | "uncovered_obligation" =
      ccAny ? "credential_conditional" : firmFactAny ? "firm_fact_bar" : "uncovered_obligation";
    if (credentialConditionalReasonEnabled()) {
      // Prose selection: pre-U-A behavior quotes the head iff the HEAD is cc (byte-identical with cap-not-mute
      // OFF); with cap-not-mute ON the prose may quote the cc item found anywhere in the bucket — under the cap
      // regime the cc item IS the reason the mute holds, so it is the sentence the customer must see.
      const ccQuote = process.env.AUDIT_COVERAGE_CAP_NOT_MUTE === "true" ? ccAny : ccHead;
      if (ccQuote) {
        const cc = credentialConditionalRecital(ccQuote.obligation)!;
        const ccWhere = ccQuote.locatedAt ? `at ${ccQuote.locatedAt}` : `in §${ccQuote.section}`;
        const ccCtx = ccQuote.contextNote ? ` ${clampNote(ccQuote.contextNote)}` : "";
        // F-R2-4: under the cap regime the cc item may not be the B3-ranked head — disclose the count so the
        // ranked most-significant item is never silently absent from the customer reason. Cap OFF ⇒ "" (byte-identical).
        const ccMore = process.env.AUDIT_COVERAGE_CAP_NOT_MUTE === "true" && cov.disqualifierUncovered.length > 1
          ? ` ${cov.disqualifierUncovered.length} obligations in this package could not be grounded; this one is quoted because it turns on a firm credential.` : "";
        return { cap: "NEEDS_HUMAN_REVIEW", kind: "credential_conditional", reason: `A credential-conditional requirement ${ccWhere} could not be grounded to a finding — it requires ${cc.credential}. Confirm your firm holds this before bidding — human verification needed: "${ccQuote.obligation.slice(0, 120)}".${ccMore}${ccCtx}` };
      }
    }
    // ── B4 (Brain ruling on cards #690/#691, 2026-07-23) — STOP CHARACTERIZING AN UNRANKED SENTENCE AS A BAR ──
    // Flag `AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM`, default-OFF. CAP-INVARIANT / REASON-VARIANT / VERDICT-INERT.
    // THE DEFECT (contracts seat, verified by red-team): `disqualifierUncovered` is in DOCUMENT ORDER and is
    // NOT RANKED, so `[0]` is simply the first ungrounded obligation in the file — yet the banner asserted it was
    // "a potential disqualifying requirement". Measured on `be69ce16`: a real bid guarantee sat unquoted in the
    // bucket while the customer was shown a DEBRIEFING sentence labelled as a potential disqualifier.
    // WHY IT IS THE ARC'S ONE CUSTOMER-FACING EXPOSURE: this is not fabrication — the quoted text is verbatim —
    // but it is a MISCHARACTERIZATION, and at protest standard it is worse than naming no bar at all: the bidder
    // relies on it, is misdirected away from the real gate, and the product asserts something false about
    // federal procurement law in a paid advisory.
    // THE FIX IS PROSE-ONLY: say what is actually true — an obligation could not be grounded, there are N of
    // them, and this excerpt is first in document order rather than the most significant. The cap, the bucket and
    // every verdict are untouched. B3 (ranking) lands next; ranking WITHOUT this fix would still emit the false
    // characterization, which is why the ruling ordered B4 first.
    if (bannerNoUnrankedBarClaimEnabled()) {
      const n = cov.disqualifierUncovered.length;
      const more = n > 1 ? ` ${n} obligations in this package could not be grounded; this excerpt is the first in document order, not necessarily the most significant.` : "";
      // `kind` is the BUCKET-WIDE truth computed above — a cc item anywhere keeps kind "credential_conditional"
      // even when this prose branch quotes a different (higher-ranked) item, so the U-A consumer never releases
      // the mute over an unexamined firm-fact conditional (red-team F1/F2).
      return { cap: "NEEDS_HUMAN_REVIEW", kind, reason: `An obligation ${where} could not be grounded to a finding — human verification needed: "${d.obligation.slice(0, 120)}".${more}${ctxNote}` };
    }
    return { cap: "NEEDS_HUMAN_REVIEW", kind, reason: `A potential disqualifying requirement ${where} could not be grounded to a finding — human verification needed: "${d.obligation.slice(0, 120)}".${ctxNote}` };
  }
  const nonBar = cov.ungroundedNonBarSignal ?? [];
  const demoted = nonBar.length
    ? ` ${nonBar.length} ungrounded non-bar obligation(s) demoted to signal (ungrounded_nonbar_signal).`
    : "";
  // card #572 — append the benign-recital note only when the field is present + non-empty (flag-ON) ⇒ flag-OFF the
  // reason string is byte-identical. Mirrors the `demoted` note shape.
  const benign = cov.benignCoveredRecital ?? [];
  const benignNote = benign.length
    ? ` ${benign.length} benign recital(s) verified present in source (benign_covered_recital).`
    : "";
  // step-4 retirement ledger note — present ONLY when the flag is on AND the bucket is non-empty, so a flag-OFF
  // reason string is byte-identical to the pre-step-4 shape (mirrors the `demoted` / `benignNote` pattern). The
  // entries are NOT dropped: they remain in `cov.disqualifierUncovered` for every downstream consumer.
  const retiredLedger = retireVerbatimVetoEnabled() && cov.disqualifierUncovered.length
    ? ` ${cov.disqualifierUncovered.length} ungrounded bar-shaped obligation(s) retained as ledger input, no longer a verdict veto (retire_verbatim_veto).`
    : "";
  return { cap: null, reason: (cov.ungroundedRead.length
    ? `Read complete; ${cov.ungroundedRead.length} section(s) have unquoted boilerplate obligations (coverage grade ${(cov.coverageGrade * 100).toFixed(0)}%) — a signal, not a veto.`
    : `Coverage complete (grade ${(cov.coverageGrade * 100).toFixed(0)}%).`) + demoted + benignNote + retiredLedger };
}
