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

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (entry.endsWith(".html")) out.push(p);
  }
  return out;
}

const COMMENT = /<!--([\s\S]*?)-->/g;

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

function findLeaks(html: string): { payload: string; why: string }[] {
  const leaks: { payload: string; why: string }[] = [];
  for (const m of html.matchAll(COMMENT)) {
    const payload = prosePayload(m[1]);
    if (payload.length > PROSE_CEILING) leaks.push({ payload, why: `prose ${payload.length}c > ${PROSE_CEILING}` });
    else if (INTERNAL_MARKER.test(payload)) leaks.push({ payload, why: `internal marker: ${payload.match(INTERNAL_MARKER)![0]}` });
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
}

// ── 1. THE REAL SURFACE ────────────────────────────────────────────────────────────────────────────
{
  const files = htmlFiles(PUBLIC_DIR);
  assert(files.length > 0, `sweep reached the real public/ tree (${files.length} html files)`);

  let total = 0;
  for (const f of files) {
    const leaks = findLeaks(readFileSync(f, "utf8"));
    total += leaks.length;
    for (const l of leaks) {
      console.log(`   ❌ ${f.replace(process.cwd() + "/", "")} — ${l.why}`);
      console.log(`      "${l.payload.slice(0, 160)}${l.payload.length > 160 ? "…" : ""}"`);
    }
  }
  assert(total === 0, `no served public page leaks rationale or internal references (${total} found)`);
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
