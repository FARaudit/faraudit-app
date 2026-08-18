/* Rail "Live" badge — written ONLY from measured feed state.

   src/lib/nav/rail.ts used to hardcode badge {text:"Live"} on the
   Opportunities item. The rail is injected into ~10 routes, so every one of
   them asserted the SAM.gov feed was up — including during an outage, and on
   pages that never look at the feed at all. The rail now ships no pill; the
   two pages that genuinely know (public/opportunities-live.js and
   public/command-center-live.js) call window.setRailLiveBadge() after their
   fetch settles.

   Mirrors dashboard-live.js writeSidebarBadge(): the served rail renders no
   pill when it has no real value, and the client creates one where the value
   exists. Guarded by test/public/_rail-live-badge.test.ts. */
(function () {
  'use strict';

  /* IDEMPOTENT. injectRail adds this script to every route that does not already carry
     it, and two pages carry it themselves. Running twice would re-register the setter
     and fire a second probe. */
  if (window.setRailLiveBadge) return;

  /* A PAGE THAT MEASURED ITS OWN FEED OUTRANKS THE SHARED PROBE.
     The pages that query SAM with the customer's own NAICS codes know something
     narrower and better than "SAM is answering": they know whether THIS account's feed
     returned. So the shared probe below fills in only where nothing measured, and a
     later page-measured call always overwrites it. */
  var measured = false;

  // state: 'live' | 'unavailable' | 'unknown'
  //   live        → green "Live" pill
  //   unavailable → amber "Feed down" pill (an outage is a FACT worth showing)
  //   unknown     → no pill at all; never leave a stale claim standing
  window.setRailLiveBadge = function setRailLiveBadge(state, opts) {
    if (!(opts && opts.fromSharedProbe)) measured = true;
    try {
      // Opportunities is a WORKFLOW row, which rail.ts row() renders as .sb-step;
      // only the collapsible-section rows get .sb-icon. Match both, or this
      // returns here and no badge — live OR "Feed down" — can ever render.
      // Gated by test/public/_rail-live-badge.test.ts Part K.
      var link = document.querySelector('.sb-step[href="/notices"], .sb-icon[href="/notices"]');
      if (!link) return;
      var el = link.querySelector('.sb-badge');

      if (state !== 'live' && state !== 'unavailable') {
        if (el) el.remove(); // un-assert: better silent than stale
        return;
      }

      if (!el) {
        el = document.createElement('span');
        var label = link.querySelector('.sb-label');
        if (label && label.nextSibling) link.insertBefore(el, label.nextSibling);
        else link.appendChild(el);
      }

      var live = state === 'live';
      // .live carries the green dot ::before; .danger is the amber/red pill.
      el.className = 'sb-badge ' + (live ? 'live' : 'danger');
      el.textContent = live ? 'Live' : 'Feed down';
      el.style.display = '';
      var count = opts && typeof opts.count === 'number' ? opts.count : null;
      // The tooltip states WHICH question was answered. A shared probe knows only that
      // SAM responded; the feed pages know their own read returned, and how much.
      var shared = !!(opts && opts.fromSharedProbe);
      el.setAttribute(
        'title',
        live
          ? (shared
              ? 'SAM.gov answered a request from this site just now'
              : 'SAM.gov feed answered' + (count !== null ? ' · ' + count + ' notice' + (count === 1 ? '' : 's') : ''))
          : (shared
              ? 'SAM.gov did not answer'
              : 'SAM.gov feed did not answer — nothing shown is sample data')
      );
    } catch (e) {
      console.error('[rail-live-badge] failed:', e);
    }
  };

  /* THE PILL FOLLOWS EVERY TAB, WITHOUT ANY PAGE PRETENDING TO KNOW.
     The rail is injected into ~10 routes and most of them never touch SAM, so the pill
     used to appear on two pages and vanish on the rest. It now asks one shared,
     server-cached reading (60s TTL upstream, 30s on the response) so a page that cannot
     measure can still report what something else measured.
     Still never a hardcoded claim: the answer is a live read, `unknown` renders nothing,
     and a page that measures its OWN feed overwrites this the moment it settles. */
  function askSharedProbe() {
    if (measured) return; // a real measurement is already on screen
    fetch('/api/sam-feed-state', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        // If the page measured its own feed while this was in flight, that answer stands.
        if (!d || measured) return;
        if (d.state !== 'live' && d.state !== 'unavailable') return;
        window.setRailLiveBadge(d.state, { fromSharedProbe: true });
      })
      .catch(function () { /* no pill rather than a guessed one */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', askSharedProbe);
  } else {
    askSharedProbe();
  }
})();
