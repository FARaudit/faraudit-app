/* FARaudit · Wage Benchmarks — live wiring.

   Fetches /api/labor-rates and installs the result on window.WAGE, then
   renders. A search re-fetches with wage=1 so the request also asks GSA CALC+
   for awarded rates in that labor category.

   There is no fallback dataset: a failure sets state 'error' and the page says
   so, because "the rate service did not answer" and "no category matches" are
   different facts and must not look alike. */
(function () {
  'use strict';

  function apply(next, query) {
    window.WAGE.RATES = Array.isArray(next.rates) ? next.rates : [];
    window.WAGE.SCOPE = next.scope && typeof next.scope === 'object' ? next.scope : { codes: [], source: null };
    const m = next.meta || {};
    window.WAGE.meta = {
      state: window.WAGE.RATES.length > 0 ? 'ready' : 'empty',
      reason: m.reason || null,
      curated: m.curated || 0,
      liveAwarded: m.live_awarded || 0,
      query: query || null,
      naics: m.naics || null
    };
  }

  function fail(detail) {
    window.WAGE.RATES = [];
    window.WAGE.meta = { state: 'error', reason: 'fetch-failed', detail: detail || null, curated: 0, liveAwarded: 0, query: null, naics: null };
  }

  function paint() {
    if (window.WAGE_APP && typeof window.WAGE_APP.render === 'function') window.WAGE_APP.render();
  }

  async function load(opts) {
    const o = opts || {};
    const params = new URLSearchParams();
    if (o.naics) params.set('naics', o.naics);
    if (o.q) { params.set('q', o.q); params.set('wage', '1'); }
    const qs = params.toString();
    try {
      const res = await fetch('/api/labor-rates' + (qs ? '?' + qs : ''), { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.rates)) {
        fail(res.status === 401 ? 'Session expired' : 'HTTP ' + res.status);
      } else {
        apply(data, o.q || null);
      }
    } catch (e) {
      fail(e && e.message ? e.message : null);
    }
    paint();
  }

  // The renderer asks for a reload when the filters change: a live GSA lookup
  // is a server round-trip, not a client-side filter, so it cannot be faked.
  window.WAGE_LOAD = load;

  const obs = new MutationObserver(() => {
    if (window.WAGE_APP && typeof window.WAGE_APP.onThemeChange === 'function') window.WAGE_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => load({}));
  else load({});
})();
