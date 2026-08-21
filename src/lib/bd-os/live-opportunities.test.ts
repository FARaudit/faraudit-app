// Live /home feed — SAM param contract + mapping + failure direction.
// Run: npx tsx src/lib/bd-os/live-opportunities.test.ts
//
// Planted positives: P1 asserts the request would FAIL if the client
// regressed to naicsCode (the silently-ignored param the ncode fix killed);
// P2 plants the api_key in the upstream URL and asserts no error path can
// echo it. Both are written to catch the specific historical failure, not to
// pass by construction.

import { fetchLiveSamRowsUncached, mapSamItems } from "./live-opportunities";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const NOW = new Date("2026-07-29T12:00:00Z");
// ⛔ RELATIVE, NEVER A LITERAL. This was pinned to "2026-08-20T17:00:00-05:00" and stopped being the
// future at 22:00 UTC on 2026-08-20, which turned P1g red on main for everyone — a green CI at 13:22
// UTC and a red one eleven hours later, on the same sha, with no commit in between. mapSamItems is
// given an explicit NOW so its assertions are stable, but fetchLiveSamRowsUncached reads the real
// clock, so this fixture's deadline has to be genuinely ahead of it. A hardcoded future date is a
// time bomb with a known detonation time.
const FUTURE = new Date(Date.now() + 14 * 86_400_000).toISOString();
const PAST = "2026-05-01T17:00:00-05:00";

const item = (over: Record<string, unknown> = {}) => ({
  noticeId: "n-" + Math.random().toString(36).slice(2, 10),
  title: "CNC Machined Bracket",
  solicitationNumber: "FA8137-26-Q-1234",
  fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE AIR FORCE.FA4600  55 CONS  PKP",
  naicsCode: "336413",
  type: "Solicitation",
  typeOfSetAside: "SBA",
  typeOfSetAsideDescription: "Total Small Business Set-Aside (FAR 19.5)",
  postedDate: "2026-07-28",
  responseDeadLine: FUTURE,
  resourceLinks: ["https://sam.gov/api/prod/opps/v3/opportunities/resources/files/abc/download"],
  uiLink: "https://sam.gov/opp/x/view",
  ...over
});

// ── mapping ──
console.log("── mapSamItems ──");
{
  const rows = mapSamItems([item({ noticeId: "a1" })], NOW);
  const r = rows[0];
  check("M1 · maps one auditable row", rows.length === 1);
  check("M2 · notice_id + id from noticeId", r?.notice_id === "a1" && r?.id === "a1");
  check("M3 · sol# kept when real", r?.solicitation_number === "FA8137-26-Q-1234");
  check("M4 · agency = top-2 dotted path with middle dot", r?.agency === "DEPT OF DEFENSE · DEPT OF THE AIR FORCE", String(r?.agency));
  check("M5 · set_aside prefers description", (r?.set_aside || "").includes("Total Small Business"));
  check("M6 · document_type classified (Solicitation → RFQ)", r?.document_type === "RFQ", String(r?.document_type));
  check("M7 · notice_type carries raw SAM type", r?.notice_type === "Solicitation");
  check("M8 · source/status mark the live path", r?.source === "sam_live" && r?.status === "live");
  check("M9 · no fabricated enrichment: title_plain + risk_level null", r?.title_plain === null && r?.risk_level === null);
  check("M10 · unpersisted flags false", r?.watched === false && r?.in_pipeline === false && r?.is_audited === false);
  check("M11 · pdf_url = first resourceLink", (r?.pdf_url || "").endsWith("/download"));
}
{
  const rows = mapSamItems([item({ solicitationNumber: "3990--COMPACT TRACK LOADER, FULLY ENCLOSED CAB" })], NOW);
  check("M12 · PSC-leak sol# sanitized to null (row kept, UI hides)", rows.length === 1 && rows[0].solicitation_number === null);
}

