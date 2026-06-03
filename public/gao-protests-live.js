/* FARaudit · GAO Protests — Fork B live wiring.
   Fetches /api/protest-intel (shared with home/HomeClient.tsx). Maps each
   decision row → window.GAO.PROTESTS shape, maps per-agency stats →
   window.GAO.BY_AGENCY, re-renders.

   Bug B fix: dropped the `?live` URL gate that prevented this from ever
   firing in production.

   TODO: NATIONAL stats (annual GAO report), GROUNDS taxonomy, SIGNALS
   (per-user "tracked award protested" alerts) remain mock — need GAO
   annual stats table + per-user join with pending_audits. */
(function () {
  'use strict';

  function cap(s) {
    if (!s) return '';
    const t = String(s);
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  function daysSince(iso) {
    if (!iso) return 0;
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return 0;
    return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  }
  function yearOf(iso) {
    if (!iso) return new Date().getFullYear();
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  }

  function mapDecision(d) {
    const outcome = d.outcome ? cap(d.outcome) : 'Active';
    const ground = d.ground || '';
    return {
      id:        d.docket || (d.protester + '-' + d.decision_date),
      docket:    d.docket || '',
      status:    outcome,
      title:     (d.protester || '') + (d.agency ? ' v. ' + d.agency : ''),
      agency:    d.agency || '',
      protester: d.protester || '',
      ground:    ground.slice(0, 120),
      filed:     d.decision_date || '',
      val:       0,   // TODO: not in GAO RSS — needs decision-body fetch
      days:      daysSince(d.decision_date),
      naics:     '',  // TODO: not in GAO RSS
      year:      yearOf(d.decision_date),
      detail:    ground
    };
  }

  function mapAgencyStat(a) {
    return {
      agency:    a.agency || '',
      filed:     a.total || 0,
      sustained: a.sustained || 0,
      rate:      a.sustained_rate || 0
    };
  }

  async function wire() {
    try {
      const res = await fetch('/api/protest-intel', { credentials: 'include' });
      if (!res.ok) throw new Error('protest-intel fetch failed: ' + res.status);
      const data = await res.json();
      if (!window.GAO) return;

      const decisions = Array.isArray(data.decisions) ? data.decisions : [];
      const agencies  = Array.isArray(data.agencies)  ? data.agencies  : [];
      if (!decisions.length && !agencies.length) return;

      if (decisions.length && Array.isArray(window.GAO.PROTESTS)) {
        const mapped = decisions.map(mapDecision);
        window.GAO.PROTESTS.length = 0;
        window.GAO.PROTESTS.push(...mapped);
      }

      if (agencies.length && Array.isArray(window.GAO.BY_AGENCY)) {
        const mapped = agencies.map(mapAgencyStat);
        window.GAO.BY_AGENCY.length = 0;
        window.GAO.BY_AGENCY.push(...mapped);
      }

      if (window.GAO_APP && typeof window.GAO_APP.render === 'function') {
        window.GAO_APP.render();
      }
    } catch (e) {
      console.error('[gao-protests-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.GAO_APP && typeof window.GAO_APP.onThemeChange === 'function') {
      window.GAO_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
