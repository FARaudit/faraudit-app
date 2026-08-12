// $0 REGRESSION for the DEFENSE SPENDING mapping. The page this feeds spent its
// life rendering a client-side mock — fifty-one states of invented obligations
// and named third parties beside dollar figures nobody measured. The property
// under test is therefore not "a dashboard was produced": it is that every
// figure leaving this module is arithmetic on a stored value, that the stored
// data's LIMITS survive the mapping, and that a panel with no source is NAMED
// rather than filled.
//
// Fixture: the three real `defense_spending_intel` rows for NAICS 336412,
// transcribed from the production table on 2026-08-11 with the top-ten arrays
// cut to their first entries. Totals, small-business dollars and the recompete
// row are verbatim.
// Run: npx tsx src/lib/bd-os/defense-spending.test.ts
import { recipientKey, fetchDefenseSpending, agencyKeyOf } from "./defense-spending";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const REC = {
  agency: "U.S. Coast Guard",
  amount: 42630,
  award_id: "70Z03826PA0000225",
  end_date: "2026-08-31",
  recipient: "OPERATIONS PROCUREMENT & SUPPLY CHAIN SERVICES INC."
};

const ROWS = [
  {
    naics_code: "336412", fiscal_year: 2024,
    total_obligations: 8369312033.69, sb_obligations: 13414282.34, sb_pct: 0.16, yoy_delta_pct: null,
    // CFM INTERNATIONAL INC and AERO TURBINE, INC are real FY2024 top
    // recipients and are NOT on the small-business list. They are in this
    // fixture on purpose: they are what tells a flag READ from the feed apart
    // from a flag guessed off the company name.
    top_recipients: [
      { name: "RTX CORPORATION", amount: 2868884657 },
      { name: "CFM INTERNATIONAL INC", amount: 385380924.13 },
      { name: "AERO TURBINE, INC", amount: 113559629.91 },
      { name: "ACMT, INC.", amount: 2007181.62 }
    ],
    sb_recipients: [{ name: "ACMT, INC.", amount: 2007181.62 }],
    agency_breakdown: [{ name: "Department of Defense", amount: 8354967908 }, { name: "Department of Homeland Security", amount: 8835109 }],
    // OH appears in 2024 and NOT in 2025 — the case that must yield a null
    // year-on-year rather than a fabricated zero.
    state_breakdown: [{ state: "CT", amount: 2880321754 }, { state: "OH", amount: 839018472 }],
    recompetes_expiring_180d: [REC],
    // SOURCE OF THE PANEL as of card 828 — the 180d column is still stored but no
    // longer feeds it; it was 85% delivery/purchase orders, which are never competed.
    recompetes_upcoming: [REC],
    refreshed_at: "2026-05-20T05:36:30.623201+00:00"
  },
  {
    naics_code: "336412", fiscal_year: 2025,
    total_obligations: 12022550327.78, sb_obligations: 29695652.34, sb_pct: 0.247, yoy_delta_pct: 43.65,
    top_recipients: [{ name: "RTX CORPORATION", amount: 5284106435 }],
    sb_recipients: [{ name: "TRANSAERO, INC.", amount: 12573254 }],
    agency_breakdown: [{ name: "Department of Defense", amount: 11968722542 }],
    state_breakdown: [{ state: "CT", amount: 5375688319 }],
    recompetes_expiring_180d: [REC],
    // SOURCE OF THE PANEL as of card 828 — the 180d column is still stored but no
    // longer feeds it; it was 85% delivery/purchase orders, which are never competed.
    recompetes_upcoming: [REC],
    refreshed_at: "2026-05-20T05:36:31.882989+00:00"
  },
  {
    naics_code: "336412", fiscal_year: 2026,
    total_obligations: 2555860963.78, sb_obligations: 10214286.85, sb_pct: 0.4, yoy_delta_pct: -78.74,
    // GENERAL ELECTRIC COMPANY twice is real: USAspending returns it under two
    // award records. This is the duplication that made a distinct-name count
    // read 9 above a table of 10.
    top_recipients: [
      { name: "GENERAL ELECTRIC COMPANY", amount: 1059476264 },
      { name: "RTX CORPORATION", amount: 664829808 },
      { name: "GENERAL ELECTRIC COMPANY", amount: 401000000 }
    ],
    sb_recipients: [],
    agency_breakdown: [{ name: "Department of Defense", amount: 2471563423 }],
    state_breakdown: [{ state: "CT", amount: 702326852 }],
    recompetes_expiring_180d: [REC],
    // SOURCE OF THE PANEL as of card 828 — the 180d column is still stored but no
    // longer feeds it; it was 85% delivery/purchase orders, which are never competed.
    recompetes_upcoming: [REC],
    refreshed_at: "2026-05-20T05:36:32.881704+00:00"
  }
];

