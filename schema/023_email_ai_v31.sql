-- Migration 023 — Email-AI v3.1 (May 10 2026)
-- Adds outbound_tracking for WAITING auto-detect.
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Does NOT drop v2 tables (deferred to migration 024).
--
-- Pre-check before applying:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name = 'outbound_tracking';
-- Expected pre-023: empty result. Expected post-023: 1 row.

CREATE TABLE IF NOT EXISTS public.outbound_tracking (
  id                       BIGSERIAL PRIMARY KEY,
  message_id               TEXT UNIQUE NOT NULL,
  thread_id                TEXT NOT NULL,
  recipient_email          TEXT NOT NULL,
  recipient_domain         TEXT NOT NULL,
  subject                  TEXT,
  sent_at                  TIMESTAMPTZ NOT NULL,
  awaiting_reply_since     TIMESTAMPTZ NOT NULL,
  replied                  BOOLEAN NOT NULL DEFAULT false,
  replied_at               TIMESTAMPTZ,
  waiting_label_applied    BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_thread
  ON public.outbound_tracking (thread_id);

CREATE INDEX IF NOT EXISTS idx_outbound_pending
  ON public.outbound_tracking (replied, awaiting_reply_since)
  WHERE replied = false;

CREATE INDEX IF NOT EXISTS idx_outbound_sent_at
  ON public.outbound_tracking (sent_at DESC);

ALTER TABLE public.outbound_tracking ENABLE ROW LEVEL SECURITY;
-- (no policies → service role only, same pattern as 021)

COMMENT ON TABLE public.outbound_tracking IS
  'v3.1 — tracks emails sent FROM self-domains for WAITING label auto-application.
   Tick fills on send. Tick checks for reply. Tick applies WAITING after 4hr.
   Tick removes WAITING on reply or 14d expiry. Watermark via MAX(sent_at).';
