-- ALERT CHANNEL PREFERENCES — the columns the toggles shipped in #541 write to.
--
-- Written after the fact, and that order was the mistake: #541 added the keys to the
-- preferences allowlist and taught watcher-tick to read them, but the columns did not
-- exist. PostgREST drops an unknown column from the payload, so the PATCH answered 2xx,
-- the switch moved on screen, and the value went nowhere. Rule 65 exists for exactly
-- this: apply the migration BEFORE the code that depends on it ships.
--
-- DEFAULT TRUE, and the default carries the product rule rather than a habit. A customer
-- who has never opened the Notifications tab has not opted out of anything, so an absent
-- or NULL value must read as ON. watcher-tick tests `!== false` for the same reason: only
-- an explicit refusal suppresses a send.
--
-- NULL is left legal. Backfilling every existing row to TRUE would be indistinguishable
-- from every one of those customers having chosen TRUE, and the two are not the same
-- fact. The reader already treats NULL as on.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS alerts_email_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS alerts_in_app_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.user_preferences.alerts_email_enabled IS
  'Watched-notice alert emails. NULL/absent = ON (never configured); only explicit FALSE suppresses. Read by src/lib/watcher-tick.ts.';
COMMENT ON COLUMN public.user_preferences.alerts_in_app_enabled IS
  'Watched-notice bell notifications. NULL/absent = ON (never configured); only explicit FALSE suppresses. Read by src/lib/watcher-tick.ts.';
