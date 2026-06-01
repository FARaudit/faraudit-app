(function(){
  async function wire(){
    let d;
    try{
      const r=await fetch('/api/labor-rates',{credentials:'include'});
      if(!r.ok)return;
      d=await r.json();
    }catch(e){return;}
    if(!d||!d.rates||!d.rates.length)return;

    const tbody=document.querySelector('.rates-table tbody, .rate-rows, .wage-list, table tbody');
    if(!tbody)return;

    tbody.innerHTML=d.rates.map(r=>`
      <tr>
        <td class="rate-category">${r.category||''}</td>
        <td class="rate-group">${r.category_group||''}</td>
        <td class="rate-low">${r.rate_low?'$'+Number(r.rate_low).toFixed(2):'-'}</td>
        <td class="rate-median">${r.rate_median?'$'+Number(r.rate_median).toFixed(2):'-'}</td>
        <td class="rate-high">${r.rate_high?'$'+Number(r.rate_high).toFixed(2):'-'}</td>
        <td class="rate-source">${r.source||''}</td>
      </tr>`).join('');

    const cnt=document.querySelector('.rate-count,.rates-count,.total-count');
    if(cnt)cnt.textContent=d.rates.length+' rates';
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',wire):wire();
})();
