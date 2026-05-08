// Email-AI · Claude-driven autonomous classifier.
//
// One Anthropic call per inbox thread → JSON verdict in one of 6 buckets.
// Calls api.anthropic.com directly via fetch (mirrors agents/audit-ai/audit-engine.ts).
// Requires ANTHROPIC_API_KEY in the runtime env.

import { LABEL_KEYS } from './labels.js';

const CLAUDE_MODEL = 'claude-opus-4-7';
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS) || 60000;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are an autonomous email triage agent for Jose Antonio Rodriguez Jr, CEO of Vertex Intelligence (FARaudit defense BD platform + Bullrize investor intelligence + LexAnchor parked legal infrastructure).

Classify the message into EXACTLY ONE label: NOW, THIS_WEEK, WAITING, READ, ARCHIVE, or DELETE.

Apply this decision tree IN ORDER:

1. DELETE: duplicate of message in last 1h, phishing, scam, unsubscribed-but-still-sending, generic policy notices
2. ARCHIVE: routine no-action (deploy success, billing confirmation post-pay, known-device sign-in, Workspace tips, Atlas receipts after CEO acknowledged)
3. WAITING: thread where CEO replied recently and is expecting a response back
4. NOW: action required today (prospect reply, Atlas/legal milestone, security incident requiring action, real Railway/Vercel crash needing intervention, IRS/attorney/contract, EIN/83(b) milestone)
5. READ: intel feeding the businesses (defense news, FAR/DFARS, SEC filings, legal opinions, economic releases)
6. THIS_WEEK: useful within 7 days but not urgent (billing, Workspace renewals, Notion invites, attorney check-ins)
7. Default to ARCHIVE if none of the above clearly applies.

Specific routing rules:
- atlas@stripe.com EIN/Stock Purchase Agreement → NOW
- atlas@stripe.com receipt → ARCHIVE
- hello@notify.railway.app deploy crashed (Audit-AI/Email-AI/Recompete-AI/Regulatory-AI) → NOW (these are the heart of FARaudit/Bullrize)
- hello@notify.railway.app deploy crashed (faraudit-cron, bullrize daily-pipeline) → THIS_WEEK
- hello@notify.railway.app build success / deploy success → ARCHIVE
- notifications@vercel.com Failed deploy production → NOW
- notifications@vercel.com Failed deploy preview/CLI / failed CLI from woofmanagementco@gmail.com → ARCHIVE
- payments-noreply@google.com / workspace@google.com → THIS_WEEK
- workspace-noreply@google.com / updates@e.stripe.com / no-reply@referralhero.com → ARCHIVE
- stablecoins@stripe.com Treasury promo → keep ONE in ARCHIVE, mark rest DELETE (duplicate)
- noreply@google.com verification YOU requested (recovery email setup) → THIS_WEEK
- noreply@mail.app.supabase.io password reset YOU did NOT request → NOW (security)
- no-reply@accounts.google.com security alert → ARCHIVE if known device, NOW if unrecognized
- forwarding-noreply@google.com → THIS_WEEK (one-time confirmation)
- ant.wilson@supabase.com project paused → THIS_WEEK
- memberships@free.law / research@stlouisfed.org / no-reply@login.gov → ARCHIVE (operational data sources)
- notify@updates.notion.so team invite → THIS_WEEK
- notify@updates.notion.so digest/mention → READ if relevant, ARCHIVE if not
- jose@bullrize.com / jose@lexanchor.ai self-forward → ARCHIVE (already seen)
- Sender domain in [snoeinc.com, pmrglobal.com, southernmachineworks.com, americanvalmark.com] OR sender name matches [Rachel Prevost, John Kratzert] → NOW + create personalized draft reply
- News/intel sources (FedScoop, Defense News, DoD News, Reuters defense, SeekingAlpha, Bloomberg) → READ

