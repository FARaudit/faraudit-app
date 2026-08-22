// GATE — NO SURFACE MAY HARD-TYPE THE CUSTOMER'S NAICS SCOPE.
// Run: npx tsx test/public/_naics-scope-single-source.test.ts
//
// On 2026-08-22 two routes carried `"336413,332710,332721"` — three aerospace codes typed into the source,
// shown to every authenticated user and fed into the weekly brief's model prompt. Two of the three were not
// even on our own profile. Nothing failed; the feed was simply somebody else's. `resolveFeedScope` is the one
// place that answers "which codes is this account scoped to" (profile → NAICS_CODES operator override →
// honest-empty), and this gate keeps it that way: a literal list of 6-digit codes in an API route is the
// defect, so the gate looks for the SHAPE, not for the three strings that happened to be there.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
export {};

const ROOTS = ["src/app/api", "src/lib/bd-os"];
// A quoted run of >=2 six-digit codes, or an array literal of >=2 six-digit string codes.
const INLINE_CSV = /["'`]\s*\d{6}\s*(?:,\s*\d{6}\s*){1,}["'`]/;
const INLINE_ARR = /\[\s*["']\d{6}["']\s*(?:,\s*["']\d{6}["']\s*){1,}\]/;
// The resolver itself and tests may name codes freely; so may a NAICS *reference* table, which is data about
// the taxonomy rather than a scope decision about this customer.
const EXEMPT = /\.test\.ts$|naics-reference|naics-suggestions|sba-size-standards/;
// A MAPPING ROW IS NOT A SCOPE. `{ category: "CNC Machinist II", …, naics_codes: ["332710", …] }` says which
// NAICS a labor category belongs to — taxonomy data, true regardless of who is signed in. The defect this gate
// exists for is a route DECIDING the customer's scope, which is a bare `const NAME = [...]` / `= "a,b"` at
// module level. Distinguishing by shape rather than by filename keeps the exemption from becoming a hole:
// a hardcoded scope smuggled into labor-rates would still be caught, because it would not be a mapping row.
const MAPPING_ROW = /^\{.*\b(category|label|title|name)\s*:/;

const walk = (d: string): string[] => {
  let out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
};

let pass = 0;
const offenders: Array<{ file: string; line: number; text: string }> = [];
for (const root of ROOTS) {
  for (const f of walk(root)) {
    if (EXEMPT.test(f)) continue;
    readFileSync(f, "utf8").split("\n").forEach((raw, i) => {
      const line = raw.trim();
      if (line.startsWith("//") || line.startsWith("*")) return;   // a comment quoting the old defect is the record of it
      if (MAPPING_ROW.test(line)) { pass++; return; }
      if (INLINE_CSV.test(line) || INLINE_ARR.test(line)) offenders.push({ file: f, line: i + 1, text: line.slice(0, 100) });
      else pass++;
    });
  }
}

if (offenders.length) {
  console.log(`✗ FAIL — ${offenders.length} hard-typed NAICS scope list(s):`);
  for (const o of offenders) console.log(`   ${o.file}:${o.line}  ${o.text}`);
  console.log(`\nUse resolveFeedScope(client) — profile first, NAICS_CODES env as an operator override, honest-empty otherwise.`);
  process.exit(1);
}
console.log(`PASS — ${pass} code lines scanned across ${ROOTS.join(", ")}, no hard-typed NAICS scope list`);
process.exit(0);
