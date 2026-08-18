-- 033 · defense_spending_intel.award_sample — award-level records.
--
-- Everything the stored recipient TOTALS cannot answer: what a single award is
-- worth, who set it aside, what pricing type it carries, which office bought it,
-- and how long it runs. The totals endpoints aggregate all of that away, which is
-- why four panels on /defense-spending have been unbuildable — and why two of
-- them told the customer the data "is not in the feed" when it was simply never
-- asked for.
--
-- Shape, written by agents/defense-spending:
--   { awards: [{ award_id, recipient, amount, agency, sub_agency,
--                award_type, set_aside, pricing, start_date, end_date }],
--     sampled: int, cap: int, truncated: bool }
--
-- A SAMPLE, and it says so in its own payload. USAspending pages this endpoint
-- and a busy code runs to tens of thousands of awards; the worker takes the
-- largest 500 by value and stores `sampled`, `cap` and `truncated` beside them so
-- no reader can present a distribution as the whole market. A cap that is not
-- carried alongside the data becomes a number someone later reports as a count —
-- this table has been bitten by exactly that.
--
-- NULLABLE with no default. A row written before this column existed has no
-- sample, which is not the same as a code with no awards, and a default of '{}'
-- would erase that difference on every historical row.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on apex-production.

ALTER TABLE public.defense_spending_intel
  ADD COLUMN IF NOT EXISTS award_sample JSONB;

COMMENT ON COLUMN public.defense_spending_intel.award_sample IS
  'Largest-N award-level records for this (naics_code, fiscal_year), with sampled/cap/truncated carried in the payload. NULL = never pulled, which is not "no awards".';

NOTIFY pgrst, 'reload schema';
