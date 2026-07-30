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

  // Safe call — rail-live-badge.js is a separate <script>; if it failed to
  // load, the rail simply keeps no pill (the honest default) instead of this
  // file throwing.
  function setRailLiveBadge(state, opts) {
    if (typeof window.setRailLiveBadge === 'function') window.setRailLiveBadge(state, opts);
  }

  // Week Ahead rows, derived from the SAME live notices /opportunities renders.
  // Only response deadlines are wired: every row here is a real notice with a
  // real date, and the panel claims nothing else. Wage-determination
  // expirations, regulatory effective dates and fiscal markers are NOT sourced
  // yet, so they are simply absent rather than illustrated.
  var WEEK_CAP = 12;
  function buildWeek(opps) {
    if (!Array.isArray(opps) || opps.length === 0) return { rows: [], dropped: 0 };
    var now = Date.now();
    var items = [];
    for (var i = 0; i < opps.length; i++) {
      var o = opps[i];
      if (!o || !o.response_deadline) continue;
      var ms = new Date(o.response_deadline).getTime();
      if (isNaN(ms) || ms < now) continue; // expired rows never enter the feed, but never trust that here
      var day = Math.max(0, Math.ceil((ms - now) / 86400000));
      items.push({
        ms: ms,
        day: day,
        // Formatted from the real timestamp — no month-name literals.
        d: new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        label: cleanLabel(o.title_plain || o.title) || (o.solicitation_number || o.notice_id || 'Untitled notice'),
        tag: 'Response due',
        // Tone from proximity only — nothing here scores the opportunity.
        tone: day <= 3 ? 'crit' : day <= 7 ? 'warn' : 'ok',
        desk: 'opp'
      });
    }
    items.sort(function (a, b) { return a.ms - b.ms; });
    var dropped = Math.max(0, items.length - WEEK_CAP);
    return { rows: items.slice(0, WEEK_CAP), dropped: dropped };
  }

  // Titles arrive SHOUTED and PSC-prefixed from SAM. Trim for the row without
  // altering meaning; an empty result falls back to the identifier.
  function cleanLabel(t) {
    if (!t) return '';
    var s = String(t).replace(/\s+/g, ' ').trim();
    if (s.length > 78) s = s.slice(0, 77).trimEnd() + '…';
    return s;
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

      // Week Ahead: real response deadlines from the live feed. A server-sent
      // WEEK (once the digest ships) wins; otherwise we derive it here.
      var wk = buildWeek(data.opportunities);
      window.CC.WEEK_DROPPED = wk.dropped;   // surfaced in the panel, never silent
      window.CC.WEEK_SOURCED = Array.isArray(data.opportunities);
      if (!Array.isArray(data.WEEK)) replaceArr('WEEK', wk.rows);

      // ACTIONS stays empty until fetchCommandCenterDigest ships. If a future
      // response carries it, it renders for real.
      replaceArr('ACTIONS', data.ACTIONS);
      replaceArr('WEEK',    data.WEEK);
      replaceObj('DESK',    data.DESK);

      // Feed state is now MEASURED — the rail may assert it.
      setRailLiveBadge(Array.isArray(data.opportunities) ? 'live' : 'unavailable',
                       { count: Array.isArray(data.opportunities) ? data.opportunities.length : null });

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
        window.CC.WEEK_SOURCED = false;
        // Drop rows from any EARLIER successful fetch. Leaving them would put
        // dated deadlines on screen underneath a banner saying the data is
        // unavailable — the panel would be contradicting the page.
        replaceArr('WEEK', []);
        window.CC.WEEK_DROPPED = 0;
        setRailLiveBadge('unavailable');
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
