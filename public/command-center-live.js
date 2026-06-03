/* FARaudit · Today / Command Center — Fork B live wiring.
   Fetches /api/command-center-data (the existing aggregate endpoint that
   already powers the dashboard header counters). When the response carries
   the today-specific fields { ACTIONS, WEEK }, mutates window.CC IN PLACE
   and re-renders via cc-app.js. Otherwise no-op — the curated mock in
   cc-app.js continues to display.

   TODO: new fetchCommandCenterDigest(supabase, userId) query that
   aggregates from existing tables to populate ACTIONS + WEEK:
     ACTIONS — top-1 per desk: opportunities (P0 deadline), regulatory
       (HIGH + close to effective), ko (cold + warm rewarm), wage (FLAG),
       protest (impacts tracked sols), pipeline (closing soon), cmmc (low %)
     WEEK   — calendar union: response_deadlines + WD expirations + reg
       effective dates + protest decision windows + FY fiscal markers

   The 830L command-center-live-brief.js.legacy targets a separate
   `.brief-head`/`.pulse-bar` Brief layout (Phase 6 design) that is NOT
   served by the current /command-center route (which serves today.html).
   The legacy file is left in /public for future Brief-surface reuse but
   not loaded by today.html. */
(function () {
  'use strict';

  function replaceArr(name, next) {
    if (!Array.isArray(next)) return;
    const arr = window.CC[name];
    if (!Array.isArray(arr)) { window.CC[name] = next.slice(); return; }
    arr.length = 0;
    arr.push(...next);
  }

  function replaceObj(name, next) {
    if (!next || typeof next !== 'object') return;
    const cur = window.CC[name];
    if (cur && typeof cur === 'object') {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, next);
    } else {
      window.CC[name] = next;
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/command-center-data', { credentials: 'include' });
      if (!res.ok) throw new Error('command-center-data fetch failed: ' + res.status);
      const data = await res.json();
      if (!window.CC) return;

      // /api/command-center-data does not currently return CC-shape fields.
      // When fetchCommandCenterDigest ships, response will include ACTIONS / WEEK.
      const hasCcShape =
        Array.isArray(data.ACTIONS) || Array.isArray(data.WEEK) ||
        (data.DESK && typeof data.DESK === 'object');
      if (!hasCcShape) return;

      replaceArr('ACTIONS', data.ACTIONS);
      replaceArr('WEEK',    data.WEEK);
      replaceObj('DESK',    data.DESK);

      if (window.CC_APP && typeof window.CC_APP.render === 'function') {
        window.CC_APP.render();
      }
    } catch (e) {
      console.error('[command-center-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.CC_APP && typeof window.CC_APP.onThemeChange === 'function') {
      window.CC_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
