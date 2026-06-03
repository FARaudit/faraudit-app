/* FARaudit · Wage Benchmarks (best-in-class) — render + dumbbell viz */
(function () {
  const D = window.WAGE;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const stColor = (s) => D.STATUS_META[s].color;

  const S = { loc: 'all', status: 'all', q: '', sort: 'Variance', sel: D.WAGES.find(w => w.status === 'FLAG').cat };

  function buildControls() {
    $('locFilters').innerHTML = D.LOCATIONS.map(l => `<button class="fpill ${l.key === S.loc ? 'active' : ''}" data-loc="${l.key}">${l.label}</button>`).join('');
    $('locFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.loc = b.dataset.loc; sync(); renderAll(); });
    $('statusFilters').innerHTML = D.STATUSES.map(s => `<button class="fpill ${s.key === S.status ? 'active' : ''}" data-st="${s.key}">${s.label}</button>`).join('');
    $('statusFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.status = b.dataset.st; sync(); renderAll(); });
    $('sortSeg').innerHTML = D.SORTS.map(s => `<button data-sort="${s}" class="${s === S.sort ? 'active' : ''}">${s}</button>`).join('');
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; syncSort(); renderList(); renderWage(); });
    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.loc = 'all'; S.status = 'all'; S.q = ''; S.sort = 'Variance'; $('searchInput').value = ''; sync(); syncSort(); renderAll(); };
  }
  function sync() {
    $('locFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.loc === S.loc));
    $('statusFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.st === S.status));
  }
  function syncSort() { $('sortSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort)); }

  function filtered() {
    let d = D.WAGES.filter(w => {
      if (S.loc !== 'all' && w.site !== S.loc) return false;
      if (S.status !== 'all' && w.status !== S.status) return false;
      if (S.q && !(w.cat + ' ' + w.wd + ' ' + w.loc).toLowerCase().includes(S.q)) return false;
      return true;
    });
    if (S.sort === 'Variance') d.sort((a, b) => a.var - b.var);
    else if (S.sort === 'Your rate') d.sort((a, b) => b.yours - a.yours);
    else d.sort((a, b) => a.cat.localeCompare(b.cat));
    return d;
  }

  function renderKPIs() {
    const all = D.WAGES, f = filtered();
    const flags = all.filter(w => w.status === 'FLAG').length;
    const avgVar = f.length ? (f.reduce((a, w) => a + w.var, 0) / f.length) : 0;
    const belowFloor = all.filter(w => w.yours < w.sca).length;
    const cards = [
      { lbl: 'Categories in View', val: f.length, unit: '', foot: 'matching your filters', tone: 'blue' },
      { lbl: 'Below Market', val: flags, unit: '', foot: 'fix before bidding', tone: 'red' },
      { lbl: 'Avg Variance', val: (avgVar >= 0 ? '+' : '') + avgVar.toFixed(1), unit: '%', foot: 'your rate vs market', tone: avgVar >= 0 ? 'green' : 'amber' },
      { lbl: 'Below SCA Floor', val: belowFloor, unit: '', foot: 'compliance risk', tone: belowFloor ? 'red' : 'green' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsCats').textContent = all.length;
    $('hsFlags').textContent = flags;
    $('hsWD').textContent = D.RENEWALS.length;
  }

  /* dumbbell plot: rows=categories, x=$/hr, SCA tick + market ○ + your ● + connector */
  function renderWage() {
    const svg = d3.select('#wageSvg'); svg.selectAll('*').remove();
    const node = $('wageSvg'); if (!node) return;
    const data = filtered();
    const rowH = 24, m = { t: 14, r: 24, b: 26, l: 150 };
    const W = node.clientWidth || 660, H = m.t + data.length * rowH + m.b;
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const lo = d3.min(data, d => Math.min(d.sca, d.yours, d.market)) - 1;
    const hi = d3.max(data, d => Math.max(d.sca, d.yours, d.market)) + 1;
    const x = d3.scaleLinear().domain([lo, hi]).range([m.l, W - m.r]);
    [Math.ceil(lo / 4) * 4, 20, 24, 28, 32, 36].filter((v, i, a) => v >= lo && v <= hi && a.indexOf(v) === i).forEach(t => {
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line-2')).attr('stroke-width', 1);
      svg.append('text').attr('x', x(t)).attr('y', H - m.b + 14).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 8.5).attr('fill', css('--mute')).text('$' + t);
    });
    data.forEach((d, i) => {
      const cy = m.t + i * rowH + rowH / 2, col = stColor(d.status);
      const g = svg.append('g').style('cursor', 'pointer').on('click', () => { S.sel = d.cat; renderAll(); })
        .on('mousemove', (ev) => { const tip = $('coTip'); tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12px;margin-bottom:2px">${d.cat}</div><div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">SCA $${d.sca} · you $${d.yours} · mkt $${d.market}<br>${d.var >= 0 ? '+' : ''}${d.var}% vs market</div>`; tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 210) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; })
        .on('mouseleave', () => $('coTip').style.display = 'none');
      if (S.sel === d.cat) g.append('rect').attr('x', m.l - 146).attr('y', cy - rowH / 2 + 1).attr('width', W - m.r - (m.l - 146)).attr('height', rowH - 2).attr('rx', 5).attr('fill', css('--accent-pale')).attr('opacity', .7);
      g.append('text').attr('x', m.l - 12).attr('y', cy + 3).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 10).attr('font-weight', 700).attr('fill', css('--ink')).text(d.cat.length > 20 ? d.cat.slice(0, 19) + '…' : d.cat);
      // connector your→market
      g.append('line').attr('x1', x(d.yours)).attr('x2', x(d.market)).attr('y1', cy).attr('y2', cy).attr('stroke', col).attr('stroke-width', 2).attr('opacity', .5);
      // SCA floor tick
      g.append('line').attr('x1', x(d.sca)).attr('x2', x(d.sca)).attr('y1', cy - 6).attr('y2', cy + 6).attr('stroke', css('--mute-2')).attr('stroke-width', 2);
      // market hollow
      g.append('circle').attr('cx', x(d.market)).attr('cy', cy).attr('r', 4.5).attr('fill', css('--card')).attr('stroke', css('--mute')).attr('stroke-width', 1.6);
      // your rate filled
      g.append('circle').attr('cx', x(d.yours)).attr('cy', cy).attr('r', 5).attr('fill', col).attr('stroke', css('--card')).attr('stroke-width', 1.5);
    });
    $('wageLegend').innerHTML = `<span class="lg"><svg width="4" height="12"><rect width="2.5" height="12" fill="var(--mute-2)"/></svg>SCA floor</span><span class="lg"><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5"/></svg>your rate</span><span class="lg"><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="var(--card)" stroke="var(--mute)" stroke-width="1.6"/></svg>market</span>`;
  }

  function renderPanel() {
    const w = D.WAGES.find(x => x.cat === S.sel) || filtered()[0];
    const el = $('wagePanel');
    if (!w) { el.innerHTML = `<div class="cop-empty"><div class="t">Select a category</div></div>`; return; }
    const sm = D.STATUS_META[w.status], col = stColor(w.status);
    const gap = (w.market - w.yours).toFixed(2);
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${col},${shade(col)})"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:24px;height:24px"><path d="M3 20h18"/><rect x="6" y="10" width="3" height="10"/><rect x="11" y="6" width="3" height="14"/><rect x="16" y="13" width="3" height="7"/></svg></div>
        <div class="cop-id"><div class="cop-name">${w.cat}</div><div class="cop-title">${w.loc}</div><span class="cop-agy">${w.wd}</span></div>
        <span class="cop-rel" style="background:${hexA(col,.13)};color:${col}"><i style="background:${col}"></i>${sm.label}</span>
      </div>
      <div class="cop-metrics">
        <div class="cop-m"><span class="mv">$${w.sca.toFixed(2)}</span><span class="ml">SCA floor</span></div>
        <div class="cop-m"><span class="mv" style="color:${col}">$${w.yours.toFixed(2)}</span><span class="ml">Your rate</span></div>
        <div class="cop-m"><span class="mv">$${w.market.toFixed(2)}</span><span class="ml">Market</span></div>
        <div class="cop-m"><span class="mv" style="color:${w.var>=0?css('--green-600'):css('--red-600')}">${w.var>=0?'+':''}${w.var}%</span><span class="ml">vs market</span></div>
        <div class="cop-m"><span class="mv">$${(w.yours-w.sca).toFixed(2)}</span><span class="ml">Over floor</span></div>
        <div class="cop-m"><span class="mv">${w.var<0?'$'+gap:'\u2014'}</span><span class="ml">Gap to close</span></div>
      </div>
      <div class="cop-note"><b>${w.status==='FLAG'?'⚡ Recommended action':'Assessment'}</b>${w.insight || (w.var >= 0 ? 'Your rate is at or above market and compliant with the SCA determination. No action needed.' : 'Within tolerance but below market — monitor for retention risk at recompete.')}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Model rate change</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>View WD</button>
      </div>`;
  }

  function renderList() {
    const data = filtered();
    $('feedCount').innerHTML = `${data.length} categories · click a row to inspect`;
    $('wageList').innerHTML = `<div class="wt-head"><span>Labor Category</span><span>SCA</span><span>You</span><span>Market</span><span>Var</span><span>Status</span></div>` + data.map(w => {
      const col = stColor(w.status), vcol = w.var >= 0 ? css('--green-600') : css('--red-600');
      return `<div class="wt-row${S.sel === w.cat ? ' sel' : ''}" data-cat="${w.cat}">
        <span class="wt-cat"><i style="background:${col}"></i><b>${w.cat}</b><small>${w.site}</small></span>
        <span class="wt-num">$${w.sca.toFixed(2)}</span>
        <span class="wt-num" style="font-weight:800;color:${col}">$${w.yours.toFixed(2)}</span>
        <span class="wt-num">$${w.market.toFixed(2)}</span>
        <span class="wt-num" style="font-weight:800;color:${vcol}">${w.var>=0?'+':''}${w.var}%</span>
        <span class="wt-status" style="color:${col};background:${hexA(col,.12)}">${D.STATUS_META[w.status].label}</span>
      </div>`;
    }).join('') || `<div class="tl-empty">No categories match your filters.</div>`;
    $('wageList').querySelectorAll('.wt-row').forEach(r => r.onclick = () => { S.sel = r.dataset.cat; renderWage(); renderPanel(); renderList(); });
  }

  function renderFlags() {
    const flags = D.WAGES.filter(w => w.status === 'FLAG').sort((a, b) => a.var - b.var);
    $('flagList').innerHTML = flags.map(w => {
      const col = stColor('FLAG');
      return `<div class="gap-row" data-cat="${w.cat}"><div class="gap-l"><span class="gap-badge" style="background:${hexA(col,.14)};color:${col}">${w.var}%</span><div class="gap-info"><div class="gap-name">${w.cat} · ${w.site}</div><div class="gap-fix">${w.insight || 'Below market — adjust before your next bid.'}</div></div></div><span class="gap-pct" style="color:${col}">$${w.yours.toFixed(2)}</span></div>`;
    }).join('') || `<div class="tl-empty">No below-market rates. You're competitive.</div>`;
    $('flagList').querySelectorAll('.gap-row').forEach(r => r.onclick = () => { S.sel = r.dataset.cat; renderWage(); renderPanel(); renderList(); });
  }

  function renderWD() {
    $('wdList').innerHTML = D.RENEWALS.map(r => {
      const cls = r.tone === 'red' ? 'crit' : r.tone === 'amber' ? 'warn' : 'ok';
      return `<div class="eff-row"><div class="eff-info"><div class="eff-name">${r.wd}</div><div class="eff-clause">${r.loc}</div></div><span class="eff-count ${cls}">in ${r.days} days</span></div>`;
    }).join('');
    // site competitiveness rollup
    const sites = {};
    D.WAGES.forEach(w => { (sites[w.site] = sites[w.site] || []).push(w); });
    const rollup = Object.entries(sites).map(([site, ws]) => ({ site, avg: ws.reduce((a, w) => a + w.var, 0) / ws.length, flags: ws.filter(w => w.status === 'FLAG').length })).sort((a, b) => a.avg - b.avg);
    $('wdList').insertAdjacentHTML('afterbegin', `<div class="site-roll"><div class="site-roll-head">Site competitiveness · avg variance vs market</div>` + rollup.map(s => {
      const col = s.avg >= 0 ? css('--green-600') : s.avg >= -1.5 ? css('--amber-600') : css('--red-600');
      const w = Math.min(100, Math.abs(s.avg) / 3 * 100);
      return `<div class="site-row"><span class="site-name">${s.site}</span><span class="site-track"><i style="width:${w}%;background:${col};margin-left:${s.avg<0?'auto':'0'}"></i></span><span class="site-var" style="color:${col}">${s.avg>=0?'+':''}${s.avg.toFixed(1)}%</span></div>`;
    }).join('') + `</div>`);
  }

  function renderInsight() {
    const flags = D.WAGES.filter(w => w.status === 'FLAG');
    const w = D.WAGES.find(x => x.cat === S.sel);
    let html;
    if (w && w.status === 'FLAG') html = `<span class="ib-label">Below market</span><b>${w.cat}</b> is <b>${w.var}%</b> under market ($${w.yours} vs $${w.market}) — ${w.insight}`;
    else html = `<span class="ib-label">Read</span><b>${flags.length} categories sit below market.</b> Welders, inspectors and toolmakers are your biggest retention risks — adjust before the next WD renewal in 22 days.`;
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  function shade(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n>>16)&255)*.66)},${Math.round(((n>>8)&255)*.66)},${Math.round((n&255)*.66)})`; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderWage(); renderPanel(); renderList(); renderFlags(); renderWD(); renderInsight(); }
  function onThemeChange() { renderAll(); }
  function init() { buildControls(); renderAll(); let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderWage, 200); }); }
  window.WAGE_APP = { onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
