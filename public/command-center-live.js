/* FARaudit · Today / Command Center — live wiring.
   Fetches /api/command-center-data, mutates window.CC IN PLACE and re-renders
   via cc-app.js.

   There is no "bail unless the response carries ACTIONS/WEEK" gate: cc-app.js
   ships those arrays empty, and this file fills in whatever the API genuinely
   returns. ACTIONS and SIGNALS both come from the cross-desk digest the route
   computes; a desk absent from it renders as absent, never as quiet.
   Guarded by test/public/_today-fabrication.test.ts. */
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
  // No flat cap here. Near-term notices outnumber later ones, so any flat cap
  // shows week one and nothing else and the panel's own three-group design
  // (This Week / This Month / Later This Year) could never appear. Truncation is
  // therefore PER GROUP, in the render layer where the grouping lives (cc-app.js).
  // This ceiling is only a DOM-size backstop, far above real feed volume.
  var WEEK_MAX_ROWS = 400;
  function buildWeek(rows) {
    var items = Array.isArray(rows) ? rows.slice() : [];
    if (items.length === 0) return { rows: [], dropped: 0 };
    items.sort(function (a, b) { return a.ms - b.ms; });
    var dropped = Math.max(0, items.length - WEEK_MAX_ROWS);
    return { rows: items.slice(0, WEEK_MAX_ROWS), dropped: dropped };
  }

  // Fiscal markers — from the clock, no source to rot. The 30 September obligation
  // deadline is the single most consequential recurring date in federal contracting.
  function buildFiscalWeek() {
    var now = new Date();
    var y = now.getFullYear();
    var out = [];
    var marks = [
      { m: 8, d: 30, tag: 'Fiscal year ends', label: 'FY' + String((y + 1) % 100) + ' obligations close — agencies spend or lose it' },
      { m: 6, d: 1,  tag: 'Q4 begins',        label: 'Q4 obligation surge begins — the busiest quarter for awards' }
    ];
    for (var i = 0; i < marks.length; i++) {
      var mk = marks[i];
      var when = new Date(y, mk.m, mk.d, 12, 0, 0);
      if (when.getTime() < now.getTime()) when = new Date(y + 1, mk.m, mk.d, 12, 0, 0);
      var day = Math.max(0, Math.ceil((when.getTime() - now.getTime()) / 86400000));
      out.push({
        ms: when.getTime(), day: day, gov: true, big: mk.m === 8,
        d: when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        label: mk.label, tag: mk.tag,
        tone: day <= 30 ? 'warn' : 'ok', desk: 'spend'
      });
    }
    return out;
  }

  // GOVERNMENT EVENTS — the second row type the calendar was designed for and never
  // given a feed. wkRow() has always supported `gov` (hollow node, ◆ tag) and `big`;
  // today.html carries the CSS for both. These are dates that are the same for every
  // customer, unlike a response deadline, which is why they render differently.
  // Sourced live from /api/proposed-rules (Federal Register). A comment deadline is
  // the rare government date you can act ON, so it is the `big` one.
  function buildGovWeek(rules) {
    if (!Array.isArray(rules) || rules.length === 0) return [];
    var now = Date.now();
    var out = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r) continue;
      var events = [
        { when: r.comments_close_on, tag: 'Comment closes', big: true },
        { when: r.effective_on,      tag: 'Rule effective', big: false }
      ];
      for (var j = 0; j < events.length; j++) {
        var e = events[j];
        if (!e.when) continue;
        var ms = new Date(e.when + 'T12:00:00Z').getTime();
        if (isNaN(ms) || ms < now) continue;
        var day = Math.max(0, Math.ceil((ms - now) / 86400000));
        out.push({
          ms: ms, day: day, gov: true, big: e.big,
          d: new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          label: cleanLabel(r.title) || 'Federal Register rule',
          tag: e.tag,
          tone: day <= 3 ? 'crit' : day <= 7 ? 'warn' : 'ok',
          desk: 'far'
        });
      }
    }
    return out;
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

  /* The green LIVE pill in the topbar is a claim about THIS page's data, distinct
     from the rail's feed badge above. It ships hidden and only a settled fetch may
     turn it on. Gated by test/public/_rail-live-badge.test.ts Part L. */
  function setLivePill(on) {
    const pill = document.getElementById('livePill');
    if (pill) pill.hidden = !on;
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
        // Did the SAM read ANSWER? An empty window and a failed read are both an
        // empty array downstream, and every notice count here derives from it.
        feedAvailable:         data.feedAvailable !== false && Array.isArray(data.opportunities),
        liveCount:             data.liveCount,
        deadlineSoon:          data.deadlineSoon,
        auditsThisMonth:       data.auditsThisMonth,
        auditRunsThisMonth:    data.auditRunsThisMonth,
        pipelineAvailable:     data.pipelineAvailable !== false,
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
      // Government events ride alongside the notice deadlines in ONE sorted list —
      // the calendar's own design, not a second panel. A failure here must not take
      // the deadlines down with it, so it resolves to [] on its own.
      var govRules = [];
      try {
        var gr = await fetch('/api/proposed-rules', { credentials: 'include' });
        if (gr.ok) { var gj = await gr.json(); govRules = (gj && gj.rules) || []; }
      } catch (e) { govRules = []; }

      // MAJOR EVENTS ONLY. Response deadlines are deliberately NOT here: 177 of them
      // arrive on a rolling window and burying four government dates under them is
      // what made this panel unusable. The deadline list lives on Notices.
      var wk = buildWeek(buildGovWeek(govRules).concat(buildFiscalWeek()));
      window.CC.WEEK_DROPPED = wk.dropped;   // surfaced in the panel, never silent
      window.CC.WEEK_SOURCED = true;
      if (!Array.isArray(data.WEEK)) replaceArr('WEEK', wk.rows);

      // CROSS-DESK DIGEST — the one query behind BOTH the Priority Action Feed
      // and the Signals grid. SIGNALS keeps every desk including the ones with
      // nothing to report, because a card that states why it is quiet is the
      // panel's job; ACTIONS keeps only desks that produced a real item, because
      // a feed row is a claim that there is something to act on.
      var digest = Array.isArray(data.deskDigest) ? data.deskDigest : [];
      window.CC.SIGNALS = digest;
      replaceArr('ACTIONS', digest.filter(function (d) { return d && d.status === 'ok'; }).map(function (d) {
        return {
          desk: d.desk, urg: d.urg || 'ok', days: d.days,
          // The feed's value column is narrow and mono — it takes the bare
          // count. The phrase ("12 live notices") goes to Signals, where the
          // card has room for it. Both come from the same digest row.
          title: d.title, why: d.why,
          val: typeof d.count === 'number' ? String(d.count) : ''
        };
      }));

      replaceArr('WEEK',    data.WEEK);
      replaceObj('DESK',    data.DESK);

      // Feed state is now MEASURED — the rail may assert it.
      setRailLiveBadge(Array.isArray(data.opportunities) ? 'live' : 'unavailable',
                       { count: Array.isArray(data.opportunities) ? data.opportunities.length : null });

      if (window.CC_APP && typeof window.CC_APP.render === 'function') {
        window.CC_APP.render();
      }
      setLivePill(true);
    } catch (e) {
      console.error('[command-center-live] wire failed:', e);
      setLivePill(false);
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
        // Same reason as WEEK: ranked desk cards from an earlier successful
        // fetch would sit under a banner saying the data is unavailable. null,
        // not [] — the panels must not read an outage as eight quiet desks.
        replaceArr('ACTIONS', []);
        window.CC.SIGNALS = null;
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
