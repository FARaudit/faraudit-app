// Gate for HTML entity decoding in the SAM notice text.
//
// Two defects prompted this, and they are different in kind:
//
//   1. VISIBLE — only five named entities were decoded, so SAM's own text shipped
//      to the customer as "N00164-26-Q-0259 &ndash; FAIRING CLEARBORE". Ugly, and
//      obviously broken to anyone reading it.
//
//   2. SILENT — the decoder was a CHAIN of .replace() calls with `&amp;` first,
//      so `&amp;lt;` became `&lt;` and then `<`. Text the government escaped on
//      purpose came out as markup, and nothing on screen said so. This is the one
//      worth a gate: it cannot be spotted by looking at the page.
//
// The engine reads this same function at audit time, so a wrong decode does not
// just look bad — it changes what the analysis is given.
//
// Run: npx tsx src/lib/sam-description-entities.test.ts

import { decodeHtmlEntities, stripHtmlToText } from "./sam-description";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    failures++;
    console.log(`  FAIL ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("[live] the exact strings SAM sent, from the Opportunities panel");
check(
  "the en-dash that shipped raw to the customer",
  decodeHtmlEntities("N00164-26-Q-0259 &ndash; FAIRING CLEARBORE QTY.24"),
  "N00164-26-Q-0259 – FAIRING CLEARBORE QTY.24"
);
check(
  "RESPONSE DATE line",
  decodeHtmlEntities("DATE 06 AUG 2026 &ndash; 3:00 PM Eastern Time"),
  "DATE 06 AUG 2026 – 3:00 PM Eastern Time"
);

console.log("\n[named] the entities federal notices actually use");
check("mdash", decodeHtmlEntities("scope &mdash; see SOW"), "scope — see SOW");
check("rsquo", decodeHtmlEntities("Offeror&rsquo;s proposal"), "Offeror’s proposal");
check("ldquo/rdquo", decodeHtmlEntities("&ldquo;best value&rdquo;"), "“best value”");
check("hellip", decodeHtmlEntities("and so on&hellip;"), "and so on…");
check("deg", decodeHtmlEntities("70&deg;F"), "70°F");
check("frac12", decodeHtmlEntities("2&frac12; inches"), "2½ inches");
check("bull", decodeHtmlEntities("&bull; item"), "• item");
check("trade/reg/copy", decodeHtmlEntities("A&trade; B&reg; C&copy;"), "A™ B® C©");
check("le/ge", decodeHtmlEntities("&le;5 and &ge;2"), "≤5 and ≥2");
check("sect", decodeHtmlEntities("&sect;52.212-1"), "§52.212-1");
check("uppercase name is tolerated", decodeHtmlEntities("a &NDASH; b"), "a – b");

console.log("\n[numeric] decimal and hex");
check("decimal", decodeHtmlEntities("&#8211;"), "–");
check("padded apostrophe", decodeHtmlEntities("Offeror&#039;s"), "Offeror's");
check("hex lower", decodeHtmlEntities("&#x2013;"), "–");
check("hex upper X", decodeHtmlEntities("&#X2014;"), "—");
check("astral codepoint does not break", decodeHtmlEntities("&#128512;"), "\u{1F600}");

console.log("\n[SILENT BUG] a single pass — a decoded result is never re-read");
// The regression: chained replaces turn an escaped literal into markup.
check("escaped &lt; stays escaped text", decodeHtmlEntities("&amp;lt;"), "&lt;");
check("escaped &amp; stays text", decodeHtmlEntities("&amp;amp;"), "&amp;");
check("escaped &ndash; stays text", decodeHtmlEntities("&amp;ndash;"), "&ndash;");
check("A&amp;B is one ampersand", decodeHtmlEntities("A&amp;B"), "A&B");
check(
  "a real tag written as an escaped literal is NOT revived",
  decodeHtmlEntities("&amp;lt;script&amp;gt;"),
  "&lt;script&gt;"
);

console.log("\n[unknown] anything unrecognised is left VISIBLE, never guessed");
check("unknown named entity is untouched", decodeHtmlEntities("&notarealentity;"), "&notarealentity;");
check("bare ampersand is untouched", decodeHtmlEntities("Smith & Wesson"), "Smith & Wesson");
check("unterminated entity is untouched", decodeHtmlEntities("&ndash no semicolon"), "&ndash no semicolon");
check("empty numeric is untouched", decodeHtmlEntities("&#;"), "&#;");
check("out-of-range codepoint is untouched", decodeHtmlEntities("&#1114112;"), "&#1114112;");
check("lone surrogate is untouched", decodeHtmlEntities("&#xD800;"), "&#xD800;");
check("empty string", decodeHtmlEntities(""), "");

console.log("\n[end to end] stripHtmlToText, as the panel and the engine call it");
check(
  "tags out, entities decoded, whitespace collapsed",
  stripHtmlToText("<p>N00164 &ndash; FAIRING</p><p>Qty&nbsp;24 &amp; spares</p>"),
  "N00164 – FAIRING Qty 24 & spares"
);
check(
  "an escaped literal survives the whole pipeline as text",
  stripHtmlToText("<p>use &amp;lt;tag&amp;gt; in the form</p>"),
  "use &lt;tag&gt; in the form"
);
check(
  "br and block ends become spaces, not word joins",
  stripHtmlToText("line one<br>line two<li>three</li>"),
  "line one line two three"
);

console.log(failures === 0 ? "\nPASS — all checks green" : `\nFAIL — ${failures} check(s) red`);
process.exit(failures === 0 ? 0 : 1);
