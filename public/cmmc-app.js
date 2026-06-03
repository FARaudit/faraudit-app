/* FARaudit · CMMC Readiness (best-in-class) — render + radar + gauge */
(function () {
  const D = window.CMMC;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const scoreColor = (p) => p >= 80 ? css('--green-600') : p >= 50 ? css('--amber-600') : css('--red-600');

  const S = { prio: 'all', q: '', sort: 'Priority', sel: 'CM' };

  const totals = () => {
    const ctl = D.DOMAINS.reduce((a, d) => a + d.total, 0);
    const met = D.DOMAINS.reduce((a, d) => a + d.met, 0);
    return { ctl, met, open: ctl - met, score: Math.round(met / ctl * 100) };
  };
  const daysToDeadline = () => Math.max(0, Math.round((new Date(D.DEADLINE) - new Date()) / 864e5));

  function buildControls() {
    $('prioFilters').innerHTML = D.PRIORITIES.map(p => `<button class="fpill ${p.key === S.prio ? 'active' : ''}" data-prio="${p.key}">${p.label}</button>`).join('');
    $('prioFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.prio = b.dataset.prio; sync(); renderAll(); });
    $('sortSeg').innerHTML = ['Priority', 'Score ↑', 'Score ↓'].map(s => `<button data-sort="${s}" class="${s === S.sort ? 'active' : ''}">${s}</button>`).join('');
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; syncSort(); renderDomains(); });
    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.prio = 'all'; S.q = ''; S.sort = 'Priority'; $('searchInput').value = ''; sync(); syncSort(); renderAll(); };
  }
  function sync() { $('prioFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.prio === S.prio)); }
  function syncSort() { $('sortSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort)); }

  function filtered() {
    return D.DOMAINS.filter(d => {
      if (S.prio === 'MET') { if (d.pct !== 100) return false; }
      else if (S.prio !== 'all' && d.priority !== S.prio) return false;
      if (S.q && !(d.code + ' ' + d.name + ' ' + d.insight).toLowerCase().includes(S.q)) return false;
      return true;
    });
  }

  function renderKPIs() {
    const t = totals();
    const high = D.DOMAINS.filter(d => d.priority === 'HIGH').length;
    const full = D.DOMAINS.filter(d => d.pct === 100).length;
    const cards = [
      { lbl: 'Readiness Score', val: t.score, unit: '%', foot: t.met + ' of ' + t.ctl + ' controls met', tone: t.score >= 80 ? 'green' : t.score >= 60 ? 'amber' : 'red' },
      { lbl: 'Open Controls', val: t.open, unit: '', foot: 'gaps to close', tone: 'amber' },
      { lbl: 'High-Priority Domains', val: high, unit: '', foot: 'C3PAOs flag these first', tone: 'red' },
      { lbl: 'Domains at 100%', val: full + '/' + D.DOMAINS.length, unit: '', foot: 'fully compliant families', tone: 'blue' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsScore').textContent = t.score;
    $('hsGaps').textContent = t.open;
    $('hsDays').textContent = daysToDeadline();
  }

  /* radar chart of domain pct */
  function renderRadar() {
    const svg = d3.select('#radarSvg'); svg.selectAll('*').remove();
    const node = $('radarSvg'); if (!node) return;
    const W = node.clientWidth || 520, H = 340, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 38;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = D.DOMAINS, n = data.length;
    const ang = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;
    // rings
    [25, 50, 75, 100].forEach(p => {
      const rr = R * p / 100;
      svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rr).attr('fill', 'none').attr('stroke', css('--line-2')).attr('stroke-width', 1);
    });
    // spokes + labels
    data.forEach((d, i) => {
      const a = ang(i), x2 = cx + Math.cos(a) * R, y2 = cy + Math.sin(a) * R;
      svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', x2).attr('y2', y2).attr('stroke', css('--line-2')).attr('stroke-width', 1);
      const lx = cx + Math.cos(a) * (R + 16), ly = cy + Math.sin(a) * (R + 16);
      svg.append('text').attr('x', lx).attr('y', ly + 3).attr('text-anchor', Math.abs(Math.cos(a)) < 0.3 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end'))
        .attr('font-family', 'IBM Plex Mono').attr('font-size', 9.5).attr('font-weight', 700)
        .attr('fill', S.sel === d.code ? scoreColor(d.pct) : css('--mute')).text(d.code);
    });
    // polygon
    const pts = data.map((d, i) => { const a = ang(i), rr = R * d.pct / 100; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
    const path = 'M' + pts.map(p => p.join(',')).join('L') + 'Z';
    const grad = svg.append('defs').append('radialGradient').attr('id', 'radg');
    grad.append('stop').attr('offset', '0%').attr('stop-color', css('--accent')).attr('stop-opacity', .35);
    grad.append('stop').attr('offset', '100%').attr('stop-color', css('--accent')).attr('stop-opacity', .12);
    svg.append('path').attr('d', path).attr('fill', 'url(#radg)').attr('stroke', css('--accent')).attr('stroke-width', 2);
    // dots
    data.forEach((d, i) => {
      svg.append('circle').attr('cx', pts[i][0]).attr('cy', pts[i][1]).attr('r', S.sel === d.code ? 6 : 4)
        .attr('fill', scoreColor(d.pct)).attr('stroke', css('--card')).attr('stroke-width', 1.5).style('cursor', 'pointer')
        .on('click', () => { S.sel = d.code; renderAll(); })
        .on('mousemove', (ev) => { const tip = $('coTip'); tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12px;margin-bottom:2px">${d.code} · ${d.name}</div><div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1">${d.pct}% · ${d.met}/${d.total} met</div>`; tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 200) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; })
        .on('mouseleave', () => $('coTip').style.display = 'none');
    });
    $('radarLegend').innerHTML = `<span class="lg"><i style="background:${css('--green-600')}"></i>≥80%</span><span class="lg"><i style="background:${css('--amber-600')}"></i>50–79%</span><span class="lg"><i style="background:${css('--red-600')}"></i>&lt;50%</span>`;
  }

  /* readiness gauge ring + domain detail */
  function gaugeRing(score) {
    const sz = 132, r = 56, c = 2 * Math.PI * r, off = c * (1 - score / 100), col = scoreColor(score);
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><g transform="rotate(-90 ${sz/2} ${sz/2})">
      <circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="11"/>
      <circle cx="${sz/2}" cy="${sz/2}" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></g></svg>`;
  }
  function renderPanel() {
    const t = totals(), d = D.DOMAINS.find(x => x.code === S.sel);
    const el = $('readyPanel');
    const lvl = t.score >= 88 ? 'Assessment-ready' : t.score >= 70 ? 'On track' : 'Significant gaps';
    el.innerHTML = `
      <div class="gauge-wrap">
        <div class="gauge">${gaugeRing(t.score)}<div class="gauge-num"><span style="color:${scoreColor(t.score)}">${t.score}<small>%</small></span><em>READY</em></div></div>
        <div class="gauge-side">
          <div class="gauge-lvl" style="color:${scoreColor(t.score)}">${lvl}</div>
          <div class="gauge-sub">${t.met} of ${t.ctl} controls met · <b>${t.open} open</b></div>
          <div class="gauge-dl">CMMC Phase 2 enforces in <b>${daysToDeadline()} days</b></div>
        </div>
      </div>
      <div class="cop-metrics" style="grid-template-columns:repeat(3,1fr)">
        <div class="cop-m"><span class="mv" style="color:${css('--green-600')}">${D.DOMAINS.filter(x=>x.pct===100).length}</span><span class="ml">Domains met</span></div>
        <div class="cop-m"><span class="mv" style="color:${css('--amber-600')}">${D.DOMAINS.reduce((a,x)=>a+x.gap,0)}</span><span class="ml">Partial gaps</span></div>
        <div class="cop-m"><span class="mv" style="color:${css('--red-600')}">${D.DOMAINS.reduce((a,x)=>a+x.none,0)}</span><span class="ml">Not started</span></div>
      </div>
      <div class="ctrl-bar-wrap"><div class="ctrl-bar-head">110 controls · path to certification</div><div class="ctrl-bar"><div class="cb-seg met" style="width:${t.met/t.ctl*100}%"></div><div class="cb-seg gap" style="width:${D.DOMAINS.reduce((a,x)=>a+x.gap,0)/t.ctl*100}%"></div><div class="cb-seg none" style="width:${D.DOMAINS.reduce((a,x)=>a+x.none,0)/t.ctl*100}%"></div></div><div class="ctrl-bar-key"><span><i class="met"></i>${t.met} met</span><span><i class="gap"></i>${D.DOMAINS.reduce((a,x)=>a+x.gap,0)} in progress</span><span><i class="none"></i>${D.DOMAINS.reduce((a,x)=>a+x.none,0)} not started</span></div></div>
      ${d ? `<div class="cop-note" style="border-bottom:1px solid var(--line-2)"><b>${d.code} · ${d.name} — ${d.pct}%</b>${d.met} met · ${d.gap} gap · ${d.none} not started · ${d.total} controls</div>
      <div class="cop-note"><b>⚡ Why it matters</b>${d.insight}</div>` : ''}
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>Generate SSP</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>Find C3PAO</button>
      </div>`;
  }

  function renderDomains() {
    let data = filtered().slice();
    if (S.sort === 'Priority') data.sort((a, b) => D.PRIO_META[b.priority].rank - D.PRIO_META[a.priority].rank || a.pct - b.pct);
    else if (S.sort === 'Score ↑') data.sort((a, b) => a.pct - b.pct);
    else data.sort((a, b) => b.pct - a.pct);
    $('feedCount').innerHTML = `${data.length} domains · click any card to inspect`;
    $('domList').innerHTML = data.map(d => {
      const pm = D.PRIO_META[d.priority], col = scoreColor(d.pct);
      return `<div class="dom-card feed-card${S.sel === d.code ? ' sel' : ''}" data-code="${d.code}" style="border-left-color:${col}">
        <div class="feed-top"><span class="dom-badge">${d.code}</span><span class="feed-clause" style="font-weight:700">${d.name}</span><span class="dom-pct" style="color:${col}">${d.pct}%</span><span class="feed-imp" style="color:${pm.color};background:${hexA(pm.color,.12)};margin-left:auto">${pm.label}</span></div>
        <div class="dom-meta">${d.met} met · <span style="color:var(--amber-700)">${d.gap} gap</span> · <span style="color:var(--red-600)">${d.none} not started</span> · ${d.total} controls</div>
        <div class="dom-bar"><i style="width:${d.pct}%;background:${col}"></i></div>
        <div class="feed-insight"><b>⚡ Why it matters</b>${d.insight}</div>
      </div>`;
    }).join('') || `<div class="tl-empty">No domains match your filters.</div>`;
    $('domList').querySelectorAll('.dom-card').forEach(c => c.onclick = () => { S.sel = c.dataset.code; renderRadar(); renderPanel(); renderDomains(); });
  }

  function renderC3() {
    const total = D.TIMELINE.reduce((a, s) => a + s.days, 0);
    $('c3Sub').textContent = `Estimated ${total} days to certification`;
    const maxD = Math.max(...D.TIMELINE.map(s => s.days));
    $('c3List').innerHTML = `<div class="c3-track">` + D.TIMELINE.map((s, i) => `
      <div class="c3-step">
        <div class="c3-node">${i + 1}</div>
        <div class="c3-body"><div class="c3-name">${s.name}</div><div class="c3-note">${s.note}</div><div class="c3-bar"><i style="width:${s.days / maxD * 100}%"></i></div><div class="c3-days">${s.days} days</div></div>
      </div>`).join('') + `</div><div class="c3-total">Total estimated path: <b>${total} days</b> · finish before the ${daysToDeadline()}-day deadline</div>`;
  }

  function renderGaps() {
    const gaps = D.DOMAINS.filter(d => d.priority === 'HIGH' || (d.priority === 'MEDIUM' && d.pct < 70)).sort((a, b) => a.pct - b.pct).slice(0, 5);
    $('gapList').innerHTML = gaps.map(d => {
      const pm = D.PRIO_META[d.priority];
      return `<div class="gap-row" data-code="${d.code}"><div class="gap-l"><span class="gap-badge" style="background:${hexA(pm.color,.14)};color:${pm.color}">${d.code}</span><div class="gap-info"><div class="gap-name">${d.name}</div><div class="gap-fix">${d.insight}</div></div></div><span class="gap-pct" style="color:${scoreColor(d.pct)}">${d.pct}%</span></div>`;
    }).join('');
    $('gapList').querySelectorAll('.gap-row').forEach(r => r.onclick = () => { S.sel = r.dataset.code; renderRadar(); renderPanel(); renderDomains(); });
  }

  function renderInsight() {
    const d = D.DOMAINS.find(x => x.code === S.sel), t = totals();
    let html;
    if (d && d.priority === 'HIGH') html = `<span class="ib-label">Priority gap</span><b>${d.code} · ${d.name}</b> sits at <b>${d.pct}%</b> — ${d.insight}`;
    else html = `<span class="ib-label">Read</span>You're at <b>${t.score}% readiness</b> with <b>${t.open} controls open</b>. CMMC Phase 2 enforces in <b>${daysToDeadline()} days</b> — close the HIGH-priority domains (CM, CA, SC) first.`;
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderRadar(); renderPanel(); renderDomains(); renderC3(); renderGaps(); renderInsight(); }
  function onThemeChange() { renderAll(); }
  function init() { buildControls(); renderAll(); let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderRadar, 200); }); }
  window.CMMC_APP = { onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
