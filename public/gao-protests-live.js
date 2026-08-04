/* FARaudit · GAO Protests — live wiring.

   Fetches /api/protest-intel and installs the result on window.GAO, then
   renders. There is no fallback dataset.

   An empty answer is NOT an empty docket: GAO's feed can refuse the request,
   and the route reports which happened. A docket may only reach the page if
   GAO published it. */
(function () {
  'use strict';

  function apply(next) {
    window.GAO.DECISIONS = Array.isArray(next.decisions) ? next.decisions : [];
    window.GAO.AGENCIES = Array.isArray(next.agencies) ? next.agencies : [];
    const m = next.meta || {};
    window.GAO.meta = {
      state: window.GAO.DECISIONS.length > 0 ? 'ready' : 'empty',
      reason: m.reason || null,
      upstreamStatus: typeof m.upstream_status === 'number' ? m.upstream_status : null,
      fetchedAt: next.fetched_at || null,
      source: m.source || null
    };
  }

  function fail(detail) {
    window.GAO.DECISIONS = [];
    window.GAO.AGENCIES = [];
    window.GAO.meta = { state: 'error', reason: 'fetch-failed', detail: detail || null, upstreamStatus: null, fetchedAt: null, source: null };
  }

  function paint() {
    if (window.GAO_APP && typeof window.GAO_APP.render === 'function') window.GAO_APP.render();
  }

  async function wire() {
    try {
      const res = await fetch('/api/protest-intel', { credentials: 'include' });
      const data = await res.json().catch(function () { return null; });
      if (!res.ok || !data || !Array.isArray(data.decisions)) {
        fail(res.status === 401 ? 'Session expired' : 'HTTP ' + res.status);
      } else {
        apply(data);
      }
    } catch (e) {
      fail(e && e.message ? e.message : null);
    }
    paint();
  }

  const obs = new MutationObserver(function () {
    if (window.GAO_APP && typeof window.GAO_APP.onThemeChange === 'function') window.GAO_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
