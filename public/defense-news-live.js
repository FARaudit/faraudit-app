/* FARaudit · Defense News — Fork B live wiring.
   Fetches /api/defense-news (real RSS aggregation across Defense News,
   DoD News, Federal Register, FedScoop — cached 30min + Claude per-article
   ai_insight via defense_news_insights). Maps items into the LIVE_ARTICLES
   global declared in defense-news.html.

   The HTML's mergeArticles() uses LIVE_ARTICLES when length >= 4, else
   falls back to MOCK_ARTICLES — so this script enhances when live data
   is rich enough and stays out of the way when it isn't.

   Bug C fix: previous version mutated MOCK_ARTICLES; should target
   LIVE_ARTICLES per the HTML contract.

   Bug fix: previous version was never loaded by defense-news.html — added
   <script> tag in this commit. */
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

  async function wire() {
    try {
      const res = await fetch('/api/defense-news', { credentials: 'include' });
      if (!res.ok) throw new Error('defense-news fetch failed: ' + res.status);
      const data = await res.json();
      const items = Array.isArray(data.items)    ? data.items
                  : Array.isArray(data.articles) ? data.articles
                  : Array.isArray(data.news)     ? data.news
                  : [];
      if (!items.length) return;
      if (typeof LIVE_ARTICLES === 'undefined' || !Array.isArray(LIVE_ARTICLES)) return;

      const mapped = items.map(mapItem);
      LIVE_ARTICLES.length = 0;
      LIVE_ARTICLES.push(...mapped);

      // Re-render whatever the page has wired (mergeArticles() in defense-news.html
      // re-runs each render call and now picks up LIVE_ARTICLES since length >= 4).
      if (typeof renderTopCards === 'function') renderTopCards();
      if (typeof renderStoryFeed === 'function') renderStoryFeed();
      if (typeof renderSidebar === 'function')   renderSidebar();
      if (typeof renderLead === 'function')      renderLead();
      if (typeof renderGrid === 'function')      renderGrid();
      if (typeof renderIntel === 'function')     renderIntel();
      if (typeof renderVolume === 'function')    renderVolume();
    } catch (e) {
      console.error('[defense-news-live] wire failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
