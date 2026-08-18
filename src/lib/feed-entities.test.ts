// Run: npx tsx src/lib/feed-entities.test.ts
//
// The decoder is what stands between a publisher's `&#8217;` and a reader seeing
// `Hanwha&#8217;s` in the lead story's dek. Proving it fires is not enough — a
// decoder that rewrote every `&`-shaped run would fire too and would corrupt
// text nobody asked it to touch. Parts C and D are the negative controls: an
// entity the table does not know, and a code point that must never be
// substituted, both have to survive unchanged.

import { decodeEntities } from "./feed-entities";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// ── A · the defect that shipped ──
console.log("\n── A · the numeric punctuation that reached production ──");
{
  // Transcribed from the live /api/defense-news payload, 2026-08-11.
  const RAW =
    "Hanwha&#8217;s parent firm previously sought to acquire Austal&#8217;s parent company in 2024. Now, the two US arms might merge.";
  const out = decodeEntities(RAW);
  check("the apostrophe is decoded", out.includes("Hanwha’s"), out.slice(0, 40));
  check("no numeric reference survives", !/&#\d+;/.test(out), out);
  check("the sentence is otherwise untouched", out.endsWith("the two US arms might merge."), out.slice(-40));
}

// ── B · both numeric forms, and the named table ──
console.log("\n── B · decimal, hexadecimal, named ──");
{
  check("decimal", decodeEntities("a&#8217;b") === "a’b", decodeEntities("a&#8217;b"));
  check("hex lower", decodeEntities("a&#x2019;b") === "a’b", decodeEntities("a&#x2019;b"));
  check("hex upper X", decodeEntities("a&#X2019;b") === "a’b", decodeEntities("a&#X2019;b"));
  check("named rsquo", decodeEntities("a&rsquo;b") === "a’b", decodeEntities("a&rsquo;b"));
  check("em dash", decodeEntities("a&mdash;b") === "a—b", decodeEntities("a&mdash;b"));
  check("ellipsis", decodeEntities("a&hellip;") === "a…", decodeEntities("a&hellip;"));
  check(
    "the six entities the old fixed list covered still decode",
    decodeEntities("&amp;&lt;&gt;&quot;&#39;") === "&<>\"'",
    decodeEntities("&amp;&lt;&gt;&quot;&#39;")
  );
  check(
    "named and numeric non-breaking space agree",
    decodeEntities("&nbsp;") === decodeEntities("&#160;"),
    `${JSON.stringify(decodeEntities("&nbsp;"))} vs ${JSON.stringify(decodeEntities("&#160;"))}`
  );
}

// ── C · negative control · text the decoder must not touch ──
console.log("\n── C · what must survive unchanged ──");
{
  check("an unknown named entity is left as the publisher wrote it",
    decodeEntities("R&D&foo;bar") === "R&D&foo;bar", decodeEntities("R&D&foo;bar"));
  check("a bare ampersand is not an entity",
    decodeEntities("Bath Iron Works & Co") === "Bath Iron Works & Co");
  check("an unterminated entity is not decoded",
    decodeEntities("cost &#8217 each") === "cost &#8217 each", decodeEntities("cost &#8217 each"));
  check("a NAICS code is not mistaken for a reference",
    decodeEntities("336611 &amp; 332710") === "336611 & 332710");
  check("plain text is returned byte-identical",
    decodeEntities("Austal USA, LLC — $1.42B") === "Austal USA, LLC — $1.42B");
}

// ── D · negative control · code points that must never be emitted ──
console.log("\n── D · refused code points ──");
{
  check("a lone surrogate half is refused", decodeEntities("a&#xD800;b") === "a&#xD800;b",
    decodeEntities("a&#xD800;b"));
  check("a C0 control character is refused", decodeEntities("a&#7;b") === "a&#7;b",
    decodeEntities("a&#7;b"));
  check("NUL is refused", decodeEntities("a&#0;b") === "a&#0;b", decodeEntities("a&#0;b"));
  check("out of Unicode range is refused", decodeEntities("a&#1114112;b") === "a&#1114112;b",
    decodeEntities("a&#1114112;b"));
  check("tab and newline are still allowed", decodeEntities("a&#9;b&#10;c") === "a\tb\nc",
    JSON.stringify(decodeEntities("a&#9;b&#10;c")));
  check("astral code points decode", decodeEntities("&#128640;") === "🚀", decodeEntities("&#128640;"));
}

// ── E · one pass, so a publisher's escaped entity is preserved ──
console.log("\n── E · single pass ──");
{
  // A chained .replace() decoder turns &amp; into & first and then re-reads its
  // own output, collapsing this to an apostrophe in one call.
  check("a double-encoded entity decodes exactly one level",
    decodeEntities("&amp;#8217;") === "&#8217;", decodeEntities("&amp;#8217;"));
  check("but a caller may take the second level deliberately",
    decodeEntities(decodeEntities("&amp;#8217;")) === "’");
  check("entity-encoded markup survives one pass as text, for the tag stripper",
    decodeEntities("&lt;span class=&quot;uid&quot;&gt;") === '<span class="uid">',
    decodeEntities("&lt;span class=&quot;uid&quot;&gt;"));
}

// ── F · the harness can record a failure ──
console.log("\n── F · self-arm ──");
{
  // If check() were inert, every assertion above would print PASS and the exit
  // code below would still be 0. Fire a deliberate false one with the log
  // silenced, confirm the counter moved, then retract it.
  const before = fail;
  const realLog = console.log;
  console.log = () => {};
  check("(self-arm)", false, "deliberate");
  console.log = realLog;
  const armed = fail === before + 1;
  fail = before; // retract the deliberate failure
  pass++;
  if (!armed) {
    console.log("✗ FAIL  the harness cannot record a failure — every result above is meaningless");
    process.exit(1);
  }
  console.log("✓ PASS  a deliberate false assertion was counted as a failure, then retracted");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
