/* FARaudit · Defense Spending — live wiring.
   Fetches /api/defense-spending, mutates window.DSB IN PLACE, re-renders.
   When API ships `_source: "unwired-mock-preserved"`, this script is a no-op
   and the client-side mock in dsb-data.js continues to display.
   When real DSB shape lands in the API, mutations + render fire normally. */
(function () {
  'use strict';

  function replaceArr(name, next) {
    if (!Array.isArray(next)) return;
    const arr = window.DSB[name];
    if (!Array.isArray(arr)) { window.DSB[name] = next.slice(); return; }
    arr.length = 0;
    arr.push(...next);
  }

  function replaceObj(name, next) {
    if (!next || typeof next !== 'object') return;
    const cur = window.DSB[name];
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, next);
    } else {
      window.DSB[name] = next;
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/defense-spending', { credentials: 'include' });
      if (!res.ok) {
        if (window.DSB) window.DSB.STATUS = { state: 'unwired', reason: 'Spending data could not be loaded (HTTP ' + res.status + ').' };
        if (window.DSB_APP && typeof window.DSB_APP.render === 'function') window.DSB_APP.render();
        return;
      }
      const data = await res.json();

      if (!window.DSB) return;

      // No live source yet. Record the state so the page states it, rather than
      // returning and leaving whatever was already on screen.
      if (data.state === 'unwired') {
        window.DSB.STATUS = { state: 'unwired', reason: data.reason || '' };
        if (window.DSB_APP && typeof window.DSB_APP.render === 'function') window.DSB_APP.render();
        return;
      }
      window.DSB.STATUS = { state: 'ok', reason: '' };

      if (Array.isArray(data.FYS))            replaceArr('FYS', data.FYS);
      if (Array.isArray(data.AGENCY_FILTERS)) replaceArr('AGENCY_FILTERS', data.AGENCY_FILTERS);

      replaceObj('KPIS',         data.KPIS);
      replaceObj('STATES',       data.STATES);
      replaceObj('MARKET_TREND', data.MARKET_TREND);

      replaceArr('AGENCIES',    data.AGENCIES);
      replaceArr('COMPETITION', data.COMPETITION);
      replaceArr('BUDGET',      data.BUDGET);
      replaceArr('RECOMPETES',  data.RECOMPETES);
      replaceArr('INCUMBENTS',  data.INCUMBENTS);
      replaceArr('PRICING',     data.PRICING);
      replaceArr('NDAA',        data.NDAA);

      if (window.DSB_APP && typeof window.DSB_APP.render === 'function') {
        window.DSB_APP.render();
      }
    } catch (e) {
      console.error('[defense-spending-live] wire failed:', e);
      if (window.DSB) window.DSB.STATUS = { state: 'unwired', reason: 'Spending data could not be loaded.' };
      if (window.DSB_APP && typeof window.DSB_APP.render === 'function') window.DSB_APP.render();
    }
  }

  const obs = new MutationObserver(() => {
    if (window.DSB_APP && typeof window.DSB_APP.onThemeChange === 'function') {
      window.DSB_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
