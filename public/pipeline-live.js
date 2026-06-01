(function(){
  const STAGE_LABELS = {
    '01':'Pre-Sol Synopsis','02':'Sources Sought','03':'Solicitation',
    '04':'Proposal Dev','05':'Submission','06':'Evaluation',
    '07':'Award','08':'Post-Award'
  };

  function daysLeft(dateStr){
    if(!dateStr) return null;
    return Math.ceil((new Date(dateStr) - Date.now()) / 864e5);
  }

  function dueBadge(days){
    if(days === null) return '';
    if(days < 0) return '<span class="v crit">expired</span>';
    if(days <= 2) return '<span class="v crit">' + days + 'd left</span>';
    if(days <= 7) return '<span class="v warn">' + days + 'd left</span>';
    return '<span class="v">' + days + 'd left</span>';
  }

  function riskBadge(days){
    if(days === null || days > 7) return '<span class="risk-badge">—</span>';
    if(days <= 2) return '<span class="risk-badge p0">P0</span>';
    return '<span class="risk-badge p1">P1</span>';
  }

  function buildCard(c){
    var days = daysLeft(c.due_date);
    var stageLabel = c.stage + ' · ' + (STAGE_LABELS[c.stage] || c.stage);
    return '<article class="pcard' + (days !== null && days <= 2 ? ' priority-p0' : days !== null && days <= 7 ? ' priority-p1' : '') + '">'
      + '<div class="pcard-head">'
      + '<div>'
      + '<div class="pcard-id">' + (c.solicitation_number || '—') + '</div>'
      + '<h2 class="pcard-title">' + c.title + '</h2>'
      + '<p class="pcard-agency">' + (c.agency || '—') + '</p>'
      + '</div>'
      + riskBadge(days)
      + '</div>'
      + '<div class="pcard-meta">'
      + '<div class="item"><span class="k">Stage</span><span class="v"><span class="stage-pill">' + stageLabel + '</span></span></div>'
      + '<div class="item"><span class="k">Due</span>' + dueBadge(days) + '</div>'
      + (c.estimated_value ? '<div class="item"><span class="k">Ceiling</span><span class="v amount">' + c.estimated_value + '</span></div>' : '')
      + (c.naics ? '<div class="item"><span class="k">NAICS</span><span class="v">' + c.naics + '</span></div>' : '')
      + '</div>'
      + (c.notes ? '<p class="pcard-agency" style="margin-top:8px;font-size:11px;opacity:.65;line-height:1.5">' + c.notes + '</p>' : '')
      + '<div class="pcard-actions"><button class="btn-view">View →</button></div>'
      + '</article>';
  }

  function wirePipeline(){
    fetch('/api/pipeline')
      .then(function(r){ if(!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(function(data){
        var cards = data.pipeline || [];
        if(!cards.length){ console.warn('[pipeline-live] 0 cards returned'); return; }

        var grid = document.querySelector('.cards-grid');
        if(grid) grid.innerHTML = cards.map(buildCard).join('');

        var stageCounts = {};
        cards.forEach(function(c){ stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1; });
        document.querySelectorAll('.stage-cell').forEach(function(btn){
          var s = btn.dataset.stage;
          var numEl = btn.querySelector('.stage-count .num');
          if(numEl) numEl.textContent = stageCounts[s] || 0;
        });

        console.log('[pipeline-live] rendered ' + cards.length + ' cards from /api/pipeline');
      })
      .catch(function(e){ console.warn('[pipeline-live] failed:', e.message); });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wirePipeline);
  } else {
    wirePipeline();
  }
})();

// Stage rail click filter
(function(){
  function attachStageFilter(){
    var allCards = [];
    document.querySelectorAll('.stage-cell').forEach(function(btn){
      btn.addEventListener('click', function(){
        var selected = btn.dataset.stage;
        document.querySelectorAll('.stage-cell').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var grid = document.querySelector('.cards-grid');
        if(!grid) return;
        var cards = grid.querySelectorAll('.pcard');
        if(selected === 'all'){
          cards.forEach(function(c){ c.style.display=''; });
        } else {
          cards.forEach(function(c){
            var pill = c.querySelector('.stage-pill');
            var match = pill && pill.innerText.startsWith(selected);
            c.style.display = match ? '' : 'none';
          });
        }
      });
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', attachStageFilter);
  } else {
    attachStageFilter();
  }
})();
