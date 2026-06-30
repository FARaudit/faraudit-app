-- FA-179 · usage_events ledger (Step 9 · AUDIT_HONESTFAIL_NO_CHARGE · Brain schema B, 2026-06-29).
--
-- A LEDGER, not a counter: ONE row per COMPLETED audit, with `billable` stamped at decision time
-- (a customer is charged ONLY for a delivered COMMITTAL verdict; honest-fails are no-charge when the
-- flag is ON — operationalizing the zero-contract-loss doctrine on the billing side). Auditable and
-- Stripe-metered-ready (sum billable=true rows per period). Written by executeAgenticPrimary at the
-- completion persist (shared by the customer POST and the watcher).
--
-- Idempotency: audit_id UNIQUE — a persist retry or webhook replay cannot double-insert (the insert
-- uses ON CONFLICT(audit_id) DO NOTHING). The executor's insert FAILS SAFE: if this table is absent
-- (pre-migration) or the insert errors, the audit still completes — billing never blocks an audit.
--
-- NOT YET APPLIED. Apply-to-prod-before-push (Rule 65) handled at commit time, on CEO/Brain word.

create table if not exists public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  audit_id     uuid not null references public.audits(id) on delete cascade,
  period_start timestamptz,                 -- subscription period this audit falls in (nullable until resolved at insert time)
  billable     boolean not null,            -- billable(honestFail, AUDIT_HONESTFAIL_NO_CHARGE) at decision time
  verdict      text,                        -- the delivered verdict (observability)
  honest_fail  boolean not null,            -- mirror of compliance_json.honest_fail (the single source of truth)
  created_at   timestamptz default now(),
  constraint usage_events_audit_id_key unique (audit_id)   -- idempotency: one row per audit
);

-- per-period usage queries (Stripe metering: SUM(billable) WHERE user_id = ? AND period_start = ?)
create index if not exists idx_usage_events_user_period on public.usage_events(user_id, period_start);

alter table public.usage_events enable row level security;
create policy "Users see own usage_events" on public.usage_events
  for all using (auth.uid() = user_id);
-- NOTE: the executor writes via the service-role admin client, which bypasses RLS — inserts are unaffected.
