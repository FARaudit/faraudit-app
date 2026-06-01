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
    if(typeof UPDATES==='undefined'||!Array.isArray(UPDATES))return;

    const mapped=items.map(u=>({
      clause:u.clause||u.far_number||'',
      title:u.title||'',
      date:u.effective_date||u.published_at||'',
      impact:u.impact||u.priority||'MEDIUM',
      summary:u.summary||u.description||'',
      insight:u.insight||u.ai_insight||'',
      source:u.source||'FAR',
      link:u.link||u.url||'',
      affects_clauses:u.affects_clauses||[]
    }));

    UPDATES.length=0;
    UPDATES.push(...mapped);
    if(typeof renderList==='function')renderList();
  }
  document.readyState==='loading'
    ?document.addEventListener('DOMContentLoaded',wire)
    :wire();
})();
