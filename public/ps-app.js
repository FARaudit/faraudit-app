/* FARaudit · Profile & Settings (best-in-class) — config surface.
   Data matches the confirmed original (company, NAICS, agencies, pricing). */
(function () {
  const $ = (id) => document.getElementById(id);

  const NAV = [
    { key: 'company', label: 'Company Profile', icon: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6' },
    { key: 'naics', label: 'NAICS Configuration', icon: 'M4 19V5M4 19h16M8 16v-5M13 16V8M18 16v-3' },
    { key: 'agencies', label: 'Target Agencies', icon: 'M3 21h18M5 21V8l7-5 7 5v13' },
    { key: 'notifs', label: 'Notifications', icon: 'M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8zM10 21a2 2 0 004 0' },
    { key: 'team', label: 'Team Members', icon: 'M7 9a3 3 0 100-6 3 3 0 000 6zM17 9a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 5-5M22 20c0-3-2.5-5-5-5' },
    { key: 'billing', label: 'Billing & Plan', icon: 'M2 7h20v12H2zM2 11h20' }
  ];
  let active = 'company';

  // Promote mock data to window.PS so profile-settings-live.js can mutate in place.
  // Mutate keys/array contents — never reassign the namespace or its arrays.
  window.PS = window.PS || {
    COMPANY: {
      name: 'Apex Precision Machining LLC', cage: '7R4X2', uei: 'APX7R4X2000000',
      address: '2847 Industrial Blvd, San Antonio TX 78219', contact: 'Jose Rodriguez, CEO',
      email: 'jose@apexprecision.com', phone: '(210) 555-0147'
    },
    CERTS: [
      { k: 'Small Business · NAICS 336413 (≤1,250 employees)', on: true }, { k: 'WOSB', on: false },
      { k: 'SDVOSB', on: false }, { k: '8(a)', on: false }, { k: 'HUBZone', on: false }
    ],
    NAICS: [
      { code: '336413', desc: 'Aircraft Engine & Parts Mfg', tag: 'PRIMARY' },
      { code: '332710', desc: 'Machine Shops', tag: 'SECONDARY' },
      { code: '332721', desc: 'Precision Turned Product Mfg', tag: 'SECONDARY' },
      { code: '332722', desc: 'Bolt/Nut/Screw/Rivet Mfg', tag: 'SECONDARY' },
      { code: '336411', desc: 'Aircraft Mfg', tag: 'MONITOR ONLY' }
    ],
    AGENCIES: [
      { code: '502 CONS/CL', base: 'JBSA Lackland', type: 'Air Force', on: true },
      { code: '502 CONS/PKC', base: 'JBSA Randolph', type: 'Air Force', on: true },
      { code: '772 ESS/PK', base: 'Wright-Patterson', type: 'Engineering', on: true },
      { code: 'OC-ALC/76 CONS', base: 'Tinker AFB', type: 'Maintenance', on: true },
      { code: 'WR-ALC/402 SCMG', base: 'Robins AFB', type: 'Manufacturing', on: true },
      { code: 'DLA Aviation', base: 'Richmond VA', type: 'Logistics', on: true },
      { code: 'OO-ALC/309th', base: 'Hill AFB', type: 'Overhaul', on: false }
    ],
    NOTIFS: [
      { t: 'New Pre-Solicitation Synopsis in your NAICS', d: 'Sources Sought / RFI alerts as soon as they hit SAM.gov', on: true },
      { t: 'New Sources Sought / RFI in your NAICS', d: 'Combined market research stage notifications', on: true },
      { t: 'New solicitation posted in your NAICS', d: 'Full RFP / RFQ / IFB stage alerts', on: true },
      { t: 'HIGH impact FAR/DFARS change', d: 'Regulatory changes affecting your active contracts', on: true },
      { t: 'GAO protest filed on a solicitation you bid', d: 'Award protest activity on contracts you participated in', on: true },
      { t: 'Contracting officer responsiveness changes', d: 'Score shifts for COs in your network', on: false }
    ],
    TEAM: [{ name: 'Jose Rodriguez', email: 'jose@apexprecision.com', role: 'OWNER', you: true }],
    USAGE: [
      { l: 'Audits this month', v: '19 of 25' },
      { l: 'Solicitations tracked', v: '12' },
      { l: 'Synopsis alerts sent', s: 'Pre-sol + Sources Sought · 9 NAICS', v: '34' },
      { l: 'Team members', s: 'Single-seat license', v: '1 of 1' }
    ]
  };
  const COMPANY = window.PS.COMPANY;
  const CERTS = window.PS.CERTS;
  const NAICS = window.PS.NAICS;
  const AGENCIES = window.PS.AGENCIES;
  const NOTIFS = window.PS.NOTIFS;
  const TEAM = window.PS.TEAM;
  const USAGE = window.PS.USAGE;

  function tog(on) { return `<span class="tgl ${on ? 'on' : ''}"><i></i></span>`; }
  function field(label, val, ph) { return `<div class="fld"><label>${label}</label><input type="text" value="${val || ''}" placeholder="${ph || ''}"></div>`; }

  const PANELS = {
    company: () => `
      <div class="sp-hd"><div class="sp-t">Company Profile</div><div class="sp-s">Legal entity information &amp; certifications</div></div>
      <div class="sp-bd">
        <div class="fld-grid">
          ${field('Company name', COMPANY.name)}
          ${field('CAGE code', COMPANY.cage)}
          ${field('SAM.gov UEI', COMPANY.uei)}
          ${field('Business address', COMPANY.address)}
          ${field('Primary contact', COMPANY.contact)}
          ${field('Email', COMPANY.email)}
          ${field('Phone', COMPANY.phone)}
        </div>
        <div class="fld-sec">Certifications</div>
        <div class="cert-row">${CERTS.map(c => `<button class="cert-tg ${c.on ? 'on' : ''}" data-cert="${c.k}">${c.on ? '✓ ' : ''}${c.k}</button>`).join('')}</div>
        <div class="note"><b>Synced from SAM.gov.</b> Certifications unlock set-aside eligibility across Opportunities and Teaming. Last sync May 28, 2026.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    naics: () => `
      <div class="sp-hd"><div class="sp-t">NAICS Configuration</div><div class="sp-s">These codes drive every intelligence filter across FARaudit</div></div>
      <div class="sp-bd">
        ${NAICS.map(n => `<div class="naics-row"><div class="nr-l"><span class="nr-code">${n.code}</span><span class="nr-label">${n.desc}</span></div><span class="nr-tag ${n.tag === 'PRIMARY' ? 'p' : n.tag === 'MONITOR ONLY' ? 'm' : 's'}">${n.tag}</span><button class="nr-x" title="Remove">✕</button></div>`).join('')}
        <button class="add-btn">+ Add NAICS code</button>
        <div class="note"><b>How this works:</b> Your NAICS codes filter opportunities, contracting officers, agencies, wage benchmarks, and teaming partners. Changes take effect immediately across all pages.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    agencies: () => `
      <div class="sp-hd"><div class="sp-t">Target Agencies</div><div class="sp-s">Toggle monitoring for each command &amp; installation</div></div>
      <div class="sp-bd">
        ${AGENCIES.map((a, i) => `<div class="ag-row"><div class="ag-l"><span class="ag-code">${a.code}</span><span class="ag-pill base">${a.base}</span><span class="ag-pill type">${a.type}</span></div><button class="ag-tg" data-ag="${i}">${tog(a.on)}</button></div>`).join('')}
        <button class="add-btn">+ Add agency / installation</button>
        <div class="note"><b>${AGENCIES.filter(a => a.on).length} of ${AGENCIES.length} agencies monitored.</b> Active agencies scope your Opportunities feed, Spending map, and CO network.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    notifs: () => `
      <div class="sp-hd"><div class="sp-t">Notification Preferences</div><div class="sp-s">Control what triggers alerts in your inbox</div></div>
      <div class="sp-bd" id="alerts">
        <div class="nf-row" data-pref-row>
          <div class="nf-l">
            <div class="nf-t">Weekly digest of watched opportunities</div>
            <div class="nf-d">Mondays at 6am · summary of what's still pre-solicitation, what posted, and what auto-audited last week.</div>
          </div>
          <span class="nf-ch">Email</span>
          <button class="nf-tg" data-pref-tg="weekly_digest_watched"><span class="tgl"><i></i></span></button>
        </div>
        ${NOTIFS.map((n, i) => `<div class="nf-row"><div class="nf-l"><div class="nf-t">${n.t}</div><div class="nf-d">${n.d}</div></div><span class="nf-ch">Email + In-app</span><button class="nf-tg" data-nf="${i}">${tog(n.on)}</button></div>`).join('')}
        <div class="note">Delivered to <b>${COMPANY.email}</b>. Critical alerts also push to the bell in your top bar.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    team: () => `
      <div class="sp-hd"><div class="sp-t">Team Members</div><div class="sp-s">Manage who has access to your FARaudit workspace</div></div>
      <div class="sp-bd">
        ${TEAM.map(m => `<div class="tm-row"><div class="tm-av">${m.name.split(' ').map(w => w[0]).join('')}</div><div class="tm-info"><div class="tm-name">${m.name}${m.you ? ' <span class="tm-you">You</span>' : ''}</div><div class="tm-email">${m.email}</div></div><span class="tm-role">${m.role}</span></div>`).join('')}
        <button class="add-btn">+ Add team member</button>
        <div class="note"><b>Plan limit:</b> Design Partner plan includes 1 seat. Upgrade to Standard for 3 seats.</div>
      </div>`,

    billing: () => `
      <div class="sp-hd"><div class="sp-t">Billing &amp; Plan</div><div class="sp-s">Manage your subscription and usage</div></div>
      <div class="sp-bd">
        <div class="plan-card"><div class="pc-l"><div class="pc-kicker">Current plan</div><div class="pc-name">Design Partner</div><div class="pc-desc">$1,250 / month · or $15,000 / year</div><div class="pc-next">Next billing: June 1, 2026 · Auto-renew on</div></div><div class="pc-r"><div class="pc-badge">Active</div></div></div>
        <div class="fld-sec">Usage this period</div>
        <div class="usage-list">${USAGE.map(u => `<div class="us-row"><div class="us-l">${u.l}${u.s ? `<small>${u.s}</small>` : ''}</div><span class="us-v">${u.v}</span></div>`).join('')}</div>
        <div class="upgrade"><div class="up-l"><div class="up-kicker">Upgrade to Standard</div><div class="up-price">$2,500 / month · or $30,000 / year</div><div class="up-desc">100 audits/month · 3 team seats · priority corpus updates</div></div><button class="save-btn dark">Upgrade to Standard</button></div>
        <div class="bill-actions"><button class="ghost-btn">View invoices</button><button class="ghost-btn">Pay annually — $15,000/yr</button></div>
        <div class="danger"><div class="dz-t">Danger zone</div><div class="dz-d">Canceling stops your subscription at the end of the current billing period. Your data is retained for 90 days.</div><button class="danger-btn">Cancel subscription</button></div>
      </div>`
  };

  function renderNav() {
    $('setNav').innerHTML = NAV.map(n => `<button class="sn ${n.key === active ? 'active' : ''}" data-k="${n.key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${n.icon}"/></svg>${n.label}</button>`).join('');
    $('setNav').querySelectorAll('.sn').forEach(b => b.onclick = () => { active = b.dataset.k; renderNav(); renderPanel(); });
  }
  function renderPanel() {
    $('setContent').innerHTML = `<div class="set-panel">${PANELS[active]()}</div>`;
    $('setContent').querySelectorAll('.tgl').forEach(t => t.parentElement.onclick = (e) => { e.preventDefault(); t.classList.toggle('on'); flash(); });
    $('setContent').querySelectorAll('.cert-tg').forEach(b => b.onclick = () => { b.classList.toggle('on'); b.textContent = (b.classList.contains('on') ? '✓ ' : '') + b.dataset.cert; flash(); });
    const sb = $('setContent').querySelector('.save-btn'); if (sb) sb.onclick = () => flash();
    wireServerPrefs();
  }
  // Server-backed preference toggles. data-pref-tg="<key>" looks up the
  // current state from /api/preferences (cached after first hit), sets the
  // initial .tgl.on, and PATCHes on click. Defaults to ON when the row hasn't
  // been persisted yet, mirroring the server default.
  var _prefsLoaded = null;
  function loadPrefs() {
    if (_prefsLoaded) return _prefsLoaded;
    _prefsLoaded = fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { preferences: null })
      .then(d => d.preferences || {})
      .catch(() => ({}));
    return _prefsLoaded;
  }
  function savePref(key, value) {
    return fetch('/api/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    }).then(r => r.ok);
  }
  function wireServerPrefs() {
    var btns = $('setContent').querySelectorAll('[data-pref-tg]');
    if (!btns.length) return;
    loadPrefs().then(prefs => {
      btns.forEach(b => {
        var key = b.getAttribute('data-pref-tg');
        var current = prefs[key];
        // Server default for weekly_digest_watched is true — interpret null/undefined as on.
        var on = current === undefined || current === null ? true : !!current;
        var tgl = b.querySelector('.tgl');
        if (on) tgl.classList.add('on'); else tgl.classList.remove('on');
        b.onclick = function(e){
          e.preventDefault();
          var next = !tgl.classList.contains('on');
          tgl.classList.toggle('on', next);
          b.disabled = true;
          savePref(key, next).then(ok => { b.disabled = false; if (ok) { prefs[key] = next; flash(); } else { tgl.classList.toggle('on', !next); } });
        };
      });
    });
  }
  function flash() { const el = $('savedAt'); if (el) { el.textContent = 'saved just now'; setTimeout(() => el.textContent = 'changes save automatically', 2200); } }

  function init() { renderNav(); renderPanel(); }
  window.PS_APP = { render: init, onThemeChange: () => renderPanel() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