Output JSON only:
{
  "label": "NOW" | "THIS_WEEK" | "WAITING" | "READ" | "ARCHIVE" | "DELETE",
  "confidence": 0.0-1.0,
  "reason": "one sentence explaining the routing decision",
  "recommended_action": "one sentence | null",
  "draft_reply": "full draft text | null",
  "is_duplicate_of_thread_id": "thread_id | null"
}`;

// Build the user-message payload from a message + context flags. Keeps the
// thread context tight so we don't burn input tokens on long signature
// blocks: subject + sender + snippet (first 2 KB) + the boolean hints from
// the existing detectors and the prospect matcher.
function buildUserPrompt({ message, snippet, ceoRepliedRecently, isProspectMatch, isKoMatch, recentDuplicateIds }) {
  const lines = [
    `From: ${message.from || ''}`,
    `To: ${message.to || ''}`,
    `Subject: ${message.subject || ''}`,
    `Date: ${message.date || ''}`,
    `Has List-Unsubscribe header: ${message.listUnsubscribe ? 'yes' : 'no'}`,
    '',
    'Hints from deterministic detectors:',
    `  - CEO replied to this thread recently: ${ceoRepliedRecently ? 'yes' : 'no'}`,
    `  - Sender matches hardcoded prospect list: ${isProspectMatch ? 'yes' : 'no'}`,
    `  - Sender matches a known KO recipient (audits.ko_email_recipient): ${isKoMatch ? 'yes' : 'no'}`,
  ];
  if (recentDuplicateIds && recentDuplicateIds.length > 0) {
    lines.push(`  - Same subject + sender within last 1h on threads: ${recentDuplicateIds.join(', ')}`);
  }
  lines.push('', 'Message snippet (first 2KB):', snippet || '(empty)');
  lines.push('', 'Output the JSON verdict now.');
  return lines.join('\n');
}

// Brace-balanced JSON extractor. Tolerates code-fenced replies, prose-wrapped
// JSON, or raw JSON. Returns null on failure (caller falls back to ARCHIVE).
function extractJSON(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Sanitize and apply the safety policy. Returns the verdict shape the index
// loop expects, with usage stats for logging/cost tracking.
export async function classifyThread({
  message,
  snippet,
  ceoRepliedRecently = false,
  isProspectMatch = false,
  isKoMatch = false,
  recentDuplicateIds = [],
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('classify: ANTHROPIC_API_KEY missing from env');

  const userPrompt = buildUserPrompt({
    message, snippet, ceoRepliedRecently, isProspectMatch, isKoMatch, recentDuplicateIds,
  });

  const t0 = Date.now();
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }],
    }),
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  const usage = {
    input_tokens: data?.usage?.input_tokens || 0,
    output_tokens: data?.usage?.output_tokens || 0,
    ms: Date.now() - t0,
  };

  const parsed = extractJSON(text);
  if (!parsed) {
    return {
      label: 'ARCHIVE',
      confidence: 0,
      reason: 'JSON parse failure — defaulted to ARCHIVE',
      recommended_action: null,
      draft_reply: null,
      is_duplicate_of_thread_id: null,
      usage,
      raw: text,
    };
  }

  let label = String(parsed.label || '').toUpperCase().replace(/[\s-]/g, '_');
  if (!LABEL_KEYS.includes(label)) {
    label = 'ARCHIVE';
  }

  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;

  // Safety policy: never DELETE on low confidence — fall back to ARCHIVE.
  // Same fallback applies if raw model output was DELETE but landed in this
  // path with confidence < 0.85.
  if (label === 'DELETE' && confidence < 0.85) {
    label = 'ARCHIVE';
  }

  return {
    label,
    confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    recommended_action: typeof parsed.recommended_action === 'string' ? parsed.recommended_action : null,
    draft_reply: typeof parsed.draft_reply === 'string' ? parsed.draft_reply : null,
    is_duplicate_of_thread_id: typeof parsed.is_duplicate_of_thread_id === 'string' ? parsed.is_duplicate_of_thread_id : null,
    usage,
    raw: text,
  };
}
