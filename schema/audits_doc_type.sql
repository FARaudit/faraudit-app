-- Document-type classifier columns.
-- Populated by audit-engine pre-step (SOW / PWS / SOO / RFP / RFQ / IFB / Sources Sought / Other).
-- Idempotent.

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS document_type TEXT;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS document_type_rationale TEXT;

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS document_type_confidence TEXT;

CREATE INDEX IF NOT EXISTS audits_document_type_idx
  ON audits (document_type);
