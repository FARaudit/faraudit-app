// The cross-desk digest must MEASURE each desk or say it did not.
// Run: npx tsx test/public/_desk-digest-truth.test.ts
//
// Written RED against the pre-fix files (2026-08-13): Today's two biggest panels
// shipped a sentence each admitting they had no data. The Priority Action Feed
// said "Cross-desk ranking not built yet" and all six Signals cards said "No
// cross-desk summary is computed yet" — on the default tab, under a green LIVE
// pill. They were treated as two problems and neither shipped; they need the
// same one query, which is what src/lib/bd-os/desk-digest.ts now is.
//
// WHAT THIS GATE IS FOR. Feeding a panel is the easy half. The half that goes
// wrong is the one this file guards: a desk whose source FAILED must not render
// as a desk with nothing in it, and a column the query never selected must not
// read as an all-clear on the customer's compliance obligations. Both are the
// same defect — a count filtered from a failed read is a zero nobody measured.
//
// Parts E and F plant known positives so a vacuous pass is impossible.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeskDigest, daysUntil, urgencyOf, type DeskDigestInput, type DeskSummary } from "@/lib/bd-os/desk-digest";
import type { OpportunityRow } from "@/lib/bd-os/queries";
import type { RegRow } from "@/lib/federal-register";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = process.cwd();
const readPublic = (f: string) => readFileSync(join(ROOT, "public", f), "utf8");

const NOW = Date.parse("2026-08-13T12:00:00Z");
const iso = (days: number) => new Date(NOW + days * 86400000).toISOString();

function notice(over: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "n1", notice_id: "NID-1", solicitation_number: "SPE4A7-26-R-0001",
    title: "Aircraft engine overhaul", agency: "DEPT OF DEFENSE", naics_code: "336412",
    set_aside: null, document_type: null, notice_type: null, incumbent_name: null,
    source: "sam", status: "open", recommendation: null, v3_verdict: null,
    compliance_score: null, bid_no_bid: null, pdf_url: null, risk_level: null,
    response_deadline: iso(10), in_pipeline: false, watched: false, title_plain: null,
    is_audited: false, award_ceiling: null, created_at: iso(-1), processed_at: null,
    ...over,
  } as OpportunityRow;
}

