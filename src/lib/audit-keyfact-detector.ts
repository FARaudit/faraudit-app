// ── KEY-FACT DETECTOR (Brain card 215 Fork B) ────────────────────────────────────────────────────────
// Surfaces three high-value facts the substantive lenses systematically under-cover on SF-1449/Part-12 buys
// (found by the card-214 run-quality panel, missed on the SP3300 smoke): the QUOTE DEADLINE, the DELIVERY
// schedule / PoP, and the NON-MANUFACTURER RULE (FAR 52.219-33). Deterministic, source-grounded (Rule-64:
// every excerpt is a VERBATIM span of the source), dedup vs any lens finding that already covers the fact.
//
// TYPINGS (Brain-ruled, card 215 Fork B):
//   • deadline  → kind "submission", bidder_controls, NO requiredAttribute/cautionFloor → coverage/context ONLY,
//                 verdict-INERT. (Expired-deadline logic is OUT OF SCOPE this card — a stored doc may be stale
//                 vs. amendments; needs its own doctrine session. Do NOT infer expiry.)
//   • delivery  → kind "technical_spec", bidder_controls, inert → a performance/responsibility obligation, NOT
//                 an eligibility gate. verdict-INERT.
//   • NMR       → kind "eligibility_bar" + requiredAttribute "nonmanufacturer:compliant" + bidder_controls
//                 (→ disposeFinding gate_to_clear, NEVER a show-stopper). On a committal under a null/unverified
//                 profile it rides the EXISTING card-206-A unverified-gate path → eligible=null + verify-caution;
//                 it can NEVER flip eligible to false (not disqualifying) and never alters a sibling (e.g. WOSB)
//                 caution — it only ADDS itself to the unverified-gate list. Caution wording is PATH-AWARE and
//                 attribution-verified against the primary source (13 CFR 121.406 / FAR 52.219-33 — see
//                 scripts/audit-ai/gold-sets/NMR-52.219-33-PRIMARY-SOURCE.md, Rule-64 freeze).
//
// Ships behind ONE default-OFF flag AUDIT_KEYFACT_DETECTOR (=== "true"); OFF ⇒ findings byte-identical.

import type { TypedFinding } from "./audit-findings";
import type { ProcurementPart } from "./audit-tools";
import { isEnvOn } from "./env-flags";

// ROOT-5 FORM-KEYED CITATION (Brain card #474 ruling #2, flag AUDIT_FORM_KEYED_CITATION, default-OFF). The quote-
// deadline finding hardcoded citation "SF-1449 Block 8" REGARDLESS of the detected form. On the FA8137 SF-1442
// construction buy (run 8f56ecc4) that stamped a form that does NOT exist in the package onto a finding — a fabricated
// citation the /panel red-team caught (AUTO-F class). Fix: key the form token to the SAME section-boundary classifier
// the rest of the engine uses (procurementPart). INVARIANT (zero-tolerance): no form-name may appear in the citation
// unless it IS the detected form — commercial→"SF-1449 Block 8" (correct), construction→"SF-1442" (no wrong block #),
// UCF/unknown→form-NEUTRAL (no form-name asserted). Flag-OFF ⇒ the legacy hardcoded string (byte-identical).
const formKeyedCitationEnabled = () => isEnvOn(process.env.AUDIT_FORM_KEYED_CITATION);
export function deadlineCitation(part: ProcurementPart | undefined): string {
  if (!formKeyedCitationEnabled()) return "SF-1449 Block 8 / Notice to Offerors (closing date)"; // legacy → byte-identical
  if (part === "part12-commercial") return "SF-1449 Block 8 / Notice to Offerors (closing date)"; // SF-1449 IS the commercial cover form
  if (part === "part36-construction") return "SF-1442 / Notice to Offerors (closing date)";       // construction cover form (no SF-1449 Block-N)
  return "Notice to Offerors (closing date)";                                                     // part15-ucf / unknown → form-neutral, never a form-name
}

