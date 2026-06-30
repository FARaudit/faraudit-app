// $0 UNIT PROOF for Step 9 schema-B ledger — decrementAuditQuota() row mapping + fail-safe.
// Run: npx tsx src/lib/audit-billing-ledger.test.ts
//
// Asserts (no real DB, no engine, no env mutation — a captured mock SupabaseClient):
//   • committal verdict        → usage_events row.billable = true
//   • honest-fail + flag ON     → row.billable = false  (no charge)
//   • honest-fail + flag OFF    → row.billable = true   (byte-identical to today)
//   • row carries audit_id/user_id/verdict/honest_fail + idempotent upsert opts (onConflict audit_id, ignoreDuplicates)
//   • TABLE ABSENT / lookup error / missing user_id → FAILS SAFE (no throw) so an audit can never be blocked by billing
import { decrementAuditQuota, billable } from "./audit-billing";
import type { SupabaseClient } from "@supabase/supabase-js";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

type Captured = { payload: Record<string, unknown>; opts: Record<string, unknown> } | null;
function makeMock(o: { userId?: string | null; upsertError?: string; lookupError?: string; lookupThrows?: boolean }) {
  let captured: Captured = null;
  const client = {
    from(table: string) {
      if (table === "audits") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => {
            if (o.lookupThrows) throw new Error("connection refused");
            if (o.lookupError) return { data: null, error: { message: o.lookupError } };
            return { data: { user_id: o.userId === undefined ? "user-1" : o.userId }, error: null };
          },
        };
        return chain;
      }
      if (table === "usage_events") {
        return {
          upsert: async (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
            captured = { payload, opts };
            return o.upsertError ? { error: { message: o.upsertError } } : { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseClient, getCaptured: () => captured };
}

async function main() {
  const FLAG_ON = true, FLAG_OFF = false;

  // 1 · committal → row.billable=true
  {
    const m = makeMock({});
    const b = billable(false, FLAG_ON); // honestFail=false
    await decrementAuditQuota(m.client, "audit-c", { billable: b, honestFail: false, verdict: "BID" });
    const c = m.getCaptured();
    assert(!!c && c.payload.billable === true, "committal (BID) → row.billable=true");
    assert(!!c && c.payload.audit_id === "audit-c" && c.payload.user_id === "user-1" && c.payload.verdict === "BID" && c.payload.honest_fail === false, "row carries audit_id/user_id/verdict/honest_fail");
    assert(!!c && c.opts.onConflict === "audit_id" && c.opts.ignoreDuplicates === true, "idempotent upsert opts (onConflict audit_id · ignoreDuplicates)");
  }

  // 2 · honest-fail + flag ON → row.billable=false
  {
    const m = makeMock({});
    const b = billable(true, FLAG_ON); // honestFail=true, flag ON
    await decrementAuditQuota(m.client, "audit-hf", { billable: b, honestFail: true, verdict: "NEEDS_HUMAN_REVIEW" });
    const c = m.getCaptured();
    assert(!!c && c.payload.billable === false && c.payload.honest_fail === true, "honest-fail + flag ON → row.billable=false");
  }

  // 3 · honest-fail + flag OFF → row.billable=true (byte-identical)
  {
    const m = makeMock({});
    const b = billable(true, FLAG_OFF); // honestFail=true, flag OFF
    await decrementAuditQuota(m.client, "audit-hf-off", { billable: b, honestFail: true, verdict: "INCOMPLETE" });
    const c = m.getCaptured();
    assert(!!c && c.payload.billable === true, "honest-fail + flag OFF → row.billable=true (byte-identical)");
  }

  // 4 · TABLE ABSENT (upsert error) → fail-safe, no throw
  {
    const m = makeMock({ upsertError: 'relation "usage_events" does not exist' });
    let threw = false;
    try { await decrementAuditQuota(m.client, "audit-noTable", { billable: true, honestFail: false, verdict: "BID" }); } catch { threw = true; }
    assert(threw === false, "table absent (upsert error) → fail-safe, no throw (audit completes)");
  }

  // 5 · lookup error → fail-safe, no throw, no insert attempted
  {
    const m = makeMock({ lookupError: "db unavailable" });
    let threw = false;
    try { await decrementAuditQuota(m.client, "audit-lookupErr", { billable: true, honestFail: false, verdict: "BID" }); } catch { threw = true; }
    assert(threw === false && m.getCaptured() === null, "lookup error → fail-safe, no throw, no insert");
  }

  // 6 · lookup throws → fail-safe, no throw
  {
    const m = makeMock({ lookupThrows: true });
    let threw = false;
    try { await decrementAuditQuota(m.client, "audit-throw", { billable: true, honestFail: false, verdict: "BID" }); } catch { threw = true; }
    assert(threw === false, "lookup throws → caught, no throw (audit unaffected)");
  }

  // 7 · missing user_id → fail-safe, no insert
  {
    const m = makeMock({ userId: null });
    let threw = false;
    try { await decrementAuditQuota(m.client, "audit-noUser", { billable: true, honestFail: false, verdict: "BID" }); } catch { threw = true; }
    assert(threw === false && m.getCaptured() === null, "no user_id → fail-safe, no throw, no insert");
  }

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — Step 9 usage_events ledger.`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
