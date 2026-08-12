// $0 REGRESSION for what this worker ASKS USAspending FOR.
//
// Two defects motivated this file, and both were invisible to every existing
// check because both produced a well-formed, plausible, empty answer:
//
//   1. `/search/spending_by_category/contract_pricing_type_codes/` does not
//      exist. It returned 404 HTML on every call since the day it shipped;
//      post() logged and returned null; the caller mapped null to []. Measured
//      2026-08-12: contract_type_breakdown was [] in 33 of 33 production rows.
//   2. `spending_by_award` does not reject an unrecognised field name — it
//      returns the row with that key null. So "Set Aside Type" produced "" on
//      every award, and read as "the government did not record a set-aside".
//      Proved by asking the live endpoint for an INVENTED field, "Pricing
//      Type", which came back null identically.
//
// THE ASSERTIONS MUST NOT BE GREPS. This module's own comments contain the
// strings "Set Aside Type" and "Pricing Type" precisely because they document
// the trap, so a source-text search matches the explanation and passes. Every
// check below therefore intercepts fetch and inspects the REQUEST THAT WOULD
// GO OUT — URL and parsed JSON body — which is the thing that was actually
// wrong. Nothing here reads the file as text.
//
// Run: npx tsx agents/defense-spending/usaspending.test.ts
import {
  fetchAwardSample,
  fetchContractTypeBreakdown,
  fetchSetAsideMix,
  fetchPricingMix,
  fetchUpcomingRecompetes
} from "./usaspending";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};

const F = { naics: "332710", fyStart: "2025-10-01", fyEnd: "2026-09-30" };

// The documented `fields` values for CONTRACT award types (A/B/C/D), from the
// USAspending API contract for spending_by_award. Anything outside this set is
// silently nulled by the API rather than rejected, which is the whole trap.
const DOCUMENTED_CONTRACT_FIELDS = new Set([
  "Award ID", "Recipient Name", "Recipient DUNS Number", "recipient_id",
  "Awarding Agency", "Awarding Agency Code", "Awarding Sub Agency",
  "Awarding Sub Agency Code", "Funding Agency", "Funding Agency Code",
  "Funding Sub Agency", "Funding Sub Agency Code",
  "Place of Performance City Code", "Place of Performance State Code",
  "Place of Performance Country Code", "Place of Performance Zip5",
  "Description", "Last Modified Date", "Base Obligation Date",
  "prime_award_recipient_id", "generated_internal_id", "def_codes",
  "COVID-19 Obligations", "COVID-19 Outlays", "Infrastructure Obligations",
  "Infrastructure Outlays", "Recipient UEI", "Recipient Location",
  "Primary Place of Performance",
  "Start Date", "End Date", "Award Amount", "Total Outlays",
  "Contract Award Type", "NAICS", "PSC"
]);

interface Captured { path: string; body: Record<string, unknown> }

/** Swap in a fetch that records every outbound request and replays canned
 *  responses, so the assertions run on request construction with no network. */
