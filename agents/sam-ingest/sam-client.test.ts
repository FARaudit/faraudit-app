// Falsification probe for sam-client searchPage request construction.
// Run: DRY_RUN=true npx tsx agents/sam-ingest/sam-client.test.ts
//
// SAM v2 search silently IGNORES `naicsCode` and only filters on `ncode`
// (probed live 2026-07-29: naicsCode=336413 → totalRecords 11,901 with
// unrelated NAICS in results; ncode=336413 → 439, all 336413). This probe
// asserts the request URL the client actually builds — not the response —
// so a regression back to the dead param goes RED, not silently green.
//
// Known-positive: the stubbed fetch returns one row; if the harness can't
// see that row come back, every other assertion here is inert.

process.env.SAM_API_KEY = process.env.SAM_API_KEY || "probe-key-not-real";

const captured: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any) => {
  captured.push(String(url));
  return new Response(
    JSON.stringify({
      totalRecords: 1,
      opportunitiesData: [{ noticeId: "probe-notice-1", title: "PROBE", naicsCode: "336413", resourceLinks: ["https://sam.gov/x.pdf"] }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}) as any;

// @ts-expect-error tsx
const samNs: any = await import("./sam-client.ts");
const sam = samNs.default ?? samNs;
const { searchAll } = sam;

const items = await searchAll({
  naicsCode: "336413",
  setAside: "SDVOSBC",
  postedFrom: "07/01/2026",
  postedTo: "07/29/2026",
  pageLimit: 100
});
globalThis.fetch = realFetch;

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗ FAIL"} ${label}`);
  if (!ok) failures++;
}

check("exactly one request issued", captured.length === 1);
const url = new URL(captured[0] || "https://invalid.example/");
check("endpoint is sam.gov/api/prod/opportunities/v2/search", url.hostname === "sam.gov" && url.pathname === "/api/prod/opportunities/v2/search");
check("NAICS filter sent as ncode (the param SAM v2 actually filters on)", url.searchParams.get("ncode") === "336413");
check("naicsCode param ABSENT (SAM v2 silently ignores it — dead param)", url.searchParams.get("naicsCode") === null);
check("typeOfSetAside passed through", url.searchParams.get("typeOfSetAside") === "SDVOSBC");
check("date window passed through", url.searchParams.get("postedFrom") === "07/01/2026" && url.searchParams.get("postedTo") === "07/29/2026");
check("known-positive: stubbed row visible through searchAll", items.length === 1 && items[0]?.noticeId === "probe-notice-1");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall green");
process.exit(failures ? 1 : 0);
