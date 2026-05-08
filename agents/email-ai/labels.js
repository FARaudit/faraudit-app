// Email-AI · 6-label canonical scheme.
//
// One Gmail label per message — never two. The decision tree in classify.js
// always returns exactly one of these keys. Any change to the displayed label
// names below MUST stay in sync with the classifier system prompt.

export const LABEL_KEYS = ['NOW', 'THIS_WEEK', 'WAITING', 'READ', 'ARCHIVE', 'DELETE'];

// Display names (CEO-curated). The emoji prefix renders in Gmail's sidebar.
export const LABEL_NAMES = {
  NOW:        '🔴 NOW',
  THIS_WEEK:  '🟡 THIS WEEK',
  WAITING:    '🟢 WAITING',
  READ:       '🔵 READ',
  ARCHIVE:    '⚫ ARCHIVE',
  DELETE:     '🗑️ DELETE',
};

// Resolve all six display names → Gmail label IDs in one shot. Creates any
// missing labels via gmail.users.labels.create. Cached on the GmailClient
// instance via its labelCache; subsequent calls in the same run are free.
//
// Returns: { NOW: 'Label_xxx', THIS_WEEK: 'Label_yyy', ... }
export async function ensureSixLabels(gmailClient) {
  const out = {};
  for (const key of LABEL_KEYS) {
    out[key] = await gmailClient.ensureLabel(LABEL_NAMES[key]);
  }
  return out;
}

// Reverse map: Gmail label ID → bucket key. Used by the daily-brief generator
// and the WAITING/READ sweeps to identify which threads belong to which bucket
// without re-querying Gmail with each label individually.
export function buildIdToKey(labelIds) {
  const m = {};
  for (const key of LABEL_KEYS) {
    if (labelIds[key]) m[labelIds[key]] = key;
  }
  return m;
}
