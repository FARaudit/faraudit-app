// ─────────────────────────────────────────────────────────────────────────────
// CAPABILITY STATEMENT · TYPE FLOOR — card 825 §1, ruled by Design 2026-08-09.
//
// The packet first claimed a 12pt floor. That figure was inherited from card 819, whose document
// was letter-style prose; this is a spec plate — three short prose blocks and a table of facts.
// One floor for two different reading tasks was the error, not the number. Design ruled three:
//
//     set as a SENTENCE ......... 10pt    the only running text on the sheet
//     title-block VALUES ........  9pt    short, mono, high contrast, scanned not read
//     KEYS and section numerals .  6.5pt  caps, never more than two words — wayfinding
//
// Design's instruction was explicit and is the whole reason this file exists: "Gate all three
// numbers. The exemption for keys is TESTED, not asserted: no key on the sheet exceeds two words,
// and that is the condition the exemption rests on — gate it too."
//
// Their own note on why: C7 at 8pt and C6 at 6.5pt could not fail, so they certified a floor
// nobody was holding. A stated standard needs a check at the stated number.
//
// The plate already MEETS all three (sentence 10, value 9.4, key 9). Nothing held them there.
//
// Run: npx tsx test/public/_cap-statement-type-floor.test.ts
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, why = "") => {
  if (ok) { pass++; console.log(`✓ PASS  ${label}`); }
  else { fail++; console.log(`✗ FAIL  ${label}${why ? "  — " + why : ""}`); }
};

const plate = read("src/lib/capability-statement-plate.tsx");

// ── the scale, read out of the source rather than restated here ──────────────
// Restating the numbers would make this a check of my own typing. The scale is parsed from the
// declaration the renderer actually uses, so a change to it moves this gate.
const m = plate.match(/const S = \{([^}]+)\}/);
check("the plate declares one size scale", !!m, "no `const S = {...}` — the floors have nothing to read");
const S: Record<string, number> = {};
if (m) for (const part of m[1].split(",")) {
  const [k, v] = part.split(":").map((x) => x.trim());
  if (k && v) S[k] = parseFloat(v);
}
console.log(`   scale: ${JSON.stringify(S)}`);

const FLOOR = { sentence: 10, value: 9, key: 6.5 };

console.log("\n── the three ruled floors ──");
check(`sentences are at or above ${FLOOR.sentence}pt`, S.sentence >= FLOOR.sentence,
  `S.sentence = ${S.sentence}`);
check(`title-block values are at or above ${FLOOR.value}pt`, S.value >= FLOOR.value,
  `S.value = ${S.value}`);
check(`keys are at or above ${FLOOR.key}pt`, S.key >= FLOOR.key, `S.key = ${S.key}`);
// The two heading sizes carry sentences' weight but are not sentences; they must not fall UNDER
// the running text they head. Design's card-825 note: a heading smaller than body text was one of
// the card-821 defects in the export that has since been cut.
check("no heading is smaller than the running text",
  S.capHead >= S.sentence && S.difHead >= S.sentence,
  `capHead ${S.capHead}, difHead ${S.difHead}, sentence ${S.sentence}`);

console.log("\n── every size on the sheet clears the lowest floor ──");
// FIRST WRITTEN AS A LITERAL SWEEP, AND IT WAS VACUOUS. Every fontSize in the plate references the
// scale (`fontSize: S.key`), so the literal pattern matched NOTHING and `.every()` over an empty
// array is true — the check reported all-clear having read zero sizes. The vacuity guard beside it
// is the only reason that surfaced. Two checks now, and they measure different things.
const scaleValues = Object.entries(S);
check("the scale was parsed, not assumed", scaleValues.length >= 5,
  `only ${scaleValues.length} entries parsed out of the declaration`);
const under = scaleValues.filter(([, n]) => n < FLOOR.key);
check("every size in the scale is at or above the key floor", under.length === 0,
  under.map(([k, n]) => `${k}=${n}`).join(", "));
// A style added later with a hardcoded number would bypass the scale and every floor above.
// ZERO is the correct answer here, so this asserts absence rather than sweeping a set.
const literals = [...plate.matchAll(/fontSize:\s*([\d.]+)/g)].map((x) => parseFloat(x[1]));
check("no fontSize bypasses the scale with a hardcoded number", literals.length === 0,
  `hardcoded: ${literals.join(", ")}`);

