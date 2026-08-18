// Regenerate src/lib/naics-titles.ts from public/naics-reference.js.
//
//   node scripts/naics/build-naics-titles.mjs           # write the module
//   node scripts/naics/build-naics-titles.mjs --check    # fail if it is stale
//
// WHY A SECOND FILE AT ALL. public/naics-reference.js is a browser asset — it assigns
// window.NAICS_REF and is served verbatim. The PDF export renders on the server and
// cannot read it, and the capability statement page does not load that 90 KB table just
// to print three titles. Rather than type the titles a second time, this derives them
// from the generated file, so the regulation remains the single source: 121.201 →
// build-naics-reference.mjs → public/naics-reference.js → here.
//
// Titles only. Size standards, sectors and the editorial overlay stay in the browser
// table; nothing on a capability statement quotes a threshold, and a figure that reaches
// a document sent to a contracting officer is a claim we would have to stand behind.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "public", "naics-reference.js");
const OUT = join(ROOT, "src", "lib", "naics-titles.ts");

const src = readFileSync(SRC, "utf8");

// Row shape is documented in the source file's header:
//   [code, category, title, sizeStandard, sizeKind, evalMethod, clauseRegime, note, sector]
// Only the first and third fields are taken. A title containing an escaped quote is
// unescaped here so the emitted module carries the regulation's text, not the encoding.
const rows = [...src.matchAll(/\n\s*\['(\d{6})','[^']*','((?:[^'\\]|\\.)*)'/g)]
  .map((m) => [m[1], m[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\")]);

if (rows.length < 500) {
  console.error(`only ${rows.length} codes parsed out of naics-reference.js — the row shape changed; fix this script rather than shipping a short table.`);
  process.exit(1);
}

const seen = new Set();
for (const [code] of rows) {
  if (seen.has(code)) { console.error(`duplicate code ${code} in the source table`); process.exit(1); }
  seen.add(code);
}

const body = rows.map(([c, t]) => `  "${c}": ${JSON.stringify(t)}`).join(",\n");
const out = `// NAICS code titles — GENERATED. Do not edit by hand.
//
//   node scripts/naics/build-naics-titles.mjs
//
// Derived from public/naics-reference.js, which is itself generated from 13 CFR 121.201.
// The regulation is the source; this is the server-readable projection of its titles.
// A code absent here returns null and the surface prints the bare code — never a guess,
// because a wrong industry title on a capability statement misdescribes the firm to a
// contracting officer.
export const NAICS_TITLES: Record<string, string> = {
${body}
};

export function naicsTitle(code: string | null | undefined): string | null {
  if (!code) return null;
  return NAICS_TITLES[String(code).trim()] ?? null;
}
`;

if (process.argv.includes("--check")) {
  let cur = "";
  try { cur = readFileSync(OUT, "utf8"); } catch { /* absent counts as stale */ }
  if (cur !== out) {
    console.error("src/lib/naics-titles.ts is STALE — re-run the build and commit the result.");
    process.exit(1);
  }
  console.log(`✓ naics-titles.ts matches naics-reference.js — ${rows.length} codes`);
} else {
  writeFileSync(OUT, out);
  console.log(`wrote ${OUT}\n  ${rows.length} codes · ${(out.length / 1024).toFixed(1)} KB`);
}
