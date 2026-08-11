// /far-dfars-updates must not state numbers or reasons it never computed.
//
// Run: npx tsx test/public/_far-panel-truth.test.ts
//
// Written RED against the pre-fix files (2026-08-03), from three defects found by
// reading the LIVE page while the feed was healthy and returning 40 rows:
//
//  1. "14 updates this month" was a LITERAL in far-dfars-updates.html. It matched no
//     query and no timeframe; the chart under it showed FAR 28 + DFARS 12 = 40.
//  2. The header stat was labelled "This Month" but assigned D.UPDATES.length — the
//     whole feed, spanning Aug 2025 to Aug 2026. A timeframe it never computed.
//  3. "Effective ≤30d" read 0, always. Nothing populated FARD.EFFECTIVE — the live
//     wiring only ever CLEARED it — so the number was structurally incapable of
//     moving while presenting as a computed enforcement risk. Its panel then fell
//     through to the feed-wide empty state and told the reader "The feeds returned no
//     published changes for this view" while 40 changes were on screen.
//
// Part C runs the real buildEffective over transcribed live rows; Part D plants known
// bad inputs so no probe can pass vacuously.
export {};
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const PUBLIC = join(import.meta.dirname ?? __dirname, "..", "..", "public");
const html = readFileSync(join(PUBLIC, "far-dfars-updates.html"), "utf8");
const app = readFileSync(join(PUBLIC, "far-app.js"), "utf8");
const live = readFileSync(join(PUBLIC, "far-dfars-updates-live.js"), "utf8");

