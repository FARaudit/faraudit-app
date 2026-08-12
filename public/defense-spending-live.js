/* FARaudit · Defense Spending — live wiring.

   Fetches /api/defense-spending, installs the payload on window.DSB, hands
   control to DSB_APP. No fallback dataset, no seeded state: until the fetch
   settles the page is 'loading' and renders nothing. */
(function () {
  'use strict';

  function paint() {
    if (window.DSB_APP && typeof window.DSB_APP.render === 'function') window.DSB_APP.render();
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
    // Only the page that renders recompete rows needs this.
    if (!document.getElementById('rcList')) return;
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

  async function wire() {
    try {
      const res = await fetch('/api/defense-spending', { credentials: 'include' });
      const data = await res.json().catch(function () { return null; });

      if (!res.ok) {
        unwired((data && data.reason) || 'Spending data could not be loaded (HTTP ' + res.status + ').');
        return;
      }
      if (!data || data.state !== 'ok') {
        unwired((data && data.reason) || '');
        return;
      }

      window.DSB.FYS = Array.isArray(data.FYS) ? data.FYS : [];
      window.DSB.BY_FY = data.BY_FY || {};
      window.DSB.MARKET_TREND = data.MARKET_TREND || { labels: [], series: {} };
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
        unwired('Federal spending returned no fiscal years for your codes.');
        return;
      }

      window.DSB.STATUS = { state: 'ok', reason: '' };
      paint();
      loadOfficers();
    } catch (e) {
      console.error('[defense-spending-live] wire failed:', e);
      unwired('Spending data could not be loaded.');
    }
  }

  const obs = new MutationObserver(function () {
    if (window.DSB_APP && typeof window.DSB_APP.onThemeChange === 'function') window.DSB_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
