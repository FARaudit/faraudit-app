(function(){async function wire(){
    let d;
    try{
      const r=await fetch('/api/agencies',{credentials:'include'});
      if(!r.ok){
        const r2=await fetch('/api/agencies',{credentials:'include'});
        if(!r2.ok)return;
        d=await r2.json();
      } else { d=await r.json(); }
    }catch(e){return;}
    const agencies=d.agencies||d.stats||d.data||d.items||[];
    if(!agencies.length)return;

    const list=document.querySelector('.agency-list,.agencies-list,.feed-list');
    if(!list)return;

    list.innerHTML=agencies.slice(0,30).map(a=>`
      <div class="agency-row">
        <div class="agency-name">${a.agency||a.name||''}</div>
        <div class="agency-meta">
          ${a.active_solicitations!=null?`<span class="agency-active">${a.active_solicitations} active</span>`:''}
          ${a.total_awards!=null?`<span class="agency-awards">${a.total_awards} awards</span>`:''}
          ${a.avg_award_value?`<span class="agency-value">Avg $${(a.avg_award_value/1e6).toFixed(1)}M</span>`:''}
        </div>
      </div>`).join('');

    const cnt=document.querySelector('.agency-count,.agencies-count,.total-count');
    if(cnt)cnt.textContent=agencies.length+' agencies';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
