/* FARaudit · Today / Command Center (best-in-class) — unifies all desks */
(function () {
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // Promote DESK / ACTIONS / WEEK to window.CC so command-center-live.js
  // can mutate the arrays/objects in place. Keep the IIFE-local refs so
  // render logic doesn't change.
  window.CC = window.CC || {
    DESK: {
      opp:   { label: 'Opportunities', color: '#378ADD', href: '/opportunities', icon: 'M12 2a9 9 0 100 18 9 9 0 000-18zM9 12l2 2 4-4' },
      co:    { label: 'Contracting Officers', color: '#185FA5', href: '/contracting-officers', icon: 'M9 9a3 3 0 100-6 3 3 0 000 6zM3 20c1-3 3-5 6-5s5 2 6 5' },
      cmmc:  { label: 'CMMC Readiness', color: '#0891b2', href: '/cmmc', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
      gao:   { label: 'GAO Protests', color: '#dc2626', href: '/gao-protests', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18' },
      far:   { label: 'FAR/DFARS', color: '#7c3aed', href: '/far-dfars-updates', icon: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5' },
      wage:  { label: 'Wage Benchmarks', color: '#d97706', href: '/wage-benchmarks', icon: 'M3 20h18M6 16v-5M11 16V8M16 16v-3' },
      team:  { label: 'Teaming Partners', color: '#059669', href: '/teaming-partners', icon: 'M7 9a3 3 0 100-6 3 3 0 000 6zM17 9a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 5-5M22 20c0-3-2.5-5-5-5' },
      spend: { label: 'Defense Spending', color: '#2C6CB4', href: '/defense-spending', icon: 'M4 19V5M4 19h16M8 16v-4M13 16V9M18 16v-2' }
    },
    ACTIONS: [
      { desk: 'opp', urg: 'crit', days: 6, title: 'SPY-6 Radar Sustainment — submit in 6 days', why: 'Fit 94, SDVOSB set-aside, $18.4M ceiling. Your strongest open pursuit and the clock is running.', cta: 'Open pursuit', val: '$18.4M' },
      { desk: 'gao', urg: 'crit', days: 0, title: '$5.4M of tracked award value is contestable', why: 'Active AFMC C-17 protest could vacate an award you are tracking. Watch for corrective action this week.', cta: 'Review protest', val: '$5.4M' },
      { desk: 'cmmc', urg: 'warn', days: 161, title: 'CMMC SSP incomplete — CM & CA domains failing', why: 'You are 78% ready but the System Security Plan is the #1 C3PAO deliverable. 16 controls open before enforcement.', cta: 'Open readiness', val: '78%' },
      { desk: 'far', urg: 'warn', days: 15, title: 'CMMC clause 252.204-7021 effective in 15 days', why: 'Lowered to >$100K with CUI. 7 of your tracked solicitations now require Level 2 certification to bid.', cta: 'See redline', val: '7 sols' },
      { desk: 'co', urg: 'warn', days: 47, title: 'Re-warm Greg Bauer (TACOM) — 47 days quiet', why: 'Controls $87M in your codes but has gone cold. A recompete is coming — re-engage before it posts.', cta: 'Open profile', val: '$87M' },
      { desk: 'wage', urg: 'warn', days: 22, title: 'Aircraft Inspector pay 3.4% below market', why: 'Two inspector categories at JBSA are under market. Adjust before the WD renews in 22 days or risk losing staff.', cta: 'Open benchmarks', val: '−3.4%' },
      { desk: 'team', urg: 'ok', days: null, title: 'Desert Aerospace unlocks the T-38 sol', why: 'Their SDVOSB cert + C-130J past performance makes the $14.2M T-38 depot IDIQ winnable. Request an intro.', cta: 'Open partners', val: '$14.2M' },
      { desk: 'spend', urg: 'ok', days: null, title: 'WA, OH, GA are high-spend BD gaps', why: 'Real obligations in your NAICS with no recorded activity from you. Whitespace worth a territory plan.', cta: 'Open map', val: '3 states' }
    ],
    WEEK: [
      { d: 'Jun 5', day: 2, label: 'Field Feeding precision parts — quote due', tag: 'Opportunity', tone: 'crit', desk: 'opp' },
      { d: 'Jun 9', day: 6, label: 'SPY-6 Radar — proposal due', tag: 'Opportunity', tone: 'crit', desk: 'opp' },
      { d: 'Jun 18', day: 15, label: 'CMMC §252.204-7021 effective', tag: 'Regulatory', tone: 'warn', desk: 'far' },
      { d: 'Jun 25', day: 22, label: 'WD 2015-4267 renewal (JBSA)', tag: 'Wage', tone: 'warn', desk: 'wage' },
      { d: 'Jun 30', day: 27, label: 'FY26 Q3 close — agency obligation push', tag: 'Fiscal Year', tone: 'warn', gov: true },
      { d: 'Jul 2', day: 29, label: 'AFMC C-17 protest decision window', tag: 'Protest', tone: 'ok', desk: 'gao' },
      { d: 'Jul 31', day: 58, label: 'FY27 defense budget markups begin', tag: 'Budget', tone: 'ok', gov: true },
      { d: 'Aug 29', day: 87, label: 'SAM.gov annual registration renewal', tag: 'Registration', tone: 'warn', gov: true },
      { d: 'Sep 30', day: 119, label: 'FY26 year-end — use-it-or-lose-it surge', tag: 'Fiscal Year', tone: 'crit', gov: true, big: true }
    ]
  };
  const DESK = window.CC.DESK;
  const ACTIONS = window.CC.ACTIONS;
  const WEEK = window.CC.WEEK;

  const URG = { crit: { c: '#dc2626', l: 'Critical' }, warn: { c: '#d97706', l: 'This week' }, ok: { c: '#059669', l: 'Plan ahead' } };
  let filter = 'all';
  const dismissed = new Set(), snoozed = new Set();

  function renderKPIs() {
    const crit = ACTIONS.filter(a => a.urg === 'crit').length;
    const cards = [
      { lbl: 'Closing This Week', val: '$32M', unit: '', foot: '2 proposals due ≤ 6 days', tone: 'blue' },
      { lbl: 'Compliance Deadline', val: '15', unit: 'd', foot: 'CMMC clause effective', tone: 'amber' },
      { lbl: 'Protest Exposure', val: '$5.4', unit: 'M', foot: 'tracked award contestable', tone: 'red' },
      { lbl: 'Pipeline Value', val: '$212', unit: 'M', foot: '18 active pursuits', tone: 'green' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<div class="kpi" data-tone="${c.tone}"><p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></div>`).join('');
    $('hsAct').textContent = ACTIONS.filter(a => a.urg !== 'ok').length;
    $('hsCrit').textContent = crit;
  }

  function renderInsight() {
    $('insightBar').innerHTML = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span><span><span class="ib-label">Start here</span>Two things can't wait: the <b>SPY-6 proposal (6 days)</b> and the <b>$5.4M protest exposure</b> on a tracked award. Everything else has runway — work them top-down.</span>`;
  }

  function rankOrder(a) { return a.urg === 'crit' ? 0 : a.urg === 'warn' ? 1 : 2; }

  function renderTabs() {
    const tabs = [['all', 'All'], ['crit', 'Critical'], ['warn', 'This week']];
    $('prioTabs').innerHTML = tabs.map(t => `<button class="people-tab ${t[0] === filter ? 'active' : ''}" data-f="${t[0]}">${t[1]}</button>`).join('');
    $('prioTabs').querySelectorAll('button').forEach(b => b.onclick = () => { filter = b.dataset.f; renderTabs(); renderFeed(); });
  }

  function renderFeed() {
    let data = ACTIONS.filter(a => !dismissed.has(a.desk));
    data.sort((a, b) => (snoozed.has(a.desk) - snoozed.has(b.desk)) || rankOrder(a) - rankOrder(b) || (a.days ?? 999) - (b.days ?? 999));
    if (filter !== 'all') data = data.filter(a => filter === 'crit' ? a.urg === 'crit' : a.urg !== 'ok');
    $('actFeed').innerHTML = data.map((a, i) => {
      const d = DESK[a.desk], u = URG[a.urg];
      const when = a.days === 0 ? 'now' : a.days != null ? `${a.days}d` : 'open';
      const snz = snoozed.has(a.desk);
      return `<a class="act-card${snz ? ' snoozed' : ''}" href="${d.href}" style="--dc:${d.color}">
        <div class="act-rank">${snz ? '·' : i + 1}</div>
        <div class="act-ico" style="background:${hexA(d.color,.13)};color:${d.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d.icon}"/></svg></div>
        <div class="act-body">
          <div class="act-meta"><span class="act-desk" style="color:${d.color}">${d.label}</span><span class="act-dot">·</span><span class="act-urg" style="color:${u.c}">${snz ? 'Snoozed' : u.l}</span></div>
          <div class="act-title">${a.title}</div>
          <div class="act-why">${a.why}</div>
        </div>
        <div class="act-right">
          <div class="act-val">${a.val}</div>
          <div class="act-when" style="color:${u.c}">${when}</div>
          <span class="act-cta">${a.cta}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </div>
        <div class="act-ctrls">
          <button class="act-ctrl" data-snooze="${a.desk}" title="${snz ? 'Un-snooze' : 'Snooze'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/></svg></button>
          <button class="act-ctrl" data-dismiss="${a.desk}" title="Dismiss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
      </a>`;
    }).join('') || `<div class="feed-clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><div class="fc-t">Inbox zero</div><div class="fc-d">You've cleared every priority in this filter.${dismissed.size ? ` <button class="fc-undo" id="fcUndo">Restore ${dismissed.size} dismissed</button>` : ''}</div></div>`;
    $('actFeed').querySelectorAll('[data-snooze]').forEach(b => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const k = b.dataset.snooze; snoozed.has(k) ? snoozed.delete(k) : snoozed.add(k); renderFeed(); renderHdr(); });
    $('actFeed').querySelectorAll('[data-dismiss]').forEach(b => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); dismissed.add(b.dataset.dismiss); renderFeed(); renderHdr(); });
    const undo = $('fcUndo'); if (undo) undo.onclick = (e) => { e.preventDefault(); dismissed.clear(); renderFeed(); renderHdr(); };
  }
  function renderHdr() {
    const live = ACTIONS.filter(a => !dismissed.has(a.desk) && !snoozed.has(a.desk));
    $('hsAct').textContent = live.filter(a => a.urg !== 'ok').length;
    $('hsCrit').textContent = live.filter(a => a.urg === 'crit').length;
  }

  function fmtIn(day) { return day === 0 ? 'today' : day <= 31 ? 'in ' + day + 'd' : day <= 90 ? 'in ' + Math.round(day / 7) + 'w' : 'in ' + Math.round(day / 30) + 'mo'; }
  function wkRow(w) {
    const u = URG[w.tone], d = DESK[w.desk] || { color: '#64748b', href: 'Defense Spending (best-in-class).html' };
    const node = w.gov ? `<span class="wk-node gov" style="border-color:${u.c}"></span>` : `<span class="wk-node" style="background:${u.c}"></span>`;
    const tag = w.gov ? `<span class="wk-tag gov">◆ ${w.tag}</span>` : `<span class="wk-tag" style="color:${d.color};background:${hexA(d.color,.1)}">${w.tag}</span>`;
    return `<a class="wk-row${w.big ? ' big' : ''}" href="${d.href}">
      <div class="wk-date"><span class="wk-d">${w.d}</span><span class="wk-in" style="color:${u.c}">${fmtIn(w.day)}</span></div>
      <div class="wk-line">${node}<span class="wk-fill" style="background:${u.c};opacity:.2"></span></div>
      <div class="wk-body"><div class="wk-label">${w.label}</div>${tag}</div>
    </a>`;
  }
  function renderWeek() {
    const groups = [
      { label: 'This Week', test: w => w.day <= 7 },
      { label: 'This Month', test: w => w.day > 7 && w.day <= 31 },
      { label: 'Later This Year', test: w => w.day > 31 }
    ];
    let html = '';
    groups.forEach(g => {
      const items = WEEK.filter(g.test);
      if (!items.length) return;
      html += `<div class="wk-group"><span>${g.label}</span><b>${items.length}</b></div>` + items.map(wkRow).join('');
    });
    $('weekList').innerHTML = html;
  }

  function renderSignals() {
    const sigs = [
      { desk: 'spend', t: 'Virginia +12%, Washington leads growth', d: '3 high-spend states show zero activity from you.' },
      { desk: 'co', t: '3 warm COs, 2 need re-warming', d: 'Diane Hartwell (NAVSEA) is your top relationship — keep it warm.' },
      { desk: 'cmmc', t: '78% ready · 16 controls open', d: 'CM and CA domains are dragging your score.' },
      { desk: 'far', t: '5 high-impact clause changes this month', d: 'CMMC and Section 889 reps need updating.' },
      { desk: 'gao', t: 'AFMC sustains 24% in your NAICS', d: 'Highest award instability of your agencies.' },
      { desk: 'team', t: '4 set-aside lanes reachable via teaming', d: 'SDVOSB, 8(a), HUBZone, WOSB — none solo.' }
    ];
    $('sigGrid').innerHTML = sigs.map(s => {
      const d = DESK[s.desk];
      return `<a class="sig-card" href="${d.href}">
        <div class="sig-top"><span class="sig-ico" style="background:${hexA(d.color,.13)};color:${d.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d.icon}"/></svg></span><span class="sig-desk">${d.label}</span></div>
        <div class="sig-t">${s.t}</div><div class="sig-d">${s.d}</div>
      </a>`;
    }).join('');
  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  function renderAll() { renderKPIs(); renderInsight(); renderTabs(); renderFeed(); renderWeek(); renderSignals(); }
  function init() { renderAll(); }
  window.CC_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
