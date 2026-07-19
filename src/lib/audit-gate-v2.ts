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
export function importanceOf(ob: string): "disqualifier" | "boilerplate" | "ambiguous" {
  if (DISQUALIFIER_RE.test(ob)) {
    // OPTION 1 release (flag-gated + shape-allowlist guarded): a BARE LPTA eval-consequence sentence flows to
    // ambiguous → the proven bar-signal-negative demotion. Any embedded substantive word keeps it a disqualifier.
    if (!(lptaConsequenceReleaseEnabled() && isLptaConsequenceNonBar(ob))) return "disqualifier";
  }
  if (BOILERPLATE_RE.test(ob)) return "boilerplate";
  // OFFEROR-RIGHTS / NO-OP-REP family — allow-list OUT only when the sentence carries NO eligibility-bar signal.
  // (Preserves the prior protest/debrief behavior exactly: each member still gates on its own flag + RE + !BAR_SIGNAL.)
  if (!BAR_SIGNAL_RE.test(ob) && NOOP_REP_FAMILY.some((m) => m.enabled && m.re.test(ob))) return "boilerplate";
  return "ambiguous";
}

/** Does the obligation carry ANY eligibility-bar signal (the shared !BAR_SIGNAL_RE guard, positive form)? Pure,
 *  flag-independent — exposes the existing guard for (a) the ARC-D-1c ambiguous-signal-demotion escalation semantics
 *  (Brain card #459: ambiguous+bar-signal-positive still ESCALATES the belt; ambiguous+bar-signal-negative demotes to
 *  the coverage-signal pole) and (b) the corpus safety proof that gates that build. No behavior change on its own. */
export function hasBarSignal(ob: string): boolean {
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
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 240);
        const nl = after.indexOf("\n");
        const line = nl >= 0 ? after.slice(0, nl) : after;
        const end = line.search(/[.!?](?=\s|$)/);
        continuation += " " + (end >= 0 ? line.slice(0, end + 1) : line);
      }
      if (re.lastIndex === m.index) re.lastIndex++;                         // zero-width safety
    }
  } catch { found = false; }
  if (!found) return null;                                                  // normalized-present but raw-unlocatable ⇒ can't verify the tail ⇒ refuse
  return { present: true, continuation };
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
}): CoverageV2 {
  const unreadable: string[] = [];
  const ungroundedRead: string[] = [];
  const disqualifierUncovered: Array<{ section: string; obligation: string; locatedAt?: string; contextNote?: string }> = [];
  const ungroundedNonBarSignal: Array<{ section: string; obligation: string }> = [];
  const benignCoveredRecital: Array<{ section: string; obligation: string; arm: string }> = [];
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
        if (imp === "boilerplate") continue;
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
        if (ambiguousSignalDemotionEnabled() && (!hasBarSignal(ob) || isGovtEvalMethodologyNonBar(ob)
              || (conditionalTinaDemotionEnabled() && isConditionalTinaBoilerplate(ob)))) {
          ungroundedNonBarSignal.push({ section: a.section, obligation: ob }); continue;
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
    coverageGrade: totalWeight === 0 ? 1 : coveredWeight / totalWeight,
  };
}

export type GateV2Outcome = { cap: "INCOMPLETE" | "NEEDS_HUMAN_REVIEW" | null; reason: string };

/** Map V2 coverage → a verdict CAP (or null = no cap, the committal verdict flows). This replaces the V1 blanket
 *  `!coverageComplete → INCOMPLETE`. Order matters: genuine unreadability first (legitimate INCOMPLETE), then a
 *  genuinely-uncovered disqualifier (escalate, never silent-BID), else no cap — the false-INCOMPLETE is gone. */
export function gateV2Outcome(cov: CoverageV2): GateV2Outcome {
  if (cov.unreadable.length)
    return { cap: "INCOMPLETE", reason: `Could not fully read binding content: §${cov.unreadable.join(", §")} (unread/truncated at ingest) — the honest incomplete.` };
  if (cov.disqualifierUncovered.length) {
    const d = cov.disqualifierUncovered[0];
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
    return { cap: "NEEDS_HUMAN_REVIEW", reason: `A potential disqualifying requirement ${where} could not be grounded to a finding — human verification needed: "${d.obligation.slice(0, 120)}".${ctxNote}` };
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
  return { cap: null, reason: (cov.ungroundedRead.length
    ? `Read complete; ${cov.ungroundedRead.length} section(s) have unquoted boilerplate obligations (coverage grade ${(cov.coverageGrade * 100).toFixed(0)}%) — a signal, not a veto.`
    : `Coverage complete (grade ${(cov.coverageGrade * 100).toFixed(0)}%).`) + demoted + benignNote };
}
