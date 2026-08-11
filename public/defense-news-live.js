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
      relevance:    typeof it.relevance === 'number' ? it.relevance : 0
    };
  }

  /* The green LIVE pill is a claim about THIS page's data, so only a settled fetch
     may turn it on. Every failure path here funnels through renderUnavailable(),
     which turns it back off. Gated by test/public/_rail-live-badge.test.ts Part L. */
  function setLivePill(on) {
    var pill = document.getElementById('livePill');
    if (pill) pill.hidden = !on;
  }

  function repaint() {
    if (typeof renderTopCards === 'function') renderTopCards();
    if (typeof renderStoryFeed === 'function') renderStoryFeed();
    if (typeof renderSidebar === 'function')   renderSidebar();
    if (typeof renderLead === 'function')      renderLead();
    if (typeof renderGrid === 'function')      renderGrid();
    if (typeof renderIntel === 'function')     renderIntel();
    if (typeof renderVolume === 'function')    renderVolume();
    // Start the hang watchdog on whatever this pass put on the page.
    if (typeof dnWatchImages === 'function')   dnWatchImages();
  }

  /* A banner in place of the lead story, because an unreachable source and a quiet
     news day both arrive as an empty array and only one of them is a story. Built
     with textContent so a reason echoed from the route cannot inject markup. */
  function renderUnavailable(reason) {
    setLivePill(false);
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

      const mapped = items.map(mapItem);
      LIVE_ARTICLES.length = 0;
      LIVE_ARTICLES.push.apply(LIVE_ARTICLES, mapped);
      repaint();
      setLivePill(mapped.length > 0);
    } catch (e) {
      console.error('[defense-news-live] wire failed:', e);
      renderUnavailable('Defense news could not be loaded.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
