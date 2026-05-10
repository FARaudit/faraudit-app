-- Migration 021 — Email-AI v3 (drafts-only, self-loop filter, hard blacklist, full token instrumentation)
-- Idempotent: uses IF NOT EXISTS. Safe to re-run.
-- Does NOT drop legacy v2 tables (email_ai_state, email_processing_log) — those are abandoned in place.
--
-- Pre-check before applying — paste this query first to verify no overwrite:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'email_%';
-- Expected: 018_email_ai_state may show email_ai_state. STOP if email_blacklist,
-- email_ai_runs, or email_thread_classifications already exist with conflicting schemas.

-- ────────────────────────────────────────────────────────────
-- email_blacklist — hard sender filter, evaluated before classify
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_blacklist (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email  text NOT NULL UNIQUE,
  reason        text,
  added_at      timestamptz NOT NULL DEFAULT now(),
  active        boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_email_blacklist_active
  ON public.email_blacklist (sender_email)
  WHERE active = true;

-- ────────────────────────────────────────────────────────────
-- email_ai_runs — one row per cron tick, full metrics + error log
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_ai_runs (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tick_started_at               timestamptz NOT NULL DEFAULT now(),
  tick_ended_at                 timestamptz,
  threads_processed             int NOT NULL DEFAULT 0,
  threads_classified            int NOT NULL DEFAULT 0,
  threads_skipped_self_loop     int NOT NULL DEFAULT 0,
  threads_blacklisted           int NOT NULL DEFAULT 0,
  drafts_created                int NOT NULL DEFAULT 0,
  errors_caught                 int NOT NULL DEFAULT 0,
  model_used                    text,
  input_tokens                  int NOT NULL DEFAULT 0,
  output_tokens                 int NOT NULL DEFAULT 0,
  cost_usd                      numeric(10,6) NOT NULL DEFAULT 0,
  error_log                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                        text CHECK (status IN ('running','success','partial','failed'))
);

CREATE INDEX IF NOT EXISTS idx_email_ai_runs_started
  ON public.email_ai_runs (tick_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_ai_runs_status
  ON public.email_ai_runs (status, tick_started_at DESC);

-- ────────────────────────────────────────────────────────────
-- email_thread_classifications — one row per (thread, classify event)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_thread_classifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       text NOT NULL,
  sender_email    text,
  subject         text,
  bucket          text NOT NULL CHECK (bucket IN ('NOW','THIS WEEK','WAITING','READ','ARCHIVE','DELETE','SKIPPED')),
  confidence      numeric(3,2),
  reasoning       text,
  draft_created   boolean NOT NULL DEFAULT false,
  draft_id        text,
  tick_id         uuid REFERENCES public.email_ai_runs(id) ON DELETE SET NULL,
  classified_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_thread_classifications_thread_classified_unique UNIQUE (thread_id, classified_at)
);

CREATE INDEX IF NOT EXISTS idx_email_thread_class_thread
  ON public.email_thread_classifications (thread_id, classified_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_thread_class_tick
  ON public.email_thread_classifications (tick_id);

CREATE INDEX IF NOT EXISTS idx_email_thread_class_bucket
  ON public.email_thread_classifications (bucket, classified_at DESC);

-- ────────────────────────────────────────────────────────────
-- RLS — service role bypasses, no user-facing access
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.email_blacklist                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_ai_runs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_classifications   ENABLE ROW LEVEL SECURITY;

-- (no policies → only service_role can read/write, which is what email-ai-v3 uses)

-- ────────────────────────────────────────────────────────────
-- Seed email_blacklist with the 14 senders from spec
-- ON CONFLICT DO NOTHING so re-runs are safe
-- ────────────────────────────────────────────────────────────

INSERT INTO public.email_blacklist (sender_email, reason) VALUES
  ('noreply@redditmail.com',           'reddit notifications'),
  ('noreply@reply.telegram.com',       'telegram notification noise'),
  ('cole@formspree.io',                'formspree marketing'),
  ('marketing@every.io',               'every.io marketing'),
  ('jobs-noreply@linkedin.com',        'linkedin job notifications'),
  ('notifications-noreply@linkedin.com','linkedin notifications'),
  ('updates-noreply@linkedin.com',     'linkedin updates'),
  ('workspace-noreply@google.com',     'google workspace noise'),
  ('stablecoins@stripe.com',           'stripe stablecoin marketing'),
  ('no-reply@tradier.promo',           'tradier promotions'),
  ('info@opensecrets.org',             'opensecrets newsletter'),
  ('memberships@free.law',             'free.law memberships'),
  ('team@m.ngrok.com',                 'ngrok product updates'),
  ('unusualwhales@substack.com',       'unusualwhales substack')
ON CONFLICT (sender_email) DO NOTHING;
