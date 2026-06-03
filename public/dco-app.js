/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Contracting Officers (best-in-class) — Relationship CRM logic
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const D = window.DCO;
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const S = { agency: 'all', seg: null, q: '', sel: 'co-hartwell' };

  const relColor = (r) => D.REL_META[r].color;

  /* ─── controls ─── */
  function buildControls() {
    $('agencyFilters').innerHTML = D.AGENCY_FILTERS.map(a =>
      `<button class="fpill ${a === S.agency ? 'active' : ''}" data-agency="${a}">${a === 'all' ? 'All' : a}</button>`).join('');
    $('agencyFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.agency = b.dataset.agency; sync(); renderAll(); });

    $('segments').innerHTML = D.SAVED_SEGMENTS.map(s =>
      `<button class="view-chip ${s.key === S.seg ? 'active' : ''}" data-seg="${s.key}"><span class="vc-t">${s.label}</span><span class="vc-d">${s.desc}</span></button>`).join('');
    $('segments').querySelectorAll('button').forEach(b => b.onclick = () => { S.seg = (S.seg === b.dataset.seg ? null : b.dataset.seg); sync(); renderAll(); });

    $('peopleTabs').innerHTML = [['fit', 'Best fit'], ['resp', 'Responsive'], ['awards', 'Buying power'], ['cold', 'Coldest']]
      .map(t => `<button class="people-tab ${t[0] === (S.sort || 'fit') ? 'active' : ''}" data-sort="${t[0]}">${t[1]}</button>`).join('');
    $('peopleTabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.sort = b.dataset.sort; $('peopleTabs').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderPeople(); });

    $('searchInput').addEventListener('input', e => { S.q = e.target.value.toLowerCase(); renderAll(); });
    $('resetBtn').onclick = () => { S.agency = 'all'; S.seg = null; S.q = ''; $('searchInput').value = ''; sync(); renderAll(); };
  }
  function sync() {
    $('agencyFilters').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.agency === S.agency));
    $('segments').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.seg === S.seg));
  }

  /* ─── filtering ─── */
  function filtered() {
    return D.OFFICERS.filter(o => {
      if (S.agency !== 'all' && o.agency !== S.agency) return false;
      if (S.q && !(o.name + ' ' + o.agency + ' ' + o.office + ' ' + o.title).toLowerCase().includes(S.q)) return false;
      if (S.seg === 'warm' && !(o.rel === 'warm' && o.fit >= 85)) return false;
      if (S.seg === 'rewarm' && !(o.rel === 'cold' && o.lastContact >= 30)) return false;
      if (S.seg === 'responsive' && o.resp < 75) return false;
      if (S.seg === 'whales' && o.awards < 100) return false;
      return true;
    });
  }

  /* ─── KPIs ─── */
  function renderKPIs() {
    const f = filtered();
    const avgResp = f.length ? Math.round(f.reduce((a, o) => a + o.resp, 0) / f.length) : 0;
    const totalAwards = f.reduce((a, o) => a + o.awards, 0);
    const warm = f.filter(o => o.rel === 'warm').length;
    const rewarm = f.filter(o => o.rel === 'cold' && o.lastContact >= 30).length;
    const cards = [
      { lbl: 'COs In Network', val: f.length, unit: '', foot: 'buying your NAICS', tone: 'blue' },
      { lbl: 'Avg Response Rate', val: avgResp, unit: '%', foot: 'they reply to industry', tone: 'green' },
      { lbl: 'Obligated · Your Codes', val: '$' + totalAwards, unit: 'M', foot: 'last 12 months', tone: 'purple' },
      { lbl: 'Need Re-warming', val: rewarm, unit: '', foot: '30+ days since contact', tone: 'amber' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}">
      <p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsTotal').textContent = D.OFFICERS.length;
    $('hsWarm').textContent = D.OFFICERS.filter(o => o.rel === 'warm').length;
    $('hsRewarm').textContent = D.OFFICERS.filter(o => o.rel === 'cold' && o.lastContact >= 30).length;
  }

  /* ─── scatter: responsiveness (x) vs buying power (y), size=fit, color=rel ─── */
  function renderScatter() {
    const svg = d3.select('#scatterSvg'); svg.selectAll('*').remove();
    const W = $('scatterSvg').clientWidth || 680, H = 300;
    const m = { t: 22, r: 20, b: 40, l: 54 };
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const data = filtered();
    const x = d3.scaleLinear().domain([35, 100]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 160]).range([H - m.b, m.t]);
    const r = d3.scaleSqrt().domain([60, 100]).range([7, 24]);
    const medX = 70, medY = 80;
    // sweet spot top-right
    svg.append('rect').attr('x', x(medX)).attr('y', m.t).attr('width', (W - m.r) - x(medX)).attr('height', y(medY) - m.t).attr('fill', css('--green-500')).attr('opacity', .05);
    svg.append('text').attr('class', 'zone').attr('x', W - m.r - 4).attr('y', m.t + 12).attr('text-anchor', 'end').attr('fill', css('--green-700')).text('PRIORITY ◆');
    svg.append('line').attr('x1', x(medX)).attr('x2', x(medX)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(medY)).attr('y2', y(medY)).attr('stroke', css('--line')).attr('stroke-dasharray', '4,3');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([40, 55, 70, 85, 100]).tickFormat(d => d + '%').tickSize(4));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d + 'M').tickSize(4));
    svg.append('text').attr('class', 'axis-title').attr('x', W - m.r).attr('y', H - 6).attr('text-anchor', 'end').text('response rate →');
    svg.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -m.t).attr('y', 13).attr('text-anchor', 'end').text('$ obligated · your codes ↑');

    svg.selectAll('circle.dot').data(data, d => d.id).join('circle')
      .attr('class', d => 'dot' + (S.sel === d.id ? ' sel' : '') + (S.sel && S.sel !== d.id ? ' dim' : ''))
      .attr('cx', d => x(d.resp)).attr('cy', d => y(Math.min(158, d.awards))).attr('r', d => r(d.fit))
      .attr('fill', d => relColor(d.rel)).attr('opacity', .68).attr('stroke', d => relColor(d.rel)).attr('stroke-width', .5)
      .on('mousemove', (ev, d) => {
        const tip = $('coTip');
        tip.innerHTML = `<div style="font-family:Manrope;font-weight:800;font-size:12.5px;margin-bottom:3px">${d.name}</div>
          <div style="font-family:'IBM Plex Mono';font-size:10px;color:#cbd5e1;line-height:1.5">${d.agency} · fit <b style="color:#fff">${d.fit}</b><br>${d.resp}% reply · ~${d.respDays}d · $${d.awards}M obligated</div>`;
        tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 230) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      })
      .on('mouseleave', () => $('coTip').style.display = 'none')
      .on('click', (ev, d) => { S.sel = d.id; renderAll(); });

    svg.selectAll('text.dotlab').data(data).join('text')
      .attr('class', 'dotlab').attr('x', d => x(d.resp)).attr('y', d => y(Math.min(158, d.awards)) - r(d.fit) - 3).attr('text-anchor', 'middle')
      .text(d => d.initials);

    $('scatterLegend').innerHTML = Object.entries(D.REL_META).map(([k, v]) => `<span class="lg"><i style="background:${v.color}"></i>${v.label}</span>`).join('') + `<span class="lg" style="color:var(--mute-2)">○ size = fit</span>`;
  }

  /* ─── CO profile panel ─── */
  function ring(score, size, label) {
    const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100);
    const col = score >= 85 ? css('--green-600') : score >= 70 ? css('--accent') : css('--mute-2');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>`;
  }
  function renderPanel() {
    const o = D.OFFICERS.find(x => x.id === S.sel);
    const el = $('coPanel');
    if (!o) {
      el.innerHTML = `<div class="cop-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="7" r="3"/><path d="M2 21c0-4 3.5-6 7-6s7 2 7 6"/><circle cx="18" cy="8" r="2.5"/></svg><div class="t">Select a contracting officer</div><div class="d">Click any point on the chart or a row below to see their profile, history, and what they buy.</div></div>`;
      return;
    }
    const rm = D.REL_META[o.rel];
    const fitTxt = o.fit >= 85 ? 'Strong match to your codes' : o.fit >= 70 ? 'Workable overlap' : 'Partial overlap';
    el.innerHTML = `
      <div class="cop-head">
        <div class="cop-av" style="background:linear-gradient(135deg,${rm.color},${shade(rm.color)})">${o.initials}</div>
        <div class="cop-id">
          <div class="cop-name">${o.name}</div>
          <div class="cop-title">${o.title}</div>
          <span class="cop-agy">${o.agency} · ${o.office}</span>
        </div>
        <span class="cop-rel" style="background:${hexA(rm.color,.13)};color:${rm.color}"><i style="background:${rm.color}"></i>${rm.label}</span>
      </div>
      <div class="cop-metrics">
        <div class="cop-m"><span class="mv">${o.resp}<small>%</small></span><span class="ml">Reply rate</span></div>
        <div class="cop-m"><span class="mv">${o.respDays}<small>d</small></span><span class="ml">Avg response</span></div>
        <div class="cop-m"><span class="mv">$${o.awards}<small>M</small></span><span class="ml">Obligated 12mo</span></div>
        <div class="cop-m"><span class="mv">${o.actions}</span><span class="ml">Award actions</span></div>
        <div class="cop-m"><span class="mv">${o.setaside}<small>%</small></span><span class="ml">To small biz</span></div>
        <div class="cop-m"><span class="mv">${o.warrant}</span><span class="ml">Warrant</span></div>
      </div>
      <div class="cop-ring-wrap">
        <div class="cop-ring">${ring(o.fit, 62)}<div class="rn">${o.fit}<small>FIT</small></div></div>
        <div class="cop-ring-txt"><div class="t">${fitTxt}</div><div class="d">Buys ${o.naics.join(', ')} · last contact ${o.lastContact}d ago${o.lastContact >= 30 ? ' — re-warm soon' : ''}.</div></div>
      </div>
      <div class="cop-note"><b>Your note</b>${o.note}</div>
      <div class="cop-actions">
        <button class="cop-btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>Log outreach</button>
        <button class="cop-btn ghost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z" opacity="0"/><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/></svg>Add to plan</button>
      </div>`;
  }

  /* ─── people rail ─── */
  function renderPeople() {
    let data = filtered().slice();
    const sort = S.sort || 'fit';
    if (sort === 'fit') data.sort((a, b) => b.fit - a.fit);
    else if (sort === 'resp') data.sort((a, b) => b.resp - a.resp);
    else if (sort === 'awards') data.sort((a, b) => b.awards - a.awards);
    else if (sort === 'cold') data.sort((a, b) => b.lastContact - a.lastContact);
    $('pplCount').innerHTML = `${data.length} officers · click to open profile`;
    $('pplList').innerHTML = data.map(o => {
      const rm = D.REL_META[o.rel];
      const respCol = o.resp >= 75 ? css('--green-600') : o.resp >= 55 ? css('--amber-600') : css('--red-500');
      const fc = o.fit >= 85 ? css('--green-600') : o.fit >= 70 ? css('--accent') : css('--mute-2');
      const cR = 16, circ = 2 * Math.PI * cR, off = circ * (1 - o.fit / 100);
      return `<div class="ppl-row${S.sel === o.id ? ' sel' : ''}" data-id="${o.id}">
        <div class="ppl-av" style="background:linear-gradient(135deg,${rm.color},${shade(rm.color)})">${o.initials}<span class="reldot" style="background:${rm.color}"></span></div>
        <div class="ppl-info"><div class="ppl-name">${o.name}</div><div class="ppl-sub">${o.agency} · ${o.office}</div></div>
        <div class="ppl-resp"><div class="ppl-resp-bar"><i style="width:${o.resp}%;background:${respCol}"></i></div><span class="ppl-resp-lbl">${o.resp}% · ~${o.respDays}d</span></div>
        <div class="ppl-awd">$${o.awards}M<small>${o.lastContact}d ago</small></div>
        <div class="ppl-fit"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${cR}" fill="none" stroke="var(--line-2)" stroke-width="3.5"/><circle cx="20" cy="20" r="${cR}" fill="none" stroke="${fc}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/></svg><span class="fn">${o.fit}</span></div>
      </div>`;
    }).join('') || `<div class="tl-empty">No officers match your filters.</div>`;
    $('pplList').querySelectorAll('.ppl-row').forEach(r => r.onclick = () => { S.sel = r.dataset.id; renderAll(); });
  }

  /* ─── timeline ─── */
  function renderTimeline() {
    const o = D.OFFICERS.find(x => x.id === S.sel);
    $('tlSub').textContent = o ? `${o.name} · ${o.timeline.length} touchpoints` : 'Your touchpoint history';
    if (!o) { $('timeline').innerHTML = `<div class="tl-empty">Select a CO to see history.</div>`; return; }
    $('timeline').innerHTML = o.timeline.map(t => {
      const km = D.KIND_META[t.kind];
      return `<div class="tl-item">
        <div class="tl-dot" style="background:${km.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="${km.icon}"/></svg></div>
        <div class="tl-body"><div class="tl-t">${t.t}</div><div class="tl-d">${km.label} · ${t.d}</div></div>
      </div>`;
    }).join('');
  }

  /* ─── portfolio (what they buy) ─── */
  function renderSched() {
    const o = D.OFFICERS.find(x => x.id === S.sel);
    $('schedSub').textContent = o ? `${o.name}'s obligations in your codes` : 'Obligations in your codes ($M)';
    if (!o) { $('schedList').innerHTML = `<div class="tl-empty">Select a CO.</div>`; return; }
    const max = Math.max(...o.sched.map(s => s.v));
    $('schedList').innerHTML = o.sched.map(s => {
      const col = D.NAICS_COLORS[s.code] || css('--accent');
      return `<div class="sched-row">
        <div class="sched-top"><span class="sched-code">${s.code}</span><span class="sched-v">$${s.v}M</span></div>
        <div class="sched-bar"><i style="width:${Math.max(6, s.v / max * 100)}%;background:${col}"></i></div>
      </div>`;
    }).join('') + `<div style="font-family:'IBM Plex Mono';font-size:9.5px;color:var(--mute);padding-top:4px">Your codes only · last 12 months</div>`;
  }

  /* ─── outreach funnel (network-wide) ─── */
  function renderFunnel() {
    const f = filtered();
    const identified = f.length;
    const contacted = f.filter(o => o.timeline.some(t => t.kind === 'out')).length;
    const replied = f.filter(o => o.resp >= 60 || o.timeline.some(t => t.kind === 'in')).length;
    const meetings = f.filter(o => o.timeline.some(t => t.kind === 'call' || t.kind === 'event')).length;
    const awarded = f.filter(o => o.timeline.some(t => t.kind === 'win')).length;
    const steps = [
      { label: 'Identified', sub: 'in your NAICS', val: identified, color: '#94a3b8' },
      { label: 'Contacted', sub: 'you reached out', val: contacted, color: '#378ADD' },
      { label: 'Replied', sub: 'engaged back', val: replied, color: '#185FA5' },
      { label: 'Met / Called', sub: 'real conversation', val: meetings, color: '#7c3aed' },
      { label: 'Awarded', sub: 'won work', val: awarded, color: '#059669' }
    ];
    const max = identified || 1;
    $('funnel').innerHTML = steps.map((s, i) => {
      const conv = i === 0 ? 100 : steps[i - 1].val ? Math.round(s.val / steps[i - 1].val * 100) : 0;
      return `<div class="fn-row">
        <div class="fn-label">${s.label}<small>${s.sub}</small></div>
        <div class="fn-track"><div class="fn-fill" style="width:${Math.max(8, s.val / max * 100)}%;background:${s.color}">${s.val}</div></div>
        <div class="fn-conv">${i === 0 ? '—' : conv + '%'}</div>
      </div>`;
    }).join('');
  }

  /* ─── insight ─── */
  function renderInsight() {
    const o = D.OFFICERS.find(x => x.id === S.sel);
    let html;
    if (o) {
      if (o.rel === 'cold' && o.lastContact >= 30)
        html = `<span class="ib-label">Re-warm</span><b>${o.name}</b> (${o.agency}) controls <b>$${o.awards}M</b> in your codes but has gone <b>${o.lastContact} days</b> quiet — ${o.note.split('.')[0]}. Re-engage before the next recompete.`;
      else if (o.resp >= 80 && o.awards >= 100)
        html = `<span class="ib-label">Priority</span><b>${o.name}</b> is a top target — <b>${o.resp}% reply rate</b> and <b>$${o.awards}M</b> obligated in your codes. Keep the relationship warm with quarterly touchpoints.`;
      else
        html = `<span class="ib-label">Focus</span><b>${o.name}</b> · ${D.REL_META[o.rel].label.toLowerCase()} relationship, ${o.resp}% reply rate, fit ${o.fit}/100. ${o.note.split('.')[0]}.`;
    } else {
      const rewarm = D.OFFICERS.filter(x => x.rel === 'cold' && x.lastContact >= 30);
      html = `<span class="ib-label">Read</span>Your warmest, highest-value COs sit top-right on the chart. <b>${rewarm.length} cold COs</b> control real spend but have gone quiet — use the <b>Needs re-warming</b> segment to prioritize outreach.`;
    }
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span>${html}</span>`;
  }

  /* ─── helpers ─── */
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * .68); g = Math.round(g * .68); b = Math.round(b * .68);
    return `rgb(${r},${g},${b})`;
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function renderAll() { renderKPIs(); renderScatter(); renderPanel(); renderPeople(); renderTimeline(); renderSched(); renderFunnel(); renderInsight(); }
  function onThemeChange() { renderAll(); }

  function init() {
    buildControls(); renderAll();
    let to; window.addEventListener('resize', () => { clearTimeout(to); to = setTimeout(renderScatter, 220); });
  }
  window.DCO_APP = { onThemeChange };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
