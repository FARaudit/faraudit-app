(function(){if(!new URLSearchParams(location.search).has("live"))return;
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/protest-intel',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const protests=d.protests||d.items||d.data||[];
    if(!protests.length)return;

    const feed=document.querySelector('.protest-list,.protests-feed,.feed-list,.gao-list');
    if(!feed)return;

    feed.innerHTML=protests.slice(0,20).map(p=>`
      <div class="protest-row">
        <div class="protest-meta">
          <span class="protest-docket">${p.docket_number||p.id||''}</span>
          <span class="protest-date">${p.decision_date||p.filed_date||p.published_at||''}</span>
          <span class="protest-outcome ${p.outcome?.toLowerCase()==='sustained'?'sustained':p.outcome?.toLowerCase()==='denied'?'denied':''}">${p.outcome||''}</span>
        </div>
        <div class="protest-title">${p.title||p.case_name||''}</div>
        <div class="protest-agency">${p.agency||''}</div>
        ${p.summary?`<div class="protest-summary">${p.summary.slice(0,200)}</div>`:''}
        ${p.url?`<a class="protest-link" href="${p.url}" target="_blank">View decision →</a>`:''}
      </div>`).join('');

    const cnt=document.querySelector('.protest-count,.total-count');
    if(cnt)cnt.textContent=protests.length+' protests';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
