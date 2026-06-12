-- FA-149 · worker graceful drain + fast orphan reclaim.
--
-- audit-worker auto-deploys on every push to main; a deploy used to SIGKILL
-- the container mid-run, stranding the claim until the 30-minute stale sweep
-- failed it (evidence: run 6e3c8b77 / claim f0da5b1a, claimed
-- 2026-06-12T02:44:07Z, container replaced, row dead until manual triage).
--
-- Two additive columns on pending_audits:
--   heartbeat_at — refreshed every 30s by the worker while a run is in
--                  flight. A processing row whose heartbeat is >3 minutes
--                  stale (6 missed beats) belongs to a dead worker and is
--                  reclaimed to 'pending' for the replacement container.
--   attempts     — incremented on every clean release (SIGTERM drain) and
--                  every orphan reclaim. At 3 attempts the row flips to
--                  'failed' instead of 'pending' — poison-pill guard so a
--                  run that kills its worker (OOM) cannot crash-loop forever.
--
-- The worker probes for these columns at boot and degrades gracefully when
-- the migration has not been applied (legacy 30-min sweep only, no reclaim);
-- SIGTERM claim-release works either way.

ALTER TABLE public.pending_audits
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pending_audits.heartbeat_at IS
  'FA-149: worker liveness beat (30s cadence while processing). Stale >3min => orphan reclaim to pending. NULL on pending rows and on claims made before this migration.';
COMMENT ON COLUMN public.pending_audits.attempts IS
  'FA-149: count of claim releases (drain) + orphan reclaims. >=3 => failed instead of re-pending (poison-pill guard).';
