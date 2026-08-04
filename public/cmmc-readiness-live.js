/* FARaudit · CMMC Readiness — live wiring.

   Fetches /api/cmmc-readiness and installs the result on window.CMMC, then
   renders. There is no fallback dataset: a failure sets state 'error' and the
   page says so, because "the audits could not be read" and "no solicitation
   you audited requires CMMC" are different facts and must not look alike. */
(function () {
  'use strict';

  function apply(next) {
    const d = next.distribution || {};
    window.CMMC.DISTRIBUTION = {
      '0': d['0'] || 0, '1': d['1'] || 0, '2': d['2'] || 0, '3': d['3'] || 0
    };
    const b = next.by_level || {};
    window.CMMC.BY_LEVEL = {
      '1': Array.isArray(b['1']) ? b['1'] : [],
      '2': Array.isArray(b['2']) ? b['2'] : [],
      '3': Array.isArray(b['3']) ? b['3'] : []
    };
    window.CMMC.REFERENCE = next.reference && typeof next.reference === 'object' ? next.reference : {};
    const flagged = window.CMMC.DISTRIBUTION['1'] + window.CMMC.DISTRIBUTION['2'] + window.CMMC.DISTRIBUTION['3'];
    const m = next.meta || {};
    window.CMMC.meta = {
      state: flagged > 0 ? 'ready' : 'empty',
      reason: m.reason || (next.total_audited ? 'none-flagged' : 'no-audits'),
      totalAudited: typeof next.total_audited === 'number' ? next.total_audited : 0,
      unanalyzed: typeof next.unanalyzed === 'number' ? next.unanalyzed : 0
    };
  }

  function fail(detail) {
    window.CMMC.DISTRIBUTION = { '0': 0, '1': 0, '2': 0, '3': 0 };
    window.CMMC.BY_LEVEL = { '1': [], '2': [], '3': [] };
    window.CMMC.meta = { state: 'error', reason: 'fetch-failed', detail: detail || null, totalAudited: 0, unanalyzed: 0 };
  }

  function paint() {
    if (window.CMMC_APP && typeof window.CMMC_APP.render === 'function') window.CMMC_APP.render();
  }

  async function wire() {
    try {
      const res = await fetch('/api/cmmc-readiness', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.distribution) {
        fail(res.status === 401 ? 'Session expired' : 'HTTP ' + res.status);
      } else {
        apply(data);
      }
    } catch (e) {
      fail(e && e.message ? e.message : null);
    }
    paint();
  }

  const obs = new MutationObserver(() => {
    if (window.CMMC_APP && typeof window.CMMC_APP.onThemeChange === 'function') window.CMMC_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
