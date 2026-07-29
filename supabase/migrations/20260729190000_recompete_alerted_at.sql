-- Recompete-AI dedup ledger (2026-07-29).
-- The agent no longer enqueues pending_audits rows (nothing consumed
-- source='recompete' since the V1 Audit-AI purge) — it is alert-only and
-- records "already alerted" directly on the origin audit row.
-- Apply BEFORE deploying the alert-only recompete-ai build: the agent's
-- dedup stamp UPDATE fails loudly (and Telegram-alerts) if this column is
-- missing.

alter table public.audits
  add column if not exists recompete_alerted_at timestamptz;

comment on column public.audits.recompete_alerted_at is
  'Set by agents/recompete-ai when the one-time recompete-window Telegram alert for this won audit has been sent. NULL = not yet alerted.';
