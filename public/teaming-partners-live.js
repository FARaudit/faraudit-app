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
    if(typeof PARTNERS==='undefined'||!Array.isArray(PARTNERS))return;

    const mapped=partners.map((p,i)=>({
      id:'live-'+i,
      name:p.legal_business_name||p.name||'',
      loc:[(p.city||''),(p.state||'')].filter(Boolean).join(', '),
      naics:p.naics_codes||[p.naics||'336413'],
      certs:p.certifications||p.certs||[p.business_size||'SB'].filter(Boolean),
      agencies:p.agencies||[],
      value:p.past_performance_value||p.total_awards||0,
      insight:p.insight||p.ai_insight||'',
      cage:p.cage_code||'',
      uei:p.uei||p.unique_entity_id||''
    }));

    PARTNERS.length=0;
    PARTNERS.push(...mapped);
    if(typeof renderList==='function')renderList();
  }
  document.readyState==='loading'
    ?document.addEventListener('DOMContentLoaded',wire)
    :wire();
})();
