/* FARaudit · GAO Protests (best-in-class) — render + outcome funnel */
(function () {
  const D = window.GAO;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const stColor = (s) => D.STATUS_META[s].color;
  const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtV = (v) => v >= 1 ? '$' + v.toFixed(1) + 'M' : '$' + Math.round(v * 1000) + 'K';

  const S = { status: 'all', agency: 'all', q: '', sort: 'Newest', sel: 'gp-001' };

  function buildControls() {
    $('statusFilters').innerHTML = D.STATUS_FILTERS.map(s => `<button class="fpill ${s.key === S.status ? 'active' : ''}" data-st="${s.key}">${s.label}</button>`).join('');
    $('statusFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.status = b.dataset.st; sync(); renderAll(); });
    $('agencyFilters').innerHTML = D.AGENCY_FILTERS.map(a => `<button class="fpill ${a.key === S.agency ? 'active' : ''}" data-ag="${a.key}">${a.label}</button>`).join('');
    $('agencyFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.agency = b.dataset.ag; sync(); renderAll(); });
    $('sortSeg').innerHTML = D.SORTS.map(s => `<button data-sort="${s}" class="fpill ${s === S.sort ? 'active' : ''}">${s}</button>`).join('');
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; syncSort(); renderFeed(); });
    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.status = 'all'; S.agency = 'all'; S.q = ''; S.sort = 'Newest'; $('searchInput').value = ''; sync(); syncSort(); renderAll(); };
  }
  function sync() {
    $('statusFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.st === S.status));
    $('agencyFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.ag === S.agency));
  }
  function syncSort() { $('sortSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort)); }

  function filtered() {
    return D.PROTESTS.filter(p => {
      if (S.status !== 'all' && p.status !== S.status) return false;
      if (S.agency !== 'all' && p.agency !== S.agency) return false;
      if (S.q && !(p.docket + ' ' + p.title + ' ' + p.agency + ' ' + p.ground + ' ' + p.protester).toLowerCase().includes(S.q)) return false;
      return true;
    });
  }

  function renderKPIs() {
    const f = filtered();
    const active = f.filter(p => p.status === 'Active').length;
    const sustained = f.filter(p => p.status === 'Sustained').length;
    const decided = f.filter(p => p.status === 'Sustained' || p.status === 'Denied').length;
    const rate = decided ? Math.round(sustained / decided * 100) : 0;
    const cards = [
      { lbl: 'In View', val: f.length, unit: '', foot: 'matching your filters', tone: 'blue' },
      { lbl: 'Active Protests', val: active, unit: '', foot: 'could disrupt awards', tone: 'amber' },
      { lbl: 'Sustained', val: sustained, unit: '', foot: 'protester won', tone: 'green' },
      { lbl: 'Sustain Rate', val: rate, unit: '%', foot: 'of decided in view', tone: 'red' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsFiled').textContent = D.NATIONAL.filed.toLocaleString();
    $('hsRate').textContent = D.NATIONAL.sustainRate + '%';
    $('hsEff').textContent = D.NATIONAL.effectiveness + '%';
  }

  /* horizontal funnel: Filed → Merit decisions → Sustained (+ effectiveness) */
  function renderFunnel() {
    const svg = d3.select('#funnelSvg'); svg.selectAll('*').remove();
    const node = $('funnelSvg'); if (!node) return;
    const W = node.clientWidth || 660, H = 300, m = { t: 16, r: 16, b: 16, l: 16 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const N = D.NATIONAL;
    const steps = [
      { label: 'Protests Filed', val: N.filed, sub: 'FY2025 nationwide', color: '#94a3b8' },
      { label: 'Merit Decisions', val: N.meritDecisions, sub: 'reached a ruling', color: '#378ADD' },
      { label: 'Sustained', val: N.sustained, sub: N.sustainRate + '% of decisions', color: '#059669' }
    ];
    const maxV = steps[0].val;
    const bandH = (H - m.t - m.b - (steps.length - 1) * 14) / steps.length;
    steps.forEach((s, i) => {
      const w = Math.max(176, s.val / maxV * (W - m.l - m.r));
      const y = m.t + i * (bandH + 14), x0 = m.l + ((W - m.l - m.r) - w) / 2;
      svg.append('rect').attr('x', x0).attr('y', y).attr('width', w).attr('height', bandH).attr('rx', 9).attr('fill', s.color).attr('opacity', .9);
      svg.append('text').attr('x', W / 2).attr('y', y + bandH / 2 - 5).attr('text-anchor', 'middle').attr('font-family', 'Manrope').attr('font-size', 24).attr('font-weight', 800).attr('fill', '#fff').text(s.val.toLocaleString());
      svg.append('text').attr('x', W / 2).attr('y', y + bandH / 2 + 13).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 10).attr('font-weight', 700).attr('fill', 'rgba(255,255,255,.92)').text(s.label.toUpperCase());
      svg.append('text').attr('x', W / 2).attr('y', y + bandH / 2 + 27).attr('text-anchor', 'middle').attr('font-family', 'IBM Plex Mono').attr('font-size', 9).attr('fill', 'rgba(255,255,255,.7)').text(s.sub);
      if (i < steps.length - 1) {
        const pct = Math.round(steps[i + 1].val / s.val * 100);
        svg.append('text').attr('x', W - m.r).attr('y', y + bandH + 11).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 9.5).attr('font-weight', 700).attr('fill', css('--mute')).text('↓ ' + pct + '%');
      }
    });
    $('funnelLegend').innerHTML = `<span class="lg" style="color:var(--ink-2)"><b style="font-family:Manrope;color:${css('--accent-deep')}">${N.effectiveness}% effectiveness rate</b> — share of protesters who got relief (sustain or voluntary corrective action)</span>`;
  }

  function renderPanel() {
    const p = D.PROTESTS.find(x => x.id === S.sel) || filtered()[0];
    const el = $('protPanel');
    if (!p) { el.innerHTML = `<div class="cop-empty"><div class="t">Select a protest</div></div>`; return; }
    const col = stColor(p.status);
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${col},${shade(col)})"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:24px;height:24px"><circle cx="12" cy="12" r="9"/><path d="M2 12h20"/></svg></div>
        <div class="cop-id"><div class="cop-name">${p.docket}</div><div class="cop-title">${p.protester}</div><span class="cop-agy">${p.agency} · ${p.naics}</span></div>
        <span class="cop-rel" style="background:${hexA(col,.13)};color:${col}"><i style="background:${col}"></i>${D.STATUS_META[p.status].label}</span>
      </div>
      <div class="cop-note" style="border-bottom:1px solid var(--line-2);padding-top:0"><b>Protest</b>${p.title}</div>
      <div class="cop-metrics">
        <div class="cop-m"><span class="mv">${fmtV(p.val)}</span><span class="ml">At stake</span></div>
        <div class="cop-m"><span class="mv">${p.days}d</span><span class="ml">${p.status === 'Active' ? 'Open' : 'To resolve'}</span></div>
        <div class="cop-m"><span class="mv">${fmtDate(p.filed).split(',')[0]}</span><span class="ml">Filed</span></div>
      </div>
      <div class="cop-note" style="border-bottom:1px solid var(--line-2)"><b>Ground</b>${p.ground}</div>
      <div class="cop-note"><b>⚡ Analysis</b>${p.detail}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>Read decision</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Watch docket</button>
      </div>`;
  }

  function renderFeed() {
    let data = filtered().slice();
    if (S.sort === 'Newest') data.sort((a, b) => Date.parse(b.filed) - Date.parse(a.filed));
    else if (S.sort === 'Value') data.sort((a, b) => b.val - a.val);
    else data.sort((a, b) => b.days - a.days);
    $('feedCount').innerHTML = `${data.length} protests · click any case to inspect`;
    $('protList').innerHTML = data.map(p => {
      const col = stColor(p.status);
      return `<div class="feed-card${S.sel === p.id ? ' sel' : ''}" data-id="${p.id}" style="border-left-color:${col}">
        <div class="feed-top"><span class="feed-clause">${p.docket}</span><span class="feed-imp" style="color:${col};background:${hexA(col,.12)}">${D.STATUS_META[p.status].label}</span><span class="feed-type" style="color:var(--mute);background:var(--card-soft)">${p.agency}</span><span class="feed-date">${fmtV(p.val)} · ${fmtDate(p.filed)}</span></div>
        <div class="feed-title">${p.title}</div>
        <div class="feed-summary"><b style="color:var(--ink-2)">Ground:</b> ${p.ground}</div>
        <div class="feed-insight"><b>⚡ Analysis</b>${p.detail}</div>
      </div>`;
    }).join('') || `<div class="tl-empty">No protests match your filters.</div>`;
    $('protList').querySelectorAll('.feed-card').forEach(c => c.onclick = () => { S.sel = c.dataset.id; renderPanel(); renderFeed(); });
  }

  function renderAgencyBars() {
    const max = Math.max(...D.BY_AGENCY.map(a => a.rate));
    $('agencyBars').innerHTML = D.BY_AGENCY.slice().sort((a, b) => b.rate - a.rate).map(a => {
      const col = a.rate >= 20 ? css('--red-600') : a.rate >= 14 ? css('--amber-600') : css('--green-600');
      const active = S.agency === a.agency;
      return `<div class="byt-row${active ? ' active' : ''}" data-ag="${a.agency}">
        <span class="byt-name"><i style="background:${col}"></i>${a.agency}</span>
        <span class="byt-bar"><i style="width:${a.rate / max * 100}%;background:${col}"></i></span>
        <span class="byt-n">${a.rate}%</span></div>`;
    }).join('') + `<div style="font-family:'IBM Plex Mono';font-size:9px;color:var(--mute);padding-top:4px;text-align:center">% of decided protests sustained · higher = more award instability</div>`;
    $('agencyBars').querySelectorAll('.byt-row').forEach(r => r.onclick = () => { S.agency = (S.agency === r.dataset.ag ? 'all' : r.dataset.ag); sync(); renderAll(); });
  }

  function renderGrounds() {
    const max = Math.max(...D.GROUNDS.map(g => g.share));
    $('groundsList').innerHTML = D.GROUNDS.map(g => {
      const col = D.ODDS_COLOR[g.sustainOdds];
      return `<div class="grd-row">
        <span class="grd-name">${g.ground}</span>
        <span class="grd-bar"><i style="width:${g.share / max * 100}%;background:${col}"></i></span>
        <span class="grd-odds" style="color:${col};background:${hexA(col,.12)}">${g.sustainOdds}</span></div>`;
    }).join('');
  }

  function renderSignals() {
    $('signalList').innerHTML = D.SIGNALS.map(s => {
      const col = s.tone === 'red' ? css('--red-600') : s.tone === 'amber' ? css('--amber-600') : css('--accent');
      return `<div class="aff-row2" style="border-left:3px solid ${col}"><div class="aff-info"><div class="aff-sol" style="font-family:Manrope;font-size:13px">${s.title}</div><div class="aff-action" style="margin-top:3px">${s.body}</div></div></div>`;
    }).join('');
    const active = D.PROTESTS.filter(p => p.status === 'Active');
    const exposure = active.reduce((a, p) => a + p.val, 0);
    $('signalList').insertAdjacentHTML('afterbegin', `<div class="exposure"><div class="exp-l"><div class="exp-num">$${exposure.toFixed(1)}M</div><div class="exp-lbl">award value currently contestable</div></div><div class="exp-r"><span class="exp-count">${active.length}</span><span class="exp-sub">active protests in your NAICS</span></div></div>`);
  }

  function renderInsight() {
    const p = D.PROTESTS.find(x => x.id === S.sel);
    let html;
    if (p && p.status === 'Active') html = `<span class="ib-label">Watch</span><b>${p.docket}</b> is an active protest against <b>${p.agency}</b> (${fmtV(p.val)}) on ${p.ground.toLowerCase()} — could trigger corrective action on an award you're tracking.`;
    else if (p && p.status === 'Sustained') html = `<span class="ib-label">Precedent</span><b>${p.docket}</b> was sustained on <b>${p.ground.toLowerCase()}</b> — ${p.detail.split('.')[0]}.`;
    else html = `<span class="ib-label">Read</span>GAO sustains only <b>14%</b>, but effectiveness is <b>52%</b>. <b>AFMC</b> sustains 24% in your NAICS — and <b>technical evaluation</b> is the #1 winning ground. Protest there with documented evidence.`;
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  function shade(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n>>16)&255)*.66)},${Math.round(((n>>8)&255)*.66)},${Math.round((n&255)*.66)})`; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderFunnel(); renderPanel(); renderFeed(); renderAgencyBars(); renderGrounds(); renderSignals(); renderInsight(); }
  function onThemeChange() { renderAll(); }
  function init() { buildControls(); renderAll(); let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderFunnel, 200); }); }
  window.GAO_APP = { render: renderAll, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
