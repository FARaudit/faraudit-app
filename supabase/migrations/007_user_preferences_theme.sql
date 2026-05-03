-- 007 · user_preferences.theme — theme preference column for light/dark/system toggle.
-- Idempotent: creates table if absent (matches the live runtime contract used by
-- /api/preferences route and auth-shell), then adds theme column with a CHECK.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sidebar_pinned   BOOLEAN DEFAULT TRUE,
  display_name     TEXT,
  timezone         TEXT,
  alerts_enabled   BOOLEAN DEFAULT TRUE,
  theme            TEXT DEFAULT 'light' CHECK (theme IN ('light','dark','system')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For tables that pre-exist without a theme column.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light'
    CHECK (theme IN ('light','dark','system'));

-- RLS — each user reads/writes only their own row. Idempotent guards.
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_preferences' AND policyname = 'user_preferences_self_select'
  ) THEN
    CREATE POLICY user_preferences_self_select ON user_preferences
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_preferences' AND policyname = 'user_preferences_self_upsert'
  ) THEN
    CREATE POLICY user_preferences_self_upsert ON user_preferences
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
