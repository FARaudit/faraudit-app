-- FARaudit v2 intelligence + preference schema additions.
-- Idempotent. Apply against apex-production.

CREATE TABLE IF NOT EXISTS fa_weekly_briefs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of              DATE NOT NULL,
  content              TEXT NOT NULL,
  naics_codes          TEXT[],
  opportunities_count  INT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fa_weekly_briefs_week_idx ON fa_weekly_briefs (week_of DESC);

CREATE TABLE IF NOT EXISTS fa_intelligence_corpus (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id          BIGINT,
  solicitation_id   TEXT,
  trap_type         TEXT,
  was_caught        BOOLEAN,
  outcome           TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fa_corpus_trap_idx ON fa_intelligence_corpus (trap_type);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name       TEXT,
  timezone           TEXT DEFAULT 'America/Chicago',
  sidebar_pinned     BOOLEAN NOT NULL DEFAULT true,
  alerts_enabled     BOOLEAN NOT NULL DEFAULT true,
  weekly_brief_email TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_own_prefs ON user_preferences;
CREATE POLICY users_own_prefs ON user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- fa_weekly_briefs and fa_intelligence_corpus are global (no user_id) so the
-- service role writes them and any authed user reads them.
ALTER TABLE fa_weekly_briefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_read_briefs ON fa_weekly_briefs;
CREATE POLICY authed_read_briefs ON fa_weekly_briefs
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE fa_intelligence_corpus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_read_corpus ON fa_intelligence_corpus;
CREATE POLICY authed_read_corpus ON fa_intelligence_corpus
  FOR SELECT USING (auth.role() = 'authenticated');
