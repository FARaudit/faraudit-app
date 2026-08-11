-- 012 · defense_news_insights — key the cache by DESK, not just by article.
--
-- 010 made url_key the primary key, which was correct while the insight was the
-- same sentence for everyone: it was written against a hardcoded persona and did
-- not depend on who was reading. /defense-news now writes the insight against the
-- reader's OWN NAICS codes, so the same article has a different insight for a
-- machine shop than for an engineering services firm — and under a url-only key
-- the first reader's insight would be served to every later one, silently, with
-- another company's industry named in it.
--
-- scope_key is the reader's code list, deduplicated and sorted (see scopeKey() in
-- src/lib/defense-news-naics.ts). '' is the no-codes scope, whose insights are the
-- generic ones and ARE safe to share.
--
-- Existing rows are generic by construction — every insight written before this
-- migration came from the fixed persona prompt — so they are backfilled to '',
-- which is exactly the scope they belong to. Nothing is discarded and nothing is
-- mislabelled as personal.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

ALTER TABLE public.defense_news_insights
  ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT '';

-- The model's own relevance judgement for this article against this desk, 0-100.
-- Nullable: a row written before this column existed has no judgement, and a
-- default of 0 would read as "the model scored it irrelevant" rather than "the
-- model was never asked".
ALTER TABLE public.defense_news_insights
  ADD COLUMN IF NOT EXISTS relevance SMALLINT;

-- The customer code the insight is written against. Always one of the reader's
-- own codes or NULL — the route drops anything else before it is stored.
ALTER TABLE public.defense_news_insights
  ADD COLUMN IF NOT EXISTS matched_code TEXT;

-- Re-key: (url_key, scope_key) is the identity. Done as a swap rather than a
-- drop-then-add so the table is never left without a uniqueness guarantee, which
-- is what the upsert's ON CONFLICT resolves against — without it every request
-- would INSERT a duplicate instead of updating.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.defense_news_insights'::regclass
      AND contype = 'p'
      AND conname = 'defense_news_insights_pkey'
      AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
  ) THEN
    ALTER TABLE public.defense_news_insights DROP CONSTRAINT defense_news_insights_pkey;
    ALTER TABLE public.defense_news_insights
      ADD CONSTRAINT defense_news_insights_pkey PRIMARY KEY (url_key, scope_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_defense_news_insights_scope
  ON public.defense_news_insights (scope_key, ai_insight_generated_at DESC);

NOTIFY pgrst, 'reload schema';
