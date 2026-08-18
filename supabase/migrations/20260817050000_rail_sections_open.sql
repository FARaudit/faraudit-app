-- Which sidebar groups start OPEN, per group, on the account.
--
-- Replaces the single rail_sections_collapsed boolean shipped hours earlier. That one
-- could only answer "collapse everything, yes or no", and the useful answer is almost
-- always "this group open, those two closed".
--
-- It also removed a conflict rather than adding a feature. The rail has always kept a
-- per-group open/closed map in localStorage, and the boolean sat beside it as a second,
-- competing statement about the same thing — saving the switch had to WIPE the map to
-- take effect, so setting a preference destroyed the group choices the customer had
-- made by hand. Storing the map itself means the account holds the same shape the rail
-- already uses: one source of truth, mirrored rather than reconciled.
--
-- JSONB, not three booleans, because the sections are a product decision that changes
-- (Readiness / Market intel / Reference today) and because this is the seat for the
-- interface preferences that follow it. A column per group would make renaming a group
-- a migration.
--
-- NULL = never chosen, and the reader falls back to the shipped default: every group
-- starts closed. An empty object {} is a different fact — a customer who has chosen
-- and chosen "all closed" — and the reader treats them the same today, but they must
-- not be collapsed into one value at rest.
--
-- Shape: { "readiness": true, "market-intel": false, "reference": false }
-- Keys are the rail's own data-sec slugs. A key for a group that no longer exists is
-- ignored by the reader rather than erroring, so removing a section is not a migration.
alter table public.user_preferences
  add column if not exists rail_sections_open jsonb;

comment on column public.user_preferences.rail_sections_open is
  'Per-group sidebar open state, keyed by the rail data-sec slug. NULL = never chosen (all groups start closed). Written only by /api/preferences; read by the rail, which mirrors it into localStorage because it must apply BEFORE first paint.';
