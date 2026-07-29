/* FARaudit · Today / Command Center — live wiring.
   Fetches /api/command-center-data, mutates window.CC IN PLACE and re-renders
   via cc-app.js.

   The old "no-op unless the response carries ACTIONS/WEEK" gate is GONE. That
   gate was the fabrication bug: the endpoint never returned those fields, so
   this file always bailed and cc-app.js's curated mock — invented pursuits,
   dollar figures, two named contracting officers — rendered as the signed-in
   user's own data. cc-app.js now ships empty and honest; this file fills in
   whatever the API genuinely returns. Guarded by
   public/_today-fabrication.test.ts.

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

  // Whole days until the soonest FUTURE response deadline among live rows.
  // null when the feed is absent/empty or nothing carries a future deadline —
  // the caller renders an em dash for null, never 0 (0 means "today").
  function nextDeadlineDays(opps) {
    if (!Array.isArray(opps) || opps.length === 0) return null;
    const now = Date.now();
    let soonest = null;
    for (const o of opps) {
      if (!o || !o.response_deadline) continue;
      const ms = new Date(o.response_deadline).getTime();
      if (isNaN(ms) || ms < now) continue;
      if (soonest === null || ms < soonest) soonest = ms;
    }
    if (soonest === null) return null;
    return Math.max(0, Math.ceil((soonest - now) / 86400000));
  }

  // Distinct NAICS actually present in the feed — replaces a hardcoded code
  // list in the header. null when unknown, so the header says nothing.
  function feedNaics(opps) {
    if (!Array.isArray(opps) || opps.length === 0) return null;
    const set = new Set();
    for (const o of opps) if (o && o.naics_code) set.add(String(o.naics_code));
    return set.size ? Array.from(set).sort() : null;
  }

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

      // Scalars the endpoint already computes — consumed by the KPI strip,
      // insight bar, header stats and identity block. Absent field → undefined
      // → the render layer prints an em dash, never a zero.
      window.CC.LIVE = {
        user:                  data.user || null,
        liveCount:             data.liveCount,
        deadlineSoon:          data.deadlineSoon,
        auditsThisMonth:       data.auditsThisMonth,
        pipelineTotal:         data.pipelineTotal,
        pipelineWeightedValue: data.pipelineWeightedValue,
        auditTotal:            data.auditTotal,
        pipelineAtRisk:        data.pipelineAtRisk,
        agencyCount:           data.agencyCount,
        // Both derived from the SAME live rows /opportunities renders — not
        // asserted here. null when no row carries a future deadline.
        nextDeadlineDays:      nextDeadlineDays(data.opportunities),
        feedNaics:             feedNaics(data.opportunities)
      };

      // ACTIONS/WEEK stay empty until fetchCommandCenterDigest ships. If a
      // future response carries them, they render for real.
      replaceArr('ACTIONS', data.ACTIONS);
      replaceArr('WEEK',    data.WEEK);
      replaceObj('DESK',    data.DESK);

      if (window.CC_APP && typeof window.CC_APP.render === 'function') {
        window.CC_APP.render();
      }
    } catch (e) {
      console.error('[command-center-live] wire failed:', e);
      // Distinguish OUTAGE from not-yet-loaded: without this the insight bar
      // would sit on "Loading your desks…" forever after a failed fetch.
      if (window.CC) {
        window.CC.LIVE = null;
        window.CC.FEED_ERROR = true;
        if (window.CC_APP && typeof window.CC_APP.render === 'function') {
          window.CC_APP.render();
        }
      }
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