const EMPTY: DeskDigestInput = { opportunities: [], cmmcAudits: [], regRules: [], spending: null };
const by = (rows: DeskSummary[], desk: string) => rows.find((r) => r.desk === desk)!;

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part A · a FAILED read is never an EMPTY desk ──");
// This is the whole point. `null` in means the source did not answer; `[]` in
// means it answered with nothing. Collapsing them is how a page tells a customer
// their market is quiet when in fact nothing was measured.
{
  const failed = buildDeskDigest(
    { opportunities: null, cmmcAudits: null, regRules: null, spending: null }, NOW);
  for (const desk of ["opp", "co", "cmmc", "far", "spend"]) {
    const d = by(failed, desk);
    check(`A · ${desk} · a null source reports "unavailable"`, d.status === "unavailable", `got ${d.status}`);
    check(`A · ${desk} · …and states no count`, d.count === null && d.value === null, `count=${d.count}`);
    check(`A · ${desk} · …and says why in words`, typeof d.reason === "string" && d.reason.length > 0);
  }

  const answered = buildDeskDigest(EMPTY, NOW);
  for (const desk of ["opp", "co", "cmmc", "far"]) {
    const d = by(answered, desk);
    check(`A · ${desk} · an empty source reports "empty", not "unavailable"`, d.status === "empty", `got ${d.status}`);
  }
  // And the two must not produce the same words, or the distinction is decorative.
  check("A · the failed and empty states read differently",
    by(failed, "opp").reason !== by(answered, "opp").reason);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part B · CMMC may not turn a missing column into an all-clear ──");
// fetchRecentAudits does NOT select compliance_json. Running inferLevel over
// those rows returns level "0" for every audit — "no CMMC required" — which is
// a compliance claim derived from a column that was never read.
{
  const noJson = buildDeskDigest(
    { ...EMPTY, cmmcAudits: [
      { id: "a1", solicitation_number: "S-1", title: "Depot support", created_at: iso(-2), response_deadline: iso(5) },
      { id: "a2", solicitation_number: "S-2", title: "Base services", created_at: iso(-3), response_deadline: iso(9) },
    ] }, NOW);
  const d = by(noJson, "cmmc");
  check("B1 · rows with no compliance_json do not report a CMMC verdict", d.status !== "ok", `got ${d.status}`);
  check("B2 · …and the reason names them as unanalyzed",
    /not yet analyzed/i.test(d.reason || ""), d.reason || "(no reason)");

  // A row that WAS analyzed and carries a triggering clause must be found.
  const real = buildDeskDigest(
    { ...EMPTY, cmmcAudits: [{
      id: "a3", solicitation_number: "S-3", title: "Controlled unclassified work",
      created_at: iso(-1), response_deadline: iso(4),
      compliance_json: { dfars_clauses: ["252.204-7012"] },
    }] }, NOW);
  const r = by(real, "cmmc");
  check("B3 · an analyzed row that triggers CMMC is reported", r.status === "ok", `got ${r.status} · ${r.reason}`);
  check("B4 · …with the level in the reason line", /CMMC Level [123]/.test(r.why || ""), r.why || "");
  check("B5 · …and its own deadline, not the audit date", r.days === 4, `days=${r.days}`);

  // THE DEDUPE. One solicitation audited three times is one requirement, not
  // three — the desk's own route collapses them and this must agree.
  const reruns = buildDeskDigest(
    { ...EMPTY, cmmcAudits: [1, 2, 3].map((n) => ({
      id: `r${n}`, solicitation_number: "S-SAME", title: "Same solicitation",
      created_at: iso(-n), response_deadline: iso(6),
      compliance_json: { dfars_clauses: ["252.204-7012"] },
    })) }, NOW);
  check("B6 · three runs of one solicitation count once", by(reruns, "cmmc").count === 1,
    `count=${by(reruns, "cmmc").count}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part C · deadlines: past is not pending, and 0 is not null ──");
{
  check("C1 · a past date yields null, not a negative", daysUntil(iso(-5), NOW) === null);
  check("C2 · an absent date yields null", daysUntil(null, NOW) === null);
  check("C3 · an unparseable date yields null", daysUntil("not-a-date", NOW) === null);
  check("C4 · urgency bands: ≤3 critical", urgencyOf(3) === "crit" && urgencyOf(0) === "crit");
  check("C5 · urgency bands: ≤7 this week", urgencyOf(7) === "warn" && urgencyOf(4) === "warn");
  check("C6 · urgency bands: beyond that, plan ahead", urgencyOf(8) === "ok");
  check("C7 · NO deadline is not an urgent deadline", urgencyOf(null) === "ok");

  // The ranked notice is the one closing FIRST, and a closed one never wins it.
  const rows = [
    notice({ id: "far", notice_id: "N-FAR", title: "Closes later", response_deadline: iso(20) }),
    notice({ id: "past", notice_id: "N-PAST", title: "Already closed", response_deadline: iso(-2) }),
    notice({ id: "soon", notice_id: "N-SOON", title: "Closes soonest", response_deadline: iso(2) }),
  ];
  const d = by(buildDeskDigest({ ...EMPTY, opportunities: rows }, NOW), "opp");
  check("C8 · the soonest OPEN notice is the one ranked", d.title === "Closes soonest", d.title || "");
  check("C9 · …and its urgency follows its date", d.urg === "crit", d.urg);
  check("C10 · the count is every live notice, not just the dated ones", d.count === 3, `count=${d.count}`);

  // A feed that answered with rows but no future deadline is a fact about the
  // rows — it must still report the count rather than fall back to "empty".
  const undated = by(buildDeskDigest(
    { ...EMPTY, opportunities: [notice({ response_deadline: null })] }, NOW), "opp");
  check("C11 · rows with no future deadline still report their count",
    undated.status === "ok" && undated.count === 1 && undated.days === null,
    `${undated.status}/${undated.count}/${undated.days}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part C2 · FAR/DFARS states a REFERENCE, never an amendment ──");
// affects_clauses on these rows comes from a MENTION recognizer over the title
// and abstract. A rule can cite a clause to say a comparable requirement exists
// there — the amendment question keys on the amendatory instruction in the full
// text, which these rows do not carry. A flag is a verdict, not a mention.
{
  const rule = (over: Partial<RegRow> = {}): RegRow => ({
    source: "far", clause: null, title: "Acquisition of commercial products",
    summary: null, effective_date: iso(9), link: "https://example.gov/1",
    published_at: iso(-3), affects_clauses: [], comments_close_on: null, ...over,
  });

  const cited = by(buildDeskDigest(
    { ...EMPTY, regRules: [rule({ affects_clauses: ["FAR 31.205-26"] })] }, NOW), "far");
  check("C2a · a cited clause is called a reference", /references/i.test(cited.why || ""), cited.why || "");
  check("C2b · …and never an amendment", !/amend/i.test(cited.why || ""), cited.why || "");

  const silent = by(buildDeskDigest({ ...EMPTY, regRules: [rule()] }, NOW), "far");
  check("C2c · an empty clause list claims nothing about what the rule changes",
    !/amend|no section/i.test(silent.why || ""), silent.why || "");
  check("C2d · …and still names the regulation and the effective date",
    /FAR rulemaking takes effect/.test(silent.why || "") && silent.days === 9,
    `${silent.why} / ${silent.days}`);

  const dfars = by(buildDeskDigest(
    { ...EMPTY, regRules: [rule({ source: "dfars" })] }, NOW), "far");
  check("C2e · a DFARS rule is not labelled FAR", /^DFARS/.test(dfars.why || ""), dfars.why || "");

  // THE DESK MUST RANK ON THE ACTIONABLE DATE. Measured on the live feed
  // 2026-08-13: 0 of 40 documents carried a future effective date and four
  // carried an open comment window. A desk keyed on the effective date alone
  // renders a card and can never surface a deadline — dead, but not visibly so.
  const commentOnly = by(buildDeskDigest({ ...EMPTY, regRules: [
    rule({ effective_date: null, comments_close_on: iso(5) }),
  ] }, NOW), "far");
  check("C2f · a rule with only a comment window still carries a deadline",
    commentOnly.days === 5, `days=${commentOnly.days}`);
  check("C2g · …and the card says which kind of date it is",
    /comment window closes/i.test(commentOnly.why || ""), commentOnly.why || "");

  // A comment window outranks an effective date even when it is further out:
  // one can be acted on, the other only prepared for.
  const both = by(buildDeskDigest({ ...EMPTY, regRules: [
    rule({ effective_date: iso(2), comments_close_on: null, title: "Effective soon" }),
    rule({ effective_date: null, comments_close_on: iso(12), title: "Comment window" }),
  ] }, NOW), "far");
  check("C2h · the comment window outranks a nearer effective date",
    both.title === "Comment window" && both.days === 12, `${both.title}/${both.days}`);

  // The regression itself: every row effective-dateless, which is the real corpus.
  const realShape = by(buildDeskDigest({ ...EMPTY, regRules: [
    rule({ effective_date: null, comments_close_on: iso(28) }),
    rule({ effective_date: null, comments_close_on: null }),
  ] }, NOW), "far");
  check("C2i · a corpus with no effective dates is not a dead desk",
    realShape.days === 28, `days=${realShape.days}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part C3 · transient RegRow fields never reach the INSERT ──");
// The regulatory_updates upsert spreads `...r`, so any field RegRow gains for a
// READER reaches a table that has no such column and fails the whole write.
{
  const REG = readFileSync(join(ROOT, "src", "app", "api", "regulatory-updates", "route.ts"), "utf8");
  const SCHEMA = readFileSync(join(ROOT, "supabase", "migrations", "005_platform_intelligence.sql"), "utf8");
  const table = SCHEMA.slice(SCHEMA.indexOf("CREATE TABLE IF NOT EXISTS regulatory_updates"));
  const cols = table.slice(0, table.indexOf(");"));

  for (const f of ["raw_text_url", "comments_close_on"]) {
    check(`C3 · ${f} is NOT a column on regulatory_updates`, !cols.includes(f));
    check(`C3 · …and the upsert strips it`,
      new RegExp(`${f}:\\s*_drop`).test(REG), "not destructured out of the spread");
  }
  check("C3 · PLANTED: the strip probe rejects an upsert that keeps the field",
    !/comments_close_on:\s*_drop/.test("rows.map(({ raw_text_url: _drop, ...r }) => r)"));
  check("C3 · the field is actually requested from the API",
    /comments_close_on/.test(readFileSync(join(ROOT, "src", "lib", "federal-register.ts"), "utf8")
      .match(/for \(const f of \[[^\]]+\]/)?.[0] || ""),
    "federalRegisterUrl does not ask for it");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part D · every desk answers, and an unsourced one names its blocker ──");
{
  const all = buildDeskDigest(EMPTY, NOW);
  const DESKS = ["opp", "co", "cmmc", "far", "spend", "gao", "team", "wage"];
  check("D1 · the digest returns a row for EVERY desk", DESKS.every((k) => all.some((r) => r.desk === k)),
    "missing: " + DESKS.filter((k) => !all.some((r) => r.desk === k)).join(","));
  // A desk missing from the array and a desk with nothing to report would look
  // identical on the page, so the array is never partial.
  check("D2 · …and no extras", all.length === DESKS.length, `len=${all.length}`);

  for (const k of ["gao", "team", "wage"]) {
    const d = by(all, k);
    check(`D3 · ${k} declares itself not-sourced`, d.status === "not-sourced", d.status);
    check(`D4 · ${k} names what is missing`, (d.reason || "").length > 20, d.reason || "");
    check(`D5 · ${k} asserts no count`, d.count === null && d.title === null);
  }

  // A non-ok desk must never carry a headline — that is the shape of the whole
  // honest-fail contract, and it is checked structurally rather than per desk.
  for (const d of all) {
    if (d.status !== "ok") {
      check(`D6 · ${d.desk} (${d.status}) carries no title/value`,
        d.title === null && d.value === null && d.count === null && d.days === null);
    } else {
      check(`D6 · ${d.desk} (ok) carries a title and no reason`,
        typeof d.title === "string" && d.title.length > 0 && d.reason === null);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part E · the served page renders the digest, not a placeholder ──");
{
  const CCAPP = readPublic("cc-app.js");
  const LIVE = readPublic("command-center-live.js");
  const ROUTE = readFileSync(join(ROOT, "src", "app", "api", "command-center-data", "route.ts"), "utf8");

  check("E1 · the Feed no longer ships \"ranking not built yet\"",
    !/ranking not built yet/i.test(CCAPP));
  check("E2 · Signals no longer ships one sentence for all six desks",
    !/No cross-desk summary is computed yet/i.test(CCAPP));
  check("E3 · renderSignals reads the digest", /function renderSignals[\s\S]{0,400}CC\.SIGNALS/.test(CCAPP));
  check("E4 · …and renders each desk's own reason", /s\.reason/.test(CCAPP));
  check("E5 · …and distinguishes a measured desk from an unmeasured one",
    /s\.status\s*===\s*'ok'/.test(CCAPP));

  // EXTERNAL TEXT REACHES MARKUP. Notice titles, contact names and Federal
  // Register headlines are written outside this product and land in innerHTML.
  check("E6 · the page escapes desk-derived text", /function esc\(/.test(CCAPP));
  check("E7 · …in Signals", /sig-t[^`]*\$\{esc\(/.test(CCAPP) && /sig-d">\$\{esc\(/.test(CCAPP));
  check("E8 · …and in the Feed", /act-title">\$\{esc\(/.test(CCAPP) && /act-why">\$\{esc\(/.test(CCAPP));

  // An empty feed over sources that never answered is not an all-clear, and the
  // headline has to say which of the two happened.
  check("E8b · the empty feed separates an outage from a quiet day",
    /status === 'unavailable'[\s\S]{0,300}could not be read/.test(CCAPP));

  check("E9 · the wiring layer fills ACTIONS from the digest", /deskDigest/.test(LIVE));
  check("E10 · …keeping only desks that produced an item",
    /status\s*===\s*'ok'/.test(LIVE));
  check("E11 · an outage clears the panels rather than leaving stale rows",
    /SIGNALS\s*=\s*null/.test(LIVE));

  // The route must hand the digest the NULL-PRESERVING array. `opportunities` is
  // [] both when the window is empty and when the read failed; `liveOpps` is not.
  check("E12 · the route computes the digest", /buildDeskDigest\(/.test(ROUTE));
  check("E13 · …from liveOpps, not the []-collapsed array",
    /buildDeskDigest\(\{[\s\S]{0,200}opportunities:\s*liveOpps/.test(ROUTE));
  check("E14 · …and ships it", /\n\s*deskDigest,/.test(ROUTE));
  // CMMC needs the column fetchRecentAudits does not select.
  check("E15 · the route selects compliance_json for the CMMC desk",
    /\.select\("[^"]*compliance_json"\)/.test(ROUTE));
  check("E16 · …scoped to the signed-in user", /compliance_json"\)\s*\n\s*\.eq\("user_id"/.test(ROUTE));
  check("E17 · …failing to null, never to []",
    /\.limit\(200\)\s*\n\s*\.then\(\s*\n?\s*\(r\) => \(r\.error \? null/.test(ROUTE));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Part F · planted positives (the probes must be able to fail) ──");
{
  // F1/F2: the null-vs-empty probe is the load-bearing one. Prove it rejects a
  // builder that collapses them — the exact regression this gate exists to catch.
  const collapsed: DeskSummary = {
    desk: "opp", status: "empty", title: null, why: null, value: null,
    count: null, days: null, urg: "ok", reason: "No live notices match your NAICS in the current window.",
  };
  check("F1 · PLANTED: a failed read mislabelled 'empty' is caught",
    collapsed.status !== "unavailable");
  // The other half of the same defect: a failed read rendered as a measured
  // zero. Run the real builder on a failed source and prove it emits neither.
  const fromFailure = by(buildDeskDigest({ ...EMPTY, opportunities: null }, NOW), "opp");
  check("F2 · PLANTED: a failed read never becomes a measured 0",
    !(fromFailure.status === "ok") && fromFailure.count !== 0,
    `${fromFailure.status}/${fromFailure.count}`);

  // F3: prove the placeholder sweep fails on the string it was written against.
  const OLD = `<div class="fc-t">Cross-desk ranking not built yet</div>`;
  check("F3 · PLANTED: the placeholder sweep catches the old Feed copy",
    /ranking not built yet/i.test(OLD));
  const OLDSIG = `<div class="sig-d">No cross-desk summary is computed yet — open the desk.</div>`;
  check("F4 · PLANTED: …and the old Signals copy",
    /No cross-desk summary is computed yet/i.test(OLDSIG));

  // F5: prove the escaping probe fails on an unescaped template.
  const UNESC = '<div class="act-title">${a.title}</div>';
  check("F5 · PLANTED: the escaping probe rejects an unescaped title",
    !/act-title">\$\{esc\(/.test(UNESC));

  // F6: prove the route probe rejects the []-collapsed array being passed in.
  const BADROUTE = `buildDeskDigest({ opportunities: opportunities, cmmcAudits: null }, nowMs)`;
  check("F6 · PLANTED: the route probe rejects `opportunities` in place of `liveOpps`",
    !/buildDeskDigest\(\{[\s\S]{0,200}opportunities:\s*liveOpps/.test(BADROUTE));

  // F7: prove the CMMC probe rejects a builder that reads a missing column as
  // "not required" — the all-clear this gate is named for.
  const ALLCLEAR = buildDeskDigest(
    { ...EMPTY, cmmcAudits: [{ id: "x", solicitation_number: "S", created_at: iso(-1) }] }, NOW);
  check("F7 · PLANTED: an unanalyzed row never yields status ok",
    by(ALLCLEAR, "cmmc").status !== "ok");
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
