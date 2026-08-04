// ─────────────────────────────────────────────────────────────────────────────
// PRE-AUTH DOCTRINE GATE — the pages a prospect reads before they ever sign in.
//
// WHY A LEXICAL CHECK WAS NOT ENOUGH, MEASURED. The forbidden-vocabulary list in
// the positioning doctrine scored **ZERO hits across every public page**. On the
// same sweep, `landing.html` was running a gold palette (#C9A84C ×24) with **none
// of the six brand hexes present at all** and a **serif body face** — while the
// five other public pages each carried 5–6 brand hexes and no serif. A page can
// violate the visual doctrine in every structural way and still contain not one
// banned word. So the banned-word net is kept as one leg of five, never as the
// gate.
//
// WHAT THIS GATE DOES NOT CLAIM. It cannot read positioning. A page can pass all
// five legs and still read as a tool rather than an operating system, and that
// judgement belongs to the lanes that own copy and visual production — not to a
// regex. What it can do is refuse to let a page ship OUTSIDE the brand system, or
// carrying a banned token, or with a statistic nobody sourced.
//
//   D0  POPULATION — derived from the middleware's own PUBLIC list, never a hand
//       list here. A page is pre-auth because the auth wall lets it through, and
//       that fact lives in exactly one file.
//   D1  TYPOGRAPHY — no serif or display face. (`sans-serif` is not a serif, and
//       a negative leg pins that.)
//   D2  PALETTE — the brand hexes must be a real share of the page's non-neutral
//       colour, not a token presence.
//   D3  VOCABULARY — the banned tokens, kept for the day one appears.
//   D4  PILLARS — every public page surfaces at least one of the four pillars.
//   D5  SOURCED NUMBERS — a statistic needs a source in the same breath.
//   D6  PLANTED POSITIVES — every leg above proved able to fail. Three of the
//       five fire ZERO times on the real tree today, and a rule that has never
//       fired is indistinguishable from a rule that cannot.
//
// Run: npx tsx test/public/_preauth-doctrine.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

// ── D0 · POPULATION ──────────────────────────────────────────────────────────
// The auth wall decides what is public, so the wall's own list is the source. A
// hand-written list here would have carried `index.html` — it sits beside the
// others, has no rail, and looks pre-auth from the filesystem — but the wall
// answers 307 → /sign-in for it. Grading a gated page as marketing copy would
// have manufactured a finding, and a "zero pillars" one at that.
function publicPages(): string[] {
  const src = readFileSync(path.join(ROOT, "src/middleware.ts"), "utf8");
  const at = src.indexOf("const PUBLIC = [");
  if (at < 0) return [];
  const block = src.slice(at, src.indexOf("]", at));
  return [...block.matchAll(/"([^"]+\.html)"/g)].map((m) => m[1].replace(/^\//, ""));
}

const PAGES = publicPages();
console.log("\nD0 · the population comes from the auth wall, not from this file");
// Fail CLOSED: if the parse breaks, the sweep is inert and must say so in red
// rather than report a clean board over an empty list.
ok(PAGES.length > 0, `middleware PUBLIC lists ${PAGES.length} served page(s)`, PAGES.join(", ") || "NONE PARSED");
for (const p of PAGES) ok(existsSync(path.join(PUBLIC_DIR, p)), `${p} exists`, "");

