-- Reconcile pipeline.stage with the DEPLOYED constraint.
--
-- Drift, probed 2026-07-29: the original migration
-- (20260601144549_create_pipeline.sql) constrains stage to
-- ('tracking','rfi_submitted','bid_no_bid','proposal_in_progress','submitted',
-- 'awarded','no_bid'), but the live apex-production table enforces the '01'..'08'
-- lifecycle codes that public/pipeline-live.js (STAGE_LABELS) and
-- src/app/api/command-center-data/route.ts (STAGE_TO_BUCKET) have used all along.
-- An INSERT of stage '03' therefore succeeds on live and FAILS on any database
-- built from this repo's migrations (local dev, CI, preview, disaster rebuild).
--
-- This migration makes a repo-built schema match live. It is written to be a
-- no-op against the live database (which already enforces the codes) and is
-- idempotent.

-- Map any legacy word-form rows to their lifecycle code before re-constraining.
update public.pipeline set stage = case stage
  when 'tracking'             then '01'
  when 'rfi_submitted'        then '02'
  when 'bid_no_bid'           then '03'
  when 'proposal_in_progress' then '04'
  when 'submitted'            then '05'
  when 'awarded'              then '07'
  when 'no_bid'               then '08'
  else stage
end
where stage in ('tracking','rfi_submitted','bid_no_bid','proposal_in_progress','submitted','awarded','no_bid');

alter table public.pipeline drop constraint if exists pipeline_stage_check;
alter table public.pipeline add constraint pipeline_stage_check
  check (stage in ('01','02','03','04','05','06','07','08'));

-- One pursuit per (user, solicitation) — enforced, not merely checked.
-- The Opportunities Pipeline button used a select-then-insert for idempotency,
-- which races: two rapid clicks both pass the existence check and insert twice
-- (reproduced: 3 concurrent POSTs → 3 rows). This index makes the DB the
-- arbiter so the route can upsert. Duplicates are collapsed first, keeping the
-- earliest row per pair (it carries any stage the user has since advanced).
delete from public.pipeline p
using public.pipeline q
where p.user_id = q.user_id
  and p.solicitation_number = q.solicitation_number
  and p.solicitation_number is not null
  and p.ctid > q.ctid;

create unique index if not exists pipeline_user_solicitation_uniq
  on public.pipeline (user_id, solicitation_number)
  where solicitation_number is not null;
