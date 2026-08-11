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
import { fetchDefenseSpending, agencyKeyOf } from "./defense-spending";
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

  // ── THE KPI COUNTS THE PANEL'S OWN ROWS ──────────────────────────────────
  // USAspending lists a recipient more than once when it holds separate award
  // records, so a count of DISTINCT NAMES sits below a count of ROWS. The
  // fixture carries that duplication on purpose.
  const dupFy = out.BY_FY.FY2026;
  const recipientKpi = dupFy.kpis.find((k) => /recipient/i.test(k.label));
  assert(!!recipientKpi && Number(recipientKpi.val) === dupFy.incumbents.length,
    "the recipients KPI states the number of rows the panel renders, not a distinct-name count");
  assert(!!recipientKpi && Number(recipientKpi.sub.split(" ")[0]) === dupFy.incumbents.filter((i) => i.sb).length,
    "and its small-business sub-line counts the same rows");

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
  assert(JSON.stringify(panels) === JSON.stringify(["budget-trajectory", "ndaa", "opportunity-matrix", "pricing"]),
    "all four unsourced panels are named rather than left to render empty");
  assert(out.unsupported.every((u) => u.needs.length > 20),
    "each states the measurement it would need — an unsourced panel and an empty one must not read alike");

  // ── THE EMPTY CASES ARE DISTINCT ──────────────────────────────────────────
  const noCodes = await fetchDefenseSpending(fakeClient(ROWS), []);
  assert(noCodes.state === "no-profile-codes",
    "no codes on file is its own state — a profile the customer can fix");
  const noRows = await fetchDefenseSpending(fakeClient(ROWS), ["541330"]);
  assert(noRows.state === "no-rows",
    "codes on file with nothing pulled is a DIFFERENT state — never another code's figures under theirs");
  assert(noRows.state === "no-rows" && JSON.stringify(noRows.requested) === JSON.stringify(["541330"]),
    "and it names which code was asked for");

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
