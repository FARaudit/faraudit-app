-- Migration 026: email_ai_actions table for Email-AI v4 Stage 3 (observe-only)
-- 
-- Purpose: Action extractor logs structured action decisions per classified thread.
-- Stage 3 ships observe-only (no side effects). Stage 5+ will read this table
-- and execute verb-specific cross-system writes one verb at a time.
--
-- Schema decisions:
--   - verb is constrained to the 7 values defined in the v4 architecture spec
--     (Notion 361faf5b931481ce8003efe7c97a6769). Adding a new verb requires
--     a migration + spec update; intentional friction.
--   - cross_system is jsonb to allow verb-specific payload shapes.
--   - confidence is decoupled from email_thread_classifications.confidence
--     because action confidence ≠ bucket confidence (you can be sure a thread
--     is NOW without being sure what action it needs).
--   - applied/applied_at/applied_outcome are intentionally OMITTED. Stage 5
--     writes a separate execution row with FK back here; mixing proposal and
--     execution on the same row is a tier-elevation foot-gun.
--
-- Indexes:
--   - (thread_id, extracted_at DESC) — latest-action-per-thread lookups
--   - (verb, extracted_at DESC) — Stage 5 verb-by-verb rollout queries

CREATE TABLE IF NOT EXISTS public.email_ai_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    classification_id uuid NOT NULL REFERENCES public.email_thread_classifications(id) ON DELETE CASCADE,
    thread_id text NOT NULL,
    tick_id uuid,
    extracted_at timestamptz NOT NULL DEFAULT now(),
    verb text NOT NULL CHECK (verb IN (
        'reply',
        'calendar',
        'notion_update',
        'digest_p0_unblock',
        'digest_p0_block',
        'forward',
        'none'
    )),
    reason text NOT NULL,
    cross_system jsonb,
    confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    extractor_stage text NOT NULL CHECK (extractor_stage IN ('llm', 'deterministic')),
    extractor_model text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_ai_actions_thread_extracted 
    ON public.email_ai_actions (thread_id, extracted_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_ai_actions_verb_extracted 
    ON public.email_ai_actions (verb, extracted_at DESC);

COMMENT ON TABLE public.email_ai_actions IS 
    'Email-AI v4 Stage 3 action extractor output. Observe-only at Stage 3. 
     Stage 5+ reads this for verb-by-verb cross-system action rollout.';

COMMENT ON COLUMN public.email_ai_actions.verb IS 
    'One of 7 action verbs from v4 architecture spec (Notion 361faf5b931481ce8003efe7c97a6769). 
     Schema-constrained to prevent verb drift.';

COMMENT ON COLUMN public.email_ai_actions.cross_system IS 
    'Verb-specific payload. Shape examples:
     - reply: { tone, key_points, recipients }
     - calendar: { duration_min, proposed_slots, attendees }
     - notion_update: { page_id, field, new_value }
     - digest_p0_unblock: { p0_id, evidence }
     - none: null';
