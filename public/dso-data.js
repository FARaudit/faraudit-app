/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Opportunities — Pursuit Intelligence data shell.

   OPPS starts EMPTY and is populated exclusively by opportunities-live.js
   from /api/command-center-data (live SAM.gov read via fetchLiveOpportunities;
   the pending_audits queue is retired).
   No sample rows ship here: an upstream failure renders an explicit
   "feed unavailable" state, never plausible-looking data.

   NAICS is likewise live-derived (distinct codes present in the feed).
   FEED_STATE: 'loading' | 'live' | 'empty' | 'error' — owned by
   opportunities-live.js, read by dso-app.js to render honest states.
   ═══════════════════════════════════════════════════════════════════ */
window.DSO = (function () {

  const OPPS = [];   // live rows only — populated by opportunities-live.js
  const NAICS = [];  // live-derived — distinct codes in the current feed

  // Stage vocabulary. 'notice' covers Special Notice — industry day, amendment
  // announcement, intent-to-sole-source, cancellation — and 'UNKNOWN' lets the
  // classifier fail CLOSED rather than assert "Open RFP" on a notice it does not
  // recognise. Every pole normStage() can return MUST have
  // a STAGE_META entry — the render layer indexes it directly, so a missing pole
  // is a blank chip, and the coverage test asserts this.
  const STAGES = [
    { key: 'all', label: 'All stages' },
    { key: 'presol', label: 'Pre-Sol' },
    { key: 'sources', label: 'Sources Sought' },
    { key: 'rfp', label: 'Open RFP' },
    { key: 'notice', label: 'Special Notice' },
    { key: 'eval', label: 'In Evaluation' }
  ];
  const STAGE_META = {
    presol:  { label: 'Pre-Solicitation', color: '#94a3b8' },
    sources: { label: 'Sources Sought',   color: '#d97706' },
    rfp:     { label: 'Open RFP',          color: '#378ADD' },
    notice:  { label: 'Special Notice',    color: '#64748b' },
    eval:    { label: 'In Evaluation',     color: '#7c3aed' },
    UNKNOWN: { label: 'Type not recognised', color: '#64748b' }
  };
  // Set-aside filters. The list mirrors SAM's own enumeration one-for-one:
  // collapsing distinct set-aside types into a shared pole lets a mis-grouped row
  // hide inside a count that still looks correct.
  const SETASIDES = ['all', 'SB', 'SB-Partial', 'SDVOSB', '8(a)', 'HUBZone', 'WOSB', 'EDWOSB', 'SoleSource', 'Full', 'UNKNOWN'];

  const SAVED_VIEWS = [
    { key: 'hot', label: '🎯 High-fit & closing', desc: 'audited fit ≥ 85 · ≤ 10 days' },
    { key: 'sb', label: 'Set-aside eligible', desc: 'SB / SDVOSB / 8(a) / HUBZone' },
    { key: 'recompete', label: 'Known incumbent', desc: 'an incumbent is on record' },
    { key: 'upstream', label: 'Upstream (shape it)', desc: 'pre-sol + sources sought' }
  ];

  // WATCHED_NOTICE_IDS: Map notice_id→watch status · PIPELINE_IDS: Set of
  // solicitation refs. Both null until hydrated (null = state unavailable, which
  // the render layer shows as a disabled control rather than a false "off").
  //
  // CERTS: the customer's SAM-verified set-aside programs, owned by
  // opportunities-live.js from /api/certifications and read by dso-app.js.
  // 'loading' until that read answers. Only the 'verified' state may narrow what
  // the page shows — every other state leaves the full read on screen, because
  // "we did not read your registration" is not "you do not qualify".
  const CERTS = { state: 'loading', records: [], establishedPrograms: [], registrationExpires: null };

  return { OPPS, NAICS, STAGES, STAGE_META, SETASIDES, SAVED_VIEWS, FEED_STATE: 'loading', WATCHED_NOTICE_IDS: null, PIPELINE_IDS: null, LAST_INGEST: null, CERTS };
})();
