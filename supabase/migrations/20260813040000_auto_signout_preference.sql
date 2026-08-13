-- Idle auto sign-out duration, in minutes.
--
-- NULL is OFF and is the default, so every existing row keeps today's behaviour
-- without a backfill: nothing is scheduled unless the customer chooses a duration.
-- A DEFAULT would only apply to INSERTs anyway, and /api/preferences upserts.
--
-- The allowed values are enforced in the route (VALID_SIGNOUT_MINUTES) rather than
-- by a CHECK constraint: the set is a product decision that tracks what the settings
-- control offers, and a constraint would turn adding an option into a migration and
-- a deploy-ordering problem. Rule 45 applies to the reverse direction — this column
-- has exactly one writer.
alter table public.user_preferences
  add column if not exists auto_signout_minutes integer;

comment on column public.user_preferences.auto_signout_minutes is
  'Idle minutes before the browser signs the session out. NULL = off. Written only by /api/preferences; read by public/auto-signout.js.';
