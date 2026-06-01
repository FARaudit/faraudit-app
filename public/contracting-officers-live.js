(function(){if(!new URLSearchParams(location.search).has("live"))return;
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/ko-intelligence',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const kos=d.kos||d.officers||d.data||d.items||[];
    if(!kos.length)return;

    const list=document.querySelector('.ko-list,.officers-list,.feed-list,.co-list');
    if(!list)return;

    list.innerHTML=kos.slice(0,30).map(k=>`
      <div class="ko-row">
        <div class="ko-name">${k.name||k.full_name||''}</div>
        <div class="ko-meta">
          <span class="ko-agency">${k.agency||''}</span>
          <span class="ko-email">${k.email||''}</span>
          <span class="ko-phone">${k.phone||''}</span>
        </div>
        ${k.active_solicitations?`<span class="ko-active">${k.active_solicitations} active</span>`:''}
        ${k.responsiveness_score?`<span class="ko-score">Score: ${k.responsiveness_score}</span>`:''}
      </div>`).join('');

    const cnt=document.querySelector('.ko-count,.officers-count,.total-count');
    if(cnt)cnt.textContent=kos.length+' contracting officers';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
