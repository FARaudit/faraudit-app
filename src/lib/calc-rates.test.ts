// ─────────────────────────────────────────────────────────────────────────────
// GSA CALC LIVE GATE — this defect class is ONLY catchable against the real API.
//
// `fetchCalcRates` sent `search=labor_category:<cat>`. The live endpoint answers
// that with **HTTP 200 and hits.total.value = 0**, every time, for every input.
// So the function returned [] with no error, `/api/labor-rates` quietly kept its
// static BLS table, and nothing anywhere went red. The parser was never wrong —
// `hits.hits[]._source` is the real shape. One query parameter made a whole
// integration inert, silently, for its entire life.
//
// A MOCKED TEST CANNOT SEE THIS. Any fixture written from the reader would have
// carried `hits.hits` and passed. That is the same failure that let the
// certifications producer ship three times reading a SAM key that does not
// exist. So this gate talks to the live API, and its skip is NAMED.
//
// NON-EMPTINESS IS NOT THE TEST — RELEVANCE IS. The first fix attempted here was
// `q=`, which returns HTTP 200 and plenty of rows — the SAME unfiltered rows for
// every term ("Asset Tagging Service" as the top hit for "electrical engineer").
// That is worse than empty: it would price a category against unrelated labour.
// `q`, `query`, `term`, `text` and `labor_category` are all accepted and all
// ignored. `keyword` is the one that filters.
//
//   L1  LIVE — the shipped function returns rows for real categories.
//   L2  RELEVANT — the rows actually match the category asked for, and two
//       different categories do not return the same list.
//   L3  PLANTED — the pre-fix parameter still yields ZERO against the live API,
//       and the near-miss parameter still yields IRRELEVANT rows. If either
//       stops being true the endpoint changed and this gate needs re-deriving.
//   L4  NAMED SKIP — an unreachable API says so loudly and exits 0. Absent input
//       is never a silent pass, and never a red build for someone offline.
//
// Run: npx tsx src/lib/calc-rates.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { fetchCalcRates } from "./calc-rates";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const BASE = "https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/";

async function rawTop(param: string, term: string): Promise<string[] | null> {
  try {
    const r = await fetch(`${BASE}?${param}=${encodeURIComponent(term)}&page_size=5`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const j = await r.json() as { hits?: { hits?: Array<{ _source?: { labor_category?: string } }> } };
    return (j?.hits?.hits ?? []).map((h) => h._source?.labor_category ?? "").filter(Boolean);
  } catch { return null; }
}

async function main() {
  // ── L4 · reachability, decided FIRST so a skip is named rather than inferred ──
  const reach = await rawTop("keyword", "welder");
  if (reach === null) {
    console.log("\n⏭  NAMED SKIP — api.gsa.gov unreachable or non-200 from here.");
    console.log("   This gate asserts nothing when the API cannot be reached. That is a SKIP, not a pass:");
    console.log("   the defect it guards (a silently inert integration) is invisible without the live call.");
    console.log("\n✅ 0 passed, 0 failed (skipped)");
    process.exit(0);
  }

  console.log("\nL1 · the shipped function returns live rows");
  const engineer = await fetchCalcRates("electrical engineer", { pageSize: 25 });
  ok(engineer.length > 0, "fetchCalcRates('electrical engineer') returns rows", `${engineer.length}`);
  ok(engineer.some((r) => r.current_price !== null), "at least one row carries a price",
    engineer[0] ? `e.g. ${engineer[0].labor_category} $${engineer[0].current_price}` : "");

  console.log("\nL2 · the rows are RELEVANT, not just present");
  const rel = engineer.filter((r) => /engineer/i.test(r.labor_category)).length;
  ok(rel / Math.max(engineer.length, 1) >= 0.5,
    "a majority of rows mention the category asked for", `${rel}/${engineer.length}`);

  const welder = await fetchCalcRates("welder", { pageSize: 25 });
  ok(welder.length > 0, "a second, unrelated category also returns rows", `${welder.length}`);
  ok(welder.filter((r) => /weld/i.test(r.labor_category)).length >= welder.length / 2,
    "and those rows are welders");
  // The decisive one: two categories must NOT return the same list. That is exactly what the
  // ignored-parameter failure looks like from the outside.
  ok(engineer[0]?.labor_category !== welder[0]?.labor_category,
    "two different categories return DIFFERENT rows (the ignored-param signature)",
    `${engineer[0]?.labor_category} vs ${welder[0]?.labor_category}`);

  console.log("\nL3 · planted — the old and near-miss parameters are still wrong");
  const preFix = await rawTop("search", "labor_category:engineer");
  ok(preFix !== null && preFix.length === 0,
    "PLANTED: the pre-fix `search=labor_category:<cat>` still returns ZERO rows",
    preFix === null ? "endpoint refused — re-derive this gate" : `${preFix.length}`);

  const nearMiss = await rawTop("q", "electrical engineer");
  ok(nearMiss !== null && nearMiss.length > 0 && !/engineer/i.test(nearMiss[0]),
    "PLANTED: the near-miss `q=` returns rows that are NOT the category (worse than empty)",
    nearMiss?.[0] ?? "");

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
