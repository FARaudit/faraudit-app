// PUBLIC COMMENT-LEAK GATE — every statically served public page, read as the browser reads it.
//
// WHY THIS EXISTS. The two landing PRs (#296/#297) removed unsupportable claims from the visible copy
// and left the REASONING behind in HTML comments. `public/root-landing.html` shipped to production
// narrating, in the page source of the marketing homepage:
//
//     "the figures cannot be verified against the current product at all"
//     "the only runs behind them were produced by a RETIRED engine"
//     "the recorded numbers did not match the claim either"
//
// View-Source is not a private channel. Scrapers, competitors and prospects read it, and a rationale
// comment is strictly worse than the claim it replaced: the claim was merely unsupported, the comment
// is a signed confession sitting on the front door. Rationale belongs in the commit message — where
// these two were ALREADY preserved verbatim (ab89fd3a, a782b275), which is why deleting them costs
// nothing.
//
// These files are served as static assets. Nothing strips them: the audit report has
// stripHandoffComment/stripDevComments, but `public/` bytes go to the browser exactly as committed.
// So the gate has to be the thing that stops it.
//
// SHAPE, NOT A PHRASE LIST. A denylist of banned phrases certifies its author's imagination and misses
// the next wording — the same trap the four-phrase denylist hit in _render-unbound-slots.test.ts. The
// primary rule here is a SHAPE rule: a comment on a public page is either short and structural (a
// section divider) or it is prose, and sustained prose in a comment is rationale. The marker list is a
// secondary net for short-but-internal references, never the primary signal.
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const PUBLIC_DIR = join(process.cwd(), "public");

// ── SCOPE WIDENED TO SERVED SCRIPTS ───────────────────────────────────────────────────────────────
// This sweep read .html only, and matched only <!-- -->. `public/*.js` ships with the same byte
// fidelity — nothing strips it — so a served script was free to carry exactly what this gate exists to
// stop, and the gate reported CLEAN. A shared-chrome script added under public/ made that concrete.
//
// THE .html RULE DOES NOT TRANSFER, AND MEASURING SAID SO. The primary .html signal is a SHAPE rule on
// length: an HTML comment is either a short structural divider or it is prose, and sustained prose is
// rationale. That premise is true for markup and false for scripts, where a module header is standard
// practice. Censused against the real tree before choosing: 63 of 72 authored comments in public/*.js
// exceed the 200c ceiling, and nearly all are load-bearing engineering documentation — comparator NaN
// traps, null-honesty contracts, why a string must be escaped. Porting the ceiling would demand
// deleting that, and a gate that cries wolf on real code gets switched off (the same failure the
// marker regex already had to be narrowed for).
//
// So scripts get a DIFFERENT primary rule, and it is still a shape rule: not "how long" but "what does
// this point AT". Documentation describes the code — identifiers, endpoints, invariants. Rationale
// points into the private tracker: a tracker noun with a number, a named internal authority, an
// internal tooling path, a workstream codename. That reference pattern is the shape, and it is what
// actually leaked here (`CEO ruling 2026-07-28`, `ARC #747`, `Card #769`, `pending Design card #775`
// all shipped in View-Source).
function servedFiles(dir: string): { path: string; kind: "html" | "js" }[] {
  const out: { path: string; kind: "html" | "js" }[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "vendor") continue;   // third-party bytes; not ours to rewrite
      out.push(...servedFiles(p));
    } else if (entry.endsWith(".html")) out.push({ path: p, kind: "html" });
    else if (entry.endsWith(".js")) out.push({ path: p, kind: "js" });
  }
  return out;
}

const COMMENT = /<!--([\s\S]*?)-->/g;
// A line-comment RUN is joined before judging. Measuring `//` lines one at a time would let a
// rationale paragraph wrapped across six lines read as six short comments.
const JS_BLOCK = /\/\*([\s\S]*?)\*\//g;
const JS_LINE_RUN = /(?:^[ \t]*\/\/.*(?:\r?\n|$))+/gm;