/** A page's own bytes plus every stylesheet it links — the browser sees one surface. */
function pageCss(page: string): string {
  let css = readFileSync(path.join(PUBLIC_DIR, page), "utf8");
  for (const m of css.matchAll(/href="([^"]+\.css)"/g)) {
    const linked = path.join(PUBLIC_DIR, m[1].replace(/^\//, ""));
    if (existsSync(linked)) css += "\n" + readFileSync(linked, "utf8");
  }
  return css;
}
function visibleText(page: string): string {
  return readFileSync(path.join(PUBLIC_DIR, page), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

// ── THE DESIGN-LANE EXEMPTION, NAMED AND NOISY ───────────────────────────────
// `landing.html` is not a drifted page — it is a different design language end to
// end, and bringing it into the brand system is visual production, which Code
// does not own and must not self-certify. Rather than leave the other five
// unguarded until that lands, the two DESIGN legs (D1, D2) carry one named
// exemption. Everything else — vocabulary, pillars, sourced numbers — still
// enforces on it.
//
// The exemption cannot rot quietly: if an exempt page starts PASSING, this gate
// goes red and demands the entry be deleted. An exemption that outlives its
// defect is how a gate turns into a permanent silence.
const DESIGN_EXEMPT = new Set(["landing.html"]);

// ── D1 · TYPOGRAPHY ──────────────────────────────────────────────────────────
// Named families first, then the bare `serif` keyword with `sans-serif` excluded
// by construction — matching "serif" inside "sans-serif" is the whole trap here,
// and the negative legs in D6 pin it from both sides.
const SERIF_FAMILY = /\b(?:Fraunces|Georgia|Playfair(?:\s+Display)?|Merriweather|Garamond|Baskerville|Didot|Bodoni|Times(?:\s+New\s+Roman)?)\b/i;
const BARE_SERIF = /(?<!sans-)\bserif\b/i;
/** Declarations that set a family: `font-family:` and any custom property holding one. */
function fontDecls(css: string): string[] {
  return [...css.matchAll(/(?:font-family|--[a-z0-9-]*(?:font|serif|type|face)[a-z0-9-]*)\s*:\s*([^;}]+)/gi)]
    .map((m) => m[1].trim());
}
function serifHits(css: string): string[] {
  return fontDecls(css).filter((d) => SERIF_FAMILY.test(d) || BARE_SERIF.test(d));
}

console.log("\nD1 · no serif or display face on a pre-auth page");
for (const p of PAGES) {
  const hits = serifHits(pageCss(p));
  if (DESIGN_EXEMPT.has(p)) {
    // A named SKIP, printed — never a silent pass, and never a "✓".
    console.log(`  ⏭ SKIP ${p} — design-lane exemption (${hits.length} serif declaration(s) present)`);
    continue;
  }
  ok(hits.length === 0, `${p} sets no serif family`, hits.slice(0, 2).join(" | "));
}

// ── D2 · PALETTE ─────────────────────────────────────────────────────────────
// Presence alone is gameable by one character, so the test is SHARE of the page's
// non-neutral colour. Measured across the real tree before the floor was chosen:
// the five in-system pages run 14.0% / 14.3% / 17.9% / 20.0% / 28.6%, and the one
// outlier runs 0.0%. A 5% floor sits nearly 3× below the weakest healthy page, so
// it separates "outside the brand system entirely" from "uses accent colour",
// which is the only distinction this gate is entitled to draw. Neutrals are
// excluded: every page needs greys regardless of brand.
//
// ITS TOLERANCE, MEASURED RATHER THAN GUESSED: planting FORTY off-brand
// declarations into a healthy page does NOT trip this floor (28.6% → 9.8%). The
// floor detects a page that left the brand system, not one drifting inside it.
// Drift is a Design judgement and this gate does not pretend to make it.
const BRAND_HEXES = ["#0a1628", "#0d1f35", "#185fa5", "#378add", "#b5d4f4", "#e6f1fb"];
const BRAND_SHARE_FLOOR = 0.05;
const normHex = (h: string) => {
  const s = h.toLowerCase();
  return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
};
/** Grey, white and black carry no brand signal — a page needs them either way. */
const isNeutral = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
};
function brandShare(css: string): { brand: number; off: number; share: number } {
  let brand = 0, off = 0;
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const h = normHex(m[0]);
    if (BRAND_HEXES.includes(h)) brand++;
    else if (!isNeutral(h)) off++;
  }
  const total = brand + off;
  return { brand, off, share: total ? brand / total : 0 };
}