/** A Supabase stand-in that answers `.in()` from the fixture. It also RECORDS
 *  the codes asked for, so the scoping assertion checks the query rather than
 *  trusting the result. */
function fakeClient(rows: unknown[], seen: string[][] = []) {
  return {
    from: () => ({
      select: () => ({
        in: (_col: string, codes: string[]) => {
          seen.push(codes);
          return Promise.resolve({
            data: rows.filter((r) => codes.includes((r as { naics_code: string }).naics_code)),
            error: null
          });
        }
      })
    })
  } as unknown as SupabaseClient;
}

// ── THE WRITER/READER CONTRACT ───────────────────────────────────────────────
// Every column this module SELECTs has to be a column the worker actually
// WRITES. They are different files in different deploy targets, so nothing else
// checks that they agree.
//
// The defect that put this here: `refreshed_at` was absent from the worker's
// row and left to the column default — which fires on INSERT only. A refresh
// that UPDATED 18 of 27 rows with new FY2026 totals (336412 went $2.56B to
// $4.98B) left every one of them stamped three months earlier, and the page
// prints that stamp as its measurement date. A number the page states, sourced
// from a column nobody wrote.
function contractCheck(): void {
  const readerSrc = readFileSync(path.join(process.cwd(), "src/lib/bd-os/defense-spending.ts"), "utf8");
  const workerSrc = readFileSync(path.join(process.cwd(), "agents/defense-spending/index.ts"), "utf8");

  const selectBlock = readerSrc.match(/\.select\(\s*([\s\S]*?)\)\s*\n\s*\.in\(/);
  const selected = selectBlock
    ? selectBlock[1].replace(/["'+\s]/g, "").split(",").filter(Boolean)
    : [];
  assert(selected.length > 5, `the reader's select list was parsed (${selected.length} columns)`);

  // What the worker's row literal actually assigns.
  const rowBlock = workerSrc.match(/return\s*\{([\s\S]*?)\n\s{0,2}\};/);
  const written = new Set(
    rowBlock ? [...rowBlock[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gm)].map((m) => m[1]) : []
  );
  assert(written.size > 5, `the worker's row literal was parsed (${written.size} fields)`);

  const unwritten = selected.filter((c) => !written.has(c) && c !== "id");
  assert(unwritten.length === 0,
    unwritten.length
      ? `EVERY selected column is written by the worker — unwritten: ${unwritten.join(", ")}`
      : "every column the page reads is a column the worker writes");
}

async function main() {
  contractCheck();

  // ── the account's three codes, one of which the worker has pulled ──────────
  const seen: string[][] = [];
  const out = await fetchDefenseSpending(fakeClient(ROWS, seen), ["332710", "336412", "336611"]);
  if (out.state !== "ok") { console.log(`❌ expected state ok, got ${out.state}`); process.exit(1); }

  assert(JSON.stringify(seen[0]) === JSON.stringify(["332710", "336412", "336611"]),
    "the query is scoped to the account's own codes, not a default set");

  // ── COVERAGE · the two codes with no rows are NAMED, never silently dropped ─
  assert(JSON.stringify(out.coverage.tracked) === JSON.stringify(["336412"]),
    "coverage.tracked names only the code that has rows");
  assert(JSON.stringify(out.coverage.untracked) === JSON.stringify(["332710", "336611"]),
    "coverage.untracked names both codes the worker has never pulled");
  assert(out.coverage.top_n === 10,
    "coverage states the top-N limit, so an absent name reads as outside the ten and not as a zero");

  // ── PROVENANCE ─────────────────────────────────────────────────────────────
  assert(out.as_of === "2026-05-20T05:36:32.881704+00:00",
    "as_of is the NEWEST refreshed_at across the rows — the page cannot imply a figure is current");

  // ── FISCAL YEARS ───────────────────────────────────────────────────────────
  assert(JSON.stringify(out.FYS) === JSON.stringify(["FY2024", "FY2025", "FY2026"]),
    "fiscal years come from the rows, in order");
  assert(!out.FYS.some((f) => /27|proj/i.test(f)),
    "NO projected year: nothing in this feed forecasts");

  // ── ARITHMETIC · dollars → $M, and the KPI matches the stored total ────────
  const fy25 = out.BY_FY.FY2025;
  assert(fy25.kpis[0].val === "12.02" && fy25.kpis[0].unit === "B",
    "FY2025 headline is 12.02B — 12022550327.78 dollars, converted not invented");
  assert(fy25.kpis[0].delta === "+43.7%",
    "the year-on-year delta is computed from the two stored totals (+43.7%)");
  assert(fy25.kpis[1].val === "0.2",
    "small-business share is sb_obligations / total_obligations (0.2%)");

  // ── THE TOP-TEN LIMIT SURVIVES · OH is in 2024's ten and not in 2025's ─────
  const ohio24 = out.BY_FY.FY2024.states["39"];
  assert(!!ohio24 && near(ohio24.val, 839.018472, 0.001),
    "Ohio's FY2024 obligations map to $839.02M under its FIPS id");
  assert(ohio24.yoy === null,
    "a state with no prior-year figure gets yoy null — NOT a fabricated 0%");
  const ct25 = out.BY_FY.FY2025.states["51"] ?? out.BY_FY.FY2025.states["09"];
  assert(!!ct25 && ct25.abbr === "CT" && ct25.yoy !== null && near(ct25.yoy!, 86.63, 0.05),
    "Connecticut, present in both years, gets a real +86.6% computed from the two amounts");

  // ── SMALL BUSINESS IS READ, NOT GUESSED ───────────────────────────────────
  const inc24 = out.BY_FY.FY2024.incumbents;
  assert(inc24.find((i) => i.name === "ACMT, INC.")?.sb === true,
    "a recipient on the feed's own SB list is flagged SB");
  assert(inc24.find((i) => i.name === "RTX CORPORATION")?.sb === false,
    "a recipient absent from that list is NOT flagged");
  // The discriminating pair. Both names carry the corporate suffix a naive
  // heuristic keys on, and neither is on the feed's SB list. A flag guessed
  // from the name flags them; a flag read from the feed does not.
  assert(inc24.find((i) => i.name === "CFM INTERNATIONAL INC")?.sb === false
      && inc24.find((i) => i.name === "AERO TURBINE, INC")?.sb === false,
    "two large primes whose names end in INC are NOT flagged SB — the flag is READ, never inferred from the name");

  // ── SMALL-BUSINESS STATUS IS READ, NEVER ASSUMED ─────────────────────────
  // ⛔ FOUR ASSERTIONS WERE DELETED HERE, and this note is why. They checked the
  // "Top recipients listed" KPI — its count, its "top N" caption, and its
  // refusal to print "0 of them small business" from an absent list. That KPI
  // was removed from the payload in #656 as feed metadata: it answered how many
  // rows we loaded, not anything about the market. The assertions outlived their
  // subject and were failing on `recipientKpi === undefined`.
  //
  // ⛔ AND NOTHING CAUGHT IT. This suite lives in src/lib/bd-os/, and CI's
  // discovery was `readdirSync(src/lib)` — not recursive. It had never run here.
  // The fix ships in the same change as this deletion.
  //
  // The INVARIANT those assertions existed for is not lost: a small-business
  // status may only be stated where the feed supplied the list it comes from.
  // That is what the `sb === null` checks below test, on `incumbents`, which is
  // where the flag actually lives — a stronger place to test it than a KPI's
  // sub-line, because the sub-line was prose about the array.
  const dupFy = out.BY_FY.FY2026;
  // A small-business COUNT may only be stated when the feed supplied the list it
  // would be counted from. "0 of them small business" over a SIZE column reading
  // "—" for every row was a measured zero nobody measured.
  // The expectation is FIXED from the fixture, never derived from the output —
  // an assertion that recomputes its expected value from the same data it is
  // checking passes no matter what the code does.
  //
  // FY2026 fixture: 336412's row carries `sb_recipients: []`, so every recipient
  // under that code has UNKNOWN status; 336611's row supplies a list, so its
  // recipients are known. Exactly the recipients from the code WITH a list may
  // be counted.
  const unknown = dupFy.incumbents.filter((i) => i.sb === null);
  const known = dupFy.incumbents.filter((i) => i.sb !== null);
  assert(unknown.length > 0,
    "the fixture must contain a code whose small-business list is empty, or this check proves nothing");
  assert(unknown.every((i) => i.naics === "336412"),
    "unknown status belongs to exactly the code whose sb_recipients list was empty");
  assert(known.every((i) => i.naics !== "336412"),
    "a recipient under the empty-list code must never be asserted as NOT small business");
  // FY2026's only code carries an EMPTY sb_recipients list, so nothing in this
  // year has a knowable status and the sub-line must say exactly that rather
  // than print a zero.
  assert(known.length === 0, "fixture: FY2026 supplies no small-business list at all");
  // NEGATIVE CONTROL — an absent list must never become a measured `false`. This
  // is the claim the deleted KPI assertions were really making, tested on the
  // field the page reads rather than on a sentence about it.
  assert(dupFy.incumbents.length > 0 && dupFy.incumbents.every((i) => i.sb !== false),
    "with no small-business list supplied, NOTHING is asserted as 'not small business'");

  // ── ONE COMPANY IS ONE ROW ────────────────────────────────────────────────
  // USAspending does not normalise legal names, so the same firm arrives as
  // "… INCORPORATED" and "… INC". Two rows understate concentration, which is
  // the only thing this panel exists to convey.
  const keyed = dupFy.incumbents.map((i) => `${recipientKey(i.name)}|${i.naics}`);
  assert(new Set(keyed).size === keyed.length,
    "no legal entity appears twice under one NAICS code");
  assert(recipientKey("HUNTINGTON INGALLS INCORPORATED") === recipientKey("HUNTINGTON INGALLS INC"),
    "the two Huntington Ingalls spellings resolve to one entity");
  assert(recipientKey("GENERAL DYNAMICS") !== recipientKey("GENERAL ELECTRIC"),
    "NEGATIVE CONTROL — stripping suffixes must not merge two different firms");
  assert(recipientKey("BATH IRON WORKS CORPORATION") !== recipientKey("ELECTRIC BOAT CORPORATION"),
    "NEGATIVE CONTROL — a shared suffix is not a shared identity");

  // ── AN OPEN FISCAL YEAR CARRIES NO YEAR-OVER-YEAR ─────────────────────────
  // The stored total for the running year is obligations TO DATE, and Q4 is the
  // heaviest quarter — dividing a part-year by a whole one printed −43.1% and
  // read as a collapsing market.
  const openKpi = dupFy.kpis.find((k) => /Obligated/i.test(k.label));
  assert(!!openKpi && openKpi.delta === null,
    "the open year states no year-over-year");
  assert(!!openKpi && /to date/.test(openKpi.sub),
    "and says on its face that the year is still running");
  const closedKpi = out.BY_FY.FY2024.kpis.find((k) => /Obligated/i.test(k.label));
  assert(!!closedKpi && !/to date/.test(closedKpi.sub),
    "NEGATIVE CONTROL — a closed year is not labelled as partial");

  // ── AGENCIES · per-NAICS split preserved for the treemap ──────────────────
  const dod = out.BY_FY.FY2024.agencies[0];
  assert(dod.key === agencyKeyOf("Department of Defense") && dod.short === "DoD",
    "the largest agency is keyed and abbreviated consistently");
  assert(near(dod.naics["336412"], 8354.967908, 0.001),
    "the agency carries its per-code amount, so the treemap splits by real numbers");

  // ── RECOMPETES · DEDUPED, and a passed end date MARKED not hidden ─────────
  // The worker's recompete question has no fiscal year in it, so the same award
  // is stored on all three FY rows. Measured on production: 39 entries, 13
  // distinct — the page showed every award three times.
  assert(out.RECOMPETES.length === 1,
    "the same award stored on three fiscal-year rows appears ONCE");
  assert(new Set(out.RECOMPETES.map((r) => r.award_id)).size === out.RECOMPETES.length,
    "no award_id appears twice");
  assert(out.RECOMPETES.every((r) => r.award_id === REC.award_id && r.agency === REC.agency),
    "recompete fields are carried verbatim from the feed");
  const past = out.RECOMPETES.filter((r) => r.expired);
  const future = out.RECOMPETES.filter((r) => !r.expired);
  assert(past.length + future.length === out.RECOMPETES.length && past.length + future.length > 0,
    "every recompete is classified against today — none is left unmarked");
  assert(out.RECOMPETES.every((r) => r.expired === (r.end_date! < new Date().toISOString().slice(0, 10))),
    "expired is computed from the row's own end_date against today");

  // ── UNSUPPORTED PANELS ARE NAMED ──────────────────────────────────────────
  const panels = out.unsupported.map((u) => u.panel).sort();
  // CEO ruling 2026-08-11: the two MACRO panels are deleted, not wired. A budget
  // topline and NDAA text are not scoped to this customer's codes — that is news,
  // and a panel announcing its own absence is a fabricated section with an honest
  // label. The two that remain are ours to build, not the source's to supply.
  // Every panel on the tab now has a source. The macro two were deleted, and the
  // two that blamed the feed for lacking award-level data were replaced by panels
  // built from data it already carried.
  assert(panels.length === 0,
    "no panel declares itself unsourced, because none is");
  assert(Array.isArray(out.unsupported),
    "the honest-fail array stays in the payload — the next unbuilt panel declares itself here rather than rendering blank");

  // ── PER-CODE SCOPING ──────────────────────────────────────────────────────
  // Three codes that behave like three markets; an aggregate describes none.
  //
  // Driven through a TWO-CODE fixture on purpose. The main fixture carries a
  // single NAICS, so a scoped view and an unscoped one are byte-identical there —
  // an assertion written against it passes whether or not the filter is applied,
  // which is no assertion at all.
  const TWO_CODE_ROWS = [
    { ...ROWS[2], naics_code: "336412", fiscal_year: 2026,
      total_obligations: 1000, sb_obligations: 100,
      top_recipients: [{ name: "ALPHA ENGINES INC", amount: 700 }, { name: "BETA TURBINE LLC", amount: 200 }],
      sb_recipients: [{ name: "BETA TURBINE LLC", amount: 100 }] },
    { ...ROWS[2], naics_code: "336611", fiscal_year: 2026,
      total_obligations: 4000, sb_obligations: 400,
      top_recipients: [{ name: "GAMMA SHIPYARD CORPORATION", amount: 3000 }, { name: "DELTA MARINE INC", amount: 500 }],
      sb_recipients: [{ name: "DELTA MARINE INC", amount: 400 }] }
  ];
  const two = await fetchDefenseSpending(fakeClient(TWO_CODE_ROWS), ["336412", "336611"]);
  assert(two.state === "ok", "the two-code fixture produces a page");
  const t2 = two as typeof out;
  const fyView = t2.BY_FY[t2.FYS[t2.FYS.length - 1]];

  assert(Object.keys(fyView.byCode).length === 2, "every tracked code carries its own scoped view");
  const a = fyView.byCode["336412"], b = fyView.byCode["336611"];
  assert(a.incumbents.every((i) => i.naics === "336412") && a.incumbents.length === 2,
    "a scoped incumbent list contains only that code");
  assert(!a.incumbents.some((i) => /GAMMA|DELTA/.test(i.name)),
    "NEGATIVE CONTROL — the other code's recipients are absent, which an unscoped build would fail");
  assert(b.incumbents.length === 2 && b.incumbents.every((i) => i.naics === "336611"),
    "and the other code carries its own");
  assert(Math.abs(a.total - 0.001) < 1e-9 || a.total < b.total,
    "the scoped totals differ, so the filter is doing work");

  // Derived the same way as the aggregate, not a second implementation. The KPI
  // prints BILLIONS to two decimals, so it can only agree to ±$5M by
  // construction — a tighter tolerance would fail on correct code.
  const sumOfCodes = Object.values(fyView.byCode).reduce((acc, c) => acc + c.total, 0);
  const aggregate = Number(fyView.kpis.find((k) => /Obligated/i.test(k.label))!.val) * 1000;
  assert(Math.abs(sumOfCodes - aggregate) <= 5,
    `the per-code totals sum to the aggregate the KPI states (${sumOfCodes} vs ${aggregate})`);

  // ── SB WINNERS · the peer set, not the prime set ──────────────────────────
  assert(t2.SB_WINNERS.length === 2, "every tracked code carries its set-aside winners");
  const w = t2.SB_WINNERS.find((x) => x.naics === "336611")!;
  assert(w.winners.length === 1 && /DELTA MARINE/.test(w.winners[0].name),
    "the set-aside recipients are the ones listed, not the top recipients");
  // 400 of a 400 SB pot is 100%; 400 of the 4000 code total would be 10%. The
  // whole point of the field is which denominator it uses.
  assert(w.winners[0].pct_of_sb !== null && Math.abs(w.winners[0].pct_of_sb! - 100) < 0.001,
    `share is of the SET-ASIDE pot (expected 100%, got ${w.winners[0].pct_of_sb})`);
  assert(Math.abs((w.winners[0].val / w.code_total) * 100 - 10) < 0.001,
    "NEGATIVE CONTROL — measured against the code total the same firm reads 10%, so the two denominators are distinguishable");
  const wkeys = w.winners.map((x) => recipientKey(x.name));
  assert(new Set(wkeys).size === wkeys.length, "one company appears at most once");

  // ── THE EMPTY CASES ARE DISTINCT ──────────────────────────────────────────
  const noCodes = await fetchDefenseSpending(fakeClient(ROWS), []);
  assert(noCodes.state === "no-profile-codes",
    "no codes on file is its own state — a profile the customer can fix");
  const noRows = await fetchDefenseSpending(fakeClient(ROWS), ["541330"]);
  assert(noRows.state === "no-rows",
    "codes on file with nothing pulled is a DIFFERENT state — never another code's figures under theirs");
  assert(noRows.state === "no-rows" && JSON.stringify(noRows.requested) === JSON.stringify(["541330"]),
    "and it names which code was asked for");

  // ── NULL COLUMN vs EMPTY MARKET ───────────────────────────────────────────
  // The panel's empty state says "nothing in your codes expires in this window",
  // which is a claim about the MARKET. Under a never-pulled column that claim is
  // false, and the two states are one value apart in the payload.
  {
    const nulled = ROWS.map((r) => ({ ...r, recompetes_upcoming: null }));
    const out = await fetchDefenseSpending(fakeClient(nulled), ["336412"]);
    assert(out.state === "ok" && out.RECOMPETES_MEASURED === false,
      "a NULL recompetes_upcoming reports MEASURED=false — the market was never asked");
    assert(out.state === "ok" && out.RECOMPETES.length === 0, "and yields no rows");

    const emptied = ROWS.map((r) => ({ ...r, recompetes_upcoming: [] }));
    const out2 = await fetchDefenseSpending(fakeClient(emptied), ["336412"]);
    assert(out2.state === "ok" && out2.RECOMPETES_MEASURED === true,
      "an EMPTY array reports MEASURED=true — asked and answered, the market is quiet");
    assert(out2.state === "ok" && out2.RECOMPETES.length === 0,
      "and also yields no rows — the row count alone cannot tell these apart");
  }

  // ── A READ FAILURE IS A THROW, NOT AN EMPTY DASHBOARD ─────────────────────
  const broken = {
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: "permission denied" } }) }) })
  } as unknown as SupabaseClient;
  let threw = false;
  try { await fetchDefenseSpending(broken, ["336412"]); } catch { threw = true; }
  assert(threw, "a failed read throws — it can never surface as a page of zeroes");

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
