-- 019 · pending_audits · solicitation_number column.
-- The SAM ingest extracts o.solicitationNumber (sam-client.ts:81) but until now
-- had nowhere to write it — the Opportunities tab rendered the internal
-- 32-char SAM noticeId UUID under a header literally labeled "Sol. Number".
-- This adds the column so ingest can persist the human-readable solicitation
-- number (e.g. "70Z08025R0006") and the UI can bind to it with a notice_id
-- fallback for legacy rows.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on
-- apex-production.

ALTER TABLE pending_audits
  ADD COLUMN IF NOT EXISTS solicitation_number TEXT;

CREATE INDEX IF NOT EXISTS idx_pending_audits_solicitation_number
  ON pending_audits(solicitation_number)
  WHERE solicitation_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
