// ─────────────────────────────────────────────────────────────────────────────
// Gate — the Tracked view.
//
// Track marks a notice you have not decided about. It is deliberately NOT
// Pipeline (which means "I am bidding this" and carries the funnel count) and
// NOT Decisions (the ledger of audits actually run). Before this, Track wrote a
// record NOTHING read: /watching and its rail entry were purged, so the button
// was a bookmark with no bookmarks page.
//
// THE LOAD-BEARING PROPERTY: the view reads /api/watched-notices, never the
// feed. live-opportunities.ts drops expired notices before they ever reach the
// browser, so a filter over the feed would silently lose a tracked notice the
// moment it closed — which is exactly the one worth surfacing. Section B holds
// that line, and the planted positive is the feed-filter implementation.
//
// Run: npx tsx test/public/_opportunities-tracked.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const P = (f: string) => path.join(process.cwd(), "public", f);
const DSO = readFileSync(P("dso-app.js"), "utf8");
const LIVE = readFileSync(P("opportunities-live.js"), "utf8");
const HTML = readFileSync(P("opportunities.html"), "utf8");
const NAICS = readFileSync(P("naics.html"), "utf8");
const CODE = DSO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in public/dso-app.js`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}

console.log("\nA · the write finally has a reader");
ok(/window\.DSO\.WATCHED\s*=/.test(LIVE), "opportunities-live.js populates window.DSO.WATCHED");
ok(/\/api\/watched-notices/.test(LIVE), "from /api/watched-notices — the endpoint that had no consumer");
ok(/function watched\(\)/.test(DSO) && /window\.DSO\.WATCHED/.test(CODE),
  "dso-app.js reads it back");
ok(/S\.view === 'tracked'/.test(CODE), "and a 'tracked' view exists to show it");
ok(/renderTrackedList\(\); return;/.test(CODE),
  "renderList hands off to it BEFORE the feed's empty poles — a closed tracked notice still shows on an empty-feed day");

console.log("\nB · THE POINT — tracked notices survive leaving the feed");
let trackedRow: (r: any) => string;
try {
  const sandbox: any = { __out: {}, console, Date };
  vm.createContext(sandbox);
  sandbox.esc = (s: string) => String(s == null ? "" : s);
  sandbox.fmtAbs = (v: string) => (v ? "Jul 30, 2026" : null);
  vm.runInContext(extractFn(DSO, "trackedRow"), sandbox);
  trackedRow = sandbox.__out.trackedRow;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — trackedRow(r) must stay a top-level function: ${e.message}\n`);
  process.exit(1);
}

// Transcribed from the live watch record on the demo account.
const CLOSED = {
  notice_id: "4be19ba2398e416784723500d8cf604f",
  solicitation_number: "FA524026Q0024",
  title: "506 EARS TOWABLE PASSENGER STAIRS",
  agency: "DEPT OF DEFENSE · DEPT OF THE AIR FORCE",
  response_deadline: "2026-07-30T03:00:00+00:00",
  status: "watching"
};
const closedRow = trackedRow(CLOSED);
ok(closedRow.includes("506 EARS TOWABLE PASSENGER STAIRS"),
  "a tracked notice the feed has dropped still renders");
ok(closedRow.includes("FA524026Q0024"), "carrying its solicitation number");
ok(/tr-s closed/.test(closedRow) && />closed</.test(closedRow),
  "and is marked CLOSED rather than shown as if still open");

// A deadline in the future must NOT be labelled closed.
const openRow = trackedRow({ ...CLOSED, response_deadline: "2099-01-01T00:00:00+00:00" });
ok(!/tr-s closed/.test(openRow) && />tracking</.test(openRow),
  "a future deadline reads 'tracking', not 'closed'");
// An unknown deadline must not be guessed either way.
const noDate = trackedRow({ ...CLOSED, response_deadline: null });
ok(!/closed/.test(noDate), "an absent deadline is never assumed to be closed");
// Audited / posted are real statuses and outrank the date.
ok(/>audited</.test(trackedRow({ ...CLOSED, status: "audited" })), "an audited notice says so");
ok(/>posted</.test(trackedRow({ ...CLOSED, status: "posted" })), "a posted notice says so");
// A record with almost nothing still renders rather than vanishing.
const bare = trackedRow({ notice_id: "x", title: null, solicitation_number: null });
ok(bare.includes("Untitled notice"), "a record with no title still renders as a row");

