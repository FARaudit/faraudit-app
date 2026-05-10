-- 024_email_ai_v31_bucket_constraint.sql
-- Aligns email_thread_classifications.bucket CHECK constraint with v3.1 bucket names.
--
-- Root cause: migration 021 hardcoded the v3 bucket set
--   ('NOW','THIS WEEK','WAITING','READ','ARCHIVE','DELETE','SKIPPED')
-- but v3.1 emits THIS_WEEK (underscore) and REFERENCE (renamed from READ),
-- and DELETE is killed forever. Inserts for non-conforming buckets fail with
-- "violates check constraint email_thread_classifications_bucket_check",
-- producing partial-status ticks.
--
-- Order of operations:
--   1. Drop old constraint (allows backfill writes)
--   2. Backfill 9 legacy DELETE rows → ARCHIVE (lossless, semantically equivalent)
--   3. Add new constraint with v3.1 bucket set
--
-- Idempotent: safe to re-run.

BEGIN;

-- Step 1: drop old constraint
ALTER TABLE public.email_thread_classifications
  DROP CONSTRAINT IF EXISTS email_thread_classifications_bucket_check;

-- Step 2: backfill legacy DELETE rows to ARCHIVE (preserves all other columns)
UPDATE public.email_thread_classifications
  SET bucket = 'ARCHIVE'
  WHERE bucket = 'DELETE';

-- Step 3: also backfill any legacy 'THIS WEEK' (with space) rows to v3.1 'THIS_WEEK'
UPDATE public.email_thread_classifications
  SET bucket = 'THIS_WEEK'
  WHERE bucket = 'THIS WEEK';

-- Step 4: backfill legacy 'READ' rows to v3.1 'REFERENCE'
UPDATE public.email_thread_classifications
  SET bucket = 'REFERENCE'
  WHERE bucket = 'READ';

-- Step 5: add new constraint with v3.1 bucket set
ALTER TABLE public.email_thread_classifications
  ADD CONSTRAINT email_thread_classifications_bucket_check
  CHECK (bucket IN ('NOW','THIS_WEEK','WAITING','REFERENCE','ARCHIVE','SKIPPED'));

COMMENT ON CONSTRAINT email_thread_classifications_bucket_check
  ON public.email_thread_classifications IS
  'v3.1 bucket set — added 2026-05-10 in migration 024. Killed DELETE permanently. Replaced READ with REFERENCE. Underscore in THIS_WEEK matches TypeScript UrgencyBucket type.';

COMMIT;

-- Verification queries (run separately after commit):
-- SELECT bucket, count(*) FROM email_thread_classifications GROUP BY bucket;
-- Expected: only NOW, THIS_WEEK, WAITING, REFERENCE, ARCHIVE, SKIPPED
