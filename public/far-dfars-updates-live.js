/* FARaudit · FAR/DFARS Updates — live wiring.
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

  // Impact classifier — keyword heuristic over title + summary.
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
      insight: '', // no insight pass on this route — stays empty
      affects: Array.isArray(u.affects_clauses) ? u.affects_clauses.length : 0,
      source:  u.source || '',
      link:    u.link || ''
    };
  }

  function setStatus(state, reason, sources) {
    if (!window.FARD) return;
    window.FARD.STATUS = { state: state, reason: reason || '', sources: sources || [] };
  }
  function repaint() {
    if (window.FAR_APP && typeof window.FAR_APP.render === 'function') window.FAR_APP.render();
  }

  /* The page must never be left showing what it showed before. An unreachable feed
     and a feed with nothing new produce the same empty array, so the state is what
     separates them, and both are stated on screen rather than left blank. */
  function renderUnavailable(reason) {
    if (window.FARD && Array.isArray(window.FARD.UPDATES)) {
      window.FARD.UPDATES.length = 0;
      if (Array.isArray(window.FARD.EFFECTIVE)) window.FARD.EFFECTIVE.length = 0;
      if (Array.isArray(window.FARD.AFFECTED)) window.FARD.AFFECTED.length = 0;
    }
    setStatus('unavailable', reason);
    repaint();
  }

  async function wire() {
    try {
      const res = await fetch('/api/regulatory-updates', { credentials: 'include' });
      if (!res.ok) {
        let why = 'The regulatory feeds could not be reached (HTTP ' + res.status + ').';
        try { const b = await res.json(); if (b && b.error) why = String(b.error); } catch (_) {}
        renderUnavailable(why);
        return;
      }
      const data = await res.json();
      const items = Array.isArray(data.updates) ? data.updates
                  : Array.isArray(data.items)   ? data.items
                  : [];

      // The route reports which sources answered. All of them failing is an outage,
      // not an empty result, even though both arrive as [].
      if (data.degraded && Array.isArray(data.sources)) {
        const dead = data.sources.filter(function (s) { return !s.ok; });
        if (dead.length === data.sources.length) {
          renderUnavailable('None of the ' + data.sources.length + ' regulatory sources responded.');
          return;
        }
        setStatus('ok', '', data.sources);
      } else {
        setStatus('ok', '', Array.isArray(data.sources) ? data.sources : []);
      }

      if (!window.FARD || !Array.isArray(window.FARD.UPDATES)) return;

      const mapped = items.map(mapUpdate);
      window.FARD.UPDATES.length = 0;
      window.FARD.UPDATES.push.apply(window.FARD.UPDATES, mapped);
      repaint();
    } catch (e) {
      console.error('[far-dfars-updates-live] wire failed:', e);
      renderUnavailable('The regulatory feeds could not be reached.');
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
