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
        ${list.slice(0, 8).map(r => {
          // The award id is the key to the public record, so the card opens it.
          const href = r.award_id ? 'https://www.usaspending.gov/search/?hash=&query=' + encodeURIComponent(r.award_id) : null;
          const inner = `<div class="rc-name">${esc(r.recipient || 'Recipient not stated')}</div>
            <div class="rc-meta"><span class="rc-inc">${esc(r.award_id || '')}</span><span class="rc-val">${fmtM((r.amount || 0) / 1e6)}</span></div>
            <span class="rc-agy">${esc(r.agency || '')} · ${esc(r.naics)}${r.expired ? ' · already ended' : ''}</span>`;
          return href
            ? `<a class="rc-card${r.expired ? ' expired' : ''}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
            : `<div class="rc-card${r.expired ? ' expired' : ''}">${inner}</div>`;
        }).join('')}
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
        + ` in ${esc(S.fy)}. Click a state to scope the leaderboard to it.`;
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


  /* ════════════════ IS THERE MONEY HERE FOR A COMPANY THIS SIZE ════════════════
     The share of each code that reaches small business, every measured year. Both
     figures were already stored per (code, year) and the answer was sitting in a
     footnote tile: 2.8% of $28.07B is $0.79B, and THAT is the market, not $28B.

     Not filtered by the year control — the whole point is the direction across
     years, and a single year cannot show it. */
  function renderSbShare() {
    const el = $('sbShareList'); if (!el) return;
    const rows = D.SB_SHARE || [];
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
  function renderConcentration() {
    const el = $('concList'); if (!el) return;
    const rows = D.CONCENTRATION || [];
    if (!rows.length) { setHTML(el, '<div class="conc-note">No codes tracked.</div>'); return; }
    setHTML(el, rows.map(r => {
      const leaders = r.leaders || [];
      return `<div class="conc-row">
        <div class="conc-top"><span class="sbs-code">${esc(r.naics)} · ${esc(r.fy)}</span>
          <span class="conc-pct">${r.top5_pct == null ? '—' : r.top5_pct.toFixed(0) + '%'}</span></div>
        <div class="conc-bar">${leaders.map((l, i) => `<i style="width:${l.pct == null ? 0 : Math.min(100, l.pct).toFixed(2)}%;background:${css(GEO_RAMP[Math.max(1, 5 - i)])}" title="${esc(l.name)}"></i>`).join('')}</div>
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
    let rows = D.SB_WINNERS || [];
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
    renderKPIs(); renderLegend(); renderMap(); renderRankList();
    renderAgencyList(); renderRecompetes(); renderIncumbents(); renderInsight();
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
