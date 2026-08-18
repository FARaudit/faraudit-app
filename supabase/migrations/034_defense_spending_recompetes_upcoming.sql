-- 034 · defense_spending_intel.recompetes_upcoming — recompetes a bidder can act on.
--
-- The Recompete Radar has never contained a recompete. `fetchRecompetes` sorts
-- awards by End Date and keeps whatever falls in a window, so the panel is a
-- list of expiring periods of performance with a different word on top.
--
-- Measured 2026-08-12 across five NAICS codes, 48 rows in the existing 180-day
-- window: 26 delivery orders (54%), 14 purchase orders (29%), 1 BPA call, and 7
-- definitive contracts (15%). A delivery order ending is the parent IDIQ placing
-- its next order — no competition and nothing to bid. For 336412 it was 8 of 8
-- non-recompetable: General Electric and StandardAero orders expiring on
-- schedule, presented to the customer as opportunity.
--
-- Two changes make the window answerable:
--   award_type_codes ["D"] — definitive contracts only. Verified against the
--     live API rather than the header comment in usaspending.ts, which lists the
--     A/B/C/D order backwards: A=BPA CALL, B=PURCHASE ORDER, C=DELIVERY ORDER,
--     D=DEFINITIVE CONTRACT.
--   365-548 days out — a recompete solicitation drops 12-18 months before the
--     incumbent expires, so a 90/180-day window catches contracts whose
--     recompete has already been solicited and likely already awarded. It was
--     pointed at the wrong end of the timeline.
--
-- Shape, written by agents/defense-spending:
--   [{ award_id, recipient, amount, agency, end_date }]  (same RecompeteRow)
--
-- A NEW COLUMN, not a redefinition of recompetes_expiring_90d/_180d. Those keep
-- their current meaning and keep being written: _180d is read live by
-- src/lib/bd-os/defense-spending.ts and Design holds card 826 against the panel
-- it feeds. A column named _180d holding 12-18 month data would be false for
-- every future reader, and the surface is in flight — it gets replaced when the
-- refinement lands, not emptied underneath it.
--
-- NULLABLE with no default: a row written before this column existed has no
-- window, which is not the same as a code with no upcoming recompetes.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on
-- apex-production BEFORE the branch merges (Rule 65, migrate-before-push).

ALTER TABLE public.defense_spending_intel
  ADD COLUMN IF NOT EXISTS recompetes_upcoming JSONB;

COMMENT ON COLUMN public.defense_spending_intel.recompetes_upcoming IS
  'Definitive contracts (award_type_code D) whose period of performance ends 365-548 days out — the window in which a recompete is actually solicited. NULL = never pulled, which is not "no recompetes".';

NOTIFY pgrst, 'reload schema';
