/* HTML entity decoding for syndicated feed text.
 *
 * Publisher RSS carries entity-encoded punctuation: Breaking Defense ships
 * `Hanwha&#8217;s parent firm` rather than a typographic apostrophe. The cards
 * are written with textContent, which is the right defence against markup
 * arriving in a headline and is also why an undecoded entity reaches the reader
 * verbatim — nothing downstream will ever turn `&#8217;` back into an
 * apostrophe. It has to be decoded here or not at all.
 *
 * A fixed table of named entities cannot be enough on its own. The numeric form
 * is open-ended — any code point may arrive as `&#NNNN;` or `&#xHHHH;` — so
 * those are decoded by VALUE, and only the named forms feeds actually use need
 * a lookup. That is the difference between covering the punctuation that shows
 * up and covering the six entities someone once saw.
 *
 * One pass, not a chain of .replace() calls. A chain re-scans its own output, so
 * `&amp;#8217;` — a publisher escaping an entity it means to display — would
 * collapse to an apostrophe inside a single call. Callers that genuinely need a
 * second pass, such as markup encoded inside a description, run this twice on
 * purpose rather than getting it as an accident of implementation.
 */

/** Named entities observed in the feeds this platform reads. An unknown name is
 *  left exactly as written: a literal `&foo;` in a headline is the publisher's
 *  text, and inventing a character for it would be a fabrication. */
const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g;

/** A code point is only substituted when it can safely become visible text.
 *  Surrogate halves and control characters are refused rather than emitted:
 *  a lone U+D800 corrupts the string it lands in, and a decoded U+0007 is an
 *  invisible character sitting inside a headline. Refusal returns null so the
 *  caller can leave the original entity on screen, which is at least legible. */
function codePointToText(cp: number): string | null {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return null;
  if (cp >= 0xd800 && cp <= 0xdfff) return null;
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return null;
  if (cp >= 0x7f && cp <= 0x9f) return null;
  // Kept identical to the named form so `&nbsp;` and `&#160;` cannot disagree.
  if (cp === 0xa0) return " ";
  return String.fromCodePoint(cp);
}

export function decodeEntities(s: string): string {
  return s.replace(ENTITY, (whole, dec?: string, hex?: string, name?: string) => {
    if (dec !== undefined || hex !== undefined) {
      const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex as string, 16);
      return codePointToText(cp) ?? whole;
    }
    const hit = NAMED[(name as string).toLowerCase()];
    return hit !== undefined ? hit : whole;
  });
}
