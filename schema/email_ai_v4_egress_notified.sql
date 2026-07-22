-- Brain #660 — email-ai-v3 egress restoration: dedup + fetch-widening idempotency.
-- Apply to apex-production (project cigpsgdxgzvfjyyyrned). Idempotent — safe to re-run.
--
-- notified_at: a qualifying action (digest_p0_block) notifies the CEO once across BOTH egress tiers
--   (Gmail draft-flag + Telegram). Stamped when the notification is sent; a re-tick never re-notifies
--   the same action row.
-- latest_message_id: idempotency guard for the widened fetch (in:inbox newer_than:2d). A thread whose
--   latest message id is already recorded here is skipped — classify each message state exactly once;
--   a NEW message (new id) re-qualifies the thread so it can notify again.

alter table public.email_ai_actions
  add column if not exists notified_at timestamptz;

alter table public.email_thread_classifications
  add column if not exists latest_message_id text;

create index if not exists idx_etc_latest_message_id
  on public.email_thread_classifications (latest_message_id);
