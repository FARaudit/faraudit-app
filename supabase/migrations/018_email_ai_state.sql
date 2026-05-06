-- 018_email_ai_state.sql
-- Email-AI v2 — persistent state, audit log, unsubscribe queue, outreach log.
-- Service-role only (Email-AI cron runs via service_role) — no authenticated
-- user policies. Apply via Supabase SQL editor before pushing v2 code to
-- Railway.

-- ── Singleton state row ──────────────────────────────────────────────
-- One row enforced by CHECK + ON CONFLICT DO NOTHING in the seed.
CREATE TABLE IF NOT EXISTS email_ai_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_run_at TIMESTAMPTZ,                                 -- watermark for Gmail `after:` query
  last_brief_date DATE,                                    -- date of most recent daily brief draft
  processed_today TEXT[] NOT NULL DEFAULT '{}',            -- thread IDs handled today (cleared at 00:00 CT)
  processed_today_date DATE,                               -- the CT date "today" refers to
  CHECK (id = 1)
);

INSERT INTO email_ai_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Audit log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_processing_log (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  rule_name TEXT,
  tier TEXT CHECK (tier IN ('action', 'monitor', 'archive', 'skip')),
  category TEXT,                                           -- canonical label key (legal | finance | infra | …)
  labels_added TEXT[] NOT NULL DEFAULT '{}',
  labels_removed TEXT[] NOT NULL DEFAULT '{}',
  from_address TEXT,
  subject TEXT,
  was_dry_run BOOLEAN NOT NULL DEFAULT false,
  -- Cost tracking columns — written 0 today (rule-based, no LLM), but the
  -- structure is ready for v3 LLM augmentation + the daily brief Cost section.
  tokens_input INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  model_name TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_processed_at ON email_processing_log(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_tier ON email_processing_log(tier);
CREATE INDEX IF NOT EXISTS idx_email_log_thread_id ON email_processing_log(thread_id);

-- ── Unsubscribe candidates queue ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS unsubscribe_candidates (
  id BIGSERIAL PRIMARY KEY,
  sender TEXT NOT NULL UNIQUE,                             -- normalized lowercase
  unsubscribe_url TEXT,
  unsubscribe_mailto TEXT,
  thread_count INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'unsubscribed', 'keep'))
);

-- ── Outreach log (Jose's outbound for prospect-reply detection) ─────
-- Manually populated for v2; future: auto-populate from Gmail Sent scan.
CREATE TABLE IF NOT EXISTS outreach_log (
  id BIGSERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel TEXT,                                            -- 'gmail' | 'linkedin' | 'manual'
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_outreach_recipient ON outreach_log(LOWER(recipient));
CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON outreach_log(sent_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────
-- service_role bypasses by default; explicit ALL policies for forward-compat
-- if FORCE ROW LEVEL SECURITY is ever flipped at the DB level.
ALTER TABLE email_ai_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribe_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_ai_state_service           ON email_ai_state;
DROP POLICY IF EXISTS email_processing_log_service     ON email_processing_log;
DROP POLICY IF EXISTS unsubscribe_candidates_service   ON unsubscribe_candidates;
DROP POLICY IF EXISTS outreach_log_service             ON outreach_log;

CREATE POLICY email_ai_state_service ON email_ai_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY email_processing_log_service ON email_processing_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY unsubscribe_candidates_service ON unsubscribe_candidates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY outreach_log_service ON outreach_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
