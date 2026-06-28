// ── DETERMINISTIC HIGH-SIGNAL GROUNDING SWEEP (Brain card 81, Step 1) ─────────────────────────────────
// The shared-miss root cause (graduation #38/#39): the LLM lenses skip the SAME discriminating clause —
// conservator quals grounded 0/23 (#4), the 60-day non-waivable FAT precondition grounded 0/36 (NO_BID).
// This pure, no-model pass GUARANTEES coverage of the failing archetypes by grounding them DIRECTLY from
// the source as typed findings, independent of lens behavior. The moat property holds: it grounds REAL
// clause text with a verbatim excerpt + citation; it asserts no verdict (deriveVerdict stays pure code).
//
// Archetypes (Brain-named): personnel-qualification gates (named role + quantified experience-years, OR a
// professional cert/license of performing personnel, OR QPL/QML, OR an "or-equal" burden), First-Article/
// FAT preconditions, and delivery-window-with-deadline clauses. Each finding is tagged `sweepArchetype` so
// Step 2 (the cross-clause temporal-conflict check) can consume the FAT + delivery clauses deterministically.
//
// PROVENANCE-SAFE: labeled human authoring notes / provenance banners (NOT-A-BINDING-TERM regions) are
// SKIPPED, so the sweep never grounds a demoted conclusion (the whole point of card 76-R1). Findings land as
// `bidder_controls` (do-the-work gates); elevation is left to the already-built caution-floor (#4) and the
// Step-2 temporal check (NO_BID) — the sweep grounds, it does not type-up.
import type { TypedFinding } from "./audit-findings";

const ROLE_RE = /\b(?:senior|lead|chief|principal|project|fine\s+art|architectural|registered)?\s*(?:conservator|architect|engineer|scientist|geologist|hydrologist|hygienist|surveyor|estimator|superintendent|inspector|specialist|technician|designer|planner|toxicologist|archaeologist|biologist|chemist)s?\b/i;
const YEARS_RE = /\b(?:\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|twenty[-\s]five|thirty)\b\s*(?:\(\s*\d{1,2}\s*\)\s*)?years?\b/i;
const EXP_CONTEXT_RE = /\b(?:experience|minimum|at least|no less than|not less than|shall have|must have|years of)\b/i;
const CERT_RE = /\b(?:professional engineer|registered architect|licensed (?:professional|architect|engineer|surveyor)|\bP\.?E\.?\b\s*licen|certified industrial hygienist|\bCIH\b|\bPMP\b|\bCISSP\b|state[-\s]licensed|professional (?:license|licensure|certification|registration|credential)|board[-\s]certified)\b/i;
const PERSONNEL_RE = /\b(?:personnel|staff|conservator|architect|engineer|key personnel|team member|specialist|technician|project director|on-site)\b/i;
const QPL_RE = /\b(?:QPL|QML)\b|qualified products? list|qualified manufacturers? list/i;
const OREQUAL_RE = /\bor[-\s]equal\b|salient characteristic|prove(?:n)? equivalen|approved equal|brand name or equal/i;
const EXCLUDE_RE = /\b(?:SAM registration|System for Award Management|active registration|responsib|52\.209-5|conflict of interest|debarr|suspend|set[-\s]aside|small business (?:pool|status|set)|equal opportunity|\bEEO\b|trafficking|bytedance|tiktok)\b/i;

const DURATION_RE = /\b(?:\d{1,3}|ten|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred)\b\s*(?:\(\s*\d{1,3}\s*\)\s*)?(?:calendar\s+|business\s+|working\s+)?days?\b/i;
const FAT_RE = /\bfirst[\s-]?article\b|\bfirst article test(?:ing)?\b|\bFAT\b/i;
const FAT_PRECOND_RE = /\b(?:non-?waivable|precondition|prior to (?:production|delivery|shipment)|before (?:any )?(?:production|delivery|shipment)|shall not (?:waive|authorize|approve|ship|deliver)|must (?:complete|elapse|be (?:completed|approved)))\b/i;
const ARO_RE = /\b(?:ARO|after receipt of (?:order|award)|after (?:the )?date of award|after award)\b/i;
const DELIVER_RE = /\b(?:deliver|delivery|shall furnish and deliver)\b/i;
const DELIVERY_WINDOW_RE = /\b(?:within|not later than|no later than|no more than)\b/i;

// Labeled human authoring notes / provenance banners — NEVER grounded (card 76-R1: the demoted conclusion
// and any "NOT A BINDING TERM" note must stay out of grounded findings).
const PROVENANCE_SKIP_RE = /\bHUMAN AUTHORING NOTE\b|\bNOT A BINDING TERM\b|NOT THE GOVERNMENT'?S (?:ACTUAL )?SOLICITATION|\bAUTHORING NOTE\b|\bPROVENANCE\b/i;

