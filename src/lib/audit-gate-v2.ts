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
  // GATE-2 HARDENING (D-1b clarification member, card #457) — the two most common bare §M rejection verbs the guard
  // missed. DISQUALIFIER_RE already catches "will not be considered"/"deemed non-responsive", but a compound sentence
  // whose ONLY bar token is bare "unacceptable" or "rejected" (e.g. "if the offeror believes the requirements contain
  // an omission, its proposal will be deemed unacceptable") matched CLARIFICATION_RIGHTS_RE and laundered to boilerplate.
  // These verbs never appear in a benign clarification-right/protest/debrief sentence, so adding them can only route a
  // real-bar compound to the safe ambiguous→NHR pole — never re-block a genuine no-op.
  "\\bunacceptable\\b", "\\breject(?:ed|ion|s|ing)?\\b",
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

/** Three-way importance of an ungrounded obligation (Brain card-301 #1). Ambiguous defaults to disqualifier.
 *  Exported for the allow-list regression suite (audit-gate-v2-allowlist.test.ts) — the offeror-rights / no-op-rep
 *  family (protest + debriefing + foreign-procurement-tax + document order-of-precedence) must never silently narrow. */
export function importanceOf(ob: string): "disqualifier" | "boilerplate" | "ambiguous" {
  if (DISQUALIFIER_RE.test(ob)) return "disqualifier";
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

export interface CoverageV2 {
  /** Sections genuinely NOT fully read (unread / truncated / dropped-at-ingest) → legitimate INCOMPLETE. */
  unreadable: string[];
  /** Read sections whose (boilerplate) obligations weren't verbatim-grounded → the FALSE-INCOMPLETE source; no veto. */
  ungroundedRead: string[];
  /** Ungrounded obligations carrying genuine disqualification language → escalate to NEEDS_HUMAN_REVIEW. */
  disqualifierUncovered: Array<{ section: string; obligation: string }>;
  /** Importance-weighted covered fraction in [0,1] — surfaced as a signal (never a veto). 1 when nothing required. */
  coverageGrade: number;
}

/** Re-read the V1 attestations through the V2 lens. Pure. Does NOT change any finding or invent coverage —
 *  it only classifies WHY a section is uncovered (genuinely unreadable vs read-but-unquoted) and weights it. */
export function gradeCoverageV2(attestations: SectionAttestation[]): CoverageV2 {
  const unreadable: string[] = [];
  const ungroundedRead: string[] = [];
  const disqualifierUncovered: Array<{ section: string; obligation: string }> = [];
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
      // FAIL TOWARD DISQUALIFIER (amendment): every ungrounded obligation that is NOT clearly boilerplate — both
      // explicit disqualifiers AND ambiguous ones — escalates to NHR. Only unambiguously administrative language passes.
      for (const ob of realUngrounded) if (importanceOf(ob) !== "boilerplate") disqualifierUncovered.push({ section: a.section, obligation: ob });
    }
  }
  return {
    unreadable,
    ungroundedRead,
    disqualifierUncovered,
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
    return { cap: "NEEDS_HUMAN_REVIEW", reason: `A potential disqualifying requirement in §${d.section} could not be grounded to a finding — human verification needed: "${d.obligation.slice(0, 120)}".` };
  }
  return { cap: null, reason: cov.ungroundedRead.length
    ? `Read complete; ${cov.ungroundedRead.length} section(s) have unquoted boilerplate obligations (coverage grade ${(cov.coverageGrade * 100).toFixed(0)}%) — a signal, not a veto.`
    : `Coverage complete (grade ${(cov.coverageGrade * 100).toFixed(0)}%).` };
}
