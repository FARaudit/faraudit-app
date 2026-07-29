/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Opportunities — Pursuit Intelligence data shell.

   OPPS starts EMPTY and is populated exclusively by opportunities-live.js
   from /api/command-center-data (Supabase pending_audits ← SAM.gov ingest).
   No sample rows ship here: an upstream failure renders an explicit
   "feed unavailable" state, never plausible-looking data.

   NAICS is likewise live-derived (distinct codes present in the feed).
   FEED_STATE: 'loading' | 'live' | 'empty' | 'error' — owned by
   opportunities-live.js, read by dso-app.js to render honest states.
   ═══════════════════════════════════════════════════════════════════ */
window.DSO = (function () {

  const OPPS = [];   // live rows only — populated by opportunities-live.js
  const NAICS = [];  // live-derived — distinct codes in the current feed

  const STAGES = [
    { key: 'all', label: 'All stages' },
    { key: 'presol', label: 'Pre-Sol' },
    { key: 'sources', label: 'Sources Sought' },
    { key: 'rfp', label: 'Open RFP' },
    { key: 'eval', label: 'In Evaluation' }
  ];
  const STAGE_META = {
    presol:  { label: 'Pre-Solicitation', color: '#94a3b8' },
    sources: { label: 'Sources Sought',   color: '#d97706' },
    rfp:     { label: 'Open RFP',          color: '#378ADD' },
    eval:    { label: 'In Evaluation',     color: '#7c3aed' }
  };
  const SETASIDES = ['all', 'SB', 'SDVOSB', '8(a)', 'HUBZone', 'Full'];

  const SAVED_VIEWS = [
    { key: 'hot', label: '🎯 High-fit & closing', desc: 'audited fit ≥ 85 · ≤ 10 days' },
    { key: 'sb', label: 'Set-aside eligible', desc: 'SB / SDVOSB / 8(a) / HUBZone' },
    { key: 'recompete', label: 'Known incumbent', desc: 'an incumbent is on record' },
    { key: 'upstream', label: 'Upstream (shape it)', desc: 'pre-sol + sources sought' }
  ];

  // WATCHED_NOTICE_IDS: Map notice_id→watch status · PIPELINE_IDS: Set of
  // solicitation refs. Both null until hydrated (null = state unavailable, which
  // the render layer shows as a disabled control rather than a false "off").
  return { OPPS, NAICS, STAGES, STAGE_META, SETASIDES, SAVED_VIEWS, FEED_STATE: 'loading', WATCHED_NOTICE_IDS: null, PIPELINE_IDS: null, LAST_INGEST: null };
})();
