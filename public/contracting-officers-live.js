/* FARaudit · Contracting Officers — Fork B live wiring.
   Fetches /api/ko-intelligence (shared route — also serves
   audit/[id]/AuditReport for per-email KO lookups), mutates window.DCO
   IN PLACE if response is in DCO shape, else no-op (mock preserved).

   Bug B fix: dropped `?live` URL gate that prevented this from ever
   firing in production.

   TODO: API currently returns flat { kos: [...] } from ko_intelligence
   table. DCO needs OFFICERS array with computed fit/rel/respDays/timeline,
   plus REL_META/KIND_META lookups. Needs new fetchKODetail() query that
   joins ko_intelligence + audits + new ko_interactions table. */
(function () {
  'use strict';

  function replaceArr(name, next) {
    if (!Array.isArray(next)) return;
    const arr = window.DCO[name];
    if (!Array.isArray(arr)) { window.DCO[name] = next.slice(); return; }
    arr.length = 0;
    arr.push(...next);
  }

  function replaceObj(name, next) {
    if (!next || typeof next !== 'object') return;
    const cur = window.DCO[name];
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, next);
    } else {
      window.DCO[name] = next;
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/ko-intelligence', { credentials: 'include' });
      if (!res.ok) throw new Error('ko-intelligence fetch failed: ' + res.status);
      const data = await res.json();

      if (data._source === 'unwired-mock-preserved') return;
      // Legacy shape { kos: [...] } — bail until fetchKODetail ships DCO shape.
      if (!Array.isArray(data.OFFICERS)) return;

      if (!window.DCO) return;

      replaceArr('OFFICERS',        data.OFFICERS);
      replaceArr('AGENCY_FILTERS',  data.AGENCY_FILTERS);
      replaceArr('SAVED_SEGMENTS',  data.SAVED_SEGMENTS);
      replaceObj('REL_META',        data.REL_META);
      replaceObj('KIND_META',       data.KIND_META);
      replaceObj('NAICS_COLORS',    data.NAICS_COLORS);

      if (window.DCO_APP && typeof window.DCO_APP.render === 'function') {
        window.DCO_APP.render();
      }
    } catch (e) {
      console.error('[contracting-officers-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.DCO_APP && typeof window.DCO_APP.onThemeChange === 'function') {
      window.DCO_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
