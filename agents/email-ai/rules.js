const lower = (s) => (s || '').toLowerCase();
const fromIs = (m, ...patterns) => patterns.some((p) => lower(m.from).includes(lower(p)));
const subjectHas = (m, ...patterns) => patterns.some((p) => lower(m.subject).includes(lower(p)));

const DEFENSE_TERMS = [
  'defense', 'aerospace', 'federal', 'contracting', 'contractor', 'dod',
  'navy', 'army', 'air force', 'space force', 'usaf', 'far ', 'dfars',
  'sam.gov', 'prime ', 'subcontract', 'cmmc', 'itar',
];

export const rules = [
  {
    name: 'Stripe Atlas — incorporation',
    match: (m) =>
      fromIs(m, 'atlas@stripe.com') ||
      (fromIs(m, 'stripe.com') && subjectHas(m, 'atlas', 'incorporat', 'c-corp', 'ein', 'certificate of incorporation', 'founder stock')),
    labels: ['🏛️ Legal & Entity/Atlas'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'action required', 'verify', 'sign', 'review'),
  },

  {
    name: 'Stripe — finance',
    match: (m) => fromIs(m, 'stripe.com'),
    labels: ['💰 Finance/Stripe'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'failed', 'declined', 'unrecognized', 'verify', 'action required'),
  },

  {
    name: 'Stable mailbox — legal',
    match: (m) => fromIs(m, 'stable.com', 'usestable.com'),
    labels: ['🏛️ Legal & Entity'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'action required', 'sign', 'verify'),
  },

  {
    name: 'Railway — infrastructure',
    match: (m) => fromIs(m, 'notify.railway.app', 'railway.app'),
    labels: ['🔧 Infrastructure/Railway'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'failed', 'build failed', 'crashed', 'error'),
  },

  {
    name: 'Vercel — infrastructure',
    match: (m) => fromIs(m, 'vercel.com'),
    labels: ['🔧 Infrastructure/Vercel'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'failed', 'error', 'warning'),
  },

  {
    name: 'GitHub — infrastructure',
    match: (m) => fromIs(m, 'github.com'),
    labels: ['🔧 Infrastructure/GitHub'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'security', 'vulnerability', 'breach', 'exposed'),
  },

  {
    name: 'Google Workspace — forwarding/admin',
    match: (m) => fromIs(m, 'forwarding-noreply@google.com', 'workspace-noreply@google.com', 'admin-noreply@google.com'),
    labels: ['🔧 Infrastructure/Google Workspace'],
    archive: true,
    actionRequired: (m) => subjectHas(m, 'verify', 'confirm', 'action required'),
  },

  {
    name: 'LinkedIn — defense/aerospace prospect',
    match: (m) =>
      fromIs(m, 'linkedin.com') &&
      (subjectHas(m, 'message', 'connection', 'invitation', 'mentioned', 'responded', 'replied') &&
        subjectHas(m, ...DEFENSE_TERMS)),
    labels: ['👥 Prospects/Active'],
    archive: false,
    actionRequired: true,
  },

  {
    name: 'LinkedIn — generic notifications',
    match: (m) => fromIs(m, 'linkedin.com'),
    labels: ['📣 LinkedIn'],
    archive: true,
    actionRequired: false,
  },

  {
    name: 'Archive — known noise',
    match: (m) =>
      fromIs(
        m,
        'formspree.io',
        'every.io',
        'tradier.promo',
        'clearme.com',
        'opensecrets.org',
        'redditmail.com',
        'ngrok.com'
      ),
    labels: ['🗄️ Archive'],
    archive: true,
    actionRequired: false,
  },

  {
    name: 'Forwarded — bullrize alias',
    match: (m) => fromIs(m, 'jose@bullrize.com') || /\bbullrize\.com>?/i.test(m.to || ''),
    labels: ['📥 Forwarded/Bullrize'],
    archive: false,
    actionRequired: true,
  },

  {
    name: 'Forwarded — lexanchor alias',
    match: (m) => fromIs(m, 'jose@lexanchor.ai') || /\blexanchor\.ai>?/i.test(m.to || ''),
    labels: ['📥 Forwarded/LexAnchor'],
    archive: false,
    actionRequired: true,
  },
];

export function evaluate(message) {
  for (const rule of rules) {
    if (!rule.match(message)) continue;
    const actionRequired =
      typeof rule.actionRequired === 'function' ? !!rule.actionRequired(message) : !!rule.actionRequired;
    return {
      rule: rule.name,
      labels: rule.labels,
      archive: !!rule.archive && !actionRequired,
      actionRequired,
    };
  }
  return null;
}
