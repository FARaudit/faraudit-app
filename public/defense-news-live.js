(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/defense-news',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const articles=d.articles||d.items||d.news||d.data||[];
    if(!articles.length)return;

    const feed=document.querySelector('.news-feed,.news-list,.articles-list,.feed-list');
    if(!feed)return;

    feed.innerHTML=articles.slice(0,20).map(a=>`
      <div class="news-card">
        <div class="news-meta">
          <span class="news-source">${a.source||a.feed||''}</span>
          <span class="news-date">${a.published_at||a.pubDate||''}</span>
        </div>
        <div class="news-title">${a.title||''}</div>
        ${a.ai_summary||a.summary?`<div class="news-summary">${(a.ai_summary||a.summary||'').slice(0,200)}</div>`:''}
        ${a.url||a.link?`<a class="news-link" href="${a.url||a.link}" target="_blank">Read →</a>`:''}
      </div>`).join('');

    const cnt=document.querySelector('.news-count,.articles-count');
    if(cnt)cnt.textContent=articles.length+' articles';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
