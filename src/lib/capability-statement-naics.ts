import { naicsTitle } from "@/lib/naics-titles";

// THE PRIMARY CODE IS A FACT ABOUT THE FIRM, NOT A DECORATION.
//
// A capability statement listed `NAICS · 332710, 336412, 336611` — a bare comma list
// that tells a contracting officer nothing they did not already have to look up. The
// convention is one line per code carrying the industry title, with the primary marked,
// because the primary is the code the firm's size standard is judged against.
//
// FIRST IS PRIMARY, and that is the record's own convention: the page has described the
// list as "primary + N secondary" since the surface was built, and the customer controls
// the order. Nothing here re-ranks them — inventing a different primary would change
// which size standard the document implies.
export interface NaicsLine {
  code: string;
  /** The regulation's title, or null when the code is not in 121.201. Never a guess. */
  title: string | null;
  primary: boolean;
}

export function naicsLines(codes: unknown): NaicsLine[] {
  if (!Array.isArray(codes)) return [];
  const seen = new Set<string>();
  const out: NaicsLine[] = [];
  for (const raw of codes) {
    const code = String(raw ?? "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, title: naicsTitle(code), primary: out.length === 0 });
  }
  return out;
}

/**
 * One line of text for surfaces that cannot lay out columns — the plain-text clipboard
 * flavour, and anywhere a single string is needed. An unknown code prints alone rather
 * than with a placeholder title.
 */
export function naicsLineText(line: NaicsLine): string {
  const head = line.title ? `${line.code}  ${line.title}` : line.code;
  return line.primary ? `${head} (primary)` : head;
}
