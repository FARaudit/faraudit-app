/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Spending (best-in-class) — render + viz + interactions
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const D = window.DSB;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmtM = (m) => m >= 1000 ? '$' + (m / 1000).toFixed(2) + 'B' : '$' + Math.round(m) + 'M';

  /* ─── global state ─── */
  const S = {
    fy: 'FY2026',
    agency: 'all',
    setaside: 'all',
    state: null,        // selected fips
    rankMode: 'top'     // top | gap | growth
  };
  const fyIdx = () => D.FYS.indexOf(S.fy);

  const SETASIDES = [
    { key: 'all', label: 'All' }, { key: 'sb', label: 'SB' },
    { key: 'sdvosb', label: 'SDVOSB' }, { key: '8a', label: '8(a)' }, { key: 'hubzone', label: 'HUBZone' }
  ];
  const NAICS_COLORS = { '336413': '#185FA5', '332710': '#378ADD', '332721': '#8Fc0ED' };
  const FIT_COLORS = () => ({ core: css('--accent'), adjacent: css('--teal-600'), stretch: css('--mute-2') });

  let usGeo = null, charts = {};

  /* ════════════════ CONTROLS ════════════════ */
  function buildControls() {
    $('segFY').innerHTML = D.FYS.map(f =>
      `<button data-fy="${f}" class="${f === S.fy ? 'active' : ''}">${f.replace('FY20', "'")}</button>`).join('');
    $('segFY').querySelectorAll('button').forEach(b => b.onclick = () => { S.fy = b.dataset.fy; syncControls(); renderAll(); });

    $('agencyFilters').innerHTML = D.AGENCY_FILTERS.map(a =>
      `<button class="fpill ${a.key === S.agency ? 'active' : ''}" data-agency="${a.key}">${a.label}</button>`).join('');
    $('agencyFilters').querySelectorAll('button').forEach(b => b.onclick = () => {
      S.agency = b.dataset.agency; syncControls(); renderAll();
    });

    $('setasideFilters').innerHTML = SETASIDES.map(a =>
      `<button class="fpill ${a.key === S.setaside ? 'active' : ''}" data-sa="${a.key}">${a.label}</button>`).join('');
    $('setasideFilters').querySelectorAll('button').forEach(b => b.onclick = () => {
      S.setaside = b.dataset.sa; syncControls(); renderAll();
    });

    $('resetBtn').onclick = () => { S.fy = 'FY2026'; S.agency = 'all'; S.setaside = 'all'; S.state = null; S.rankMode = 'top'; syncControls(); renderAll(); };
    $('selChipX').onclick = () => { S.state = null; syncControls(); renderAll(); };
  }
  function syncControls() {
    $('segFY').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.fy === S.fy));
    $('agencyFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.agency === S.agency));
    $('setasideFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sa === S.setaside));
    const chip = $('selChip');
    if (S.state && D.STATES[S.state]) { chip.classList.add('show'); $('selChipText').textContent = 'Focus: ' + D.STATES[S.state].name; }
    else chip.classList.remove('show');
  }

  /* ════════════════ KPIs (with sparklines) ════════════════ */
  function renderKPIs() {
    const i = fyIdx();
    const addressable = D.AGENCIES.reduce((a, ag) => a + ag.spark[i], 0); // $M
    const k = D.KPIS.FY2026;
    const cards = [
      { ...k.addressable, val: (addressable / 1000).toFixed(2), unit: 'B', spark: D.AGENCIES.reduce((acc, ag) => { ag.spark.forEach((v, idx) => acc[idx] = (acc[idx] || 0) + v); return acc; }, []).map(v => v / 1000) },
      k.recompete, k.sbshare, k.cycle
    ];
    $('kpiStrip').innerHTML = cards.map((c, idx) => {
      const dtone = c.delta && c.delta[0] === '+' ? 'up' : (c.delta && (c.delta[0] === '−' || c.delta[0] === '-')) ? 'down' : 'flat';
      return `<div class="kpi" data-tone="${c.tone}">
        <div class="kpi-top"><p class="lbl">${c.label}</p><span class="delta ${dtone}">${c.delta}</span></div>
        <div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div>
        <svg class="spark" id="kspark${idx}"></svg>
        <div class="foot">${c.sub}</div>
      </div>`;
    }).join('');
    cards.forEach((c, idx) => sparkline($('kspark' + idx), c.spark, c.tone));
  }

  function sparkline(svg, data, tone) {
    if (!svg || !data || !data.length) return;
    const w = svg.clientWidth || 200, h = 30, pad = 3;
    const x = d3.scaleLinear().domain([0, data.length - 1]).range([pad, w - pad]);
    const y = d3.scaleLinear().domain([d3.min(data) * 0.96, d3.max(data) * 1.02]).range([h - pad, pad]);
    const col = tone === 'amber' ? css('--amber-600') : tone === 'green' ? css('--green-600') : css('--accent');
    const area = d3.area().x((d, i) => x(i)).y0(h).y1(d => y(d)).curve(d3.curveMonotoneX);
    const line = d3.line().x((d, i) => x(i)).y(d => y(d)).curve(d3.curveMonotoneX);
    const sel = d3.select(svg); sel.selectAll('*').remove();
    sel.attr('viewBox', `0 0 ${w} ${h}`);
    const gid = 'g' + Math.random().toString(36).slice(2, 7);
    const grad = sel.append('defs').append('linearGradient').attr('id', gid).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    grad.append('stop').attr('offset', '0%').attr('stop-color', col).attr('stop-opacity', .28);
    grad.append('stop').attr('offset', '100%').attr('stop-color', col).attr('stop-opacity', 0);
    sel.append('path').attr('d', area(data)).attr('fill', `url(#${gid})`);
    sel.append('path').attr('d', line(data)).attr('fill', 'none').attr('stroke', col).attr('stroke-width', 1.8);
    sel.append('circle').attr('cx', x(data.length - 1)).attr('cy', y(data[data.length - 1])).attr('r', 2.6).attr('fill', col);
  }

  /* ════════════════ GEO MAP ════════════════ */
  const lvl = (v) => v == null ? 0 : v >= 250 ? 5 : v >= 150 ? 4 : v >= 80 ? 3 : v >= 30 ? 2 : 1;
  const GEO_RAMP = ['--geo-0', '--geo-1', '--geo-2', '--geo-4', '--geo-5', '--geo-6'];
  const geoColor = (v) => css(GEO_RAMP[lvl(v)]);
  const CALLOUT = new Set(['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC']);
  const LABEL_LONLAT = { FL: [-81.4, 28.4], MI: [-84.6, 43.4], LA: [-92.2, 30.9] };
  const FORCE_CALLOUT = new Set(['MD', 'DE', 'DC', 'RI', 'CT', 'NJ']);

  function renderLegend() {
    const buckets = [['--geo-1', '<$30M'], ['--geo-2', '$30–80M'], ['--geo-4', '$80–150M'], ['--geo-5', '$150–250M'], ['--geo-6', '$250M+']];
    $('geoLegend').innerHTML = buckets.map(b => `<span class="sw"><i style="background:${css(b[0])}"></i>${b[1]}</span>`).join('')
      + `<span class="gap-key"><i></i>BD gap</span>`;
  }

  function renderMap() {
    const svg = d3.select('#geoSvg'); svg.selectAll('*').remove();
    if (!usGeo) return;
    const states = topojson.feature(usGeo, usGeo.objects.states);
    const proj = d3.geoAlbersUsa().fitSize([960, 500], states);
    const path = d3.geoPath(proj);
    const g = svg.append('g');
    g.selectAll('path').data(states.features).join('path')
      .attr('d', path)
      .attr('class', d => {
        const s = D.STATES[d.id]; let c = 'state';
        if (s && s.gap) c += ' gap';
        if (S.state && S.state !== d.id) c += ' dim';
        if (S.state === d.id) c += ' selected';
        return c;
      })
      .attr('fill', d => { const s = D.STATES[d.id]; return geoColor(s ? s.val : null); })
      .attr('stroke', d => { const s = D.STATES[d.id]; return s && s.gap ? css('--red-500') : css('--geo-stroke'); })
      .attr('stroke-dasharray', d => { const s = D.STATES[d.id]; return s && s.gap ? '4,2.5' : null; })
      .attr('stroke-width', d => { const s = D.STATES[d.id]; return s && s.gap ? 1.8 : .9; })
      .on('mousemove', (ev, d) => showStateTip(ev, d.id))
      .on('mouseleave', hideTip)
      .on('click', (ev, d) => { if (D.STATES[d.id]) { S.state = (S.state === d.id ? null : d.id); syncControls(); renderAll(); } });

    // ── labels: inline when the abbreviation fits the state; else a clean leader-line callout ──
    const labeled = states.features.filter(d => { const s = D.STATES[d.id]; return s && s.abbr !== 'HI'; });
    const inlineFeats = [], callItems = [];
    labeled.forEach(d => {
      const s = D.STATES[d.id], b = path.bounds(d);
      const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
      if (!FORCE_CALLOUT.has(s.abbr) && (LABEL_LONLAT[s.abbr] || (w >= 13 && h >= 10))) inlineFeats.push(d);
      else callItems.push({ s, c: path.centroid(d) });
    });
    g.selectAll('text.geo-lab').data(inlineFeats).join('text')
      .attr('class', d => { const s = D.STATES[d.id]; return 'geo-lab' + (lvl(s.val) >= 4 ? ' lt' : ''); })
      .attr('transform', d => { const s = D.STATES[d.id]; const ov = LABEL_LONLAT[s.abbr]; const p = (ov && proj(ov)) ? proj(ov) : path.centroid(d); return `translate(${p[0]},${p[1]})`; })
      .attr('text-anchor', 'middle').attr('dy', 3).text(d => D.STATES[d.id].abbr);
    // leader-line callouts for the few states too small for an inside label
    callItems.sort((a, b) => a.c[1] - b.c[1]);
    const colX = 930, startY = 170, stepY = 16;
    const cg = g.append('g').attr('class', 'callouts');
    callItems.forEach((it, i) => {
      const ly = startY + i * stepY;
      cg.append('line').attr('x1', it.c[0]).attr('y1', it.c[1]).attr('x2', colX - 6).attr('y2', ly).attr('stroke', css('--mute-2')).attr('stroke-width', .7).attr('opacity', .55);
      cg.append('circle').attr('cx', colX).attr('cy', ly).attr('r', 3.2).attr('fill', it.s.gap ? css('--card') : geoColor(it.s.val)).attr('stroke', it.s.gap ? css('--red-500') : css('--mute-2')).attr('stroke-width', it.s.gap ? 1.3 : .6);
      cg.append('text').attr('x', colX + 7).attr('y', ly).attr('dy', 3.2).attr('class', 'geo-callout').text(it.s.abbr);
    });
  }

  function showStateTip(ev, fips) {
    const s = D.STATES[fips]; const tip = $('geoTip'); if (!s) { hideTip(); return; }
    const yo = s.yoy >= 0 ? `<span class="up">▲ +${s.yoy}%</span>` : `<span class="down">▼ ${s.yoy}%</span>`;
    tip.innerHTML = `<div class="t">${s.name}<span class="v">${fmtM(s.val)}</span></div>
      <div class="r">YoY ${yo} · SB share <b>${s.sb}%</b></div>
      <div class="r">${s.note}</div>${s.gap ? '<span class="gapflag">BD GAP · no recorded activity</span>' : ''}`;
    tip.style.display = 'block';
    tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 200) + 'px';
    tip.style.top = (ev.clientY + 14) + 'px';
  }
  const hideTip = () => { $('geoTip').style.display = 'none'; };

  /* ════════════════ RANKED LIST ════════════════ */
  function renderRankTabs() {
    const tabs = [['top', 'Top'], ['gap', 'BD Gaps'], ['growth', 'Growth']];
    $('rankTabs').innerHTML = tabs.map(t => `<button class="rank-tab ${t[0] === S.rankMode ? 'active' : ''}" data-rm="${t[0]}">${t[1]}</button>`).join('');
    $('rankTabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.rankMode = b.dataset.rm; renderRankList(); });
  }
  function renderRankList() {
    $('rankTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.rm === S.rankMode));
    let arr = Object.entries(D.STATES).map(([fips, s]) => ({ fips, ...s }));
    if (S.rankMode === 'gap') { arr = arr.filter(s => s.gap).sort((a, b) => b.val - a.val); $('rankSub').textContent = 'High spend · no recorded activity from you'; }
    else if (S.rankMode === 'growth') { arr = arr.sort((a, b) => b.yoy - a.yoy).slice(0, 12); $('rankSub').textContent = 'Fastest YoY momentum'; }
    else { arr = arr.sort((a, b) => b.val - a.val).slice(0, 14); $('rankSub').textContent = 'Top states by spend · ' + S.fy; }
    const max = d3.max(arr, d => d.val) || 1;
    $('rankList').innerHTML = arr.map((s, i) => {
      const sel = S.state === s.fips ? ' selected' : (S.state ? ' dim' : '');
      const yo = s.yoy >= 0 ? `<span class="rank-yoy up">▲${s.yoy}%</span>` : `<span class="rank-yoy down">▼${Math.abs(s.yoy)}%</span>`;
      return `<div class="rank-row${sel}" data-fips="${s.fips}">
        <span class="rank-n">${i + 1}</span>
        <span class="rank-st">${s.abbr}</span>
        <span class="rank-mid">
          <span class="rank-bar"><i style="width:${Math.max(6, s.val / max * 100)}%"></i></span>
          <span class="rank-note">${s.gap ? '<span class="rank-gap">BD GAP</span> ' : ''}${s.note}</span>
        </span>
        <span class="rank-right"><span class="rank-val">${fmtM(s.val)}</span>${yo}</span>
      </div>`;
    }).join('');
    $('rankList').querySelectorAll('.rank-row').forEach(r => r.onclick = () => { const f = r.dataset.fips; S.state = (S.state === f ? null : f); syncControls(); renderAll(); });
  }

  /* ════════════════ TREEMAP (agency × NAICS) ════════════════ */
  function renderTreemap() {
    const svg = d3.select('#treeSvg'); svg.selectAll('*').remove();
    const W = $('treeSvg').clientWidth || 600, H = 300;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const i = fyIdx();
    const root = {
      name: 'root', children: D.AGENCIES.map(a => {
        const scale = a.spark[i] / a.spark[4];
        return { name: a.name, short: a.short, key: a.key, children: Object.entries(a.naics).map(([code, v]) => ({ name: code, value: v * scale, agency: a.key, short: a.short })) };
      })
    };
    const h = d3.hierarchy(root).sum(d => d.value).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingOuter(0).paddingInner(2).paddingTop(15).round(true)(h);

    const leaves = h.leaves();
    svg.selectAll('rect.cell').data(leaves).join('rect')
      .attr('class', d => 'cell' + (S.agency !== 'all' && d.data.agency !== S.agency ? ' dim' : ''))
      .attr('x', d => d.x0).attr('y', d => d.y0).attr('width', d => Math.max(0, d.x1 - d.x0)).attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => NAICS_COLORS[d.data.name] || css('--accent')).attr('rx', 3)
      .on('mousemove', (ev, d) => { const tip = $('geoTip'); tip.innerHTML = `<div class="t">${d.data.short} · ${d.data.name}<span class="v">${fmtM(d.value)}</span></div><div class="r">click to filter by agency</div>`; tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 200) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; })
      .on('mouseleave', hideTip)
      .on('click', (ev, d) => { S.agency = (S.agency === d.data.agency ? 'all' : d.data.agency); syncControls(); renderAll(); });

    // leaf value labels (only if big enough)
    svg.selectAll('text.tree-val').data(leaves.filter(d => (d.x1 - d.x0) > 46 && (d.y1 - d.y0) > 26)).join('text')
      .attr('class', 'tree-sub').attr('x', d => d.x0 + 5).attr('y', d => d.y1 - 6).attr('font-size', 9)
      .text(d => fmtM(d.value));

    // agency labels (parent strip)
    svg.selectAll('text.tree-lab').data(h.children || []).join('text')
      .attr('class', 'tree-lab').attr('x', d => d.x0 + 5).attr('y', d => d.y0 + 11).attr('font-size', 9.5)
      .attr('fill', () => css('--ink'))
      .text(d => (d.x1 - d.x0) > 40 ? d.data.short : '');

    $('treeLegend').innerHTML = Object.entries(NAICS_COLORS).map(([c, col]) => `<span class="lg"><i style="background:${col}"></i>${c}</span>`).join('');
  }

  /* ════════════════ SCATTER (opportunity matrix) ════════════════ */
  function renderScatter() {
    const svg = d3.select('#scatterSvg'); svg.selectAll('*').remove();
    const W = $('scatterSvg').clientWidth || 600, H = 300;
    const m = { t: 22, r: 16, b: 34, l: 44 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = D.COMPETITION;
    const x = d3.scaleLog().domain([18, 600]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 13]).range([H - m.b, m.t]);
    const r = d3.scaleSqrt().domain([0, d3.max(data, d => d.total)]).range([3, 26]);
    const fits = FIT_COLORS();
    const medFirms = 110, medPer = 5;

    // quadrant shading (top-left = sweet spot)
    svg.append('rect').attr('x', x(18)).attr('y', m.t).attr('width', x(medFirms) - x(18)).attr('height', y(medPer) - m.t)
      .attr('fill', css('--green-500')).attr('opacity', .05);
    svg.append('line').attr('x1', x(medFirms)).attr('x2', x(medFirms)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(medPer)).attr('y2', y(medPer)).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');

    // axes
    const xAxis = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([20, 50, 100, 200, 500]).tickFormat(d => d).tickSize(4));
    const yAxis = svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d + 'M').tickSize(4));
    svg.append('text').attr('class', 'axis-title').attr('x', W - m.r).attr('y', H - 6).attr('text-anchor', 'end').text('# competing firms →');
    svg.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -m.t).attr('y', 12).attr('text-anchor', 'end').text('$ per win ↑');
    svg.append('text').attr('class', 'quad').attr('x', x(20)).attr('y', m.t + 11).attr('fill', css('--green-700')).text('◆ OPEN & RICH');

    svg.selectAll('circle.dot').data(data).join('circle')
      .attr('class', 'dot').attr('cx', d => x(d.firms)).attr('cy', d => y(d.perFirm)).attr('r', d => r(d.total))
      .attr('fill', d => fits[d.fit]).attr('opacity', .62).attr('stroke', d => fits[d.fit]).attr('stroke-width', .5)
      .on('mousemove', (ev, d) => { const tip = $('geoTip'); tip.innerHTML = `<div class="t">${d.label}<span class="v">${fmtM(d.total)}</span></div><div class="r">${d.firms} firms · <b>${fmtM(d.perFirm)}</b> per win · ${d.fit}</div>`; tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 220) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; })
      .on('mouseleave', hideTip);

    svg.selectAll('text.dotlab').data(data.filter(d => d.fit === 'core')).join('text')
      .attr('class', 'dotlab').attr('x', d => x(d.firms)).attr('y', d => y(d.perFirm) - r(d.total) - 3).attr('text-anchor', 'middle')
      .text(d => d.code.split('-')[0]);

    $('scatterLegend').innerHTML = [['core', 'Your NAICS'], ['adjacent', 'Adjacent'], ['stretch', 'Stretch']]
      .map(f => `<span class="lg"><i style="background:${fits[f[0]]}"></i>${f[1]}</span>`).join('');
  }

  /* ════════════════ AGENCY BREAKDOWN ════════════════ */
  function renderAgencyList() {
    const i = fyIdx();
    const rows = D.AGENCIES.map(a => ({ a, val: a.spark[i] })).sort((p, q) => q.val - p.val);
    const max = d3.max(rows, r => r.val) || 1;
    $('agencyList').innerHTML = rows.map(({ a, val }) => {
      const prev = a.spark[Math.max(0, i - 1)];
      const g = prev ? (val - prev) / prev * 100 : 0;
      const gcls = g > 2 ? 'up' : g < -2 ? 'down' : 'flat';
      const gtxt = gcls === 'flat' ? '— flat' : (g >= 0 ? '▲ ' : '▼ ') + Math.abs(g).toFixed(0) + '%';
      const barW = Math.max(3, val / max * 100);
      const sbW = barW * a.sb / 100;
      const active = S.agency === a.key ? ' active' : '';
      return `<div class="ag-row${active}" data-agency="${a.key}" title="${a.name} · ${a.sb}% to small business">
        <span class="ag-name">${a.short}</span>
        <div class="ag-bar2"><div class="seg-lp" style="width:${barW}%"></div><div class="seg-sb" style="width:${sbW}%"></div></div>
        <span class="ag-val">${fmtM(val)}</span>
        <span class="ag-grow ${gcls}">${gtxt}</span>
      </div>`;
    }).join('');
    $('agencyList').querySelectorAll('.ag-row').forEach(r => r.onclick = () => { const k = r.dataset.agency; S.agency = (S.agency === k ? 'all' : k); syncControls(); renderAll(); });
  }

  /* ════════════════ CHARTS ════════════════ */
  const NAICS_LABELS = { '336413': 'Aircraft parts', '332710': 'Machine shops', '332721': 'Precision turning' };
  function renderTrend() {
    const el = $('trendList'); if (!el) return;
    const t = D.MARKET_TREND, codes = Object.keys(t.series);
    const lastI = t.labels.length - 1;
    const rows = codes.map(c => {
      const s = t.series[c];
      return { code: c, fy22: s[0], fy26: s[lastI - 1], fy27: s[lastI], label: NAICS_LABELS[c] || c };
    }).sort((a, b) => b.fy26 - a.fy26);
    const maxRef = d3.max(rows, r => r.fy27);
    const fmt = v => v >= 1000 ? '$' + (v / 1000).toFixed(2) + 'B' : '$' + v + 'M';
    const totalNow = rows.reduce((a, r) => a + r.fy26, 0);
    const totalProj = rows.reduce((a, r) => a + r.fy27, 0);
    el.innerHTML = rows.map(r => {
      const col = NAICS_COLORS[r.code];
      const g5 = Math.round((r.fy26 - r.fy22) / r.fy22 * 100);
      const solidPct = r.fy26 / maxRef * 100;
      const ghostPct = (r.fy27 - r.fy26) / maxRef * 100;
      return `<div class="mkt-row">
        <div class="mkt-top">
          <div class="mkt-id"><span class="mkt-dot" style="background:${col}"></span><span class="mkt-code">${r.code}</span><span class="mkt-label">${r.label}</span></div>
          <div class="mkt-vals"><span class="mkt-val">${fmt(r.fy26)}</span><span class="mkt-growth up">▲ +${g5}% 5yr</span></div>
        </div>
        <div class="mkt-track"><div class="mkt-solid" style="width:${solidPct}%;background:${col}"></div><div class="mkt-ghost" style="width:${ghostPct}%;--c:${col}"></div></div>
        <div class="mkt-foot"><span>from ${fmt(r.fy22)} · FY22</span><span class="proj">projected <b>${fmt(r.fy27)}</b> · FY27</span></div>
      </div>`;
    }).join('') + `<div class="mkt-note"><span class="tam">${fmt(totalNow)}</span>&nbsp;total addressable now → <span class="tam">${fmt(totalProj)}</span>&nbsp;FY27<span class="legend-ghost"><i></i>projected</span></div>`;
  }

  function renderBudget() {
    const svg = d3.select('#budgetSvg'); svg.selectAll('*').remove();
    const W = $('budgetSvg').clientWidth || 560, H = 236;
    const m = { t: 40, r: 22, b: 32, l: 22 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const b = D.BUDGET;
    const x = d3.scalePoint().domain(b.map(d => d.fy)).range([m.l + 12, W - m.r - 12]);
    const y = d3.scaleLinear().domain([d3.min(b, d => d.val) - 45, d3.max(b, d => d.val) + 22]).range([H - m.b, m.t]);
    const colMap = { enacted: css('--accent'), cr: '#d97706', shutdown: '#ef4444' };
    // constraint bands behind non-enacted years
    b.forEach(d => { if (d.status !== 'enacted') svg.append('rect').attr('x', x(d.fy) - 28).attr('y', m.t - 4).attr('width', 56).attr('height', H - m.b - m.t + 4).attr('rx', 7).attr('fill', colMap[d.status]).attr('opacity', .08); });
    // gradient area + line
    const area = d3.area().x(d => x(d.fy)).y0(H - m.b).y1(d => y(d.val)).curve(d3.curveMonotoneX);
    const line = d3.line().x(d => x(d.fy)).y(d => y(d.val)).curve(d3.curveMonotoneX);
    const grad = svg.append('defs').append('linearGradient').attr('id', 'budgrad').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    grad.append('stop').attr('offset', '0%').attr('stop-color', css('--accent')).attr('stop-opacity', .3);
    grad.append('stop').attr('offset', '100%').attr('stop-color', css('--accent')).attr('stop-opacity', 0);
    svg.append('path').attr('d', area(b)).attr('fill', 'url(#budgrad)');
    svg.append('path').attr('d', line(b)).attr('fill', 'none').attr('stroke', css('--accent')).attr('stroke-width', 2.6).attr('stroke-linecap', 'round');
    const g = svg.selectAll('g.bnode').data(b).join('g').attr('class', 'bnode');
    g.append('circle').attr('cx', d => x(d.fy)).attr('cy', d => y(d.val)).attr('r', 6).attr('fill', d => colMap[d.status]).attr('stroke', css('--card')).attr('stroke-width', 2.5);
    g.append('text').attr('x', d => x(d.fy)).attr('y', d => y(d.val) - 14).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 11).attr('font-weight', 800).attr('fill', css('--ink')).text(d => '$' + d.val + 'B');
    g.append('text').attr('x', d => x(d.fy)).attr('y', H - m.b + 18).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 10).attr('fill', css('--mute')).text(d => d.fy);
    g.filter(d => d.status !== 'enacted').append('text').attr('x', d => x(d.fy)).attr('y', m.t - 12).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 8.5).attr('font-weight', 800).attr('letter-spacing', '.04em').attr('fill', d => colMap[d.status]).text(d => d.status === 'cr' ? 'CR' : 'SHUTDOWN');
  }

  /* ════════════════ RECOMPETE TIMELINE ════════════════ */
  function renderRecompetes() {
    const byQ = { 1: [], 2: [], 3: [], 4: [] };
    D.RECOMPETES.forEach(r => byQ[r.q].push(r));
    $('rcQuarters').innerHTML = [1, 2, 3, 4].map(q => `
      <div class="rc-q">
        <div class="rc-qhead">Q${q} FY27</div>
        ${byQ[q].map(r => {
          const dim = (S.agency !== 'all' && r.agency.toLowerCase() !== agencyMatch(S.agency)) ? ' dim' : '';
          return `<div class="rc-card${dim}">
            <div class="rc-name">${r.name}</div>
            <div class="rc-meta"><span class="rc-inc">vs ${r.incumbent}</span><span class="rc-val">${fmtM(r.val)}</span></div>
            <span class="rc-agy">${r.agency} · ${r.naics}</span>
          </div>`;
        }).join('') || '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:var(--mute);text-align:center;padding:10px 0">—</div>'}
      </div>`).join('');
  }
  function agencyMatch(key) {
    const map = { navy: 'navy', airforce: 'usaf', army: 'army', dla: 'dla', navair: 'navair', aflcmc: 'aflcmc', tacom: 'tacom', ssc: 'ssc' };
    return (map[key] || key);
  }

  /* ════════════════ INCUMBENTS ════════════════ */
  function renderIncumbents() {
    $('iiBody').innerHTML = D.INCUMBENTS.map(r => {
      let dim = '';
      if (S.setaside !== 'all' && !(S.setaside === 'sb' && r.sa === 'sb')) dim = ' dim';
      if (S.agency !== 'all' && r.agy.toLowerCase().indexOf(agencyMatch(S.agency)) === -1 && !agyAlias(S.agency, r.agy)) dim = ' dim';
      return `<tr class="${dim}">
        <td class="ii-awd">${r.awd}</td>
        <td>${r.agy}</td>
        <td class="ii-val">$${r.val}M</td>
        <td class="ii-naics">${r.naics}</td>
        <td><span class="sa-bdg ${r.sa}">${r.sa === 'sb' ? 'SB' : 'PRIME'}</span></td>
      </tr>`;
    }).join('');
  }
  function agyAlias(key, agy) {
    agy = agy.toLowerCase();
    if (key === 'navy' && (agy.indexOf('navsea') > -1 || agy.indexOf('nswc') > -1)) return true;
    return false;
  }

  /* ════════════════ PRICING + NDAA ════════════════ */
  /* price distribution: deterministic illustrative contract points, triangular peak at median (log space) */
  function pricePoints(p) {
    const lo = p.range[0], hi = p.range[1], med = p.median;
    const lLo = Math.log(lo), lHi = Math.log(hi), lMed = Math.log(med);
    const N = 20, pts = [];
    for (let k = 0; k < N; k++) {
      const u = (k + 0.5) / N;
      let t;
      if (u < 0.5) t = lLo + (lMed - lLo) * Math.sqrt(u * 2);
      else t = lMed + (lHi - lMed) * (1 - Math.sqrt((1 - u) * 2));
      pts.push(Math.exp(t));
    }
    return pts;
  }
  function renderPricing() {
    const svg = d3.select('#priceSvg'); svg.selectAll('*').remove();
    const node = $('priceSvg'); if (!node) return;
    const W = node.clientWidth || 540, rowH = 70, m = { t: 12, r: 16, b: 26, l: 70 };
    const data = D.PRICING;
    const H = m.t + data.length * rowH + m.b;
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const x = d3.scaleLog().domain([2, 500]).range([m.l, W - m.r]);
    const ticks = [2, 5, 10, 25, 50, 100, 250, 500];
    // vertical gridlines + axis labels
    ticks.forEach(tk => {
      svg.append('line').attr('x1', x(tk)).attr('x2', x(tk)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line-2')).attr('stroke-width', 1);
      svg.append('text').attr('x', x(tk)).attr('y', H - m.b + 14).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 8.5).attr('fill', css('--mute')).text('$' + tk + 'K');
    });
    const parseTop = (s) => { const mt = (s || '').match(/\$(\d+)K/); return mt ? +mt[1] : null; };

    data.forEach((p, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      const col = NAICS_COLORS[p.code];
      const lane = svg.append('g').attr('class', 'price-lane');
      // range band
      lane.append('rect').attr('class', 'lane-bg').attr('x', x(p.range[0])).attr('y', cy - 15).attr('width', Math.max(2, x(p.range[1]) - x(p.range[0]))).attr('height', 30).attr('rx', 15).attr('fill', col).attr('opacity', .09);
      // whisker low→high
      lane.append('line').attr('x1', x(p.range[0])).attr('x2', x(p.range[1])).attr('y1', cy).attr('y2', cy).attr('stroke', col).attr('opacity', .28).attr('stroke-width', 1.5);
      // end caps
      [p.range[0], p.range[1]].forEach(v => lane.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', cy - 5).attr('y2', cy + 5).attr('stroke', col).attr('opacity', .4).attr('stroke-width', 1.5));
      // jittered contract dots (beeswarm)
      const pts = pricePoints(p);
      pts.forEach((v, k) => {
        const jit = ((k % 5) - 2) * 4.4;
        lane.append('circle').attr('class', 'pdot').attr('cx', x(v)).attr('cy', cy + jit).attr('r', 3).attr('fill', col).attr('opacity', .5)
          .append('title').text('~$' + Math.round(v) + 'K contract');
      });
      // median tick (strong)
      lane.append('line').attr('x1', x(p.median)).attr('x2', x(p.median)).attr('y1', cy - 17).attr('y2', cy + 17).attr('stroke', col).attr('stroke-width', 2.6);
      lane.append('text').attr('x', x(p.median)).attr('y', cy - 21).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 9.5).attr('font-weight', 800).attr('fill', css('--ink')).text('$' + p.median + 'K');
      // avg marker (hollow ring)
      lane.append('circle').attr('cx', x(p.avg)).attr('cy', cy).attr('r', 5).attr('fill', css('--card')).attr('stroke', col).attr('stroke-width', 2);
      // top award marker (diamond)
      const tv = parseTop(p.top);
      if (tv) {
        const tx = x(tv);
        lane.append('path').attr('d', `M${tx},${cy - 18} l5,5 l-5,5 l-5,-5 z`).attr('fill', css('--amber-600')).attr('stroke', css('--card')).attr('stroke-width', 1)
          .append('title').text('Top award: ' + p.top);
      }
      // left lane label
      svg.append('text').attr('x', m.l - 12).attr('y', cy - 2).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 11).attr('font-weight', 800).attr('fill', css('--ink')).text(p.code);
      svg.append('text').attr('x', m.l - 12).attr('y', cy + 11).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 8).attr('fill', css('--mute')).text('avg $' + p.avg + 'K');
    });
    $('priceLegend').innerHTML = `<span class="lg"><svg width="12" height="12"><circle cx="6" cy="6" r="3" fill="var(--mute-2)"/></svg>contract</span>`
      + `<span class="lg"><svg width="4" height="12"><rect width="3" height="12" fill="var(--ink-2)"/></svg>median</span>`
      + `<span class="lg"><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--mute-2)" stroke-width="2"/></svg>average</span>`
      + `<span class="lg"><svg width="12" height="12"><path d="M6,1 l4,4 l-4,4 l-4,-4 z" fill="var(--amber-600)"/></svg>top award</span>`;
  }
  function renderNDAA() {
    $('ndaaList').innerHTML = D.NDAA.map(n => `<div class="ndaa-card ${n.tone}">
      <span class="ndaa-badge ${n.tone}">${n.tag}</span>
      <div class="ndaa-title">${n.title}</div>
      <div class="ndaa-body">${n.body}</div></div>`).join('');
  }

  /* ════════════════ INSIGHT BAR ════════════════ */
  function renderInsight() {
    let html;
    if (S.state && D.STATES[S.state]) {
      const s = D.STATES[S.state];
      html = s.gap
        ? `<span class="ib-label">BD Gap</span><b>${s.name}</b> shows <b>${fmtM(s.val)}</b> in your NAICS but no recorded activity from your firm — ${s.note}. Prime targets for expansion.`
        : `<span class="ib-label">Focus</span><b>${s.name}</b> · ${fmtM(s.val)} in your NAICS, ${s.yoy >= 0 ? 'up ' + s.yoy + '%' : 'down ' + Math.abs(s.yoy) + '%'} YoY · ${s.sb}% to small business · ${s.note}.`;
    } else if (S.agency !== 'all') {
      const a = D.AGENCIES.find(x => x.key === S.agency);
      html = `<span class="ib-label">Agency</span><b>${a.name}</b> obligates <b>${fmtM(a.spark[fyIdx()])}</b> in your NAICS at <b>${a.sb}% SB</b> — recompetes and teaming targets below are filtered to this command.`;
    } else {
      html = `<span class="ib-label">Read</span><b>Virginia (+12%)</b> and <b>Washington</b> lead growth — but WA, OH, GA and AZ are <b>high-spend BD gaps</b> with no recorded activity from you. Switch the leaderboard to <b>BD Gaps</b> to size the whitespace.`;
    }
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  /* ════════════════ ORCHESTRATION ════════════════ */
  function renderAll() {
    renderKPIs(); renderMap(); renderRankList(); renderTreemap(); renderScatter();
    renderAgencyList(); renderRecompetes(); renderIncumbents(); renderInsight();
  }
  function renderStatic() { renderTrend(); renderBudget(); renderPricing(); renderNDAA(); }

  function onThemeChange() {
    renderLegend(); renderAll(); renderStatic();
  }

  function init() {
    buildControls(); renderLegend(); renderRankTabs();
    renderStatic(); renderAll();
    fetch('/vendor/states-10m.json')
      .then(r => r.json()).then(j => { usGeo = j; renderMap(); })
      .catch(() => { console.warn('us-atlas failed'); });
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(() => { renderMap(); renderTreemap(); renderScatter(); }, 220); });
  }

  window.DSB_APP = { onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
