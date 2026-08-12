/* FARaudit · Defense Spending — live wiring.

   Fetches /api/defense-spending, installs the payload on window.DSB, hands
   control to DSB_APP. No fallback dataset, no seeded state: until the fetch
   settles the page is 'loading' and renders nothing. */
(function () {
  'use strict';

  function paint() {
    if (window.DSB_APP && typeof window.DSB_APP.render === 'function') window.DSB_APP.render();
  }

  function unwired(reason) {
    window.DSB.STATUS = { state: 'unwired', reason: reason || '' };
    paint();
  }

  async function wire() {
    try {
      const res = await fetch('/api/defense-spending', { credentials: 'include' });
      const data = await res.json().catch(function () { return null; });

      if (!res.ok) {
        unwired((data && data.reason) || 'Spending data could not be loaded (HTTP ' + res.status + ').');
        return;
      }
      if (!data || data.state !== 'ok') {
        unwired((data && data.reason) || '');
        return;
      }

      window.DSB.FYS = Array.isArray(data.FYS) ? data.FYS : [];
      window.DSB.BY_FY = data.BY_FY || {};
      window.DSB.MARKET_TREND = data.MARKET_TREND || { labels: [], series: {} };
      window.DSB.RECOMPETES = Array.isArray(data.RECOMPETES) ? data.RECOMPETES : [];
      window.DSB.SB_SHARE = Array.isArray(data.SB_SHARE) ? data.SB_SHARE : [];
      window.DSB.CONCENTRATION = Array.isArray(data.CONCENTRATION) ? data.CONCENTRATION : [];
      window.DSB.SB_WINNERS = Array.isArray(data.SB_WINNERS) ? data.SB_WINNERS : [];
      window.DSB.AGENCY_FILTERS = Array.isArray(data.AGENCY_FILTERS) ? data.AGENCY_FILTERS : [{ key: 'all', label: 'All' }];
      window.DSB.coverage = data.coverage || null;
      window.DSB.as_of = data.as_of || null;
      window.DSB.window_note = data.window_note || '';
      window.DSB.unsupported = Array.isArray(data.unsupported) ? data.unsupported : [];

      // A payload with no fiscal years is not a dashboard with nothing in it —
      // it is a read that produced nothing, and it says so.
      if (window.DSB.FYS.length === 0) {
        unwired('Federal spending returned no fiscal years for your codes.');
        return;
      }

      window.DSB.STATUS = { state: 'ok', reason: '' };
      paint();
    } catch (e) {
      console.error('[defense-spending-live] wire failed:', e);
      unwired('Spending data could not be loaded.');
    }
  }

  const obs = new MutationObserver(function () {
    if (window.DSB_APP && typeof window.DSB_APP.onThemeChange === 'function') window.DSB_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
