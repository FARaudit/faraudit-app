// sam-feed honest-fail probe. Run: npx tsx src/lib/sam-feed.honestfail.test.ts
//
// THE DEFECT (falsification-first — every assertion here was run RED against the pre-fix code).
// All three failure paths returned an EMPTY SUCCESS: missing SAM_API_KEY · upstream non-2xx · fetch threw
// all produced HTTP 200 `{ solicitations: [] }`, and the dashboard renders an empty list as the sentence
// "No new solicitations in target NAICS codes today." So whenever SAM.gov was merely unreachable, a
// signed-in customer was told — as a positive statement of fact about the federal market — that nothing
// had been posted. Rule 61, in its worse half: an invented ABSENCE, whose invited action is to not bid.
//
// THE COMPLEMENT MATTERS AS MUCH AS THE DEFECT: `ok:true` with an empty list must stay reachable, or the
// fix becomes a machine that reports failure whenever the market is quiet.
import { fetchSamFeed } from "./sam-feed";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const FAKE_KEY = "probe-key-XYZZY-991";
const realFetch = globalThis.fetch;
const prevKey = process.env.SAM_API_KEY;

async function main() {
  console.log("── sam-feed honest-fail ──");

  delete process.env.SAM_API_KEY;
  let o = await fetchSamFeed();
  check("no key: ok===false", o.ok === false);
  check("no key: kind 'unconfigured'", !o.ok && o.kind === "unconfigured", JSON.stringify(o));

  process.env.SAM_API_KEY = FAKE_KEY;
  globalThis.fetch = (async () => new Response("upstream boom", { status: 500 })) as typeof fetch;
  o = await fetchSamFeed();
  check("upstream 500: ok===false", o.ok === false);
  check("upstream 500: kind 'error'", !o.ok && o.kind === "error", JSON.stringify(o));
  check("upstream 500: api_key not in the error string", !o.ok && !o.error.includes(FAKE_KEY));

  // PLANTED KNOWN-POSITIVE: the thrown message embeds the full request URL, key included — which is what
  // a real ECONNREFUSED does. The returned error must be status-only (Rules 32/60).
  globalThis.fetch = (async () => {
    throw new Error(`ECONNREFUSED https://sam.gov/api/prod/opportunities/v2/search?api_key=${FAKE_KEY}`);
  }) as typeof fetch;
  o = await fetchSamFeed();
  check("fetch throws: ok===false", o.ok === false);
  check("fetch throws: kind 'error'", !o.ok && o.kind === "error", JSON.stringify(o));
  check("fetch throws: api_key NEVER echoed", !o.ok && !o.error.includes(FAKE_KEY), "the key leaked into the returned error");

  globalThis.fetch = (async () => new Response(JSON.stringify({
    opportunitiesData: [{ noticeId: "abc", title: "Real Notice", fullParentPathName: "DEPT OF DEFENSE" }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  o = await fetchSamFeed();
  check("live data: ok===true", o.ok === true);
  check("live data: one row, mapped", o.ok && o.solicitations.length === 1 && o.solicitations[0].noticeId === "abc");

  globalThis.fetch = (async () => new Response(JSON.stringify({ opportunitiesData: [] }), {
    status: 200, headers: { "content-type": "application/json" },
  })) as typeof fetch;
  o = await fetchSamFeed();
  check("genuinely empty: ok===true (the ONLY honest 'nothing today')", o.ok === true && o.solicitations.length === 0);

  globalThis.fetch = realFetch;
  if (prevKey === undefined) delete process.env.SAM_API_KEY; else process.env.SAM_API_KEY = prevKey;
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("probe threw:", e); process.exit(2); });