console.log("\n── the key exemption rests on a condition, so the condition is tested ──");
// 6.5pt is allowed for keys ONLY because a key is wayfinding, never reading — Design's stated
// condition is that no key exceeds two words. A three-word key at 6.5pt is running text set too
// small, and the exemption would be covering it.
const keys = [...plate.matchAll(/<Text style=\{st\.k\}>([^<]+)<\/Text>/g)].map((x) => x[1].trim());
const literalKeys = [...plate.matchAll(/\bk:\s*"([^"]+)"/g)].map((x) => x[1].trim());
const allKeys = [...new Set([...keys, ...literalKeys])].filter(Boolean);
console.log(`   keys found: ${allKeys.length ? allKeys.join(" · ") : "(none matched)"}`);
const overLong = allKeys.filter((k) => k.split(/\s+/).length > 2);
check("no key exceeds two words", overLong.length === 0,
  overLong.length ? `over two words: ${overLong.join(" · ")}` : "");

console.log("\n── the faces Design ruled ──");
// Ruling 2: the plate computes Manrope; the paste declared Space Grotesk. 24 of 24 served pages
// are Manrope and brand.md §3 already lists it, so the declaration was drift, not a choice.
const fonts = read("src/lib/capability-statement-fonts.ts");
check("the display face is Manrope", /export const DISPLAY = "Manrope"/.test(fonts));
check("the mono face is JetBrains Mono", /export const MONO = "JetBrainsMono"/.test(fonts));
check("Space Grotesk is declared nowhere",
  !/Space Grotesk/i.test(fonts) && !/Space Grotesk/i.test(plate) && !/Space Grotesk/i.test(read("public/capability-statement-live.js")),
  "the paste and the plate would ship in different typefaces");
check("the paste declares the same display face",
  /Manrope/.test(read("public/capability-statement-live.js")),
  "the copied statement and the downloaded PDF are two different documents");

console.log("\n── the ruled title block is 9 cells, 3/3/3 (card 825 §2) ──");
// Design's ruled arrangement:
//   row 1  SBA CERTIFIED   SELF-CERTIFIED   SAM REGISTRATION
//   row 2  UEI             CAGE             NAICS  (card 826: the key names the field)
//   row 3  CONTACT         EMAIL            ADDRESS
// SELF-CERTIFIED is its own cell because "self-certified" describes where the claim came from,
// not the entity — a property of the field belongs in the key, the same ruling as UEI vs CAGE.
// Two registries of different reliability are two fields, not one field with a footnote.
const RULED = ["SBA certified", "Self-certified", "SAM registration", "UEI", "CAGE", "NAICS", "Contact", "Email", "Address"];
const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
const present = RULED.filter((r) => allKeys.some((k) => norm(k) === norm(r)));
const missing = RULED.filter((r) => !present.includes(r));
check("the title block carries all nine ruled cells", missing.length === 0,
  `missing: ${missing.join(" · ")} — the plate has ${allKeys.length} of ${RULED.length}`);

console.log("\n── falsifiability ──");
// Each floor must be able to fail, or this file is the thing it was written to prevent.
check("P1 · a sub-floor sentence IS rejected", !(9 >= FLOOR.sentence));
check("P2 · a sub-floor value IS rejected", !(8.5 >= FLOOR.value));
check("P3 · a sub-floor key IS rejected", !(6 >= FLOOR.key));
check("P4 · a three-word key IS rejected", "SBA CERTIFIED SUPPLIER".split(/\s+/).length > 2);
check("P5 · a two-word key is accepted", !("SBA CERTIFIED".split(/\s+/).length > 2));
check("P6 · the literal sweep can see a sub-floor size",
  [...`fontSize: 5.5`.matchAll(/fontSize:\s*([\d.]+)/g)].map((x) => parseFloat(x[1])).some((n) => n < FLOOR.key));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) {
  console.error("\nTYPE FLOOR BREACHED — a stated standard with no check is a standard nobody is holding.");
  process.exit(1);
}
