(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/defense-spending',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const spending=d.spending||d.data||d.items||[];
    if(!spending.length)return;

    const list=document.querySelector('.spending-list,.spending-feed,.feed-list,.awards-list');
    if(!list)return;

    list.innerHTML=spending.slice(0,30).map(s=>`
      <div class="spending-row">
        <div class="spending-agency">${s.agency||s.awarding_agency||''}</div>
        <div class="spending-meta">
          <span class="spending-amount">${s.total_amount||s.amount?'$'+(Number(s.total_amount||s.amount)/1e6).toFixed(1)+'M':''}</span>
          <span class="spending-naics">${s.naics_code||s.naics||''}</span>
          <span class="spending-date">${s.period||s.award_date||s.fiscal_year||''}</span>
        </div>
        ${s.description||s.title?`<div class="spending-desc">${(s.description||s.title||'').slice(0,120)}</div>`:''}
      </div>`).join('');

    const cnt=document.querySelector('.spending-count,.awards-count,.total-count');
    if(cnt)cnt.textContent=spending.length+' awards';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
