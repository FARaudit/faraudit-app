(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/defense-news',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const articles=d.articles||d.items||d.news||[];
    if(!articles.length)return;
    if(typeof MOCK_ARTICLES==='undefined')return;

    const mapped=articles.map((a,i)=>({
      id:'live-'+i,
      title:a.title||'',
      description:a.ai_summary||a.summary||'',
      url:a.url||a.link||'#',
      sourceName:a.source||a.feed||'Defense News',
      publishedAt:a.published_at||a.pubDate||new Date().toISOString(),
      category:a.category||'defense',
      imageUrl:a.imageUrl||a.image||null,
      tags:a.tags||[],
      insight:a.ai_insight||a.recommendation||''
    }));

    MOCK_ARTICLES.length=0;
    MOCK_ARTICLES.push(...mapped);

    if(typeof renderTopCards==='function')renderTopCards();
    if(typeof renderStoryFeed==='function')renderStoryFeed();
    if(typeof renderSidebar==='function')renderSidebar();
  }
  document.readyState==='loading'
    ?document.addEventListener('DOMContentLoaded',wire)
    :wire();
})();
