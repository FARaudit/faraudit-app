-- 20260604175542_watched_notices.sql
-- Watcher backend (Phase 1).
--
-- One row per (user × notice the user is tracking). Audit-id is FK-soft
-- (text, not uuid ref) so the row survives the audit being deleted /
-- re-run / replaced. notice_id is the durable key — SAM's stable
-- identifier — that the sam-ingest cron uses to detect the
-- []→[resourceLink] transition that flips status from 'watching' → 'posted'.
--
-- Status pipeline:
--   watching → posted (cron detects resourceLinks now populated)
--           → audited (auto-audit completes; audit_id back-fills)
--
-- Service-role policy lets the sam-ingest + audit-ai Railway crons
-- write status transitions; owner policies cover the in-app UX.

CREATE TABLE IF NOT EXISTS public.watched_notices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audit_id          uuid,
  notice_id         text NOT NULL,
  solicitation_number text,
  title             text,
  agency            text,
  notice_type       text,
  response_deadline timestamptz,
  status            text NOT NULL DEFAULT 'watching'
                    CHECK (status IN ('watching','posted','audited')),
  notify_email      boolean NOT NULL DEFAULT true,
  notify_in_app     boolean NOT NULL DEFAULT true,
  posted_at         timestamptz,
  audited_at        timestamptz,
  last_checked_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notice_id)
);

CREATE INDEX IF NOT EXISTS watched_notices_user_status_idx
  ON public.watched_notices (user_id, status);
CREATE INDEX IF NOT EXISTS watched_notices_notice_id_idx
  ON public.watched_notices (notice_id);
CREATE INDEX IF NOT EXISTS watched_notices_status_idx
  ON public.watched_notices (status)
  WHERE status = 'watching';

ALTER TABLE public.watched_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watched_notices_owner_read   ON public.watched_notices;
DROP POLICY IF EXISTS watched_notices_owner_insert ON public.watched_notices;
DROP POLICY IF EXISTS watched_notices_owner_update ON public.watched_notices;
DROP POLICY IF EXISTS watched_notices_owner_delete ON public.watched_notices;
DROP POLICY IF EXISTS watched_notices_service_all  ON public.watched_notices;

CREATE POLICY watched_notices_owner_read ON public.watched_notices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY watched_notices_owner_insert ON public.watched_notices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY watched_notices_owner_update ON public.watched_notices
  FOR UPDATE TO authenticated
  USING       (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

CREATE POLICY watched_notices_owner_delete ON public.watched_notices
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- sam-ingest + audit-ai Railway crons write status transitions.
CREATE POLICY watched_notices_service_all ON public.watched_notices
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