function intercept(responder: (c: Captured) => unknown): { calls: Captured[]; restore: () => void } {
  const calls: Captured[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const c: Captured = {
      path: href.replace("https://api.usaspending.gov/api/v2", ""),
      body: JSON.parse(String(init?.body ?? "{}"))
    };
    calls.push(c);
    return {
      ok: true,
      status: 200,
      json: async () => responder(c),
      text: async () => ""
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

/** Amount a category call should report, keyed by the facet codes it filtered
 *  on. Deliberately includes a NEGATIVE bucket: a net deobligation is real —
 *  measured -$228,000 on SBP for 332710 FY2026 — and must survive to the caller
 *  rather than being clamped or dropped. */
function categoryAmount(body: Record<string, unknown>): number {
  const f = (body.filters ?? {}) as Record<string, unknown>;
  const pricing = (f.contract_pricing_type_codes as string[]) ?? null;
  const setAside = (f.set_aside_type_codes as string[]) ?? null;
  if (pricing) return pricing.includes("J") ? 600 : pricing.includes("Y") ? -100 : 0;
  if (setAside) return setAside.includes("SBA") ? 250 : setAside.includes("NONE") ? 150 : 0;
  return 1000; // unfiltered NAICS total
}

async function main() {
  // ── 1 · THE AWARD REQUEST ASKS ONLY FOR FIELDS THAT EXIST ─────────────────
  {
    const { calls, restore } = intercept(() => ({ results: [], page_metadata: { hasNext: false } }));
    await fetchAwardSample(F);
    restore();

    assert(calls.length > 0, "fetchAwardSample issues a request");
    const fields = (calls[0].body.fields as string[]) ?? [];
    const undocumented = fields.filter((f) => !DOCUMENTED_CONTRACT_FIELDS.has(f));
    assert(
      undocumented.length === 0,
      `every requested field is documented — an undocumented name returns null, not an error${undocumented.length ? ` (asked for: ${undocumented.join(", ")})` : ""}`
    );
    // The two specific names that were dead. Named individually so a failure
    // says which one came back, rather than only that the count moved.
    assert(!fields.includes("Set Aside Type"), "does NOT ask for 'Set Aside Type' — not a field on this endpoint");
    assert(!fields.includes("Award Type"), "does NOT ask for 'Award Type' — only 'Contract Award Type' is documented");
    assert(fields.includes("Contract Award Type"), "does ask for 'Contract Award Type' — the one that answers");
    // The sort key must itself be a requested field or the API 400s the call.
    assert(
      typeof calls[0].body.sort === "string" && fields.includes(calls[0].body.sort as string),
      "the sort key is present in fields — the API rejects the request otherwise"
    );
  }

  // ── 2 · A RETURNED AWARD CARRIES NO PERMANENTLY-EMPTY FIELD ───────────────
  {
    const { restore } = intercept(() => ({
      results: [{
        "Award ID": "N0001920C0011", "Recipient Name": "RTX CORPORATION",
        "Award Amount": 7498605067.74, "Awarding Agency": "Department of Defense",
        "Awarding Sub Agency": "Department of the Navy",
        "Contract Award Type": "DEFINITIVE CONTRACT",
        "Start Date": "2019-11-01", "End Date": "2026-12-31"
      }],
      page_metadata: { hasNext: false }
    }));
    const sample = await fetchAwardSample(F);
    restore();

    assert(sample.awards.length === 1, "the award is mapped through");
    const keys = Object.keys(sample.awards[0]);
    assert(!keys.includes("set_aside"), "AwardRecord has no `set_aside` — it could only ever have been \"\"");
    assert(!keys.includes("pricing"), "AwardRecord has no `pricing` — it duplicated award_type under a wrong name");
    assert(sample.awards[0].award_type === "DEFINITIVE CONTRACT", "award_type carries the award category");
    assert(sample.cap === 500 && sample.sampled === 1, "the sample carries its own count and cap");
  }

  // ── 3 · PRICING IS A FILTER, NEVER A CATEGORY PATH ────────────────────────
  // The 404 class. `/spending_by_category/<name>/` is valid only for categories
  // USAspending publishes; pricing and set-aside are not among them.
  {
    const { calls, restore } = intercept((c) => ({ results: [{ amount: categoryAmount(c.body) }] }));
    await fetchContractTypeBreakdown(F);
    restore();

    const categoryPaths = calls.map((c) => c.path).filter((p) => p.includes("/spending_by_category/"));
    assert(categoryPaths.length > 0, "the pricing breakdown issues category requests");
    const bad = categoryPaths.filter((p) => /contract_pricing_type_codes|set_aside/.test(p));
    assert(bad.length === 0, `no request targets a pricing/set-aside CATEGORY path — those 404${bad.length ? ` (${bad[0]})` : ""}`);
    assert(
      categoryPaths.every((p) => p.startsWith("/search/spending_by_category/naics/")),
      "the facet asks the NAICS category and varies the FILTER"
    );
    const filtered = calls.filter((c) => (c.body.filters as Record<string, unknown>)?.contract_pricing_type_codes);
    assert(filtered.length >= 4, "one request per pricing family");
  }

  // ── 4 · A ZERO BUCKET IS DROPPED, A NEGATIVE ONE IS NOT ───────────────────
  {
    const { restore } = intercept((c) => ({ results: [{ amount: categoryAmount(c.body) }] }));
    const rows = await fetchContractTypeBreakdown(F);
    restore();

    assert(rows.every((r) => r.amount !== 0), "empty families are dropped rather than drawn as zero bars");
    const tm = rows.find((r) => r.name.startsWith("Time & materials"));
    assert(!!tm && tm.amount === -100, "a NEGATIVE family survives — a net deobligation is real, not noise");
    assert(rows[0].name === "Fixed price" && rows[0].amount === 600, "families come back largest-first");
  }

  // ── 5 · THE RESIDUAL IS CARRIED, NOT FOLDED AWAY ──────────────────────────
  // The finding this exists to protect: on 332710 FY2026 every named set-aside
  // family plus NONE summed to $22.18M against a $30.00M total. The missing 26%
  // is awards with NO set-aside value recorded, which is NOT "no set-aside
  // used" — NONE is separately $13.3M. Folding one into the other overstated
  // open-market spend by 59%.
  {
    const { restore } = intercept((c) => ({ results: [{ amount: categoryAmount(c.body) }] }));
    const mix = await fetchSetAsideMix(F);
    restore();

    assert(mix.total === 1000, "the mix carries the independently-fetched total");
    const summed = mix.buckets.reduce((a, b) => a + b.amount, 0);
    assert(summed === 400, "buckets sum to the facet dollars (250 SBA + 150 NONE)");
    assert(mix.unaccounted === 600, "the residual is reported, never absorbed into a bucket");
    const none = mix.buckets.find((b) => b.name === "No set-aside used");
    assert(!!none && none.amount === 150, "'No set-aside used' holds ONLY the explicit NONE dollars");
    assert(
      !mix.buckets.some((b) => b.amount === (mix.unaccounted ?? 0) + (none?.amount ?? 0)),
      "the unrecorded residual is never merged into 'No set-aside used'"
    );
  }

  // ── 6 · A FAILED REQUEST CANNOT PASS AS A CLEAN ZERO ──────────────────────
  // The original defect's exact signature: every call fails, and the caller
  // still gets a well-formed empty answer. `unaccounted` is what makes that
  // visible — the total is real while the buckets are not.
  {
    const real = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const filtered = !!(body.filters as Record<string, unknown>)?.contract_pricing_type_codes;
      n++;
      // The unfiltered total succeeds; every faceted call 404s, exactly as the
      // dead category endpoint did.
      if (filtered) return { ok: false, status: 404, text: async () => "<!doctype html>" } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ results: [{ amount: 1000 }] }), text: async () => "" } as unknown as Response;
    }) as typeof globalThis.fetch;
    const mix = await fetchPricingMix(F);
    globalThis.fetch = real;

    assert(n > 1, "the failure path issued its requests");
    assert(mix.buckets.every((b) => b.amount === 0), "failed facets read as zero — unavoidable, post() has no other channel");
    assert(
      mix.unaccounted === 1000,
      "and the residual equals the WHOLE total, so a dead endpoint is loud instead of an empty chart"
    );
  }

  // ── 7 · THE RECOMPETE WINDOW ASKS FOR RECOMPETES ──────────────────────────
  // The radar was a list of expiring periods of performance. Measured across
  // five codes: 85% delivery orders, purchase orders and BPA calls, none of
  // which are ever competed. A=BPA CALL, B=PURCHASE ORDER, C=DELIVERY ORDER,
  // D=DEFINITIVE CONTRACT — verified live, and the reverse of what this
  // module's header comment used to claim.
  {
    const { calls, restore } = intercept(() => ({ results: [], page_metadata: { hasNext: false } }));
    await fetchUpcomingRecompetes(F);
    restore();

    const body = calls[0].body as Record<string, unknown>;
    const filters = body.filters as Record<string, unknown>;
    const types = filters.award_type_codes as string[];
    assert(types.length === 1 && types[0] === "D", `definitive contracts only — asked for [${types.join(", ")}]`);

    // The window and the lookback are coupled: a 90-day lookback cannot reach a
    // 365-day window and returns an empty list, which reads as "nothing coming".
    const tp = (filters.time_period as Array<Record<string, string>>)[0];
    const lookbackDays = Math.round(
      (Date.parse(tp.end_date) - Date.parse(tp.start_date)) / 86400_000
    );
    assert(
      lookbackDays >= 365,
      `the action-date lookback reaches the window — ${lookbackDays}d (under 365 this returns zero rows on every code tested)`
    );
  }

  // ── 8 · A DISTANT WINDOW CANNOT INHERIT THE SHORT LOOKBACK ────────────────
  // Guards the coupling directly: the same rows, sorted by end date, must be
  // reachable. A caller that widens the window without widening the lookback
  // gets silence, not an error.
  {
    const day = 86400_000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const now = Date.now();
    const { restore } = intercept((c) => {
      const tp = ((c.body.filters as Record<string, unknown>).time_period as Array<Record<string, string>>)[0];
      const lookback = (Date.parse(tp.end_date) - Date.parse(tp.start_date)) / day;
      // Stand-in for USAspending's behaviour: a contract ending 400 days out is
      // only in the candidate set when the lookback is wide enough to include
      // its most recent action.
      const rows = lookback >= 365
        ? [{ "Award ID": "N0001926C0777", "Recipient Name": "ACME DEFENSE", "Award Amount": 4200000, "Awarding Sub Agency": "Department of the Navy", "End Date": iso(now + 400 * day) }]
        : [];
      return { results: rows, page_metadata: { hasNext: false } };
    });
    const wide = await fetchUpcomingRecompetes(F);
    restore();
    assert(wide.length === 1, "the 12-18 month window returns rows when the lookback reaches it");
    assert(wide[0].award_id === "N0001926C0777", "and the row survives the client-side window filter");
  }

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
