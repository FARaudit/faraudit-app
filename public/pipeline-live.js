(function(){async function wire(){
    let d;
    try{
      const r=await fetch('/api/pipeline',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const items=d.pipeline||d.items||d.data||[];
    if(!items.length)return;

    const stages=['tracking','bidding','submitted','awarded','lost'];
    stages.forEach(stage=>{
      const col=document.querySelector(`.pipeline-col[data-stage="${stage}"] .pipeline-cards,
        .col-${stage} .cards,.stage-${stage} .cards`);
      if(!col)return;
      const stageItems=items.filter(i=>i.stage===stage||(i.status||'').toLowerCase()===stage);
      col.innerHTML=stageItems.map(i=>`
        <div class="pipeline-card">
          <div class="card-title">${(i.title||i.solicitation_title||'').slice(0,60)}</div>
          <div class="card-meta">
            <span class="card-value">${i.award_ceiling?'$'+(i.award_ceiling/1e6).toFixed(1)+'M':''}</span>
            <span class="card-deadline">${i.response_deadline?new Date(i.response_deadline).toLocaleDateString():''}</span>
          </div>
        </div>`).join('');
      const cnt=col.closest('.pipeline-col,.pipeline-stage')?.querySelector('.col-count,.stage-count');
      if(cnt)cnt.textContent=stageItems.length;
    });
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
