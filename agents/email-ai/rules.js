// Email-AI v2 rule set — 10-label collapsed schema.
//
// Each rule emits exactly one `category` (canonical label key) + one `tier`.
// index.js maps category → Gmail Label ID at apply time. No sub-labels.
// The tier (action / monitor / archive) appends ⚠️/👀 or removes INBOX —
// it is the action discriminator. Sender-source detail lives in the email
// body and the audit log (email_processing_log), NOT in a label hierarchy.
//
// Categories: legal | finance | infra | prospects | linkedin |
//             bullrize | lexanchor | archive
// (action / monitor / archive labels are appended automatically by tier.)
//
// Order matters — first matching rule wins. Place specific above generic.

const lower = (s) => (s || '').toLowerCase();
const fromIs = (m, ...patterns) => patterns.some((p) => lower(m.from).includes(lower(p)));
const subjectHas = (m, ...patterns) => patterns.some((p) => lower(m.subject).includes(lower(p)));

const DEFENSE_TERMS = [
  'defense', 'aerospace', 'federal', 'contracting', 'contractor', 'dod',
  'navy', 'army', 'air force', 'space force', 'usaf', 'far ', 'dfars',
  'sam.gov', 'prime ', 'subcontract', 'cmmc', 'itar',
];

export const rules = [
  // ── Stable Mailroom — physical mail (4-way split, all → legal) ───
  {
    name: 'Stable Mailroom — physical mail received',
    match: (m) => fromIs(m, 'mailroom@email.usestable.com') && subjectHas(m, 'new mail'),
    category: 'legal',
    tier: 'action',
  },
  {
    name: 'Stable Mailroom — weekly digest',
    match: (m) => fromIs(m, 'mailroom@email.usestable.com') && subjectHas(m, 'weekly update', 'weekly digest', 'weekly summary'),
    category: 'legal',
    tier: 'monitor',
  },
  {
    name: 'Stable Mailroom — system noreply',
    match: (m) => fromIs(m, 'no-reply@email.usestable.com'),
    category: 'legal',
    tier: 'archive',
  },
  {
    name: 'Stable Mailroom — auth flows',
    match: (m) => fromIs(m, 'noreply@authenticate.usestable.com'),
    category: 'legal',
    tier: 'archive',
  },

  // ── IRS / EIN / 83(b) ────────────────────────────────────────────
  {
    name: 'IRS — EIN / federal tax',
    match: (m) =>
      fromIs(m, '@irs.gov', 'do-not-reply@irs.gov') ||
      (fromIs(m, 'atlas@stripe.com') && subjectHas(m, 'ein', 'tax id', 'employer identification', '83(b)', '83b')),
    category: 'legal',
    tier: 'action',
  },

  // ── Stripe Atlas — incorporation ─────────────────────────────────
  {
    name: 'Stripe Atlas — incorporation',
    match: (m) =>
      fromIs(m, 'atlas@stripe.com') ||
      (fromIs(m, 'stripe.com') && subjectHas(m, 'atlas', 'incorporat', 'c-corp', 'certificate of incorporation', 'founder stock')),
    category: 'legal',
    tier: (m) => (subjectHas(m, 'action required', 'verify', 'sign', 'review', 'e-sign', 'esign') ? 'action' : 'monitor'),
  },

  // ── Stable mailbox — non-mailroom legal ──────────────────────────
  {
    name: 'Stable mailbox — legal',
    match: (m) => fromIs(m, 'stable.com', 'usestable.com'),
    category: 'legal',
    tier: (m) => (subjectHas(m, 'action required', 'sign', 'verify') ? 'action' : 'archive'),
  },

  // ── Banking (Mercury / SVB / Atlas Treasury) ─────────────────────
  {
    name: 'Banking — Mercury / SVB / Atlas Treasury',
    match: (m) =>
      fromIs(m, '@mercury.com', 'mercury.com', '@svb.com', 'svb.com', 'silicon valley bank', 'treasury@stripe.com'),
    category: 'finance',
    tier: (m) => (subjectHas(m, 'verify', 'action required', 'identity', 'fraud', 'failed', 'declined', 'wire') ? 'action' : 'monitor'),
  },

  // ── Stripe — finance ─────────────────────────────────────────────
  // Default tier is monitor (not archive) — receipts need eyeball for anomaly
  // detection (unexpected charges, surprise sub renewals).
  {
    name: 'Stripe — finance',
    match: (m) => fromIs(m, 'stripe.com'),
    category: 'finance',
    tier: (m) => (subjectHas(m, 'failed', 'declined', 'unrecognized', 'verify', 'action required') ? 'action' : 'monitor'),
  },

  // ── Provider billing receipts ────────────────────────────────────
  {
    name: 'Anthropic — billing',
    match: (m) => fromIs(m, '@anthropic.com', 'anthropic.com', 'noreply@anthropic.com'),
    category: 'finance',
    tier: 'archive',
  },
  {
    name: 'Supabase — billing',
    match: (m) =>
      fromIs(m, '@supabase.com', 'supabase.com') &&
      subjectHas(m, 'invoice', 'receipt', 'billing', 'payment', 'subscription'),
    category: 'finance',
    tier: 'archive',
  },
  {
    name: 'Notion — billing',
    match: (m) =>
      fromIs(m, '@notion.so', 'notion.so', '@mail.notion.so') &&
      subjectHas(m, 'invoice', 'receipt', 'billing', 'payment', 'subscription'),
    category: 'finance',
    tier: 'archive',
  },
  {
    name: 'Vercel — billing',
    match: (m) =>
      fromIs(m, '@vercel.com', 'billing@vercel.com') &&
      subjectHas(m, 'invoice', 'receipt', 'billing', 'payment'),
    category: 'finance',
    tier: 'archive',
  },
  {
    name: 'Railway — billing',
    match: (m) =>
      fromIs(m, '@railway.app') &&
      subjectHas(m, 'invoice', 'receipt', 'billing', 'payment'),
    category: 'finance',
    tier: 'archive',
  },

  // ── Infrastructure alerts (operational, not billing) ─────────────
  // Deploy crashes / build failures are duplicate, self-resolving system noise
  // — they belong at monitor, not action. Only true security incidents
  // (vulnerability / breach / exposed) escalate to action tier.
  {
    name: 'Railway — infrastructure',
    match: (m) => fromIs(m, 'notify.railway.app', 'railway.app'),
    category: 'infra',
    tier: (m) => (subjectHas(m, 'security', 'vulnerability', 'breach', 'exposed') ? 'action' : 'monitor'),
  },
  {
    name: 'Vercel — infrastructure',
    match: (m) => fromIs(m, 'vercel.com'),
    category: 'infra',
    tier: (m) => (subjectHas(m, 'security', 'vulnerability', 'breach', 'exposed') ? 'action' : 'monitor'),
  },
  {
    name: 'GitHub — infrastructure',
    match: (m) => fromIs(m, 'github.com'),
    category: 'infra',
    tier: (m) => (subjectHas(m, 'security', 'vulnerability', 'breach', 'exposed') ? 'action' : 'monitor'),
  },

  // ── Google security alerts ───────────────────────────────────────
  {
    name: 'Google — security alert',
    match: (m) =>
      fromIs(m, 'no-reply@accounts.google.com', 'workspace@google.com', 'googlemail.com') &&
      subjectHas(m, 'security alert', 'sign-in', 'new sign-in', 'new device', 'critical', 'verify it'),
    category: 'infra',
    tier: 'action',
  },
  {
    name: 'Google Workspace — admin / forwarding',
    match: (m) => fromIs(m, 'forwarding-noreply@google.com', 'workspace-noreply@google.com', 'admin-noreply@google.com'),
    category: 'infra',
    tier: (m) => (subjectHas(m, 'verify', 'confirm', 'action required') ? 'action' : 'monitor'),
  },

  // ── Notion — workspace digest (non-billing, non-auth) ────────────
  // Placed AFTER the Notion billing rule so invoice/receipt emails win first.
  // Excludes transactional auth flows (login codes, magic links) — those
  // remain skip so the brief doesn't pile up on 2FA noise.
  {
    name: 'Notion — workspace digest',
    match: (m) =>
      fromIs(m, 'notify@updates.notion.so', '@updates.notion.so') &&
      !subjectHas(m, 'login code', 'magic link', 'temporary', 'reset password', 'verify your email'),
    category: 'infra',
    tier: 'monitor',
  },

  // ── Vendor welcomes & API onboarding (one-shot, archive) ─────────
  {
    name: 'Vendor welcome — API providers',
    match: (m) =>
      fromIs(
        m,
        '@resend.com', 'resend.com',
        '@hunter.io', 'hunter.io',
        '@financialmodelingprep.com', 'financialmodelingprep.com',
        '@newsapi.org', 'newsapi.org',
        '@courtlistener.com', 'courtlistener.com',
        '@polygon.io', 'polygon.io',
        '@serper.dev', 'serper.dev',
        '@census.gov', 'census.gov',
        '@congress.gov', 'congress.gov',
        '@data.nasdaq.com', 'nasdaq.com',
        '@tradierbrokerage.com', 'tradier.com',
        '@unusualwhales.com', 'unusualwhales.com',
        'noreply@api.data.gov',
      ),
    category: 'infra',
    tier: 'archive',
  },

  // ── Mailing lists (Substack / Beehiiv / Worcester T&G) ───────────
  {
    name: 'Mailing list — Substack',
    match: (m) => fromIs(m, '@substack.com', 'substack.com'),
    category: 'archive',
    tier: 'archive',
  },
  {
    name: 'Mailing list — Beehiiv',
    match: (m) => fromIs(m, '@beehiiv.com', 'beehiiv.com'),
    category: 'archive',
    tier: 'archive',
  },
  {
    name: 'Mailing list — Worcester Telegram & Gazette',
    match: (m) => fromIs(m, 'telegram.com', 'telegramgazette.com', 'worcestertelegram.com'),
    category: 'archive',
    tier: 'archive',
  },

  // ── LinkedIn ─────────────────────────────────────────────────────
  {
    name: 'LinkedIn — defense/aerospace prospect',
    match: (m) =>
      fromIs(m, 'linkedin.com') &&
      subjectHas(m, 'message', 'connection', 'invitation', 'mentioned', 'responded', 'replied') &&
      subjectHas(m, ...DEFENSE_TERMS),
    category: 'prospects',
    tier: 'action',
  },
  {
    name: 'LinkedIn — generic notifications',
    match: (m) => fromIs(m, 'linkedin.com'),
    category: 'linkedin',
    tier: 'archive',
  },

  // ── Known noise (auto-archive) ───────────────────────────────────
  {
    name: 'Archive — known noise',
    match: (m) =>
      fromIs(
        m,
        'formspree.io', 'every.io', 'tradier.promo', 'clearme.com',
        'opensecrets.org', 'redditmail.com', 'ngrok.com',
      ),
    category: 'archive',
    tier: 'archive',
  },

  // ── Forwarded aliases (Bullrize / LexAnchor) ─────────────────────
  {
    name: 'Forwarded — bullrize alias',
    match: (m) => fromIs(m, 'jose@bullrize.com') || /\bbullrize\.com>?/i.test(m.to || ''),
    category: 'bullrize',
    tier: 'action',
  },
  {
    name: 'Forwarded — lexanchor alias',
    match: (m) => fromIs(m, 'jose@lexanchor.ai') || /\blexanchor\.ai>?/i.test(m.to || ''),
    category: 'lexanchor',
    tier: 'action',
  },
];

export function evaluate(message) {
  for (const rule of rules) {
    if (!rule.match(message)) continue;
    const tier = typeof rule.tier === 'function' ? rule.tier(message) : rule.tier;
    return { rule: rule.name, category: rule.category, tier };
  }
  return null;
}
