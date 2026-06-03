/* FARaudit · Wage Benchmarks — Fork B live wiring.
   Fetches /api/labor-rates (shared route — also serves home/HomeClient.tsx
   for per-user wage summary). Mutates window.WAGE IN PLACE if response is
   in WAGES shape, else no-op (mock preserved).

   TODO: needs new user_labor_rates table (operator-editable hourly rates
   per category/site). API currently returns market benchmarks (low/median/
   high) without the user's "yours" column. Once user_labor_rates ships,
   add fetchWageBenchmarksFull() that joins user_labor_rates + wage_rate_cache
   + the existing benchmark REFERENCE to produce WAGES with yours/sca/var/status. */
(function () {
  'use strict';

  function replaceArr(name, next) {
    if (!Array.isArray(next)) return;
    const arr = window.WAGE[name];
    if (!Array.isArray(arr)) { window.WAGE[name] = next.slice(); return; }
    arr.length = 0;
    arr.push(...next);
  }

  function replaceObj(name, next) {
    if (!next || typeof next !== 'object') return;
    const cur = window.WAGE[name];
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, next);
    } else {
      window.WAGE[name] = next;
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/labor-rates', { credentials: 'include' });
      if (!res.ok) throw new Error('labor-rates fetch failed: ' + res.status);
      const data = await res.json();

      if (data._source === 'unwired-mock-preserved') return;
      // Legacy benchmark-only shape ({ rates: [...] }) — bail until
      // fetchWageBenchmarksFull ships with WAGES (incl. user wages).
      if (!Array.isArray(data.WAGES)) return;

      if (!window.WAGE) return;

      replaceArr('WAGES',     data.WAGES);
      replaceArr('LOCATIONS', data.LOCATIONS);
      replaceArr('STATUSES',  data.STATUSES);
      replaceArr('RENEWALS',  data.RENEWALS);
      replaceArr('SORTS',     data.SORTS);
      replaceObj('STATUS_META', data.STATUS_META);

      if (window.WAGE_APP && typeof window.WAGE_APP.render === 'function') {
        window.WAGE_APP.render();
      }
    } catch (e) {
      console.error('[wage-benchmarks-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.WAGE_APP && typeof window.WAGE_APP.onThemeChange === 'function') {
      window.WAGE_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
