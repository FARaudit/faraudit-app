-- 032 · defense_news_usage — the model spend ledger for /defense-news.
--
-- Defense News is the only customer-facing tab that calls a model on a page view,
-- so it is the only one whose cost moves with traffic rather than with audits. The
-- route already measures real consumption off the Messages API `usage` field and
-- returns it in the response; until this table it was measured and then thrown
-- away, so nothing could answer "what did Defense News cost last week" without
-- someone re-running a query by hand.
--
-- DELIBERATELY NOT usage_events. That table is keyed ON CONFLICT (audit_id) and is
-- what Cost/Audit divides by to state the cost of one audit run. News rows carry no
-- audit_id, and adding them would either be rejected by that key or silently drag
-- the $/audit average toward zero. Two different unit economics, two ledgers.
--
-- ONE ROW PER REQUEST THAT ACTUALLY SPENT. A fully-cached page view calls nothing
-- and costs nothing, and it is the common case — insights are stored per article
-- per desk, so only genuinely new stories are judged. Writing a zero row per page
-- view would put the traffic log in the cost ledger and make every average wrong.
--
-- RLS: service_role writes; authenticated cannot read another customer's spend.
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

CREATE TABLE IF NOT EXISTS public.defense_news_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null for a signed-out or CEO-side view. Kept rather than dropped: the spend
  -- was real and belongs in the total even when it belongs to no customer.
  user_id         UUID,
  -- The reader's code list, deduplicated and sorted — same scopeKey() the insight
  -- cache uses, so spend can be joined to what it bought.
  scope_key       TEXT NOT NULL DEFAULT '',
  model           TEXT NOT NULL,
  calls           INTEGER NOT NULL,
  stories_judged  INTEGER NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  -- Derived from the token counts and the route's named rate constant, never
  -- written by hand, so it cannot drift from the real rate without the rate moving.
  cost_usd        NUMERIC(12, 6) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defense_news_usage_created_at
  ON public.defense_news_usage (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_defense_news_usage_user
  ON public.defense_news_usage (user_id, created_at DESC);

ALTER TABLE public.defense_news_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'defense_news_usage'
      AND policyname = 'defense_news_usage_own_read'
  ) THEN
    CREATE POLICY defense_news_usage_own_read ON public.defense_news_usage
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT ON public.defense_news_usage TO authenticated;
GRANT ALL ON public.defense_news_usage TO service_role;

NOTIFY pgrst, 'reload schema';