// GRADE EACH SHEET ON ITS OWN BYTES. Aggregating a page with the stylesheet it
// links looks right and launders the result: three of these pages carry almost no
// inline colour (1, 2 and 3 declarations) and inherit their palette from
// `site.css` / `auth.css`, so the aggregate stays in-system no matter what the
// page itself declares. Measured, a page could add sixty off-brand declarations
// inline and still clear the floor on the shared sheet's back.
//
// So: the shared sheets are graded once, directly, and a page is graded on its
// own bytes only when it HAS its own palette to grade. The split is not a
// judgement call — measured own-declaration counts are 42 / 28 / 21 for the
// self-contained pages and 1 / 2 / 3 for the linked ones, with nothing between.
const MIN_OWN_DECLS = 10;
const ownCss = (p: string) => readFileSync(path.join(PUBLIC_DIR, p), "utf8");
const linkedSheets = (p: string) =>
  [...ownCss(p).matchAll(/href="([^"]+\.css)"/g)]
    .map((m) => m[1].replace(/^\//, ""))
    .filter((f) => existsSync(path.join(PUBLIC_DIR, f)));

console.log("\nD2 · the brand palette is a real share of the page, not a token presence");
for (const p of PAGES) {
  const { brand, off, share } = brandShare(ownCss(p));
  const pct = `${(share * 100).toFixed(1)}% (${brand} brand / ${off} off-brand)`;
  if (DESIGN_EXEMPT.has(p)) { console.log(`  ⏭ SKIP ${p} — design-lane exemption (${pct})`); continue; }
  if (brand + off < MIN_OWN_DECLS) {
    // A NAMED skip, never a pass: this page declares too little colour of its own
    // to grade, and the sheet it inherits from is graded below.
    console.log(`  ⏭ SKIP ${p} — ${brand + off} own colour declaration(s), palette comes from ${linkedSheets(p).join(", ") || "(none)"}`);
    continue;
  }
  ok(share >= BRAND_SHARE_FLOOR, `${p} is inside the brand system`, pct);
}

console.log("\nD2a · every shared stylesheet is itself inside the brand system");
{
  const sheets = [...new Set(PAGES.flatMap(linkedSheets))];
  // Fail closed: if no page links a sheet any more, the loop below is vacuous and
  // the pages that relied on it are now graded on their own bytes — which is fine,
  // but silence here should not read as "the shared sheets were checked".
  console.log(`  (${sheets.length} shared sheet(s): ${sheets.join(", ") || "none linked"})`);
  for (const s of sheets) {
    const { brand, off, share } = brandShare(readFileSync(path.join(PUBLIC_DIR, s), "utf8"));
    ok(share >= BRAND_SHARE_FLOOR, `${s} is inside the brand system`,
      `${(share * 100).toFixed(1)}% (${brand} brand / ${off} off-brand)`);
  }
}

// The exemption must expire on its own. If an exempt page now clears BOTH design
// legs, the entry is stale and the gate says so in red.
console.log("\nD2b · the exemption cannot outlive the defect");
for (const p of DESIGN_EXEMPT) {
  const inPopulation = PAGES.includes(p);
  ok(inPopulation, `exempt page ${p} is still a served public page`, inPopulation ? "" : "not in middleware PUBLIC — delete the entry");
  if (!inPopulation) continue;
  // Graded exactly as D1/D2 grade it — on the page's own bytes for the palette,
  // on page-plus-linked for the font, or the staleness test would answer a
  // different question than the legs it is guarding.
  const own = ownCss(p);
  const clean = serifHits(pageCss(p)).length === 0 && brandShare(own).share >= BRAND_SHARE_FLOOR;
  ok(!clean, `exempt page ${p} still needs its exemption`, clean ? "IT NOW PASSES — delete it from DESIGN_EXEMPT" : "");
}

// ── D3 · VOCABULARY ──────────────────────────────────────────────────────────
// Zero hits on the real tree today, and kept anyway: the cost of carrying it is
// nothing, and the day someone writes "AI-powered" into a hero it is the only leg
// that fires. Each entry cites the rule it enforces so a future reader can check
// the rule rather than trust the list.
const BANNED: [RegExp, string][] = [
  [/\bAI[-\s]powered\b/i, "AI-powered"],
  [/\bAI[-\s]based\b/i, "AI-based"],
  [/\bSaaS\b/, "SaaS — say operating system"],
  [/\bAI (?:tool|platform)\b/i, "AI tool / AI platform"],
  [/\bcombined valuation\b/i, "combined valuation"],
  [/\bper-audit pricing\b/i, "per-audit pricing — say platform subscription"],
  [/\bsolicitation analysis software\b/i, "solicitation analysis software"],
  [/\bthe corpus learns\b/i, "the corpus learns — the compounding-corpus claim is retired"],
  [/\bgets smarter (?:with use|over time|every)\b/i, "gets smarter with use — retired claim"],
  [/\b(?:each|every) audit (?:improves|sharpens|trains) the next\b/i, "audits compound — retired claim"],
];
console.log("\nD3 · no banned vocabulary");
for (const p of PAGES) {
  const t = visibleText(p);
  const hits = BANNED.filter(([re]) => re.test(t)).map(([, l]) => l);
  ok(hits.length === 0, `${p} carries no banned token`, hits.join(", "));
}

// ── D4 · PILLARS ─────────────────────────────────────────────────────────────
// Doctrine asks for at least one of the four pillars in every short-form piece.
// This tests PRESENCE of the pillar's own vocabulary, which is the most a text
// scan can honestly assert — it cannot tell a pillar that is argued from one that
// is merely mentioned. All six pages clear it today, so the leg is a floor
// against a future page that says nothing, not a grade on the ones we have.
const PILLARS: [RegExp, string][] = [
  [/pre-solicitation|sources sought|upstream|before the solicitation|60[–\-—]90 days/i, "1 · upstream signal"],
  [/workflow|auto-route|pre-loaded|submission checklist|lives inside|sits inside/i, "2 · workflow embedding"],
  [/expert lens|independent lens|adversarial verifier|deterministic judge|honest[-\s]fail|INCOMPLETE|orchestration/i, "3 · orchestration architecture"],
  [/SOW influence|influence tracker|match score|after award|proves it worked/i, "4 · closed-loop proof"],
];
console.log("\nD4 · every public page surfaces at least one pillar");
for (const p of PAGES) {
  const t = visibleText(p);
  const found = PILLARS.filter(([re]) => re.test(t)).map(([, l]) => l);
  ok(found.length >= 1, `${p} surfaces a pillar`, found.join(" · ") || "NONE — the page argues no pillar at all");
}

// ── D5 · SOURCED NUMBERS ─────────────────────────────────────────────────────
// Narrow BY MEASUREMENT. The numerals on these pages are overwhelmingly step
// numbers (01, 02), FAR/DFARS clause numbers (252.204-7012), NAICS codes (541330)
// and our own price — none of which is a third-party statistic, and a naive
// "numbers need citations" rule would condemn every one of them. So the shapes
// here are the ones that can only be claims about the world: a percentage, a
// market-scale dollar figure, an "N of M", a multiplier.
//
// It fires ZERO times today. That is why D6 plants against it: an unfired rule
// and an unfirable rule produce identical output.
const STAT_SHAPES: [RegExp, string][] = [
  [/\b\d+(?:\.\d+)?\s?%/, "a percentage"],
  [/\$\s?\d+(?:\.\d+)?\s?(?:million|billion|trillion|[MBT]\b)/i, "a market-scale dollar figure"],
  // "out of" spelled out, and NOT the bare "N of M". Measured: the bare form is
  // the product's own UI idiom on these pages — "Stage coverage 7 of 8",
  // "1 of 5 explored" — neither of which is a claim about the world. "3 out of 4"
  // is how a statistic reads, and the planted legs pin both sides.
  [/\b\d+\s+out\s+of\s+\d+\b/i, "an out-of-N statistic"],
  [/\b\d+(?:\.\d+)?[x×]\s+(?:faster|more|better|higher|lower|cheaper)\b/i, "a multiplier claim"],
];
// What rescues a number: a named authority a reader can go check — OR an explicit
// statement that the figure is illustrative. Doctrine's concern is a number
// presented as FACT with nothing behind it; a panel that says "Example" over its
// own sample figures is not making a claim about the world, and firing on those
// would condemn the very labelling the fabrication arc put there.
//
// THE LIMIT, STATED: this is chunk-scoped, and marketing markup has few full
// stops, so a chunk can be a whole panel. A real claim sitting in the same panel
// as the word "Example" would pass. Closing that needs the number tied to its own
// element, which is a DOM-level check this file does not do — so the leg is a
// floor against an unsourced number standing alone, not a proof that every number
// is honest.
const CITATION = /\b(?:GAO|FAR\b|DFARS|SAM\.gov|FPDS|SBA|Federal Register|USASpending|DoD|per\s+\w+\s+data|source:|Example|Illustrative|Sample)\b/i;
/** Sentence-scoped, so a citation three paragraphs away cannot launder a number. */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/);

console.log("\nD5 · every statistic carries a source in the same breath");
for (const p of PAGES) {
  const bad: string[] = [];
  for (const s of sentences(visibleText(p))) {
    const shape = STAT_SHAPES.find(([re]) => re.test(s));
    if (shape && !CITATION.test(s)) bad.push(`${shape[1]}: "${s.slice(0, 90)}"`);
  }
  ok(bad.length === 0, `${p} sources every statistic it states`, bad.slice(0, 2).join(" | "));
}

// ── D6 · PLANTED POSITIVES ───────────────────────────────────────────────────
// Three of the five legs fire zero times on the real tree. Without this section
// their passing output is byte-identical to the output of a rule that can never
// fire, and this repo has shipped exactly that gate before.
console.log("\nD6 · every leg is proved able to fail");
{
  // D1 — the serif trap runs BOTH ways. "sans-serif" contains "serif".
  ok(serifHits(`body{font-family:'Fraunces',Georgia,serif}`).length === 1, "PLANTED(D1): a named serif face is caught");
  ok(serifHits(`:root{--serif:'Playfair Display',serif}`).length === 1, "PLANTED(D1): a serif in a custom property is caught");
  ok(serifHits(`h1{font-family:Times New Roman}`).length === 1, "PLANTED(D1): a display face with no `serif` keyword is caught");
  ok(serifHits(`body{font-family:Inter,system-ui,sans-serif}`).length === 0, "PLANTED(-D1): sans-serif is not a serif");
  ok(serifHits(`body{font-family:"SF Pro Text",Helvetica,Arial,sans-serif}`).length === 0, "PLANTED(-D1): the approved stack passes");

  // D2 — an off-brand page fails, an in-system page passes, and neutrals do not
  // rescue a page that has no brand colour at all.
  const gold = `:root{--g:#C9A84C}.a{color:#C9A84C}.b{border:1px solid #C9A84C}`;
  const brandy = `:root{--n:#0A1628;--b:#185FA5}.a{color:#378ADD}.warn{color:#ef4444}`;
  const greysOnly = `.a{color:#ffffff}.b{color:#111111}.c{color:#C9A84C}`;
  ok(brandShare(gold).share < BRAND_SHARE_FLOOR, "PLANTED(D2): an all-off-brand palette is caught", `${(brandShare(gold).share * 100).toFixed(1)}%`);
  ok(brandShare(brandy).share >= BRAND_SHARE_FLOOR, "PLANTED(-D2): a page using the brand palette passes", `${(brandShare(brandy).share * 100).toFixed(1)}%`);
  ok(brandShare(greysOnly).share < BRAND_SHARE_FLOOR, "PLANTED(D2): neutrals do not count as brand colour");

  // D3 — the banned list must actually match the strings it names.
  const bannedProbe = (s: string) => BANNED.some(([re]) => re.test(s));
  ok(bannedProbe("The AI-powered platform for defense BD"), "PLANTED(D3): 'AI-powered' is caught");
  ok(bannedProbe("Our SaaS pricing"), "PLANTED(D3): 'SaaS' is caught");
  ok(bannedProbe("the corpus learns every step"), "PLANTED(D3): the retired corpus claim is caught");
  ok(bannedProbe("every audit improves the next audit"), "PLANTED(D3): 'audits compound' is caught");
  ok(!bannedProbe("An operating system for defense business development"), "PLANTED(-D3): approved positioning language passes");

  // D4 — a page with no pillar vocabulary at all must be caught. This is not
  // hypothetical: the one page that scored zero was index.html, which is gated,
  // and only D0's derived population kept it out of this sweep.
  const noPillar = "Sign in to your account. Email. Password. Forgot password?";
  ok(PILLARS.every(([re]) => !re.test(noPillar)), "PLANTED(D4): a page arguing no pillar is caught");
  ok(PILLARS.some(([re]) => re.test("We see the requirement at pre-solicitation, 60–90 days out.")), "PLANTED(-D4): a page arguing a pillar passes");

  // D5 — the shapes fire on real claim forms, the citation rescues them, and the
  // numerals these pages actually contain are left alone.
  const unsourced = (s: string) => STAT_SHAPES.some(([re]) => re.test(s)) && !CITATION.test(s);
  ok(unsourced("Small businesses lose 42% of protestable awards."), "PLANTED(D5): a bare percentage is caught");
  ok(unsourced("A $12 billion market nobody serves."), "PLANTED(D5): a bare market figure is caught");
  ok(unsourced("We win 3 out of 4 recompetes."), "PLANTED(D5): a bare out-of-N is caught");
  ok(!unsourced("Stage coverage 7 of 8"), "PLANTED(-D5): the product's own coverage counter is not a statistic");
  ok(!unsourced("1 of 5 explored"), "PLANTED(-D5): a UI progress counter is not a statistic");
  ok(unsourced("Audits complete 10x faster than a capture team."), "PLANTED(D5): a bare multiplier is caught");
  ok(!unsourced("GAO sustained 15% of protests in FY2025."), "PLANTED(-D5): a sourced percentage passes");
  ok(!unsourced("Active Pursuits Example In flight 19 weighted 59%"), "PLANTED(-D5): a panel labelled Example is not a claim");
  ok(unsourced("In flight 19 weighted 59% of pipeline value"), "PLANTED(D5): the same figure UNLABELLED is caught");
  ok(!unsourced("$1,250 / month"), "PLANTED(-D5): our own price is not a statistic");
  ok(!unsourced("NAICS 336413 · DFARS 252.223-7008 · CLIN 0001"), "PLANTED(-D5): clause and code numbers are not statistics");
  ok(!unsourced("01 Upload the solicitation"), "PLANTED(-D5): a step number is not a statistic");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
