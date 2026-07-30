// PAST-AUDITS LEDGER GATE — batch of 2026-07-29 (sort determinism + truncation honesty).
//
// Companion to _past-audits-filter-reset.test.ts. Same fail-closed discipline
// (learned when that gate scored green checks on an HTTP 307 body): assert a
// fingerprint BEFORE any absence-based check, so a redirect / 404 / empty file
// aborts instead of passing.
//
// The comparator section EXECUTES THE SHIPPED FUNCTION BODY, extracted from
// dashboard-live.js and eval'd — not a re-implementation. A re-implementation
// would be self-consistent by construction and could pass while the shipped
// sort stayed broken.
//
// Falsification (run BOTH ways — a gate that cannot fail proves nothing):
//   npx tsx test/public/_past-audits-ledger.test.ts                → PASS
//   git show <pre-fix>:public/dashboard-live.js > /tmp/old.js
//   npx tsx test/public/_past-audits-ledger.test.ts /tmp/old.js    → FAIL

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2] || join(process.cwd(), "public", "dashboard-live.js");
const src = readFileSync(SRC, "utf8");
const HTML = join(process.cwd(), "public", "past-audits.html");
console.log(`target: ${SRC} (${src.length} bytes)\n`);

// ── fail closed on unrecognizable bytes (the #343 lesson) ────────────────────
const FINGERPRINT: Array<[string, RegExp]> = [
  ["dashboard-live IIFE header", /Past Audits \/ Dashboard live wiring/],
  ["the STATE object", /\bvar\s+STATE\s*=\s*\{/],
  ["the sort function", /function\s+sortedRows/],
];
const missing = FINGERPRINT.filter(([, re]) => !re.test(src)).map(([n]) => n);
if (missing.length) {
  console.error(`❌ ABORT — target is not public/dashboard-live.js (missing: ${missing.join(", ")}).`);
  console.error(`   First 120 bytes: ${JSON.stringify(src.slice(0, 120))}`);
  process.exit(2);
}

let failures = 0;
const assert = (c: boolean, m: string) => {
  console.log(`${c ? "✅" : "❌"} ${m}`);
  if (!c) failures++;
};

// ═══ 1. SORT DETERMINISM — no NaN comparator ═════════════════════════════════
// Undated rows carry Infinity (ageHours and dueTs). `Infinity - Infinity` is NaN;
// a NaN-returning comparator is non-transitive and Array#sort's result becomes
// implementation-defined for that group.
const cmpSrc = src.match(/function\s+cmpNumUndatedLast\s*\([\s\S]*?\n  \}/);
assert(!!cmpSrc, "cmpNumUndatedLast exists (the shared undated-safe comparator)");

if (cmpSrc) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const cmp = new Function(`${cmpSrc[0]}; return cmpNumUndatedLast;`)() as (x: number, y: number, d: number) => number;

  assert(cmp(Infinity, Infinity, 1) === 0, "two undated rows compare equal (was NaN → non-transitive sort)");
  assert(Number.isFinite(cmp(Infinity, Infinity, 1)), "comparator never returns NaN for the undated pair");
  assert(cmp(Infinity, 5, 1) === 1 && cmp(5, Infinity, 1) === -1, "undated sorts AFTER dated, ascending");
  assert(cmp(Infinity, 5, -1) === 1 && cmp(5, Infinity, -1) === -1, "undated stays AFTER dated when reversed (never jumps to the top)");
  assert(cmp(1, 2, 1) < 0 && cmp(2, 1, 1) > 0, "dated rows still order ascending");
  assert(cmp(1, 2, -1) > 0 && cmp(2, 1, -1) < 0, "dated rows still reverse");

  // Real sort over a mixed set, both directions — the property that actually broke.
  for (const dir of [1, -1]) {
    const rows = [
      { n: "a", v: 300 }, { n: "b", v: Infinity }, { n: "c", v: 100 },
      { n: "d", v: Infinity }, { n: "e", v: 200 }, { n: "f", v: Infinity },
    ];
    const out = rows.slice().sort((x, y) => cmp(x.v, y.v, dir));
    const undatedTail = out.slice(-3).every((r) => r.v === Infinity);
    assert(undatedTail, `dir=${dir}: all three undated rows land in the tail (order: ${out.map((r) => r.n).join("")})`);
    const dated = out.filter((r) => r.v !== Infinity).map((r) => r.v);
    const expected = dir === 1 ? [100, 200, 300] : [300, 200, 100];
    assert(JSON.stringify(dated) === JSON.stringify(expected), `dir=${dir}: dated rows correctly ordered (${dated.join(",")})`);
  }
}

