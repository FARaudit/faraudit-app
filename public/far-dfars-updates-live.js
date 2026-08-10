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
      /* THE ROW'S IDENTITY IS ITS DOCUMENT, NOT ITS CLAUSE. Most rules in this corpus
         name no clause at all, and a clause is not unique to one rule even when present —
         two rules may amend the same part. The published document URL is one row, always. */
      id:      u.link || u.title || '',
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

  /* Rows whose effective date is still ahead, as a countdown. Only real dates count:
     a row with no effective_date is omitted rather than defaulted to today, which
     would invent an enforcement deadline. Dates are compared at UTC day granularity
     so a row does not change bucket with the reader's timezone. */
  function buildEffective(rows) {
    var DAY = 86400000;
    var now = new Date();
    var todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var out = [];
    (rows || []).forEach(function (u) {
      var raw = u && u.effective_date;
      if (!raw) return;
      var m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return;
      var when = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      var days = Math.round((when - todayUTC) / DAY);
      if (days < 0) return;                       // already in force — not upcoming
      out.push({
        name: u.title || '',
        clause: u.clause || (u.affects_clauses && u.affects_clauses[0]) || '',
        days: days,
        tone: days <= 7 ? 'red' : days <= 30 ? 'amber' : 'green'
      });
    });
    return out.sort(function (a, b) { return a.days - b.days; });
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
      const srcs = Array.isArray(data.sources) ? data.sources : [];
      const dead = srcs.filter(function (s) { return !s.ok; });
      if (srcs.length && dead.length === srcs.length) {
        renderUnavailable('None of the ' + srcs.length + ' regulatory sources responded.');
        return;
      }
      // Partial outage stays 'ok' for the records that DID arrive; far-app.js reads
      // sources[] and names the shortfall rather than printing a bare count.
      setStatus('ok', '', srcs);

      if (!window.FARD || !Array.isArray(window.FARD.UPDATES)) return;

      const mapped = items.map(mapUpdate);
      window.FARD.UPDATES.length = 0;
      window.FARD.UPDATES.push.apply(window.FARD.UPDATES, mapped);

      /* EFFECTIVE drives the "Effective ≤30d" count and the countdown panel. Nothing
         populated it, so that number could only ever be 0 — it read as a computed risk
         indicator while being structurally incapable of moving. The route now supplies
         effective_date, so it is derived here from the same rows on screen. */
      if (Array.isArray(window.FARD.EFFECTIVE)) {
        window.FARD.EFFECTIVE.length = 0;
        window.FARD.EFFECTIVE.push.apply(window.FARD.EFFECTIVE, buildEffective(items));
      }
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
