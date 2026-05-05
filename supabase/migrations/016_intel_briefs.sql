-- 016_intel_briefs.sql
-- Restores the intel_briefs table that apex-intel-pipeline writes to.
-- Without this table the daily cron at 12:15 UTC silent-fails: every
-- writeBriefs() call returns "Could not find the table 'public.intel_briefs'
-- in the schema cache" but the job exits 0, so Railway marks it SUCCESS.
-- Schema lifted verbatim from ~/apex-intel-pipeline-ARCHIVED-20260430/schema/intel_briefs.sql.

CREATE TABLE IF NOT EXISTS intel_briefs (
  id BIGSERIAL PRIMARY KEY,

  -- Routing
  company TEXT NOT NULL,                       -- faraudit | lexanchor | capitalos
  brief_type TEXT NOT NULL,                    -- action | solicitation | news | competitor | risk | signal | case
  priority TEXT NOT NULL DEFAULT 'p2',         -- p0 | p1 | p2

  -- Content (free-form; the digest compiler renders these as Notion blocks)
  title TEXT NOT NULL,
  body TEXT,
  source TEXT,                                 -- e.g. 'sam.gov' | 'federal-register' | 'manual'
  source_url TEXT,

  -- FARaudit-specific
  naics_code TEXT,
  notice_id TEXT,
  agency TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active',       -- active | expired | archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                      -- NULL = never expires; cron expires it on schedule
  archived_at TIMESTAMPTZ,

  -- Idempotency: agents may re-run; this prevents duplicate rows.
  -- (company, brief_type, source, dedup_key) must be unique.
  dedup_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_briefs_company_status ON intel_briefs(company, status);
CREATE INDEX IF NOT EXISTS idx_briefs_priority_created ON intel_briefs(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_expires ON intel_briefs(expires_at) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_briefs_dedup
  ON intel_briefs(company, brief_type, source, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- RLS — service-role bypasses; no policies needed for cron worker writes.
ALTER TABLE intel_briefs ENABLE ROW LEVEL SECURITY;
