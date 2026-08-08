/**
 * An in-app link must go to the ROUTE, never to the raw .html file.
 *
 * Each signed-in page is served by a Route Handler that reads the file from public/
 * and runs injectRail() over it. Linking to `today.html` instead of `/today` skips the
 * handler entirely — Vercel serves the file straight off the filesystem, so the page
 * arrives with whatever <aside class="sidebar"> the file happens to contain instead of
 * the injected one. The result is a page whose navigation is frozen at whenever that
 * file was last hand-edited: different groups, different labels, stale counts.
 *
 * It is not an auth hole — middleware gates the path either way — which is exactly why
 * it survived: the page loads, it is the customer's data, and only the furniture is
 * wrong.
 *
 *   npx tsx test/public/_links-go-through-routes.test.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`);
  if (!ok) failed++;
}

const ROOT = process.cwd();
const PUB = resolve(ROOT, "public");

/** Every public/*.html that a rail-injecting Route Handler serves. */
function railedFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const appDir = resolve(ROOT, "src/app");
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const routeFile = resolve(appDir, entry.name, "route.ts");
    let src: string;
    try { src = readFileSync(routeFile, "utf8"); } catch { continue; }
    if (!src.includes("injectRail")) continue;
    const m = src.match(/"([a-z0-9-]+\.html)"/);
    if (m) out.set(m[1], "/" + entry.name);
  }
  return out;
}

const railed = railedFiles();
check("the scan found rail-injecting routes", railed.size > 5,
  `only ${railed.size} found — the scan matched nothing, so it proves nothing`);

console.log("\n── no served page links to a raw .html that has a route ──");
const offenders: string[] = [];
for (const page of readdirSync(PUB).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(resolve(PUB, page), "utf8");
  for (const m of html.matchAll(/href="([a-z0-9-]+\.html)"/g)) {
    const route = railed.get(m[1]);
    if (route) offenders.push(`${page} → href="${m[1]}" (should be "${route}")`);
  }
}
check("every in-app link goes through its route", offenders.length === 0,
  `${offenders.length} link(s) bypass injectRail:\n     ${offenders.join("\n     ")}`);

// ── planted positives ────────────────────────────────────────────────────────
console.log("\n── planted positives ──");
{
  const hrefs = (h: string) => [...h.matchAll(/href="([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  check("P1 · a raw .html link is detected",
    hrefs('<a href="today.html">x</a>').includes("today.html"));
  check("P2 · a route link is not flagged",
    hrefs('<a href="/today">x</a>').length === 0);
  check("P3 · the file→route map resolves a known page",
    railed.get("today.html") === "/today", `got ${railed.get("today.html")}`);
  check("P4 · a public .html with NO route is not flagged",
    railed.get("pricing.html") === undefined,
    "pricing.html has a rail route — this plant needs a different file");
}

console.log(`\n${failed === 0 ? "✅ ALL GREEN" : `❌ ${failed} FAILURE(S)`}`);
process.exit(failed === 0 ? 0 : 1);
