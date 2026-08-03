-- Revoke public read on the two agent-telemetry tables.
--
-- WHAT WAS EXPOSED. Migrations 021 and 022 each declared `FOR SELECT USING (true)`, which makes the
-- table readable by the anon role — i.e. by anyone on the internet holding the publishable key, and that
-- key is published in our own JavaScript bundle by design. Reproduced 2026-08-03 with the public key:
--   agent_fleet_status   18 of 18 rows — per-agent cost_per_day_usd, a written skills_missing list, and
--                        free-text notes carrying commit hashes and internal rule references
--   agent_run_log         3 of  3 rows — cost_usd, input/output token counts, model_used, raw
--                        error_message, and metadata containing an internal email address
-- Every other table returned 0 rows to that key, so RLS is holding everywhere else. No customer data
-- was reachable: audits, pending_audits, fa_intelligence_corpus and email_ai_runs all returned 0.
--
-- WHY IT IS SAFE TO DROP. Every consumer of both tables is SERVER-SIDE and authenticates with the
-- service-role key, which bypasses RLS entirely:
--   src/app/api/cron/education-drip/route.ts · defense-brief · markets-brief · sunday-deepdive
--   scripts/seed-agent-fleet.mjs
-- Nothing in the browser reads either table, so the public policy bought nothing and cost disclosure of
-- our cost structure and capability gaps. RLS stays ENABLED on both; only the permissive SELECT policy
-- is removed, which returns them to deny-by-default for anon.
--
-- Rule 60 is about credentials reaching a browser; this is its data-plane twin — the test is structural
-- ("can a browser reach this row"), never risk-weighted ("how bad would it be").
--
-- CEO authorized in words 2026-08-03.

BEGIN;

DROP POLICY IF EXISTS agent_fleet_status_read_all ON public.agent_fleet_status;
DROP POLICY IF EXISTS agent_run_log_read_all      ON public.agent_run_log;

-- Belt and braces: RLS must remain ON. A dropped policy on a table with RLS disabled would leave the
-- table wide open rather than closed, which is the opposite of the intent here.
ALTER TABLE public.agent_fleet_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_log      ENABLE ROW LEVEL SECURITY;

COMMIT;
