# Email-AI v3

Drafts-only email triage for `jose@faraudit.com`. Cron tick every 30 min on Railway. TypeScript / Node 20 / Anthropic SDK / Supabase service role.

## What v3 does

1. **Self-loop filter (line 1):** drops any thread whose latest message `From` matches `GMAIL_USER`. Prevents the agent's own drafts from being re-classified.
2. **Hard blacklist:** trashes anything from a sender in `email_blacklist` (active=true) before any classify call. 14 senders seeded; CEO edits the table to add/remove.
3. **Classifier (Anthropic Sonnet 4.6, ephemeral cache):** outputs JSON `{bucket, confidence, reasoning}` into one of six buckets: NOW · THIS WEEK · WAITING · READ · ARCHIVE · DELETE.
4. **NOW bucket → Gmail draft only.** Never `gmail.send`. Reply tone: direct, brief, no hype, no apology, no exclamation marks.
5. **Full instrumentation:** every tick writes one row to `email_ai_runs` with token counts, cost, error log, and final status. Every classified thread writes one row to `email_thread_classifications`.

## What v3 does NOT do

- Send emails (drafts only).
- Re-run on its own messages.
- Silently swallow errors (every catch logs to `email_ai_runs.error_log` with `threadId` + `senderEmail` + `step`).
- Tolerate missing tables (boot-time `migration-check.ts` exits 1 if any of the 3 tables is unreachable).
- Cost-track deterministic decisions as if they were API calls (blacklist trashes write `is_deterministic`-equivalent rows with 0 token cost).

## Required env vars

See `.env.example`. Secrets must be set via Railway dashboard or `railway variables set` — never committed.

## Kill switch

`EMAIL_AI_ENABLED` must be the literal string `'true'`. Any other value (including unset) makes the tick exit 0 immediately. Use this for emergency stops without redeploying.

## Local dry run

```bash
cd ~/faraudit-app/agents/email-ai-v3
npm install
cp .env.example .env.local
# fill in .env.local with secrets from 1Password / Supabase / Railway dashboard
npx tsc --noEmit            # typecheck
npm start                    # one-shot tick
```

## Editing the blacklist

```sql
-- Add a sender
INSERT INTO email_blacklist (sender_email, reason)
VALUES ('foo@example.com', 'reason') ON CONFLICT (sender_email) DO NOTHING;

-- Disable without deleting (preserve history)
UPDATE email_blacklist SET active = false WHERE sender_email = 'foo@example.com';
```

## Schema

`schema/021_email_ai_v3.sql` in the `faraudit-app` repo. Three tables: `email_blacklist`, `email_ai_runs`, `email_thread_classifications`. RLS enabled; only service role can read/write.

## Why no v2 fallback

Live cutover, no shadow. v2 had a `WAITING→NOW` sweep bug, a missing self-loop filter, a 32-label legacy code path, silent error swallows, and an incomplete migration (see `~/faraudit-app/ceo/email-ai-v2-review.md`). v3 was built to address each P0/P1 finding from that review. Rolling back means rolling forward to v3.1, not back to v2.