// Ratified caution string (primary-source-verified; the 500-employee ceiling + waivers are sourced to
// 13 CFR 121.406, NOT the 52.219-33 clause text — see NMR-52.219-33-PRIMARY-SOURCE.md). PATH-AWARE: the
// 500 ceiling applies ONLY on the nonmanufacturer/reseller path and does NOT replace the solicitation's
// stated NAICS size standard for a manufacturer offeror. Conditional — never asserts the firm IS ineligible.
export const NMR_CAUTION =
  "Non-Manufacturer Rule (FAR 52.219-33): if supplying another manufacturer's product (nonmanufacturer), the offeror must not exceed 500 employees (SBA nonmanufacturer size standard, 13 CFR 121.406(b)) and must supply the end item of a small U.S. manufacturer, unless SBA grants a class or individual waiver.";

// ── DEADLINE DATE-FORMAT GRAMMAR (Brain card 219 — versioned FROZEN constant, Fork-A guard-set discipline) ──
// Widens quote-deadline recognition beyond inline MM/DD/YYYY to the formats real SF-1449s use (DLA Block-8 grids
// write "DD Mon YYYY … LOCAL TIME"). Additions bump the version (supersede), NEVER silently append. Quote-deadline
// ONLY: a LABEL anchor + a FULL date (day+month+year) are both required, so clause effective-dates ("(Sep 2021)",
// month+year only) and delivery dates (no deadline label) can never surface here (negative-tested, card 219).
export const DEADLINE_FORMATS = {
  version: 1,
  mdy: String.raw`\d{1,2}\/\d{1,2}\/\d{2,4}`,                                                                                        // 6/29/2026
  dMonY: String.raw`\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}`,                            // 10 Jul 2026
  monthDY: String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}`, // July 10, 2026
  // SPECIFIC submission-deadline labels only — NOT loose "response … due" bridges (those matched a Q&A
  // "Question Response Due Date" or "Offeror … due" prose → wrong date; code-review card 219).
  label: String.raw`closing response date|(?:offer|quote|proposal|response)s?\s+due\s+date|(?:offer|quote|proposal|response)s?\s+(?:are\s+|is\s+|must\s+be\s+)?due\s+(?:by|on|not?\s+later\s+than)|due date\/?\s*(?:local\s*)?time`,
} as const;
const DEADLINE_DATE = `(?:${DEADLINE_FORMATS.mdy}|${DEADLINE_FORMATS.dMonY}|${DEADLINE_FORMATS.monthDY})`;
// SF-1449 form-field labels the GRID fallback anchors on (the actual submission-deadline block).
const GRID_DEADLINE_LABEL = /closing response date|offer due date|due date\/?\s*(?:local\s*)?time/i;
// A date is NOT the quote deadline if one of these date-bearing contexts sits between the label and the date
// (delivery/clause-effective/issue/Q&A/amendment/award dates decouple from the offer-due-date label).
const COMPETING_DATE_CTX = /deliver|effective|issue|question|amendment|rated|performance|signature|award|option year/i;

/** First verbatim span of `src` matching `re`. Starts at the enclosing line and, ONLY if the matched line
 *  ends mid-sentence (PDF soft-wrap), extends across the immediate continuation to the sentence end — bounded
 *  so it never runs into the next numbered item, a blank line, or an all-caps header. Rule-64: the returned
 *  string is copied EXACTLY from the source (may include a soft-wrap newline → still a raw substring, so
 *  `src.includes(excerpt)` holds). Never grabs a leading list-number period ("4.") as the sentence end. */
function spanAt(src: string, i: number, mlen: number, maxLen = 260): string {
  const start = src.lastIndexOf("\n", i) + 1;                 // enclosing line start
  let end = i + mlen;                                         // end of the matched physical line
  const cont = src.slice(end, Math.min(src.length, start + maxLen)); // soft-wrap continuation window
  const stop = cont.search(/\n\s*\n|\n\s*\(?\d{1,2}[.)]|\n\s*[A-Z]{3,}/); // next item / blank line / caps header
  const window = stop >= 0 ? cont.slice(0, stop) : cont;
  const sentRel = window.search(/[.!?](?:\s|$)/);             // sentence end within the continuation only
  if (sentRel >= 0) end += sentRel + 1;
  return src.slice(start, end).replace(/\s+$/, "").trim();
}

/** First verbatim span of `src` matching `re`, extended to the enclosing sentence (soft-wrap safe). Rule-64:
 *  copied EXACTLY from the source so `src.includes(excerpt)` holds. Never grabs a leading list-number period. */
function verbatimSpan(src: string, re: RegExp, maxLen = 260): string | null {
  const m = src.match(re);
  if (!m) return null;
  return spanAt(src, src.indexOf(m[0]), m[0].length, maxLen) || m[0].trim();
}

export function applyKeyfactDetector(
  findings: TypedFinding[],
  fullSource: string | undefined,
  opts?: { enabled?: boolean; procurementPart?: ProcurementPart },
): TypedFinding[] {
  if (!opts?.enabled) return findings;                        // default-OFF ⇒ byte-identical
  const src = fullSource || "";
  if (!src) return findings;
  const covers = (re: RegExp) => findings.some((f) => re.test(`${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""} ${f.citation ?? ""}`));
  const add: TypedFinding[] = [];

  // NMR applicability (Brain card-132 doctrine, sourced from the DOCUMENT since SAM naics/setAside may be null):
  // the Non-Manufacturer Rule only governs a SMALL-BUSINESS SET-ASIDE for a SUPPLY/MANUFACTURING buy. Gate the
  // eligibility_bar on BOTH signals present in the source — otherwise an incidentally-incorporated 52.219-33 in a
  // full-clause matrix (services / full-and-open) would falsely downgrade eligible to null (code-review card 215).
  const setAsideCtx = /\bset-?aside\b|women-?owned|\bWOSB\b|\bEDWOSB\b|service-disabled|\bSDVOSB\b|\bHUBZone\b|8\(a\)|small business (?:set-?aside|concern)/i.test(src);
  // T1-9 — supplyCtx must key on GENUINE supply LANGUAGE, not the clause's own
  // name. The old regex matched "nonmanufacturer"/"non-manufacturer" — a token
  // satisfied by the TITLE of clause 52.219-33 itself ("Nonmanufacturer Rule") —
  // so a SERVICES set-aside that merely lists 52.219-33 in a clause matrix fired
  // supplyCtx circularly and produced a FALSE NMR eligibility bar. Replace that
  // circular signal with real supply descriptors: a manufacturing/wholesale/retail
  // NAICS (31-33/42/44-45), a "schedule of supplies", the NMR-statutory "end
  // item/end product" a nonmanufacturer supplies, an explicit "supply acquisition",
  // or "manufactured". A services clause-matrix carries none of these; a genuine
  // supply buy carries at least one.
  const supplyCtx = /NAICS\D{0,12}(?:3[1-3]\d{3}|42\d{3}|4[45]\d{3})|schedule of supplies|supply acquisition|\bend items?\b|\bend products?\b|\bmanufactured\b/i.test(src);

  // 1) QUOTE DEADLINE — submission, verdict-inert. A deadline LABEL + a DATE on the same physical line (SF-1449
  //    Block-8 grids interleave the date with form fields on one line). The label anchor + full-date requirement
  //    exclude clause effective-dates ("(Sep 2021)") and delivery dates — NEVER surfaced as a quote deadline
  //    (Brain card 219, negative-tested). Date grammar = versioned frozen constant (DEADLINE_FORMATS).
  if (!covers(/closing response date|offer due date|(?:quote|offer|response)[^.\n]{0,20}(?:due date|deadline|due by|due no later)/i)) {
    // (i) label + date on the SAME physical line ("Closing Response Date: 6/29/2026 …"). Skip a Q&A
    //     "Question Response Due Date" line — it's the questions deadline, not the quote deadline (code-review).
    let span: string | null = null;
    const lineRe = new RegExp(`[^\\n]*(?:${DEADLINE_FORMATS.label})[^\\n]*\\b${DEADLINE_DATE}\\b[^\\n]*`, "gi");
    for (const mm of src.matchAll(lineRe)) {
      if (/question/i.test(mm[0])) continue;
      span = spanAt(src, mm.index ?? 0, mm[0].length); break;
    }
    // (ii) SF-1449 Block-8 GRID: the label and the date land on SEPARATE grid lines (pdftotext -layout scatters
    //      them). Anchor ONLY on the SF-1449 submission-deadline form field, take the nearest full date within a
    //      bounded window, and REJECT it if a competing date-context (delivery/effective/issue/Q&A/award) sits
    //      between — a wrong deadline is worse than a missed one (a miss → verify-run-quality flags human review).
    if (!span) {
      const lm = src.match(GRID_DEADLINE_LABEL);
      if (lm) {
        const li = src.indexOf(lm[0]);
        const win = src.slice(li, li + 350);
        const dm = win.match(new RegExp(`\\b${DEADLINE_DATE}\\b`, "i"));
        if (dm && !COMPETING_DATE_CTX.test(win.slice(0, dm.index ?? 0)))
          span = dm[0].trim();          // clean date token (grid rows are noisy) — verbatim, so still grounded
      }
    }
    if (span) add.push({
      requirement: "Quote submission deadline — submit the quote by the stated closing date/time (see excerpt) or it risks non-consideration.",
      citation: deadlineCitation(opts?.procurementPart),   // ROOT-5: form-keyed, never a hardcoded SF-1449 on a non-1449 buy
      excerpt: span, kind: "submission", controllability: "bidder_controls", grounded: true, lens: "keyfact_detector",
    });
  }

  // 2) DELIVERY SCHEDULE / PoP — technical_spec (performance), verdict-inert.
  if (!covers(/delivery schedule|days aro|period of performance/i)) {
    const span = verbatimSpan(src, /Delivery Schedule:[^\n]*|[^\n]*\b\d+\s*days?\s*ARO\b[^\n]*|Period of Performance[^\n]*/i);
    if (span) add.push({
      requirement: "Delivery / performance schedule — the offeror must be able to perform within the stated timeline (see excerpt).",
      citation: "Notice to Offerors (delivery schedule)",
      excerpt: span, kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "keyfact_detector",
    });
  }

  // 3) NON-MANUFACTURER RULE (FAR 52.219-33) — eligibility_bar + requiredAttribute, bidder_controls (gate_to_clear).
  //    Rides the card-206-A unverified-gate path: committal + null profile → eligible=null + verify-caution; can
  //    NEVER be a show-stopper (bidder_controls) and NEVER flips eligible to false.
  // T0-9 (engine line-audit 2026-07-06) — dedup the NMR bar against an existing NMR ELIGIBILITY finding ONLY, not
  // against ANY finding that merely QUOTES the clause. The coarse covers(/non-manufacturer|52.219-33/) matched a
  // clause-matrix / submission finding that incidentally cites 52.219-33 and SILENTLY SUPPRESSED the SOLE NMR
  // eligibility emitter (a dropped eligibility bar → a false-eligible path). Only an existing eligibility_bar about
  // NMR legitimately stands in for it.
  const NMR_RE = /non-?manufacturer|52\.219-33/i;
  const nmrBarAlreadyEmitted = findings.some((f) => f.kind === "eligibility_bar" && NMR_RE.test(`${f.requirement} ${f.excerpt ?? ""} ${f.requiredAttribute ?? ""} ${f.citation ?? ""}`));
  if (setAsideCtx && supplyCtx && !nmrBarAlreadyEmitted) {
    const span = verbatimSpan(src, /[^\n]*(?:non-?manufacturer rule|52\.219-33)[^\n]*/i);
    // NMR-CITATION-HONESTY (flag AUDIT_NMR_CITATION_HONESTY, panel gate-4 AUTO-F on 150c3ab3 — ROOT-5 analog):
    // "(source clause list)" is a DOCUMENT-presence claim, so it may only be asserted when the literal clause
    // number is confirmed in the source by deterministic substring (Rule 64; dash-variant tolerant — the panel
    // verified zero occurrences under any dash variant). NMR prose grounded in another regulation's clause text
    // (150c3ab3: VAAR 852.219-73(d)) cites the regulatory basis + the excerpt, never a clause the package lacks.
    const nmrLiteralInSource = /52\.219[-‑–—]33/.test(src);
    const honestCitation = isEnvOn(process.env.AUDIT_NMR_CITATION_HONESTY) && !nmrLiteralInSource;
    if (span) add.push({
      requirement: NMR_CAUTION,
      citation: honestCitation
        ? "Nonmanufacturer rule referenced in solicitation text (see excerpt) · 13 CFR 121.406(b)"
        : "FAR 52.219-33 (source clause list) · 13 CFR 121.406(b)",
      excerpt: span, kind: "eligibility_bar", controllability: "bidder_controls",
      requiredAttribute: "nonmanufacturer:compliant", curableInWindow: true, grounded: true, lens: "keyfact_detector",
    });
  }

  return add.length ? [...findings, ...add] : findings;
}
