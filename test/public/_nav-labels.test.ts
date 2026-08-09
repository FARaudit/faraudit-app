// THE NAV SAYS WHAT THE CEO NAMED, AND NOTHING ELSE STILL SAYS THE OLD NAME.
//   npx tsx test/public/_nav-labels.test.ts
//
// Opportunities -> Notices, Audit -> Audits (CEO ruling 2026-08-08, given in words).
// The KEYS and the ROUTES are deliberately unchanged: /opportunities and /audit stay
// valid, so every link already sent — a digest email, a bookmark, a deep link out of
// Track — still lands. A rename that moves a URL breaks mail nobody can re-send.
//
// WHAT MAKES THIS MORE THAN A STRING SWEEP. Every served page carries its own STALE
// copy of the sidebar, baked into the HTML, and those copies still read "Opportunities"
// — along with "Run Audit" and "Past Audits", labels the live rail stopped using long
// before this rename. They are safe ONLY because injectRail() replaces the whole
// <aside class="sidebar"> block at request time. That safety is a claim about a regex,
// so this file checks it per file rather than assuming it: a page whose aside the regex
// cannot match, or a page served by no route that injects, ships the stale label.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const rail = read("src/lib/nav/rail.ts");

// Comments explain; they do not ship to the eye. Every "does this still present the old
// name?" check runs on code only — otherwise this file's own explanation of the rename
// would fail it.
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
// A served .html carries JS comments too, inside its <script> blocks — public/*.html ships
// verbatim, so they are readable, but they are not a LABEL and this file is about labels.
// The line-comment strip requires `//` to open the line: stripping it anywhere would eat
// the rest of every line holding an https:// URL.
const htmlCodeOnly = (src: string) =>
  src.replace(/<!--[\s\S]*?-->/g, " ")
     .replace(/\/\*[\s\S]*?\*\//g, " ")
     .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");

// ── 1 · THE RAIL CARRIES THE NEW LABELS AND THE OLD ROUTES ────────────────────────────
console.log("── the rail says what was named ──");
{
  const items = [...rail.matchAll(/\{\s*key:\s*"([\w-]+)",\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)]
    .map((m) => ({ key: m[1], label: m[2], href: m[3] }));
  check("the rail item list was located", items.length >= 4, `parsed ${items.length} items — did the shape change?`);

  const want = [
    { key: "opportunities", label: "Notices", href: "/opportunities" },
    { key: "run-audit", label: "Audits", href: "/audit" },
  ];
  for (const w of want) {
    const got = items.find((i) => i.key === w.key);
    check(`'${w.key}' is labelled "${w.label}"`, got?.label === w.label,
      got ? `rail says "${got.label}"` : "the key is gone from the rail entirely");
    // A label change that quietly moved the URL would 404 every link already sent.
    check(`'${w.key}' still routes to ${w.href}`, got?.href === w.href,
      got ? `route moved to ${got.href} — links already sent will not land` : "item missing");
  }
}

// ── 2 · NOTHING SERVED STILL PRESENTS THE OLD NAME ────────────────────────────────────
// Scoped to what a customer can read: served HTML and JS, comments stripped, and with
// each page's stale <aside> excluded — leg 3 is what earns that exclusion.
console.log("\n── no served surface still presents the old label ──");
const ASIDE = /<aside class="sidebar">[\s\S]*?<\/aside>/g;
const publicDir = join(ROOT, "public");
const served = readdirSync(publicDir).filter((f) => f.endsWith(".html") || f.endsWith(".js"));
check("the sweep reached the served tree", served.length > 30, `only ${served.length} files`);
{
  const offenders: string[] = [];
  for (const f of served) {
    const raw = read(join("public", f));
    const visible = (f.endsWith(".html") ? htmlCodeOnly(raw).replace(ASIDE, " ") : codeOnly(raw));
    if (/\bOpportunities\b/.test(visible)) offenders.push(f);
  }
  check("no served page presents \"Opportunities\" to the reader", offenders.length === 0,
    `still shown in: ${offenders.join(", ")}`);
}

// ── 3 · THE STALE ASIDES ARE PROVABLY DISPLACED ───────────────────────────────────────
// This is the leg that makes leaving them alone legitimate. Two things must hold for
// every page carrying a stale label: injectRail's OWN regex must match that page, and a
// route must actually serve the page through injectRail. Either one missing and the
// customer reads a label we retired.
console.log("\n── every stale sidebar is displaced at request time ──");
{
  // Derived from the source, never re-typed: a hand-copied regex here would keep passing
  // after injectRail's own selector changed.
  // The body of the literal, escaped slashes and all — a `[^/]*` scan stops dead on the
  // `<\/aside>` inside it and yields an unterminated pattern.
  const m = rail.match(/html\.replace\(\s*\/((?:[^/\\\n]|\\.)+)\//);
  check("injectRail's selector was read out of rail.ts", !!m,
    "could not find the html.replace(...) call — this leg cannot verify anything");
  const selector = m ? new RegExp(m[1]) : null;
  check("...and it is the aside selector", !!selector && selector.source.includes("aside"),
    `read ${selector?.source}`);

  // Which routes serve which file, through injectRail.
  const appDir = join(ROOT, "src", "app");
  const routeFiles: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") routeFiles.push(p);
    }
  };
  walk(appDir);
  const injectedFiles = new Set<string>();
  for (const rf of routeFiles) {
    const src = readFileSync(rf, "utf8");
    if (!/injectRail\(/.test(src)) continue;
    for (const hit of src.matchAll(/"public",\s*"([\w.-]+\.html)"/g)) injectedFiles.add(hit[1]);
    for (const hit of src.matchAll(/public\/([\w.-]+\.html)/g)) injectedFiles.add(hit[1]);
  }
  check("routes that inject the rail were found", injectedFiles.size >= 8,
    `only ${injectedFiles.size} injected pages found — the route scan missed something`);

  const stale = served.filter((f) => f.endsWith(".html") && /\bOpportunities\b/.test(read(join("public", f))));
  check("pages carrying a stale sidebar were found", stale.length > 0,
    "nothing to check — if the bakes are gone this leg is inert and should be deleted");

  for (const f of stale) {
    const raw = read(join("public", f));
    check(`'${f}' · injectRail's selector matches its sidebar`, !!selector && selector.test(raw),
      "the aside does not match the selector, so the stale label is served verbatim");
    check(`'${f}' · a route serves it through injectRail`, injectedFiles.has(f),
      "no route injects this page, so its baked sidebar is what the customer sees");
  }
}

// ── 4 · THE EMAIL IS A SURFACE TOO ────────────────────────────────────────────────────
// The first pass at this rename swept public/ and the rail and called it done. The weekly
// digest is neither, and it went out on 2026-08-08 headed "Your watched opportunities" —
// in the H1, in the plaintext body, and in one of the two subject lines — while its own
// preheader already said "the notices you are watching". A customer-facing surface that
// ships by mail is easy to forget precisely because no page renders it.
console.log("\n── the weekly digest speaks the same vocabulary ──");
{
  const digest = read("src/lib/watched-digest.ts");
  const visible = codeOnly(digest);
  check("the digest builder was located", /buildWatchedDigestEmail/.test(digest),
    "the export moved — this leg is checking a file that no longer builds the mail");
  check("no 'opportunities' in what the digest presents", !/opportunit/i.test(visible),
    "the mail still uses the retired word in copy a customer reads");
  // Presence, not just absence: a rename that emptied the heading would pass the check above.
  check("...and it says 'notices' instead", /watched notices/i.test(visible),
    "the heading is gone rather than renamed");
}

// ── 5 · PLANTED POSITIVES — every leg above must be able to go red ────────────────────
console.log("\n── planted positives ──");
{
  const selector = /<aside class="sidebar">[\s\S]*?<\/aside>/;
  check("P1 · a stale label OUTSIDE an aside is caught",
    /\bOpportunities\b/.test(htmlCodeOnly('<h1>Opportunities</h1>').replace(ASIDE, " ")),
    "the sweep would miss a heading");
  check("P2 · a stale label INSIDE an aside is excluded",
    !/\bOpportunities\b/.test('<aside class="sidebar"><span>Opportunities</span></aside>'.replace(ASIDE, " ")),
    "the exclusion does not work, so leg 2 is testing nothing");
  check("P3 · an aside the selector cannot match is caught",
    !selector.test('<aside class="sidebar" id="x"><span>Opportunities</span></aside>'),
    "a longer selector would slip past injectRail and ship the stale label");
  check("P4 · a comment is not a presented label",
    !/\bOpportunities\b/.test(codeOnly("// The Opportunities feed is SAM-live")),
    "comments are being read as shipped copy");
  // P5/P6 run the REAL parser over a planted rail rather than comparing two literals.
  // The first draft compared string constants; `tsc` folds those to a constant and
  // reported TS2367 — a plant that cannot fail is not a plant, and `tsx` had passed it.
  const parse = (src: string) =>
    [...src.matchAll(/\{\s*key:\s*"([\w-]+)",\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)]
      .map((mm) => ({ key: mm[1], label: mm[2], href: mm[3] }));
  const planted = parse('{ key: "opportunities", label: "Opportunities", href: "/notices", icon: X },');
  check("P5 · the parser reads a planted rail item", planted.length === 1,
    "the item regex found nothing — legs 1's parse could be silently empty");
  check("P6 · ...and the label check rejects the retired name",
    planted[0]?.label !== "Notices", "a rail still saying Opportunities would pass");
  check("P7 · ...and the route check rejects a moved URL",
    planted[0]?.href !== "/opportunities", "a moved route would pass unnoticed");
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
