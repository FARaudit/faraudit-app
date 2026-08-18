// Run: npx tsx src/lib/defense-news-usage.test.ts
//
// The ledger's job is to be RIGHT about what was spent, and the two ways it can be
// wrong point in opposite directions: recording a fully-cached page view inflates
// the row count with zero-dollar traffic and drags every average down, while
// throwing on a write error blanks a page the customer is waiting for. Parts B and
// D are the negative controls for those.

import { isBillableSpend, recordNewsSpend, type NewsSpend } from "./defense-news-usage";
import type { SupabaseClient } from "@supabase/supabase-js";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// Transcribed from a real /api/defense-news response, 2026-08-11.
const SPENT: NewsSpend = {
  model: "claude-sonnet-4-6",
  calls: 3,
  stories_judged: 56,
  input_tokens: 5199,
  output_tokens: 3600,
  usd: 0.069,
};
const CACHED: NewsSpend = {
  model: "claude-sonnet-4-6",
  calls: 0,
  stories_judged: 0,
  input_tokens: 0,
  output_tokens: 0,
  usd: 0,
};

/** Minimal recorder standing in for the client. Returns whatever `err` is set to,
 *  so the failure paths are exercised rather than assumed. */
function fakeSupabase(err: { message: string } | null = null) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ __table: table, ...row });
          return Promise.resolve({ error: err });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

async function main() {
  // ── A · a request that spent is recorded ──
  console.log("\n── A · a request that called the model ──");
  {
    const { client, inserted } = fakeSupabase();
    await recordNewsSpend(client, { userId: "u-1", scopeKey: "332710|336412|336611", spend: SPENT });
    check("one row written", inserted.length === 1, String(inserted.length));
    const r = inserted[0] ?? {};
    check("into its own ledger, not usage_events",
      r.__table === "defense_news_usage",
      String(r.__table));
    check("carries the customer", r.user_id === "u-1");
    check("carries the desk it was spent on", r.scope_key === "332710|336412|336611");
    check("carries the measured tokens", r.input_tokens === 5199 && r.output_tokens === 3600);
    check("carries the dollar figure", r.cost_usd === 0.069, String(r.cost_usd));
    check("carries the story count", r.stories_judged === 56);
  }

  // ── B · negative control · a cached page view is NOT a cost row ──
  console.log("\n── B · the common case costs nothing and records nothing ──");
  {
    check("a zero-call request is not billable spend", !isBillableSpend(CACHED));
    const { client, inserted } = fakeSupabase();
    await recordNewsSpend(client, { userId: "u-1", scopeKey: "336611", spend: CACHED });
    check("and writes no row", inserted.length === 0, String(inserted.length));
    check("a call that consumed no tokens is not spend either",
      !isBillableSpend({ ...CACHED, calls: 2 }),
      "calls>0 with zero tokens is a bookkeeping artefact, not money");
    check("real spend is billable", isBillableSpend(SPENT));
  }

  // ── C · a signed-out view still counts toward the total ──
  console.log("\n── C · spend with no customer attached ──");
  {
    const { client, inserted } = fakeSupabase();
    await recordNewsSpend(client, { userId: null, scopeKey: "", spend: SPENT });
    check("the row is still written", inserted.length === 1);
    check("with a null customer rather than being dropped",
      (inserted[0] ?? {}).user_id === null,
      "the money was spent whether or not it belongs to an account");
  }

  // ── D · negative control · the ledger may never break the page ──
  console.log("\n── D · fail-safe ──");
  {
    let threw = false;
    try {
      const { client } = fakeSupabase({ message: "relation does not exist" });
      await recordNewsSpend(client, { userId: "u-1", scopeKey: "336611", spend: SPENT });
    } catch { threw = true; }
    check("a database error does not throw", !threw,
      "this runs on the read path of a page the customer is waiting for");

    let threw2 = false;
    try {
      const exploding = { from() { throw new Error("client is not configured"); } } as unknown as SupabaseClient;
      await recordNewsSpend(exploding, { userId: "u-1", scopeKey: "336611", spend: SPENT });
    } catch { threw2 = true; }
    check("a client that throws outright does not either", !threw2);
  }

  // ── E · the harness can record a failure ──
  console.log("\n── E · self-arm ──");
  {
    const before = fail;
    const realLog = console.log;
    console.log = () => {};
    check("(self-arm)", false, "deliberate");
    console.log = realLog;
    const armed = fail === before + 1;
    fail = before;
    pass++;
    if (!armed) {
      console.log("✗ FAIL  the harness cannot record a failure — every result above is meaningless");
      process.exit(1);
    }
    console.log("✓ PASS  a deliberate false assertion was counted as a failure, then retracted");
  }
}

main().then(function () {
  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.log("✗ FAIL  the suite itself threw — no result above can be trusted:", e && e.message);
  process.exit(1);
});
