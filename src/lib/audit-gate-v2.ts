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
  "\\bmust\\s+be\\s+registered\\b", "\\bregistered\\s+in\\s+sam\\b",
  "\\beligib(?:le|ility)\\b", "\\bineligible\\b",
  "\\bset[\\s-]?aside\\b", "\\b8\\s?\\(?a\\)?\\b", "\\bhubzone\\b", "\\bsdvosb\\b", "\\bwosb\\b", "\\bedwosb\\b", "\\bservice[\\s-]?disabled\\b",
  "\\bclearance\\b", "\\bcertif(?:ied|ication)\\b", "\\baccredit", "\\blicens(?:e|ed|ing)\\b",
  "\\bsize\\s+standard\\b", "\\bpast\\s+performance\\b", "\\bbond(?:ing|ed)?\\b", "\\baccounting\\s+system\\b",
  // GATE-2 HARDENING (PR #202, foreign-tax member) — foreign-ownership / export-control / country-of-origin / citizenship
  // bar vocabulary the ORIGINAL guard missed. These are REAL eligibility/access bars that DO NOT appear in the benign
  // 52.229-11 tax rep ("foreign person" / "5000C" / "excise tax"), so adding them here cannot re-block that rep. Closes
  // the ITAR/FOCI "no foreign person shall have access to classified information" laundering vector the two Gate-2 lenses
  // (contracts-attorney SOUND-BUT-OVERBROAD + adversarial-redteam F) both surfaced against the broad "foreign person" token.
  "\\bforeign\\s+(?:national|ownership|owned|control|influence)\\b", "\\bfoci\\b", "\\bnispom\\b",
  "\\bitar\\b", "\\bexport[\\s-]?control(?:led|s)?\\b", "\\bshall\\s+have\\s+access\\b",
  "\\bcitizenship\\b", "\\bu\\.?s\\.?\\s+citizen", "\\btrade\\s+agreements?\\s+act\\b", "\\bbuy\\s+american\\b",
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
// GATE-2 TIGHTENING (both lenses): the bare "\bforeign\s+person\b" token was DROPPED — it is the ONE token in this
// matcher that collides with a REAL bar ("no foreign person shall have access to classified information" — ITAR
// 22 CFR 120.16 / FOCI / NISPOM), and that ITAR sentence dodged the original BAR_SIGNAL_RE, so it would have been
// laundered to boilerplate. The 52.229-11 rep still matches via the clause number, the "tax on certain foreign
// procurements" title, "section 5000C"/"5000C", "W-14", and the "…exemption…excise tax…" election phrasing — all
// tax-specific, none collide with a bar. Dropping "foreign person" only makes a bare foreign-person sentence route
// to the SAFE ambiguous→NHR pole (over-tag = recoverable review; under-tag = lost contract).
const NOOP_REP_ALLOWLIST_ENABLED = process.env.AUDIT_NOOP_REP_ALLOWLIST === "true";
const FOREIGN_TAX_REP_RE = new RegExp([
  "\\b52\\.229-1[12]\\b",                                         // Tax on Certain Foreign Procurements (Notice / clause)
  "tax\\s+on\\s+certain\\s+foreign\\s+procurements",
  "\\bW-?14\\b", "\\bsection\\s+5000C\\b", "\\b5000C\\b",         // IRS Form W-14 / IRC §5000C — tax-specific identifiers
  "(?:full|partial|no)\\s+exemption[^.]{0,40}excise\\s+tax",     // the FA8137 election sentence
  "excise\\s+tax[^.]{0,40}exemption",
].join("|"), "i");

// The OFFEROR-RIGHTS / NO-OP-REPRESENTATION BOILERPLATE family (Brain card 435 D1) — procedural offeror rights or
// no-op self-representations that impose ZERO eligibility/award precondition. DATA-DRIVEN: add a member as an ENTRY
// here, NEVER a new arc branch. Each member carries its own enable flag; the SHARED negative guard (!BAR_SIGNAL_RE,
// applied once in importanceOf) keeps any COMPOUND sentence carrying a real bar signal on the safe ambiguous→NHR pole.
const NOOP_REP_FAMILY: Array<{ name: string; re: RegExp; enabled: boolean }> = [
  { name: "protest/disputes (52.233)", re: PROTEST_DISPUTES_RE, enabled: PROTEST_ALLOWLIST_ENABLED },
  { name: "debrief/notification (15.50x)", re: DEBRIEF_NOTIFY_RE, enabled: DEBRIEF_ALLOWLIST_ENABLED },
  { name: "foreign-procurement-tax rep (52.229-11)", re: FOREIGN_TAX_REP_RE, enabled: NOOP_REP_ALLOWLIST_ENABLED },
];

/** Three-way importance of an ungrounded obligation (Brain card-301 #1). Ambiguous defaults to disqualifier.
 *  Exported for the allow-list regression suite (audit-gate-v2-allowlist.test.ts) — the offeror-rights / no-op-rep
 *  family (protest + debriefing + foreign-procurement-tax) must never silently narrow. */
export function importanceOf(ob: string): "disqualifier" | "boilerplate" | "ambiguous" {
  if (DISQUALIFIER_RE.test(ob)) return "disqualifier";
  if (BOILERPLATE_RE.test(ob)) return "boilerplate";
  // OFFEROR-RIGHTS / NO-OP-REP family — allow-list OUT only when the sentence carries NO eligibility-bar signal.
  // (Preserves the prior protest/debrief behavior exactly: each member still gates on its own flag + RE + !BAR_SIGNAL.)
  if (!BAR_SIGNAL_RE.test(ob) && NOOP_REP_FAMILY.some((m) => m.enabled && m.re.test(ob))) return "boilerplate";
  return "ambiguous";
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
