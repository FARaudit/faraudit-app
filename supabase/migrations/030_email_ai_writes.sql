-- 030_email_ai_writes.sql
-- Stage 5: cross-system write audit trail
-- Every notion_update / digest_p0_block / digest_p0_unblock action that
-- produces a real side-effect logs one row here for reversibility + idempotency.

CREATE TABLE IF NOT EXISTS email_ai_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid REFERENCES email_ai_actions(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  tick_id uuid,
  verb text NOT NULL CHECK (verb IN ('notion_update', 'digest_p0_block', 'digest_p0_unblock')),
  target_system text NOT NULL CHECK (target_system IN ('notion', 'digest')),
  target_ref text NOT NULL,  -- notion page_id OR digest p0 id OR completionsLog id
  payload jsonb NOT NULL,    -- what was written (full body for rollback)
  status text NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'rolled_back')) DEFAULT 'pending',
  error_message text,
  created_at timestamptz DEFAULT now(),
  applied_at timestamptz,
  rolled_back_at timestamptz
);

-- Idempotency: one successful write per action_id+verb combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_ai_writes_action_verb_unique
  ON email_ai_writes(action_id, verb) WHERE status = 'success';

CREATE INDEX IF NOT EXISTS idx_email_ai_writes_tick ON email_ai_writes(tick_id, status);
CREATE INDEX IF NOT EXISTS idx_email_ai_writes_target ON email_ai_writes(target_system, target_ref);
CREATE INDEX IF NOT EXISTS idx_email_ai_writes_pending ON email_ai_writes(created_at DESC) WHERE status = 'pending';
