/* FARaudit · Today / Command Center (best-in-class) — unifies all desks */
(function () {
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // Promote DESK / ACTIONS / WEEK to window.CC so command-center-live.js
  // can mutate the arrays/objects in place. Keep the IIFE-local refs so
  // render logic doesn't change.
  window.CC = window.CC || {
    DESK: {
      opp:   { label: 'Notices', color: '#378ADD', href: '/notices', icon: 'M12 2a9 9 0 100 18 9 9 0 000-18zM9 12l2 2 4-4' },
      co:    { label: 'Contracting Officers', color: '#185FA5', href: '/contracting-officers', icon: 'M9 9a3 3 0 100-6 3 3 0 000 6zM3 20c1-3 3-5 6-5s5 2 6 5' },
      cmmc:  { label: 'CMMC Readiness', color: '#0891b2', href: '/cmmc', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
      gao:   { label: 'GAO Protests', color: '#dc2626', href: '/gao-protests', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18' },
      far:   { label: 'FAR/DFARS', color: '#7c3aed', href: '/far-dfars-updates', icon: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5' },
      wage:  { label: 'Wage Benchmarks', color: '#d97706', href: '/wage-benchmarks', icon: 'M3 20h18M6 16v-5M11 16V8M16 16v-3' },
      team:  { label: 'Teaming Partners', color: '#059669', href: '/teaming-partners', icon: 'M7 9a3 3 0 100-6 3 3 0 000 6zM17 9a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 5-5M22 20c0-3-2.5-5-5-5' },
      spend: { label: 'Defense Spending', color: '#2C6CB4', href: '/defense-spending', icon: 'M4 19V5M4 19h16M8 16v-4M13 16V9M18 16v-2' }
    },
    // ACTIONS + WEEK ship EMPTY and are filled only from what the API
    // genuinely returns. Until a per-desk digest exists to populate them,
    // these panels say so rather than showing anything unearned.
    // Guarded by test/public/_today-fabrication.test.ts.
    ACTIONS: [],
    WEEK: [],
    // Scalars the /api/command-center-data response already carries. null =
    // not computed; every render site prints an em dash for null and never a
    // zero standing in for "unknown".
    LIVE: null
  };
  const DESK = window.CC.DESK;
  const ACTIONS = window.CC.ACTIONS;
  const WEEK = window.CC.WEEK;

  const URG = { crit: { c: '#dc2626', l: 'Critical' }, warn: { c: '#d97706', l: 'This week' }, ok: { c: '#059669', l: 'Plan ahead' } };
  let filter = 'all';
  const dismissed = new Set(), snoozed = new Set();

  // Em dash for anything not computed. NEVER 0 — a zero asserts "none", which
  // is a different claim from "we have not computed this".
  const DASH = '—';
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function fmtMoney(v) {
    const n = num(v);
    if (n === null || n <= 0) return null;
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }

  // The foot under Pipeline Value is a CLAIM about the customer's pursuits, so
  // it may only describe a pipeline this page actually read. An unreadable
  // pipeline says so; a null total never prints as 0.
  function pipelineFoot(L) {
    if (!L) return 'not loaded';
    if (L.pipelineAvailable === false) return 'your pipeline could not be read';
    const total = num(L.pipelineTotal);
    if (total === null) return 'your pipeline could not be read';
    if (total === 0) return 'no pursuits in your pipeline yet';
    const money = fmtMoney(L.pipelineWeightedValue);
    return total + ' active pursuit' + (total === 1 ? '' : 's') + (money ? '' : ' · none carry a stated value');
  }

  // A tile whose number comes from the SAM feed may only describe a feed that
  // ANSWERED. When it did not, the value is DASH and the foot says why — the same
  // voice the rail pill and the Week Ahead panel use.
  function feedFoot(L, whenAnswered) {
    if (!L) return 'feed not loaded';
    return L.feedAvailable === false ? 'the SAM.gov feed did not answer' : whenAnswered;
  }
  function feedVal(L, v) {
    if (!L || L.feedAvailable === false) return DASH;
    return String(num(v) ?? DASH);
  }

  // The tile counts SOLICITATIONS. Runs are usually higher because one solicitation
  // is audited more than once, so the foot names the unit and surfaces the re-runs
  // rather than letting the larger number sit behind a smaller one.
  function auditsFoot(L) {
    if (!L) return 'not loaded';
    const sol = num(L.auditsThisMonth), runs = num(L.auditRunsThisMonth);
    if (sol === null) return 'your audits could not be read';
    if (sol === 0) return 'no solicitations audited in the last 30 days';
    const base = 'solicitation' + (sol === 1 ? '' : 's') + ' you audited';
    return (runs !== null && runs > sol) ? base + ' · ' + runs + ' runs' : base;
  }

  function renderKPIs() {
    const L = window.CC.LIVE;
    const arrow = '<span class="kpi-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 17L17 7M9 7h8v8"/></svg></span>';
    // Every tile below is a value /api/command-center-data actually returns
    // (the previous four were source literals). Unknown → DASH + a foot that
    // says why, in the same voice /opportunities uses for absent values.
    const money = L ? fmtMoney(L.pipelineWeightedValue) : null;
    const cards = [
      { href: '/notices', lbl: 'Live Notices',     val: feedVal(L, L && L.liveCount),    unit: '',  foot: feedFoot(L, 'matching your NAICS on SAM.gov'), tone: 'blue' },
      { href: '/notices', lbl: 'Closing ≤ 7 Days', val: feedVal(L, L && L.deadlineSoon), unit: '',  foot: feedFoot(L, 'live notices with a stated deadline'), tone: 'amber' },
      { href: '/past-audits',   lbl: 'Audits This Month', val: L ? String(num(L.auditsThisMonth) ?? DASH) : DASH, unit: '', foot: auditsFoot(L), tone: 'red' },
      { href: '/pipeline',      lbl: 'Pipeline Value',   val: money ?? DASH, unit: '', foot: pipelineFoot(L), tone: 'green' }
    ];
    $('kpiStrip').innerHTML = cards.map(c => `<a class="kpi" data-tone="${c.tone}" href="${c.href}">${arrow}<p class="lbl">${c.lbl}</p><div class="kpi-val">${c.val}<span class="unit">${c.unit}</span></div><div class="foot">${c.foot}</div></a>`).join('');
    renderHdr();
  }

  function renderInsight() {
    const L = window.CC.LIVE;
    const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M7 17L17 7M9 7h8v8"/></svg>';
    const ico = `<span class="ib-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg></span>`;
    // The old copy named a specific pursuit and a dollar exposure, neither of
    // which any query produced. This states only what the feed actually says.
    let body;
    if (!L && window.CC.FEED_ERROR) {
      body = `<span class="ib-label">Status</span><b>Your desk data is unavailable.</b> Nothing on this page is sample data — the panels stay empty until the feed answers.`;
    } else if (!L) {
      body = `<span class="ib-label">Status</span>Loading your desks — nothing on this page is sample data.`;
    } else if (L.feedAvailable === false) {
      // The feed did not answer. Nothing matched or failed to match, so this may
      // not describe the window or suggest widening it.
      body = `<span class="ib-label">Status</span><b>The SAM.gov feed did not answer.</b> Notice counts are unavailable rather than zero — nothing on this page is sample data.`;
    } else {
      const live = num(L.liveCount) ?? 0;
      const soon = num(L.deadlineSoon) ?? 0;
      if (live === 0) {
        body = `<span class="ib-label">Status</span>No live SAM.gov notices match your NAICS in the current window. <a class="ib-link" href="/notices">Open the feed${arrow}</a> to widen it.`;
      } else {
        body = `<span class="ib-label">Start here</span><a class="ib-link" href="/notices">${live} live notice${live === 1 ? '' : 's'}${arrow}</a> match your NAICS`
          + (soon > 0 ? `, and <b>${soon}</b> close within 7 days — work those first.` : `. None carry a deadline inside 7 days.`);
      }
    }
    $('insightBar').innerHTML = ico + '<span>' + body + '</span>';
  }

  function rankOrder(a) { return a.urg === 'crit' ? 0 : a.urg === 'warn' ? 1 : 2; }

  function renderTabs() {
    const tabs = [['all', 'All'], ['crit', 'Critical'], ['warn', 'This week']];
    $('prioTabs').innerHTML = tabs.map(t => `<button class="people-tab ${t[0] === filter ? 'active' : ''}" data-f="${t[0]}">${t[1]}</button>`).join('');
    $('prioTabs').querySelectorAll('button').forEach(b => b.onclick = () => setFilter(b.dataset.f));
  }

  // Header stat buttons (.hs[data-f]) two-way synced with priority tabs.
  // hsAct → warn filter · hsCrit → crit filter · hsDays = readonly readout.
  function setFilter(f) {
    filter = f || 'all';
    renderTabs();
    renderFeed();
    document.querySelectorAll('.hdr-stat .hs[data-f]').forEach(b => {
      b.classList.toggle('active', b.dataset.f === filter);
    });
  }
  function bindHdrStatFilters() {
    document.querySelectorAll('.hdr-stat .hs[data-f]').forEach(b => {
      b.addEventListener('click', () => {
        const f = b.dataset.f;
        const already = b.classList.contains('active');
        setFilter(already ? 'all' : f);
      });
    });
  }

  // Two DIFFERENT empty states, because they are two different claims:
  //   · ACTIONS is empty because no ranking is computed → say exactly that.
  //     "Inbox zero" here would be a false all-clear on unexamined work.
  //   · ACTIONS had rows and the user cleared/filtered them → inbox zero is true.
  function emptyFeed() {
    const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    if (ACTIONS.length === 0) {
      return `<div class="feed-clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
        <div class="fc-t">Cross-desk ranking not built yet</div>
        <div class="fc-d">This panel will rank the single most urgent item from each desk once the digest query ships. It is empty rather than illustrative — nothing here is sample data. Live data you can use today: <a class="fc-undo" href="/notices">Notices</a> · <a class="fc-undo" href="/past-audits">Past Audits</a> · <a class="fc-undo" href="/pipeline">Pipeline</a></div></div>`;
    }
    return `<div class="feed-clear">${tick}<div class="fc-t">Inbox zero</div><div class="fc-d">You've cleared every priority in this filter.${dismissed.size ? ` <button class="fc-undo" id="fcUndo">Restore ${dismissed.size} dismissed</button>` : ''}</div></div>`;
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
    }).join('') || emptyFeed();
    $('actFeed').querySelectorAll('[data-snooze]').forEach(b => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const k = b.dataset.snooze; snoozed.has(k) ? snoozed.delete(k) : snoozed.add(k); renderFeed(); renderHdr(); });
    $('actFeed').querySelectorAll('[data-dismiss]').forEach(b => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); dismissed.add(b.dataset.dismiss); renderFeed(); renderHdr(); });
    const undo = $('fcUndo'); if (undo) undo.onclick = (e) => { e.preventDefault(); dismissed.clear(); renderFeed(); renderHdr(); };
  }
  // Header stats. With no digest, "Need Action"/"Critical" are UNKNOWN, not 0 —
  // a 0 would tell the user nothing needs attention, which nothing has checked.
  // "Next Deadline" is genuinely computable from the live SAM feed.
  function renderHdr() {
    const L = window.CC.LIVE;
    const live = ACTIONS.filter(a => !dismissed.has(a.desk) && !snoozed.has(a.desk));
    const act = $('hsAct'), crit = $('hsCrit'), days = $('hsDays');
    if (act)  act.textContent  = ACTIONS.length ? String(live.filter(a => a.urg !== 'ok').length) : DASH;
    if (crit) crit.textContent = ACTIONS.length ? String(live.filter(a => a.urg === 'crit').length) : DASH;
    if (days) {
      const d = L ? num(L.nextDeadlineDays) : null;
      days.textContent = d === null ? DASH : (d === 0 ? 'today' : d + 'd');
    }
  }

  function fmtIn(day) { return day === 0 ? 'today' : day <= 31 ? 'in ' + day + 'd' : day <= 90 ? 'in ' + Math.round(day / 7) + 'w' : 'in ' + Math.round(day / 30) + 'mo'; }
  function wkRow(w) {
    const u = URG[w.tone], d = DESK[w.desk] || { color: '#64748b', href: '/command-center' };
    const node = w.gov ? `<span class="wk-node gov" style="border-color:${u.c}"></span>` : `<span class="wk-node" style="background:${u.c}"></span>`;
    const tag = w.gov ? `<span class="wk-tag gov">◆ ${w.tag}</span>` : `<span class="wk-tag" style="color:${d.color};background:${hexA(d.color,.1)}">${w.tag}</span>`;
    return `<a class="wk-row${w.big ? ' big' : ''}" href="${d.href}">
      <div class="wk-date"><span class="wk-d">${w.d}</span><span class="wk-in" style="color:${u.c}">${fmtIn(w.day)}</span></div>
      <div class="wk-line">${node}<span class="wk-fill" style="background:${u.c};opacity:.2"></span></div>
      <div class="wk-body"><div class="wk-label">${w.label}</div>${tag}</div>
    </a>`;
  }
  // Per-group display caps. A single flat cap across all three groups renders the
  // nearest deadlines and nothing else, because near-term notices outnumber the
  // rest — "This Month" and "Later This Year" can never appear however high it is
  // set. Capping each group separately is what gives the calendar its reach.
  // .week-list scrolls internally (max-height + overflow-y in today.html), so
  // these caps trade against scannability rather than page height, and every
  // group still reports its true total and its own remainder.
  const WEEK_GROUP_CAPS = { 'This Week': 20, 'This Month': 15, 'Later This Year': 10 };

  function renderWeek() {
    const groups = [
      { label: 'This Week', test: w => w.day <= 7 },
      { label: 'This Month', test: w => w.day > 7 && w.day <= 31 },
      { label: 'Later This Year', test: w => w.day > 31 }
    ];
    let html = '';
    let hiddenTotal = 0;
    groups.forEach(g => {
      const items = WEEK.filter(g.test);
      if (!items.length) return;
      // Government events NEVER compete with notice deadlines for cap slots. There are
      // a handful a quarter and each one binds every customer, so being sorted in among
      // a hundred response deadlines and truncated away is the one outcome that makes
      // them worthless. The cap governs notice rows only; gov rows always render.
      const govItems = items.filter((w) => w.gov);
      const oppItems = items.filter((w) => !w.gov);
      const cap = WEEK_GROUP_CAPS[g.label] || oppItems.length;
      const shownOpps = oppItems.slice(0, cap);
      const shown = govItems.concat(shownOpps).sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
      const hidden = oppItems.length - shownOpps.length;
      hiddenTotal += hidden;
      // The group header count is the TRUE total, not the shown count — a
      // header reading "20" over 20 rows would hide that 51 more exist.
      html += `<div class="wk-group"><span>${g.label}</span><b>${items.length}</b></div>` + shown.map(wkRow).join('');
      // Truncation is surfaced INSIDE the group it belongs to, never silent.
      if (hidden > 0) {
        html += `<a class="wk-row" href="/notices"><div class="wk-date"><span class="wk-d">+${hidden}</span></div>
          <div class="wk-line"><span class="wk-node" style="background:var(--t40,#64748b)"></span></div>
          <div class="wk-body"><div class="wk-label">${hidden} more in ${g.label.toLowerCase()} — open Notices</div></div></a>`;
      }
    });
    // Backstop drop from the wiring layer (DOM ceiling), counted separately so
    // the two truncation reasons are never conflated.
    const dropped = num(window.CC.WEEK_DROPPED) || 0;
    if (html && dropped > 0) {
      html += `<a class="wk-row" href="/notices"><div class="wk-date"><span class="wk-d">+${dropped}</span></div>
        <div class="wk-line"><span class="wk-node" style="background:var(--t40,#64748b)"></span></div>
        <div class="wk-body"><div class="wk-label">${dropped} more deadline${dropped === 1 ? '' : 's'} not shown — open Notices</div></div></a>`;
    }
    // Three states: outage · feed answered with nothing dated · rows.
    let empty;
    if (window.CC.FEED_ERROR || window.CC.WEEK_SOURCED === false) {
      empty = `<div class="fc-t">Deadlines unavailable</div><div class="fc-d">The feed did not answer, so this calendar is empty rather than illustrative — nothing here is sample data.</div>`;
    } else {
      empty = `<div class="fc-t">No dated deadlines</div><div class="fc-d">No live notice in your NAICS carries a future response deadline right now. Only response deadlines are wired — wage-determination, regulatory and fiscal dates are not sourced yet.</div>`;
    }
    $('weekList').innerHTML = html || `<div class="feed-clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>${empty}</div>`;
  }

  // The desk registry (label / colour / route / icon) is real UI config, so
  // these render as plain NAVIGATION: every desk reachable, zero assertions
  // about what is in it. A desk card makes a claim only once its query exists.
  function renderSignals() {
    const order = ['spend', 'co', 'cmmc', 'far', 'gao', 'team'];
    $('sigGrid').innerHTML = order.map(key => {
      const d = DESK[key];
      if (!d) return '';
      return `<a class="sig-card" href="${d.href}">
        <div class="sig-top"><span class="sig-ico" style="background:${hexA(d.color,.13)};color:${d.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${d.icon}"/></svg></span><span class="sig-desk">${d.label}</span><span class="sig-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>
        <div class="sig-t">Open ${d.label}</div><div class="sig-d">No cross-desk summary is computed yet — open the desk for its own live data.</div>
      </a>`;
    }).join('');
  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

  // Derived from the clock — never a literal date string.
  function renderDateline() {
    const el = $('dateline');
    if (!el) return;
    el.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }).replace(',', ' ·');
  }

  // Identity came from hardcoded "Jose" / "JR" / "Jose Rodriguez" / a company
  // name and NAICS list. All four now come from the API, and stay blank until
  // it answers rather than showing someone else's name.
  function renderIdentity() {
    const u = window.CC.LIVE && window.CC.LIVE.user;
    const greet = $('greeting'), nm = $('userNm'), av = $('userAv'), naics = $('headerSubNaics');
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    if (greet) greet.textContent = u && u.firstName ? `${part}, ${u.firstName}` : part;
    if (nm) nm.textContent = u && u.fullName ? u.fullName : '';
    if (av) av.textContent = u && u.initials ? u.initials : '';
    if (naics) {
      const codes = window.CC.LIVE && Array.isArray(window.CC.LIVE.feedNaics) ? window.CC.LIVE.feedNaics : null;
      naics.textContent = codes && codes.length ? ` — NAICS ${codes.join(' · ')}` : '';
    }
  }

  // Sidebar counts go into the rail's own count slot — <span class="sb-ct"> on a
  // row, built by renderCount() in src/lib/nav/rail.ts — under that function's
  // rule: render a live value only, never a zero, never a stale one.
  function railCount(href, v) {
    const link = document.querySelector('.sb-step[href="' + href + '"], .sb-icon[href="' + href + '"]');
    if (!link) return;
    let el = link.querySelector('.sb-ct');
    const n = num(v);
    // A zero is not news and an unknown is not a number: remove the slot rather
    // than leave a stale count standing (rail.ts renderCount, same rule).
    if (n === null || n <= 0) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('span');
      el.className = 'sb-ct';
      const tip = link.querySelector('.sb-tip');
      if (tip) link.insertBefore(el, tip); else link.appendChild(el);
    }
    el.textContent = String(n);
  }
  function renderSidebarBadges() {
    const L = window.CC.LIVE;
    railCount('/past-audits', L ? L.auditTotal : null);
    railCount('/pipeline',    L ? L.pipelineAtRisk : null);
    railCount('/agencies',    L ? L.agencyCount : null);
  }

  function renderAll() { renderDateline(); renderIdentity(); renderSidebarBadges(); renderKPIs(); renderInsight(); renderTabs(); renderFeed(); renderWeek(); renderSignals(); }

  // The notifications tray lives in public/notifications-chrome.js, which every
  // surface with a bell loads as shared chrome.

  function init() { renderAll(); bindHdrStatFilters(); }
  window.CC_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
