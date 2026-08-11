/* FARaudit · Defense News — live wiring.
   Fetches /api/defense-news (real RSS aggregation across Defense News,
   DoD News, Federal Register, FedScoop — cached 30min + Claude per-article
   ai_insight via defense_news_insights). Maps items into the LIVE_ARTICLES
   global declared in defense-news.html.

   The HTML renders LIVE_ARTICLES and nothing else: an unreachable feed shows a
   stated notice, never sample stories.

   Targets LIVE_ARTICLES per the HTML contract, and is loaded by
   defense-news.html via its own <script> tag. */
(function () {
  'use strict';

  function mapItem(it, i) {
    return {
      id:           'live-' + i,
      title:        it.title || '',
      description:  it.summary || '',
      url:          it.link || it.url || '#',
      sourceName:   it.source || 'Defense News',
      publishedAt:  it.pub_date || it.published_at || new Date().toISOString(),
      category:     it.tag || 'defense',
      urlToImage:   it.image || it.imageUrl || null,
      tags:         Array.isArray(it.tags) ? it.tags : [],
      aiInsight:    it.ai_insight || '',
      /* How much this story bears on the reader's own codes, 0-100. NULL means
         nothing judged it, which is kept distinct from 0 — judged and found
         irrelevant. A `|| 0` here would erase that difference.
         Not to be confused with the route's `relevance`, which is a fixed
         sentence per category and is a string. */
      deskScore:    (typeof it.desk_relevance === 'number') ? it.desk_relevance : null,
      deskCode:     it.desk_code || '',
      deskTitle:    it.desk_code_title || '',
      deskTerms:    Array.isArray(it.desk_terms) ? it.desk_terms : [],
      /* The tab this story files under, and who is buying. Both null when nothing
         judged the story — the tab strip and the chip each handle that on their
         own rather than inventing a bucket. */
      domain:       it.domain || null,
      agency:       it.agency || null
    };
  }

  /* The green LIVE pill is a claim about THIS page's data, so only a settled fetch
     may turn it on. Every failure path here funnels through renderUnavailable(),
     which turns it back off. Gated by test/public/_rail-live-badge.test.ts Part L. */
  function setLivePill(on) {
    var pill = document.getElementById('livePill');
    if (pill) pill.hidden = !on;
  }

  /* ── The freshness stamp ──
     The age of the fetch that produced what is currently on screen, ticking on its
     own. It is blank when there is nothing on screen: a stamp over an unavailable
     feed would be timing the failure. */
  var DN_FETCHED_AT = null;
  function paintUpdated() {
    var el = document.getElementById('dn-updated');
    if (!el) return;
    if (!DN_FETCHED_AT) { el.textContent = ''; return; }
    var secs = Math.max(0, Math.round((Date.now() - DN_FETCHED_AT) / 1000));
    var mins = Math.floor(secs / 60);
    var hrs = Math.floor(mins / 60);
    el.textContent = 'Updated '
      + (secs < 60 ? 'just now' : hrs >= 1 ? hrs + 'h ago' : mins + 'm ago');
  }

  function repaint() {
    if (typeof renderSidebar === 'function')   renderSidebar();
    // The nav and the divider both COUNT desk-relevant stories, so they are stale
    // the moment the article list is replaced and must repaint with it.
    if (typeof renderNav === 'function')          renderNav();
    if (typeof renderSectionLabel === 'function') renderSectionLabel();
    if (typeof renderLead === 'function')      renderLead();
    if (typeof renderGrid === 'function')      renderGrid();
    // DN_INTEL is the intel panel's export; the renderers are IIFE-scoped.
    if (typeof window.DN_INTEL === 'function') window.DN_INTEL();
    // Start the hang watchdog on whatever this pass put on the page.
    if (typeof dnWatchImages === 'function')   dnWatchImages();
  }

  /* A banner in place of the lead story, because an unreachable source and a quiet
     news day both arrive as an empty array and only one of them is a story. Built
     with textContent so a reason echoed from the route cannot inject markup. */
  function renderUnavailable(reason) {
    setLivePill(false);
    DN_FETCHED_AT = null;
    paintUpdated();
    if (typeof LIVE_ARTICLES !== 'undefined' && Array.isArray(LIVE_ARTICLES)) LIVE_ARTICLES.length = 0;
    repaint();
    var el = document.getElementById('dn-lead');
    if (!el) return;
    var d = document.createElement('div');
    d.className = 'dn-unavailable';
    d.setAttribute('role', 'status');
    d.style.cssText = 'padding:14px 16px;border:1px solid var(--line-2);border-radius:8px;font-size:12px;color:var(--mute)';
    d.textContent = reason;
    el.replaceChildren(d);
  }

  async function wire() {
    try {
      const res = await fetch('/api/defense-news', { credentials: 'include' });
      if (!res.ok) {
        var why = 'Defense news is unavailable right now (HTTP ' + res.status + ').';
        try { const b = await res.json(); if (b && b.error) why = String(b.error); } catch (_) { /* body not JSON */ }
        renderUnavailable(why);
        return;
      }
      const data = await res.json();
      const items = Array.isArray(data.items)    ? data.items
                  : Array.isArray(data.articles) ? data.articles
                  : Array.isArray(data.news)     ? data.news
                  : [];

      // The route reports which feeds answered. Every one failing is an outage, not
      // a slow news day, even though both arrive here as [].
      if (Array.isArray(data.sources) && data.sources.length) {
        var dead = data.sources.filter(function (s) { return !s.ok; });
        if (dead.length === data.sources.length) {
          renderUnavailable('None of the ' + data.sources.length + ' news sources responded. Nothing is shown rather than showing stale or sample stories.');
          return;
        }
      }
      if (!items.length) {
        renderUnavailable('No stories published in this window.');
        return;
      }
      if (typeof LIVE_ARTICLES === 'undefined' || !Array.isArray(LIVE_ARTICLES)) return;

      // What the page is allowed to claim about tailoring. Three distinct states,
      // three distinct sentences: no codes on file, codes on file with nothing
      // scoring them, and codes with a real count behind them.
      window.DN_DESK = (data.desk && typeof data.desk === 'object') ? data.desk : null;
      // Which feeds answered, and with how many items. The sidebar states these
      // rather than a fixed list, so a source that stops returning anything shows
      // as a zero instead of continuing to claim coverage.
      window.DN_SOURCES = Array.isArray(data.sources) ? data.sources : [];
      // The window the route actually applied, so the volume panel frames itself
      // on the real span instead of a number typed into the chart.
      window.DN_FRESHNESS = (data.freshness && typeof data.freshness === 'object') ? data.freshness : null;
      var vt = document.getElementById('dn-vol-title');
      if (vt && window.DN_FRESHNESS) {
        vt.textContent = 'Stories on this page · last ' + window.DN_FRESHNESS.window_days + ' days';
      }
      window.DN_NAICS = Array.isArray(data.naics) ? data.naics : [];
      window.DN_NAICS_SOURCE = data.naics_source || '';

      var sub = document.getElementById('dn-subline');
      if (sub) {
        if (!window.DN_NAICS.length) {
          sub.textContent = 'Defense, acquisition and regulatory reporting · no NAICS codes on file — '
            + 'add them to your capability statement and every story below gets scored against them.';
        } else if (!window.DN_DESK || !window.DN_DESK.available) {
          sub.textContent = 'Defense, acquisition and regulatory reporting · your codes on file: '
            + window.DN_NAICS.join(' · ') + ' · desk scoring is not running on this deployment.';
        } else {
          sub.textContent = 'Defense, acquisition and regulatory reporting · scored against your codes: '
            + window.DN_NAICS.join(' · ');
        }
      }

      const mapped = items.map(mapItem);
      LIVE_ARTICLES.length = 0;
      LIVE_ARTICLES.push.apply(LIVE_ARTICLES, mapped);
      DN_FETCHED_AT = data.fetched_at ? new Date(data.fetched_at).getTime() : Date.now();
      if (!isFinite(DN_FETCHED_AT)) DN_FETCHED_AT = Date.now();
      paintUpdated();
      repaint();
      setLivePill(mapped.length > 0);
    } catch (e) {
      console.error('[defense-news-live] wire failed:', e);
      renderUnavailable('Defense news could not be loaded.');
    }
  }

  /* Recent contract actions in the customer's codes, from USAspending. Its own
     fetch: the news feed and the award feed fail independently, and one being
     down must not blank the other. */
  async function wireAwards() {
    try {
      const res = await fetch('/api/defense-awards', { credentials: 'include' });
      const data = await res.json().catch(function () { return null; });
      if (!res.ok || !data || !Array.isArray(data.awards)) {
        window.DN_AWARDS = [];
        window.DN_AWARDS_STATE = 'error';
      } else {
        window.DN_AWARDS = data.awards;
        window.DN_AWARDS_STATE = (data.meta && data.meta.reason) || 'ready';
      }
    } catch (e) {
      window.DN_AWARDS = [];
      window.DN_AWARDS_STATE = 'error';
    }
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderTicker === 'function') renderTicker();
  }

  /* ── Staying live ──
     The LIVE pill is a claim about what is on screen right now, so the page
     re-fetches on a timer and whenever the tab is brought back to the front —
     which is when a reader is actually looking at it.

     Five minutes sits under the route's own 30-minute upstream cache, so most
     refreshes cost a cache hit rather than eight RSS fetches, and judged insights
     are stored per desk — a refresh that finds no new stories does no model work
     at all. */
  var REFRESH_MS = 5 * 60 * 1000;
  var STAMP_MS = 30 * 1000;
  var refreshing = false;

  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try { await wire(); await wireAwards(); } finally { refreshing = false; }
  }

  function start() {
    wire(); wireAwards();
    setInterval(refresh, REFRESH_MS);
    // The stamp has to move on its own, or "Updated 2m ago" stays 2m ago for an
    // hour and is a worse lie than no stamp.
    setInterval(paintUpdated, STAMP_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      paintUpdated();
      // Coming back to a tab that has been hidden long enough for the content to
      // have moved on is the one moment a reader will notice staleness.
      if (DN_FETCHED_AT && Date.now() - DN_FETCHED_AT > REFRESH_MS) refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