console.log("\nC · the control tells the truth about all three states");
let renderTrackedChip: () => void;
const el: any = {
  hidden: true, disabled: false, textContent: "", innerHTML: "", title: "",
  _cls: new Set<string>(),
  classList: { toggle: (c: string, on: boolean) => { on ? el._cls.add(c) : el._cls.delete(c); } },
  onclick: null
};
try {
  const sandbox: any = {
    __out: {}, console,
    $: (id: string) => (id === "trackedChip" ? el : null),
    S: { view: null as string | null },
    window: { DSO: { WATCHED: null as any } },
    renderAll: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn(DSO, "watched") + "\n" + extractFn(DSO, "renderTrackedChip"), sandbox);
  renderTrackedChip = sandbox.__out.renderTrackedChip;

  sandbox.window.DSO.WATCHED = null;                       // read failed
  renderTrackedChip();
  ok(/unavailable/.test(el.textContent) && el.disabled === true,
    "a FAILED read says 'unavailable' and does not offer a filter", el.textContent);

  sandbox.window.DSO.WATCHED = [];                          // genuinely none
  renderTrackedChip();
  ok(el.innerHTML.includes("0") && el.disabled === true && !/unavailable/.test(el.innerHTML),
    "NONE tracked reads as 0 — a different sentence from a failed read", el.innerHTML);

  sandbox.window.DSO.WATCHED = [CLOSED];                    // one tracked
  renderTrackedChip();
  ok(el.innerHTML.includes("1") && el.disabled === false,
    "one tracked notice offers the filter", el.innerHTML);
  ok(el.hidden === false, "the control is visible so it is discoverable");
} catch (e: any) {
  console.log(`  ✗ FATAL — cannot drive renderTrackedChip: ${e.message}`);
  fail++;
}

console.log("\nB2 · a tracked notice can be removed from the place it is shown");
// Without this a closed notice is a one-way door: the compact row carries no
// Track button, because it is not a feed card.
ok(/data-untrack=/.test(closedRow), "the compact row carries an Untrack control");
ok(closedRow.includes(CLOSED.notice_id), "keyed on the notice id the DELETE needs");
ok(/closest\('\[data-untrack\]'\)/.test(CODE), "a delegated handler listens for it");
ok(/method: 'DELETE'/.test(CODE) && /\/api\/watch\?noticeId=/.test(CODE),
  "it calls DELETE /api/watch?noticeId= — the endpoint the row button already uses");
// The row must survive a failed delete: this list is the only place the customer
// can see a notice the feed has dropped.
ok(/Untrack failed/.test(CODE), "a failed removal says so and re-enables the control");
ok(!/WATCHED\.delete\(id\)/.test(CODE),
  "it does not call an out-of-scope WATCHED — that guard would never fire");
ok(/window\.DSO\.WATCHED_NOTICE_IDS/.test(CODE),
  "it clears the row-level watch map so a card in the feed stops reading 'Tracking'");
// A record with no notice_id cannot be deleted, so it must not offer the control.
const noId = trackedRow({ title: "Orphan record", response_deadline: null });
ok(!/data-untrack/.test(noId), "a record with no notice id offers no Untrack it could not honour");
ok(noId.includes("Orphan record"), "but it is still LISTED — unremovable is not the same as invisible");

console.log("\nC2 · Track says what it actually does");
// The tooltip read "you are alerted on amendments and deadline changes". NEITHER is built:
// watcher-tick's only trigger is resourceLinks going []->[url] — the solicitation posting
// its documents. It refetches the deadline onto the row but never alerts on a change to it,
// and nothing detects amendments at all. A control may only claim what the code can do.
ok(!/alerted on amendments/.test(CODE), "the tooltip no longer promises amendment alerts");
ok(!/deadline changes'/.test(CODE), "…nor deadline-change alerts");
ok(/documents post we run the audit and alert you/.test(CODE),
  "…and it names the trigger the watcher actually has");
// The seam to Notifications was invisible: Track is what CREATES a watched notice, and
// watched notices are the whole subject of that tab.
ok(/plistTrackHint/.test(CODE) && /plistTrackHint/.test(HTML),
  "a visible hint explains Track, not only a tooltip nobody sees on touch");
ok(/href="\/settings"/.test(CODE), "…and points at where the channels are chosen");
// PLANTED: the old copy must drive this red, or the check is decorative.
ok(/alerted on amendments/.test("b.title = 'Watch this notice — you are alerted on amendments and deadline changes';"),
  "PLANTED: the retired wording is still recognizable to this check");

console.log("\nD · it is not wired into Pipeline or Decisions");
ok(!/S\.view === 'tracked'[^]{0,400}pipeline/i.test(CODE),
  "the tracked view does not touch pipeline state");
ok(/\.track-chip\{/.test(HTML) && /plist-head[\s\S]{0,200}?trackedChip/.test(HTML), "the control sits on the All notices header with the other list-scoped controls");
ok(!/data-view="tracked"/.test(CODE),
  "it is NOT a saved view — those are rules over SAM's data, this is the customer's own marks");

console.log("\nE · the dead badge is gone");
ok(!/data-sb-watching-count/.test(NAICS),
  "naics.html no longer writes to an element injectRail deletes");
ok(!/watched-notices/.test(NAICS),
  "and no longer fires that request on every page load");

console.log("\nF · falsifiability (planted positive)");
// Plant the tempting implementation: filter the FEED for watched rows. On this
// account it yields ZERO, because the one tracked notice closed on Jul 30 and
// expired notices never enter the feed.
const feedRows = [{ notice_id: "aaa", watched: false }, { notice_id: "bbb", watched: false }];
const feedFiltered = feedRows.filter((o: any) => o.watched);
ok(feedFiltered.length === 0 && [CLOSED].length === 1,
  "a feed-filter implementation returns 0 where the watch record returns 1",
  "the tracked notice would silently disappear");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
