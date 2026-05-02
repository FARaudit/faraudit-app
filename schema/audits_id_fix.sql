-- audits.id is UUID; downstream FK columns must match.
-- The original fa_intelligence_v2.sql declared fa_intelligence_corpus.audit_id
-- as BIGINT, and the initial pending_audits.sql followed suit — both wrong.
-- Both columns are empty (BIGINT placeholders never populated), so drop+re-add
-- is the cleanest path. Idempotent.

ALTER TABLE fa_intelligence_corpus DROP COLUMN IF EXISTS audit_id;
ALTER TABLE fa_intelligence_corpus ADD COLUMN audit_id UUID;
CREATE INDEX IF NOT EXISTS fa_corpus_audit_idx ON fa_intelligence_corpus (audit_id);

ALTER TABLE pending_audits DROP COLUMN IF EXISTS audit_id;
ALTER TABLE pending_audits ADD COLUMN audit_id UUID;
CREATE INDEX IF NOT EXISTS pending_audits_audit_idx ON pending_audits (audit_id);
