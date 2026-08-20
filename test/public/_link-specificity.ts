// THE DETECTOR — a bare-anchor colour rule that is not at zero specificity.
//
// A PLAIN MODULE, NOT A .test.ts, DELIBERATELY. This logic is imported by
// _opportunities-title-readability.test.ts as well as by the gate beside it, and importing a
// self-running suite EXECUTES it — including its process.exit(), which ends the importing gate
// before a single one of its own checks runs. That happened, silently, and the importing gate
// printed a green result belonging to the other file.
//
// THE TRAP THIS DETECTS. `opportunities.html:61` records it exactly: written plainly,
// `[data-theme="dark"] a { color: … }` is 0-1-1 and beats `.btn-open` at 0-1-0, repainting the
// primary button's label to 4.25:1 — on the one control the page exists to drive. It has been
// committed twice, once in the page and once by Design building the card 861 sheet.
//
// The first version banned the literal string. That is the wrong shape: the trap belongs to ANY
// page-wide rule colouring a bare anchor, and to ANY component that is an anchor — `.btn-open`
// and `.pc-link` today, whatever becomes one tomorrow. Naming one selector leaves the next open.

/** COMMENTS FIRST — a selector-shaped phrase inside a comment is prose. Two gates in this repo
 *  have already reported a defect that was only ever their own warning text. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** `a` as an element token: not `a.pc-title`, not `a#x`, not `a[href]`, not `abbr`. */
const bareAnchor = (s: string): boolean =>
  /(^|[\s>+~])a(?![\w.#[-])(?::[a-z-]+(\([^)]*\))?)*(\s|$|[>+~])/.test(s + " ");

export function unscopedAnchorColourRules(css: string): string[] {
  const out: string[] = [];
  for (const rule of stripComments(css).match(/[^{}]+\{[^{}]*\}/g) || []) {
    const i = rule.indexOf("{");
    const sel = rule.slice(0, i), body = rule.slice(i);
    if (!/(?:^|[;{])\s*color\s*:/.test(body)) continue;
    for (const one of sel.split(",")) {
      const s = one.trim().replace(/\s+/g, " ");
      if (!s || s.startsWith("@")) continue;
      if (!bareAnchor(s)) continue;
      if (/:where\([^()]*\ba\b[^()]*\)/.test(s)) continue;  // zero specificity — the fix
      out.push(s);
    }
  }
  return out;
}
