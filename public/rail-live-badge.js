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
   exists. Guarded by public/_rail-live-badge.test.ts. */
(function () {
  'use strict';

  // state: 'live' | 'unavailable' | 'unknown'
  //   live        → green "Live" pill
  //   unavailable → amber "Feed down" pill (an outage is a FACT worth showing)
  //   unknown     → no pill at all; never leave a stale claim standing
  window.setRailLiveBadge = function setRailLiveBadge(state, opts) {
    try {
      var link = document.querySelector('.sb-icon[href="/opportunities"]');
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
      el.setAttribute(
        'title',
        live
          ? 'SAM.gov feed answered' + (count !== null ? ' · ' + count + ' notice' + (count === 1 ? '' : 's') : '')
          : 'SAM.gov feed did not answer — nothing shown is sample data'
      );
    } catch (e) {
      console.error('[rail-live-badge] failed:', e);
    }
  };
})();
