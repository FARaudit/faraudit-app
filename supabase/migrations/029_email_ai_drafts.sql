-- 029_email_ai_drafts.sql
-- Stage 4: Reply drafter v2 — track drafts written to Gmail Drafts folder
-- CEO reviews in Gmail UI, sends manually. No autonomous send.

CREATE TABLE IF NOT EXISTS email_ai_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid REFERENCES email_ai_actions(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  gmail_draft_id text NOT NULL UNIQUE,
  draft_subject text,
  draft_body text NOT NULL,
  voice_samples_count int,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  model text,
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  ceo_edited boolean DEFAULT false,
  ceo_edit_notes text
);

CREATE INDEX IF NOT EXISTS idx_email_ai_drafts_thread ON email_ai_drafts(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_ai_drafts_action ON email_ai_drafts(action_id);
CREATE INDEX IF NOT EXISTS idx_email_ai_drafts_unsent ON email_ai_drafts(created_at DESC) WHERE sent_at IS NULL;