/** Brace-balanced extraction of a `function NAME(...) { ... }` declaration. */
function extractFn(src: string, name: string): string {
  const start = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`${name} not found`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// ── Part A · no asserted-but-uncomputed number is hardcoded in the markup ───────
console.log("── Part A · the markup states no number it did not compute ──");

// The exact literal that shipped, and the general shape of it.
check("A1 · no literal '<n> updates this month' in the html",
  !/\b\d+\s+updates?\s+this\s+month\b/i.test(html), "a hardcoded month count is present");

// The subtitle must be a slot the script fills, not prose.
check("A2 · the by-type subtitle is a script-filled slot", /id="bytSub"/.test(html), "no #bytSub element to populate");
check("A3 · far-app.js populates that slot", /bytSub/.test(app), "far-app.js never writes #bytSub");

// A label promising a timeframe must not sit on a total. hsTotal is assigned
// D.UPDATES.length, so its label must not claim a period.
const hsTotalLabel = html.match(/id="hsTotal"[^<]*<\/span>\s*<span class="l">([^<]*)</)?.[1] ?? "";
check(`A4 · hsTotal label ("${hsTotalLabel}") claims no timeframe`,
  !/month|week|today|day/i.test(hsTotalLabel),
  "the label promises a period but the value is the whole feed");
check("A5 · hsTotal is still fed the feed total", /hsTotal'\)\.textContent\s*=\s*num\(D\.UPDATES\.length\)/.test(app));

// ── Part B · a panel with an empty slice must not report on the FEED ────────────
console.log("\n── Part B · empty panel states its OWN reason ──");
check("B1 · the effective-dates panel has a panel-scoped empty state",
  /No upcoming effective dates/.test(app),
  "it still falls straight through to the feed-wide blankReason()");
check("B2 · that state is gated on the feed being healthy AND non-empty",
  /D\.UPDATES\.length\s*&&\s*!isDown\(\)\s*&&\s*!isPending\(\)\s*&&\s*!isPartial\(\)/.test(app),
  "an outage would be reported as 'no upcoming effective dates'");

// ── Part C · buildEffective actually computes, over real rows ───────────────────
console.log("\n── Part C · buildEffective runs over transcribed live rows ──");
check("C0 · the live wiring populates EFFECTIVE, not just clears it",
  /FARD\.EFFECTIVE\.push\.apply/.test(live), "EFFECTIVE is still write-only-empty");

async function main(): Promise<void> {
  const modPath = join(tmpdir(), `far-effective-${process.pid}.mjs`);
  writeFileSync(modPath, `${extractFn(live, "buildEffective")}\nexport { buildEffective };\n`, "utf8");
  let buildEffective: (rows: unknown[]) => Array<{ days: number; tone: string; name: string; clause: string }>;
  try {
    ({ buildEffective } = (await import(`file://${modPath}`)) as never);
  } finally {
    rmSync(modPath, { force: true });
  }

  const day = 86400000;
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

  // Shapes transcribed from the live /api/regulatory-updates payload.
  const rows = [
    { title: "Past rule", effective_date: iso(-30), clause: "FAR 52.204-21", affects_clauses: [] },
    { title: "In 3 days", effective_date: iso(3), clause: null, affects_clauses: ["DFARS 252.204-7012"] },
    { title: "In 20 days", effective_date: iso(20), clause: null, affects_clauses: [] },
    { title: "In 200 days", effective_date: iso(200), clause: null, affects_clauses: [] },
    { title: "No date (proposed rule)", effective_date: null, clause: null, affects_clauses: [] },
  ];
  const out = buildEffective(rows);

  check(`C1 · past + undated rows are dropped (${out.length} of 5 kept)`, out.length === 3, JSON.stringify(out.map((o) => o.name)));
  check("C2 · sorted soonest first", out[0].days <= out[1].days && out[1].days <= out[2].days);
  check("C3 · ≤7 days is red", out[0].tone === "red", `got ${out[0].tone}`);
  check("C4 · 8–30 days is amber", out[1].tone === "amber", `got ${out[1].tone}`);
  check("C5 · beyond 30 days is neither red nor amber", out[2].tone === "green", `got ${out[2].tone}`);
  check("C6 · the ≤30d count is now derivable and non-zero", out.filter((e) => e.days <= 30).length === 2);
  check("C7 · clause falls back to affects_clauses[0]", out[0].clause === "DFARS 252.204-7012", out[0].clause);

  // ── Part D · planted bad inputs ───────────────────────────────────────────────
  console.log("\n── Part D · planted inputs (no invented deadlines) ──");
  check("D1 · a row with no effective_date invents no deadline",
    buildEffective([{ title: "x", effective_date: null }]).length === 0);
  check("D2 · an unparseable date is dropped, not defaulted to today",
    buildEffective([{ title: "x", effective_date: "not-a-date" }]).length === 0);
  check("D3 · empty input yields empty output", buildEffective([]).length === 0);
  check("D4 · undefined input does not throw", buildEffective(undefined as never).length === 0);
  // NEGATIVE control: a genuinely upcoming date MUST survive, or C1 passes for the
  // trivial reason that the function drops everything.
  check("D5 · a real upcoming date is KEPT", buildEffective([{ title: "x", effective_date: iso(10) }]).length === 1);


  // ── A ROW'S IDENTITY IS ITS DOCUMENT, NOT ITS CLAUSE ──────────────────────
  // Measured against the live Federal Register feed 2026-08-10: of 40 documents, FOUR cite a
  // "part N" and ONE carries a bare clause number. So `clause` is empty on ~88% of rows, and
  // the timeline keyed its D3 join on exactly that field. A keyed join binds one datum per
  // key, so forty updates collapsed to a single circle — which then got a NEGATIVE radius,
  // because scaleSqrt over domain [1,7] extrapolates 0 affected clauses to -1.29 and SVG
  // draws nothing for a negative r. Two independent reasons the chart was empty.
  //
  // A clause is not a row identity even when it IS present: two rules may amend the same part.
  console.log("\n── the timeline is keyed on the document, not on a clause ──");
  {
    check("the live mapping gives every row an id", /id:\s*u\.link \|\| u\.title/.test(live),
      "rows arrive with no stable identity, so any join must fall back to a content field");
    check("the data join is keyed on that id", /\.data\(data, d => d\.id\)/.test(app),
      "the join is keyed on a field that is absent on most rows — they collapse to one mark");
    check("no selection is keyed on clause",
      !/x\.clause === S\.sel/.test(app) && !/dataset\.clause/.test(app) && !/S\.sel === u\.clause/.test(app),
      "the chart selects by id while the panel looks up by clause, so the panel goes blank");

    const domain = app.match(/scaleSqrt\(\)\.domain\(\[(\d+), *(\d+)\]\)/);
    check("the radius domain starts at zero", !!domain && domain[1] === "0",
      `domain starts at ${domain?.[1]} — a rule naming no clause is extrapolated below the range`);
    check("the radius scale is clamped", /scaleSqrt\(\)[\s\S]{0,80}?\.clamp\(true\)/.test(app),
      "an out-of-domain value still extrapolates past the declared range");

    // BEHAVIOUR, not source. The scale is transcribed and driven with the value 88% of live
    // rows actually carry. A radius must be a positive number or the browser draws nothing.
    const scaleSqrt = (d0: number, d1: number, r0: number, r1: number, clamp: boolean) => (d: number) => {
      const v = clamp ? Math.min(Math.max(d, d0), d1) : d;
      return r0 + (Math.sqrt(v) - Math.sqrt(d0)) * (r1 - r0) / (Math.sqrt(d1) - Math.sqrt(d0));
    };
    check("the OLD scale drew nothing for a rule with no clause",
      scaleSqrt(1, 7, 6, 18, false)(0) < 0,
      "the pre-fix defect is not reproducible, so this check proves nothing");
    const rNow = scaleSqrt(0, 7, 6, 18, true);
    check("the new scale gives a visible radius at zero", rNow(0) >= 6,
      `r(0) = ${rNow(0)} — still not drawable`);
    check("…and still scales up with affected clauses", rNow(7) > rNow(1) && rNow(1) > rNow(0),
      "the radius no longer carries the affected count");

    // A keyed join over the live shape: every row empty-claused, ids distinct.
    const rows = Array.from({ length: 40 }, (_, i) => ({ clause: "", id: `https://example.gov/doc/${i}` }));
    check("keying on clause collapses the live corpus to one mark",
      new Set(rows.map((r) => r.clause)).size === 1,
      "the collapse this gate exists for is not reproducible from the live shape");
    check("keying on id keeps every row", new Set(rows.map((r) => r.id)).size === 40,
      "the replacement key is not unique either");

    check("a blank clause never renders as an empty headline",
      /u\.clause \|\| u\.title/.test(app) && /d\.clause \|\| d\.title/.test(app),
      "the tooltip and panel print an empty string as the title of the update");
  }


  // ── THE PAGE MAY NOT DENY ITS OWN FEED, AND A CONTROL MAY ONLY CLAIM WHAT IT DOES ──
  // Found by driving the deployed page 2026-08-10. Two of these are CEO findings from his own
  // review; the first is a regression I shipped in the commit directly above.
  //
  // Keying selection on `id` left `S.sel` null on load. renderPanel already split "nothing
  // selected" from "nothing published"; renderInsight did not, so the bar printed the no-data
  // message beside a counter reading 40 IN FEED. A surface claiming absence while holding data
  // is the honest-fail rule inverted.
  console.log("\n── nothing selected is not nothing published ──");
  {
    const insight = app.slice(app.indexOf("function renderInsight()"), app.indexOf("function shade("));
    check("the insight source was sliced, not empty", insight.length > 200,
      `sliced ${insight.length} chars — the markers are out of order and the checks below are vacuous`);
    check("an unselected row does not report an empty feed", /D\.UPDATES\.length[\s\S]{0,120}?blankReason\(\)/.test(insight),
      "with rows loaded and none selected, the bar prints the source-unavailable message");
    check("…and it still reports a genuinely empty feed", /blankReason\(\)/.test(insight),
      "the no-data state lost its message along with the bug");
    // The panel had it right all along — the two must not drift apart again.
    const panel = app.slice(app.indexOf("function renderPanel()"), app.indexOf("function renderFeed()"));
    check("the panel draws the same distinction", /D\.UPDATES\.length \? \['Select a clause'/.test(panel),
      "the two empty states disagree about what an empty selection means");

    // CEO review 2026-08-10: "when I click Read full text or + Track clause, nothing happens."
    // Both were <button> with no handler. Read full text has a real destination on every row —
    // the Federal Register URL the feed already carries. Track clause had no feature behind it.
    check("Read full text is a real link to the published rule",
      /<a class="cop-btn primary" href="\$\{esc\(u\.link\)\}"/.test(panel),
      "the control is a button with no handler — pressing it does nothing");
    check("…and it opens safely in a new tab", /rel="noopener noreferrer"/.test(panel),
      "target=_blank without noopener hands the opener to the destination");
    check("…and it is not rendered for a row with no link", /\$\{u\.link \? /.test(panel),
      "a row with no URL still offers a control that cannot go anywhere");
    check("Track clause is gone", !/Track clause/.test(app),
      "a control with no feature behind it is still on the page");

    // "Why it matters" printed its own label with nothing after it: this route runs no insight
    // pass, so `insight` is the empty string on every row.
    check("the insight block is omitted when there is no insight",
      /\$\{u\.insight \? /.test(panel) && (app.match(/\$\{u\.insight \? /g) || []).length >= 2,
      "a bold heading renders above an empty string, in the panel or the feed or both");

    check("P· the dead-control check can see a handlerless button",
      /<button class="cop-btn ghost">/.test('<button class="cop-btn ghost">Track clause</button>'),
      "the check cannot see the shape it forbids");
  }


  // ── WHAT THE PAGE OPENS ON, AND WHAT AN EMPTY PANEL COSTS ────────────────
  // CEO, 2026-08-10: open on the highest-impact change rather than blank, and collapse the
  // panels that have nothing in them. Both taken, with one correction to the first.
  console.log("\n── the page opens on something, and says so honestly ──");
  {
    check("a default is picked", /function autoPick\(\)/.test(app) && /autoPick\(\); renderKPIs\(\)/.test(app),
      "the panel is blank on load and again after Reset");

    // AFFECTED FIRST. Impact is a keyword heuristic over title and summary — nothing
    // authoritative sets it — so it must not be the primary sort or the page opens on whatever
    // has the scariest words. Contracts touched is a fact about THIS account.
    const pick = app.slice(app.indexOf("function defaultPick(rows)"), app.indexOf("function autoPick()"));
    check("the default-pick source was sliced, not empty", pick.length > 120,
      `sliced ${pick.length} chars — the checks below would be vacuous`);
    // NAMED FOR WHAT IT SORTS. This assertion first read "leads with contracts affected" — the
    // same mislabel as the panel, one layer down. The field counts CFR sections a rule amends;
    // the customer's own contract count is a different list that is 0 for every row today.
    check("the ranking leads with the breadth of the change", /\(b\.amends - a\.amends\) \|\|/.test(pick),
      "the page opens on a keyword heuristic rather than on how much of the FAR a rule rewrites");
    check("…then impact, then newest", /impMeta\(b\.impact\)\.rank - impMeta\(a\.impact\)\.rank/.test(pick)
      && /Date\.parse\(b\.date\) - Date\.parse\(a\.date\)/.test(pick),
      "ties are broken arbitrarily, so the page opens somewhere different on each load");
    check("impact is still only a heuristic", /cmmc\|cyber\|cui\|safeguard/.test(live),
      "if impact ever becomes authoritative this ranking should be revisited");

    // A DELIBERATE DESELECT IS A CHOICE. Re-picking on the next render undoes it.
    check("a deselect is not undone on the next render", /if \(S\.picked \|\| S\.sel !== null\) return;/.test(app),
      "clicking the selected row to close it re-opens it immediately");
    check("Reset picks again", /S\.sel = null; S\.picked = false;/.test(app),
      "Reset leaves the panel on a row that no longer matches the filters");

    // COLLAPSED, NOT HIDDEN. A panel that vanishes when empty teaches the reader it does not
    // exist; one that keeps 200px of centred white to say nothing wastes the fold.
    check("an empty side panel collapses", /is-collapsed/.test(html) && /emptyBlock\(esc\(t\), esc\(d\), true\)/.test(app),
      "an empty panel still occupies its full height");
    check("…and still states the reason", /No change in this view has an effective date still ahead/.test(app)
      && /No clause change in this view touches a solicitation/.test(app),
      "collapsing removed the sentence along with the whitespace");
    check("the rule panel does NOT collapse", /emptyBlock\(esc\(t\), esc\(d\)\);/.test(app),
      "the main reading surface shrank to a caption");
    check("no panel is hidden outright", !/effList[^\n]*hidden|affList[^\n]*hidden/.test(app),
      "a section that disappears when empty teaches the reader it does not exist");

    check("P· the ranking check can see an impact-first sort",
      !/\(b\.affects - a\.affects\) \|\|/.test("rows.sort((a,b) => impMeta(b.impact).rank - impMeta(a.impact).rank)"));
  }


  // ── A NUMBER MAY NOT BE LABELLED AS SOMETHING IT IS NOT ──────────────────
  // Found by driving the deployed page: the panel read "97 CONTRACTS HIT" while the KPI card
  // directly above it read "AFFECTED CONTRACTS 0". Two numbers contradicting each other on one
  // screen, for a customer with no solicitations on file.
  //
  // `affects_clauses` is the set of CFR sections a rule amends. It was mapped to a field called
  // `affects` and rendered as "Contracts hit", "size = contracts affected" and "hits N of your
  // contracts" — in four places. That read as true only while it was always 0, which it was
  // until clause extraction landed. Making a number correct turned a dormant mislabel into a
  // false claim, which is the cost of fixing a fail-open.
  console.log("\n── the number says what it counts ──");
  {
    const data = readFileSync(join(PUBLIC, "far-data.js"), "utf8");

    check("the field is named for what it counts", /amends: Array\.isArray\(u\.affects_clauses\)/.test(live),
      "a field named `affects` invites the label `contracts affected`");
    check("no surface calls it contracts",
      !/Contracts hit/.test(app) && !/contracts affected/.test(app) && !/of your contracts/.test(app),
      "the panel, the legend or the insight bar still claims this counts contracts");
    check("the panel says clauses amended", /<span class="ml">Clauses amended<\/span>/.test(app));
    check("the timeline legend says clauses amended", /size = clauses amended/.test(app),
      "the dot size is explained as contracts");
    check("the sort control says what it sorts", /'Most amended'/.test(data),
      "the control is labelled for contracts and sorts by clauses");

    // The customer's real contract count lives elsewhere and stays there.
    check("the affected-contracts panel is untouched", /D\.AFFECTED/.test(app),
      "the genuine contracts list was renamed along with the mislabelled count");
    check("the KPI card still reads the contracts list", /AFFECTED|affList/.test(app));

    check("P· the mislabel check can see the shipped text",
      /Contracts hit/.test('<span class="ml">Contracts hit</span>'),
      "the check cannot see the label it forbids");
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error("✗ FAIL  gate threw:", err); process.exit(1); });
