-- 20260604182020_notifications_and_digest_pref.sql
-- Watcher Phase 2:
--   (a) public.notifications — single feed table that drives the topbar
--       bell .nbadge count + dropdown. First producer is the watcher-tick
--       (kind='watcher_posted'); future producers (KO email replies, audit
--       failures, etc.) reuse the same surface.
--   (b) user_preferences.weekly_digest_watched — per-user toggle for the
--       weekly digest of watched opportunities. Defaults TRUE. The /api
--       /preferences ALLOWED list is widened in the same Phase 2 ship.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_recent_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_owner_read    ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_update  ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_delete  ON public.notifications;
DROP POLICY IF EXISTS notifications_service_all   ON public.notifications;

CREATE POLICY notifications_owner_read ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Only PATCH-style updates (read_at toggle). Service-role inserts everything.
CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated
  USING       (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

CREATE POLICY notifications_owner_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Watcher-tick + future system producers write via service-role.
CREATE POLICY notifications_service_all ON public.notifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── user_preferences.weekly_digest_watched ─────────────────────────
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS weekly_digest_watched BOOLEAN DEFAULT TRUE;
