-- 010 · defense_news_insights — per-article Claude-generated insight cache.
-- Keyed by article URL (the canonical link from RSS). News articles don't
-- change after publication, so insights are cached permanently — no TTL.
--
-- /api/defense-news: on every request, fetches the RSS feeds (still 30-min
-- CDN cached at the fetch layer), then for items missing an insight in this
-- table, calls claude-opus-4-7 to generate one and upserts it back.
--
-- RLS: authenticated read + write (shared reference data, not user-specific).
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

CREATE TABLE IF NOT EXISTS public.defense_news_insights (
  url_key                  TEXT PRIMARY KEY,
  title                    TEXT,
  ai_insight               TEXT NOT NULL,
  ai_insight_generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defense_news_insights_generated_at
  ON public.defense_news_insights (ai_insight_generated_at DESC);

ALTER TABLE public.defense_news_insights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'defense_news_insights'
      AND policyname = 'defense_news_insights_authenticated_read'
  ) THEN
    CREATE POLICY defense_news_insights_authenticated_read ON public.defense_news_insights
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'defense_news_insights'
      AND policyname = 'defense_news_insights_authenticated_write'
  ) THEN
    CREATE POLICY defense_news_insights_authenticated_write ON public.defense_news_insights
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.defense_news_insights TO authenticated;
GRANT ALL ON public.defense_news_insights TO service_role;

NOTIFY pgrst, 'reload schema';
