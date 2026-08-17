-- user_preferences — THE COLUMNS THE APP ACTUALLY WRITES.
--
-- fa_intelligence_v2.sql declares the table as it was first created. Five columns were
-- added directly in Supabase afterwards and never written down, so the repo could not
-- answer "what does this table hold" — which is how a Settings toggle got blocked:
-- there was no way to tell an absent column from an unrecorded one without querying
-- production.
--
-- IDEMPOTENT AND SAFE TO RE-RUN. Every statement is IF NOT EXISTS, so pasting this
-- against a database that already has these columns changes nothing. It exists to make
-- the file match reality and to be the one place a new preference gets added.
--
-- Column list VERIFIED against the live table on 2026-08-17 via /api/preferences,
-- which selects *, so this is the shape production actually has rather than the shape
-- the code implies.
--
-- Postgres 11+ backfills existing rows when ADD COLUMN carries a NOT NULL DEFAULT, so
-- the boolean defaults below apply to accounts that already exist — a column default
-- alone would fire on INSERT only and leave every current customer NULL.

-- ── already live; recorded here so the file stops lying ──────────────────────────

-- Light is the default and is represented by the ABSENCE of an override, so this is
-- nullable. The API accepts only 'dark' or 'auto' (VALID_THEMES).
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS theme TEXT;

-- Notification toggles. watcher-tick reads both BEFORE sending, so a false here stops
-- mail rather than merely hiding it in the UI.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS alerts_email_enabled  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS alerts_in_app_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS weekly_digest_watched BOOLEAN NOT NULL DEFAULT false;

-- Idle auto sign-out, in minutes. NULL is OFF and is the default; the API accepts only
-- 15 / 30 / 60 / 120 / 240, so a hand-crafted PATCH cannot store a value no control can
-- show and no customer can undo from the page.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS auto_signout_minutes INTEGER;

-- ── also live, and also unrecorded (confirmed against production 2026-08-17) ─────
--
-- Read off the live table rather than inferred. Neither is referenced anywhere in the
-- app, so both are recorded as facts about the table, not as things to start using.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS notifications_pref TEXT;

-- ⚠ DRIFT IN THE OTHER DIRECTION, AND IT IS NOT FIXED HERE.
-- fa_intelligence_v2.sql declares `weekly_brief_email TEXT`, and that column DOES NOT
-- EXIST on the live table. Nothing in the app reads or writes it, so it is a dead
-- declaration rather than a live defect — but it means the original file describes a
-- shape production never had. Dropping the line is a decision about history, so it is
-- left alone and named instead.

-- ── new: the sidebar collapse preference ────────────────────────────────────────
--
-- The rail already remembers which groups are open, but only in the browser that was
-- used, so a new laptop or a cleared cache starts over. This carries the choice on the
-- account instead.
--
-- DEFAULT true = every group starts collapsed (CEO 2026-08-16). The section holding the
-- page you are on still opens regardless — that is render logic, not a preference.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS rail_sections_collapsed BOOLEAN NOT NULL DEFAULT true;