/** Nearest preceding UCF section letter for a source offset (best-effort; for the citation only). */
function nearestSection(source: string, idx: number): string | null {
  const head = source.slice(0, idx);
  const titleToLetter: Array<[RegExp, string]> = [
    [/SECTION\s+([A-M])\b/gi, "$1"],
    [/Supplies or Services/gi, "B"], [/Description\/Speci|Statement of Work|Requirements\b/gi, "C"],
    [/Deliveries or Performance|Period of Performance/gi, "F"], [/Special Contract Requirements/gi, "H"],
    [/Contract Clauses|Clauses Incorporated/gi, "I"], [/Instructions,?\s+Conditions|Instructions to Offerors/gi, "L"],
    [/Evaluation (?:Factors|and Basis)/gi, "M"],
  ];
  let best = -1, letter: string | null = null;
  for (const [re, lt] of titleToLetter) {
    let m: RegExpExecArray | null; re.lastIndex = 0;
    while ((m = re.exec(head))) { if (m.index > best) { best = m.index; letter = lt === "$1" ? m[1].toUpperCase() : lt; } }
  }
  return letter;
}

interface SweepHit { archetype: string; requirementLabel: string; kind: TypedFinding["kind"]; anchor: RegExp; }

/** Classify a binding paragraph against the high-signal archetypes (most-specific first). `anchor` is the
 *  discriminating token the excerpt window is centered on (so the duration / role-years is always captured,
 *  even in giant pdftotext paragraphs). Returns null if none. */
function classify(p: string): SweepHit | null {
  if (FAT_RE.test(p) && FAT_PRECOND_RE.test(p) && DURATION_RE.test(p))
    return { archetype: "fat_precondition", requirementLabel: "First Article Testing precondition (duration before any production delivery)", kind: "technical_spec", anchor: DURATION_RE };
  if (DELIVER_RE.test(p) && DELIVERY_WINDOW_RE.test(p) && DURATION_RE.test(p) && ARO_RE.test(p))
    return { archetype: "delivery_window", requirementLabel: "Production delivery window after receipt of order/award", kind: "technical_spec", anchor: DURATION_RE };
  if (ROLE_RE.test(p) && YEARS_RE.test(p) && EXP_CONTEXT_RE.test(p))
    return { archetype: "personnel_qual", requirementLabel: "Personnel-qualification gate: named role with a quantified minimum experience", kind: "submission", anchor: YEARS_RE };
  if (CERT_RE.test(p) && PERSONNEL_RE.test(p) && !EXCLUDE_RE.test(p))
    return { archetype: "personnel_qual", requirementLabel: "Personnel-qualification gate: specialized professional certification/license of performing personnel", kind: "submission", anchor: CERT_RE };
  if (QPL_RE.test(p)) return { archetype: "qpl", requirementLabel: "Qualified Products/Manufacturers List (QPL/QML) membership requirement", kind: "technical_spec", anchor: QPL_RE };
  if (OREQUAL_RE.test(p)) return { archetype: "or_equal", requirementLabel: "Brand-name-or-equal qualification burden (salient characteristics)", kind: "technical_spec", anchor: OREQUAL_RE };
  return null;
}

/** Verbatim excerpt window CENTERED on the discriminating token (±300 chars), so role+years / first-article+
 *  duration are co-located in the excerpt regardless of paragraph size. Stays a literal substring of source. */
function windowAround(para: string, anchor: RegExp): string {
  const a = para.search(anchor);
  if (a < 0) return para.length > 600 ? para.slice(0, 600) : para;
  return para.slice(Math.max(0, a - 300), Math.min(para.length, a + 300)).trim();
}

/** Deterministically ground high-signal archetypes from the source as typed findings (verbatim excerpts).
 *  Pure. Splits on blank lines into binding paragraphs, skips labeled provenance/authoring-note regions,
 *  dedups by (archetype + excerpt). controllability is always `bidder_controls` (the sweep grounds, it does
 *  not type-up — caution-floor + Step-2 temporal check elevate). */
export function highSignalSweep(source: string): TypedFinding[] {
  const out: TypedFinding[] = [];
  const seen = new Set<string>();
  const paraRe = /\n\s*\n/g;
  let start = 0, m: RegExpExecArray | null;
  const pushPara = (rawStart: number, rawEnd: number) => {
    const raw = source.slice(rawStart, rawEnd);
    const para = raw.trim();
    if (para.length < 12 || PROVENANCE_SKIP_RE.test(para)) return;        // skip empty + labeled provenance/authoring notes
    const hit = classify(para);
    if (!hit) return;
    const excerpt = windowAround(para, hit.anchor);                       // verbatim window centered on the signal
    const key = hit.archetype + "|" + excerpt.slice(0, 80).toLowerCase();
    if (seen.has(key)) return; seen.add(key);
    const letter = nearestSection(source, rawStart);
    out.push({
      requirement: `${hit.requirementLabel} (grounded by deterministic high-signal sweep).`,
      citation: letter ? `§${letter} (grounding sweep)` : "(grounding sweep)",
      excerpt, kind: hit.kind, controllability: "bidder_controls", grounded: true,
      lens: "deterministic_sweep", sweepArchetype: hit.archetype,
    });
  };
  while ((m = paraRe.exec(source))) { pushPara(start, m.index); start = m.index + m[0].length; }
  pushPara(start, source.length);
  return out;
}
