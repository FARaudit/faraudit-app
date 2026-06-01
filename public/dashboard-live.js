(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/command-center-data',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}

    const cnt=document.querySelector('.audit-count,.audits-count,.total-count,.past-audits-count');
    if(cnt&&d.auditTotal!=null)cnt.textContent=d.auditTotal+' audits';

    let audits=[];
    try{
      const r2=await fetch('/api/audits?limit=50',{credentials:'include'});
      if(r2.ok){const d2=await r2.json();audits=d2.audits||d2.data||d2.items||[];}
    }catch(e){}

    if(!audits.length)return;
    const list=document.querySelector('.audit-list,.audits-list,.past-audits-list,.feed-list');
    if(!list)return;

    list.innerHTML=audits.map(a=>`
      <div class="audit-row">
        <div class="audit-id">${a.solicitation_number||a.notice_id||a.id||''}</div>
        <div class="audit-title">${(a.title||'').slice(0,80)}</div>
        <div class="audit-meta">
          <span class="audit-date">${a.created_at?new Date(a.created_at).toLocaleDateString():''}</span>
          <span class="audit-traps">${a.trap_count||0} traps</span>
          <span class="audit-score">${a.compliance_score||'--'}</span>
        </div>
      </div>`).join('');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
