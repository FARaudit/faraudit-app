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
  // Table sections need their table context to survive the parse: the HTML
  // parser DISCARDS a <tr> that is not inside a table, so a tbody filled
  // through the plain path comes back empty.
  const TABLE_CTX = { TBODY: ['<table>', '</table>', 'tbody'], THEAD: ['<table>', '</table>', 'thead'], TR: ['<table><tbody>', '</tbody></table>', 'tr'] };
  function setHTML(el, html) {
    if (!el) return;
    const ctx = TABLE_CTX[el.tagName];
    const doc = PARSER.parseFromString('<body>' + (ctx ? ctx[0] + html + ctx[1] : html) + '</body>', 'text/html');
    const host = ctx ? doc.querySelector(ctx[2]) : doc.body;
    el.replaceChildren(...(host ? host.childNodes : []));
  }
  const clear = (el) => { if (el) el.replaceChildren(); };

  /* ─── global state ─── */
  const S = { fy: null, state: null, rankMode: 'top', code: null };

  /* The view every panel reads. With no code selected it is the aggregate the
     route built; with one selected it is that code's slice of the SAME build —
     the server derives both through one set of helpers, so a scoped panel can
     never disagree with the total it sits inside.

     The KPI cards are patched rather than recomputed: the two that carry money
     take the code's own figures, and the recipients card takes the length of the
     list actually rendered beside it. The recompete card is left alone because it
     is a window on today across the whole feed and is labelled as such. */
  const view = () => {
    const base = (D.BY_FY && D.BY_FY[S.fy]) || { kpis: [], states: {}, agencies: [], incumbents: [], byCode: {} };
    if (!S.code) return base;
    const c = (base.byCode || {})[S.code];
    if (!c) return base;
    const kpis = (base.kpis || []).map(k => {
      if (/^Obligated/i.test(k.label)) {
        return Object.assign({}, k, {
          val: (c.total / 1000).toFixed(2),
          sub: S.code + ' · ' + String(k.sub || '').replace(/^\d+ tracked codes? · /, ''),
          // A single code has no multi-code series behind it, and the sparkline
          // would otherwise keep drawing the aggregate under a scoped number.
          spark: []
        });
      }
      if (/small business/i.test(k.label)) {
        return Object.assign({}, k, {
          val: c.sb_pct == null ? '—' : c.sb_pct.toFixed(1),
          sub: '$' + (c.sb / 1000).toFixed(2) + 'B of $' + (c.total / 1000).toFixed(2) + 'B · ' + S.code,
          spark: []
        });
      }
      if (/Top recipients/i.test(k.label)) {
        // The SUB-LINE has to move with the count. Patching only the number left
        // "1 of 20 small business" printed beside a list of 7.
        const list = c.incumbents || [];
        const known = list.filter(i => i.sb !== null).length;
        const yes = list.filter(i => i.sb === true).length;
        return Object.assign({}, k, {
          val: String(list.length),
          sub: known === 0
            ? S.code + ' · small-business status not supplied for these'
            : S.code + ' · ' + yes + ' of ' + known + ' small business'
        });
      }
      return k;
    });
    return Object.assign({}, base, {
      kpis,
      states: c.states || {},
      agencies: c.agencies || [],
      incumbents: c.incumbents || []
    });
  };
  const fyIdx = () => D.FYS.indexOf(S.fy);

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

    $('resetBtn').onclick = () => {
      S.fy = D.FYS[D.FYS.length - 1]; S.state = null; S.rankMode = 'top';
      syncControls(); renderRankTabs(); renderAll();
    };
    $('selChipX').onclick = () => { S.state = null; syncControls(); renderAll(); };
  }
  function syncControls() {
    $('segFY').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.fy === S.fy));
    const chip = $('selChip'); const st = view().states[S.state];
    if (S.state && st) { chip.classList.add('show'); $('selChipText').textContent = 'Focus: ' + st.name; }
    else chip.classList.remove('show');
    renderCodePills();
  }


  /* ════════════════ THE CODE FILTER ════════════════
     Rendered from S.code on every state change, NOT once at build. It lived
     inside renderProvenance(), which runs a single time — so the filter worked
     while the pills never showed which code was active, and the page looked
     unscoped while every panel below it was scoped. */
  function renderCodePills() {
    const pills = $('hdrNaicsPills');
    if (!pills) return;
    const tracked = ((D.coverage || {}).tracked) || [];
    const untracked = ((D.coverage || {}).untracked) || [];
    setHTML(pills,
      tracked.map(code => `<button type="button" class="hdr-naics-pill${S.code === code ? ' on' : ''}" data-code="${esc(code)}"
          aria-pressed="${S.code === code ? 'true' : 'false'}"
          title="${S.code === code ? 'Showing only ' + esc(code) + ' — click to show all codes' : 'Show only ' + esc(code)}">${esc(code)}</button>`).join('') +
      untracked.map(code => `<span class="hdr-naics-pill untracked" title="Not pulled for this account yet">${esc(code)}</span>`).join(''));
    pills.querySelectorAll('button[data-code]').forEach(b => {
      b.onclick = () => {
        // Second click on the selected code clears it — the aggregate is a real
        // view, not a null state, so there has to be a way back to it.
        S.code = (S.code === b.dataset.code) ? null : b.dataset.code;
        syncControls(); renderAll();
      };
    });
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

    renderCodePills();
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

  /* Every state carries its abbreviation, whether or not it holds obligations.
     The feed only names the top ten per code, so an unnamed state is one we did
     not measure into the top ten — NOT a state with zero. The label therefore
     comes from the geography, not from the data, and a state with nothing behind
     it is drawn muted so it names the place without asserting a value: the fill
     and the legend carry the number, the text carries only the name. */
  const FIPS_ABBR = {
    '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
    '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
    '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
    '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
    '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
    '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
    '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
    '55': 'WI', '56': 'WY'
  };
  const abbrFor = (d) => (view().states[d.id] || {}).abbr || FIPS_ABBR[d.id] || '';

  function renderLegend() {
    const el = $('geoLegend'); if (!el) return;
    if (!geoBreaks.length) { clear(el); return; }
    const edges = [0].concat(geoBreaks);
    const bands = edges.map((lo, i) => {
      const hi = edges[i + 1];
      const label = hi == null ? fmtM(lo) + '+' : (i === 0 ? '<' + fmtM(hi) : fmtM(lo) + '–' + fmtM(hi));
      return `<span class="sw"><i style="background:${css(GEO_RAMP[i + 1])}"></i>${esc(label)}</span>`;
    });
    /* Every state is named on the map, so the fill of an unnamed-in-the-feed state
       needs its own key — otherwise a muted label reads as a measured zero. */
    bands.push(`<span class="sw"><i style="background:${css(GEO_RAMP[0])}"></i>outside the top ten</span>`);
    setHTML(el, bands.join(''));
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

    const labeled = states.features.filter(d => abbrFor(d) && abbrFor(d) !== 'HI');
    const inlineFeats = [], callItems = [];
    labeled.forEach(d => {
      const ab = abbrFor(d), b = path.bounds(d);
      const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
      if (!FORCE_CALLOUT.has(ab) && (LABEL_LONLAT[ab] || (w >= 13 && h >= 10))) inlineFeats.push(d);
      else callItems.push({ s: ST[d.id] || null, abbr: ab, c: path.centroid(d) });
    });
    g.selectAll('text.geo-lab').data(inlineFeats).join('text')
      .attr('class', d => {
        const s = ST[d.id];
        if (!s) return 'geo-lab nodata';
        return 'geo-lab' + (lvl(s.val) >= 4 ? ' lt' : '');
      })
      .attr('transform', d => { const ab = abbrFor(d); const ov = LABEL_LONLAT[ab]; const p = (ov && proj(ov)) ? proj(ov) : path.centroid(d); return `translate(${p[0]},${p[1]})`; })
      .attr('text-anchor', 'middle').attr('dy', 3).text(d => abbrFor(d));

    callItems.sort((a, b) => a.c[1] - b.c[1]);
    const colX = 930, startY = 170, stepY = 16;
    const cg = g.append('g').attr('class', 'callouts');
    callItems.forEach((it, i) => {
      const ly = startY + i * stepY;
      cg.append('line').attr('x1', it.c[0]).attr('y1', it.c[1]).attr('x2', colX - 6).attr('y2', ly).attr('stroke', css('--mute-2')).attr('stroke-width', .7).attr('opacity', .55);
      cg.append('circle').attr('cx', colX).attr('cy', ly).attr('r', 3.2).attr('fill', geoColor(it.s ? it.s.val : null)).attr('stroke', css('--mute-2')).attr('stroke-width', .6);
      cg.append('text').attr('x', colX + 7).attr('y', ly).attr('dy', 3.2)
        .attr('class', 'geo-callout' + (it.s ? '' : ' nodata')).text(it.abbr);
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
  /* The total the map and the leaderboard are both drawing. It is deliberately
     NOT the headline obligations figure: the feed stores the top ten states per
     code, so this sums the states it ranks and says so. Printing the headline
     here would claim the map covers the whole country, and the legend's own
     "outside the top ten" key says it does not. */
  function renderGeoTotal() {
    const el = $('geoTotal'); if (!el) return;
    const rows = Object.values(view().states);
    if (!rows.length) { clear(el); return; }
    const sum = rows.reduce((n, s) => n + (s.val || 0), 0);
    const scope = S.code ? 'NAICS ' + S.code : 'your codes';
    setHTML(el, '<b>' + fmtM(sum) + '</b><span>' + rows.length + ' states the feed ranks · '
      + esc(scope) + ' · ' + esc(S.fy || '') + '</span>');
  }

  function renderRankList() {
    $('rankTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.rm === S.rankMode));
    let arr = Object.entries(view().states).map(([fips, s]) => ({ fips, ...s }));
    if (S.rankMode === 'growth') {
      arr = arr.filter(s => s.yoy != null).sort((a, b) => b.yoy - a.yoy).slice(0, 12);
      $('rankSub').textContent = 'Fastest year-on-year change · states in both years’ top ten'
        + ' · click a state on the map or in the list to scope every panel to it';
    } else {
      arr = arr.sort((a, b) => b.val - a.val).slice(0, 14);
      $('rankSub').textContent = 'Top states by obligations · ' + S.fy
        + ' · click a state on the map or in the list to scope every panel to it';
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

  /* ════════════════ AGENCY BREAKDOWN ════════════════
     One bar. Small-business dollars arrive per NAICS, never per agency, so no
     SB segment can be drawn here. */
  function renderAgencyList() {
    /* The column header was the literal string FY26 in the markup, so it kept
       naming FY26 while the reader was looking at FY24. A header over a number
       has to name the year that number is. */
    const fyCol = $('agFyCol');
    if (fyCol) fyCol.textContent = String(S.fy || '').replace('FY20', 'FY');
    const rows = view().agencies;
    const prevFy = D.FYS[fyIdx() - 1];
    const prev = prevFy ? (D.BY_FY[prevFy] || { agencies: [] }).agencies : [];
    const max = d3.max(rows, r => r.val) || 1;
    setHTML($('agencyList'), rows.map(a => {
      const was = prev.find(p => p.key === a.key);
      const g = was && was.val > 0 ? (a.val - was.val) / was.val * 100 : null;
      const gcls = g == null ? 'flat' : g > 2 ? 'up' : g < -2 ? 'down' : 'flat';
      const gtxt = g == null ? '—' : gcls === 'flat' ? '— flat' : (g >= 0 ? '▲ ' : '▼ ') + Math.abs(g).toFixed(0) + '%';
      const barW = Math.max(3, a.val / max * 100);
      // One segment per code, in proportion — the agency-by-code split the
      // treemap was drawing, in the panel that already ranks agencies.
      const segs = Object.entries(a.naics).sort((x, y) => y[1] - x[1]).map(([code, v]) =>
        `<i style="width:${(v / a.val) * 100}%;background:${naicsColor[code] || css('--accent')}" title="${esc(code)}"></i>`).join('');
      return `<div class="ag-row" data-agency="${esc(a.key)}" title="${esc(a.name)}">
        <span class="ag-name">${esc(a.short)}</span>
        <div class="ag-bar2"><div class="seg-split" style="width:${barW}%">${segs}</div></div>
        <span class="ag-val">${fmtM(a.val)}</span>
        <span class="ag-grow ${gcls}">${gtxt}</span>
      </div>`;
    }).join('') || emptyLine('No agency breakdown for ' + S.fy + '.'));
    setHTML($('agencyLegend'), Object.entries(naicsColor).map(([c, col]) =>
      `<span class="lg"><i style="background:${col}"></i>${esc(c)}</span>`).join(''));
  }

  /* ════════════════ MARKET TREND ════════════════
     Closed fiscal years and the open one. No projected bar: the feed does not
     forecast. */




  /* ════════════════ AWARD-LEVEL VIEWS ════════════════
     All three read AWARD_ANALYTICS, which is derived from the stored sample of
     the 500 LARGEST awards. That bias is real and every panel below declares it
     rather than letting the reader assume a whole-market view. */
  function anBox() {
    const fyBox = (D.AWARD_ANALYTICS || {})[S.fy] || null;
    if (!fyBox) return null;
    return S.code ? (fyBox.byCode || {})[S.code] || null : fyBox;
  }
  function anScope() { return S.code ? 'NAICS ' + S.code : 'your NAICS codes'; }
  function anNone(what) {
    return '<div class="an-none">' + esc(what) + ' has not been measured for <b>'
      + esc(anScope()) + '</b> yet. <b>That is a gap in our data, not a market with nothing '
      + 'in it.</b> It refreshes nightly.</div>';
  }

  /* ── 3 · HOW BIG IS A DEAL HERE ──────────────────────────────────────────
     ⛔ NO MEAN. These markets are bimodal — a $150,310 electronics job sits in
     the same code as a $1.90B shipbuilding contract, 12,600x apart. An average
     over that describes no award that exists and reads as a target to aim at.
     The middle 50% is a range real awards actually occupy. */
  function renderAwardSize() {
    const host = $('szBody'); if (!host) return;
    const sub = $('szSub'); const box = anBox(); const d = box && box.size;
    if (sub) sub.textContent = 'The middle 50% of awards in ' + anScope() + ' · ' + (S.fy || '');
    if (!d) { setHTML(host, anNone('Award size')); return; }

    // Log positions: a linear rail puts p25 and the median on top of each other
    // when the max is three orders of magnitude away.
    const lg = (n) => Math.log10(Math.max(1, n));
    const lo = lg(d.min || 1), hi = lg(d.max || 1);
    const at = (n) => hi > lo ? ((lg(n) - lo) / (hi - lo)) * 100 : 50;
    const p25 = at(d.p25 || 0), p75 = at(d.p75 || 0), med = at(d.median || 0);

    setHTML(host, '<div class="sz-band">'
      + '<p class="sz-mid">Half of awards fall between <b>' + fmtM((d.p25 || 0) / 1e6)
      + '</b> and <b>' + fmtM((d.p75 || 0) / 1e6) + '</b>.</p>'
      + '<div class="sz-scale"><span class="sz-rail"></span>'
      + '<span class="sz-fill" style="left:' + p25.toFixed(1) + '%;width:'
      + Math.max(1, p75 - p25).toFixed(1) + '%"></span>'
      + '<span class="sz-tick" style="left:0%"><i></i><span>' + fmtM((d.min || 0) / 1e6) + '</span></span>'
      + '<span class="sz-tick" style="left:' + med.toFixed(1) + '%"><i></i><span>median '
      + fmtM((d.median || 0) / 1e6) + '</span></span>'
      + '<span class="sz-tick" style="left:100%"><i></i><span>' + fmtM((d.max || 0) / 1e6) + '</span></span>'
      + '</div>'
      + '<p class="sz-note"><b>' + d.inBand + ' of ' + d.count + '</b> sampled awards sit inside '
      + 'that band. The scale is logarithmic because the smallest and largest are '
      + Math.round((d.max || 1) / Math.max(1, d.min || 1)).toLocaleString('en-US')
      + '× apart. <b>No average is shown</b> — an average across that spread describes no '
      + 'award that exists.'
      + (d.truncated ? ' Based on the largest ' + d.count + ' awards, not the whole market.' : '')
      + '</p></div>');
  }

  /* ── 5 · WHEN THE MONEY MOVES ────────────────────────────────────────────
     A hiring and material-purchase decision, not a chart. Federal buying
     clusters at fiscal year end because unobligated funds expire 30 September. */
  function renderSeasonality() {
    const host = $('snBody'); if (!host) return;
    const sub = $('snSub'); const box = anBox(); const q = box && box.season;
    if (sub) sub.textContent = 'Award starts by federal fiscal month in ' + anScope()
      + ' · ' + (S.fy || '');
    if (!q) { setHTML(host, anNone('Award timing')); return; }

    const max = Math.max.apply(null, q.months.map(m => m.value).concat([1]));
    const grid = q.months.map(m => {
      const isQ4 = m.month >= 7 && m.month <= 9;
      return '<div class="sn-col' + (isQ4 ? ' q4' : '') + '">'
        + '<i class="sn-b" style="height:' + Math.max(2, (m.value / max) * 100).toFixed(1) + '%"></i>'
        + '<span class="sn-l">' + esc(m.label) + '</span></div>';
    }).join('');
    setHTML(host, '<div class="sn-grid">' + grid + '</div>'
      + '<p class="sn-note">'
      + (q.q4Share != null ? '<b>' + q.q4Share.toFixed(0) + '%</b> of sampled value starts in '
        + 'July–September (shaded) — the fiscal fourth quarter, when unobligated funds '
        + 'expire on 30 September. ' : '')
      + (q.peak ? '<b>' + esc(q.peak.label) + '</b> is the heaviest month. ' : '')
      + 'Months with no sampled award show zero rather than being omitted.'
      + (q.truncated ? ' Counted over the largest awards, so this is when BIG money moves.' : '')
      + '</p>');
  }

  /* ── 4 · PRIMES WHO OWE A SUBCONTRACTING PLAN ────────────────────────────
     FAR 19.702: a contract over the threshold awarded to a LARGE business
     requires a subcontracting plan with small-business goals. Those primes are
     legally motivated to find subcontractors, which makes this the
     highest-conversion call list on the tab. */
  function renderPrimeTargets() {
    const host = $('ptList'); if (!host) return;
    const sub = $('ptSub'), cap = $('ptCap'); const box = anBox(); const t = box && box.primes;
    /* ⛔ THE VALUE IS LIFETIME AWARD VALUE, NOT FISCAL-YEAR OBLIGATIONS, and
       labelling it with a fiscal year made two firms exceed the whole market.
       Huntington Ingalls printed $90.76B and Electric Boat $88.57B under
       "in your NAICS codes · FY2026", on a page whose own headline is $30.06B
       obligated for FY2026 — 6x the market, in the same view. This file's own
       AwardSample note says these amounts must never be shown against
       total_obligations; the sum below it did exactly that. The fiscal year is
       which awards were SAMPLED; the money is what those awards are worth over
       their whole life. */
    if (sub) sub.textContent = 'Large primes on awards over $750K in ' + anScope()
      + ' · sampled from ' + (S.fy || '') + ' · combined lifetime award value';
    if (!t || !t.primes.length) {
      setHTML(host, anNone('Prime contractors'));
      if (cap) setHTML(cap, '');
      return;
    }
    setHTML(host, t.primes.slice(0, 10).map(p => '<div class="pt-r">'
      + '<span class="pt-n">' + esc(p.recipient) + '</span>'
      + '<span class="pt-v">' + fmtM(p.value / 1e6) + '</span>'
      + '<span class="pt-m">' + p.contracts + ' contract' + (p.contracts === 1 ? '' : 's')
      + ' · largest ' + fmtM(p.largest / 1e6)
      + (p.agencies.length ? ' · ' + esc(p.agencies.slice(0, 2).join(', '))
        + (p.agencies.length > 2 ? ' +' + (p.agencies.length - 2) : '') : '')
      + '</span></div>').join(''));
    if (cap) setHTML(cap, 'Awards over <b>$' + t.threshold.toLocaleString('en-US')
      + '</b> carry a FAR 19.702 subcontracting-plan requirement when the prime is a large '
      + 'business — so these firms have a documented obligation to find small '
      + 'subcontractors. <b>Values are each prime’s combined LIFETIME award value</b>, not one year of obligations — which is why they run larger than this page’s annual total. '
      + (t.excludedSmallBusiness > 0 ? '<b>' + t.excludedSmallBusiness + '</b> qualifying award'
        + (t.excludedSmallBusiness === 1 ? ' was' : 's were') + ' excluded because the recipient '
        + 'is on this code’s small-business list; they carry no such obligation. ' : '')
      + '<b>Size is not verified for the rest.</b> An award record does not state whether its '
      + 'recipient is large, so this is every prime we could not rule out — not a claim '
      + 'that all ' + t.primes.length + ' are large.');
  }

  /* ════════════════ ROOM LEFT ON CONTRACTS ALREADY AWARDED ════════════════
     Ceiling minus obligated: money a prime can still spend on a contract it
     already holds, without any new competition. A subcontractor already on the
     vehicle reaches it; one waiting for a solicitation never sees it. That is
     why it belongs on a BD tab and not in an accounting report.

     ⛔ IT IS NOT MARGIN. USAspending carries no cost, no rate and no profit
     data, so this is contract CAPACITY and the caption says exactly that. */
  function renderCeilings() {
    const host = $('chList'); if (!host) return;
    const cap = $('chCap'), sub = $('chSub'), big = $('chBig'), say = $('chSay');
    const box = (D.AWARD_ANALYTICS || {})[S.fy] || null;
    const c = box ? (S.code ? ((box.byCode || {})[S.code] || {}).ceilings : box.ceilings) : null;
    const scoped = S.code ? 'NAICS ' + S.code : 'your NAICS codes';
    if (sub) sub.textContent = 'Ceiling minus obligated on the largest awards in ' + scoped
      + ' · ' + (S.fy || '');

    if (!c || !c.rows || !c.rows.length) {
      setHTML(host, '<div class="ch-none">Contract ceilings have not been read for <b>'
        + esc(scoped) + '</b> yet. <b>That is a gap in our data, not contracts with no room '
        + 'left.</b> It refreshes nightly.</div>');
      [big, say, cap].forEach(e => { if (e) setHTML(e, ''); });
      return;
    }

    if (big) big.textContent = fmtM(c.totalHeadroom / 1e6);
    if (say) setHTML(say, 'is committed to contracts in <b>' + esc(scoped) + '</b> that has '
      + '<b>not been obligated yet</b>. It can be spent on the ' + c.sampled + ' award'
      + (c.sampled === 1 ? '' : 's') + ' below without a new competition — so it never appears '
      + 'as a solicitation. Reaching it means being on the vehicle, not watching SAM.');

    /* ROWS WITH NO ROOM DO NOT BELONG IN A PANEL ABOUT ROOM. Seven of
       twenty-four sat at 100% used, printing "$0K" under a heading that offers
       headroom. They are fully obligated — a real state, and stated in the
       caption rather than padding the list. */
    const withRoom = c.rows.filter(r => r.headroom > 0);
    const fullyUsed = c.rows.length - withRoom.length;
    const shown = withRoom.length ? withRoom : c.rows;
    const max = Math.max.apply(null, shown.map(r => Math.abs(r.ceiling)).concat([1]));
    setHTML(host, shown.map(r => {
      const pct = r.ceiling > 0 ? Math.max(0, Math.min(100, (r.obligated / r.ceiling) * 100)) : 0;
      const n = r.contracts || 1;
      const sub2 = (n > 1 ? n + ' contracts · ' : '')
        + 'obligated ' + fmtM(r.obligated / 1e6) + ' of ' + fmtM(r.ceiling / 1e6)
        + ' ceiling · ' + pct.toFixed(0) + '% used'
        + (r.subaward_count != null && r.subaward_count > 0
          ? ' · ' + r.subaward_count.toLocaleString('en-US') + ' subaward'
          + (r.subaward_count === 1 ? '' : 's') + ' already placed' : '');
      return '<div class="ch-r"><span class="ch-n">' + esc(r.recipient) + '</span>'
        + '<span class="ch-h">' + fmtM(r.headroom / 1e6) + '</span>'
        + '<span class="ch-m">' + esc(sub2) + '</span>'
        + '<span class="ch-track" style="width:' + Math.max(4, (Math.abs(r.ceiling) / max) * 100).toFixed(1)
        + '%"><i class="ch-fill" style="width:' + pct.toFixed(1) + '%"></i></span></div>';
    }).join(''));

    if (cap) setHTML(cap, '<b>A capped sample of the largest awards</b> — ' + c.sampled
      + ' of at most ' + (c.cap == null ? c.sampled : c.cap)
      + (c.firms != null && c.firms !== c.sampled ? ', grouped into ' + c.firms + ' firm'
        + (c.firms === 1 ? '' : 's') : '')
      + (c.unreadable ? ', with ' + c.unreadable + ' whose detail could not be read' : '')
      + '. Not the whole market, and <b>not margin</b>: USAspending carries no cost, rate or '
      + 'profit data, so this is contract capacity and nothing about what anyone earns on it. '
      + (c.subcontracting > 0 ? c.subcontracting + ' of these primes have already placed '
        + 'subawards, which is evidence they subcontract rather than an assumption.' : ''));
  }

  /* ════════════════ WHO ACTUALLY BUYS ════════════════
     One level below the agency panel. "Department of Defense" is not a buyer —
     it contains the Navy, the Army, the Air Force and the Defense Logistics
     Agency, each with its own contracting offices and recompete cycle.

     THE TAIL IS COLLAPSED, NOT DROPPED. Measured on 336611 FY2026 the largest
     office is $16.7B and the smallest in the top twelve is under $200K — a bar
     chart across that renders everything below second place as nothing. The
     offices past the visible set are summed into one labelled row so the reader
     can see how much sits outside the list, which discarding them would hide. */
  const BO_SHOW = 8;
  function renderBuyingOffices() {
    const host = $('boList'); if (!host) return;
    const cap = $('boCap'), sub = $('boSub');
    const box = (D.BUYING_OFFICES || {})[S.fy] || null;
    const scoped = S.code ? 'NAICS ' + S.code : 'your NAICS codes';
    // The heading beside it already says "inside them", so this states only what
    // the numbers are scoped to.
    if (sub) sub.textContent = scoped + ' · ' + (S.fy || '');

    if (!box) { setHTML(host, ''); if (cap) setHTML(cap, ''); return; }
    const list = (S.code ? (box.byCode || {})[S.code] || [] : box.offices || [])
      .slice().sort((a, b) => b.amount - a.amount);

    if (!list.length) {
      // A never-pulled column must not render as a market with no buyers.
      setHTML(host, '<div class="bo-none">' + (box.measured
        ? 'No awarding office in <b>' + esc(scoped) + '</b> recorded obligations in ' + esc(S.fy || '') + '.'
        : 'Buying offices have not been pulled for <b>' + esc(scoped) + '</b> yet. '
          + '<b>That is a gap in our data, not a market with no buyers.</b> It refreshes nightly.')
        + '</div>');
      if (cap) setHTML(cap, '');
      return;
    }

    const shown = list.slice(0, BO_SHOW);
    const rest = list.slice(BO_SHOW);
    const restV = rest.reduce((n, o) => n + o.amount, 0);
    const max = Math.max.apply(null, shown.map(o => Math.abs(o.amount)).concat([1]));
    const total = list.reduce((n, o) => n + o.amount, 0);

    let h = shown.map(o => {
      const w = Math.max(2, (Math.abs(o.amount) / max) * 100);
      return '<div class="bo-row"><span class="bo-n">' + esc(o.name) + '</span>'
        + '<span class="bo-v">' + fmtM(o.amount / 1e6) + '</span>'
        + '<i class="bo-bar" style="width:' + w.toFixed(1) + '%"></i></div>';
    }).join('');
    if (rest.length) {
      h += '<div class="bo-row rest"><span class="bo-n">' + rest.length + ' other office'
        + (rest.length === 1 ? '' : 's') + '</span>'
        + '<span class="bo-v">' + fmtM(restV / 1e6) + '</span>'
        + '<i class="bo-bar" style="width:' + Math.max(2, (Math.abs(restV) / max) * 100).toFixed(1) + '%"></i></div>';
    }
    setHTML(host, h);

    if (cap) {
      const lead = shown[0];
      const share = total > 0 ? (lead.amount / total) * 100 : null;
      setHTML(cap, '<b>' + esc(lead.name) + '</b> is the buyer'
        + (share != null ? ', at ' + share.toFixed(0) + '% of obligations in ' + esc(scoped) : '')
        + '. ' + (rest.length
          ? 'The remaining ' + rest.length + ' office' + (rest.length === 1 ? ' is' : 's are')
            + ' collapsed into one row — they are listed here rather than dropped, so the '
            + fmtM(restV / 1e6) + ' outside the visible set stays visible.'
          : 'Every office with obligations is shown.'));
    }
  }

  /* ════════════════ RECOMPETE RADAR ════════════════
     Grouped by the month each award ends. The 180-day window is cut at the
     measurement date, so rows already past are MARKED, never dropped. */
  /* ════════════════ RECOMPETE RADAR ════════════════
     Time no longer separates and size cannot be banded, so INCUMBENT
     CONCENTRATION organises the panel: a firm holding more than one expiring
     contract renders as ONE block, because four contracts with one buying
     office ending in one week is one phone call, not four rows that share a
     name. Everything else lists by end date underneath. */
  const RC_LO = 365, RC_HI = 548;
  const rcMeas = () => String(D.as_of || '').slice(0, 10);
  const rcMs = () => Date.parse(rcMeas() + 'T00:00:00Z');
  const rcDays = (d) => Math.round((Date.parse(d + 'T00:00:00Z') - rcMs()) / 864e5);
  const rcIso = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const rcDm = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB',
    { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rcMoney = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
  /* Sign and digits are separate cells so the sign pins left and the digits
     align on place value — magnitude reads from digit count, which is the only
     honest encoding when the set spans $150,310 to $1.9B. */
  const rcAcct = (n) => { const s = rcMoney(n); return '<i>$</i><b>' + s.slice(1) + '</b>'; };
  const rcCompact = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B'
    : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M'
    : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n);

  const RC_KEEP = { LLC: 1, LLP: 1, LP: 1, PLLC: 1, USA: 1, US: 1, LTD: 1, ACMT: 1, ATEC: 1,
    SKF: 1, BAE: 1, JGW: 1 };
  function rcTc(s) {
    return String(s || '').replace(/[A-Za-z0-9&.']+/g, (w) => {
      const u = w.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (RC_KEEP[u]) return w.toUpperCase();
      if (/\d/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
  }
  const rcByDate = (a, b) => (a.end_date || '').localeCompare(b.end_date || '')
    || (b.amount || 0) - (a.amount || 0);

  function rcScopeLabel() { return S.code ? 'NAICS ' + S.code : 'your NAICS codes'; }

  function rcRow(r, opts) {
    const href = r.award_id
      ? 'https://www.usaspending.gov/search/?hash=&query=' + encodeURIComponent(r.award_id) : null;
    const inner = '<span class="rc-when' + (opts.dim ? ' dim' : '') + '">'
      + '<b class="rc-d">' + esc(rcIso(r.end_date)) + '</b>'
      + '<i class="rc-dd">' + rcDays(r.end_date) + ' days</i></span>'
      + '<span class="rc-name">' + esc(opts.inBlock ? r.award_id : rcTc(r.recipient)) + '</span>'
      + '<span class="rc-val">' + rcAcct(r.amount) + '</span>'
      + '<span class="rc-sub">' + (opts.inBlock ? 'NAICS ' + esc(r.naics)
        : esc(r.agency) + '<span class="sep">·</span>' + esc(r.naics)
          + '<span class="sep">·</span>' + esc(r.award_id)) + '</span>';
    return href
      ? '<a class="rc-row" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'
        + inner + '</a>'
      : '<div class="rc-row">' + inner + '</div>';
  }

  /* NEVER MEASURED IS NOT QUIET. The empty state below states that nothing in
     these codes expires in this window — a claim about the MARKET. Under a
     never-pulled column that claim is false, and the row count cannot tell the
     two apart, so the payload carries the distinction and the panel prints it. */
  function rcUnmeasured() {
    return '<div class="rc-none"><h5>Not measured yet</h5>'
      + '<p>The award-level pull that finds recompetes has not run for '
      + esc(rcScopeLabel()) + ' yet, so this panel has nothing to show. '
      + '<b>That is a gap in our data, not a statement about your market.</b></p>'
      + '<p>It refreshes nightly.</p></div>';
  }

  function rcEmpty() {
    const codes = esc(rcScopeLabel());
    return '<div class="rc-none"><h5>Nothing in ' + codes + ' expires in this window</h5>'
      + '<p>No <b>definitive contract</b> in ' + codes + ' has a period of performance ending '
      + 'between <b>' + RC_LO + '</b> and <b>' + RC_HI + '</b> days from '
      + esc(rcIso(rcMeas())) + '. That is the window a recompete is solicited in.</p>'
      + '<p><b>This does not mean nothing is coming.</b> Three things sit outside what this '
      + 'panel can see, by design:</p><ul>'
      + '<li><b>Delivery and purchase orders are excluded.</b> An order ending is the parent '
      + 'IDIQ placing its next one — nothing is competed and there is nothing to bid.</li>'
      + '<li><b>IDVs are excluded.</b> A recompeted IDIQ is the largest opportunity in this '
      + 'market and it expires on different rules. It is not in these rows.</li>'
      + '<li><b>Work expiring sooner or later than the window is excluded</b> — anything '
      + 'inside ' + RC_LO + ' days is already solicited, and beyond ' + RC_HI + ' is too early '
      + 'to act on.</li></ul>'
      + '<p>An empty panel is a statement about <b>this window and these codes</b>, and '
      + 'nothing wider.</p></div>';
  }

  function renderRecompetes() {
    const list = $('rcList'); if (!list) return;
    const off = (sel, hide) => { const e = document.querySelector(sel); if (e) e.classList.toggle('off', !!hide); };
    const rows = (D.RECOMPETES || []).filter(r => !S.code || r.naics === S.code).sort(rcByDate);

    const sub = $('whSub');
    if (sub) sub.textContent = 'Definitive contracts in ' + rcScopeLabel() + ' ending '
      + RC_LO + '–' + RC_HI + ' days from ' + (rcMeas() ? rcIso(rcMeas()) : 'the measurement date')
      + ' — the window a recompete is solicited in';

    if (!rows.length) {
      setHTML(list, D.RECOMPETES_MEASURED ? rcEmpty() : rcUnmeasured());
      ['#viz', '#cap', '#lede', '.rc-foot', '.rc-head2'].forEach(s => off(s, true));
      return;
    }

    // Group by incumbent across whatever is in scope. The aggregate view is the
    // DEFAULT, so a firm holding contracts in two codes is one block there and
    // splits under a pill — which is correct: a pill is a claim about one market.
    const m = new Map();
    rows.forEach(r => {
      const k = r.recipient || '';
      if (!m.has(k)) m.set(k, { k, rows: [], v: 0 });
      const g = m.get(k); g.rows.push(r); g.v += r.amount || 0;
    });
    const holders = Array.from(m.values());
    const blocks = holders.filter(h => h.rows.length > 1);
    const singles = holders.filter(h => h.rows.length === 1).map(h => h.rows[0]).sort(rcByDate);
    // A summary earns its space only by being SMALLER than the thing it
    // summarises. One row summarised as one bar and one sentence is the panel
    // reading itself back.
    const summarise = rows.length >= 3 && holders.length < rows.length;
    const order = (a, b) => b.rows.length - a.rows.length || b.v - a.v;

    ['#viz', '#cap', '#lede'].forEach(s => off(s, !summarise));
    off('.rc-foot', false); off('.rc-head2', false);

    let h = '';
    blocks.slice().sort(order).forEach(b => {
      const rs = b.rows.slice().sort(rcByDate);
      const ags = Array.from(new Set(rs.map(r => r.agency).filter(Boolean)));
      const span = rcDays(rs[rs.length - 1].end_date) - rcDays(rs[0].end_date);
      h += '<div class="blk"><div class="blk-h">'
        + '<span class="blk-n">' + esc(rcTc(b.k)) + '</span>'
        + '<span class="blk-v">' + rcAcct(b.v) + '</span>'
        + '<span class="blk-s">' + rs.length + ' contracts · '
        + (ags.length === 1 ? esc(ags[0]) : ags.length + ' agencies') + ' · '
        + (span === 0 ? 'all ending ' + rcDm(rs[0].end_date)
          : 'ending ' + rcDm(rs[0].end_date) + '–' + rcDm(rs[rs.length - 1].end_date))
        + ' ' + String(rs[0].end_date).slice(0, 4)
        + (span <= 7 ? ' · inside one week' : '') + '</span></div>'
        + rs.map((r, i) => rcRow(r, { inBlock: 1, dim: i > 0 && r.end_date === rs[i - 1].end_date })).join('')
        + '</div>';
    });
    if (blocks.length) h += '<div class="sec">Single contracts, by end date</div>';
    singles.forEach((r, i) => {
      h += rcRow(r, { dim: i > 0 && r.end_date === singles[i - 1].end_date });
    });
    setHTML(list, h);

    // ── the focal claim, derived ──
    const lead = blocks.slice().sort(order)[0];
    if (lead) {
      const rs = lead.rows.slice().sort(rcByDate);
      const span = rcDays(rs[rs.length - 1].end_date) - rcDays(rs[0].end_date) + 1;
      const ags = Array.from(new Set(rs.map(r => r.agency).filter(Boolean)));
      $('bigN').textContent = lead.rows.length;
      setHTML($('bigSay'), 'contracts held by <b>' + esc(rcTc(lead.k)) + '</b>, worth <b>'
        + rcMoney(lead.v) + '</b> — ' + (ags.length === 1 ? 'one buying agency' : ags.length
        + ' buying agencies') + ', all expiring within <b>' + span + ' days</b> of each other. '
        + 'That is one relationship, not ' + lead.rows.length + ' opportunities.');
    } else {
      $('bigN').textContent = rows.length;
      setHTML($('bigSay'), 'contract' + (rows.length === 1 ? '' : 's') + ' in ' + esc(rcScopeLabel())
        + ' reach' + (rows.length === 1 ? 'es' : '') + ' the end of ' + (rows.length === 1 ? 'its' : 'their')
        + ' period of performance inside the solicitation window. <b>No incumbent here holds more '
        + 'than one</b>, so there is no concentration to point at — the '
        + (rows.length === 1 ? 'row below is' : 'rows below are') + ' the whole finding.');
    }

    if (summarise) {
      const multi = blocks.slice().sort(order);
      const rest = holders.filter(x => x.rows.length === 1);
      const restV = rest.reduce((n, x) => n + x.v, 0);
      const vs = multi.map(x => x.v).concat(restV ? [restV] : []);
      const lo = Math.log10(Math.max(1, Math.min.apply(null, vs)));
      const hi = Math.log10(Math.max(1, Math.max.apply(null, vs)));
      // Blocks = contracts held by one firm. A bar chart topping out at four is
      // a unit count pretending to be a scale, so the unit channel draws units.
      const units = (n) => '<span class="cf-u">' + new Array(n + 1).join('<i></i>') + '</span>';
      let cf = multi.map(x => '<div class="cf-r" data-n="' + x.rows.length + '">'
        + '<span class="cf-rk">' + esc(rcTc(x.k)) + '</span>' + units(x.rows.length)
        + '<span class="cf-meta"><span class="cf-rn">' + x.rows.length + ' contracts</span>'
        + '<span class="cf-rv">' + rcAcct(x.v) + '</span></span></div>').join('');
      // The collapsed row draws NO blocks: it is N separate firms, not one firm
      // holding N, and reusing the unit channel for it would give the row
      // standing for the most contracts the shortest mark on the chart.
      if (rest.length) cf += '<div class="cf-r rest" data-n="0"><span class="cf-rk">'
        + rest.length + ' other firms</span><span class="cf-u none"></span>'
        + '<span class="cf-meta"><span class="cf-rn">1 each</span>'
        + '<span class="cf-rv">' + rcAcct(restV) + '</span></span></div>';
      setHTML($('viz'), '<div class="cf-sort">Ordered by contracts held</div>'
        + '<div class="cf-rows">' + cf + '</div>');
      $('viz').style.height = 'auto';
      setHTML($('cap'), '<b>Where the work is concentrated.</b> Blocks are contracts held by one '
        + 'firm. The collapsed row draws none — it is ' + rest.length + ' separate firms, not '
        + 'one firm holding ' + rest.length + '. Firms holding one contract are listed '
        + 'individually below, with dates and exact values.');

      const fy = {}; rows.forEach(r => { fy[r.end_date] = (fy[r.end_date] || 0) + 1; });
      const top = Object.keys(fy).sort((a, b) => fy[b] - fy[a])[0];
      const amts = rows.map(r => r.amount || 0);
      setHTML($('lede'), '<span><b>' + fy[top] + '</b> of ' + rows.length + ' end on '
        + esc(rcIso(top)) + ' — fiscal year end.</span>'
        + '<span class="d">│</span><span>Values run <b>' + rcCompact(Math.min.apply(null, amts))
        + '</b> to <b>' + rcCompact(Math.max.apply(null, amts)) + '</b>.</span>'
        + '<span class="d">│</span><span><b>' + holders.length + '</b> firms hold these '
        + rows.length + '.</span>');
    }

    const total = rows.reduce((n, r) => n + (r.amount || 0), 0);
    setHTML($('footL'), '<b>' + rows.length + '</b> contract' + (rows.length === 1 ? '' : 's')
      + ' · all shown');
    setHTML($('footR'), 'Combined value <b>' + rcMoney(total) + '</b>');
  }

  /* ════════════════ RECIPIENTS ════════════════
     No agency column: the feed ranks recipients per NAICS across all agencies,
     so no agency is attributable to a row. */
  function renderIncumbents() {
    const rows = view().incumbents;
    /* This block follows the concentration rows, which carry their own year on
       every row. This one follows the year control, so it has to say which year
       it is — an unlabelled table under a labelled one reads as the same year. */
    const sub = $('iiPartSub');
    if (sub) sub.textContent = 'Ranked by obligations · '
      + (S.code ? 'NAICS ' + S.code : 'your NAICS codes') + ' · ' + (S.fy || '')
      + ' · SB flagged from the feed’s own list';
    setHTML($('iiBody'), rows.map(r => `<tr>
        <td class="ii-awd">${esc(r.name)}</td>
        <td class="ii-val">${fmtM(r.val)}</td>
        <td class="ii-naics">${esc(r.naics)}</td>
        <td><span class="sa-bdg ${r.sb === true ? 'sb' : r.sb === false ? 'prime' : 'unknown'}"
            title="${r.sb === null ? 'The feed supplied no small-business list for this code' : ''}"
            >${r.sb === true ? 'SB' : r.sb === false ? 'not SB' : '—'}</span></td>
      </tr>`).join('') || `<tr><td colspan="4">${esc('No recipients recorded for ' + S.fy + '.')}</td></tr>`);
  }

  /* ════════════════ PANELS WITH NO SOURCE ════════════════
     Named, not blanked. Each states which measurement it needs. */
  const UNSUPPORTED_HOSTS = {


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
    } else {
      const top = v.agencies[0];
      const st = Object.values(v.states).sort((a, b) => b.val - a.val)[0];
      html = '<span class="ib-label">Read</span>'
        + (top ? `<b>${esc(top.short)}</b> is the largest buyer in your codes` : 'No agency breakdown for this year')
        + (st ? ` and <b>${esc(st.name)}</b> the largest place of performance` : '')
        // A state selection scopes every panel on the tab, not the leaderboard
        // alone — the sentence understated what the click does.
        + ` in ${esc(S.fy)}. Click a state to scope every panel to it.`;
    }
    setHTML($('insightBar'), '<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"></path><path d="M9 21h6"></path></svg></span><span>' + html + '</span>');
  }

  /* ════════════════ ORCHESTRATION ════════════════ */
  function dsbState() { return (D.STATUS && D.STATUS.state) || 'loading'; }

  /* THE PILL WAS MARKUP, NOT A READING. `data-state="unwired"` and the words NOT
     CONNECTED were typed into defense-spending.html and nothing ever updated
     them, so the page announced itself disconnected above $30B of live figures
     it had just fetched. A reader cannot tell which of the two is lying, so the
     honest assumption is the pill — and they stop reading. It now derives. */
  function renderStatusPill() {
    const pill = $('dsbPill'); if (!pill) return;
    const st = dsbState();
    const label = st === 'ok' ? 'LIVE' : st === 'loading' ? 'LOADING' : 'NOT CONNECTED';
    pill.dataset.state = st === 'ok' ? 'live' : st === 'loading' ? 'loading' : 'unwired';
    pill.textContent = label;
    const when = D.as_of ? String(D.as_of).slice(0, 10) : '';
    pill.title = st === 'ok'
      ? 'USAspending award data' + (when ? ', measured ' + when : '')
      : (D.STATUS && D.STATUS.reason) || 'No federal spending source connected.';
  }

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


  /* ════════════════ IS THERE MONEY HERE FOR A COMPANY THIS SIZE ════════════════
     The share of each code that reaches small business, every measured year. Both
     figures were already stored per (code, year) and the answer was sitting in a
     footnote tile: 2.8% of $28.07B is $0.79B, and THAT is the market, not $28B.

     Not filtered by the year control — the whole point is the direction across
     years, and a single year cannot show it. */
  /* Small-business dollars in the LATEST year that has a measured share. The
     panel sorts and leads on this, so it has to come from the same point the
     percentage does rather than from a different year. */
  function sbDollarsOf(r) {
    const pts = (r && r.points) || [];
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].pct != null) return pts[i].sb || 0;
    return 0;
  }

  function renderSbShare() {
    const el = $('sbShareList'); if (!el) return;
    /* ⛔ ORDERED BY SMALL-BUSINESS DOLLARS, NOT BY CODE NUMBER.
       The payload arrives NAICS-ascending, so the panel led with 332710 —
       29.5%, and $8.88M — and put 336611 last on 3.1%, which is $768.71M. That
       is 86x more money for a small business, presented as the weakest of the
       three. A reader going top to bottom concludes machining is open and
       shipbuilding is closed; the opposite is true.

       The percentage answers "can I get in". The dollars answer "is it worth
       getting in". The panel is titled "is there money here", so it sorts by the
       money and prints it first. The share stays as the second read. */
    const rows = (D.SB_SHARE || []).slice().sort((a, b) => sbDollarsOf(b) - sbDollarsOf(a));
    if (!rows.length) { setHTML(el, '<div class="conc-note">No codes tracked.</div>'); return; }
    setHTML(el, rows.map(r => {
      const pts = r.points || [];
      // Direction is read from the first and last year that HAVE a share. A code
      // that obligated nothing in a year has no share, and calling that 0% would
      // invent a market that closed.
      const known = pts.filter(p => p.pct != null);
      let dir = 'flat', dirTxt = 'no change';
      if (known.length >= 2) {
        const d = known[known.length - 1].pct - known[0].pct;
        if (Math.abs(d) >= 0.1) { dir = d > 0 ? 'up' : 'down'; dirTxt = (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + ' pts'; }
      } else if (known.length < 2) { dirTxt = 'one year only'; }
      const max = Math.max(1, ...known.map(p => p.pct));
      return `<div class="sbs-row">
        <div class="sbs-head"><span class="sbs-code">${esc(r.naics)}</span>
          <span class="sbs-money">${sbDollarsOf(r) > 0 ? fmtM(sbDollarsOf(r)) + ' to small business' : 'none measured'}</span>
          <span class="sbs-dir ${dir}">${esc(dirTxt)}</span></div>
        <div class="sbs-pts">${pts.map(p => `<div class="sbs-pt">
            <div class="sbs-bar"><i style="width:${p.pct == null ? 0 : Math.round((p.pct / max) * 100)}%"></i></div>
            <div class="sbs-pct">${p.pct == null ? '<span class="sbs-unknown">—</span>' : p.pct.toFixed(1) + '%'}</div>
            <div class="sbs-meta">${esc(p.fy)}${p.open ? ' to date' : ''}</div>
            <div class="sbs-meta">${p.pct == null ? 'nothing obligated' : fmtM(p.sb) + ' of ' + fmtM(p.total)}</div>
          </div>`).join('')}</div>
      </div>`;
    }).join(''));
  }

  /* ════════════════ HOW CONCENTRATED IS EACH CODE ════════════════
     What the five largest recipients hold of the code's WHOLE total. Exact: the
     numerator is the feed's top five, the denominator is the code's own stored
     total — not a sum of the rows we happen to hold.

     It states no FIRM COUNT. The feed lists ten recipients per code, so everything
     below tenth is invisible, and counting the visible ones would report our own
     cap as a market size. */
  /* The shades the leader bar draws, darkest first. These were read out of the
     map's ramp by index arithmetic, so removing the map removed the constant and
     left this the only reference to it — a name inside a template literal, which
     no syntax check and no render-caller check can see. It threw on the first
     row with leaders and took the whole page down with it, because renderAll()
     has no per-panel isolation. Declared here, beside its one consumer. */
  const CONC_RAMP = ['--geo-6', '--geo-5', '--geo-4', '--geo-2', '--geo-1'];
  function renderConcentration() {
    const el = $('concList'); if (!el) return;
    /* ⛔ ORDERED BY THE SIZE OF THE CODE, NOT BY CODE NUMBER. The payload arrives
       NAICS-ascending, which led with a $30M code and put a $25.04B one last. It
       also makes the rows line up with the small-business list in the widget
       alongside, which is sorted the same way, so a reader can read across. */
    const rows = (D.CONCENTRATION || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0));
    if (!rows.length) { setHTML(el, '<div class="conc-note">No codes tracked.</div>'); return; }
    setHTML(el, rows.map(r => {
      const leaders = r.leaders || [];
      return `<div class="conc-row">
        <div class="conc-top"><span class="sbs-code">${esc(r.naics)} · ${esc(r.fy)}</span>
          <span class="conc-pct">${r.top5_pct == null ? '—' : r.top5_pct.toFixed(0) + '%'}</span></div>
        <div class="conc-bar">${leaders.map((l, i) => `<i style="width:${l.pct == null ? 0 : Math.min(100, l.pct).toFixed(2)}%;background:${css(CONC_RAMP[Math.min(i, CONC_RAMP.length - 1)])}" title="${esc(l.name)}"></i>`).join('')}</div>
        <div class="conc-lead">${leaders.length ? esc(leaders[0].name) + ' alone holds ' + (leaders[0].pct == null ? '—' : leaders[0].pct.toFixed(0) + '%') : 'No recipients recorded.'}</div>
        <div class="conc-lead">Top five hold ${fmtM(r.top5_val)} of ${fmtM(r.total)}.</div>
      </div>`;
    }).join('') + `<div class="conc-note">The feed lists the top ${esc(String((D.coverage || {}).top_n || 10))} recipients per code, so the number of firms below them is not known here and is not stated.</div>`);
  }


  /* ════════════════ WHO IS WINNING AT YOUR SIZE ════════════════
     The set-aside recipients the feed already stored and only ever used to flag
     rows in the incumbent table beside this one. Those two panels answer
     different questions: the incumbents are who a small shop SUBS TO, these are
     who it COMPETES WITH.

     Percentages are of the SMALL-BUSINESS pot, not of the code. A firm holding
     40% of set-aside dollars in a $29M code is a different fact from 40% of
     $29M, and conflating them overstates it threefold. */
  function renderSbWinners() {
    const el = $('sbWinnersList'); if (!el) return;
    /* Sorted by the small-business dollars in the code, because it now sits
       directly under the share list, which is sorted the same way. Left
       unsorted the two blocks disagreed inside one card: the share list led
       with the $769M code and this one led with the $9M code. */
    let rows = (D.SB_WINNERS || []).slice().sort((a, b) => (b.sb_total || 0) - (a.sb_total || 0));
    if (S.code) rows = rows.filter(r => r.naics === S.code);
    if (!rows.length) { setHTML(el, emptyLine('No set-aside recipients recorded for these codes.')); return; }
    setHTML(el, rows.map(r => {
      const ws = r.winners || [];
      return `<div class="sbw-code"><b>${esc(r.naics)} · ${esc(r.fy)}</b>
          <span>${r.sb_pct == null ? '—' : r.sb_pct.toFixed(1) + '% of the code'} · ${fmtM(r.sb_total)} to small business</span></div>`
        + (ws.length
            ? ws.map(w => `<div class="sbw-row">
                <span class="sbw-nm" title="${esc(w.name)}">${esc(w.name)}</span>
                <span class="sbw-v">${fmtM(w.val)}</span>
                <span class="sbw-p">${w.pct_of_sb == null ? '—' : w.pct_of_sb.toFixed(0) + '%'}</span>
              </div>`).join('')
            : `<div class="sbw-note">No set-aside recipients recorded in this code.</div>`);
    }).join('') + `<div class="sbw-note">Share is of the set-aside dollars in that code, not of the code total. The feed lists the top ${esc(String((D.coverage || {}).top_n || 10))} per code, so firms below them are not shown and their number is not known.</div>`);
  }

  function renderAll() {
    computeBreaks();
    renderKPIs(); renderLegend(); renderMap(); renderGeoTotal(); renderRankList();
    renderStatusPill();
    renderAgencyList(); renderBuyingOffices(); renderAwardSize(); renderSeasonality();
    renderPrimeTargets(); renderCeilings(); renderRecompetes(); renderIncumbents(); renderInsight();
    // Both read every measured year, so they are painted with the rest but do
    // not change with the year control.
    renderSbShare(); renderConcentration(); renderSbWinners();
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
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderMap, 220); });
  }

  function render() {
    const st = dsbState();
    if (st === 'loading') return;      // nothing drawn, nothing removed
    if (st !== 'ok') return renderUnavailable();
    build();
    renderAll();
  }

  // A theme flip re-reads every colour through css(), so it needs a full pass
  // — but only once the page has been built. Before the feed settles, and after
  // a failure has replaced the region, there is nothing to re-render.
  function onThemeChange() {
    if (dsbState() !== 'ok' || !built) return;
    renderAll();
  }

  window.DSB_APP = { render, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
