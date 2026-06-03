/* FARaudit · Teaming Partners (best-in-class) — render + partner-fit scatter */
(function () {
  const D = window.TEAM;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const topCert = (p) => p.certs.find(c => c !== 'SB') || 'SB';
  const certCol = (c) => D.CERT_COLOR[c] || css('--mute-2');

  const S = { naics: 'all', cert: 'all', q: '', sort: 'Best fit', sel: 'p-002' };

  function buildControls() {
    $('naicsFilters').innerHTML = D.NAICS_FILTERS.map(n => `<button class="fpill ${n.key === S.naics ? 'active' : ''}" data-naics="${n.key}">${n.label}</button>`).join('');
    $('naicsFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.naics = b.dataset.naics; sync(); renderAll(); });
    $('certFilters').innerHTML = D.CERT_FILTERS.map(c => `<button class="fpill ${c.key === S.cert ? 'active' : ''}" data-cert="${c.key}">${c.label}</button>`).join('');
    $('certFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.cert = b.dataset.cert; sync(); renderAll(); });
    const sortHtml = D.SORTS.map(s => `<button data-sort="${s}" class="fpill ${s === S.sort ? 'active' : ''}">${s}</button>`).join('');
    $('sortSeg').innerHTML = sortHtml;
    $('sortTabs').innerHTML = D.SORTS.map(s => `<button class="people-tab ${s === S.sort ? 'active' : ''}" data-sort="${s}">${s}</button>`).join('');
    const onSort = (b) => { S.sort = b.dataset.sort; syncSort(); renderList(); };
    $('sortSeg').querySelectorAll('button').forEach(b => b.onclick = () => onSort(b));
    $('sortTabs').querySelectorAll('button').forEach(b => b.onclick = () => onSort(b));
    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.naics = 'all'; S.cert = 'all'; S.q = ''; S.sort = 'Best fit'; $('searchInput').value = ''; sync(); syncSort(); renderAll(); };
  }
  function sync() {
    $('naicsFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.naics === S.naics));
    $('certFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cert === S.cert));
  }
  function syncSort() {
    $('sortSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort));
    $('sortTabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.sort === S.sort));
  }

  function filtered() {
    let d = D.PARTNERS.filter(p => {
      if (S.naics !== 'all' && !p.naics.includes(S.naics)) return false;
      if (S.cert !== 'all' && !p.certs.includes(S.cert)) return false;
      if (S.q && !(p.name + ' ' + p.loc + ' ' + p.naics.join(' ') + ' ' + p.certs.join(' ')).toLowerCase().includes(S.q)) return false;
      return true;
    });
    if (S.sort === 'Best fit') d.sort((a, b) => b.fit - a.fit);
    else if (S.sort === 'Complementarity') d.sort((a, b) => b.complement - a.complement);
    else d.sort((a, b) => b.value - a.value);
    return d;
  }

  function renderKPIs() {
    const f = filtered();
    const certsViaTeam = D.CERT_COVERAGE.filter(c => !c.yours && c.via > 0).length;
    const avgFit = f.length ? Math.round(f.reduce((a, p) => a + p.fit, 0) / f.length) : 0;
    const totalPP = f.reduce((a, p) => a + p.value, 0).toFixed(1);
    const cards = [
      { lbl: 'Matched Partners', val: f.length, unit: '', foot: 'in your NAICS', tone: 'blue' },
      { lbl: 'Set-Asides via Team', val: certsViaTeam, unit: '', foot: 'you cannot bid alone', tone: 'purple' },
      { lbl: 'Avg Partner Fit', val: avgFit, unit: '/100', foot: 'NAICS + cert + agency', tone: 'green' },
      { lbl: 'Combined Past Perf', val: '$' + totalPP, unit: 'B', foot: 'addressable with partners', tone: 'amber' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsTotal').textContent = D.PARTNERS.length;
    $('hsCerts').textContent = certsViaTeam;
    $('hsOpps').textContent = D.TEAMING_OPPS.length;
  }

  /* scatter: x = complementarity, y = fit, size = past perf, color = cert */
  function renderScatter() {
    const svg = d3.select('#scatterSvg'); svg.selectAll('*').remove();
    const node = $('scatterSvg'); if (!node) return;
    const W = node.clientWidth || 680, H = 360, m = { t: 20, r: 20, b: 38, l: 50 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = filtered();
    const x = d3.scaleLinear().domain([40, 95]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([65, 95]).range([H - m.b, m.t]);
    const r = d3.scaleSqrt().domain([1, 5.5]).range([7, 22]);
    const mx = 75, my = 82;
    svg.append('rect').attr('x', x(mx)).attr('y', m.t).attr('width', (W - m.r) - x(mx)).attr('height', y(my) - m.t).attr('fill', css('--green-500')).attr('opacity', .05);
    svg.append('text').attr('class', 'zone').attr('x', W - m.r - 4).attr('y', m.t + 12).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 9.5).attr('font-weight', 700).attr('fill', css('--green-700')).text('PRIORITY ◆');
    svg.append('line').attr('x1', x(mx)).attr('x2', x(mx)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(my)).attr('y2', y(my)).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => d).tickSize(4));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(4));
    svg.append('text').attr('class', 'axis-title').attr('x', W - m.r).attr('y', H - 6).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 9.5).attr('fill', css('--mute')).text('fills your gaps →');
    svg.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -m.t).attr('y', 13).attr('text-anchor', 'end').attr('font-family', 'IBM Plex Mono').attr('font-size', 9.5).attr('fill', css('--mute')).text('overall fit ↑');
    svg.selectAll('circle.dot').data(data, d => d.id).join('circle')
      .attr('class', d => 'dot' + (S.sel === d.id ? ' sel' : '') + (S.sel && S.sel !== d.id ? ' dim' : ''))
      .attr('cx', d => x(d.complement)).attr('cy', d => y(d.fit)).attr('r', d => r(d.value))
      .attr('fill', d => certCol(topCert(d))).attr('opacity', 1).attr('stroke', css('--card')).attr('stroke-width', 1.8).style('cursor', 'pointer')
      .on('click', (ev, d) => { S.sel = d.id; renderAll(); })
      .on('mousemove', (ev, d) => { const tip = $('coTip'); tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12px;margin-bottom:2px">${d.name}</div><div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">fit ${d.fit} · complement ${d.complement}<br>${d.certs.join(', ')} · $${d.value}M past perf</div>`; tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 220) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; })
      .on('mouseleave', () => $('coTip').style.display = 'none');
    svg.selectAll('text.dotlab').data(data).join('text').attr('class', 'dotlab').attr('x', d => x(d.complement)).attr('y', d => y(d.fit) - r(d.value) - 3).attr('text-anchor', 'middle')
      .attr('font-family', 'IBM Plex Mono').attr('font-size', 8.5).attr('font-weight', 700).attr('fill', css('--ink-2')).text(d => d.name.split(' ')[0]);
    $('scatterLegend').innerHTML = Object.entries(D.CERT_COLOR).filter(([k]) => k !== 'SB').map(([k, c]) => `<span class="lg"><i style="background:${c}"></i>${k}</span>`).join('') + `<span class="lg"><i style="background:${D.CERT_COLOR.SB}"></i>SB only</span>`;
  }

  function ring(score, size) {
    const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100);
    const col = score >= 85 ? css('--green-600') : score >= 70 ? css('--accent') : css('--mute-2');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="5"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size/2} ${size/2})"/></svg>`;
  }
  function certChips(certs) { return certs.map(c => `<span class="cert-chip" style="color:${certCol(c)};background:${hexA(certCol(c),.13)}">${c}</span>`).join(''); }

  function renderPanel() {
    const p = D.PARTNERS.find(x => x.id === S.sel) || filtered()[0];
    const el = $('partnerPanel');
    if (!p) { el.innerHTML = `<div class="cop-empty"><div class="t">Select a partner</div></div>`; return; }
    const tc = certCol(topCert(p));
    const newNaics = p.naics.filter(n => !D.MY.naics.includes(n));
    const newCerts = p.certs.filter(c => !D.MY.certs.includes(c));
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${tc},${shade(tc)})">${p.name.split(' ').slice(0, 2).map(w => w[0]).join('')}</div>
        <div class="cop-id"><div class="cop-name">${p.name}</div><div class="cop-title">${p.loc}</div><div class="cert-row">${certChips(p.certs)}</div></div>
        <span class="cop-rel" style="background:${hexA(tc,.13)};color:${tc}"><i style="background:${tc}"></i>fit ${p.fit}</span>
      </div>
      <div class="cop-ring-wrap">
        <div class="cop-ring">${ring(p.fit, 62)}<div class="rn">${p.fit}<small>FIT</small></div></div>
        <div class="cop-ring-txt"><div class="t">${p.fit >= 85 ? 'Strong teaming candidate' : 'Workable fit'}</div><div class="d">Complementarity ${p.complement}/100 · $${p.value}M past performance.</div></div>
      </div>
      <div class="cop-metrics" style="grid-template-columns:repeat(2,1fr)">
        <div class="cop-m"><span class="mv">${newNaics.length ? newNaics.join(', ') : '\u2014'}</span><span class="ml">NAICS they add</span></div>
        <div class="cop-m"><span class="mv" style="color:${tc}">${newCerts.length ? newCerts.join(', ') : 'none new'}</span><span class="ml">Set-asides unlocked</span></div>
        <div class="cop-m"><span class="mv">${p.agencies.join(', ')}</span><span class="ml">Their agencies</span></div>
        <div class="cop-m"><span class="mv">$${p.value}M</span><span class="ml">Past performance</span></div>
      </div>
      <div class="cop-note"><b>⚡ Why team up</b>${p.insight}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>Request intro</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Add to team</button>
      </div>`;
  }

  function renderList() {
    const data = filtered();
    $('pplCount').innerHTML = `${data.length} partners · click to open profile`;
    $('partnerList').innerHTML = data.map(p => {
      const tc = certCol(topCert(p)), fc = p.fit >= 85 ? css('--green-600') : p.fit >= 70 ? css('--accent') : css('--mute-2');
      const cR = 16, circ = 2 * Math.PI * cR, off = circ * (1 - p.fit / 100);
      return `<div class="ppl-row ag-head2${S.sel === p.id ? ' sel' : ''}" data-id="${p.id}">
        <div class="ppl-av" style="background:linear-gradient(135deg,${tc},${shade(tc)});border-radius:11px">${p.name.split(' ').slice(0,2).map(w=>w[0]).join('')}</div>
        <div class="ppl-info"><div class="ppl-name">${p.name}</div><div class="ppl-sub">${p.loc} · ${p.agencies.join(', ')}</div></div>
        <div class="pn-mid"><span class="pn-naics">${p.naics.join(' · ')}</span><div class="cert-row">${certChips(p.certs)}</div></div>
        <div class="ppl-awd">$${p.value}M<small>complement ${p.complement}</small></div>
        <div class="ppl-fit"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${cR}" fill="none" stroke="var(--line-2)" stroke-width="3.5"/><circle cx="20" cy="20" r="${cR}" fill="none" stroke="${fc}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}" transform="rotate(-90 20 20)"/></svg><span class="fn">${p.fit}</span></div>
      </div>`;
    }).join('') || `<div class="tl-empty">No partners match your filters.</div>`;
    $('partnerList').querySelectorAll('.ppl-row').forEach(r => r.onclick = () => { S.sel = r.dataset.id; renderScatter(); renderPanel(); renderList(); });
  }

  function renderCerts() {
    $('certList').innerHTML = D.CERT_COVERAGE.map(c => {
      const col = certCol(c.cert);
      const status = c.yours ? 'You hold' : c.via > 0 ? `Via ${c.via} partner${c.via > 1 ? 's' : ''}` : 'Not available';
      const cls = c.yours ? 'own' : c.via > 0 ? 'team' : 'none';
      return `<div class="cert-cov ${cls}"><span class="cc-badge" style="background:${hexA(col,.14)};color:${col}">${c.cert}</span><div class="cc-info"><div class="cc-name">${c.label}</div><div class="cc-status">${status}</div></div><span class="cc-check ${cls}">${c.yours ? '✓ own' : c.via > 0 ? '◆ team' : '—'}</span></div>`;
    }).join('');
    const reach = D.CERT_COVERAGE.filter(c => c.yours || c.via > 0).length, total = D.CERT_COVERAGE.length;
    $('certList').insertAdjacentHTML('afterbegin', `<div class="cert-summary"><div class="cs-ring"><svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="var(--line-2)" stroke-width="5"/><circle cx="23" cy="23" r="19" fill="none" stroke="${css('--purple-600')}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${2*Math.PI*19}" stroke-dashoffset="${2*Math.PI*19*(1-reach/total)}" transform="rotate(-90 23 23)"/></svg><span class="cs-num">${reach}/${total}</span></div><div class="cs-txt"><div class="cs-t">${reach} of ${total} set-aside lanes reachable</div><div class="cs-d">1 solo · <b>${reach-1} unlocked by teaming</b></div></div></div>`);
  }

  function renderOpps() {
    $('toppList').innerHTML = D.TEAMING_OPPS.map(o => `<div class="topp-row"><div class="topp-info"><div class="topp-title">${o.title}</div><div class="topp-sol">${o.sol} · $${o.val}M</div><div class="topp-need">${o.need}</div></div><div class="topp-match"><span class="topp-match-lbl">best match</span><span class="topp-match-name">${o.match}</span></div></div>`).join('');
  }

  function renderInsight() {
    const p = D.PARTNERS.find(x => x.id === S.sel);
    let html;
    if (p) { const nc = p.certs.filter(c => !D.MY.certs.includes(c)); html = `<span class="ib-label">Top match</span><b>${p.name}</b> (fit ${p.fit}) ${nc.length ? `unlocks <b>${nc.join(', ')}</b> set-asides and ` : ''}${p.insight}`; }
    else html = `<span class="ib-label">Read</span>Teaming unlocks <b>4 set-aside categories</b> you can't bid alone. <b>Desert Aerospace</b> (SDVOSB) and <b>Summit (HUBZone)</b> are your highest-leverage partners for the open T-38 and WR-ALC sols.`;
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  function shade(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n>>16)&255)*.66)},${Math.round(((n>>8)&255)*.66)},${Math.round((n&255)*.66)})`; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderScatter(); renderPanel(); renderList(); renderCerts(); renderOpps(); renderInsight(); }
  function onThemeChange() { renderAll(); }
  function init() { buildControls(); renderAll(); let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderScatter, 200); }); }
  window.TEAM_APP = { render: renderAll, onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
