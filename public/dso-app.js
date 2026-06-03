/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Opportunities (best-in-class) — render + viz + interactions
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const D = window.DSO;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const money = (m) => '$' + (m % 1 === 0 ? m : m.toFixed(1)) + 'M';

  const S = { naics: new Set(D.NAICS.map(n => n.code)), stage: 'all', sa: 'all', q: '', view: null, sort: 'fit', sel: null, tracked: new Set() };

  const fitColor = (f) => f >= 85 ? css('--green-600') : f >= 70 ? css('--accent') : f >= 60 ? css('--amber-600') : css('--red-600');
  const fitTier = (f) => f >= 85 ? 'Strong fit' : f >= 70 ? 'Workable' : 'Stretch';
  const urg = (d) => d <= 3 ? 'crit' : d <= 7 ? 'warn' : 'ok';

  // one-line advisory drawn from existing fields — guidance, not clutter
  function pursuitInsight(o) {
    const newReq = /new requirement|market research/i.test(o.incumbent);
    const rec = /recompete/i.test(o.incumbent);
    const inc = o.incumbent.replace(/\s*\(recompete\)/i, '');
    const upstream = o.stage === 'sources' || o.stage === 'presol';
    const saElig = ['SB', 'SDVOSB', '8(a)', 'HUBZone'].includes(o.sa);
    if (upstream) return `Upstream window — shape the requirement before the RFP drops${saElig ? `, and it's ${o.sa}-eligible` : ''}.`;
    if (newReq) return `<em>No incumbent to unseat</em> — best odds at this ${o.fit} fit${o.days <= 7 ? ', and it closes this week' : ''}.`;
    if (rec) return `Recompete vs <em>${inc}</em> — incumbents win 70–90%, so lead on your ${o.fit} fit and price.`;
    return `${fitTier(o.fit)} at ${o.fit}/100 — ${o.days <= 7 ? 'move now, the window is closing.' : 'time to prep a strong bid.'}`;
  }

  /* ─── controls ─── */
  function buildControls() {
    $('stageSeg').innerHTML = D.STAGES.map(s => `<button data-stage="${s.key}" class="${s.key === S.stage ? 'active' : ''}">${s.label}</button>`).join('');
    $('stageSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.stage = b.dataset.stage; S.view = null; sync(); renderAll(); });

    $('saFilters').innerHTML = D.SETASIDES.map(s => `<button class="fpill ${s === S.sa ? 'active' : ''}" data-sa="${s}">${s === 'all' ? 'All' : s}</button>`).join('');
    $('saFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.sa = b.dataset.sa; S.view = null; sync(); renderAll(); });

    $('savedViews').innerHTML = D.SAVED_VIEWS.map(v =>
      `<button class="view-chip ${v.key === S.view ? 'active' : ''}" data-view="${v.key}"><span class="vc-t">${v.label}</span><span class="vc-d">${v.desc}</span></button>`).join('');
    $('savedViews').querySelectorAll('button').forEach(b => b.onclick = () => { S.view = (S.view === b.dataset.view ? null : b.dataset.view); applyView(); sync(); renderAll(); });

    $('sortSeg').innerHTML = [['fit', 'Best fit'], ['deadline', 'Closing'], ['ceiling', 'Value']].map(s => `<button data-sort="${s[0]}" class="${s[0] === S.sort ? 'active' : ''}">${s[1]}</button>`).join('');
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; $('sortSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderList(); });

    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.naics = new Set(D.NAICS.map(n => n.code)); S.stage = 'all'; S.sa = 'all'; S.q = ''; S.view = null; S.sel = null; $('searchInput').value = ''; sync(); renderAll(); };
  }

  function applyView() {
    // saved views override the discrete filters but keep NAICS
    S.stage = 'all'; S.sa = 'all';
    if (S.view === 'upstream') S.stage = 'sources';
    sync();
  }
  function sync() {
    $('stageSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.stage === S.stage));
    $('saFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sa === S.sa));
    $('savedViews').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  }

  /* ─── filtering ─── */
  function filtered() {
    return D.OPPS.filter(o => {
      if (!S.naics.has(o.naics)) return false;
      if (S.stage !== 'all' && o.stage !== S.stage) return false;
      if (S.sa !== 'all' && o.sa !== S.sa) return false;
      if (S.q && !(o.title + ' ' + o.agency + ' ' + o.id + ' ' + o.office).toLowerCase().includes(S.q)) return false;
      if (S.view === 'hot' && !(o.fit >= 85 && o.days <= 10)) return false;
      if (S.view === 'sb' && !['SB', 'SDVOSB', '8(a)', 'HUBZone'].includes(o.sa)) return false;
      if (S.view === 'recompete' && !/recompete/i.test(o.incumbent)) return false;
      if (S.view === 'upstream' && !(o.stage === 'presol' || o.stage === 'sources')) return false;
      return true;
    });
  }

  /* ─── KPIs ─── */
  function renderKPIs() {
    const f = filtered();
    const ceil = f.reduce((a, o) => a + o.ceiling, 0);
    const closing = f.filter(o => o.days <= 7).length;
    const avgFit = f.length ? Math.round(f.reduce((a, o) => a + o.fit, 0) / f.length) : 0;
    const cards = [
      { lbl: 'Open Pursuits', val: f.length, unit: '', foot: 'matching your filters', tone: 'blue' },
      { lbl: 'Addressable Ceiling', val: '$' + (ceil / 1000).toFixed(2), unit: 'B', foot: 'total value in view', tone: 'green' },
      { lbl: 'Closing ≤ 7 Days', val: closing, unit: '', foot: 'submit windows this week', tone: 'red' },
      { lbl: 'Avg Fit Score', val: avgFit, unit: '/100', foot: 'mean fit across view', tone: 'blue' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}">
      <p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
  }

  /* ─── fit ring ─── */
  function fitRing(f, lg) {
    const r = lg ? 19 : 15, c = 2 * Math.PI * r, off = c * (1 - f / 100), col = fitColor(f);
    const sz = lg ? 46 : 38;
    return `<div class="fit-ring${lg ? ' lg' : ''}"><svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">
      <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="${lg ? 4 : 3.5}"/>
      <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${lg ? 4 : 3.5}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg><span class="fr-num">${f}</span></div>`;
  }

  function fitVerdict(f) {
    if (f >= 85) return { label: 'MATCH', tone: 'green' };
    if (f >= 70) return { label: 'WORKABLE', tone: 'blue' };
    if (f >= 60) return { label: 'STRETCH', tone: 'amber' };
    return { label: 'TRAP', tone: 'red' };
  }
  function fitTile(f) {
    const v = fitVerdict(f);
    return `<div class="fit-tile tone-${v.tone}"><span class="ft-num">${f}</span><span class="ft-lbl">${v.label}</span></div>`;
  }

  /* ─── bubble chart ─── */
  function renderBubble() {
    const svg = d3.select('#bubbleSvg'); svg.selectAll('*').remove();
    const W = $('bubbleSvg').clientWidth || 640, H = 380;
    const m = { t: 22, r: 18, b: 38, l: 52 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = filtered();
    const x = d3.scaleLinear().domain([0, 80]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 35]).range([H - m.b, m.t]);
    const r = d3.scaleSqrt().domain([55, 100]).range([5, 22]);
    const medX = 14, medY = 10;
    // sweet-spot zone (soon + high value)
    svg.append('rect').attr('x', x(0)).attr('y', m.t).attr('width', x(medX) - x(0)).attr('height', y(medY) - m.t).attr('fill', css('--green-500')).attr('opacity', .05);
    svg.append('text').attr('class', 'zone').attr('x', x(1)).attr('y', m.t + 12).attr('fill', css('--green-700')).text('◤ ACT NOW');
    svg.append('line').attr('x1', x(medX)).attr('x2', x(medX)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(medY)).attr('y2', y(medY)).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([0, 14, 30, 45, 60, 75]).tickFormat(d => d + 'd').tickSize(4));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d + 'M').tickSize(4));
    svg.append('text').attr('class', 'axis-title').attr('x', W - m.r).attr('y', H - 6).attr('text-anchor', 'end').text('days to deadline →');
    svg.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -m.t).attr('y', 13).attr('text-anchor', 'end').text('ceiling $ ↑');

    svg.selectAll('circle.bub').data(data, d => d.id).join('circle')
      .attr('class', d => 'bub' + (S.sel === d.id ? ' sel' : ''))
      .attr('cx', d => x(Math.min(78, d.days))).attr('cy', d => y(Math.min(34, d.ceiling)))
      .attr('r', d => r(d.fit)).attr('fill', d => D.STAGE_META[d.stage].color).attr('opacity', .6)
      .attr('stroke', d => D.STAGE_META[d.stage].color).attr('stroke-width', .5)
      .on('mousemove', (ev, d) => {
        const tip = $('bubTip');
        tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12px;margin-bottom:3px;max-width:200px">${d.title}</div>
          <div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">${d.agency} · fit <b style="color:#fff">${d.fit}</b><br>${money(d.ceiling)} ceiling · <b style="color:#fff">${d.days}d</b> left · ${D.STAGE_META[d.stage].label}</div>`;
        tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 230) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      })
      .on('mouseleave', () => $('bubTip').style.display = 'none')
      .on('click', (ev, d) => { S.sel = (S.sel === d.id ? null : d.id); renderBubble(); renderActList(); renderList(); });

    $('bubbleLegend').innerHTML = Object.entries(D.STAGE_META).map(([k, v]) => `<span class="lg"><i style="background:${v.color}"></i>${v.label}</span>`).join('');
  }

  /* ─── act now list ─── */
  function renderActList() {
    const data = filtered().slice().sort((a, b) => (a.days - b.days) || (b.fit - a.fit)).slice(0, 7);
    $('actList').innerHTML = data.length ? data.map(o => {
      const u = urg(o.days);
      return `<div class="act-row${S.sel === o.id ? ' sel' : ''}" data-id="${o.id}">
        ${fitRing(o.fit)}
        <div class="act-info"><div class="act-title">${o.title}</div><div class="act-agy">${o.agency} · ${money(o.ceiling)}</div></div>
        <div class="act-days ${u}">${o.days}d<small>${o.type.toUpperCase()}</small></div>
      </div>`;
    }).join('') : `<div class="empty">No pursuits match your filters.</div>`;
    $('actList').querySelectorAll('.act-row').forEach(r => r.onclick = () => { S.sel = (S.sel === r.dataset.id ? null : r.dataset.id); renderBubble(); renderActList(); renderList(); scrollToCard(r.dataset.id); });
  }

  /* ─── pursuit list ─── */
  function renderList() {
    let data = filtered().slice();
    if (S.sort === 'fit') data.sort((a, b) => b.fit - a.fit || a.days - b.days);
    else if (S.sort === 'deadline') data.sort((a, b) => a.days - b.days);
    else data.sort((a, b) => b.ceiling - a.ceiling);
    $('plistCount').innerHTML = `<b>${data.length}</b> pursuits · ${money(data.reduce((s, o) => s + o.ceiling, 0))} total ceiling`;
    const maxDays = 80;
    $('plist').innerHTML = data.length ? data.map(o => {
      const u = urg(o.days), sm = D.STAGE_META[o.stage];
      const w = Math.max(6, (1 - Math.min(o.days, maxDays) / maxDays) * 100);
      const saCls = ['SB', 'SDVOSB', '8(a)', 'HUBZone'].includes(o.sa) ? 'sa' : 'sa full';
      const aiTip = pursuitInsight(o);
      return `<div class="pcard stage-${o.stage}${S.sel === o.id ? ' sel' : ''}" id="pc-${cssId(o.id)}" data-id="${o.id}">
        ${fitTile(o.fit)}
        <div class="pc-main">
          <div class="pc-title">${o.title}</div>
          <div class="pc-agy">${o.agency} · ${o.office} · <span class="pc-idin">${o.id}</span></div>
          <div class="pc-chips">
            <span class="chip naics">${o.naics}</span>
            <span class="chip ${saCls}">${o.sa === 'Full' ? 'Full &amp; Open' : o.sa}</span>
            <span class="chip stage" style="background:${sm.color}">${sm.label}</span>
          </div>
        </div>
        <div class="pc-mid">
          <div class="pc-ceiling">${money(o.ceiling)}<small>CEILING</small></div>
          <div class="pc-urg ${u}">
            <div class="pc-days"><span class="pd-num">${o.days}<small>d</small></span><span class="pd-lbl">${o.days <= 3 ? 'ACT NOW' : 'to ' + (o.stage === 'sources' || o.stage === 'presol' ? 'respond' : 'submit')}</span></div>
            <div class="urg-bar"><i class="${u}" style="width:${w}%"></i></div>
          </div>
        </div>
        <div class="pc-actions">
          <a class="btn-open" href="#" onclick="return false">Run Audit</a>
          <button class="btn-save" data-track="${o.id}"><svg class="ic-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><svg class="ic-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg><span class="bs-add">Pipeline</span><span class="bs-on">In Pipeline</span></button>
        </div>
        <div class="pc-insight"><span class="ai-tag">AI Insight</span><span class="ai-txt">${aiTip}</span></div>
      </div>`;
    }).join('') : `<div class="empty">No pursuits match your filters. Try widening NAICS or clearing a saved view.</div>`;
    $('plist').querySelectorAll('.pcard').forEach(c => c.onclick = (e) => { if (e.target.closest('a,button')) return; S.sel = (S.sel === c.dataset.id ? null : c.dataset.id); renderBubble(); renderActList(); renderList(); });
    $('plist').querySelectorAll('.btn-save').forEach(b => {
      const id = b.dataset.track;
      if (S.tracked.has(id)) b.classList.add('on');
      b.onclick = (e) => { e.stopPropagation(); if (S.tracked.has(id)) S.tracked.delete(id); else S.tracked.add(id); renderList(); };
    });
  }
  const cssId = (s) => s.replace(/[^a-z0-9]/gi, '');
  function scrollToCard(id) { const el = $('pc-' + cssId(id)); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); }

  /* ─── insight ─── */
  function renderInsight() {
    const f = filtered();
    const hot = f.filter(o => o.fit >= 85 && o.days <= 10);
    const gaps = f.filter(o => /new requirement|market research/i.test(o.incumbent) && o.fit >= 80);
    let html;
    if (S.sel) {
      const o = D.OPPS.find(x => x.id === S.sel);
      html = `<span class="ib-label">Focus</span><b>${o.title}</b> — fit <b>${o.fit}/100</b> (${fitTier(o.fit)}), ${money(o.ceiling)} ceiling, <b>${o.days} days</b> to ${o.stage === 'rfp' ? 'submit' : 'respond'}. Incumbent: ${o.incumbent}.`;
    } else if (hot.length) {
      html = `<span class="ib-label">Priority</span><b>${hot.length} strong-fit pursuit${hot.length > 1 ? 's' : ''}</b> closing within 10 days — ${money(hot.reduce((s, o) => s + o.ceiling, 0))} of ceiling. ${gaps.length ? `<b>${gaps.length}</b> are brand-new requirements (no incumbent) — best odds.` : ''}`;
    } else {
      html = `<span class="ib-label">Read</span>Upstream <b>Sources Sought &amp; Pre-Sol</b> notices let you shape requirements before the RFP drops — switch to the <b>Upstream</b> saved view to find them early.`;
    }
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  let naicsExpanded = false;
  function renderHeaderNaics() {
    const el = $('hdrNaics'); if (!el) return;
    const codes = D.NAICS, CAP = 6;
    const showAll = naicsExpanded || codes.length <= CAP;
    const shown = showAll ? codes : codes.slice(0, CAP);
    const rest = showAll ? [] : codes.slice(CAP);
    let html = shown.map(n => `<span class="hdr-naics-pill ${S.naics.has(n.code) ? '' : 'off'}" data-naics="${n.code}" title="${n.label} — click to ${S.naics.has(n.code) ? 'hide' : 'show'}">${n.code}</span>`).join('');
    if (rest.length) html += `<span class="hdr-naics-pill more" data-more="1" title="Show ${rest.length} more code${rest.length > 1 ? 's' : ''}">+${rest.length} more</span>`;
    else if (codes.length > CAP) html += `<span class="hdr-naics-pill more" data-more="0" title="Show fewer">show less</span>`;
    el.innerHTML = html;
    const active = S.naics.size, total = codes.length;
    const lbl = $('hdrNaicsLabel');
    if (lbl) lbl.innerHTML = active < total ? `Your NAICS · <b>${active}/${total} active</b>` : 'Your NAICS · click to filter';
    el.querySelectorAll('[data-naics]').forEach(p => p.onclick = () => {
      const c = p.dataset.naics;
      if (S.naics.has(c)) { if (S.naics.size > 1) S.naics.delete(c); } else S.naics.add(c);
      S.view = null; sync(); renderAll();
    });
    el.querySelectorAll('[data-more]').forEach(p => p.onclick = () => { naicsExpanded = p.dataset.more === '1'; renderHeaderNaics(); });
  }

  function renderAll() { renderHeaderNaics(); renderKPIs(); renderBubble(); renderActList(); renderList(); renderInsight(); }
  function onThemeChange() { renderAll(); }

  function init() {
    buildControls(); renderAll();
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderBubble, 220); });
  }
  window.DSO_APP = { render: renderAll, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