// Every numeric sort key must route through it — a second raw subtraction would
// reintroduce the class on a different column.
const rawSubtraction = [...src.matchAll(/STATE\.sortDir\s*\*\s*\((x|y)\.\w+\s*-\s*(x|y)\.\w+\)/g)];
rawSubtraction.forEach((m) => {
  const line = src.slice(0, m.index ?? 0).split("\n").length;
  assert(false, `dashboard-live.js:${line} still sorts by raw subtraction (${m[0]}) — Infinity-Infinity is NaN`);
});
assert(rawSubtraction.length === 0, "no numeric sort key bypasses cmpNumUndatedLast with a raw subtraction");

// ═══ 2. TRUNCATION HONESTY ═══════════════════════════════════════════════════
assert(/var\s+LEDGER_CAP\s*=\s*\d+/.test(src), "LEDGER_CAP names the render/honesty boundary");
assert(
  /limit=" \+ \(LEDGER_CAP \+ 1\)/.test(src),
  "the fetch asks for LEDGER_CAP+1 so overflow is OBSERVED, not inferred from length===cap"
);
assert(!/api\/audits\?limit=\d+/.test(src), "no hardcoded limit remains in the audits fetch");
assert(
  /STATE\.truncated\s*=\s*audits\.length\s*>\s*LEDGER_CAP/.test(src),
  "truncated is set from the probe row (strictly greater than the cap)"
);
assert(/audits\.slice\(0,\s*LEDGER_CAP\)/.test(src), "the probe row is dropped, never rendered");
assert(
  /STATE\.truncated\s*\n?\s*\?/.test(src) || /STATE\.truncated$/m.test(src),
  "writeHeaderSub branches on truncated"
);
// The completeness CLAIM must not be made when the view is partial.
// Assert on CODE, not prose: these checks grep for phrases that also appear in
// the explanatory comments right beside them, so a comment mentioning the claim
// would satisfy (or trip) a check about the claim. Strip line comments first.
const stripLineComments = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const subBlock = stripLineComments(src.match(/function\s+writeHeaderSub[\s\S]*?\n  \}/)?.[0] ?? "");
// The rendered claim is a STRING LITERAL, so anchor on its quote.
const CLAIM = "'Every solicitation FARaudit has audited";
assert(subBlock.includes(CLAIM), "the complete-view copy is still present for the untruncated case");
assert(
  subBlock.indexOf("STATE.truncated") !== -1 && subBlock.indexOf("STATE.truncated") < subBlock.indexOf(CLAIM),
  "the truncation check GUARDS the 'Every solicitation …' completeness claim"
);
assert(/most recent<\/b> audits/.test(subBlock), "the truncated case states what IS shown instead");

// ═══ 3. DEAD WATCHING HYDRATION REMOVED (past-audits.html) ═══════════════════
// Only meaningful against the real page, so skip when gating arbitrary bytes.
if (!process.argv[2]) {
  // Strip HTML comments before asserting ABSENCE — the comment documenting the
  // removal names the very endpoint being asserted gone.
  const html = readFileSync(HTML, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  assert(!/setWatching/.test(html), "past-audits.html no longer defines setWatching (wrote to zero elements)");
  assert(!/api\/watched-notices/.test(html), "past-audits.html no longer fetches /api/watched-notices on load");
  assert(/\.icon-btn \.nbadge/.test(html), "the bell hydrator is KEPT — .nbadge is a live target in the served topbar");
  const rail = readFileSync(join(process.cwd(), "src", "lib", "nav", "rail.ts"), "utf8");
  assert(
    !/data-sb-watching-count/.test(rail),
    "the injected rail still emits no [data-sb-watching-count] — the removed code had no possible target"
  );
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
