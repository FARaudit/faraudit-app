(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/command-center-data',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    if(!d||!d.opportunities||!d.opportunities.length)return;

    const feed=document.querySelector('.feed-list,.opp-list,.opportunities-list');
    if(!feed)return;

    const sc=s=>s>=80?'s-hi':s>=50?'s-mid':'s-lo';
    const tl=dl=>{
      if(!dl)return'';
      const h=Math.round((new Date(dl)-Date.now())/36e5);
      return h<0?'expired':h<24?h+'h left':Math.round(h/24)+'d left';
    };
    const fv=v=>{
      if(!v)return'';
      return v>=1e6?'$'+(v/1e6).toFixed(1)+'M':'$'+(v/1e3).toFixed(0)+'K';
    };

    feed.innerHTML=d.opportunities.map(o=>`
      <div class="row${o.risk_level==='HIGH'?' urgent':''}">
        <div class="score ${sc(o.compliance_score||0)}">
          <div class="v">${o.compliance_score||'--'}</div>
          <div class="l">Score</div>
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="row-id">${o.solicitation_number||o.notice_id||''}</span>
            <span class="row-title">${(o.title||'Untitled').slice(0,80)}</span>
          </div>
          <div class="row-meta">
            <span class="badge doc">${o.document_type||'RFQ'}</span>
            ${o.naics_code?`<span class="badge naics">NAICS ${o.naics_code}</span>`:''}
            ${o.set_aside?`<span class="badge setaside">${o.set_aside}</span>`:''}
          </div>
          <div class="row-agency one-line">
            <span class="agency-name">${o.agency||''}</span>
          </div>
          ${o.recommendation?`<div class="insight win">${o.recommendation.slice(0,140)}</div>`:''}
        </div>
        <div class="row-right">
          <span class="deadline ${o.risk_level==='HIGH'?'crit':'warn'}">${tl(o.response_deadline)}</span>
          <span class="row-value">${fv(o.award_ceiling)}</span>
        </div>
      </div>`).join('');

    const cnt=document.querySelector('.feed-head h2 .count,.opp-count,.total-count');
    if(cnt)cnt.textContent=d.opportunities.length+' of '+d.liveCount;
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
