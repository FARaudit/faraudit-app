/* FARaudit · CMMC Readiness — Fork B live wiring.
   Fetches /api/cmmc-readiness (shared route — also serves home/HomeClient.tsx
   for per-user CMMC summary). Mutates window.CMMC IN PLACE if response is
   in DOMAINS shape, else no-op (mock preserved).

   TODO: NET NEW DOMAIN — needs new cmmc_assessments table (per-user POAM
   with 14 NIST 800-171 domain rows: total/met/gap/none/priority/insight).
   Until that ships, the API returns level-distribution (Level 1/2/3) and
   this live.js bails, leaving the client mock visible. */
(function () {
  'use strict';

  function replaceArr(name, next) {
    if (!Array.isArray(next)) return;
    const arr = window.CMMC[name];
    if (!Array.isArray(arr)) { window.CMMC[name] = next.slice(); return; }
    arr.length = 0;
    arr.push(...next);
  }

  function replaceObj(name, next) {
    if (!next || typeof next !== 'object') return;
    const cur = window.CMMC[name];
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, next);
    } else {
      window.CMMC[name] = next;
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/cmmc-readiness', { credentials: 'include' });
      if (!res.ok) throw new Error('cmmc-readiness fetch failed: ' + res.status);
      const data = await res.json();

      if (data._source === 'unwired-mock-preserved') return;
      // Legacy level-distribution shape — bail until cmmc_assessments ships.
      if (!Array.isArray(data.DOMAINS)) return;

      if (!window.CMMC) return;

      replaceArr('DOMAINS',    data.DOMAINS);
      replaceArr('PRIORITIES', data.PRIORITIES);
      replaceArr('TIMELINE',   data.TIMELINE);
      replaceObj('PRIO_META',  data.PRIO_META);
      if (typeof data.DEADLINE === 'string') window.CMMC.DEADLINE = data.DEADLINE;

      if (window.CMMC_APP && typeof window.CMMC_APP.render === 'function') {
        window.CMMC_APP.render();
      }
    } catch (e) {
      console.error('[cmmc-readiness-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.CMMC_APP && typeof window.CMMC_APP.onThemeChange === 'function') {
      window.CMMC_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
