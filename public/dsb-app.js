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
  let scopeNote = '';

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

  /* ════════════════ THE SCOPE IS SHARED, NOT LOCAL ════════════════
     `S.fy` and `S.code` used to be private to this file, which is why the three
     panels that read them could not become their own destination. They now
     mirror `window.BD_SCOPE` — one scope, addressable in the URL, carried
     between pages. `S.state` and `S.rankMode` stay local: nothing outside this
     page renders a state focus or a leaderboard tab.

     BD_SCOPE is optional on purpose. A page that forgets the script tag keeps
     working on its own local scope rather than throwing — the panels are the
     product, the scope is how they are addressed. */
  const SCOPE = window.BD_SCOPE || null;

  function setScope(patch) {
    if (patch && 'fy' in patch) S.fy = patch.fy;
    if (patch && 'code' in patch) S.code = patch.code;
    if (SCOPE) SCOPE.set(patch);
    syncControls(); renderAll();
  }

  /* ════════════════ CONTROLS ════════════════ */
  function buildControls() {
    if (!$('segFY')) return;
    setHTML($('segFY'), D.FYS.map(f =>
      `<button data-fy="${esc(f)}" class="${f === S.fy ? 'active' : ''}">${esc(f.replace('FY20', "'"))}</button>`).join(''));
    $('segFY').querySelectorAll('button').forEach(b => b.onclick = () => { setScope({ fy: b.dataset.fy }); });

    $('resetBtn').onclick = () => {
      S.state = null; S.rankMode = 'top';
      // The state focus and the rank tab are page-local — nothing else reads
      // them. The YEAR and the CODE are not, so reset publishes them.
      setScope({ fy: D.FYS[D.FYS.length - 1], code: null });
      renderRankTabs();
    };
    $('selChipX').onclick = () => { S.state = null; syncControls(); renderAll(); };
  }
  function syncControls() {
    if (!$('segFY')) { renderCodePills(); return; }
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
        setScope({ code: (S.code === b.dataset.code) ? null : b.dataset.code });
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
    // A link can carry a year or a code this feed never measured. Showing the
    // fallback silently would put one year's numbers under another year's URL,
    // so the substitution is stated where the measurement date is stated.
    if (scopeNote) bits.push('<span class="dsb-gap">' + esc(scopeNote) + '</span>');
    setHTML(el, bits.join('<span class="dsb-prov-dot">·</span>'));

    renderCodePills();
  }

  /* ⛔ EVERY RENDERER RETURNS WHEN ITS HOST IS ABSENT, and that is the mounting
     mechanism, not defensive noise. This file renders a SET of panels; a page
     that carries only some of their hosts gets only those panels, one renderer
     set, no fork. Most already guarded — these did not, and an unguarded
     `$(id).querySelectorAll` throws, which takes the whole page down rather
     than skipping one panel. */
  /* ════════════════ WHICH WAY YOUR CODES ARE MOVING ════════════════
     MARKET_TREND has been in the payload since the first deploy and nothing
     drew it. It carries the most decision-useful pattern on the tab: every
     tracked code roughly DOUBLED and then roughly HALVED across three years.

     ⛔ THE OPEN YEAR IS MARKED, and that is the whole risk in the panel. The
     last label is obligations TO DATE, not a full year, so an unmarked bar
     reports a collapse that has not happened. The flag comes from the payload
     (`MARKET_TREND.open`, parallel to `labels`) rather than from a date
     comparison here — the builder already knows which year is running, and a
     second derivation is a second thing to be wrong.

     The two headline figures live in this panel's header because they are the
     CURRENT POINT of this same series. As a separate KPI strip they read as an
     independent measurement, and a reader had no way to see that the $30.06B
     is the third bar of every row below it. */
  function renderMarketYoY() {
    const host = $('myoyBody'); if (!host) return;
    const T = D.MARKET_TREND || { labels: [], series: {}, open: [] };
    const labels = T.labels || [];
    const openFlags = Array.isArray(T.open) ? T.open : [];
    const codes = Object.keys(T.series || {})
      .filter(c => !S.code || c === S.code)
      .sort((a, b) => (last(T.series[b]) || 0) - (last(T.series[a]) || 0));

    renderNowFigures();

    const sub = $('myoySub');
    if (sub) sub.textContent = labels.length
      ? 'Obligations by fiscal year in ' + (S.code ? 'NAICS ' + S.code : 'each tracked code')
        + ' · ' + labels[0] + '–' + labels[labels.length - 1]
      : '';

    if (!codes.length || !labels.length) {
      setHTML(host, emptyLine('No fiscal-year series for these codes.'));
      setHTML($('myoyNote'), '');
      return;
    }

    setHTML(host, codes.map(code => {
      const vals = T.series[code] || [];
      const max = Math.max.apply(null, vals.map(v => Math.abs(v || 0)).concat([1]));
      // Direction is first-to-last across the whole series. It is NOT a
      // forecast and it is NOT annualised: the last point may be a part year,
      // which is exactly why the bar beside it is marked.
      const first = vals[0], lastV = last(vals);
      const chg = first > 0 && lastV != null ? ((lastV - first) / first) * 100 : null;
      const dir = chg == null ? 'flat' : chg > 2 ? 'up' : chg < -2 ? 'down' : 'flat';
      const dirTxt = chg == null ? 'no prior-year base'
        : dir === 'flat' ? 'flat across the series'
        : (chg > 0 ? '▲ ' : '▼ ') + Math.abs(chg).toFixed(0) + '% vs ' + esc(labels[0]);
      const col = naicsColor[code] || css('--accent');
      return '<div class="myoy-r">'
        + '<div class="myoy-rh"><span class="myoy-code">' + esc(code) + '</span>'
        + '<span class="myoy-dir ' + dir + '">' + dirTxt + '</span></div>'
        + labels.map((lb, i) => {
          const v = vals[i] || 0;
          const isOpen = openFlags[i] === true;
          return '<div class="myoy-y' + (isOpen ? ' open' : '') + '">'
            + '<span class="myoy-yl">' + esc(String(lb).replace('FY20', "'")) + '</span>'
            + '<span class="myoy-track"><i style="width:' + Math.max(1, (Math.abs(v) / max) * 100).toFixed(1)
            + '%;background:' + col + '"></i></span>'
            + '<span class="myoy-yv">' + fmtM(v) + '</span>'
            + '<span class="myoy-yt">' + (isOpen ? 'to date' : 'final') + '</span>'
            + '</div>';
        }).join('')
        + '</div>';
    }).join(''));

    const openLabels = labels.filter((_, i) => openFlags[i] === true);
    setHTML($('myoyNote'), openLabels.length
      ? '<b>' + esc(openLabels.join(' · ')) + ' is still open</b> — that bar is obligations '
        + 'to date, not a full year, so the fall into it is not a measured decline. The '
        + 'closed years beside it are final.'
      : 'Every year shown is closed and final.');
  }

  /* The two figures the page used to carry in a four-up strip. They are the
     current point of the series above, so they are stated with it rather than
     recomputed: `view()` already scopes them to a selected code. */
  function renderNowFigures() {
    const el = $('myoyNow'); if (!el) return;
    const cards = (view().kpis || []).filter(c => c && c.val != null);
    if (!cards.length) { clear(el); return; }
    setHTML(el, cards.map(c => '<div class="myoy-now-k" data-tone="' + esc(c.tone) + '">'
      + '<p class="lbl">' + esc(c.label) + '</p>'
      + '<div class="v">' + esc(c.val) + '<span>' + esc(c.unit) + '</span></div>'
      + '<div class="foot">' + esc(c.sub) + '</div></div>').join(''));
  }
  const last = (a) => (a && a.length ? a[a.length - 1] : null);

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
    // Guarded on the HOST, not just on the topology: a page that mounts these
    // renderers without a map has no #geoSvg, and d3's empty-selection tolerance
    // is not a contract worth leaning on.
    if (!$('geoSvg')) return;
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
  const hideTip = () => { const t = $('geoTip'); if (t) t.style.display = 'none'; };

  /* ════════════════ RANKED LIST ════════════════
     Two modes. A third, keyed to your firm's own activity, would need a
     dimension this feed does not carry. */
  function renderRankTabs() {
    if (!$('rankTabs')) return;
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
    if (!$('rankTabs') || !$('rankList')) return;
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
      /* ONE LINE PER STATE. The abbreviation sat on the row above its own full
         name, which is the same fact twice at double the height. Rank, code,
         name, bar, value and change now share a line — nothing is lost and the
         list stops outrunning the map it belongs to. */
      return `<div class="rank-row${sel}" data-fips="${esc(s.fips)}">
        <span class="rank-n">${i + 1}</span>
        <span class="rank-st">${esc(s.abbr)}</span>
        <span class="rank-note">${esc(s.name)}</span>
        <span class="rank-bar"><i style="width:${Math.max(6, s.val / max * 100)}%"></i></span>
        <span class="rank-val">${fmtM(s.val)}</span>${yo}
      </div>`;
    }).join('') || emptyLine('No state breakdown for ' + S.fy + '.'));
    $('rankList').querySelectorAll('.rank-row').forEach(r => r.onclick = () => { const f = r.dataset.fips; S.state = (S.state === f ? null : f); syncControls(); renderAll(); });
  }

  /* ════════════════ THE DEPARTMENTS ════════════════
     LINES, NOT A RANKED BLOCK. Twelve rows to draw one real department and
     eleven rounding errors is a chart whose whole message is one number.

     ⛔ BUT THE CUT IS BY WEIGHT, NOT BY RANK, and the difference is the panel.
     Collapsing everything below first place holds for FY2024 and FY2025, where
     Defense takes 96.1% and 97.8%. In FY2026 — the year this page OPENS on —
     Defense takes 72.8% and Homeland Security takes 26.0%: $7.81B, against
     $0.80B the year before. Ranking second does not make a buyer a rounding
     error, and "11 other departments" would have hidden the largest movement on
     the tab. Every department carrying at least AG_MATERIAL_PCT of the total is
     NAMED; only the genuine tail collapses, summed and labelled.

     Small-business dollars arrive per NAICS, never per agency, so no SB split
     can be drawn here either. */
  const AG_MATERIAL_PCT = 1;
  const AG_MAX_NAMED = 4;
  function renderAgencyList() {
    if (!$('agencyList')) return;
    const sub = $('agSub');
    const rows = (view().agencies || []).slice().sort((a, b) => b.val - a.val);
    if (sub) sub.textContent = 'Obligations in ' + (S.code ? 'NAICS ' + S.code : 'your codes')
      + ' · ' + (S.fy || '');
    if (!rows.length) { setHTML($('agencyList'), emptyLine('No agency breakdown for ' + S.fy + '.')); return; }

    const prevFy = D.FYS[fyIdx() - 1];
    const prev = prevFy ? (D.BY_FY[prevFy] || { agencies: [] }).agencies : [];
    const total = rows.reduce((n, a) => n + (a.val || 0), 0);
    const pct = (v) => total > 0 ? (v / total) * 100 : null;
    // At least one row always shows: a market with a single buyer still has one.
    const named = rows.filter((a, i) => i === 0
      || (i < AG_MAX_NAMED && (pct(a.val) == null || pct(a.val) >= AG_MATERIAL_PCT)));
    const rest = rows.slice(named.length);
    const restV = rest.reduce((n, a) => n + (a.val || 0), 0);

    const line = (a) => {
      const was = prev.find(p => p.key === a.key);
      const g = was && was.val > 0 ? (a.val - was.val) / was.val * 100 : null;
      const gcls = g == null ? 'flat' : g > 2 ? 'up' : g < -2 ? 'down' : 'flat';
      const gtxt = g == null ? 'no prior-year figure'
        : gcls === 'flat' ? 'flat on ' + esc(prevFy || 'the prior year')
        : (g >= 0 ? '▲ ' : '▼ ') + Math.abs(g).toFixed(0) + '% on ' + esc(prevFy || 'the prior year');
      const sh = pct(a.val);
      return '<div class="ag-one" title="' + esc(a.name) + '">'
        + '<b>' + esc(a.short) + '</b>'
        + '<span class="ag-one-v">' + fmtM(a.val) + '</span>'
        + (sh != null ? '<span class="ag-one-s">' + sh.toFixed(1) + '% of the total</span>' : '')
        + '<span class="ag-one-g ' + gcls + '">' + gtxt + '</span></div>';
    };

    setHTML($('agencyList'), named.map(line).join('')
      + (rest.length
        ? '<div class="ag-one rest">' + rest.length + ' smaller department'
          + (rest.length === 1 ? '' : 's') + '<span class="ag-one-v">' + fmtM(restV) + '</span>'
          + '<span class="ag-one-s">'
          + (pct(restV) != null ? pct(restV).toFixed(1) + '% between them' : '') + '</span>'
          + '<span class="ag-one-g flat">each under ' + AG_MATERIAL_PCT + '%, summed not dropped</span></div>'
        : ''));
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

  /* ── HOW BIG IS A DEAL HERE — CUT, and this note is why ──────────────────
     Its p25–p75 was pooled across every tracked code at once, so a $30M code
     and a $25B code produced one band: $69K to $23M, a 333x spread that
     describes no award that exists. The panel was honest about having no mean
     and still could not be read. A per-code band would be a different panel
     built on a different derivation; until that exists, nothing here is better
     than a range nobody can act on. `AWARD_ANALYTICS.size` stays in the payload
     and stays derived — this is a rendering decision, not a data deletion. */

  /* ── 5 · WHEN THE MONEY MOVES — TWO NUMBERS, NOT TWELVE BARS ─────────────
     ⛔ THE WHOLE PAYLOAD OF THIS PANEL IS TWO NUMBERS: the share of value
     starting in the fiscal fourth quarter, and the heaviest month. The
     twelve-column grid drew them at four times the height and left the reader
     to squint the peak out of a bar. If a chart's entire message is one or two
     numbers, it should be those numbers.

     Federal buying clusters at fiscal year end because unobligated funds expire
     30 September, so the number carries an action: capacity and bid timing
     before that date. */
  function renderSeasonality() {
    const host = $('snBody'); if (!host) return;
    const sub = $('snSub'); const box = anBox(); const q = box && box.season;
    if (sub) sub.textContent = 'Award starts by federal fiscal month in ' + anScope()
      + ' · ' + (S.fy || '');
    if (!q) { setHTML(host, anNone('Award timing')); return; }

    // The Q4 months are still identified by the FEDERAL fiscal calendar, not a
    // calendar year — the figure means nothing if July–September is not the
    // fourth quarter.
    const q4 = q.months.filter(m => m.month >= 7 && m.month <= 9).map(m => m.label);
    setHTML(host, '<div class="sn-two">'
      + '<div class="sn-fig">'
      + '<span class="sn-n">' + (q.q4Share != null ? q.q4Share.toFixed(0) + '<i>%</i>' : '—')
      + '</span>'
      + '<span class="sn-k">of sampled value starts in ' + esc(q4.length ? q4[0] + '–' + q4[q4.length - 1] : 'July–September')
      + '</span></div>'
      + '<div class="sn-fig">'
      + '<span class="sn-n">' + (q.peak ? esc(q.peak.label) : '—') + '</span>'
      + '<span class="sn-k">is the heaviest month</span></div>'
      + '</div>'
      + '<p class="sn-note">'
      + 'July–September is the fiscal fourth quarter, when unobligated funds '
      + '<b>expire on 30 September</b> — so plan capacity and get bids in before that date, '
      + 'not after it. '
      + (q.truncated ? 'Counted over the largest awards, so this is when <b>BIG</b> money '
        + 'moves, not every award. ' : '')
      + 'Months with no sampled award count as zero rather than being omitted.'
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
    /* ⛔ THESE ARE SUB-AGENCIES, NOT BUYING OFFICES. The values are "Department of
       the Navy", "U.S. Coast Guard", "Defense Logistics Agency" — the tier below
       a department, not the office that signs. A buying office looks like "SUP OF
       SHIPBUILDING CONV AND REPAIR", and this feed carries none: the award-search
       endpoint returns null for that field. The copy states the tier it has. */
    if (sub) sub.textContent = 'Services and agencies inside the departments below · '
      + scoped + ' · ' + (S.fy || '');

    if (!box) { setHTML(host, ''); if (cap) setHTML(cap, ''); return; }
    const list = (S.code ? (box.byCode || {})[S.code] || [] : box.offices || [])
      .slice().sort((a, b) => b.amount - a.amount);

    if (!list.length) {
      // A never-pulled column must not render as a market with no buyers.
      setHTML(host, '<div class="bo-none">' + (box.measured
        ? 'No agency inside those departments recorded obligations in <b>' + esc(scoped) + '</b> in ' + esc(S.fy || '') + '.'
        : 'The agency split has not been pulled for <b>' + esc(scoped) + '</b> yet. '
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
      h += '<div class="bo-row rest"><span class="bo-n">' + rest.length + ' other agenc'
        + (rest.length === 1 ? 'y' : 'ies') + '</span>'
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
          ? 'The remaining ' + rest.length + ' agenc' + (rest.length === 1 ? 'y is' : 'ies are')
            + ' collapsed into one row — they are listed here rather than dropped, so the '
            + fmtM(restV / 1e6) + ' outside the visible set stays visible.'
          : 'Every agency with obligations is shown.'));
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
      /* ⛔ NOT RENDERED AT ALL ON A REPEAT, rather than painted transparent. The
         old rule set color:transparent, which is text at 1.00:1 — invisible to the
         reader and still ANNOUNCED to a screen reader, so the one audience that
         could not see the duplicate was the one that heard it twice. */
      + (opts.dim ? '' : '<i class="rc-dd">' + rcDays(r.end_date) + ' days</i>')
      + '</span>'
      + '<span class="rc-name">' + esc(opts.inBlock ? r.award_id : rcTc(r.recipient)) + '</span>'
      + '<span class="rc-val">' + rcAcct(r.amount) + '</span>'
      + '<span class="rc-sub">' + (opts.inBlock ? 'NAICS ' + esc(r.naics)
        : esc(r.agency) + '<span class="sep">·</span>' + esc(r.naics)
          + '<span class="sep">·</span>' + esc(r.award_id)) + '</span>';
    const row = href
      ? '<a class="rc-row" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'
        + inner + '</a>'
      : '<div class="rc-row">' + inner + '</div>';
    /* The call block sits OUTSIDE the anchor. A mailto or tel nested inside the
       row's own link is invalid markup, and the browser resolves it by dropping
       one of the two — not a choice to leave to the parser. */
    return '<div class="rc-item">' + row + rcCall(r) + '</div>';
  }

  /* ════════════════ WHO YOU ACTUALLY CALL ════════════════
     A recompete row carries the BUYING OFFICE that signed. The officer directory
     keys on SAM's own office leaf, and the two agree byte-for-byte: measured on
     21 real rows, 12 matched with ZERO normalisation.

     ⛔ EXACT MATCH ONLY. Nothing here folds, trims or fuzzy-matches. The cost of
     a bad match is a real officer's phone number printed beside someone else's
     contract, and a miss that says so beats a plausible guess.

     ⛔ AND IT NEVER SAYS "THE OFFICER ON THIS CONTRACT". Neither source records
     who signed. These are the officers posting FROM that office in your codes,
     which is a different and weaker claim — the copy makes it.

     Four states, kept apart because only ONE of them is a fact about the
     directory; collapsing them would state that fact in three cases it does not
     hold:
       no office on the row   · the feed had not captured one
       lookup still running   · not "no officer"
       lookup failed          · not "no officer"
       office known, no match · the only case that says something real */
  const RC_CALL_SHOW = 2;
  function rcCall(r) {
    const office = r && r.office;
    if (!office) {
      return '<div class="rc-call none"><span class="rc-call-x">no buying office on this award'
        + '</span></div>';
    }
    const box = D.OFFICERS || { state: 'loading', offices: {} };
    const head = '<span class="rc-call-o">' + esc(office) + '</span>';
    if (box.state === 'loading') {
      return '<div class="rc-call pending">' + head + ' · looking up contracting officers…</div>';
    }
    if (box.state !== 'ok') {
      return '<div class="rc-call none">' + head + ' · <b>the contracting-officer feed '
        + 'could not be read</b>, so nobody is listed. That is our gap, not an office with '
        + 'no officers.</div>';
    }
    const list = (box.offices || {})[office] || [];
    /* ⛔ THE OFFICE STILL SHOWS. It is the only fact this row has about who signs,
       and dropping it would make a looked-up row look like one never looked up —
       the four states have to stay apart. What does NOT repeat is the sentence
       explaining it: measured on 21 live rows, ten carried this same explanation
       at 36px each. The chip states the fact; the panel foot states it once. */
    if (!list.length) {
      return '<div class="rc-call none">' + head
        + '<span class="rc-call-x">no contact held</span></div>';
    }
    const shown = list.slice(0, RC_CALL_SHOW);
    return '<div class="rc-call">' + head
      + '<span class="rc-call-lede">Contracting officers who post from this office '
      + '&mdash; not necessarily the officer on this contract</span>'
      + shown.map(function (o) {
        return '<span class="rc-p">'
          + '<b>' + esc(o.name) + '</b>'
          + '<a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>'
          + (o.phone ? '<a href="tel:' + esc(String(o.phone).replace(/[^0-9+]/g, ''))
              + '">' + esc(o.phone) + '</a>' : '')
          + '<i>' + o.notices + ' notice' + (o.notices === 1 ? '' : 's') + ' in your codes</i>'
          + '</span>';
      }).join('')
      + (list.length > shown.length
          ? '<span class="rc-call-more">+' + (list.length - shown.length)
            + ' more at this office</span>' : '')
      + '</div>';
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
      ['#lede', '.rc-foot', '.rc-head2'].forEach(s => off(s, true));
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

    ['#lede'].forEach(s => off(s, !summarise));
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

    /* ⛔ THE UNIT CHART SAID WHAT ONE CLAUSE SAYS. It drew a row per firm with a
       block per contract — measured, two firms at four and two, fifteen at one
       each — under a caption explaining how to read it. Chart plus caption cost
       123px to carry "two firms hold six of the twenty-one; the other fifteen hold
       one each", which is a sentence. It is now that sentence, in the lede that was
       already stating the other three facts about this set. */
    if (summarise) {
      const multi = blocks.slice().sort(order);
      const rest = holders.filter(x => x.rows.length === 1);
      const held = multi.reduce((n, x) => n + x.rows.length, 0);
      const fy = {}; rows.forEach(r => { fy[r.end_date] = (fy[r.end_date] || 0) + 1; });
      const top = Object.keys(fy).sort((a, b) => fy[b] - fy[a])[0];
      const amts = rows.map(r => r.amount || 0);
      setHTML($('lede'), '<span><b>' + fy[top] + '</b> of ' + rows.length + ' end on '
        + esc(rcIso(top)) + ' — fiscal year end.</span>'
        + '<span class="d">│</span><span>Values run <b>' + rcCompact(Math.min.apply(null, amts))
        + '</b> to <b>' + rcCompact(Math.max.apply(null, amts)) + '</b>.</span>'
        + '<span class="d">│</span><span><b>' + holders.length + '</b> firms hold these '
        + rows.length + (multi.length
          ? ' — <b>' + multi.length + '</b> of them hold <b>' + held + '</b> between them, '
            + 'the other <b>' + rest.length + '</b> hold one each.'
          : '.') + '</span>');
    }

    const total = rows.reduce((n, r) => n + (r.amount || 0), 0);
    /* ⛔ SAID ONCE, NOT ONCE PER ROW. Every row still shows its own office and its
       own state — the four states stay apart — but the SENTENCE explaining what a
       missing contact means belongs to the panel, not to each of the ten rows that
       had it. It also answers, on the page, the only question worth asking about
       this list: how many of these can you actually call today. */
    const box = D.OFFICERS || { state: 'loading', offices: {} };
    const withOffice = rows.filter(r => r && r.office);
    const callable = box.state === 'ok'
      ? withOffice.filter(r => ((box.offices || {})[r.office] || []).length).length : null;
    setHTML($('footL'), '<b>' + rows.length + '</b> contract' + (rows.length === 1 ? '' : 's')
      + ' · all shown'
      + (callable == null ? ''
        : ' · <b>' + callable + '</b> carr' + (callable === 1 ? 'ies' : 'y') + ' a contracting '
          + 'officer you can call'
          + (withOffice.length - callable > 0
            ? '. The other ' + (withOffice.length - callable) + ' name an office where no officer '
              + 'has posted in your codes recently, so we hold no contact — that is our gap, not an '
              + 'office without officers' : '')
          + (rows.length - withOffice.length > 0
            ? '. ' + (rows.length - withOffice.length) + ' carr'
              + (rows.length - withOffice.length === 1 ? 'ies' : 'y')
              + ' no buying office on the award at all' : '')
          + '.'));
    setHTML($('footR'), 'Combined value <b>' + rcMoney(total) + '</b>');
  }

  /* ════════════════ RECIPIENTS ════════════════
     No agency column: the feed ranks recipients per NAICS across all agencies,
     so no agency is attributable to a row. */
  function renderIncumbents() {
    if (!$('iiBody')) return;
    const rows = view().incumbents;
    /* This block follows the concentration rows, which carry their own year on
       every row. This one follows the year control, so it has to say which year
       it is — an unlabelled table under a labelled one reads as the same year. */
    /* ⛔ THE SIZE COLUMN IS NOT DEAD, IT IS QUIET — measured 19 `not SB` against
       1 `SB` in FY2026. That ratio IS the finding, and it says the opposite of
       what a competitor list would: almost everyone here is a large prime, so
       for a small sub these are TEAMING TARGETS, not rivals. The single small
       business is marked so it does not vanish into nineteen rows that look
       alike. */
    const sub = $('iiPartSub');
    if (sub) sub.textContent = 'Ranked by obligations · '
      + (S.code ? 'NAICS ' + S.code : 'your NAICS codes') + ' · ' + (S.fy || '')
      + ' · SB flagged from the feed’s own list';
    setHTML($('iiBody'), rows.map(r => `<tr${r.sb === true ? ' class="is-sb"' : ''}>
        <td class="ii-awd">${esc(r.name)}</td>
        <td class="ii-val">${fmtM(r.val)}</td>
        <td class="ii-naics">${esc(r.naics)}</td>
        <td><span class="sa-bdg ${r.sb === true ? 'sb' : r.sb === false ? 'prime' : 'unknown'}"
            title="${r.sb === null ? 'The feed supplied no small-business list for this code' : ''}"
            >${r.sb === true ? 'SB' : r.sb === false ? 'not SB' : '—'}</span></td>
      </tr>`).join('') || `<tr><td colspan="4">${esc('No recipients recorded for ' + S.fy + '.')}</td></tr>`);

    const cap = $('iiCap');
    if (cap) {
      const known = rows.filter(r => r.sb !== null);
      const sb = known.filter(r => r.sb === true).length;
      const notSb = known.filter(r => r.sb === false).length;
      setHTML(cap, known.length
        ? '<b>' + notSb + ' of these ' + known.length + '</b> are recorded as <b>not</b> small '
          + 'business' + (sb ? ', and ' + sb + ' as small business' : '') + '. For a small '
          + 'subcontractor that makes this a list of <b>teaming targets, not competitors</b> — '
          + 'the firms holding the work you would sub into. Who you compete with is the '
          + 'set-aside list in the panel alongside.'
        : 'The feed supplied no small-business list for these codes, so no row here can be '
          + 'called large or small — and none is.');
    }
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
    if (!$('insightBar')) return;
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
    let rows = (D.SB_SHARE || []).slice().sort((a, b) => sbDollarsOf(b) - sbDollarsOf(a));
    if (!rows.length) { setHTML(el, '<div class="conc-note">No codes tracked.</div>'); return; }
    /* ⛔ THE CODE PILL SCOPES THIS BLOCK, like the set-aside list beneath it. Two
       blocks in one card must name the same market.

       ⛔ THE YEAR CONTROL DOES NOT. The panel exists to show direction across
       years, and one year cannot carry it. Year and code are different axes; only
       the code is a claim about which market this is. */
    if (S.code) {
      const scoped = rows.filter(r => r.naics === S.code);
      if (!scoped.length) {
        setHTML(el, '<div class="conc-note">The small-business share has not been measured for '
          + '<b>NAICS ' + esc(S.code) + '</b> yet. <b>That is a gap in our data, not a code that '
          + 'reaches no small business.</b> It refreshes nightly.</div>');
        return;
      }
      rows = scoped;
    }
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
      /* ⛔ THE BAR AND THE NUMBER SAID THE SAME THING. Each point drew a bar
         scaled to the row's own maximum and printed the percentage directly
         beneath it — the same value, encoded twice, at double the height. The
         number stays; the bar goes. */
      return `<div class="sbs-row">
        <div class="sbs-head"><span class="sbs-code">${esc(r.naics)}</span>
          <span class="sbs-money">${sbDollarsOf(r) > 0 ? fmtM(sbDollarsOf(r)) + ' to small business' : 'none measured'}</span>
          <span class="sbs-dir ${dir}">${esc(dirTxt)}</span></div>
        <div class="sbs-pts">${pts.map(p => `<div class="sbs-pt">
            <div class="sbs-yr">${esc(p.fy)}${p.open ? ' · to date' : ''}</div>
            <div class="sbs-pct">${p.pct == null ? '<span class="sbs-unknown">—</span>' : p.pct.toFixed(1) + '%'}</div>
            <div class="sbs-meta">${p.pct == null ? 'nothing obligated' : fmtM(p.sb) + ' of ' + fmtM(p.total)}</div>
          </div>`).join('')}</div>
      </div>`;
    }).join('')
      /* ⚠ SHARE, NOT GROWTH. The figure is sb_obligations ÷ total_obligations
         per code and year, and the direction beside it is the change in that
         SHARE between the first and last measured year — in percentage POINTS.
         A share can fall while the dollars rise, so a caption that said
         "growth" would be false in exactly the case that matters. */
      + '<div class="sbs-cap">Each figure is the <b>share</b> of that code reaching small '
      + 'business — set-aside dollars over the code’s whole obligations, that year. The '
      + 'arrow is the change in that <b>share</b> between the first and last measured year, '
      + 'in percentage points: <b>it is not growth</b>, and a share can fall in a year the '
      + 'dollars rise.</div>');
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
    /* ⛔ ORDERED BY THE SIZE OF THE CODE, NOT BY CODE NUMBER. The payload arrives
       NAICS-ascending, which led with a $30M code and put a $25.04B one last. It
       also makes the rows line up with the small-business list in the widget
       alongside, which is sorted the same way, so a reader can read across. */
    let rows = (D.CONCENTRATION || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0));
    if (!rows.length) { setHTML(el, '<div class="conc-note">No codes tracked.</div>'); return; }
    /* ⛔ THE CODE PILL SCOPES THIS PANEL. It did not, and the panel it shares a
       widget with always did — pick 336412 and the recipients table beneath it
       narrowed to 336412 while this block went on leading with 336611. Two blocks
       under one heading, answering the same question about different markets,
       with nothing on screen saying so. The pill is not a hint: the insight bar
       promises a click scopes every panel, and a panel that opts out silently is
       the one a reader will quote.

       A code with no measured concentration gets its OWN empty state. Falling
       back to every code would answer a question nobody asked, and an empty block
       would read as a code no one holds. */
    if (S.code) {
      const scoped = rows.filter(r => r.naics === S.code);
      if (!scoped.length) {
        setHTML(el, '<div class="conc-note">Concentration has not been measured for <b>NAICS '
          + esc(S.code) + '</b> yet. <b>That is a gap in our data, not a code no one holds.</b> '
          + 'It refreshes nightly.</div>');
        return;
      }
      rows = scoped;
    }
    /* ⛔ THE FIVE COLOUR SEGMENTS WERE DECORATION. The percentage is the
       information: 70%, 91%, 34% is the finding, and a reader cannot name the
       fourth-largest holder off a 3%-wide band anyway. The number leads, one
       sentence names the largest holder, and the segments are gone — which also
       retires the ramp constant that once outlived its own definition and blanked
       the whole tab. */
    setHTML(el, rows.map(r => {
      const leaders = r.leaders || [];
      const lead = leaders[0];
      return `<div class="conc-row">
        <div class="conc-top">
          <span class="conc-pct">${r.top5_pct == null ? '—' : r.top5_pct.toFixed(0) + '%'}</span>
          <span class="conc-id"><span class="sbs-code">${esc(r.naics)}</span><span class="conc-fy">${esc(r.fy)}</span></span>
          <span class="conc-lead">${lead
            ? 'held by the top five &mdash; <b>' + esc(lead.name) + '</b> alone holds '
              + (lead.pct == null ? '—' : lead.pct.toFixed(0) + '%') + ', or '
              + fmtM(r.top5_val) + ' of ' + fmtM(r.total) + ' across the five'
            : 'No recipients recorded.'}</span>
        </div>
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
    /* THE TAIL IS COLLAPSED, NOT DROPPED — the treatment the buying-office panel
       already gives its overflow. Ten rows per code across three codes is thirty
       rows to answer "who competes at my size", and that answer is at the top of
       each list. The rest are summed into one labelled row, so the dollars
       outside the visible set stay visible and the count stays true. */
    const SBW_SHOW = 4;
    setHTML(el, rows.map(r => {
      const ws = r.winners || [];
      const shown = ws.slice(0, SBW_SHOW);
      const rest = ws.slice(SBW_SHOW);
      const restV = rest.reduce((n, w) => n + (w.val || 0), 0);
      const restP = rest.reduce((n, w) => n + (w.pct_of_sb || 0), 0);
      return `<div class="sbw-code"><b>${esc(r.naics)} · ${esc(r.fy)}</b>
          <span>${r.sb_pct == null ? '—' : r.sb_pct.toFixed(1) + '% of the code'} · ${fmtM(r.sb_total)} to small business</span></div>`
        + (shown.length
            ? shown.map(w => `<div class="sbw-row">
                <span class="sbw-nm" title="${esc(w.name)}">${esc(w.name)}</span>
                <span class="sbw-v">${fmtM(w.val)}</span>
                <span class="sbw-p">${w.pct_of_sb == null ? '—' : w.pct_of_sb.toFixed(0) + '%'}</span>
              </div>`).join('')
              + (rest.length ? `<div class="sbw-row rest">
                <span class="sbw-nm">${rest.length} more set-aside recipient${rest.length === 1 ? '' : 's'} we hold</span>
                <span class="sbw-v">${fmtM(restV)}</span>
                <span class="sbw-p">${restP > 0 ? restP.toFixed(0) + '%' : '—'}</span>
              </div>` : '')
            : `<div class="sbw-note">No set-aside recipients recorded in this code.</div>`);
    }).join('') + `<div class="sbw-note">Share is of the set-aside dollars in that code, not of the code total. The feed lists the top ${esc(String((D.coverage || {}).top_n || 10))} per code, so firms below them are not shown and their number is not known — the collapsed row stands for the ones we hold, never for the whole tail.</div>`);
  }

  function renderAll() {
    computeBreaks();
    renderMarketYoY(); renderLegend(); renderMap(); renderGeoTotal(); renderRankList();
    renderStatusPill();
    renderAgencyList(); renderBuyingOffices(); renderSeasonality();
    renderPrimeTargets(); renderCeilings(); renderRecompetes(); renderIncumbents(); renderInsight();
    // Both read every measured year, so they are painted with the rest but do
    // not change with the year control.
    renderSbShare(); renderConcentration(); renderSbWinners();
  }

  let built = false;
  function build() {
    if (built) return;
    built = true;
    /* ⛔ A REQUESTED YEAR IS NOT A MEASURED ONE. reconcile() returns what can
       actually be shown plus a sentence naming what was asked for; printing the
       fallback without the sentence is a page lying about its own year. */
    const rec = SCOPE
      ? SCOPE.reconcile(D.FYS, ((D.coverage || {}).tracked) || [])
      : { fy: D.FYS[D.FYS.length - 1], code: null, note: '' };
    S.fy = rec.fy || D.FYS[D.FYS.length - 1];
    S.code = rec.code || null;
    scopeNote = rec.note || '';
    /* PUBLISH WHAT IS ACTUALLY ON SCREEN, so the next destination inherits it.
       Reading a URL persists nothing on its own, and continuity between pages is
       the whole reason the scope is shared. The url option is off here, leaving
       the address bar exactly as the reader typed it — when a request cannot be
       honoured the note beside the measurement date says so, and rewriting the
       URL to the fallback would erase the reader's own request. */
    if (SCOPE) SCOPE.set({ fy: S.fy, code: S.code }, { url: false });
    assignColors();
    renderProvenance();
    buildControls(); renderRankTabs(); renderUnsupported();
    if ($('geoSvg')) fetch('/vendor/states-10m.json')
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
