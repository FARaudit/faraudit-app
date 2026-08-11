// Scores a news story against the codes on the customer's capability statement.
//
// The vocabulary is DERIVED, not authored. Every distinctive term comes from the
// official 13 CFR 121.201 title of the code itself, and its weight is the inverse
// of how many of the 978 NAICS titles use that word. "aircraft" appears in a
// handful of titles and is worth ~0.7; "manufacturing" appears in hundreds and is
// worth ~0.2, below the floor, so it never carries a match on its own. Nobody
// hand-picks which words mean which industry — the regulation's own title corpus
// decides, so a code we have never thought about is scored the same way as one we
// have.
//
// A match is reported with the terms that produced it. A reader who disagrees can
// see the reason rather than a number.

import { NAICS_TITLES, naicsTitle } from "@/lib/naics-titles";

/** A word must be this rare across NAICS titles to count as distinctive.
 *  0.55 ≈ present in no more than ~22 of the 978 titles. */
const TERM_WEIGHT_FLOOR = 0.55;

/** A story must reach this to be called a match. One distinctive term clears it;
 *  a pile of generic ones never does, because generic ones weigh nothing. */
export const MATCH_FLOOR = 0.6;

/** A term in the headline is a stronger signal than the same term buried in the
 *  summary — the headline is what the story is ABOUT. */
const HEADLINE_MULTIPLIER = 1.6;

/** The customer's own six digits, printed literally in the story ("NAICS 336412").
 *  Rare, and unambiguous when it happens. */
const LITERAL_CODE_SCORE = 3;

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]{4,}/g) || []);
}

// ── Term specificity, computed once from the title corpus ──
const TITLE_LIST = Object.values(NAICS_TITLES);
const CORPUS_SIZE = TITLE_LIST.length;
const DOC_FREQ = new Map<string, number>();
for (const title of TITLE_LIST) {
  for (const tok of new Set(tokens(title))) {
    DOC_FREQ.set(tok, (DOC_FREQ.get(tok) ?? 0) + 1);
  }
}
const LOG_CORPUS = Math.log(CORPUS_SIZE);

/** 1.0 for a word used by exactly one NAICS title, falling toward 0 as more
 *  titles share it. A word the corpus has never seen scores 1.0 — it cannot be
 *  generic if the regulation does not use it. */
export function termWeight(term: string): number {
  const df = DOC_FREQ.get(term) ?? 1;
  return Math.log(CORPUS_SIZE / df) / LOG_CORPUS;
}

/** The distinctive words of one code's official title, strongest first. Empty for
 *  a code with no title on file — that code can then only match literally. */
export function distinctiveTerms(code: string): string[] {
  const title = naicsTitle(code);
  if (!title) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of tokens(title)) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (termWeight(tok) >= TERM_WEIGHT_FLOOR) out.push(tok);
  }
  return out.sort((a, b) => termWeight(b) - termWeight(a));
}

export interface CodeMatch {
  code: string;
  /** Null when the code is not in 13 CFR 121.201 — the surface then prints the
   *  bare code rather than inventing an industry for it. */
  title: string | null;
  /** The words that actually fired, so the badge can justify itself. */
  terms: string[];
  score: number;
}

export interface NaicsRelevance {
  score: number;
  matches: CodeMatch[];
}

/** Whole-word test. Built from a RAW string every time: a term routed through
 *  JSON.stringify loses its `\b` to an ordinary "b" and then matches inside other
 *  words, which is how "cui" once matched inside "circuit". */
function containsWord(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + escaped + "\\b", "i").test(haystack);
}

/**
 * Score one story against one customer's code list.
 *
 * Returns a zero score and no matches when the customer has no codes on file —
 * that is a profile the customer can fill in, and it must not be dressed up as a
 * story that failed to match.
 */
export function scoreArticle(
  headline: string,
  summary: string,
  codes: string[]
): NaicsRelevance {
  if (!codes.length) return { score: 0, matches: [] };
  const head = headline || "";
  const body = (headline || "") + " " + (summary || "");

  const matches: CodeMatch[] = [];
  for (const raw of codes) {
    const code = String(raw).trim();
    if (!code) continue;

    let codeScore = 0;
    const hits: string[] = [];

    if (/^\d{2,6}$/.test(code) && containsWord(body, code)) {
      codeScore += LITERAL_CODE_SCORE;
      hits.push(code);
    }
    for (const term of distinctiveTerms(code)) {
      if (!containsWord(body, term)) continue;
      const w = termWeight(term);
      codeScore += containsWord(head, term) ? w * HEADLINE_MULTIPLIER : w;
      hits.push(term);
    }

    if (codeScore >= MATCH_FLOOR) {
      matches.push({
        code,
        title: naicsTitle(code),
        terms: hits,
        score: Math.round(codeScore * 100) / 100
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  // The story's score is its BEST code, not the sum. Two codes that happen to
  // share the word "aircraft" describe one story about aircraft, not two.
  return {
    score: matches.length ? matches[0].score : 0,
    matches
  };
}

/**
 * A stable identity for one code list, used to key the per-story insight cache.
 * Order-insensitive and duplicate-insensitive, because ["332710","336412"] and
 * ["336412","332710","336412"] are the same desk and must not generate — or
 * worse, swap — two different insights.
 *
 * The empty string is the no-codes scope. Its cached insights are the generic
 * ones and are safe to share; every other scope's are not.
 */
export function scopeKey(codes: string[]): string {
  const clean = Array.from(new Set(codes.map((c) => String(c).trim()).filter(Boolean))).sort();
  return clean.join(",");
}

/** The line handed to Claude describing whose desk this is. Built only from codes
 *  on file and their regulation titles — it invents no revenue band, no
 *  certifications and no company size, all of which were previously asserted
 *  about every customer alike. */
export function deskDescription(codes: string[]): string | null {
  const named = codes
    .map((c) => String(c).trim())
    .filter(Boolean)
    .map((c) => {
      const t = naicsTitle(c);
      return t ? `${c} (${t})` : c;
    });
  if (!named.length) return null;
  return named.join("; ");
}
