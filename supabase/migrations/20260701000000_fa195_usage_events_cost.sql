-- FA-195 · usage_events cost columns (per-audit token cost for the Cost cockpit · card 194/195, 2026-07-01).
--
-- ADDITIVE + IDEMPOTENT. Adds per-audit token/cost columns to the usage_events ledger so the prod executor can
-- stamp what each COMPLETED audit actually cost (tokens by model + computed $), which the Cost/Audit + Cost/Model
-- cockpit reads (via a pull → ceo/cost-ledger.json → bake). Existing billing columns + rows are UNTOUCHED.
--
-- Handles BOTH states safely:
--   • usage_events not yet applied → the create-if-not-exists (base migration fa179) runs first, then these ALTERs no-op.
--   • usage_events already applied without cost cols → the ALTER ... ADD COLUMN IF NOT EXISTS backfills them.
-- The executor writes these via a DECOUPLED, fail-safe update (never blocks an audit; never breaks the billing insert).
--
-- Apply-to-prod: CEO pastes this into the Supabase SQL editor (Code has no prod DDL access). Safe to run repeatedly.

alter table public.usage_events add column if not exists input_tokens       bigint;
alter table public.usage_events add column if not exists output_tokens      bigint;
alter table public.usage_events add column if not exists cache_write_tokens bigint;
alter table public.usage_events add column if not exists cache_read_tokens  bigint;
alter table public.usage_events add column if not exists cost_usd           numeric(12,6);  -- token-derived $ (Console cash is separate, external)
alter table public.usage_events add column if not exists model_breakdown    jsonb;          -- [{model,priceKey,calls,input_tokens,output_tokens,cache_write,cache_read,usd}]
alter table public.usage_events add column if not exists cost_source        text;           -- 'ceo' | 'customer' (code runs never hit this path)
alter table public.usage_events add column if not exists cost_recorded_at   timestamptz;
