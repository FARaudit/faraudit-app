(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/regulatory-updates',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const items=d.items||d.updates||d.data||[];
    if(!items.length)return;

    const feed=document.querySelector('.updates-list,.updates-feed,.far-list,.reg-list,.feed-list');
    if(!feed)return;

    feed.innerHTML=items.slice(0,30).map(i=>`
      <div class="update-row">
        <div class="update-meta">
          <span class="update-source">${i.source||''}</span>
          <span class="update-clause">${i.clause||''}</span>
          <span class="update-date">${i.effective_date||i.published_at||''}</span>
        </div>
        <div class="update-title">${i.title||''}</div>
        <div class="update-summary">${(i.summary||'').slice(0,200)}</div>
        ${i.link?`<a class="update-link" href="${i.link}" target="_blank">View →</a>`:''}
      </div>`).join('');

    const cnt=document.querySelector('.updates-count,.reg-count,.total-count');
    if(cnt)cnt.textContent=items.length+' updates';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
