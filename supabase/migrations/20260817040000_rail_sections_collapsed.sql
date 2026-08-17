-- Whether the sidebar's collapsible groups START collapsed.
--
-- The rail already remembered which groups were open, but only in localStorage, so the
-- choice belonged to a browser rather than to a customer: a new laptop or a cleared
-- cache started over. This carries it on the account.
--
-- DEFAULT true = start collapsed, which is the behaviour already shipped, so existing
-- rows keep exactly what they have today. NOT NULL with a DEFAULT backfills existing
-- rows on Postgres 11+; a bare default would apply to INSERTs only and leave every
-- current customer NULL, which the reader would then have to guess about.
--
-- This is a STARTING POSITION, not a restriction, and two behaviours sit outside it:
-- the group holding the active page always opens (render logic in renderRail, so that
-- the page you are on is never hidden), and a group the customer opens stays open
-- (per-group localStorage, which wins over this default — the default says where a
-- group starts, and a group since opened is no longer starting).
alter table public.user_preferences
  add column if not exists rail_sections_collapsed boolean not null default true;

comment on column public.user_preferences.rail_sections_collapsed is
  'true = sidebar groups start collapsed. Written only by /api/preferences; read by the rail, which mirrors it into localStorage because it must apply BEFORE first paint.';
