/**
 * `hidden` must actually hide.
 *
 * The UA stylesheet rule is `[hidden]{display:none}` at specificity (0,1,0). ANY
 * class rule that carries a display value outranks it — `.live-pill{display:inline-flex}`
 * and `.state-banner{display:flex}` both do. So an element that ships `hidden` in the
 * markup, or that a script sets `.hidden = true` on, stays painted.
 *
 * That is not cosmetic. The green LIVE pill asserts the page is showing live data. It
 * ships `hidden` and is revealed only once a fetch settles — except it was never
 * hidden, so it claimed LIVE on first paint and straight through a failed request.
 *
 * The fix is one rule per page. This gate exists so page 19 cannot ship without it.
 *
 *   npx tsx test/public/_hidden-is-binding.test.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`);
  if (!ok) failed++;
}

const PUB = resolve(process.cwd(), "public");
const RULE = /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/;

const pages = readdirSync(PUB).filter((f) => f.endsWith(".html"));
check("there are served pages to check", pages.length > 0, "no .html under public/");

/** Classes used on an element that also ships the `hidden` attribute. */
function hiddenClasses(html: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<[a-z]+[^>]*\shidden(?=[\s/>])[^>]*>/gi) ?? []) {
    const cls = tag.match(/class="([^"]+)"/);
    if (cls) out.push(...cls[1].split(/\s+/).filter(Boolean));
  }
  return [...new Set(out)];
}

/** Does any rule for this class set a display value? Then it outranks [hidden]. */
function classSetsDisplay(html: string, cls: string): boolean {
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${esc}\\s*\\{[^}]*display\\s*:`, "i").test(html);
}

console.log("\n── every page whose hidden elements could be overridden carries the rule ──");
const offenders: string[] = [];
let pagesAtRisk = 0;

for (const page of pages) {
  const html = readFileSync(resolve(PUB, page), "utf8");
  const risky = hiddenClasses(html).filter((c) => classSetsDisplay(html, c));
  if (risky.length === 0) continue;      // nothing on this page can be overridden
  pagesAtRisk++;
  if (!RULE.test(html)) offenders.push(`${page} (${risky.join(", ")})`);
}

check("the scan found pages with overridable hidden elements", pagesAtRisk > 0,
  "no page has a hidden element with a display-setting class — the scan matched nothing, so it proves nothing");

check("EVERY such page makes [hidden] binding", offenders.length === 0,
  `${offenders.length} page(s) ship a hidden element their own CSS un-hides:\n     ${offenders.join("\n     ")}`);

// The LIVE pill specifically — it is the one that makes a claim about the data.
console.log("\n── the LIVE pill, specifically ──");
const pillPages = pages.filter((p) => /\.live-pill\s*\{/.test(readFileSync(resolve(PUB, p), "utf8")));
const pillUnbound = pillPages.filter((p) => !RULE.test(readFileSync(resolve(PUB, p), "utf8")));
check("there are pages carrying a LIVE pill", pillPages.length > 0);
check("no page can paint LIVE while the pill is .hidden", pillUnbound.length === 0,
  `${pillUnbound.length} page(s): ${pillUnbound.join(", ")}`);

// ── planted positives ────────────────────────────────────────────────────────
console.log("\n── planted positives ──");
{
  const bad = `<style>.live-pill{display:inline-flex}</style><span class="live-pill" hidden>LIVE</span>`;
  const good = `<style>[hidden]{display:none!important}.live-pill{display:inline-flex}</style><span class="live-pill" hidden>LIVE</span>`;
  check("P1 · a display-setting class on a hidden element is detected",
    hiddenClasses(bad).some((c) => classSetsDisplay(bad, c)));
  check("P2 · the missing rule is caught", !RULE.test(bad));
  check("P3 · the present rule is accepted", RULE.test(good));
  check("P4 · a hidden element with no display class is not flagged",
    !hiddenClasses(`<style>.x{color:red}</style><span class="x" hidden>y</span>`)
      .some((c) => classSetsDisplay(`<style>.x{color:red}</style>`, c)));
}

console.log(`\n${failed === 0 ? "✅ ALL GREEN" : `❌ ${failed} FAILURE(S)`}`);
process.exit(failed === 0 ? 0 : 1);
