/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Opportunities — render + viz + interactions.

   NULL-HONESTY CONTRACT:
   - fit === null      → neutral "no score" tile/ring, excluded from Avg Fit,
                         never a 0 and never a TRAP verdict.
   - ceiling === null  → "—", excluded from $ sums (counted as "unpriced").
   - days === null     → "no deadline", excluded from closing counts/urgency.
   - incumbent === null→ no incumbent claim of any kind.
   - DSO.FEED_STATE loading/error/empty render explicit states — the page
     never shows a plausible number it didn't compute from live rows.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const D = window.DSO;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // Every string below originates in the SAM feed (notice titles, agency names,
  // incumbent names are all poster-controlled text) and is interpolated into
  // innerHTML — so it MUST be escaped. Covers attribute context too (" and ').
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Stated values are shown at their real magnitude: a $45,000 ceiling is
  // "$45K", never "$0.0M" (a rounded-to-zero display of a real number is the
  // same false-zero class this page exists to eliminate).
  const money = (m) => {
    if (m == null) return '—';
    if (m >= 1) return '$' + (m % 1 === 0 ? m : m.toFixed(1)) + 'M';
    const k = m * 1000;
    return '$' + (k >= 1 ? (k % 1 === 0 ? k : k.toFixed(1)) + 'K' : Math.round(m * 1e6).toLocaleString());
  };

  const S = { naics: new Set(), naicsInit: false, stage: 'all', sa: 'all', q: '', view: null, sort: 'fit', sel: null };

  // Set-aside register: five poles, each with its own fill AND its own mark, so
  // the encoding survives greyscale and colour-blindness. SoleSource must never
  // share a register with Full — one means anyone may compete, the other means
  // you may not. UNKNOWN is a token we could not read and gets its own unread
  // register rather than borrowing either answer.
  //
  // This is the ONLY place a pole becomes a class or a label. It is a top-level
  // function so a gate can execute it; the previous expression was inlined in a
  // template literal, unreachable to any test, which is how three opposite
  // meanings shipped in one register.
  const SA_RESTRICTED = ['SB', 'SDVOSB', '8(a)', 'HUBZone', 'WOSB', 'EDWOSB'];
  function saRender(s) {
    if (s === 'SoleSource') return { cls: 'sa-barred', label: 'SOLE SOURCE', reg: 'barred' };
    if (s === 'UNKNOWN') return { cls: 'sa-unread', label: 'SET-ASIDE UNREAD', reg: 'unread' };
    if (s === 'SB-Partial') return { cls: 'sa-partial', label: 'SB · PARTIAL', reg: 'partial' };
    if (SA_RESTRICTED.includes(s)) return { cls: 'sa-restricted', label: String(s).toUpperCase(), reg: 'restricted' };
    return { cls: 'sa-open', label: 'FULL & OPEN', reg: 'open' };
  }

  // Sort comparators. `-Infinity - -Infinity` is NaN, and a comparator that
  // returns NaN is non-transitive: Array#sort then leaves that group in an
  // implementation-defined order that can differ between engines and between
  // calls on the same data. All three sorts had that path — `value` on EVERY
  // row (SAM publishes no ceiling for an open solicitation, so both terms were
  // always the null sentinel), `fit` and `deadline` whenever two rows both
  // lacked the key. Compare explicitly, and park a missing value at the END
  // regardless of direction: a row with no stated value is not "cheapest" and
  // not "dearest", it is absent, and it must not migrate to the top because the
  // customer changed the sort. Same shape as cmpNumUndatedLast in
  // dashboard-live.js, which fixed this exact defect on Past Audits.
  function cmpMissingLast(xv, yv, dir) {
    const x = xv == null ? Infinity : xv, y = yv == null ? Infinity : yv;
    if (x === y) return 0;
    if (!isFinite(x)) return 1;
    if (!isFinite(y)) return -1;
    return dir * (x - y);
  }
  // Named so a gate can execute it. The comparators were previously written
  // inline inside the render function and no test could reach them.
  function sortRows(data, key) {
    if (key === 'fit') return data.sort((a, b) => cmpMissingLast(a.fit, b.fit, -1) || cmpMissingLast(a.days, b.days, 1));
    if (key === 'deadline') return data.sort((a, b) => cmpMissingLast(a.days, b.days, 1));
    return data.sort((a, b) => cmpMissingLast(a.ceiling, b.ceiling, -1));
  }

  const fitColor = (f) => f >= 85 ? css('--green-600') : f >= 70 ? css('--accent') : f >= 60 ? css('--amber-600') : css('--red-600');
  const fitTier = (f) => f >= 85 ? 'Strong fit' : f >= 70 ? 'Workable' : 'Stretch';
  const urg = (d) => d == null ? 'none' : d <= 3 ? 'crit' : d <= 7 ? 'warn' : 'ok';

  // One-line advisory drawn ONLY from fields we actually have. No invented
  // incumbency claims, no invented win-rate statistics, no scores for
  // un-audited rows.
  function pursuitInsight(o) {
    const saElig = ['SB', 'SB-Partial', 'SDVOSB', '8(a)', 'HUBZone', 'WOSB', 'EDWOSB'].includes(o.sa);
    const upstream = o.stage === 'sources' || o.stage === 'presol';
    // Reason-slot rule: a reason states what is true of the NOTICE or BUYER, never
    // of our pipeline. Gate: test/public/_opportunities-reason-slot.test.ts.
    if (o.sa === 'SoleSource') {
      return `Sole-source intent published — competition is not open, and a capability challenge inside the response window is the only route in${o.days != null ? ` (${o.days}d left)` : ''}.`;
    }
    if (o.stage === 'notice') {
      return `Pre-solicitation signal — no solicitation document posted yet. The buyer has moved on this requirement before any RFP exists.`;
    }
    if (o.sa === 'UNKNOWN') {
      return `Set-aside not recognised on this notice — eligibility is unread, not open. Confirm against the notice before committing bid effort.`;
    }
    if (upstream) return `Upstream window — shape the requirement before the RFP drops${saElig ? `, and it's ${esc(o.sa)}-eligible` : ''}.`;
    if (o.incumbent != null && o.fit != null) return `Recompete read: incumbent on record is <em>${esc(o.incumbent)}</em> — lead on your ${o.fit}/100 audited fit and price.`;
    if (o.incumbent != null) return `Incumbent on record: <em>${esc(o.incumbent)}</em> — expect a recompete posture.`;
    if (o.fit != null) return `${fitTier(o.fit)} at ${o.fit}/100 — ${o.days != null && o.days <= 7 ? 'move now, the window is closing.' : 'time to prep a strong bid.'}`;
    return `Not yet audited — run the audit for a scored, grounded read.`;
  }

  /* ─── controls ─── */
  function buildControls() {
    $('stageSeg').innerHTML = D.STAGES.map(s => `<button data-stage="${s.key}" class="${s.key === S.stage ? 'active' : ''}">${s.label}</button>`).join('');
    $('stageSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.stage = b.dataset.stage; S.view = null; sync(); renderAll(); });

    $('saFilters').innerHTML = D.SETASIDES.map(s => `<button class="fpill ${s === S.sa ? 'active' : ''}" data-sa="${s}">${s === 'all' ? 'All' : esc(saRender(s).label)}</button>`).join('');
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
    // Saved views override the discrete filters but keep NAICS. The stage
    // segment stays on 'all': the upstream view's own predicate admits BOTH
    // presol and sources rows, and forcing S.stage='sources' here used to
    // reject every pre-solicitation before that predicate ran.
    S.stage = 'all'; S.sa = 'all';
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
      // Rows with no NAICS on record always pass the NAICS filter — they
      // cannot be excluded by a code they don't carry.
      if (o.naics && S.naics.size && !S.naics.has(o.naics)) return false;
      if (S.stage !== 'all' && o.stage !== S.stage) return false;
      if (S.sa !== 'all' && o.sa !== S.sa) return false;
      if (S.q && !(o.title + ' ' + o.agency + ' ' + o.id + ' ' + o.office).toLowerCase().includes(S.q)) return false;
      if (S.view === 'hot' && !(o.fit != null && o.fit >= 85 && o.days != null && o.days <= 10)) return false;
      // Set-aside-eligible view now admits the full restricted enumeration.
      // SoleSource is deliberately EXCLUDED: a directed buy is not an eligibility
      // opportunity, it is a contest-or-assert-capability play (own band).
      if (S.view === 'sb' && !['SB', 'SB-Partial', 'SDVOSB', '8(a)', 'HUBZone', 'WOSB', 'EDWOSB'].includes(o.sa)) return false;
      if (S.view === 'recompete' && o.incumbent == null) return false;
      if (S.view === 'upstream' && !(o.stage === 'presol' || o.stage === 'sources')) return false;
      return true;
    });
  }

  const stateFoot = () =>
    D.FEED_STATE === 'loading' ? 'connecting to the feed…'
    : D.FEED_STATE === 'error' ? 'feed unavailable — not computed'
    : D.FEED_STATE === 'no-profile' ? 'no NAICS codes on file — nothing to scope on'
    : 'feed is empty';

  /* ─── KPIs ─── */
  function renderKPIs() {
    let cards;
    if (D.FEED_STATE !== 'live') {
      // No live rows → no numbers. '—' is the only honest value here.
      const foot = stateFoot();
      cards = [
        { lbl: 'Open Pursuits', val: D.FEED_STATE === 'empty' ? 0 : '—', unit: '', foot, tone: 'blue' },
        { lbl: 'Addressable Ceiling', val: '—', unit: '', foot, tone: 'green' },
        { lbl: 'Closing ≤ 7 Days', val: D.FEED_STATE === 'empty' ? 0 : '—', unit: '', foot, tone: 'red' },
        { lbl: 'Avg Fit Score', val: '—', unit: '', foot, tone: 'blue' }
      ];
    } else {
      const f = filtered();
      const priced = f.filter(o => o.ceiling != null);
      const ceil = priced.reduce((a, o) => a + o.ceiling, 0);
      const unpriced = f.length - priced.length;
      const closing = f.filter(o => o.days != null && o.days <= 7).length;
      const scored = f.filter(o => o.fit != null);
      const avgFit = scored.length ? Math.round(scored.reduce((a, o) => a + o.fit, 0) / scored.length) : null;
      cards = [
        { lbl: 'Open Pursuits', val: f.length, unit: '', foot: 'matching your filters', tone: 'blue' },
        priced.length
          ? { lbl: 'Addressable Ceiling', val: ceil >= 1000 ? '$' + (ceil / 1000).toFixed(2) : '$' + Math.round(ceil), unit: ceil >= 1000 ? 'B' : 'M', foot: unpriced ? `stated values only · ${unpriced} unpriced` : 'total stated value in view', tone: 'green' }
          : { lbl: 'Addressable Ceiling', val: '—', unit: '', foot: f.length ? 'no stated values in view' : 'no rows in view', tone: 'green' },
        { lbl: 'Closing ≤ 7 Days', val: closing, unit: '', foot: 'with a stated deadline', tone: 'red' },
        avgFit != null
          ? { lbl: 'Avg Fit Score', val: avgFit, unit: '/100', foot: `across ${scored.length} audited pursuit${scored.length === 1 ? '' : 's'}`, tone: 'blue' }
          : { lbl: 'Avg Fit Score', val: '—', unit: '', foot: 'no audited pursuits in view', tone: 'blue' }
      ];
    }
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}">
      <p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
  }

  /* ─── fit ring / tile ─── */
  function fitRing(f, lg) {
    const r = lg ? 19 : 15, c = 2 * Math.PI * r, sz = lg ? 46 : 38;
    if (f == null) {
      return `<div class="fit-ring${lg ? ' lg' : ''}" title="Not yet audited — no fit score"><svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">
        <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="${lg ? 4 : 3.5}"/>
      </svg><span class="fr-num" style="color:var(--mute-2)">—</span></div>`;
    }
    const off = c * (1 - f / 100), col = fitColor(f);
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
    if (f == null) {
      // Un-audited rows get a neutral tile — a 0/TRAP here would assert a
      // verdict that nothing has computed.
      return `<div class="fit-tile tone-na" title="Not yet audited"><span class="ft-num">—</span><span class="ft-lbl">NO SCORE</span></div>`;
    }
    const v = fitVerdict(f);
    return `<div class="fit-tile tone-${v.tone}"><span class="ft-num">${f}</span><span class="ft-lbl">${v.label}</span></div>`;
  }

  /* ─── bubble chart ─── */
  function renderBubble() {
    const svg = d3.select('#bubbleSvg'); svg.selectAll('*').remove();
    const W = $('bubbleSvg').clientWidth || 640, H = 380;
    const m = { t: 22, r: 18, b: 38, l: 52 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const all = filtered();
    // Only rows with BOTH a stated deadline and a stated ceiling can be
    // placed truthfully on a deadline-vs-ceiling plane.
    const data = all.filter(o => o.days != null && o.ceiling != null);
    const excluded = all.length - data.length;

    if (D.FEED_STATE !== 'live' || data.length === 0) {
      const msg = D.FEED_STATE === 'loading' ? 'Connecting to the SAM.gov feed…'
        : D.FEED_STATE === 'error' ? 'Feed unavailable — nothing to plot (no sample data is shown).'
        : all.length === 0 ? 'No pursuits in view.'
        : 'No rows carry both a stated deadline and a stated ceiling — nothing can be plotted truthfully.';
      svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .attr('style', 'font-family:"IBM Plex Mono",monospace;font-size:12px').attr('fill', css('--mute')).text(msg);
      $('bubbleLegend').innerHTML = '';
      return;
    }

    const x = d3.scaleLinear().domain([0, 80]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 35]).range([H - m.b, m.t]);
    // clamp(true): compliance_score is 0–100, and an unclamped sqrt scale
    // extrapolates NEGATIVE below the domain floor (fit 30 → r = −7.8 → the
    // browser drops the circle and the row silently vanishes from the chart).
    const r = d3.scaleSqrt().domain([55, 100]).range([5, 22]).clamp(true);
    // Un-audited rows have NO size to encode. They plot at the floor radius
    // with a dashed outline + no fill so the size channel never implies a
    // score the engine did not compute.
    const RADIUS_NA = 5;
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
      .attr('r', d => d.fit == null ? RADIUS_NA : r(d.fit))
      .attr('fill', d => d.fit == null ? 'none' : D.STAGE_META[d.stage].color).attr('opacity', .6)
      .attr('stroke', d => D.STAGE_META[d.stage].color).attr('stroke-width', d => d.fit == null ? 1.2 : .5)
      .attr('stroke-dasharray', d => d.fit == null ? '2,2' : null)
      .on('mousemove', (ev, d) => {
        const tip = $('bubTip');
        tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12px;margin-bottom:3px;max-width:200px">${esc(d.title)}</div>
          <div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">${esc(d.agency)} · fit <b style="color:#fff">${d.fit == null ? 'not audited' : d.fit}</b><br>${money(d.ceiling)} ceiling · <b style="color:#fff">${d.days}d</b> left · ${D.STAGE_META[d.stage].label}</div>`;
        tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 230) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      })
      .on('mouseleave', () => $('bubTip').style.display = 'none')
      .on('click', (ev, d) => { S.sel = (S.sel === d.id ? null : d.id); renderBubble(); renderActList(); renderList(); });

    const excludedNote = excluded > 0
      ? `<span class="lg" style="color:var(--mute-2)">· ${excluded} of ${all.length} not plotted (no stated $ or deadline)</span>`
      : '';
    $('bubbleLegend').innerHTML = Object.entries(D.STAGE_META).map(([k, v]) => `<span class="lg"><i style="background:${v.color}"></i>${v.label}</span>`).join('') + excludedNote;
  }

  /* ─── act now list ─── */
  function renderActList() {
    if (D.FEED_STATE !== 'live') {
      $('actList').innerHTML = `<div class="empty">${
        D.FEED_STATE === 'loading' ? 'Connecting to the SAM.gov feed…'
        : D.FEED_STATE === 'error' ? 'Feed unavailable — no data shown.'
        : 'The feed is empty right now.'}</div>`;
      return;
    }
    // Deadline-less rows can't be ranked by urgency — they sort last.
    const data = filtered().slice().sort((a, b) => {
      if (a.days == null && b.days == null) return (b.fit ?? -1) - (a.fit ?? -1);
      if (a.days == null) return 1;
      if (b.days == null) return -1;
      return (a.days - b.days) || ((b.fit ?? -1) - (a.fit ?? -1));
    }).slice(0, 7);
    $('actList').innerHTML = data.length ? data.map(o => {
      const u = urg(o.days);
      const daysHtml = o.days == null
        ? `<div class="act-days ok" style="color:var(--mute-2)">—<small>NO DEADLINE</small></div>`
        : `<div class="act-days ${u}">${o.days}d<small>${(o.type || '').toUpperCase()}</small></div>`;
      return `<div class="act-row${S.sel === o.id ? ' sel' : ''}" data-id="${o.id}">
        ${fitRing(o.fit)}
        <div class="act-info"><div class="act-title">${esc(o.title)}</div><div class="act-agy">${esc(o.agency)}${o.ceiling != null ? ' · ' + money(o.ceiling) : ''}</div></div>
        ${daysHtml}
      </div>`;
    }).join('') : `<div class="empty">No pursuits match your filters.</div>`;
    $('actList').querySelectorAll('.act-row').forEach(r => r.onclick = () => { S.sel = (S.sel === r.dataset.id ? null : r.dataset.id); renderBubble(); renderActList(); renderList(); scrollToCard(r.dataset.id); });
  }

  /* ─── pursuit list ─── */
  function renderList() {
    if (D.FEED_STATE !== 'live') {
      $('plistCount').innerHTML = stateFoot();
      if (D.FEED_STATE === 'no-profile') {
        // Brain's shape: the honest-empty state IS the profile form, not a message
        // pointing somewhere else. A new account is then never empty for longer
        // than it takes to type a code, and onboarding needs no separate surface.
        $('plist').innerHTML = `<div class="empty" id="plistProfile"></div>`;
        if (window.FAR_PROFILE_EDITOR) {
          window.FAR_PROFILE_EDITOR.mount($('plistProfile'), {
            onSaved: function (saved) { if (saved && saved.length) location.reload(); }
          });
        }
      } else {
        $('plist').innerHTML = `<div class="empty">${
          D.FEED_STATE === 'loading' ? 'Connecting to the SAM.gov feed…'
          : D.FEED_STATE === 'error' ? 'SAM.gov feed unavailable — no data shown. Nothing on this page is sample data; retry shortly.'
          : 'The live SAM.gov feed is empty right now — no notices matched in the current window.'}</div>`;
      }
      return;
    }
    let data = sortRows(filtered().slice(), S.sort);

    const priced = data.filter(o => o.ceiling != null);
    const sum = priced.reduce((s, o) => s + o.ceiling, 0);
    const unpriced = data.length - priced.length;
    $('plistCount').innerHTML = `<b>${data.length}</b> pursuits` +
      (priced.length ? ` · ${money(sum)} stated ceiling` : '') +
      (unpriced ? ` · ${unpriced} without a stated value` : '');

    const maxDays = 80;
    const WATCHED = D.WATCHED_NOTICE_IDS;   // Map notice_id→status, or null = unavailable
    const PIPE = D.PIPELINE_IDS;            // Set, or null = pipeline state unavailable
    $('plist').innerHTML = data.length ? data.map(o => {
      const u = urg(o.days), sm = D.STAGE_META[o.stage];
      const w = o.days == null ? 0 : Math.max(6, (1 - Math.min(o.days, maxDays) / maxDays) * 100);
      const sa = saRender(o.sa);
      // A Special Notice is frequently not a solicitation at all (industry day,
      // amendment announcement, intent-to-sole-source, cancellation). Audits are
      // METERED, so we do not invite a paid run on a notice that may carry
      // nothing to audit.
      const auditable = o.stage !== 'notice';
      const aiTip = pursuitInsight(o);
      const auditRef = o.notice_id || o.id;
      const urgHtml = o.days == null
        ? `<div class="pc-urg"><div class="pc-days"><span class="pd-num" style="color:var(--mute-2)">—</span><span class="pd-lbl">NO DEADLINE</span></div><div class="urg-bar"></div></div>`
        : `<div class="pc-urg ${u}">
            <div class="pc-days"><span class="pd-num">${o.days}<small>d</small></span><span class="pd-lbl">${o.days <= 3 ? 'ACT NOW' : 'to ' + (o.stage === 'sources' || o.stage === 'presol' ? 'respond' : 'submit')}</span></div>
            <div class="urg-bar"><i class="${u}" style="width:${w}%"></i></div>
          </div>`;
      const ceilingHtml = o.ceiling != null
        ? `<div class="pc-ceiling">${money(o.ceiling)}<small>CEILING</small></div>`
        : `<div class="pc-ceiling" style="color:var(--mute-2)">—<small>NO STATED VALUE</small></div>`;
      return `<div class="pcard stage-${o.stage}${S.sel === o.id ? ' sel' : ''}" id="pc-${cssId(o.id)}" data-id="${esc(o.id)}">
        ${fitTile(o.fit)}
        <div class="pc-main">
          <div class="pc-title">${esc(o.title)}</div>
          <div class="pc-agy">${esc(o.agency)}${o.office ? ' · ' + esc(o.office) : ''} · <span class="pc-idin">${esc(o.id)}</span></div>
          <div class="pc-chips">
            <span class="chip naics">${esc(o.naics) || 'NAICS —'}</span>
            <span class="chip ${sa.cls}">${esc(sa.label)}</span>
            <span class="chip stage" style="background:${sm.color}">${sm.label}</span>
          </div>
        </div>
        <div class="pc-mid">
          ${ceilingHtml}
          ${urgHtml}
        </div>
        <div class="pc-actions">
          ${!auditable
            ? `<a class="btn-open" style="opacity:.5;pointer-events:none" title="Special Notice — an industry day, amendment, intent-to-sole-source or cancellation. No solicitation document has posted for this requirement yet.">No solicitation</a>`
            : auditRef
              ? `<a class="btn-open" href="/audit?noticeId=${encodeURIComponent(auditRef)}">Run Audit</a>`
              : `<a class="btn-open" style="opacity:.5;pointer-events:none" title="No notice reference">Run Audit</a>`}
          <button class="btn-save" data-track="${esc(o.id)}"><svg class="ic-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><svg class="ic-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg><span class="bs-add">Pipeline</span><span class="bs-on">In Pipeline</span></button>
          <button class="btn-watch" data-watch-notice="${esc(o.notice_id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg><span class="bw-off">Track</span><span class="bw-on">Tracking</span></button>
        </div>
        <div class="pc-insight"><span class="ai-tag">Insight</span><span class="ai-txt">${aiTip}</span></div>
      </div>`;
    }).join('') : `<div class="empty">No pursuits match your filters. Try widening NAICS or clearing a saved view.</div>`;
    $('plist').querySelectorAll('.pcard').forEach(c => c.onclick = (e) => { if (e.target.closest('a,button')) return; S.sel = (S.sel === c.dataset.id ? null : c.dataset.id); renderBubble(); renderActList(); renderList(); });

    // Pipeline button — persists through POST/DELETE /api/pipeline (stage
    // 'tracking'). PIPE === null → state unknown → disabled, never faked.
    $('plist').querySelectorAll('.btn-save').forEach(b => {
      const id = b.dataset.track;
      const o = D.OPPS.find(x => x.id === id);
      if (!id || !o) { b.disabled = true; b.title = 'No solicitation reference'; return; }
      if (PIPE == null) { b.disabled = true; b.title = 'Pipeline state unavailable'; return; }
      if (PIPE.has(id)) b.classList.add('on');
      b.onclick = (e) => {
        e.stopPropagation();
        if (b.dataset._busy === '1') return;
        b.dataset._busy = '1';
        const on = b.classList.contains('on');
        const req = on
          ? fetch('/api/pipeline?solicitationNumber=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' })
          : fetch('/api/pipeline', {
              method: 'POST', credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                solicitationNumber: id,
                title: o.title || null,
                agency: o.agency || null,
                naics: o.naics || null,
                dueDate: o.response_deadline || null,
                estimatedValueM: o.ceiling,
                stageCode: o.stage === 'presol' ? '01' : o.stage === 'sources' ? '02' : '03'
              })
            });
        req.then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, data: d })))
          .then(out => {
            b.dataset._busy = '';
            if (!out.ok) { console.warn('[pipeline] failed', out); return; }
            if (on) {
              // removed:0 means the server REFUSED (the pursuit advanced past
              // capture). Flipping the button off there would assert a removal
              // that never happened — keep it on and say why.
              if (!(out.data && out.data.removed > 0)) {
                b.title = 'Advanced past capture on the pipeline board — remove it there';
                console.warn('[pipeline] delete refused (row advanced)', out);
                return;
              }
              PIPE.delete(id); b.classList.remove('on');
            } else { PIPE.add(id); b.classList.add('on'); }
          })
          .catch(err => { b.dataset._busy = ''; console.warn('[pipeline] error', err); });
      };
    });

    // Watcher — Track button per row, wired to /api/watch. WATCHED === null →
    // hydrate failed → buttons disabled ("unavailable" is honest; a default
    // un-tracked rendering is a false negative).
    $('plist').querySelectorAll('.btn-watch').forEach(b => {
      const noticeId = b.dataset.watchNotice;
      const o = D.OPPS.find(x => x.notice_id === noticeId);
      if (!noticeId || !o) { b.disabled = true; b.title = 'No notice id'; return; }
      if (WATCHED == null) { b.disabled = true; b.title = 'Watch state unavailable'; return; }
      const watchStatus = WATCHED.get(noticeId) || null;
      if (watchStatus) b.classList.add('on');
      // A watch that advanced beyond 'watching' (posted / audited) carries audit
      // linkage and history. Un-tracking would DELETE that row, so the toggle is
      // disabled for those — the watch is managed from /watching, not here.
      if (watchStatus && watchStatus !== 'watching') {
        b.disabled = true;
        b.title = `Watch has advanced (${watchStatus}) — manage it on the Watching page`;
        return;
      }
      b.onclick = (e) => {
        e.stopPropagation();
        if (b.dataset._busy === '1') return;
        b.dataset._busy = '1';
        const on = b.classList.contains('on');
        const method = on ? 'DELETE' : 'POST';
        const url = on
          ? '/api/watch?noticeId=' + encodeURIComponent(noticeId)
          : '/api/watch';
        const init = on
          ? { method, credentials: 'include' }
          : {
              method,
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                noticeId,
                title: o.title || null,
                agency: o.agency || null,
                solicitationNumber: o.id || null,
                noticeType: o.notice_type || null,
                responseDeadline: o.response_deadline || null
              })
            };
        fetch(url, init)
          .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, status: r.status, data: d })))
          .then(out => {
            b.dataset._busy = '';
            if (!out.ok) { console.warn('[watch] failed', out); return; }
            if (on) { WATCHED.delete(noticeId); b.classList.remove('on'); }
            else    { WATCHED.set(noticeId, out.data && out.data.status ? out.data.status : 'watching'); b.classList.add('on'); }
          })
          .catch(err => { b.dataset._busy = ''; console.warn('[watch] error', err); });
      };
    });
  }
  const cssId = (s) => s.replace(/[^a-z0-9]/gi, '');
  function scrollToCard(id) { const el = $('pc-' + cssId(id)); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); }

  /* ─── insight ─── */
  function renderInsight() {
    let html;
    if (D.FEED_STATE === 'loading') {
      html = `<span class="ib-label">Status</span>Connecting to the SAM.gov ingest…`;
    } else if (D.FEED_STATE === 'error') {
      html = `<span class="ib-label">Status</span><b>SAM.gov feed unavailable.</b> Nothing on this page is sample data — the widgets stay empty until the feed answers.`;
    } else if (D.FEED_STATE === 'empty') {
      html = `<span class="ib-label">Status</span>The live SAM.gov feed is empty right now. It refreshes automatically as new notices post.`;
    } else if (S.sel) {
      const o = D.OPPS.find(x => x.id === S.sel);
      const fitPart = o.fit != null ? `fit <b>${o.fit}/100</b> (${fitTier(o.fit)})` : `<b>not yet audited</b>`;
      const ceilPart = o.ceiling != null ? `, ${money(o.ceiling)} ceiling` : '';
      const daysPart = o.days != null ? `, <b>${o.days} days</b> to ${o.stage === 'rfp' ? 'submit' : 'respond'}` : ', no stated deadline';
      const incPart = o.incumbent != null ? ` Incumbent on record: ${o.incumbent}.` : '';
      html = `<span class="ib-label">Focus</span><b>${o.title}</b> — ${fitPart}${ceilPart}${daysPart}.${incPart}`;
    } else {
      const f = filtered();
      const hot = f.filter(o => o.fit != null && o.fit >= 85 && o.days != null && o.days <= 10);
      if (hot.length) {
        const hotPriced = hot.filter(o => o.ceiling != null);
        const ceilTxt = hotPriced.length ? ` — ${money(hotPriced.reduce((s, o) => s + o.ceiling, 0))} of stated ceiling` : '';
        html = `<span class="ib-label">Priority</span><b>${hot.length} strong-fit pursuit${hot.length > 1 ? 's' : ''}</b> closing within 10 days${ceilTxt}.`;
      } else {
        html = `<span class="ib-label">Read</span>Upstream <b>Sources Sought &amp; Pre-Sol</b> notices let you shape requirements before the RFP drops — switch to the <b>Upstream</b> saved view to find them early.`;
      }
    }
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  let naicsExpanded = false;
  function renderHeaderNaics() {
    const el = $('hdrNaics'); if (!el) return;
    const lbl = $('hdrNaicsLabel');
    if (!D.NAICS.length) {
      el.innerHTML = `<span class="hdr-naics-pill off" style="cursor:default">${D.FEED_STATE === 'error' ? 'feed unavailable' : D.FEED_STATE === 'loading' ? 'loading…' : 'none in feed'}</span>`;
      if (lbl) lbl.innerHTML = 'Feed NAICS';
      return;
    }
    const codes = D.NAICS, CAP = 6;
    const showAll = naicsExpanded || codes.length <= CAP;
    const shown = showAll ? codes : codes.slice(0, CAP);
    const rest = showAll ? [] : codes.slice(CAP);
    let html = shown.map(n => `<span class="hdr-naics-pill ${S.naics.has(n.code) ? '' : 'off'}" data-naics="${n.code}" title="${n.label} — click to ${S.naics.has(n.code) ? 'hide' : 'show'}">${n.code}</span>`).join('');
    if (rest.length) html += `<span class="hdr-naics-pill more" data-more="1" title="Show ${rest.length} more code${rest.length > 1 ? 's' : ''}">+${rest.length} more</span>`;
    else if (codes.length > CAP) html += `<span class="hdr-naics-pill more" data-more="0" title="Show fewer">show less</span>`;
    el.innerHTML = html;
    const active = S.naics.size, total = codes.length;
    if (lbl) lbl.innerHTML = active < total ? `Feed NAICS · <b>${active}/${total} active</b>` : 'Feed NAICS · click to filter';
    el.querySelectorAll('[data-naics]').forEach(p => p.onclick = () => {
      const c = p.dataset.naics;
      if (S.naics.has(c)) { if (S.naics.size > 1) S.naics.delete(c); } else S.naics.add(c);
      S.view = null; sync(); renderAll();
    });
    el.querySelectorAll('[data-more]').forEach(p => p.onclick = () => { naicsExpanded = p.dataset.more === '1'; renderHeaderNaics(); });
  }

  function renderAll() {
    // First live render: select every feed NAICS code by default.
    if (!S.naicsInit && D.NAICS.length) { S.naics = new Set(D.NAICS.map(n => n.code)); S.naicsInit = true; }
    renderHeaderNaics(); renderKPIs(); renderBubble(); renderActList(); renderList(); renderInsight();
  }
  function onThemeChange() { renderAll(); }

  function init() {
    buildControls(); renderAll();
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderBubble, 220); });
  }
  window.DSO_APP = { render: renderAll, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
