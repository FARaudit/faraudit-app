(function(){if(!new URLSearchParams(location.search).has("live"))return;
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/cmmc-readiness',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    const levels=d.levels||d.data||d;
    if(!levels)return;

    Object.entries(levels).forEach(([key,val])=>{
      const card=document.querySelector(`.cmmc-level-${key},.level-${key},[data-level="${key}"]`);
      if(!card)return;
      const req=card.querySelector('.req-count,.requirements-count');
      if(req&&val.requirements)req.textContent=val.requirements+' requirements';
      const desc=card.querySelector('.level-desc,.description');
      if(desc&&val.description)desc.textContent=val.description;
    });

    const allReqs=d.requirements||d.controls||[];
    const list=document.querySelector('.requirements-list,.controls-list,.cmmc-list');
    if(list&&allReqs.length){
      list.innerHTML=allReqs.slice(0,50).map(r=>`
        <div class="req-row">
          <span class="req-id">${r.id||r.control_id||''}</span>
          <span class="req-domain">${r.domain||r.family||''}</span>
          <span class="req-title">${r.title||r.name||''}</span>
          <span class="req-level">L${r.level||''}</span>
        </div>`).join('');
    }
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
