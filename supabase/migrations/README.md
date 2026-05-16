# Migration directory conventions

Vertex Intelligence uses two migration directories. **This is intentional, not drift.**

## `supabase/migrations/`

CLI-tracked migrations managed via `supabase db push` and `supabase migration list`.
Sequential numbering. This directory is the source of truth for app-wide schema work.

## `schema/`

Email-AI v3-era migrations applied directly to production via Supabase SQL Editor.
Workflow documented in `schema/MIGRATIONS.md`. Numbering overlaps with this directory
because both started at 021 in parallel during the v3 rebuild.

## Parallel-numbering map

| Number | `supabase/migrations/`        | `schema/`                          |
|--------|-------------------------------|------------------------------------|
| 021    | agent_fleet_status            | email_ai_v3                        |
| 022    | agent_run_log                 | email_ai_overrides                 |
| 023    | —                             | email_ai_v31                       |
| 024    | —                             | email_ai_v31_bucket_constraint     |
| 025    | audit_quality_gate            | —                                  |
| 026    | email_ai_actions              | —                                  |

## If you see a "gap" in this directory's sequence

Check `schema/` for the same number before assuming drift. Both directories are
authoritative for the work they cover; neither is a subset of the other.

## Rule

New work goes in `supabase/migrations/` unless it is Email-AI v3-internal schema
that needs Studio-paste application, in which case follow `schema/MIGRATIONS.md`.
