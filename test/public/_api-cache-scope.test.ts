// Per-user API responses may not be labelled `public`.
// Run: npx tsx test/public/_api-cache-scope.test.ts
//
// next.config.ts sets one catch-all Cache-Control on /:path*. It was written for the
// un-hashed assets in /public — the same bytes for every visitor, where `public` is
// correct — and it also lands on /api/*, which is not: /api/audits, /api/profile and
// /api/preferences each carry ONE account's data.
//
// Nothing is leaking today, because `s-maxage=0` keeps shared caches from storing the
// response. That is the whole problem: the safety rests on a second directive rather
// than on the response saying what it is. Deleting `s-maxage=0` — a plausible edit,
// and a harmless-looking one — would turn a CDN into a cross-user cache.
//
// Part P plants the regression back and asserts this suite goes red.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const cfg = readFileSync(join(ROOT, "next.config.ts"), "utf8");

/** The Cache-Control value attached to a given `source:` rule, comments stripped. */
function ruleFor(src: string, text: string): string | null {
  const clean = text.replace(/\/\/[^\n]*/g, "");
  const i = clean.indexOf(`source: "${src}"`);
  if (i < 0) return null;
  const window = clean.slice(i, i + 400);
  const m = window.match(/"Cache-Control",\s*value:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

console.log("── the API is scoped to one browser ──");
const api = ruleFor("/api/:path*", cfg);
check("an /api/* Cache-Control rule exists", !!api, "the catch-all is the only rule, so /api inherits `public`");
check("...and it is `private`", !!api && /\bprivate\b/.test(api), api || "");
check("...and it is NOT `public`", !!api && !/\bpublic\b/.test(api), api || "");
// Freshness must be unchanged by this fix — a labelling change that quietly started
// serving stale account data would be a different, worse defect.
check("...and it still revalidates before any reuse",
  !!api && /max-age=0/.test(api) && /must-revalidate/.test(api),
  api || "the fix loosened freshness while relabelling");

console.log("── the asset rule is untouched ──");
const all = ruleFor("/:path*", cfg);
check("the catch-all still defeats the CDN for un-hashed assets",
  !!all && /s-maxage=0/.test(all) && /must-revalidate/.test(all),
  all || "deploys will take ~17 min to surface again");
const stat = ruleFor("/_next/static/:path*", cfg);
check("content-hashed assets still cache forever",
  !!stat && /immutable/.test(stat), stat || "");

console.log("── ordering: a later rule wins in Next's header merge ──");
const iAll = cfg.indexOf('source: "/:path*"');
const iApi = cfg.indexOf('source: "/api/:path*"');
check("the /api rule comes AFTER the catch-all it overrides",
  iAll >= 0 && iApi > iAll,
  "declared before the catch-all, the override never takes effect");

console.log("── Part P · positive controls ──");
const controls: Array<[string, string]> = [
  ["the API rule goes back to public",
    cfg.replace('value: "private, max-age=0, must-revalidate"', 'value: "public, max-age=0, must-revalidate"')],
  ["the API rule is deleted entirely",
    cfg.replace(/\{\s*source: "\/api\/:path\*",[\s\S]*?\},/, "")],
  ["the fix loosens freshness while relabelling",
    cfg.replace('value: "private, max-age=0, must-revalidate"', 'value: "private, max-age=300"')],
];
for (const [name, planted] of controls) {
  const changed = planted !== cfg;
  let red = false;
  if (changed) {
    const p = ruleFor("/api/:path*", planted);
    red = !p || /\bpublic\b/.test(p) || !/\bprivate\b/.test(p) ||
      !/max-age=0/.test(p) || !/must-revalidate/.test(p);
  }
  check(`positive control · ${name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
