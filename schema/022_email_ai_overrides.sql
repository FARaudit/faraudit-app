-- Migration 022 — Email-AI v3 observability for unreplyable + stale overrides
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- Pre-check (paste first to confirm baseline):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'email_ai_runs' AND column_name LIKE 'threads_%';
-- Expected baseline (pre-022): threads_processed, threads_classified,
--   threads_skipped_self_loop, threads_blacklisted.
-- Expected post-022 + above: threads_overridden_unreplyable, threads_skipped_stale.

-- Per-tick counters
ALTER TABLE public.email_ai_runs
  ADD COLUMN IF NOT EXISTS threads_overridden_unreplyable int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS threads_skipped_stale          int NOT NULL DEFAULT 0;

-- Per-classification override audit (which threads were overridden, why)
ALTER TABLE public.email_thread_classifications
  ADD COLUMN IF NOT EXISTS overridden       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason  text;

-- Optional: index for querying overridden classifications
CREATE INDEX IF NOT EXISTS idx_email_thread_class_overridden
  ON public.email_thread_classifications (overridden, classified_at DESC)
  WHERE overridden = true;
