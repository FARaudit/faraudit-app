/* FARaudit · FAR/DFARS Updates (best-in-class) — render + viz + interactions */
(function () {
  const D = window.FARD;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const impColor = (i) => D.IMPACT_META[i].color;
  const fmtDate = (s) => { const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

  const S = { type: 'all', impact: 'all', q: '', sort: 'Newest', sel: D.UPDATES[0].clause };

  function buildControls() {
    $('typeFilters').innerHTML = D.TYPES.map(t => `<button class="fpill ${t.key === S.type ? 'active' : ''}" data-type="${t.key}">${t.label}</button>`).join('');
    $('typeFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.type = b.dataset.type; sync(); renderAll(); });
    $('impactFilters').innerHTML = D.IMPACTS.map(t => `<button class="fpill ${t.key === S.impact ? 'active' : ''}" data-imp="${t.key}">${t.label}</button>`).join('');
    $('impactFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.impact = b.dataset.imp; sync(); renderAll(); });
    $('sortSeg').innerHTML = D.SORTS.map(s => `<button data-sort="${s}" class="${s === S.sort ? 'active' : ''}">${s}</button>`).join('');
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; syncSort(); renderFeed(); });
    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.type = 'all'; S.impact = 'all'; S.q = ''; S.sort = 'Newest'; $('searchInput').value = ''; sync(); syncSort(); renderAll(); };
  }
  function sync() {
    $('typeFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.type === S.type));
    $('impactFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.imp === S.impact));
  }
  function syncSort() { $('sortSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort)); }

  function filtered() {
    return D.UPDATES.filter(u => {
      if (S.type !== 'all' && u.type !== S.type) return false;
      if (S.impact !== 'all' && u.impact !== S.impact) return false;
      if (S.q && !(u.clause + ' ' + u.title + ' ' + u.summary).toLowerCase().includes(S.q)) return false;
      return true;
    });
  }

  function renderKPIs() {
    const f = filtered();
    const high = f.filter(u => u.impact === 'HIGH').length;
    const soon = D.EFFECTIVE.filter(e => e.days <= 30).length;
    const affected = D.AFFECTED.length;
    const cards = [
      { lbl: 'Updates in View', val: f.length, unit: '', foot: 'matching your filters', tone: 'blue' },
      { lbl: 'High Impact', val: high, unit: '', foot: 'act before bidding', tone: 'red' },
      { lbl: 'Effective ≤ 30 Days', val: soon, unit: '', foot: 'enforcement imminent', tone: 'amber' },
      { lbl: 'Affected Contracts', val: affected, unit: '', foot: 'active sols touched', tone: 'purple' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsTotal').textContent = D.UPDATES.length;
    $('hsHigh').textContent = D.UPDATES.filter(u => u.impact === 'HIGH').length;
    $('hsSoon').textContent = D.EFFECTIVE.filter(e => e.days <= 30).length;
  }

  /* timeline: x = date, y-jitter by impact band, dot size = affects */
  function renderTimeline() {
    const svg = d3.select('#timelineSvg'); svg.selectAll('*').remove();
    const node = $('timelineSvg'); if (!node) return;
    const W = node.clientWidth || 660, H = 300, m = { t: 18, r: 20, b: 30, l: 64 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = filtered();
    const dates = D.UPDATES.map(u => new Date(u.date));
    const x = d3.scaleTime().domain([d3.min(dates), d3.max(dates)]).range([m.l, W - m.r]).nice();
    const bands = ['HIGH', 'MEDIUM', 'LOW'];
    const y = d3.scalePoint().domain(bands).range([m.t + 14, H - m.b - 10]).padding(0.5);
    const r = d3.scaleSqrt().domain([1, 7]).range([5, 16]);
    // band rows
    bands.forEach(b => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(b)).attr('y2', y(b)).attr('stroke', css('--line-2')).attr('stroke-width', 1);
      svg.append('text').attr('x', m.l - 10).attr('y', y(b) + 3).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 9).attr('font-weight', 700).attr('fill', impColor(b)).text(D.IMPACT_META[b].label);
    });
    // x axis ticks (months)
    x.ticks(5).forEach(t => {
      svg.append('text').attr('x', x(t)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 9).attr('fill', css('--mute')).text(t.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    });
    // dots
    svg.selectAll('circle.tld').data(data, d => d.clause).join('circle')
      .attr('class', d => 'tld' + (S.sel === d.clause ? ' sel' : '') + (S.sel && S.sel !== d.clause ? ' dim' : ''))
      .attr('cx', d => x(new Date(d.date))).attr('cy', d => y(d.impact)).attr('r', d => r(d.affects))
      .attr('fill', d => D.TYPE_COLOR[d.type]).attr('opacity', .7).attr('stroke', d => D.TYPE_COLOR[d.type]).attr('stroke-width', .6)
      .style('cursor', 'pointer')
      .on('click', (ev, d) => { S.sel = d.clause; renderAll(); })
      .on('mousemove', (ev, d) => {
        const tip = $('coTip');
        tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12px;margin-bottom:3px">${d.clause}</div><div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">${d.title} · ${d.type}<br>${fmtDate(d.date)} · ${d.affects} affected</div>`;
        tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 220) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      }).on('mouseleave', () => $('coTip').style.display = 'none');
    $('timelineLegend').innerHTML = Object.entries(D.TYPE_COLOR).map(([k, c]) => `<span class="lg"><i style="background:${c}"></i>${k}</span>`).join('') + `<span class="lg" style="color:var(--mute-2)">○ size = contracts affected</span>`;
  }

  function renderPanel() {
    const u = D.UPDATES.find(x => x.clause === S.sel);
    const el = $('rulePanel');
    if (!u) { el.innerHTML = `<div class="cop-empty"><div class="t">Select a clause</div></div>`; return; }
    const im = D.IMPACT_META[u.impact], tc = D.TYPE_COLOR[u.type];
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${tc},${shade(tc)})"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:24px;height:24px"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
        <div class="cop-id"><div class="cop-name">${u.clause}</div><div class="cop-title">${u.title}</div><span class="cop-agy">${u.type}</span></div>
        <span class="cop-rel" style="background:${hexA(im.color,.13)};color:${im.color}"><i style="background:${im.color}"></i>${im.label}</span>
      </div>
      <div class="cop-metrics">
        <div class="cop-m"><span class="mv">${fmtDate(u.date).split(',')[0]}</span><span class="ml">Effective</span></div>
        <div class="cop-m"><span class="mv">${u.affects}</span><span class="ml">Contracts hit</span></div>
        <div class="cop-m"><span class="mv">${u.type}</span><span class="ml">Source</span></div>
      </div>
      <div class="cop-note" style="border-bottom:1px solid var(--line-2)"><b>What changed</b>${u.summary}</div>
      ${u.diff ? `<div class="redline"><div class="redline-head">Clause redline</div><div class="redline-before"><span class="rl-tag">WAS</span>${u.diff.before}</div><div class="redline-after"><span class="rl-tag">NOW</span>${u.diff.after}</div></div>` : ''}
      <div class="cop-note"><b>⚡ Why it matters to you</b>${u.insight}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>Read full text</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Track clause</button>
      </div>`;
  }

  function renderFeed() {
    let data = filtered().slice();
    if (S.sort === 'Newest') data.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    else if (S.sort === 'Impact') data.sort((a, b) => D.IMPACT_META[b.impact].rank - D.IMPACT_META[a.impact].rank || Date.parse(b.date) - Date.parse(a.date));
    else data.sort((a, b) => b.affects - a.affects);
    $('feedCount').innerHTML = `${data.length} updates · click any card to inspect`;
    $('feedList').innerHTML = data.map(u => {
      const im = D.IMPACT_META[u.impact], tc = D.TYPE_COLOR[u.type];
      return `<div class="feed-card${S.sel === u.clause ? ' sel' : ''}" data-clause="${u.clause}" style="border-left-color:${tc}">
        <div class="feed-top"><span class="feed-clause">${u.clause}</span><span class="feed-type" style="color:${tc};background:${hexA(tc,.1)}">${u.type}</span><span class="feed-imp" style="color:${im.color};background:${hexA(im.color,.12)}">${im.label}</span><span class="feed-date">${fmtDate(u.date)}</span></div>
        <div class="feed-title">${u.title}</div>
        <div class="feed-summary">${u.summary}</div>
        <div class="feed-insight"><b>⚡ Why it matters</b>${u.insight}</div>
      </div>`;
    }).join('') || `<div class="tl-empty">No updates match your filters.</div>`;
    $('feedList').querySelectorAll('.feed-card').forEach(c => c.onclick = () => { S.sel = c.dataset.clause; renderTimeline(); renderPanel(); renderFeed(); });
  }

  function renderByType() {
    const f = filtered();
    const counts = {}; D.UPDATES.forEach(u => counts[u.type] = (counts[u.type] || 0) + 1);
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...rows.map(r => r[1]));
    $('bytList').innerHTML = rows.map(([type, n]) => {
      const c = D.TYPE_COLOR[type];
      const active = S.type === type;
      return `<div class="byt-row${active ? ' active' : ''}" data-type="${type}">
        <span class="byt-name"><i style="background:${c}"></i>${type}</span>
        <span class="byt-bar"><i style="width:${n / max * 100}%;background:${c}"></i></span>
        <span class="byt-n">${n}</span></div>`;
    }).join('');
    $('bytList').querySelectorAll('.byt-row').forEach(r => r.onclick = () => { S.type = (S.type === r.dataset.type ? 'all' : r.dataset.type); sync(); renderAll(); });
  }

  function renderEffective() {
    $('effList').innerHTML = D.EFFECTIVE.map(e => {
      const label = e.days === 0 ? 'effective now' : 'in ' + e.days + ' days';
      const cls = e.tone === 'red' ? 'crit' : e.tone === 'amber' ? 'warn' : 'ok';
      return `<div class="eff-row"><div class="eff-info"><div class="eff-name">${e.name}</div><div class="eff-clause">${e.clause}</div></div><span class="eff-count ${cls}">${label}</span></div>`;
    }).join('');
  }

  function renderAffected() {
    $('affList').innerHTML = D.AFFECTED.map(a => {
      const im = D.IMPACT_META[a.impact];
      return `<div class="aff-row2"><div class="aff-info"><div class="aff-sol">${a.sol}</div><div class="aff-cls">${a.clause}</div><div class="aff-action">${a.action}</div></div><span class="aff-badge" style="color:${im.color};background:${hexA(im.color,.12)}">${im.label}</span></div>`;
    }).join('');
  }

  function renderInsight() {
    const u = D.UPDATES.find(x => x.clause === S.sel);
    let html;
    if (u && u.impact === 'HIGH') html = `<span class="ib-label">Priority</span><b>${u.clause} · ${u.title}</b> is high-impact and hits <b>${u.affects} of your contracts</b> — ${u.insight}`;
    else if (u) html = `<span class="ib-label">Focus</span><b>${u.clause}</b> (${u.type}, ${D.IMPACT_META[u.impact].label.toLowerCase()} impact) — ${u.insight}`;
    else html = `<span class="ib-label">Read</span>5 high-impact changes this month. <b>CMMC Level 2</b> goes enforceable in 15 days and touches 7 of your solicitations — start there.`;
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  function shade(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n>>16)&255)*.66)},${Math.round(((n>>8)&255)*.66)},${Math.round((n&255)*.66)})`; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderTimeline(); renderPanel(); renderFeed(); renderByType(); renderEffective(); renderAffected(); renderInsight(); }
  function onThemeChange() { renderAll(); }
  function init() { buildControls(); renderAll(); let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderTimeline, 200); }); }
  window.FAR_APP = { onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
