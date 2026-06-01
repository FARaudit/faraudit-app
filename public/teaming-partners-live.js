(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/teaming-partners?naics=336413',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const partners=d.partners||d.entities||d.data||d.items||[];
    if(!partners.length)return;

    const list=document.querySelector('.partners-list,.teaming-list,.feed-list');
    if(!list)return;

    list.innerHTML=partners.slice(0,30).map(p=>`
      <div class="partner-row">
        <div class="partner-name">${p.legal_business_name||p.name||''}</div>
        <div class="partner-meta">
          <span class="partner-cage">${p.cage_code||''}</span>
          <span class="partner-location">${p.city||''}${p.state?', '+p.state:''}</span>
          <span class="partner-size">${p.business_size||p.size||''}</span>
        </div>
        ${p.capabilities?`<div class="partner-caps">${p.capabilities.slice(0,100)}</div>`:''}
      </div>`).join('');

    const cnt=document.querySelector('.partner-count,.partners-count,.total-count');
    if(cnt)cnt.textContent=partners.length+' partners';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
