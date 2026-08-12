-- 035 · defense_spending_intel.sub_agency_breakdown — who actually buys.
--
-- "Department of Defense" is not a buyer. It is a department containing the
-- Navy, the Army, the Air Force, the Defense Logistics Agency and several
-- dozen commands, each with its own contracting offices, its own recompete
-- cycle and its own set-aside behaviour. A customer told "DoD spends $19.89B in
-- your code" has been told nothing they can act on.
--
-- The existing agency_breakdown answers at DEPARTMENT level, which is why the
-- panel renders DoD as one full-width bar beside ten unreadable slivers. This
-- column answers one level down. Measured 2026-08-12 on 336611 FY2026:
--
--   Department of the Navy                 $16,714,613,141
--   U.S. Coast Guard                        $7,695,356,609
--   NOAA                                      $148,887,621
--   Maritime Administration                    $95,119,443
--   Department of the Army                     $58,121,859
--
-- That is a target list. "$24.9B, Department of Defense" is not.
--
-- Shape, written by agents/defense-spending:
--   [{ name: string, amount: number }]   — largest first, top 12
--
-- ⛔ NOT DERIVED FROM award_sample. The sample is the 500 LARGEST awards, which
-- is exactly the bias that would over-report big buying offices and under-report
-- the small ones a small business can actually reach. This comes from
-- /search/spending_by_category/awarding_subagency/, which totals every award.
--
-- NULLABLE with no default. NULL = never pulled, which is not "no buying
-- offices" — and after 2026-08-12, when a WAF block wrote nulls over 14 measured
-- rows, that distinction is load-bearing rather than pedantic.
--
-- Idempotent: safe to re-run. Apply via Supabase Studio SQL editor on
-- apex-production BEFORE the branch merges (Rule 65, migrate-before-push).

ALTER TABLE public.defense_spending_intel
  ADD COLUMN IF NOT EXISTS sub_agency_breakdown JSONB;

COMMENT ON COLUMN public.defense_spending_intel.sub_agency_breakdown IS
  'Top awarding SUB-agencies for this (naics_code, fiscal_year) — the buying offices inside a department. NULL = never pulled, which is not "no buying offices".';

NOTIFY pgrst, 'reload schema';
