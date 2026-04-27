-- KO email tracking columns on audits.
-- Idempotent: safe to re-run.

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS ko_email_sent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS ko_email_sent_at TIMESTAMPTZ;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS ko_email_recipient TEXT;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS ko_email_message_id TEXT;

CREATE INDEX IF NOT EXISTS audits_ko_email_sent_idx
  ON audits (ko_email_sent, ko_email_sent_at DESC);
