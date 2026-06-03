/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Agencies (best-in-class) — org map, posture, forecast
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const D = window.DAG;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmtM = (m) => m >= 1000 ? '$' + (m / 1000).toFixed(2) + 'B' : '$' + Math.round(m) + 'M';

  const S = { dept: 'all', q: '', sort: 'fit', sel: 'navair' };

  const allCmds = () => D.DEPTS.flatMap(d => d.children.map(c => ({ ...c, dept: d.key, deptName: d.short, color: d.color })));
  const findCmd = (k) => allCmds().find(c => c.key === k);
  const findDept = (k) => D.DEPTS.find(d => d.key === k);

  /* fit → shade of navy (pale to deep) */
  function fitShade(fit) {
    const t = Math.max(0, Math.min(1, (fit - 55) / 40));
    const c0 = [203, 217, 234], c1 = [24, 95, 165];
    const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
    return `rgb(${r},${g},${b})`;
  }

  /* ─── controls ─── */
  function buildControls() {
    const depts = [{ key: 'all', short: 'All' }, ...D.DEPTS];
    $('deptFilters').innerHTML = depts.map(d =>
      `<button class="fpill ${d.key === S.dept ? 'active' : ''}" data-dept="${d.key}">${d.short}</button>`).join('');
    $('deptFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.dept = b.dataset.dept; sync(); renderAll(); });

    $('sortSeg').innerHTML = D.SORTS.map(s => `<button data-sort="${s.key}" class="fpill ${s.key === S.sort ? 'active' : ''}">${s.label}</button>`).join('');
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; syncSort(); renderTree(); renderList(); });

    $('sortTabs').innerHTML = D.SORTS.map(s => `<button class="people-tab ${s.key === S.sort ? 'active' : ''}" data-sort="${s.key}">${s.label}</button>`).join('');
    $('sortTabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; syncSort(); renderTree(); renderList(); });

    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.dept = 'all'; S.q = ''; S.sort = 'fit'; $('searchInput').value = ''; sync(); syncSort(); renderAll(); };
  }
  function sync() { $('deptFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.dept === S.dept)); }
  function syncSort() {
    $('sortSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort));
    $('sortTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort));
  }

  function visibleCmds() {
    return allCmds().filter(c => {
      if (S.dept !== 'all' && c.dept !== S.dept) return false;
      if (S.q && !(c.name + ' ' + c.desc + ' ' + c.deptName).toLowerCase().includes(S.q)) return false;
      return true;
    });
  }

  /* ─── KPIs ─── */
  function renderKPIs() {
    const cmds = visibleCmds();
    const spend = cmds.reduce((a, c) => a + c.spend, 0);
    const avgSb = cmds.length ? Math.round(cmds.reduce((a, c) => a + c.sb, 0) / cmds.length) : 0;
    const best = cmds.slice().sort((a, b) => b.fit - a.fit)[0];
    const reachable = cmds.filter(c => c.access >= 75).length;
    const cards = [
      { lbl: 'Addressable Spend', val: '$' + (spend / 1000).toFixed(2), unit: 'B', foot: 'your codes · 12mo', tone: 'blue' },
      { lbl: 'Avg SB Share', val: avgSb, unit: '%', foot: 'across commands in view', tone: 'green' },
      { lbl: 'Best-Fit Command', val: best ? best.name : '—', unit: '', foot: best ? `fit ${best.fit}/100` : '', tone: 'purple', small: true },
      { lbl: 'Highly Accessible', val: reachable, unit: '', foot: 'SB-friendly · access ≥ 75', tone: 'amber' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}">
      <p class="lbl">${c.lbl}</p><div class="kpi-val"${c.small ? ' style="font-size:21px"' : ''}>${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsDepts').textContent = D.DEPTS.length;
    $('hsCmds').textContent = allCmds().length;
    $('hsSpend').textContent = fmtM(D.DEPTS.reduce((a, d) => a + d.spend, 0));
  }

  /* ─── treemap org map (dept → command) ─── */
  function renderTree() {
    const svg = d3.select('#treeSvg'); svg.selectAll('*').remove();
    const W = $('treeSvg').clientWidth || 660, H = 400;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const depts = S.dept === 'all' ? D.DEPTS : D.DEPTS.filter(d => d.key === S.dept);
    const root = {
      name: 'DoD', children: depts.map(d => ({
        name: d.short, key: d.key, color: d.color,
        children: d.children.filter(c => !S.q || (c.name + c.desc).toLowerCase().includes(S.q))
          .map(c => ({ name: c.name, desc: c.desc, key: c.key, dept: d.key, value: c.spend, fit: c.fit, sb: c.sb }))
      })).filter(d => d.children.length)
    };
    const h = d3.hierarchy(root).sum(d => d.value).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingOuter(0).paddingInner(2).paddingTop(22).round(true)(h);
    const leaves = h.leaves();

    svg.selectAll('rect.cell').data(leaves).join('rect')
      .attr('class', d => 'cell' + (S.sel === d.data.key ? ' sel' : '') + (S.sel && S.sel !== d.data.key ? ' dim' : ''))
      .attr('x', d => d.x0).attr('y', d => d.y0).attr('width', d => Math.max(0, d.x1 - d.x0)).attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => fitShade(d.data.fit)).attr('rx', 3)
      .on('mousemove', (ev, d) => {
        const tip = $('coTip');
        tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12.5px;margin-bottom:3px">${d.data.name}<span style="color:#7FB4EC;float:right;margin-left:12px">${fmtM(d.value)}</span></div>
          <div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">${d.data.desc} · fit <b style="color:#fff">${d.data.fit}</b> · ${d.data.sb}% SB</div>`;
        tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 240) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      })
      .on('mouseleave', () => $('coTip').style.display = 'none')
      .on('click', (ev, d) => { S.sel = d.data.key; renderAll(); });

    // command name labels (only cells tall enough to clear the dept strip)
    svg.selectAll('text.tree-lab').data(leaves.filter(d => (d.x1 - d.x0) > 54 && (d.y1 - d.y0) > 30)).join('text')
      .attr('class', 'tree-lab').attr('x', d => d.x0 + 6).attr('y', d => d.y0 + 16).attr('font-size', d => (d.x1 - d.x0) > 100 ? 12 : 10)
      .attr('fill', d => d.data.fit >= 78 ? '#fff' : css('--ink'))
      .text(d => d.data.name);
    svg.selectAll('text.tree-sub').data(leaves.filter(d => (d.x1 - d.x0) > 70 && (d.y1 - d.y0) > 50)).join('text')
      .attr('class', 'tree-sub').attr('x', d => d.x0 + 6).attr('y', d => d.y1 - 7).attr('font-size', 9)
      .attr('fill', d => d.data.fit >= 78 ? 'rgba(255,255,255,.85)' : css('--mute'))
      .text(d => fmtM(d.value) + ' · ' + d.data.sb + '% SB');
    // dept header labels — sit in their own reserved top strip
    svg.selectAll('text.tree-dept').data(h.children || []).join('text')
      .attr('class', 'tree-dept').attr('x', d => d.x0 + 6).attr('y', d => d.y0 + 14).attr('font-size', 8.5).attr('font-weight', 700).attr('letter-spacing', '.06em')
      .attr('fill', d => css('--mute')).text(d => (d.x1 - d.x0) > 46 ? d.data.name.toUpperCase() : '');

    $('treeLegend').innerHTML = `<span class="grad">low fit <span class="bar"></span> high fit</span><span>· block size = $ in your NAICS</span>`;

    const tc = $('treeClear');
    if (tc) {
      if (S.sel) {
        const c = allCmds().find(x => x.key === S.sel);
        $('treeClearTxt').textContent = c ? ('Show all · clear ' + c.name) : 'Show all commands';
        tc.style.display = 'inline-flex';
      } else { tc.style.display = 'none'; }
      tc.onclick = () => { S.sel = null; renderAll(); };
    }
  }

  /* ─── ring helper ─── */
  function ring(score, size) {
    const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100);
    const col = score >= 85 ? css('--green-600') : score >= 70 ? css('--accent') : css('--mute-2');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>`;
  }

  /* ─── agency detail panel ─── */
  function renderPanel() {
    const c = findCmd(S.sel);
    const el = $('agPanel');
    if (!c) {
      el.innerHTML = `<div class="cop-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/></svg><div class="t">Select a command</div><div class="d">Click any block on the org map or a row below to see its fit, posture, and trend.</div></div>`;
      return;
    }
    const dept = findDept(c.dept);
    const fitTxt = c.fit >= 85 ? 'Strong match to your codes' : c.fit >= 70 ? 'Workable overlap' : 'Partial overlap';
    const accTxt = c.access >= 80 ? 'Very accessible' : c.access >= 65 ? 'Accessible' : 'Harder to reach';
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${dept.color},${shade(dept.color)})">${c.name.slice(0, 2).toUpperCase()}</div>
        <div class="cop-id">
          <div class="cop-name">${c.name}</div>
          <div class="cop-title">${c.desc}</div>
          <span class="cop-agy">${dept.name}</span>
        </div>
        <span class="cop-rel" style="background:${hexA(dept.color,.13)};color:${dept.color}"><i style="background:${dept.color}"></i>${dept.short}</span>
      </div>
      <div class="cop-metrics">
        <div class="cop-m"><span class="mv">${fmtM(c.spend)}</span><span class="ml">Your codes 12mo</span></div>
        <div class="cop-m"><span class="mv">${c.sb}<small>%</small></span><span class="ml">Small biz share</span></div>
        <div class="cop-m"><span class="mv">${c.access}</span><span class="ml">Accessibility</span></div>
        <div class="cop-m"><span class="mv">${c.contacts}</span><span class="ml">COs in network</span></div>
        <div class="cop-m"><span class="mv">+${Math.round((c.trend[4] - c.trend[0]) / c.trend[0] * 100)}<small>%</small></span><span class="ml">5-yr growth</span></div>
        <div class="cop-m"><span class="mv">${dept.prime}</span><span class="ml">Top code</span></div>
      </div>
      <div class="cop-ring-wrap">
        <div class="cop-ring">${ring(c.fit, 62)}<div class="rn">${c.fit}<small>FIT</small></div></div>
        <div class="cop-ring-txt"><div class="t">${fitTxt}</div><div class="d">${accTxt} · ${c.contacts ? c.contacts + ' CO' + (c.contacts > 1 ? 's' : '') + ' in your network here' : 'no COs in network yet — build a contact'}.</div></div>
      </div>
      <div class="cop-note"><b>Play</b>${playFor(c, dept)}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>Find opportunities</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Track command</button>
      </div>`;
  }
  function playFor(c, dept) {
    if (c.fit >= 85 && c.sb >= 40) return `High fit + ${c.sb}% to small business — a core target. ${c.contacts ? 'Leverage your existing CO relationship.' : 'Build a CO contact here first.'}`;
    if (c.access < 65) return `Lower accessibility (${c.access}) — mostly full-and-open. Compete via teaming or pursue the SB-eligible slices.`;
    if (c.contacts === 0) return `${fmtM(c.spend)} in your codes but no CO in your network — prioritize relationship-building before the next recompete.`;
    return `Solid overlap with ${dept.short}. Watch the forecast below and align your capability statement to ${dept.prime}.`;
  }

  /* ─── command leaderboard ─── */
  function renderList() {
    let data = visibleCmds().slice();
    if (S.sort === 'fit') data.sort((a, b) => b.fit - a.fit);
    else if (S.sort === 'spend') data.sort((a, b) => b.spend - a.spend);
    else if (S.sort === 'sb') data.sort((a, b) => b.sb - a.sb);
    else data.sort((a, b) => b.access - a.access);
    $('agCount').innerHTML = `${data.length} commands · click to open detail`;
    const maxSpend = Math.max(...data.map(c => c.spend));
    $('agList').innerHTML = data.map(c => {
      const fc = c.fit >= 85 ? css('--green-600') : c.fit >= 70 ? css('--accent') : css('--mute-2');
      const cR = 16, circ = 2 * Math.PI * cR, off = circ * (1 - c.fit / 100);
      return `<div class="ppl-row ag-head2${S.sel === c.key ? ' sel' : ''}" data-id="${c.key}">
        <div class="ppl-av" style="background:linear-gradient(135deg,${c.color},${shade(c.color)});border-radius:11px">${c.name.slice(0, 2).toUpperCase()}</div>
        <div class="ppl-info"><div class="ppl-name">${c.name}</div><div class="ppl-sub">${c.deptName} · ${c.desc}</div></div>
        <div class="ag-spend"><div class="ag-spend-track"><div class="seg-sb" style="width:${(c.spend / maxSpend * 100) * c.sb / 100}%"></div><div class="seg-lp" style="width:${(c.spend / maxSpend * 100) * (1 - c.sb / 100)}%"></div></div><div class="ag-spend-lbl">${c.sb}% SB · access ${c.access} · ${Math.round((c.trend[4] - c.trend[0]) / c.trend[0] * 100)}% 5yr</div></div>
        <div class="ppl-awd">${fmtM(c.spend)}<small>${c.contacts} CO${c.contacts !== 1 ? 's' : ''}</small></div>
        <div class="ppl-fit"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${cR}" fill="none" stroke="var(--line-2)" stroke-width="3.5"/><circle cx="20" cy="20" r="${cR}" fill="none" stroke="${fc}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/></svg><span class="fn">${c.fit}</span></div>
      </div>`;
    }).join('') || `<div class="tl-empty">No commands match your filters.</div>`;
    $('agList').querySelectorAll('.ppl-row').forEach(r => r.onclick = () => { S.sel = r.dataset.id; renderAll(); });
  }

  /* ─── set-aside heatmap ─── */
  function renderHeatmap() {
    const depts = D.DEPTS.filter(d => S.dept === 'all' || d.key === S.dept);
    const sas = D.SETASIDES;
    let html = `<div class="hm-row head"><span>Dept</span>${sas.map(s => `<span>${s}</span>`).join('')}</div>`;
    html += depts.map(d => {
      const row = D.POSTURE[d.key];
      return `<div class="hm-row"><span class="hm-rowlabel">${d.short}</span>${sas.map(s => {
        const v = row[s] || 0;
        const isFull = s === 'Full&Open';
        const t = Math.min(1, v / 52);
        const bg = isFull ? `rgba(148,163,184,${0.15 + t * 0.55})` : `rgba(24,95,165,${0.12 + t * 0.78})`;
        const fg = (!isFull && t > 0.5) ? '#fff' : (isFull && t > 0.6 ? '#fff' : 'var(--ink-2)');
        return `<div class="hm-cell" style="background:${bg};color:${fg}" title="${d.short} · ${s}: ${v}%">${v}</div>`;
      }).join('')}</div>`;
    }).join('');
    $('heatmap').innerHTML = html + `<div class="hm-foot">Cells = % of eligible obligations routed to each vehicle · darker blue = friendlier to small business</div>`;
  }

  /* ─── procurement forecast (grouped bars by quarter) ─── */
  function renderForecast() {
    const svg = d3.select('#fcSvg'); svg.selectAll('*').remove();
    const W = $('fcSvg').clientWidth || 560, H = 300;
    const m = { t: 16, r: 14, b: 30, l: 40 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const depts = D.DEPTS.filter(d => S.dept === 'all' || d.key === S.dept);
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    // stacked totals per quarter
    const totals = quarters.map((q, i) => depts.reduce((a, d) => a + D.FORECAST[d.key][i], 0));
    const x = d3.scaleBand().domain(quarters).range([m.l, W - m.r]).padding(0.32);
    const y = d3.scaleLinear().domain([0, d3.max(totals) * 1.12]).range([H - m.b, m.t]);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSize(0)).select('.domain').remove();
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d + 'M').tickSize(4));
    // stacked bars
    quarters.forEach((q, i) => {
      let yAcc = 0;
      depts.forEach(d => {
        const v = D.FORECAST[d.key][i];
        const h0 = (H - m.b) - y(v) - 0 + y(0) - y(0);
        const barH = (H - m.b) - y(v);
        svg.append('rect').attr('x', x(q)).attr('width', x.bandwidth())
          .attr('y', y(yAcc + v)).attr('height', y(yAcc) - y(yAcc + v))
          .attr('fill', d.color).attr('opacity', .9)
          .append('title').text(`${d.short} ${q}: $${v}M`);
        yAcc += v;
      });
      svg.append('text').attr('class', 'fc-lab').attr('x', x(q) + x.bandwidth() / 2).attr('y', y(totals[i]) - 6).attr('text-anchor', 'middle').attr('font-weight', 800).attr('fill', css('--ink')).text('$' + totals[i] + 'M');
    });
    $('fcSub').textContent = (S.dept === 'all' ? 'All departments' : findDept(S.dept).short) + ' · expected $ in your codes · next 4 quarters';
  }

  /* ─── insight ─── */
  function renderInsight() {
    const c = findCmd(S.sel);
    let html;
    if (c) {
      const dept = findDept(c.dept);
      if (c.contacts === 0 && c.spend >= 50)
        html = `<span class="ib-label">Whitespace</span><b>${c.name}</b> obligates <b>${fmtM(c.spend)}</b> in your codes at ${c.sb}% SB, but you have <b>no CO contact there</b> — a prime relationship to build before the next recompete.`;
      else if (c.fit >= 88)
        html = `<span class="ib-label">Core target</span><b>${c.name}</b> is one of your best-fit commands (fit ${c.fit}) — ${fmtM(c.spend)} in your codes, ${c.sb}% to small business, accessibility ${c.access}.`;
      else
        html = `<span class="ib-label">Focus</span><b>${c.name}</b> · ${dept.name} · fit ${c.fit}/100 · ${fmtM(c.spend)} in your codes · ${c.sb}% SB.`;
    } else {
      html = `<span class="ib-label">Read</span>Block size shows where the money is; shade shows fit. <b>NAVAIR</b> and <b>DLA Aviation</b> are your highest-fit, most SB-friendly commands — start there.`;
    }
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  /* ─── helpers ─── */
  function shade(hex) {
    if (hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * .66); g = Math.round(g * .66); b = Math.round(b * .66);
    return `rgb(${r},${g},${b})`;
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function renderAll() { renderKPIs(); renderTree(); renderPanel(); renderList(); renderHeatmap(); renderForecast(); renderInsight(); }
  function onThemeChange() { renderAll(); }

  function init() {
    buildControls(); renderAll();
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(() => { renderTree(); renderForecast(); }, 220); });
  }
  window.DAG_APP = { render: renderAll, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
