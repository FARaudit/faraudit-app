/* FARaudit · Contracting Officers — live wiring.

   Fetches /api/ko-intelligence and installs the result on window.DCO, then
   renders. There is no fallback dataset: a failure sets state 'error' and the
   page says so, because "the feed did not answer" and "you have no officers"
   are different facts and must not look alike. */
(function () {
  'use strict';

  function apply(next) {
    window.DCO.OFFICERS = Array.isArray(next.OFFICERS) ? next.OFFICERS : [];
    window.DCO.AGENCY_FILTERS = Array.isArray(next.AGENCY_FILTERS) ? next.AGENCY_FILTERS : ['all'];
    const m = next.meta || {};
    window.DCO.meta = {
      state: window.DCO.OFFICERS.length > 0 ? 'ready' : 'empty',
      reason: m.reason || null,
      source: m.source || null,
      noticeCount: typeof m.notice_count === 'number' ? m.notice_count : 0,
      windowDays: typeof m.window_days === 'number' ? m.window_days : null
    };
  }

  function fail(detail) {
    window.DCO.OFFICERS = [];
    window.DCO.AGENCY_FILTERS = ['all'];
    window.DCO.meta = { state: 'error', reason: 'fetch-failed', detail: detail || null, noticeCount: 0, windowDays: null };
  }

  function paint() {
    if (window.DCO_APP && typeof window.DCO_APP.render === 'function') window.DCO_APP.render();
  }

  async function wire() {
    try {
      const res = await fetch('/api/ko-intelligence', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.OFFICERS)) {
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
    if (window.DCO_APP && typeof window.DCO_APP.onThemeChange === 'function') window.DCO_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
