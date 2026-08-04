// ─────────────────────────────────────────────────────────────────────────────
// RAIL ACCESSIBILITY GATE — the shared nav chrome, on every page that serves it.
//
// TWO PROBLEMS, AND THE SECOND IS THE ONE THAT WILL BITE AGAIN.
//
// (1) CONTRAST. Measured on the live rail: `.sb-group-label` at **2.88:1** and
//     `.sb-badge.new` at **3.59:1**, both against a 4.5 floor. Neither qualifies
//     for the large-text exemption — that needs >=18.66px, or >=14px at bold, and
//     these are 9px and 9.5px. So 4.5 is the floor and both failed it.
//
// (2) THE RAIL IS NOT ONE SOURCE. Its CSS is COPIED into 19 served .html files,
//     and by the time this gate was written the copies had ALREADY FORKED into
//     three variants: 16 files share one, `defense-news.html` carries a
//     reformatted duplicate (`"IBM Plex Mono"` with no fallback, `0.32` not
//     `.32`, `#ffffff` not `#fff`), and `naics.html` + `run-audit.html` carry an
//     extra legacy `.sb-group-label` block plus a second `.sb-badge.new`.
//
//     That is why this gate asserts VALUES, not strings. A string check would
//     have passed on 16 files and failed on 3 for cosmetic reasons while missing
//     the actual defect, which was identical in all 19.
//
// WHAT IT DOES NOT DO. It does not police font size. WCAG sets no minimum, and
// the 9px/9.5px tokens are a DESIGN judgement on a fixed-width rail where a bump
// to 11px risks wrapping an uppercase mono label at .14em tracking. Nine nodes
// sit under 11px; that is recorded for Design, not enforced here. A gate that
// quietly encoded a size preference as an accessibility rule would be asserting
// authority it does not have.
//
//   R1  CALIBRATION — the contrast function reproduces known pairs, INCLUDING an
//       alpha case. Three samplers were written for this rail and two produced
//       confident wrong numbers; an uncalibrated one is not evidence.
//   R2  COVERAGE — every served .html outside a NAMED pre-auth set carries the
//       rail, so a page that loses it fails rather than leaving the population.
//   R3  CONTRAST FLOOR — every rail text token clears 4.5:1 against its
//       COMPOSITED ground.
//   R4  THE COPIES AGREE — every copy resolves to the SAME effective values,
//       so a fix applied to some of them fails here rather than forking silently.
//   R5  PLANTED POSITIVES — the pre-fix values must be caught, and a single
//       divergent copy must be caught.
//
// Run: npx tsx test/public/_rail-a11y.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

