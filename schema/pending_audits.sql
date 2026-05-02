-- Audit AI worker queue.
-- The Audit AI Railway worker pulls 'pending' rows, downloads the PDF,
-- runs the 3-call audit, and (in LIVE mode) writes to audits +
-- fa_intelligence_corpus. In DRY_RUN mode it logs only — no writes.
-- Queue can be seeded manually (CEO) or populated by a SAM.gov ingestion
-- pipeline (future). Idempotent.

CREATE TABLE IF NOT EXISTS pending_audits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id       TEXT NOT NULL UNIQUE,
  title           TEXT,
  agency          TEXT,
  naics_code      TEXT,
  set_aside       TEXT,
  pdf_url         TEXT,            -- SAM.gov resourceLink, or null if pdf_path set
  pdf_path        TEXT,            -- local file path — for fixture-based dry runs
  source          TEXT NOT NULL DEFAULT 'seed',     -- seed | sam_live | manual
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | processed | failed
  audit_id        BIGINT,                            -- soft link to audits.id once written
  recommendation  TEXT,                              -- mirror of the audit result for quick scan
  compliance_score INTEGER,
  bid_no_bid      TEXT,
  notes           TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pending_audits_status_idx  ON pending_audits (status);
CREATE INDEX IF NOT EXISTS pending_audits_source_idx  ON pending_audits (source);
CREATE INDEX IF NOT EXISTS pending_audits_created_idx ON pending_audits (created_at DESC);

ALTER TABLE pending_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role pending_audits all" ON pending_audits;
CREATE POLICY "Service role pending_audits all"
  ON pending_audits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE pending_audits IS 'Audit AI queue. Worker pulls pending rows, runs audit-engine, writes outcome to audits + fa_intelligence_corpus.';
