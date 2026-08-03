// EXECUTABLE FORM OF RULES 5, 6, 7, 8 AND THE FORBIDDEN-VOCABULARY HALF OF RULE 54.
//
// Five rules, one mechanism. Each says "never write X in anything a customer reads", and until now each was
// enforced by remembering it. The triage (ceo/RULES-TRIAGE-2026-08-03.md) binned them together for exactly
// that reason: one sweep closes all five.
//
// WHAT THIS IS NOT. Rule 54's other half — "at least two of the four pillars must be visible" — is NOT here
// and cannot be. Judging whether a piece argues the platform positioning is a reading task, and a checker that
// pretended to do it would return a confident number about something it never measured. Advisory stays
// advisory; see the triage for the split.
//
// THE FALSE-POSITIVE PROBLEM, FOUND BEFORE THE CODE WAS WRITTEN. A naive substring sweep over external copy
// reports four violations today, and all four are innocent:
//     content/newsletter-4-staged/draft.md:121  - [x] No reference to "SaaS" (use "operating system")
//     content/newsletter-4-staged/draft.md:122  - [x] No reference to "AI-powered" or "AI-based"
//     content/newsletter-4-staged/metadata.json:32   "no_saas_term": true,
// Those are a draft's own COMPLIANCE CHECKLIST asserting it followed the rule. A gate that fails on a
// checklist for naming the thing it avoided is a gate that gets deleted in a week — the same failure mode as
// the security scan whose Anthropic pattern matched its own detector module. So two exemptions, both narrow:
//   · NON-PROSE LINES — a markdown checklist item or a JSON key/flag line is metadata, not copy.
//   · NEGATED USE — "no reference to SaaS", "we are not an AI tool". Rule 54 explicitly lists
//     "not a parser / not a checker / not a tool" as APPROVED vocabulary, so a negation exemption is not a
//     convenience here, it is required by the rule itself. Flagging "not a parser" would have this gate
//     contradicting the doctrine it enforces.
//
// Scope is EXTERNAL SURFACES ONLY — what a visitor or reader receives. `ceo/` is deliberately out of scope:
// it is local-only doctrine that must be free to quote every forbidden term in order to forbid it.

export interface VocabViolation {
  file: string;
  line: number;
  term: string;
  rule: 5 | 6 | 7 | 8 | 54;
  text: string;
}

export interface VocabTerm {
  rule: 5 | 6 | 7 | 8 | 54;
  /** Human label for the report. */
  label: string;
  re: RegExp;
  /** What to write instead — printed with the violation so the fix is obvious. */
  instead: string;
}

/** Word-boundary phrase, case-insensitive, tolerant of the hyphen/space/en-dash variants copy actually uses. */
const phrase = (s: string) => new RegExp(`\\b${s.replace(/[-\s]/g, "[-\\s‐-―]?")}\\b`, "gi");

export const FORBIDDEN: VocabTerm[] = [
  { rule: 5, label: "SaaS", re: /\bSaaS\b/g, instead: 'use "AaaS" or "operating system"' },
  { rule: 6, label: "AI-powered", re: phrase("AI powered"), instead: "describe what it does, not that it is AI" },
  { rule: 6, label: "AI-based", re: phrase("AI based"), instead: "describe what it does, not that it is AI" },
  { rule: 7, label: "combined valuation", re: phrase("combined valuation"), instead: "each platform is valued independently" },
  { rule: 54, label: "AI tool", re: phrase("AI tool"), instead: 'use "operating system"' },
  { rule: 54, label: "AI platform", re: phrase("AI platform"), instead: 'use "operating system"' },
  { rule: 54, label: "solicitation analysis software", re: phrase("solicitation analysis software"), instead: '"the operating system for defense BD"' },
  { rule: 54, label: "per-audit pricing", re: phrase("per audit pricing"), instead: '"platform subscription"' },
  { rule: 54, label: "cheaper than Deltek/GovWin", re: /\bcheaper\s+than\s+(Deltek|GovWin)\b/gi, instead: "different category — do not price-compare" },
];

/** Rule 8: the legal name is `Jose Antonio Rodriguez Jr` with NO period after Jr. Only the wrong forms are
 *  matched, so the correct spelling never reports. */
export const LEGAL_NAME_WRONG = /\bJose\s+Antonio\s+Rodriguez\s+Jr\./g;

/** Rule 54: parser / checker / scanner used as a STANDALONE DESCRIPTOR of the product. Requires a determiner
 *  immediately before the noun so ordinary technical use ("the PDF parser", "a checker function") does not
 *  trip it — and the negation exemption below keeps the APPROVED "not a parser" phrasing green. */
export const STANDALONE_DESCRIPTOR = /\b(?:is|it's|its|as)\s+(?:just\s+|only\s+|merely\s+)?an?\s+(parser|checker|scanner)\b/gi;

/** A line that carries metadata rather than copy: a markdown checklist item, or a JSON key line. */
function isNonProseLine(line: string): boolean {
  if (/^\s*[-*]\s*\[[ xX]\]/.test(line)) return true;          // - [x] checklist item
  if (/^\s*"[^"]+"\s*:/.test(line)) return true;                // "key": value
  if (/^\s*[-*]?\s*\w+\s*[:=]\s*(true|false|\d+)\s*,?\s*$/.test(line)) return true; // flag: true
  return false;
}

/** True when the match is NEGATED — "no reference to SaaS", "we are not an AI tool", "never say parser".
 *  Rule 54 lists "not a parser / not a checker / not a tool" as APPROVED vocabulary, so this exemption is
 *  required by the doctrine, not a convenience. Window is the 44 chars before the match: long enough for
 *  "No reference to", short enough not to swallow an unrelated earlier clause. */
const NEGATION = /\b(?:no|not|never|non|avoid|avoids|without|isn't|aren't|don't|doesn't|instead\s+of|rather\s+than|drop|remove|forbidden|banned|prohibited)\b[^.!?]{0,44}$/i;

function isNegated(line: string, at: number): boolean {
  return NEGATION.test(line.slice(Math.max(0, at - 44), at));
}

export interface ScanFile { path: string; content: string }

/** Scan external-facing copy. Returns every forbidden use, with the innocent cases already excluded. */
export function scanExternalVocabulary(files: ScanFile[]): VocabViolation[] {
  const out: VocabViolation[] = [];
  for (const f of files) {
    const lines = f.content.split("\n");
    lines.forEach((line, i) => {
      if (isNonProseLine(line)) return;

      for (const t of FORBIDDEN) {
        for (const m of line.matchAll(new RegExp(t.re.source, t.re.flags))) {
          if (isNegated(line, m.index as number)) continue;
          out.push({ file: f.path, line: i + 1, term: t.label, rule: t.rule, text: `${t.label} — ${t.instead}` });
        }
      }
      for (const m of line.matchAll(new RegExp(LEGAL_NAME_WRONG.source, LEGAL_NAME_WRONG.flags))) {
        out.push({ file: f.path, line: i + 1, term: "legal name", rule: 8, text: "legal name carries a period after Jr — it must not" });
      }
      for (const m of line.matchAll(new RegExp(STANDALONE_DESCRIPTOR.source, STANDALONE_DESCRIPTOR.flags))) {
        if (isNegated(line, m.index as number)) continue;
        out.push({ file: f.path, line: i + 1, term: m[1], rule: 54, text: `"${m[1]}" used as a standalone descriptor — the product is an operating system` });
      }
    });
  }
  return out;
}
