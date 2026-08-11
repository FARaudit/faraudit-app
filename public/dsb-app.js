/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Spending — render + viz + interactions

   Every figure comes from /api/defense-spending (USAspending obligations).
   Panels with no source in that feed state which measurement they need.

   LIFECYCLE. 'loading' draws nothing and removes nothing · 'ok' builds once ·
   only a SETTLED failure replaces the data region with the notice.

   MARKUP. Rows carry third-party names, so every interpolation goes through
   esc() and the result is parsed by setHTML() in an inert DOMParser document.
   No inline handlers: clicks are bound after insertion.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const D = window.DSB;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmtM = (m) => m >= 1000 ? '$' + (m / 1000).toFixed(2) + 'B' : m >= 1 ? '$' + Math.round(m) + 'M' : '$' + (m * 1000).toFixed(0) + 'K';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const PARSER = new DOMParser();
  function setHTML(el, html) {
    if (!el) return;
    const doc = PARSER.parseFromString('<body>' + html + '</body>', 'text/html');
    el.replaceChildren(...doc.body.childNodes);
  }
  const clear = (el) => { if (el) el.replaceChildren(); };

  /* ─── global state ─── */
  const S = { fy: null, agency: 'all', state: null, rankMode: 'top' };

  const view = () => (D.BY_FY && D.BY_FY[S.fy]) || { kpis: [], states: {}, agencies: [], incumbents: [] };
  const fyIdx = () => D.FYS.indexOf(S.fy);
  const agencyKeyOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // One colour per tracked NAICS, assigned in the order the feed lists them.
  // The codes belong to the customer, so they cannot be hardcoded here.
  const PALETTE = ['#185FA5', '#378ADD', '#8FC0ED', '#0F766E', '#B45309'];
  let naicsColor = {};
  function assignColors() {
    naicsColor = {};
    Object.keys((D.MARKET_TREND && D.MARKET_TREND.series) || {}).sort()
      .forEach((c, i) => { naicsColor[c] = PALETTE[i % PALETTE.length]; });
  }

  let usGeo = null;
  const emptyLine = (t) => '<div class="dsb-empty">' + esc(t) + '</div>';

  /* ════════════════ CONTROLS ════════════════ */
  function buildControls() {
    setHTML($('segFY'), D.FYS.map(f =>
      `<button data-fy="${esc(f)}" class="${f === S.fy ? 'active' : ''}">${esc(f.replace('FY20', "'"))}</button>`).join(''));
    $('segFY').querySelectorAll('button').forEach(b => b.onclick = () => { S.fy = b.dataset.fy; syncControls(); renderAll(); });

    setHTML($('agencyFilters'), D.AGENCY_FILTERS.map(a =>
      `<button class="fpill ${a.key === S.agency ? 'active' : ''}" data-agency="${esc(a.key)}">${esc(a.label)}</button>`).join(''));
    $('agencyFilters').querySelectorAll('button').forEach(b => b.onclick = () => {
      S.agency = b.dataset.agency; syncControls(); renderAll();
    });

    $('resetBtn').onclick = () => {
      S.fy = D.FYS[D.FYS.length - 1]; S.agency = 'all'; S.state = null; S.rankMode = 'top';
      syncControls(); renderRankTabs(); renderAll();
    };
    $('selChipX').onclick = () => { S.state = null; syncControls(); renderAll(); };
  }
  function syncControls() {
    $('segFY').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.fy === S.fy));
    $('agencyFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.agency === S.agency));
    const chip = $('selChip'); const st = view().states[S.state];
    if (S.state && st) { chip.classList.add('show'); $('selChipText').textContent = 'Focus: ' + st.name; }
    else chip.classList.remove('show');
  }

  /* ════════════════ PROVENANCE ════════════════
     What a reader needs to judge every figure below: when it was measured,
     which codes it covers, and that the breakdowns are top-ten lists. */
  function renderProvenance() {
    const el = $('dsbProvenance'); if (!el) return;
    const c = D.coverage || { tracked: [], untracked: [], top_n: 10 };
    const bits = [];
    if (D.as_of) bits.push('Measured <b>' + esc(String(D.as_of).slice(0, 10)) + '</b> from USAspending award data');
    if (c.tracked && c.tracked.length) bits.push('Covering <b>' + esc(c.tracked.join(' · ')) + '</b>');
    if (c.untracked && c.untracked.length) {
      bits.push('<span class="dsb-gap">Not yet pulled: <b>' + esc(c.untracked.join(' · ')) + '</b></span>');
    }
    bits.push('States, agencies and recipients are each the <b>top ' + esc(c.top_n)
      + '</b> per code — a name that is absent is outside that ten, not a zero');
    setHTML(el, bits.join('<span class="dsb-prov-dot">·</span>'));

    // The account's own codes. One with no rows behind it is marked.
    const pills = $('hdrNaicsPills');
    if (pills) {
      const all = (c.requested && c.requested.length ? c.requested : c.tracked) || [];
      setHTML(pills, all.map(code => {
        const covered = (c.tracked || []).indexOf(code) !== -1;
        return `<span class="hdr-naics-pill${covered ? '' : ' untracked'}"`
          + ` title="${covered ? 'Obligations pulled for this code' : 'No obligations pulled for this code yet'}">`
          + esc(code) + '</span>';
      }).join(''));
    }

    // Named source, NOT a live stream — these figures were pulled on a date,
    // and the pill must not pulse as though they were arriving now.
    const pill = $('dsbPill');
    if (pill) { pill.dataset.state = 'measured'; pill.textContent = 'USASPENDING'; }
  }

  /* ════════════════ KPIs ════════════════ */
  function renderKPIs() {
    const cards = view().kpis;
    setHTML($('kpiStrip'), cards.map((c, idx) => {
      const dtone = !c.delta ? 'flat' : c.delta[0] === '+' ? 'up' : 'down';
      return `<div class="kpi" data-tone="${esc(c.tone)}">
        <div class="kpi-top"><p class="lbl">${esc(c.label)}</p>${c.delta ? `<span class="delta ${dtone}">${esc(c.delta)}</span>` : ''}</div>
        <div class="kpi-val">${esc(c.val)}<span class="unit">${esc(c.unit)}</span></div>
        <svg class="spark" id="kspark${idx}"></svg>
        <div class="foot">${esc(c.sub)}</div>
      </div>`;
    }).join(''));
    cards.forEach((c, idx) => sparkline($('kspark' + idx), c.spark, c.tone));
  }

  function sparkline(svg, data, tone) {
    if (!svg || !data || data.length < 2) return;
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

  /* ════════════════ GEO MAP ════════════════
     The colour ramp is rebuilt from the values present. Fixed dollar
     thresholds would suit one customer's codes and not another's. */
  let geoBreaks = [];
  const GEO_RAMP = ['--geo-0', '--geo-1', '--geo-2', '--geo-4', '--geo-5', '--geo-6'];
  function computeBreaks() {
    const vals = Object.values(view().states).map(s => s.val).filter(v => v > 0).sort((a, b) => a - b);
    geoBreaks = vals.length ? [0.2, 0.4, 0.6, 0.8].map(q => vals[Math.floor(q * (vals.length - 1))]) : [];
  }
  function lvl(v) {
    if (v == null || !geoBreaks.length) return 0;
    let i = 1; for (const b of geoBreaks) { if (v > b) i++; }
    return Math.min(i, 5);
  }
  const geoColor = (v) => css(GEO_RAMP[lvl(v)]);
  const LABEL_LONLAT = { FL: [-81.4, 28.4], MI: [-84.6, 43.4], LA: [-92.2, 30.9] };
  const FORCE_CALLOUT = new Set(['MD', 'DE', 'DC', 'RI', 'CT', 'NJ']);

  function renderLegend() {
    const el = $('geoLegend'); if (!el) return;
    if (!geoBreaks.length) { clear(el); return; }
    const edges = [0].concat(geoBreaks);
    setHTML(el, edges.map((lo, i) => {
      const hi = edges[i + 1];
      const label = hi == null ? fmtM(lo) + '+' : (i === 0 ? '<' + fmtM(hi) : fmtM(lo) + '–' + fmtM(hi));
      return `<span class="sw"><i style="background:${css(GEO_RAMP[i + 1])}"></i>${esc(label)}</span>`;
    }).join(''));
  }

  function renderMap() {
    const svg = d3.select('#geoSvg'); svg.selectAll('*').remove();
    if (!usGeo) return;
    const ST = view().states;
    const states = topojson.feature(usGeo, usGeo.objects.states);
    const proj = d3.geoAlbersUsa().fitSize([960, 500], states);
    const path = d3.geoPath(proj);
    const g = svg.append('g');
    g.selectAll('path').data(states.features).join('path')
      .attr('d', path)
      .attr('class', d => {
        let c = 'state';
        if (S.state && S.state !== d.id) c += ' dim';
        if (S.state === d.id) c += ' selected';
        return c;
      })
      .attr('fill', d => { const s = ST[d.id]; return geoColor(s ? s.val : null); })
      .attr('stroke', css('--geo-stroke')).attr('stroke-width', .9)
      .on('mousemove', (ev, d) => showStateTip(ev, d.id))
      .on('mouseleave', hideTip)
      .on('click', (ev, d) => { if (ST[d.id]) { S.state = (S.state === d.id ? null : d.id); syncControls(); renderAll(); } });

    const labeled = states.features.filter(d => ST[d.id] && ST[d.id].abbr !== 'HI');
    const inlineFeats = [], callItems = [];
    labeled.forEach(d => {
      const s = ST[d.id], b = path.bounds(d);
      const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
      if (!FORCE_CALLOUT.has(s.abbr) && (LABEL_LONLAT[s.abbr] || (w >= 13 && h >= 10))) inlineFeats.push(d);
      else callItems.push({ s, c: path.centroid(d) });
    });
    g.selectAll('text.geo-lab').data(inlineFeats).join('text')
      .attr('class', d => 'geo-lab' + (lvl(ST[d.id].val) >= 4 ? ' lt' : ''))
      .attr('transform', d => { const s = ST[d.id]; const ov = LABEL_LONLAT[s.abbr]; const p = (ov && proj(ov)) ? proj(ov) : path.centroid(d); return `translate(${p[0]},${p[1]})`; })
      .attr('text-anchor', 'middle').attr('dy', 3).text(d => ST[d.id].abbr);

    callItems.sort((a, b) => a.c[1] - b.c[1]);
    const colX = 930, startY = 170, stepY = 16;
    const cg = g.append('g').attr('class', 'callouts');
    callItems.forEach((it, i) => {
      const ly = startY + i * stepY;
      cg.append('line').attr('x1', it.c[0]).attr('y1', it.c[1]).attr('x2', colX - 6).attr('y2', ly).attr('stroke', css('--mute-2')).attr('stroke-width', .7).attr('opacity', .55);
      cg.append('circle').attr('cx', colX).attr('cy', ly).attr('r', 3.2).attr('fill', geoColor(it.s.val)).attr('stroke', css('--mute-2')).attr('stroke-width', .6);
      cg.append('text').attr('x', colX + 7).attr('y', ly).attr('dy', 3.2).attr('class', 'geo-callout').text(it.s.abbr);
    });
  }

  function showStateTip(ev, fips) {
    const s = view().states[fips]; const tip = $('geoTip');
    if (!s) { hideTip(); return; }
    // A state outside the prior year's top ten has no comparable base, so its
    // change is unknown rather than zero — and the tooltip says which.
    const yo = s.yoy == null
      ? '<span class="flat">no prior-year figure</span>'
      : (s.yoy >= 0 ? `<span class="up">▲ +${s.yoy.toFixed(0)}%</span>` : `<span class="down">▼ ${s.yoy.toFixed(0)}%</span>`);
    setHTML(tip, `<div class="t">${esc(s.name)}<span class="v">${fmtM(s.val)}</span></div>`
      + `<div class="r">obligated in ${esc(S.fy)} · YoY ${yo}</div>`);
    tip.style.display = 'block';
    tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 200) + 'px';
    tip.style.top = (ev.clientY + 14) + 'px';
  }
  const hideTip = () => { $('geoTip').style.display = 'none'; };

  /* ════════════════ RANKED LIST ════════════════
     Two modes. A third, keyed to your firm's own activity, would need a
     dimension this feed does not carry. */
  function renderRankTabs() {
    const tabs = [['top', 'Top'], ['growth', 'Growth']];
    setHTML($('rankTabs'), tabs.map(t => `<button class="rank-tab ${t[0] === S.rankMode ? 'active' : ''}" data-rm="${t[0]}">${t[1]}</button>`).join(''));
    $('rankTabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.rankMode = b.dataset.rm; renderRankList(); });
  }
  function renderRankList() {
    $('rankTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.rm === S.rankMode));
    let arr = Object.entries(view().states).map(([fips, s]) => ({ fips, ...s }));
    if (S.rankMode === 'growth') {
      arr = arr.filter(s => s.yoy != null).sort((a, b) => b.yoy - a.yoy).slice(0, 12);
      $('rankSub').textContent = 'Fastest year-on-year change · states in both years’ top ten';
    } else {
      arr = arr.sort((a, b) => b.val - a.val).slice(0, 14);
      $('rankSub').textContent = 'Top states by obligations · ' + S.fy;
    }
    const max = d3.max(arr, d => d.val) || 1;
    setHTML($('rankList'), arr.map((s, i) => {
      const sel = S.state === s.fips ? ' selected' : (S.state ? ' dim' : '');
      const yo = s.yoy == null ? '<span class="rank-yoy">—</span>'
        : s.yoy >= 0 ? `<span class="rank-yoy up">▲${s.yoy.toFixed(0)}%</span>`
        : `<span class="rank-yoy down">▼${Math.abs(s.yoy).toFixed(0)}%</span>`;
      return `<div class="rank-row${sel}" data-fips="${esc(s.fips)}">
        <span class="rank-n">${i + 1}</span>
        <span class="rank-st">${esc(s.abbr)}</span>
        <span class="rank-mid">
          <span class="rank-bar"><i style="width:${Math.max(6, s.val / max * 100)}%"></i></span>
          <span class="rank-note">${esc(s.name)}</span>
        </span>
        <span class="rank-right"><span class="rank-val">${fmtM(s.val)}</span>${yo}</span>
      </div>`;
    }).join('') || emptyLine('No state breakdown for ' + S.fy + '.'));
    $('rankList').querySelectorAll('.rank-row').forEach(r => r.onclick = () => { const f = r.dataset.fips; S.state = (S.state === f ? null : f); syncControls(); renderAll(); });
  }

  /* ════════════════ TREEMAP (agency × NAICS) ════════════════ */
  function renderTreemap() {
    const node = $('treeSvg'); if (!node) return;
    const svg = d3.select('#treeSvg'); svg.selectAll('*').remove();
    const W = node.clientWidth || 600, H = 300;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const agencies = view().agencies;
    if (!agencies.length) return;
    const root = {
      name: 'root',
      children: agencies.map(a => ({
        name: a.name, short: a.short, key: a.key,
        children: Object.entries(a.naics).map(([code, v]) => ({ name: code, value: v, agency: a.key, short: a.short }))
      }))
    };
    const h = d3.hierarchy(root).sum(d => d.value).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingOuter(0).paddingInner(2).paddingTop(15).round(true)(h);

    const leaves = h.leaves();
    svg.selectAll('rect.cell').data(leaves).join('rect')
      .attr('class', d => 'cell' + (S.agency !== 'all' && d.data.agency !== S.agency ? ' dim' : '') + (S.agency !== 'all' && d.data.agency === S.agency ? ' sel' : ''))
      .attr('x', d => d.x0).attr('y', d => d.y0).attr('width', d => Math.max(0, d.x1 - d.x0)).attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => naicsColor[d.data.name] || css('--accent')).attr('rx', 3)
      .on('mousemove', (ev, d) => {
        const act = (S.agency === d.data.agency) ? 'click to clear filter — show all' : (S.agency === 'all' ? 'click to focus this agency' : 'click to switch focus here');
        const tip = $('geoTip');
        setHTML(tip, `<div class="t">${esc(d.data.short)} · ${esc(d.data.name)}<span class="v">${fmtM(d.value)}</span></div><div class="r">${esc(act)}</div>`);
        tip.style.display = 'block';
        tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 200) + 'px';
        tip.style.top = (ev.clientY + 14) + 'px';
      })
      .on('mouseleave', hideTip)
      .on('click', (ev, d) => { S.agency = (S.agency === d.data.agency ? 'all' : d.data.agency); syncControls(); renderAll(); });

    svg.selectAll('text.tree-val').data(leaves.filter(d => (d.x1 - d.x0) > 46 && (d.y1 - d.y0) > 26)).join('text')
      .attr('class', 'tree-sub').attr('x', d => d.x0 + 5).attr('y', d => d.y1 - 6).attr('font-size', 9)
      .text(d => fmtM(d.value));

    svg.selectAll('text.tree-lab').data(h.children || []).join('text')
      .attr('class', 'tree-lab').attr('x', d => d.x0 + 5).attr('y', d => d.y0 + 11).attr('font-size', 9.5)
      .attr('fill', () => css('--ink'))
      .text(d => (d.x1 - d.x0) > 40 ? d.data.short : '');

    setHTML($('treeLegend'), Object.entries(naicsColor).map(([c, col]) => `<span class="lg"><i style="background:${col}"></i>${esc(c)}</span>`).join(''));

    const tc = $('treeClear');
    if (tc) {
      if (S.agency !== 'all') {
        const a = agencies.find(x => x.key === S.agency);
        $('treeClearTxt').textContent = a ? ('Show all · clear ' + a.short) : 'Show all agencies';
        tc.style.display = 'inline-flex';
      } else { tc.style.display = 'none'; }
      tc.onclick = () => { S.agency = 'all'; syncControls(); renderAll(); };
    }
  }

  /* ════════════════ AGENCY BREAKDOWN ════════════════
     One bar. Small-business dollars arrive per NAICS, never per agency, so no
     SB segment can be drawn here. */
  function renderAgencyList() {
    const rows = view().agencies;
    const prevFy = D.FYS[fyIdx() - 1];
    const prev = prevFy ? (D.BY_FY[prevFy] || { agencies: [] }).agencies : [];
    const max = d3.max(rows, r => r.val) || 1;
    setHTML($('agencyList'), rows.map(a => {
      const was = prev.find(p => p.key === a.key);
      const g = was && was.val > 0 ? (a.val - was.val) / was.val * 100 : null;
      const gcls = g == null ? 'flat' : g > 2 ? 'up' : g < -2 ? 'down' : 'flat';
      const gtxt = g == null ? '—' : gcls === 'flat' ? '— flat' : (g >= 0 ? '▲ ' : '▼ ') + Math.abs(g).toFixed(0) + '%';
      const active = S.agency === a.key ? ' active' : '';
      return `<div class="ag-row${active}" data-agency="${esc(a.key)}" title="${esc(a.name)}">
        <span class="ag-name">${esc(a.short)}</span>
        <div class="ag-bar2"><div class="seg-lp" style="width:${Math.max(3, a.val / max * 100)}%"></div></div>
        <span class="ag-val">${fmtM(a.val)}</span>
        <span class="ag-grow ${gcls}">${gtxt}</span>
      </div>`;
    }).join('') || emptyLine('No agency breakdown for ' + S.fy + '.'));
    $('agencyList').querySelectorAll('.ag-row').forEach(r => r.onclick = () => { const k = r.dataset.agency; S.agency = (S.agency === k ? 'all' : k); syncControls(); renderAll(); });
  }

  /* ════════════════ MARKET TREND ════════════════
     Closed fiscal years and the open one. No projected bar: the feed does not
     forecast. */
  function renderTrend() {
    const el = $('trendList'); if (!el) return;
    const t = D.MARKET_TREND, codes = Object.keys((t && t.series) || {});
    if (!codes.length) { setHTML(el, emptyLine('No market series available.')); return; }
    const last = t.labels.length - 1;
    const rows = codes.map(c => ({ code: c, first: t.series[c][0], now: t.series[c][last] })).sort((a, b) => b.now - a.now);
    const maxRef = d3.max(rows, r => r.now) || 1;
    const total = rows.reduce((a, r) => a + r.now, 0);
    setHTML(el, rows.map(r => {
      const col = naicsColor[r.code];
      const g = r.first > 0 ? Math.round((r.now - r.first) / r.first * 100) : null;
      const gtxt = g == null ? '' : `<span class="mkt-growth ${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '▲ +' : '▼ '}${Math.abs(g)}% since ${esc(t.labels[0])}</span>`;
      return `<div class="mkt-row">
        <div class="mkt-top">
          <div class="mkt-id"><span class="mkt-dot" style="background:${col}"></span><span class="mkt-code">${esc(r.code)}</span></div>
          <div class="mkt-vals"><span class="mkt-val">${fmtM(r.now)}</span>${gtxt}</div>
        </div>
        <div class="mkt-track"><div class="mkt-solid" style="width:${r.now / maxRef * 100}%;background:${col}"></div></div>
        <div class="mkt-foot"><span>${esc(t.labels[0])} · ${fmtM(r.first)}</span><span>${esc(t.labels[last])} · ${fmtM(r.now)}</span></div>
      </div>`;
    }).join('') + `<div class="mkt-note"><span class="tam">${fmtM(total)}</span>&nbsp;obligated across your tracked codes in ${esc(t.labels[last])}</div>`);
  }

  /* ════════════════ RECOMPETE RADAR ════════════════
     Grouped by the month each award ends. The 180-day window is cut at the
     measurement date, so rows already past are MARKED, never dropped. */
  function renderRecompetes() {
    const host = $('rcQuarters'); if (!host) return;
    const rows = D.RECOMPETES || [];
    if (!rows.length) { setHTML(host, emptyLine('No awards with an end date inside the measured window.')); return; }
    const byMonth = new Map();
    rows.forEach(r => {
      const key = (r.end_date || '').slice(0, 7) || 'undated';
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(r);
    });
    setHTML(host, Array.from(byMonth.keys()).sort().map(mk => {
      const list = byMonth.get(mk);
      const label = mk === 'undated' ? 'No end date'
        : new Date(mk + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      return `<div class="rc-q">
        <div class="rc-qhead">${esc(label)}</div>
        ${list.slice(0, 8).map(r => `<div class="rc-card${r.expired ? ' expired' : ''}${(S.agency !== 'all' && agencyKeyOf(r.agency || '') !== S.agency) ? ' dim' : ''}">
            <div class="rc-name">${esc(r.recipient || 'Recipient not stated')}</div>
            <div class="rc-meta"><span class="rc-inc">${esc(r.award_id || '')}</span><span class="rc-val">${fmtM((r.amount || 0) / 1e6)}</span></div>
            <span class="rc-agy">${esc(r.agency || '')} · ${esc(r.naics)}${r.expired ? ' · already ended' : ''}</span>
          </div>`).join('')}
        ${list.length > 8 ? `<div class="rc-more">+${list.length - 8} more</div>` : ''}
      </div>`;
    }).join(''));
  }

  /* ════════════════ RECIPIENTS ════════════════
     No agency column: the feed ranks recipients per NAICS across all agencies,
     so no agency is attributable to a row. */
  function renderIncumbents() {
    const rows = view().incumbents;
    setHTML($('iiBody'), rows.map(r => `<tr>
        <td class="ii-awd">${esc(r.name)}</td>
        <td class="ii-val">${fmtM(r.val)}</td>
        <td class="ii-naics">${esc(r.naics)}</td>
        <td><span class="sa-bdg ${r.sb ? 'sb' : 'prime'}">${r.sb ? 'SB' : '—'}</span></td>
      </tr>`).join('') || `<tr><td colspan="4">${esc('No recipients recorded for ' + S.fy + '.')}</td></tr>`);
  }

  /* ════════════════ PANELS WITH NO SOURCE ════════════════
     Named, not blanked. Each states which measurement it needs. */
  const UNSUPPORTED_HOSTS = {
    'opportunity-matrix': 'scatterSvg',
    'budget-trajectory': 'budgetSvg',
    'pricing': 'priceSvg',
    'ndaa': 'ndaaList'
  };
  function renderUnsupported() {
    (D.unsupported || []).forEach(u => {
      const id = UNSUPPORTED_HOSTS[u.panel]; if (!id) return;
      const node = $(id); if (!node) return;
      const box = document.createElement('div');
      box.className = 'dsb-nosource';
      box.setAttribute('role', 'status');
      box.textContent = 'Not connected — this panel needs ' + u.needs + '.';
      node.replaceWith(box);
    });
    // A legend belongs to the chart it labels, and those charts are gone.
    ['scatterLegend', 'priceLegend'].forEach(l => clear($(l)));
  }

  /* ════════════════ INSIGHT BAR ════════════════ */
  function renderInsight() {
    const v = view();
    let html;
    if (S.state && v.states[S.state]) {
      const s = v.states[S.state];
      html = `<span class="ib-label">Focus</span><b>${esc(s.name)}</b> · ${fmtM(s.val)} obligated in your tracked codes in ${esc(S.fy)}`
        + (s.yoy == null ? ', with no prior-year figure in the top ten.' : `, ${s.yoy >= 0 ? 'up ' + s.yoy.toFixed(0) : 'down ' + Math.abs(s.yoy).toFixed(0)}% on the prior year.`);
    } else if (S.agency !== 'all') {
      const a = v.agencies.find(x => x.key === S.agency);
      html = a
        ? `<span class="ib-label">Agency</span><b>${esc(a.name)}</b> obligated <b>${fmtM(a.val)}</b> in your tracked codes in ${esc(S.fy)}.`
        : `<span class="ib-label">Agency</span>No obligations recorded for that agency in ${esc(S.fy)}.`;
    } else {
      const top = v.agencies[0];
      const st = Object.values(v.states).sort((a, b) => b.val - a.val)[0];
      html = '<span class="ib-label">Read</span>'
        + (top ? `<b>${esc(top.short)}</b> is the largest buyer in your tracked codes` : 'No agency breakdown for this year')
        + (st ? ` and <b>${esc(st.name)}</b> the largest place of performance` : '')
        + ` in ${esc(S.fy)}. Click a state or an agency to scope every panel to it.`;
    }
    setHTML($('insightBar'), '<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"></path><path d="M9 21h6"></path></svg></span><span>' + html + '</span>');
  }

  /* ════════════════ ORCHESTRATION ════════════════ */
  function dsbState() { return (D.STATUS && D.STATUS.state) || 'loading'; }

  /* Replaces the DATA region with one stated notice. Reached only from a
     SETTLED failure, never from the pre-fetch state. */
  function renderUnavailable() {
    const body = document.querySelector('.body');
    if (!body || body.querySelector('.dsb-unavailable')) return;
    const reason = (D.STATUS && D.STATUS.reason) || '';
    const header = body.querySelector('.page-header');
    [...body.children].forEach((el) => { if (el !== header) el.remove(); });
    const box = document.createElement('div');
    box.className = 'dsb-unavailable';
    box.setAttribute('role', 'status');
    box.style.cssText = 'margin:20px 0 0;padding:22px 24px;border:1px solid var(--line-2,rgba(0,0,0,.12));border-radius:10px;max-width:720px';
    const h = document.createElement('div');
    h.style.cssText = 'font-family:Manrope,sans-serif;font-weight:800;font-size:15px;margin-bottom:8px';
    h.textContent = 'Spending data not connected';
    const p = document.createElement('p');
    p.style.cssText = 'font-size:12.5px;line-height:1.65;color:var(--mute,#64748b)';
    p.textContent = reason || 'This view has no live federal spending source connected yet. '
      + 'Nothing is shown rather than showing figures that were never measured.';
    box.appendChild(h); box.appendChild(p);
    body.appendChild(box);
  }

  function renderAll() {
    computeBreaks();
    renderKPIs(); renderLegend(); renderMap(); renderRankList(); renderTreemap();
    renderAgencyList(); renderRecompetes(); renderIncumbents(); renderInsight();
  }

  let built = false;
  function build() {
    if (built) return;
    built = true;
    S.fy = D.FYS[D.FYS.length - 1];
    assignColors();
    renderProvenance();
    buildControls(); renderRankTabs(); renderUnsupported();
    fetch('/vendor/states-10m.json')
      .then(r => r.json()).then(j => { usGeo = j; renderMap(); })
      .catch(() => { console.warn('us-atlas failed'); });
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(() => { renderMap(); renderTreemap(); }, 220); });
  }

  function render() {
    const st = dsbState();
    if (st === 'loading') return;      // nothing drawn, nothing removed
    if (st !== 'ok') return renderUnavailable();
    build();
    renderTrend(); renderAll();
  }

  // A theme flip re-reads every colour through css(), so it needs a full pass
  // — but only once the page has been built. Before the feed settles, and after
  // a failure has replaced the region, there is nothing to re-render.
  function onThemeChange() {
    if (dsbState() !== 'ok' || !built) return;
    renderTrend(); renderAll();
  }

  window.DSB_APP = { render, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
