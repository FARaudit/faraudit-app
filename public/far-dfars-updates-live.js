/* FARaudit · FAR/DFARS Updates — Fork B live wiring.
   Fetches /api/regulatory-updates (real RSS aggregation from acquisition.gov,
   DPC DFARS, and Federal Register, cached server-side). Maps each row to
   the window.FARD.UPDATES shape and re-renders via far-app.js.

   Bug A fix: previous version targeted bare global `UPDATES`, which is
   closure-scoped inside far-data.js IIFE and undefined globally — silent
   no-op. Now writes to window.FARD.UPDATES correctly. */
(function () {
  'use strict';

  // Source string → type label expected by far-app.js (DFARS | FAR | Deviation).
  function classifyType(src, title, clause) {
    const t = (String(title || '') + ' ' + String(clause || '')).toLowerCase();
    if (t.includes('class deviation') || t.includes('deviation')) return 'Deviation';
    const s = String(src || '').toLowerCase();
    if (s.includes('dfars')) return 'DFARS';
    if (s.includes('far')) return 'FAR';
    if (t.match(/dfars|252\.\d+/)) return 'DFARS';
    if (t.match(/\bfar\b|52\.\d+/)) return 'FAR';
    return 'FAR';
  }

  // Lightweight impact classifier — keyword heuristic on title + summary.
  // TODO: replace with Claude-side ai_insight + ai_impact in the route's
  // batch enrichment step (mirror defense-news pattern).
  function classifyImpact(title, summary) {
    const t = (String(title || '') + ' ' + String(summary || '')).toLowerCase();
    if (/cmmc|cyber|cui|safeguard|covered telecom|889|section 889|counterfeit|criminal/.test(t)) return 'HIGH';
    if (/threshold|limit|cost|pricing|tina|buy american|domestic content|subcontract/.test(t)) return 'MEDIUM';
    return 'LOW';
  }

  function mapUpdate(u) {
    return {
      clause:  u.clause || '',
      title:   u.title || '',
      type:    classifyType(u.source, u.title, u.clause),
      date:    u.effective_date || u.published_at || '',
      impact:  classifyImpact(u.title, u.summary),
      summary: u.summary || '',
      insight: '', // TODO: AI insight pass — currently empty
      affects: Array.isArray(u.affects_clauses) ? u.affects_clauses.length : 0,
      source:  u.source || '',
      link:    u.link || ''
    };
  }

  async function wire() {
    try {
      const res = await fetch('/api/regulatory-updates', { credentials: 'include' });
      if (!res.ok) throw new Error('regulatory-updates fetch failed: ' + res.status);
      const data = await res.json();
      const items = Array.isArray(data.updates) ? data.updates
                  : Array.isArray(data.items)   ? data.items
                  : [];
      if (!items.length) return;
      if (!window.FARD || !Array.isArray(window.FARD.UPDATES)) return;

      const mapped = items.map(mapUpdate);
      window.FARD.UPDATES.length = 0;
      window.FARD.UPDATES.push(...mapped);

      if (window.FAR_APP && typeof window.FAR_APP.render === 'function') {
        window.FAR_APP.render();
      }
    } catch (e) {
      console.error('[far-dfars-updates-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.FAR_APP && typeof window.FAR_APP.onThemeChange === 'function') {
      window.FAR_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
