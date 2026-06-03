/* FARaudit · Defense Agencies — Fork B live wiring.
   Fetches /api/agencies, mutates window.DAG IN PLACE, re-renders.
   When API ships `_source: "unwired-mock-preserved"`, this script is a no-op
   and the client-side mock in dag-data.js continues to display.
   When real DAG shape lands in the API, mutations + render fire normally. */
(function () {
  'use strict';

  function replaceArr(name, next) {
    if (!Array.isArray(next)) return;
    const arr = window.DAG[name];
    if (!Array.isArray(arr)) { window.DAG[name] = next.slice(); return; }
    arr.length = 0;
    arr.push(...next);
  }

  function replaceObj(name, next) {
    if (!next || typeof next !== 'object') return;
    const cur = window.DAG[name];
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, next);
    } else {
      window.DAG[name] = next;
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/agencies', { credentials: 'include' });
      if (!res.ok) throw new Error('agencies fetch failed: ' + res.status);
      const data = await res.json();

      if (data._source === 'unwired-mock-preserved') return;
      if (!window.DAG) return;

      replaceArr('DEPTS',      data.DEPTS);
      replaceArr('SETASIDES',  data.SETASIDES);
      replaceArr('SORTS',      data.SORTS);
      replaceObj('POSTURE',    data.POSTURE);
      replaceObj('FORECAST',   data.FORECAST);
      replaceObj('NAICS_COLORS', data.NAICS_COLORS);

      if (window.DAG_APP && typeof window.DAG_APP.render === 'function') {
        window.DAG_APP.render();
      }
    } catch (e) {
      console.error('[agencies-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.DAG_APP && typeof window.DAG_APP.onThemeChange === 'function') {
      window.DAG_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
