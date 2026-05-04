-- 013 · One-shot purge · drop pending_audits rows that have no PDF source.
--
-- Background: agents/sam-ingest/index.ts now filters out SAM opportunities
-- where resourceLinks is null at insert time (May 4 2026 commit). But the
-- 2026-05-03 backfill of 2,539 sam_live rows landed before that filter, so
-- ~all of them have pdf_url=null and produce immediate "no PDF" failures
-- when audit-ai picks them up (verified 2026-05-04 06:33 CT crash logs).
--
-- This script reports the count, then deletes only rows that:
--   - source = 'sam_live' (don't touch demo seeds)
--   - status = 'pending'  (don't touch in-flight or already-failed rows)
--   - pdf_url IS NULL AND pdf_path IS NULL (no audit possible)
--
-- Safe to run via Supabase Studio. The DELETE is wrapped in a transaction
-- and a SELECT is logged immediately before for the audit trail.
--
-- This is NOT idempotent in the sense of repeated runs producing the same
-- DELETE count — once executed, subsequent runs delete 0 rows because the
-- ingest filter prevents re-introduction. Safe to run anyway.

BEGIN;

-- Pre-flight count (use Studio's "View results" to capture)
SELECT
  COUNT(*) AS rows_to_delete,
  source,
  status
FROM pending_audits
WHERE source = 'sam_live'
  AND status = 'pending'
  AND pdf_url IS NULL
  AND pdf_path IS NULL
GROUP BY source, status;

-- The actual purge
DELETE FROM pending_audits
WHERE source = 'sam_live'
  AND status = 'pending'
  AND pdf_url IS NULL
  AND pdf_path IS NULL;

COMMIT;

-- Post-flight check · should show count > 0 for sam_live with valid pdf_url
SELECT COUNT(*) AS remaining_pending_with_pdf
FROM pending_audits
WHERE source = 'sam_live'
  AND status = 'pending'
  AND pdf_url IS NOT NULL;
