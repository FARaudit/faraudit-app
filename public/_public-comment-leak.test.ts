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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const PUBLIC_DIR = join(process.cwd(), "public");

function servedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...servedFiles(p));
    // .js is served verbatim too — the same rationale leaks through a /* */ or
    // // comment as through <!-- -->. Vendored bundles are excluded (not ours).
    else if (entry.endsWith(".html")) out.push(p);
    else if (entry.endsWith(".js") && !p.includes("/vendor/") && !entry.endsWith(".min.js")) out.push(p);
  }
  return out;
}

const COMMENT = /<!--([\s\S]*?)-->/g;
// JS comment forms. Line comments are grouped into runs first so a multi-line
// // header is measured as the one payload it reads as, not N short fragments.
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

function judge(raw: string, leaks: { payload: string; why: string }[]): void {
  const payload = prosePayload(raw);
  if (payload.length > PROSE_CEILING) leaks.push({ payload, why: `prose ${payload.length}c > ${PROSE_CEILING}` });
  else if (INTERNAL_MARKER.test(payload)) leaks.push({ payload, why: `internal marker: ${payload.match(INTERNAL_MARKER)![0]}` });
}

function findLeaks(html: string): { payload: string; why: string }[] {
  const leaks: { payload: string; why: string }[] = [];
  for (const m of html.matchAll(COMMENT)) judge(m[1], leaks);
  return leaks;
}

// .js gets the MARKER net only — deliberately NOT the prose ceiling. A served
// script legitimately carries long explanatory comments (that is ordinary code
// documentation, and the HTML ceiling would flag ~40 of them across public/).
// What must never ship is internal narration: probe/tooling paths, defect
// history, and the card/rule/flag references INTERNAL_MARKER already covers.
const JS_NARRATION =
  /scratchpad|probe-[a-z0-9-]+\.mjs|run RED|RED pre-fix|\bpre-fix\b|known-positive|falsification|\bmeasured:|\breproduced:/i;

function judgeJs(raw: string, leaks: { payload: string; why: string }[]): void {
  const payload = prosePayload(raw);
  if (INTERNAL_MARKER.test(payload)) leaks.push({ payload, why: `internal marker: ${payload.match(INTERNAL_MARKER)![0]}` });
  else if (JS_NARRATION.test(payload)) leaks.push({ payload, why: `internal narration: ${payload.match(JS_NARRATION)![0]}` });
}

function findJsLeaks(src: string): { payload: string; why: string }[] {
  const leaks: { payload: string; why: string }[] = [];
  for (const m of src.matchAll(JS_BLOCK)) judgeJs(m[1], leaks);
  for (const m of src.matchAll(JS_LINE_RUN)) judgeJs(m[0].replace(/^[ \t]*\/\//gm, ""), leaks);
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
  assert(findJsLeaks("/* probe: scratchpad probe-page.mjs, run RED pre-fix */").length === 1,
    "KNOWN-POSITIVE (js): planted internal narration in a block comment is caught");
  assert(findJsLeaks("// see card #450 for the ruling\n// second line\n").length === 1,
    "KNOWN-POSITIVE (js): planted card reference in a line-comment run is caught");
  assert(findJsLeaks("/* Maps the SAM set-aside string to the display key; empty means full and open. */").length === 0,
    "KNOWN-NEGATIVE (js): ordinary long code documentation passes");
}

// PRE-EXISTING .js BASELINE (dated 2026-07-29). Widening this gate from .html
// to .js surfaced 22 leaks in scripts that predate it — all internal markers
// (TODO/FIXME notes) in Fork-B live-wiring files owned by other work. They are
// listed EXPLICITLY, per file, so that: (a) the gate fails on any NEW leak and
// on any new file, and (b) the debt is visible rather than absorbed. Shrinking
// this list is a standalone cleanup; nothing may be added to it.
const JS_BASELINE: Record<string, number> = {
  "public/cmmc-readiness-live.js": 1,
  "public/command-center-live.js": 1,
  "public/contracting-officers-live.js": 1,
  "public/dashboard-live.js": 13,
  "public/far-dfars-updates-live.js": 1,
  "public/gao-protests-live.js": 1,
  "public/profile-settings-live.js": 1,
  "public/teaming-partners-live.js": 1,
  "public/wage-benchmarks-live.js": 1,
};

// ── 1. THE REAL SURFACE ────────────────────────────────────────────────────────────────────────────
{
  const files = servedFiles(PUBLIC_DIR);
  const htmlN = files.filter((f) => f.endsWith(".html")).length;
  const jsN = files.filter((f) => f.endsWith(".js")).length;
  assert(htmlN > 0 && jsN > 0, `sweep reached the real public/ tree (${htmlN} html + ${jsN} js files)`);

  let total = 0;
  let baselined = 0;
  for (const f of files) {
    const rel = f.replace(process.cwd() + "/", "");
    const src = readFileSync(f, "utf8");
    const leaks = f.endsWith(".js") ? findJsLeaks(src) : findLeaks(src);
    const allowed = JS_BASELINE[rel] ?? 0;
    // A baselined file may not get WORSE: only the known count is forgiven.
    const excess = leaks.length - allowed;
    baselined += Math.min(leaks.length, allowed);
    if (excess <= 0) continue;
    total += excess;
    for (const l of leaks) {
      console.log(`   ❌ ${rel} — ${l.why}`);
      console.log(`      "${l.payload.slice(0, 160)}${l.payload.length > 160 ? "…" : ""}"`);
    }
  }
  if (baselined > 0) console.log(`   ⚠️  ${baselined} pre-existing .js leak(s) forgiven by the dated baseline — see JS_BASELINE.`);
  assert(total === 0, `no served public asset leaks rationale or internal references (${total} found)`);
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
