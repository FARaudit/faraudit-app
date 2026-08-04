/* FARaudit · Defense Agencies — live wiring.

   Fetches /api/agencies and records what came back on window.DAG.STATUS, then
   renders. There is no fallback dataset: while no source is connected the page
   says so, and a failed request says something different again. */
(function () {
  'use strict';

  function paint() {
    if (window.DAG_APP && typeof window.DAG_APP.render === 'function') window.DAG_APP.render();
  }

  async function wire() {
    try {
      const res = await fetch('/api/agencies', { credentials: 'include' });
      const data = await res.json().catch(function () { return null; });
      if (!res.ok || !data) {
        window.DAG.STATUS = {
          state: 'error',
          reason: res.status === 401
            ? 'Your session expired, so this page could not ask for agency data.'
            : 'The agency service answered HTTP ' + res.status + '.'
        };
      } else if (data.state === 'unwired') {
        window.DAG.STATUS = { state: 'unwired', reason: data.reason || '' };
      } else if (Array.isArray(data.DEPTS) && data.DEPTS.length > 0) {
        window.DAG.DEPTS = data.DEPTS;
        window.DAG.STATUS = { state: 'ok', reason: '' };
      } else {
        window.DAG.STATUS = { state: 'unwired', reason: data.reason || '' };
      }
    } catch (e) {
      window.DAG.STATUS = { state: 'error', reason: e && e.message ? e.message : 'The request failed.' };
    }
    paint();
  }

  var obs = new MutationObserver(function () {
    if (window.DAG_APP && typeof window.DAG_APP.onThemeChange === 'function') window.DAG_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
