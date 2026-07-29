// /api/sam fail-closed probe.
// Run: npx tsx src/app/api/sam/route.failclosed.test.ts
//
// Contract under test (falsification-first — this probe was run RED against the
// pre-fix route, which returned HTTP 200 with invented DEMO_OPPORTUNITIES on
// every failure path and omitted SAM's mandatory postedTo parameter):
//   1. No SAM_API_KEY        → non-200, zero rows, no fabricated content.
//   2. Upstream dead         → non-200, zero rows, no fabricated content.
//   3. The API key is NEVER echoed into a response body, even when the
//      upstream error message contains the full request URL (planted
//      known-positive: the stub throws an error that embeds the key).
//   4. The upstream request carries postedFrom AND postedTo (MM/dd/yyyy),
//      hits sam.gov/api/prod, and sends ONE naicsCode per call.
//
// Phases run in separate processes because the key is read from the
// environment (module-scope in the pre-fix route; per-request after).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const FAKE_KEY = "probe-key-XYZZY-991";
// Strings that only appear in the fabricated demo payload the old route shipped.
const FABRICATION_MARKERS = ["DEMO-", "Lockheed", "T-38 Talon"];

function bodyIsHonest(label: string, status: number, bodyText: string) {
  let rows: unknown[] = [];
  try {
    const parsed = JSON.parse(bodyText);
    if (Array.isArray(parsed.opportunities)) rows = parsed.opportunities;
  } catch { /* non-JSON body counts as zero rows */ }
  check(`${label}: non-200 status`, status !== 200, `got ${status}`);
  check(`${label}: zero opportunity rows`, rows.length === 0, `got ${rows.length} rows`);
  for (const marker of FABRICATION_MARKERS) {
    check(`${label}: no fabricated marker "${marker}"`, !bodyText.includes(marker));
  }
}

async function phaseNokey() {
  delete process.env.SAM_API_KEY;
  const { GET } = await import("./route");
  const res = await GET(new Request("http://localhost/api/sam?naics=336413&limit=5"));
  const text = await res.text();
  bodyIsHonest("no-key", res.status, text);
}

async function phaseKey() {
  process.env.SAM_API_KEY = FAKE_KEY;

  // ── K1: request correctness (upstream healthy, empty result) ──
  const seenUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seenUrls.push(String(input));
    return new Response(JSON.stringify({ opportunitiesData: [], totalRecords: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const { GET } = await import("./route");
  const res1 = await GET(new Request("http://localhost/api/sam?naics=336413,332710&limit=5"));
  const body1 = await res1.text();

  check("K1: upstream called", seenUrls.length > 0, "no fetch issued");
  // MM/dd/yyyy — URLSearchParams encodes "/" as %2F.
  const dateRe = /=\d{2}%2F\d{2}%2F\d{4}/;
  for (const u of seenUrls) {
    check("K1: postedFrom present + MM/dd/yyyy", /postedFrom=\d{2}%2F\d{2}%2F\d{4}/.test(u), u);
    check("K1: postedTo present + MM/dd/yyyy", /postedTo=\d{2}%2F\d{2}%2F\d{4}/.test(u), u);
    check("K1: host is sam.gov/api/prod", u.startsWith("https://sam.gov/api/prod/opportunities/v2/search"), u);
    // ncode is the param SAM actually filters on (naicsCode is silently
    // ignored — empirically probed 2026-07-29: 11,901 unfiltered vs 439 filtered).
    const naicsParam = new URL(u).searchParams.get("ncode") || "";
    check("K1: single ncode per call", naicsParam.length > 0 && !naicsParam.includes(","), naicsParam);
  }
  check("K1: one call per requested NAICS code", seenUrls.length === 2, `got ${seenUrls.length}`);
  check("K1: healthy empty upstream → 200", res1.status === 200, `got ${res1.status}`);
  try {
    const parsed = JSON.parse(body1);
    check("K1: source=live with zero rows", parsed.source === "live" && Array.isArray(parsed.opportunities) && parsed.opportunities.length === 0, body1.slice(0, 200));
  } catch {
    check("K1: source=live with zero rows", false, "body not JSON");
  }

  // ── K2: upstream dead + key-bearing error message (planted known-positive) ──
  globalThis.fetch = (async () => {
    throw new Error(`connect ECONNREFUSED https://sam.gov/api/prod/opportunities/v2/search?api_key=${FAKE_KEY}&naicsCode=336413`);
  }) as typeof fetch;
  const res2 = await GET(new Request("http://localhost/api/sam?naics=336413&limit=5"));
  const body2 = await res2.text();
  bodyIsHonest("dead-upstream", res2.status, body2);
  check("dead-upstream: API key never echoed", !body2.includes(FAKE_KEY), "key leaked into response body");
}

async function main() {
  const phase = process.env.SAM_PROBE_PHASE;
  if (phase === "nokey") { await phaseNokey(); }
  else if (phase === "key") { await phaseKey(); }
  else {
    // Orchestrator: run both phases as child processes.
    for (const p of ["nokey", "key"]) {
      const r = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], {
        env: { ...process.env, SAM_PROBE_PHASE: p },
        encoding: "utf8",
      });
      process.stdout.write(r.stdout || "");
      process.stderr.write(r.stderr || "");
      if (r.status !== 0) process.exitCode = 1;
    }
    return;
  }
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