// Structural dividers are ornamental: box-drawing, dashes, equals, a short label. Strip that furniture
// and whatever is left is the prose payload.
function prosePayload(comment: string): string {
  return comment
    .replace(/[═─━=_*#·•\-—]{2,}/g, " ")   // rules and box-drawing runs
    .replace(/\s+/g, " ")
    .trim();
}

const PROSE_CEILING = 200; // chars of payload; a divider label never approaches this

// Secondary net only — short comments that name internal machinery.
// The `#` in "card #450" is REQUIRED, not optional: the first draft of this regex made it optional and
// flagged four "CARD 1: Critical P0 Flags" layout labels in home.html. A UI card label is not an
// internal card reference, and a gate that cries wolf on real markup gets switched off.
const INTERNAL_MARKER =
  /Brain ruling|CEO ruling|card #\d|ARC #\d|\bRule \d+\b|Gauntlet|flag-OFF|AUDIT_[A-Z0-9_]{3,}|\bTODO\b|\bFIXME\b|\bHACK\b|Design polishes|_render\.ts|view-model|RETIRED engine|unverifiable|red-team/i;

// The .js primary rule: what does this comment point AT. Each alternative is a REFERENCE pattern, not
// a topic word, so it stays a shape rule rather than a list of things one author thought of.
//   `#\d{3,}\b`     — a bare tracker number. The trailing \b is load-bearing: without it this matches
//                     the "#378" inside the hex colour #378ADD, which appears in every desk palette.
//   tracker + digits — card/arc/wire-map/ruling/spec/phase followed by a number, `#` optional here
//                     because "Card 366" and "Phase-1" both shipped without one.
//   named authority  — a ruling attributed to an internal role.
//   internal path    — scratchpad tooling a reader outside the repo cannot reach anyway.
//   workstream       — "Fork B", an internal codename that tells a reader nothing about the code.
// The second .js net, and the one that matters most: a CONFESSION. The incident that created this gate
// was not a tracker reference — it was a served file narrating its own former dishonesty. That shape
// recurred in public/*.js verbatim ("that gate was the fabrication bug … so invented pursuits, dollar
// figures and named contracting officers rendered as the signed-in user's own data"), and the
// reference net below catches it only by accident, through an unrelated TODO on the same comment.
//
// SHAPE: a confession talks about a PRIOR state of this code AND names a fault. Documentation talks
// about CURRENT behaviour and carries at most one of those. The CONJUNCTION is the whole precision
// story, and it was measured before being committed: across 304 comments in the real tree the
// conjunction fires 10 times, while SUPERSEDED alone fires 18 and DEFECT alone 37. Both halves are
// required — loosening to either one re-floods with legitimate documentation.
const SUPERSEDED =
  /\b(?:was|were|used to|previously|no longer|is GONE|are GONE|old|former|prior|until now|never (?:returned|did|worked|existed|ran|fired))\b/i;
// `error|inversion|regress|incorrect` were added after a planted known-positive below failed without
// them, and re-measured: fires went 10 → 12 of 304 while the half-signal counts stayed put (16 / 40),
// so the conjunction still carries the precision. The two it added disclose measured defect RATES
// ("the 42%-of-feed inversion", "the 83-row inversion") — the most sensitive class in the sweep.
const DEFECT =
  /\b(?:bug|error|inversion|regress\w*|incorrect|inaccurat\w*|fabricat\w*|invented|mock|placebo|false|wrong|broke\w*|failed|silently|misleading|unsupported|dishonest|lie[ds]?)\b/i;

const INTERNAL_REF = new RegExp([
  String.raw`#\d{3,}\b`,
  String.raw`\b(?:card|arc|wire-?map|ruling|spec|phase)s?\b[\s#:-]{0,3}\d+`,
  String.raw`\bQ\d+\s+spec\b`,
  String.raw`\b(?:CEO|Brain|Design|Code)\s+ruling\b`,
  String.raw`\bscratchpad\b`,
  String.raw`\bFork\s+[A-Z]\b`,
  String.raw`\bTODO\b`, String.raw`\bFIXME\b`, String.raw`\bHACK\b`,
  String.raw`\bGauntlet\b`, String.raw`\bflag-OFF\b`, String.raw`AUDIT_[A-Z0-9_]{3,}`
].join("|"), "i");

function findLeaks(src: string, kind: "html" | "js" = "html"): { payload: string; why: string }[] {
  const leaks: { payload: string; why: string }[] = [];

  const judgeHtml = (raw: string) => {
    const payload = prosePayload(raw);
    if (payload.length > PROSE_CEILING) leaks.push({ payload, why: `prose ${payload.length}c > ${PROSE_CEILING}` });
    else if (INTERNAL_MARKER.test(payload)) leaks.push({ payload, why: `internal marker: ${payload.match(INTERNAL_MARKER)![0]}` });
  };
  // No prose ceiling here — see the SCOPE WIDENED note. A long module header is documentation; an
  // internal reference of any length is a leak.
  const judgeJs = (raw: string) => {
    const payload = prosePayload(raw);
    if (!payload) return;
    const ref = payload.match(INTERNAL_REF);
    if (ref) { leaks.push({ payload, why: `internal reference: ${ref[0]}` }); return; }
    const sup = payload.match(SUPERSEDED), def = payload.match(DEFECT);
    if (sup && def) leaks.push({ payload, why: `confession: "${sup[0]}" + "${def[0]}"` });
  };

  if (kind === "html") {
    for (const m of src.matchAll(COMMENT)) judgeHtml(m[1]);
  } else {
    for (const m of src.matchAll(JS_BLOCK)) judgeJs(m[1].replace(/^\s*\*/gm, " "));
    for (const m of src.matchAll(JS_LINE_RUN)) judgeJs(m[0].replace(/^[ \t]*\/\//gm, " "));
  }
  return leaks;
}

// ── 0. THE GATE MUST BE ABLE TO FAIL ───────────────────────────────────────────────────────────────
// A sweep that finds nothing is the most believable false clean there is. Plant one of each kind and
// require the gate to catch both BEFORE trusting any clean result below.
{
  const plantedProse =
    `<!-- ${"The metrics in this caption came down rather than being corrected, because the only runs behind them were produced by a retired engine and cannot be verified against the current product at all. ".repeat(2)} -->`;
  const plantedMarker = `<!-- Card #450: NAICS selects now live -->`;
  const clean = `<!-- ═══ SECTION 1 — ABOVE THE FOLD ═══ -->\n<!-- nav -->`;

  assert(findLeaks(plantedProse).length === 1, "KNOWN-POSITIVE: a planted rationale comment is caught (prose ceiling)");
  assert(findLeaks(plantedMarker).length === 1, "KNOWN-POSITIVE: a planted internal card reference is caught (marker net)");
  assert(findLeaks(clean).length === 0, "KNOWN-NEGATIVE: structural dividers and short labels pass");

  // The .js path is a SEPARATE scanner with a SEPARATE rule. Inheriting the .html known-positives
  // would certify a code path that never ran, so plant against every alternative that carries a real
  // finding, in both comment forms — and prove the negatives too, because the whole calibration claim
  // is that legitimate documentation survives.
  const jsPositives: [string, string][] = [
    [`/* Card #769 re-keyed the slicers. */`, "block, tracker + #number"],
    [`  // Card 366 Phase-1 — agency column.`, "line, tracker number with no #"],
    [`/* SIX-POLE VOCABULARY (ARC #747) — v3_verdict is authoritative. */`, "arc reference"],
    [`  // Default order: most recently audited first (CEO ruling 2026-07-28).`, "named authority"],
    [`/* WIRE-MAP #456 Ruling 1 — pill "active" state. */`, "wire-map + ruling"],
    [`  // TODO: replace with the batch enrichment step.`, "roadmap marker"],
    [`/* FARaudit · Defense Agencies — Fork B live wiring. */`, "workstream codename"],
    [`/* NULL-HONESTY CONTRACT (probe: scratchpad probe-page.mjs) */`, "internal tooling path"],
    [`  // Q5 spec: structured notifications dropdown, grouped by Today/Earlier.`, "spec reference"]
  ];
  for (const [src, label] of jsPositives) {
    assert(findLeaks(src, "js").length === 1, `KNOWN-POSITIVE(js): ${label}`);
  }

  // The confession net, with the conjunction pinned from BOTH sides. The two half-signal cases are the
  // ones that matter: if either starts failing, the rule has been loosened into a topic denylist.
  const confessions: [string, string][] = [
    [`/* That gate was the fabrication bug: the endpoint never returned those fields, so invented pursuits rendered as the user's own data. */`, "served file narrating its own former dishonesty"],
    [`  // Was seven invented notifications — a named CO "opening your capability brief".`, "superseded + invented"],
    [`  // Dateline was a hardcoded date string, and therefore wrong on every day but one.`, "superseded + wrong"],
    [`/* Both the 42% set-aside inversion and the 28% stage error were unseeable because the normalised pole replaced the source token. */`, "disclosed error rates"]
  ];
  for (const [src, label] of confessions) {
    assert(findLeaks(src, "js").length === 1, `KNOWN-POSITIVE(js/confession): ${label}`);
  }
  const halves: [string, string][] = [
    [`/* The old precedence chain runs verdict first, then run state — one field, one control. */`, "SUPERSEDED alone must not fire"],
    [`/* A 0 here would be a false all-clear, so an uncomputed score renders as a neutral tile. */`, "DEFECT alone must not fire"]
  ];
  for (const [src, label] of halves) {
    const found = findLeaks(src, "js");
    assert(found.length === 0, `KNOWN-NEGATIVE(js/conjunction): ${label}${found.length ? ` — fired on ${found[0].why}` : ""}`);
  }

  // Load-bearing negatives. Each is a real comment from public/*.js that the .html ceiling WOULD have
  // condemned; if any of these starts failing, the calibration has drifted back to length.
  const jsNegatives: [string, string][] = [
    [`/* Undated rows carry Infinity (relativeAgo's ageHours, and dueTs when there is no response_deadline). \`Infinity - Infinity\` is NaN, and a comparator returning NaN is non-transitive: Array#sort then leaves that whole group in an arbitrary order, which is why the undated bucket is partitioned out before sorting instead of being compared. */`,
      "long comparator-trap doc survives"],
    [`  // Every string below originates in the SAM feed (notice titles, agency names, incumbent names are\n  // all poster-controlled text) and is interpolated into innerHTML — so it MUST be escaped. Covers\n  // attribute context too (" and ').`,
      "multi-line escaping rationale survives"],
    [`/* clamp(true): compliance_score is 0-100, and an unclamped sqrt scale extrapolates NEGATIVE below the domain floor (fit 30 gives r = -7.8, so the browser drops the circle and the row silently vanishes from the chart). */`,
      "long numeric-invariant doc survives"],
    [`  // hide when empty\n  // one owner for this badge`, "short line run survives"],
    [`/* palette: #378ADD accent, #dc2626 danger */`, "hex colours are not tracker numbers"]
  ];
  for (const [src, label] of jsNegatives) {
    const found = findLeaks(src, "js");
    assert(found.length === 0, `KNOWN-NEGATIVE(js): ${label}${found.length ? ` — flagged on ${found[0].why}` : ""}`);
  }
}

// ── 1. THE REAL SURFACE ────────────────────────────────────────────────────────────────────────────
{
  const files = servedFiles(PUBLIC_DIR);
  const nHtml = files.filter(f => f.kind === "html").length;
  const nJs = files.filter(f => f.kind === "js").length;
  assert(nHtml > 0, `sweep reached the real public/ tree (${nHtml} html files)`);
  assert(nJs > 0, `sweep covers served scripts too (${nJs} js files)`);

  let total = 0;
  for (const f of files) {
    const leaks = findLeaks(readFileSync(f.path, "utf8"), f.kind);
    total += leaks.length;
    for (const l of leaks) {
      console.log(`   ❌ ${f.path.replace(process.cwd() + "/", "")} — ${l.why}`);
      console.log(`      "${l.payload.slice(0, 160)}${l.payload.length > 160 ? "…" : ""}"`);
    }
  }
  assert(total === 0, `no served public asset leaks rationale or internal references (${total} found)`);
}

// ── 2. public/ IS AN ASSET DIRECTORY ───────────────────────────────────────────────────────────────
// Everything under public/ is served verbatim, so a file kind that is not an asset does not belong
// here at all — and the gate above cannot help, because it only knows how to read .html and .js. The
// gate suite itself was living in this directory: /_public-comment-leak.test.ts was fetchable in
// production, and these files carry the densest rationale in the repo by design.
//
// SCOPED TO WHAT GIT WOULD SHIP. This check walked the working tree with readdirSync, which counts
// files that can never reach production. `public/.DS_Store` — a Finder artifact, gitignored at
// .gitignore:24 and untracked — turned the gate RED and cost a diversion to diagnose. Deploys build
// from the repo, so the population that matters is what git carries: tracked files, PLUS untracked
// files that are not ignored (a stray one `git add -A` away from shipping). Ignored paths are the
// only thing dropped, because nothing can serve them.
//
// The rationale sweep in §1 still walks the real tree deliberately — those .html/.js files are all
// tracked, and reading bytes off disk is the closer analogue of what the browser receives.
const ASSET_EXT = /\.(html|js|css|png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot|txt|json|xml|pdf|map|webmanifest|mjs)$/i;

// tracked ∪ untracked-not-ignored, under public/. Paths come back relative to `root`.
function shippablePublicFiles(root: string): string[] {
  const out = execFileSync(
    "git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "public"],
    { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }
  );
  return out.split("\0").filter(Boolean);
}
const strayNonAssets = (paths: string[]) => paths.filter(p => !ASSET_EXT.test(p));

// ── 2a. THE SCOPING, PROVED IN BOTH DIRECTIONS ─────────────────────────────────────────────────────
// Narrowing a gate's population is precisely the move that converts a real RED into a silent pass, so
// the narrowing is proved rather than asserted, against a throwaway repo. It plants a tracked stray
// (must fail), an untracked-but-not-ignored stray (must fail — it is one `git add` from production),
// and a gitignored stray (must NOT fail). And it first proves the OLD raw walk condemns the ignored
// artifact: without that leg, "the ignored file did not fire" is equally satisfied by a fixture that
// never contained one.
{
  const tmp = mkdtempSync(join(tmpdir(), "leakgate-scope-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: tmp });
    writeFileSync(join(tmp, ".gitignore"), ".DS_Store\n");
    mkdirSync(join(tmp, "public"));
    writeFileSync(join(tmp, "public", "index.html"), "<!-- nav -->");
    writeFileSync(join(tmp, "public", "HANDOFF.md"), "internal notes");   // stray, will be tracked
    writeFileSync(join(tmp, "public", ".DS_Store"), "Bud1");              // stray, gitignored
    execFileSync("git", ["add", "-A"], { cwd: tmp });
    writeFileSync(join(tmp, "public", "scratch.md"), "notes");            // stray, untracked, NOT ignored

    const walked: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p); else walked.push(p);
      }
    };
    walk(join(tmp, "public"));
    assert(strayNonAssets(walked).some(p => p.endsWith(".DS_Store")),
      "FIXTURE: the old working-tree walk does condemn the gitignored artifact (the bug being fixed)");

    const shipped = shippablePublicFiles(tmp);
    const found = strayNonAssets(shipped);
    assert(found.includes("public/HANDOFF.md"),
      `SCOPE(+): a TRACKED stray non-asset still fails${found.length ? "" : " — nothing flagged"}`);
    assert(found.includes("public/scratch.md"),
      "SCOPE(+): an UNTRACKED, un-ignored stray still fails (one `git add -A` from shipping)");
    assert(!found.some(p => p.endsWith(".DS_Store")),
      `SCOPE(−): a GITIGNORED stray does not fail${found.length > 2 ? ` — flagged ${found.join(", ")}` : ""}`);
    assert(shipped.includes("public/index.html"),
      "SCOPE: legitimate tracked assets are still enumerated");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── 2b. THE REAL public/ ───────────────────────────────────────────────────────────────────────────
{
  let shipped: string[] | null = null;
  try {
    shipped = shippablePublicFiles(process.cwd());
  } catch (e) {
    // No fail-open: if git cannot enumerate, the check is blind and must say so in red.
    assert(false, `git could not enumerate public/ — stray check is blind (${String((e as Error).message).split("\n")[0]})`);
  }
  // A vacuous empty list would pass the stray assertion for free. Anchor it.
  assert((shipped?.length ?? 0) > 0, `stray check reached git's view of public/ (${shipped?.length ?? 0} shippable files)`);

  const found = strayNonAssets(shipped ?? []);
  for (const s of found) console.log(`   ❌ non-asset file served from public/: ${s}`);
  assert(found.length === 0, `public/ contains only servable asset types (${found.length} stray file(s))`);
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
