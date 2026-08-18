/* FARaudit · Defense Spending — live wiring.

   Fetches /api/defense-spending, installs the payload on window.DSB, hands
   control to DSB_APP. No fallback dataset, no seeded state: until the fetch
   settles the page is 'loading' and renders nothing. */
(function () {
  'use strict';

  /* TWO RENDERERS, ONE PAYLOAD. /defense-spending mounts DSB_APP; /who-to-call
     mounts WTC_APP. Each is asked independently and each is optional, so a page
     carrying one is not required to carry the other and neither can be silently
     skipped by a page that loads it. */
  function paint() {
    if (window.DSB_APP && typeof window.DSB_APP.render === 'function') window.DSB_APP.render();
    if (window.WTC_APP && typeof window.WTC_APP.render === 'function') window.WTC_APP.render();
  }

  /* THE CONTRACTING OFFICERS BEHIND A RECOMPETE ROW.
     Fetched SEPARATELY and AFTER the panels are already on screen: it calls a
     live SAM feed, and putting that upstream in front of the whole tab would
     make every panel wait on the slowest thing here. A failure costs the officer
     names and nothing else.

     ⛔ THREE STATES, NOT TWO. 'loading' and 'unwired' are not 'no officer at this
     office' — one is a claim about the directory, the others are claims about our
     ability to read it, and a row that showed nothing for all three would be
     saying something false in two of them. */
  function loadOfficers() {
    /* Only a page that renders recompete rows needs this, and the host it looks
       for must name EVERY such page. A guard naming one host stops fetching the
       moment that page is rebuilt around a different one, and the section that
       depends on it then reports an empty directory rather than an unread one —
       which reads as "no officer works here" instead of "we have not looked". */
    if (!document.getElementById('rcList') && !document.getElementById('o4')) return;
    window.DSB.OFFICERS = { state: 'loading', offices: {} };
    fetch('/api/office-officers', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (d) {
        if (!d || d.state !== 'ok') throw new Error((d && d.reason) || 'not ok');
        window.DSB.OFFICERS = { state: 'ok', offices: d.offices || {}, match: d.match || 'exact' };
        paint();
      })
      .catch(function (e) {
        window.DSB.OFFICERS = { state: 'unwired', offices: {},
          reason: (e && e.message) || 'unavailable' };
        paint();
      });
  }

  function unwired(reason) {
    window.DSB.STATUS = { state: 'unwired', reason: reason || '' };
    paint();
  }

  /* ⛔ A FAILED RE-CHECK IS NOT AN ABSENCE OF DATA. Once a record is on screen,
     a later fetch that does not complete must leave it standing. A record that
     is merely un-rechecked is still a real read, and it is the only copy this
     browser holds. So `unwired()` is reachable on the FIRST load only; a refresh
     that does not complete records why and repaints, and the page states that it
     could not re-check rather than that there is nothing to show. */
  function checkFailed(reason) {
    window.DSB.FRESHNESS = {
      checkedAt: window.DSB.FRESHNESS ? window.DSB.FRESHNESS.checkedAt : null,
      state: 'failed',
      reason: reason || 'The feed could not be re-checked.'
    };
    paint();
  }

  async function wire(isRefresh) {
    /* THE TWO CLOCKS ARE DIFFERENT FACTS AND ARE NEVER CONFLATED. `as_of` is
       when USAspending was MEASURED by the nightly worker; `checkedAt` is when
       this browser last asked. A successful re-check against unchanged upstream
       data moves the second and must not move the first — reporting "updated
       just now" over a measurement twenty hours old is the staleness this is
       meant to prevent, wearing a fresh timestamp. */
    const fail = isRefresh ? checkFailed : unwired;
    try {
      const res = await fetch('/api/defense-spending', { credentials: 'include' });
      const data = await res.json().catch(function () { return null; });

      if (!res.ok) {
        fail((data && data.reason) || 'Spending data could not be loaded (HTTP ' + res.status + ').');
        return;
      }
      if (!data || data.state !== 'ok') {
        fail((data && data.reason) || '');
        return;
      }

      window.DSB.FYS = Array.isArray(data.FYS) ? data.FYS : [];
      window.DSB.BY_FY = data.BY_FY || {};
      // `open` comes across with the series it belongs to. Defaulted to [] and
      // never to a fabricated run of false: an unlabelled open year is the one
      // way this panel can report a collapse that has not happened.
      window.DSB.MARKET_TREND = data.MARKET_TREND || { labels: [], series: {}, open: [] };
      window.DSB.RECOMPETES = Array.isArray(data.RECOMPETES) ? data.RECOMPETES : [];
      // NULL column and empty array are different answers. Without this line the
      // panel would read a never-measured market as a quiet one — and its empty
      // state makes a claim about the market. Default FALSE: an absent field is
      // not evidence the worker ran.
      window.DSB.RECOMPETES_MEASURED = data.RECOMPETES_MEASURED === true;
      // Award-level views (size distribution · prime subcontracting targets ·
      // seasonality). One mapper line per payload field — a field added to the
      // route and not copied here ships the panel EMPTY with every gate green.
      window.DSB.AWARD_ANALYTICS = data.AWARD_ANALYTICS || {};
      window.DSB.BUYING_OFFICES = data.BUYING_OFFICES || {};
      window.DSB.SB_SHARE = Array.isArray(data.SB_SHARE) ? data.SB_SHARE : [];
      window.DSB.CONCENTRATION = Array.isArray(data.CONCENTRATION) ? data.CONCENTRATION : [];
      window.DSB.SB_WINNERS = Array.isArray(data.SB_WINNERS) ? data.SB_WINNERS : [];
      window.DSB.AGENCY_FILTERS = Array.isArray(data.AGENCY_FILTERS) ? data.AGENCY_FILTERS : [{ key: 'all', label: 'All' }];
      window.DSB.coverage = data.coverage || null;
      window.DSB.as_of = data.as_of || null;
      window.DSB.window_note = data.window_note || '';
      window.DSB.unsupported = Array.isArray(data.unsupported) ? data.unsupported : [];
      /* Which unit each money branch is in. This file copies ONE FIELD AT A TIME,
         so a payload field with no line here reaches the browser and stops — the
         manifest would have sat on the wire, unreadable by the only code that
         needs it. Default {} rather than null: a reader asking units.BY_FY of an
         older payload gets undefined, not a crash. */
      window.DSB.units = data.units || {};

      // A payload with no fiscal years is not a dashboard with nothing in it —
      // it is a read that produced nothing, and it says so.
      if (window.DSB.FYS.length === 0) {
        fail('Federal spending returned no fiscal years for your codes.');
        return;
      }

      window.DSB.STATUS = { state: 'ok', reason: '' };
      window.DSB.FRESHNESS = { checkedAt: Date.now(), state: 'ok', reason: '' };
      paint();
      loadOfficers();
    } catch (e) {
      console.error('[defense-spending-live] wire failed:', e);
      fail('Spending data could not be loaded.');
    }
  }

  /* ── KEEPING IT LIVE ─────────────────────────────────────────────────────
     The underlying record is rebuilt nightly, so the window in which a reader
     can be looking at yesterday's answer is a whole day wide. Three things
     close it, and none of them asks the reader to know they should reload:

       · a periodic re-check while the tab is open,
       · a re-check when the tab is brought back to the front, which is the one
         moment a reader would notice staleness, and
       · the stamp repainting on its own — "checked 2m ago" frozen at 2m for an
         hour is a worse lie than printing no stamp at all.

     Hidden tabs are skipped: a background tab polling all night costs the
     customer's battery to refresh something nobody is reading. */
  var REFRESH_MS = 5 * 60 * 1000;
  var STAMP_MS = 30 * 1000;
  var refreshing = false;

  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    /* ⛔ REPAINT AFTER THE FLAG CLEARS, NOT ONLY INSIDE THE FETCH. wire() paints
       while `refreshing` is still true, so that paint renders the in-progress
       wording. Without a second paint here the strip stays on "checking now…"
       after the attempt has finished — and on a FAILED check that is the worst
       possible resting state, since it reports work still happening instead of
       a check that did not complete. */
    try { await wire(true); } finally {
      refreshing = false;
      repaintStamp();
    }
  }

  function repaintStamp() {
    if (document.hidden) return;
    if (window.WTC_APP && typeof window.WTC_APP.paintFreshness === 'function') {
      window.WTC_APP.paintFreshness();
    }
  }

  /* The manual control exists because automatic refresh is invisible: a reader
     who suspects the number is old needs something to press, and pressing it
     must produce a visible answer either way. */
  window.DSB_LIVE = { refresh: refresh, isRefreshing: function () { return refreshing; } };

  const obs = new MutationObserver(function () {
    if (window.DSB_APP && typeof window.DSB_APP.onThemeChange === 'function') window.DSB_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function start() {
    /* ⛔ WRAPPED, NOT PASSED DIRECTLY. addEventListener hands the listener an
       Event, which would arrive as `isRefresh` and make the very first load take
       the refresh path — so a genuinely unreachable feed would report "could not
       re-check" over a page that has never held a record, and the honest-fail
       teardown would never run. */
    wire(false);
    setInterval(refresh, REFRESH_MS);
    setInterval(repaintStamp, STAMP_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      repaintStamp();
      var f = window.DSB.FRESHNESS;
      var last = f && f.checkedAt;
      if (!last || Date.now() - last > REFRESH_MS) refresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