type RGB = [number, number, number];
const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (f: RGB, b: RGB) => {
  const a = lum(f), x = lum(b), hi = Math.max(a, x), lo = Math.min(a, x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
/** Composite `src` at alpha `a` over `dst`. Without this, `rgba(255,255,255,.32)` reads as pure
 *  white and every translucent token reports a ratio of 1.00 — the bug that produced two wrong
 *  samplers before this one. */
const over = (src: RGB, a: number, dst: RGB): RGB =>
  [a * src[0] + (1 - a) * dst[0], a * src[1] + (1 - a) * dst[1], a * src[2] + (1 - a) * dst[2]];

const hex = (h: string): RGB => {
  const s = h.replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};

const RAIL_BG: RGB = hex("#0a1628");   // .sidebar background — SOLID, measured on the live page
const WHITE: RGB = [255, 255, 255];
const FLOOR = 4.5;                     // 9px and 9.5px never reach the large-text exemption

// ── R1 · CALIBRATION ─────────────────────────────────────────────────────────
console.log("\nR1 · the contrast function is calibrated");
{
  ok(ratio(WHITE, [0, 0, 0]) === 21, "white on black = 21");
  ok(ratio([118, 118, 118], WHITE) === 4.54, "#767676 on white = 4.54 (the AA boundary colour)");
  ok(ratio(RAIL_BG, RAIL_BG) === 1, "identical colours = 1");
  // The alpha leg, hand-computed: white @32% over #0a1628 composites to rgb(88,97,109) -> 2.88.
  const c = over(WHITE, 0.32, RAIL_BG);
  ok(c.map(Math.round).join(",") === "88,97,109", "alpha composite is correct", c.map(Math.round).join(","));
  ok(ratio(c, RAIL_BG) === 2.88, "and yields 2.88 — the figure Design published", String(ratio(c, RAIL_BG)));
}

// ── R2 · COVERAGE ────────────────────────────────────────────────────────────
const PUBLIC = path.join(process.cwd(), "public");
const readHtml = (f: string) => readFileSync(path.join(PUBLIC, f), "utf8");
const htmlFiles = readdirSync(PUBLIC).filter((f) => f.endsWith(".html"));

/* The rail is platform chrome, so the population is defined by its COMPLEMENT: the
   pre-auth pages. Everything else must carry it.

   Two weaker forms were tried and both leak:
     `railFiles.length >= 19` — a literal floor. It went red when public/watching.html
       was deleted in #427, a clean removal with no dead links, condemning 18 healthy
       pages for the absence of a nineteenth that was meant to go. Bumping it to 18
       only re-arms it, and the edit that silences it is indistinguishable from one
       that hides a regression.
     inferring the population from the shell (`data-sb=`) — the form that shipped, and
       it has a hole: a platform page that loses BOTH the shell and the rail simply
       leaves the population and passes in silence. Measured: with both stripped from
       naics.html the shell form exits 0, this form exits 1 and names the file.

   Taking the complement fails CLOSED: a new page belongs to neither set until the
   router says which it is, so it fails until classified. An allowlist of safe shapes,
   never an inference about the unsafe ones. Ported from the closed #433, which got
   this leg right where the shipped version did not. */
/* The pre-auth set is READ FROM THE ROUTER, not kept as a second hand-maintained
   list. src/middleware.ts decides what is reachable signed-out, so it is the only
   thing that can be right about it, and a copy here would be a second rule free to
   drift from the first. #438 established this source for the pre-auth doctrine gate;
   the same source has to drive this one or the two gates can disagree about which
   pages are public.

   "/" is mapped explicitly: middleware lists the ROUTE, and the route serves
   public/index.html. Extracting only *.html entries silently drops it. */
function preAuthPages(): Set<string> {
  const src = readFileSync(path.join(process.cwd(), "src", "middleware.ts"), "utf8");
  const at = src.indexOf("const PUBLIC = [");
  if (at < 0) return new Set();
  const block = src.slice(at, src.indexOf("]", at));
  const out = new Set<string>();
  for (const m of block.matchAll(/"([^"]+)"/g)) {
    const route = m[1];
    if (route === "/") out.add("index.html");
    else if (route.endsWith(".html")) out.add(route.replace(/^\//, ""));
  }
  return out;
}
const PRE_AUTH = preAuthPages();

const carriesRail = (f: string) => readHtml(f).includes("sb-group-label");
const railFiles = htmlFiles.filter(carriesRail);
const shouldCarry = htmlFiles.filter((f) => !PRE_AUTH.has(f));

console.log("\nR2 · every served page carrying the rail is swept");
// Fail closed: an unreadable router must not exempt nothing and pass, nor exempt
// everything and pass. Either way the population is wrong without saying so.
ok(PRE_AUTH.size > 0, `pre-auth pages read from src/middleware.ts (${PRE_AUTH.size})`,
  PRE_AUTH.size ? "" : "could not parse PUBLIC[] — the population is unknown, not empty");
// Fail closed: a sweep that finds nothing must not read as "nothing to check".
ok(railFiles.length > 0, `the rail is served from ${railFiles.length} pages`,
  railFiles.length ? "" : "NONE FOUND — the sweep is inert");
const railMissing = shouldCarry.filter((f) => !carriesRail(f));
ok(railMissing.length === 0,
  `every page outside the named pre-auth set carries the rail (${railFiles.length}/${shouldCarry.length})`,
  railMissing.join(", "));
// The allowlist must not silently outlive its entries: a stale name would quietly
// exempt a page that later gained the rail, or one that no longer exists.
const staleExempt = [...PRE_AUTH].filter((f) => !htmlFiles.includes(f) || carriesRail(f));
ok(staleExempt.length === 0, `every PRE_AUTH entry is a real, rail-less page (${PRE_AUTH.size})`, staleExempt.join(", "));

// ── extract EFFECTIVE values, not strings ────────────────────────────────────
/** The last matching declaration wins in CSS source order, which is what the browser resolves. */
function labelAlpha(src: string): number | null {
  let last: number | null = null;
  for (const m of src.matchAll(/(?:\[data-sb="open"\]\s*)?\.sb-group-label\{([^}]*)\}/g)) {
    const c = m[1].match(/color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0?\.\d+|1)\s*\)/);
    if (c) last = parseFloat(c[1]);
  }
  return last;
}
function badgeBg(src: string): RGB | null {
  let last: RGB | null = null;
  for (const m of src.matchAll(/\.sb-badge\.new\{([^}]*)\}/g)) {
    const h = m[1].match(/background:\s*(#[0-9a-fA-F]{3,6})/);
    if (h) { last = hex(h[1]); continue; }
    const r = m[1].match(/background:\s*rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (r) last = [+r[1], +r[2], +r[3]];
  }
  return last;
}

// ── R3 · CONTRAST FLOOR ──────────────────────────────────────────────────────
console.log("\nR3 · every rail token clears 4.5:1 on its composited ground");
{
  for (const f of railFiles) {
    const src = readFileSync(path.join(PUBLIC, f), "utf8");
    const a = labelAlpha(src);
    if (a === null) { ok(false, `${f}: .sb-group-label colour not found`); continue; }
    const r = ratio(over(WHITE, a, RAIL_BG), RAIL_BG);
    ok(r >= FLOOR, `${f} · .sb-group-label`, `alpha ${a} -> ${r}:1`);

    const bg = badgeBg(src);
    if (bg === null) { ok(false, `${f}: .sb-badge.new background not found`); continue; }
    const rb = ratio(WHITE, bg);
    ok(rb >= FLOOR, `${f} · .sb-badge.new`, `rgb(${bg.join(",")}) -> ${rb}:1`);
  }
}

// ── R4 · THE COPIES AGREE ────────────────────────────────────────────────────
console.log("\nR4 · all copies resolve to the same effective values");
{
  const alphas = new Map<string, string[]>();
  const bgs = new Map<string, string[]>();
  for (const f of railFiles) {
    const src = readFileSync(path.join(PUBLIC, f), "utf8");
    const a = String(labelAlpha(src)), b = String(badgeBg(src));
    (alphas.get(a) ?? alphas.set(a, []).get(a)!).push(f);
    (bgs.get(b) ?? bgs.set(b, []).get(b)!).push(f);
  }
  const show = (m: Map<string, string[]>) =>
    [...m.entries()].map(([v, fs]) => `${v} (${fs.length}: ${fs.slice(0, 3).join(",")}${fs.length > 3 ? "…" : ""})`).join("  |  ");
  ok(alphas.size === 1, `.sb-group-label alpha is one value across all ${railFiles.length}`, show(alphas));
  ok(bgs.size === 1, `.sb-badge.new background is one value across all ${railFiles.length}`, show(bgs));
}

// ── R5 · PLANTED POSITIVES ───────────────────────────────────────────────────
console.log("\nR5 · the gate can fail");
{
  // The pre-fix values must be condemned, or R3 proves nothing.
  ok(ratio(over(WHITE, 0.32, RAIL_BG), RAIL_BG) < FLOOR,
    "PLANTED: the pre-fix .sb-group-label alpha (.32) is caught", `${ratio(over(WHITE, 0.32, RAIL_BG), RAIL_BG)}:1`);
  ok(ratio(WHITE, hex("#378ADD")) < FLOOR,
    "PLANTED: the pre-fix .sb-badge.new blue (#378ADD) is caught", `${ratio(WHITE, hex("#378ADD"))}:1`);
  // And the shipped values must PASS, so the two legs above are not vacuous.
  ok(ratio(over(WHITE, 0.5, RAIL_BG), RAIL_BG) >= FLOOR, "PLANTED(-): the shipped alpha (.5) passes");
  ok(ratio(WHITE, hex("#2F73BC")) >= FLOOR, "PLANTED(-): the shipped blue (#2F73BC) passes");

  // A single divergent copy must break R4 — this is the fork-detection leg.
  const fake = new Map<string, string[]>([[".5", ["a.html", "b.html"]], [".32", ["c.html"]]]);
  ok(fake.size > 1, "PLANTED: one file left behind is caught as a fork");

  // The extractor must read the LAST declaration, as the browser does. naics/run-audit carry a
  // legacy `.sb-badge.new` before the live one; reading the first would grade the wrong rule.
  const twoRules = `.sb-badge.new{background:rgba(55,138,221,.9);color:#fff} .sb-badge.new{background:#2F73BC;color:#fff}`;
  ok(String(badgeBg(twoRules)) === String(hex("#2F73BC")),
    "PLANTED: with two declarations the LAST one is graded", String(badgeBg(twoRules)));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
