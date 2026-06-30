// ── STEP 9 · HONEST-FAIL NO-CHARGE BILLING GUARD (AUDIT_HONESTFAIL_NO_CHARGE) ──────────────────────────
// Brain Step-9 ruling (2026-06-29). PRINCIPLE: a customer is charged ONLY for a delivered COMMITTAL verdict.
// This module is the SINGLE place that (a) classifies an audit as honest-fail and (b) decides billability.
// Born flag-gated default-OFF; the flag-OFF path is byte-identical to today (the decrement is a documented
// STUB until the usage-counter schema lands — see decrementAuditQuota). Pure + deterministic → unit-tested
// ($0) in audit-billing.test.ts. Operationalizes the zero-contract-loss doctrine on the billing side:
// erring toward caution (an honest-fail) is FREE to the customer.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Deterministic-engine verdicts that are non-committal honest-fails (audit-decide.ts verdict enum). */
export const HONEST_FAIL_VERDICTS: ReadonlySet<string> = new Set(["INCOMPLETE", "NEEDS_HUMAN_REVIEW"]);

/** COMMITTAL (billable) verdicts — a real BD call was delivered. The complement of the honest-fail set. */
export const COMMITTAL_VERDICTS: ReadonlySet<string> = new Set(["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE"]);

/** The four honest-fail signals (Brain ruling). `verdict` is the only one the LIVE engine path produces today;
 *  `outOfScope` (construction/scope detector) and `panelHonestFailure` (agentic-panel HONEST_FAILURE) live in
 *  agentic-panel-runner, which is NOT yet wired into the production executor — they default false until wired,
 *  so the predicate is complete and future-proof while the live result currently only triggers via `verdict`. */
export interface HonestFailSignals {
  verdict: string;
  outOfScope?: boolean;
  panelHonestFailure?: boolean;
}

/** TRUE iff the audit is an honest-fail (no committal verdict delivered). ORs all four signals → ONE field. */
export function isHonestFail(s: HonestFailSignals): boolean {
  return HONEST_FAIL_VERDICTS.has(s.verdict) || s.outOfScope === true || s.panelHonestFailure === true;
}

/** Step-9 flag — default-OFF, Step-7 wiring template (`=== "true"` to enable). */
export function honestFailNoChargeEnabled(): boolean {
  return process.env.AUDIT_HONESTFAIL_NO_CHARGE === "true";
}

/** A customer is charged ONLY for a committal verdict. billable=false IFF (flag ON AND honest-fail).
 *  Flag OFF ⇒ always billable ⇒ byte-identical to pre-flag behavior. Pure (flag injectable for tests). */
export function billable(honestFail: boolean, flagEnabled: boolean = honestFailNoChargeEnabled()): boolean {
  return !(flagEnabled && honestFail);
}

/** Usage-ledger seam (Brain schema B, Step 9) — record ONE `usage_events` row per COMPLETED audit, with
 *  `billable` stamped at decision time. Idempotent (ON CONFLICT(audit_id) DO NOTHING via upsert+ignoreDuplicates
 *  — a persist retry / webhook replay cannot double-insert). FAILS SAFE: any error (incl. the table being absent
 *  pre-migration, or a missing user_id) is caught + logged and the function returns — it NEVER throws, so it can
 *  never block an audit from completing. Flag OFF ⇒ billable is always true ⇒ every row billable=true (and the
 *  table doesn't exist yet ⇒ no-op ⇒ byte-identical to today). Written by executeAgenticPrimary, which uses the
 *  service-role admin client (bypasses RLS). Name retained from the seam's original (counter) design; under
 *  schema B it appends a ledger row rather than decrementing a counter.
 *  FOLLOW-UP: period_start is null until resolved from the customer's active subscription period at insert time. */
export async function decrementAuditQuota(
  supabase: SupabaseClient,
  auditId: string,
  opts: { billable: boolean; honestFail: boolean; verdict: string; periodStart?: string | null },
): Promise<void> {
  try {
    const { data: row, error: lookupErr } = await supabase.from("audits").select("user_id").eq("id", auditId).maybeSingle();
    if (lookupErr) { console.warn(`[BILLING] ${auditId}: usage_events skipped — audit lookup failed (fail-safe): ${lookupErr.message}`); return; }
    const userId = (row as { user_id?: string | null } | null)?.user_id ?? null;
    if (!userId) { console.warn(`[BILLING] ${auditId}: usage_events skipped — no user_id on audit row (fail-safe).`); return; }

    const { error } = await supabase.from("usage_events").upsert(
      {
        user_id: userId,
        audit_id: auditId,
        period_start: opts.periodStart ?? null,
        billable: opts.billable,
        verdict: opts.verdict,
        honest_fail: opts.honestFail,
      },
      { onConflict: "audit_id", ignoreDuplicates: true },
    );
    if (error) { console.warn(`[BILLING] ${auditId}: usage_events insert failed (fail-safe, audit unaffected): ${error.message}`); return; }
    console.log(`[BILLING] ${auditId}: usage_events recorded billable=${opts.billable} verdict=${opts.verdict} honest_fail=${opts.honestFail}.`);
  } catch (e) {
    console.warn(`[BILLING] ${auditId}: usage_events record threw (fail-safe, audit unaffected): ${(e as Error)?.message ?? String(e)}`);
  }
}
