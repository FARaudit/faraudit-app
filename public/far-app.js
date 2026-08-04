/* FARaudit · FAR/DFARS Updates (best-in-class) — render + viz + interactions */
(function () {
  const D = window.FARD;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const impColor = (i) => impMeta(i).color;
  /* impact/type now arrive from the feeds, so neither is guaranteed to be one of
     the three known keys. An unknown value must degrade to a neutral chip, not
     throw on a property of undefined and take the whole page down. */
  const UNKNOWN_IMPACT = { label: 'Unclassified', color: '#64748b', rank: 0 };
  const impMeta = (i) => D.IMPACT_META[i] || UNKNOWN_IMPACT;
  const typeColor = (t) => D.TYPE_COLOR[t] || '#64748b';
  /* Record fields arrive from third-party RSS and the Federal Register, so every
     one of them is attacker-controlled text as far as this page is concerned. */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  /* Accepts 'YYYY-MM-DD' or a full ISO timestamp. Renders a dash, never 'Invalid Date'. */
  const fmtDate = (s) => {
    const d = new Date(String(s == null ? '' : s).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const S = { type: 'all', impact: 'all', q: '', sort: 'Newest', sel: D.UPDATES.length ? D.UPDATES[0].clause : null };

  /* Feed state helpers. A count is only a count when the sources answered; while
     loading or unavailable every tile shows an em dash instead of a zero. */
  const DASH = '—';
  const isDown = () => D.STATUS && D.STATUS.state === 'unavailable';
  const isPending = () => D.STATUS && D.STATUS.state === 'loading';
  /* Some-but-not-all sources answered. A count is real for what came back and
     silent about what did not, so it is reported WITH the shortfall named — never
     as a plain number, and never as "the feeds reported no changes". */
  const deadSources = () => ((D.STATUS && D.STATUS.sources) || []).filter(s => !s.ok);
  const isPartial = () => !isDown() && !isPending() && deadSources().length > 0;
  // A partial outage dashes too: a bare 0 at the top of the page reads as "no rule
  // changes this month", which is a claim the surviving source cannot support.
  const num = (n) => (isDown() || isPending() || isPartial() ? DASH : n);
  function emptyBlock(title, detail) {
    return `<div class="cop-empty"><div class="t">${title}</div><div class="d">${detail}</div></div>`;
  }
  /* One sentence, used wherever a surface has nothing to draw, so the reason a
     panel is blank is never left to the reader to guess. */
  function blankReason() {
    if (isPending()) return ['Loading', 'Fetching FAR, DFARS and Federal Register updates.'];
    if (isDown()) return ['Updates unavailable', (D.STATUS.reason || 'The regulatory feeds could not be reached.') + ' Nothing is shown rather than showing stale or sample data.'];
    if (isPartial()) {
      const dead = deadSources(), all = D.STATUS.sources.length;
      return ['Sources unavailable',
        (all - dead.length) + ' of ' + all + ' sources responded. Unavailable: '
        + dead.map(s => s.name + (s.reason ? ' (' + s.reason + ')' : '')).join(', ')
        + '. Changes published to those sources are not represented here.'];
    }
    return ['No updates', 'The feeds returned no published changes for this view.'];
  }

  function buildControls() {
    $('typeFilters').innerHTML = D.TYPES.map(t => `<button class="fpill ${t.key === S.type ? 'active' : ''}" data-type="${t.key}">${t.label}</button>`).join('');
    $('typeFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.type = b.dataset.type; sync(); renderAll(); });
    $('impactFilters').innerHTML = D.IMPACTS.map(t => `<button class="fpill ${t.key === S.impact ? 'active' : ''}" data-imp="${t.key}">${t.label}</button>`).join('');
    $('impactFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.impact = b.dataset.imp; sync(); renderAll(); });
    $('sortSeg').innerHTML = D.SORTS.map(s => `<button data-sort="${s}" class="fpill ${s === S.sort ? 'active' : ''}">${s}</button>`).join('');
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
    const foot = isDown() ? 'source unavailable'
      : isPending() ? 'loading'
      : isPartial() ? (deadSources().length + ' of ' + D.STATUS.sources.length + ' sources down')
      : null;
    const cards = [
      { lbl: 'Updates in View', val: num(f.length), unit: '', foot: foot || 'matching your filters', tone: 'blue' },
      { lbl: 'High Impact', val: num(high), unit: '', foot: foot || 'act before bidding', tone: 'red' },
      { lbl: 'Effective ≤ 30 Days', val: num(soon), unit: '', foot: foot || 'enforcement imminent', tone: 'amber' },
      { lbl: 'Affected Contracts', val: num(affected), unit: '', foot: foot || 'active sols touched', tone: 'purple' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsTotal').textContent = num(D.UPDATES.length);
    $('hsHigh').textContent = num(D.UPDATES.filter(u => u.impact === 'HIGH').length);
    $('hsSoon').textContent = num(D.EFFECTIVE.filter(e => e.days <= 30).length);
    // The pill claims a live connection. It must not stay green through an outage.
    const pill = $('livePill');
    if (pill) {
      pill.textContent = isDown() ? 'OFFLINE' : isPending() ? 'LOADING' : isPartial() ? 'DEGRADED' : 'LIVE';
      pill.dataset.state = isDown() ? 'offline' : isPending() ? 'loading' : isPartial() ? 'degraded' : 'live';
    }
  }

  /* timeline: x = date, y-jitter by impact band, dot size = affects */
  function renderTimeline() {
    const svg = d3.select('#timelineSvg'); svg.selectAll('*').remove();
    const node = $('timelineSvg'); if (!node) return;
    const W = node.clientWidth || 660, H = 300, m = { t: 18, r: 20, b: 30, l: 64 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = filtered();
    const dates = D.UPDATES.map(u => new Date(u.date));
    // No records: an axis over an empty domain draws NaN ticks. Say why instead.
    if (!dates.length) {
      const [t, d] = blankReason();
      svg.append('text').attr('x', W / 2).attr('y', H / 2 - 6).attr('text-anchor', 'middle')
        .attr('font-family', 'Manrope').attr('font-size', 13).attr('font-weight', 700).attr('fill', css('--ink-2')).text(t);
      svg.append('text').attr('x', W / 2).attr('y', H / 2 + 14).attr('text-anchor', 'middle')
        .attr('font-family', 'IBM Plex Mono').attr('font-size', 10).attr('fill', css('--mute')).text(d);
      return;
    }
    const x = d3.scaleTime().domain([d3.min(dates), d3.max(dates)]).range([m.l, W - m.r]).nice();
    const bands = ['HIGH', 'MEDIUM', 'LOW'];
    const y = d3.scalePoint().domain(bands).range([m.t + 14, H - m.b - 10]).padding(0.5);
    const r = d3.scaleSqrt().domain([1, 7]).range([6, 18]);
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
      .attr('fill', d => D.TYPE_COLOR[d.type]).attr('opacity', 1).attr('stroke', css('--card')).attr('stroke-width', 1.8)
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
    if (!u) {
      const [t, d] = D.UPDATES.length ? ['Select a clause', 'Pick any card in the feed to see its redline.'] : blankReason();
      el.innerHTML = emptyBlock(esc(t), esc(d));
      return;
    }
    const im = impMeta(u.impact), tc = typeColor(u.type);
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${tc},${shade(tc)})"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:24px;height:24px"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
        <div class="cop-id"><div class="cop-name">${esc(u.clause)}</div><div class="cop-title">${esc(u.title)}</div><span class="cop-agy">${esc(u.type)}</span></div>
        <span class="cop-rel" style="background:${hexA(im.color,.13)};color:${im.color}"><i style="background:${im.color}"></i>${im.label}</span>
      </div>
      <div class="cop-metrics">
        <div class="cop-m"><span class="mv">${fmtDate(u.date).split(',')[0]}</span><span class="ml">Effective</span></div>
        <div class="cop-m"><span class="mv">${u.affects}</span><span class="ml">Contracts hit</span></div>
        <div class="cop-m"><span class="mv">${esc(u.type)}</span><span class="ml">Source</span></div>
      </div>
      <div class="cop-note" style="border-bottom:1px solid var(--line-2)"><b>What changed</b>${esc(u.summary)}</div>
      ${u.diff ? `<div class="redline"><div class="redline-head">Clause redline</div><div class="redline-before"><span class="rl-tag">WAS</span>${esc(u.diff.before)}</div><div class="redline-after"><span class="rl-tag">NOW</span>${esc(u.diff.after)}</div></div>` : ''}
      <div class="cop-note"><b>⚡ Why it matters to you</b>${esc(u.insight)}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>Read full text</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Track clause</button>
      </div>`;
  }

  function renderFeed() {
    let data = filtered().slice();
    if (S.sort === 'Newest') data.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    else if (S.sort === 'Impact') data.sort((a, b) => impMeta(b.impact).rank - impMeta(a.impact).rank || Date.parse(b.date) - Date.parse(a.date));
    else data.sort((a, b) => b.affects - a.affects);
    $('feedCount').innerHTML = isDown() ? 'source unavailable'
      : isPending() ? 'loading…'
      : `${data.length} updates · click any card to inspect`;
    $('feedList').innerHTML = data.map(u => {
      const im = impMeta(u.impact), tc = typeColor(u.type);
      return `<div class="feed-card${S.sel === u.clause ? ' sel' : ''}" data-clause="${esc(u.clause)}" style="border-left-color:${tc}">
        <div class="feed-top"><span class="feed-clause">${esc(u.clause)}</span><span class="feed-type" style="color:${tc};background:${hexA(tc,.1)}">${esc(u.type)}</span><span class="feed-imp" style="color:${im.color};background:${hexA(im.color,.12)}">${esc(im.label)}</span><span class="feed-date">${esc(fmtDate(u.date))}</span></div>
        <div class="feed-title">${esc(u.title)}</div>
        <div class="feed-summary">${esc(u.summary)}</div>
        <div class="feed-insight"><b>⚡ Why it matters</b>${esc(u.insight)}</div>
      </div>`;
    }).join('') || (function () { const [t, d] = blankReason();
      return D.UPDATES.length ? `<div class="tl-empty">No updates match your filters.</div>`
                              : emptyBlock(esc(t), esc(d)); })();
    $('feedList').querySelectorAll('.feed-card').forEach(c => c.onclick = () => { S.sel = c.dataset.clause; renderTimeline(); renderPanel(); renderFeed(); });
  }

  function renderByType() {
    const counts = {}; D.UPDATES.forEach(u => counts[u.type] = (counts[u.type] || 0) + 1);
    /* Subtitle counts the rows actually charted below — never a fixed figure. */
    const sub = $('bytSub');
    if (sub) sub.textContent = D.UPDATES.length + (D.UPDATES.length === 1 ? ' update' : ' updates') + ' · click to filter';
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    // Math.max() of nothing is -Infinity, which makes every bar width NaN.
    const max = rows.length ? Math.max(...rows.map(r => r[1])) : 1;
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
      return `<div class="eff-row"><div class="eff-info"><div class="eff-name">${esc(e.name)}</div><div class="eff-clause">${esc(e.clause)}</div></div><span class="eff-count ${cls}">${esc(label)}</span></div>`;
    }).join('') || (function () {
      /* A panel with nothing in ITS OWN slice must not report on the feed. The feed can
         have returned 40 changes and still have none taking effect ahead of today. */
      if (D.UPDATES.length && !isDown() && !isPending() && !isPartial()) {
        return emptyBlock('No upcoming effective dates', 'No change in this view has an effective date still ahead.');
      }
      const [t, d] = blankReason();
      return emptyBlock(esc(t), esc(d)); })();
  }

  function renderAffected() {
    $('affList').innerHTML = D.AFFECTED.map(a => {
      const im = impMeta(a.impact);
      return `<div class="aff-row2"><div class="aff-info"><div class="aff-sol">${esc(a.sol)}</div><div class="aff-cls">${esc(a.clause)}</div><div class="aff-action">${esc(a.action)}</div></div><span class="aff-badge" style="color:${im.color};background:${hexA(im.color,.12)}">${esc(im.label)}</span></div>`;
    }).join('') || (function () { const [t, d] = D.UPDATES.length
      ? ['No affected solicitations', 'No clause change in this view touches a solicitation in your account.']
      : blankReason();
      return emptyBlock(esc(t), esc(d)); })();
  }

  function renderInsight() {
    const u = D.UPDATES.find(x => x.clause === S.sel);
    let html;
    if (u && u.impact === 'HIGH') html = `<span class="ib-label">Priority</span><b>${esc(u.clause)} · ${esc(u.title)}</b> is high-impact and hits <b>${esc(String(u.affects))} of your contracts</b> — ${esc(u.insight)}`;
    else if (u) html = `<span class="ib-label">Focus</span><b>${esc(u.clause)}</b> (${esc(u.type)}, ${esc(impMeta(u.impact).label.toLowerCase())} impact) — ${esc(u.insight)}`;
    else { const [t, d] = blankReason(); html = `<span class="ib-label">${esc(t)}</span>${esc(d)}`; }
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  function shade(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n>>16)&255)*.66)},${Math.round(((n>>8)&255)*.66)},${Math.round((n&255)*.66)})`; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderTimeline(); renderPanel(); renderFeed(); renderByType(); renderEffective(); renderAffected(); renderInsight(); }
  function onThemeChange() { renderAll(); }
  function init() { buildControls(); renderAll(); let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderTimeline, 200); }); }
  window.FAR_APP = { render: renderAll, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