// ── filters ──
console.log("── filters ──");
{
  const rows = mapSamItems([
    item({ noticeId: "keep" }),
    item({ noticeId: "nopdf", resourceLinks: [] }),
    item({ noticeId: "nullpdf", resourceLinks: null }),
    item({ noticeId: "expired", responseDeadLine: PAST }),
    item({ noticeId: "nodeadline", responseDeadLine: null }),
    item({ noticeId: "keep" }) // dupe of first
  ], NOW);
  const ids = rows.map((r) => r.notice_id).sort();
  check("F1 · no-PDF rows dropped (NSN/metadata-only)", !ids.includes("nopdf") && !ids.includes("nullpdf"));
  check("F2 · expired-deadline rows dropped (old feed's demo-killer)", !ids.includes("expired"));
  check("F3 · null-deadline rows kept (sources sought)", ids.includes("nodeadline"));
  check("F4 · dedupe by noticeId", ids.filter((i) => i === "keep").length === 1);
}
{
  const many = Array.from({ length: 260 }, (_, i) =>
    item({ noticeId: `n${i}`, postedDate: `2026-07-${String((i % 28) + 1).padStart(2, "0")}` }));
  const rows = mapSamItems(many, NOW);
  // The 200-cap is GONE. It ran after a newest-posted-first sort, so what it deleted was
  // the oldest posted — which skews hard to soonest closing. On a real 147-row feed the
  // eight rows nearest the cut had 0,1,1,1,2,2,7,8 days left to respond. mapSamItems now
  // returns everything it was given; the only ceiling is a runaway guard one layer up.
  check("F5 · the feed is NOT capped", rows.length === 260, String(rows.length));
  check("F6 · display order is newest-posted first", Date.parse(rows[0].created_at) >= Date.parse(rows[259].created_at));
}

// ── request contract + failure direction ──
console.log("── fetchLiveSamRowsUncached ──");
const PLANTED_KEY = "PLANTED-SECRET-KEY-9c4e";
process.env.SAM_API_KEY = PLANTED_KEY;
const realFetch = globalThis.fetch;
const seenUrls: string[] = [];
const ok = (items: unknown[]) => ({
  ok: true, status: 200,
  json: async () => ({ opportunitiesData: items, totalRecords: items.length })
});

(async () => {
  // P1 — param contract. A regression back to naicsCode (silently ignored by
  // SAM v2) must fail these assertions.
  (globalThis as any).fetch = async (url: string) => { seenUrls.push(String(url)); return ok([item()]); };
  const feed = await fetchLiveSamRowsUncached("336413, 332710");
  const rows = feed.rows;
  const u = seenUrls[0] ? new URL(seenUrls[0]) : null;
  check("P1a · one call per NAICS code", seenUrls.length === 2, String(seenUrls.length));
  check("P1b · uses ncode param", u?.searchParams.get("ncode") === "336413", String(u));
  check("P1c · never uses naicsCode param", u?.searchParams.get("naicsCode") === null);
  check("P1d · no set-aside filter (feed carries all, UI slices)", u?.searchParams.get("typeOfSetAside") === null);
  check("P1e · MM/dd/yyyy posted window, both bounds", /^\d{2}\/\d{2}\/\d{4}$/.test(u?.searchParams.get("postedFrom") || "") && /^\d{2}\/\d{2}\/\d{4}$/.test(u?.searchParams.get("postedTo") || ""));
  check("P1f · sam.gov/api/prod host (api.sam.gov 404s)", (u?.origin || "") + (u?.pathname || "") === "https://sam.gov/api/prod/opportunities/v2/search");
  check("P1g · rows come back mapped", rows.length >= 1 && rows[0].source === "sam_live");
  // The feed now reports its own completeness so a surface stating a total can hedge it.
  check("P1h · the feed reports whether it is complete", feed.complete === true, String(feed.complete));

  // P2 — fail-closed, key never echoed. Partial failure must fail the WHOLE
  // fetch (a partial result presented as the full feed is a lie), and no
  // error message may contain the planted api_key.
  let calls = 0;
  (globalThis as any).fetch = async () => { calls++; return calls === 1 ? ok([item()]) : { ok: false, status: 429, text: async () => `denied for key ${PLANTED_KEY}` }; };
  let threw: Error | null = null;
  try { await fetchLiveSamRowsUncached("336413,332710"); } catch (e) { threw = e as Error; }
  check("P2a · partial upstream failure → whole fetch throws", threw !== null);
  check("P2b · error carries status, never the api_key", !!threw && threw.message.includes("429") && !threw.message.includes(PLANTED_KEY), threw?.message);

  (globalThis as any).fetch = async () => ({ ok: false, status: 500 });
  let threwAll: Error | null = null;
  try { await fetchLiveSamRowsUncached("336413"); } catch (e) { threwAll = e as Error; }
  check("P2c · total failure → throws (no fabricated/demo rows)", threwAll !== null);

  delete (process.env as Record<string, string | undefined>).SAM_API_KEY;
  let threwNoKey: Error | null = null;
  try { await fetchLiveSamRowsUncached("336413"); } catch (e) { threwNoKey = e as Error; }
  check("P2d · missing SAM_API_KEY → throws, no silent demo", threwNoKey !== null);

  (globalThis as any).fetch = realFetch;
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error("harness failure", e); process.exit(1); });
