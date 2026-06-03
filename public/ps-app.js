/* FARaudit · Profile & Settings (best-in-class) — config surface */
(function () {
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const NAV = [
    { key: 'company', label: 'Company Profile', icon: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6' },
    { key: 'naics', label: 'NAICS Configuration', icon: 'M4 19V5M4 19h16M8 16v-5M13 16V8M18 16v-3' },
    { key: 'agencies', label: 'Target Agencies', icon: 'M3 21h18M5 21V8l7-5 7 5v13' },
    { key: 'notifs', label: 'Notifications', icon: 'M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8zM10 21a2 2 0 004 0' },
    { key: 'team', label: 'Team Members', icon: 'M7 9a3 3 0 100-6 3 3 0 000 6zM17 9a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 5-5M22 20c0-3-2.5-5-5-5' },
    { key: 'billing', label: 'Billing & Plan', icon: 'M2 7h20v12H2zM2 11h20' }
  ];
  let active = 'company';

  const NAICS = [
    { code: '336413', label: 'Other Aircraft Parts & Auxiliary Equipment', primary: true },
    { code: '332710', label: 'Machine Shops', primary: false },
    { code: '332721', label: 'Precision Turned Products', primary: false }
  ];
  const AGENCIES = [
    { code: '502 CONS/CL', base: 'JBSA Lackland', type: 'Air Force', on: true },
    { code: 'AFLCMC/WL', base: 'Tinker AFB', type: 'Air Force', on: true },
    { code: 'AFSC/WR-ALC', base: 'Robins AFB', type: 'Air Force', on: true },
    { code: 'NAVAIR PMA-209', base: 'Patuxent River', type: 'Navy', on: true },
    { code: 'DLA Aviation', base: 'Richmond', type: 'DLA', on: true },
    { code: 'TACOM', base: 'Detroit Arsenal', type: 'Army', on: false }
  ];
  const NOTIFS = [
    { t: 'New Pre-Solicitation Synopsis in your NAICS', d: 'Sources Sought / RFI alerts as soon as they post', on: true },
    { t: 'High-fit opportunity (fit ≥ 85)', d: 'Only the pursuits worth dropping everything for', on: true },
    { t: 'CMMC / regulatory clause affecting tracked sols', d: 'When a rule change hits your active bids', on: true },
    { t: 'GAO protest on a tracked award', d: 'Incumbent-disruption alerts', on: true },
    { t: 'Wage determination renewal (30-day warning)', d: 'Before your SCA rates expire', on: false },
    { t: 'Weekly digest', d: 'Monday-morning roundup of everything', on: true }
  ];
  const TEAM = [{ name: 'Jose Rodriguez', email: 'jose@apexprecision.com', role: 'Owner', you: true }];
  const CERTS = [{ k: 'SB', on: true }, { k: 'SDVOSB', on: false }, { k: '8(a)', on: false }, { k: 'HUBZone', on: false }, { k: 'WOSB', on: false }];

  function tog(on) { return `<span class="tgl ${on ? 'on' : ''}"><i></i></span>`; }
  function field(label, val, ph) { return `<div class="fld"><label>${label}</label><input type="text" value="${val || ''}" placeholder="${ph || ''}"></div>`; }

  const PANELS = {
    company: () => `
      <div class="sp-hd"><div class="sp-t">Company Profile</div><div class="sp-s">Legal entity, codes &amp; small-business certifications</div></div>
      <div class="sp-bd">
        <div class="fld-grid">
          ${field('Legal business name', 'Apex Precision Machining LLC')}
          ${field('DBA / trade name', 'Apex Precision')}
          ${field('UEI (SAM.gov)', 'XK7M2P9QRT43')}
          ${field('CAGE code', '9Y2K1')}
          ${field('Primary location', 'San Antonio, TX')}
          ${field('Year established', '2014')}
        </div>
        <div class="fld-sec">Small-business certifications</div>
        <div class="cert-row">${CERTS.map(c => `<button class="cert-tg ${c.on ? 'on' : ''}" data-cert="${c.k}">${c.on ? '✓ ' : ''}${c.k}</button>`).join('')}</div>
        <div class="note"><b>Synced from SAM.gov.</b> Certifications unlock set-aside eligibility across Opportunities and Teaming. Last sync May 28, 2026.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    naics: () => `
      <div class="sp-hd"><div class="sp-t">NAICS Configuration</div><div class="sp-s">These codes drive every intelligence filter across FARaudit</div></div>
      <div class="sp-bd">
        ${NAICS.map(n => `<div class="naics-row"><div class="nr-l"><span class="nr-code">${n.code}</span><span class="nr-label">${n.label}</span></div>${n.primary ? '<span class="nr-primary">Primary</span>' : '<button class="nr-make">Make primary</button>'}<button class="nr-x" title="Remove">✕</button></div>`).join('')}
        <button class="add-btn">+ Add NAICS code</button>
        <div class="impact-box"><div class="ib-h">What these codes power</div><div class="ib-grid">${['Opportunities', 'Defense Spending', 'Contracting Officers', 'Wage Benchmarks', 'Teaming Partners', 'GAO Protests'].map(t => `<span class="ib-chip">${t}</span>`).join('')}</div><div class="ib-note">Change a code and all six desks re-scope immediately.</div></div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    agencies: () => `
      <div class="sp-hd"><div class="sp-t">Target Agencies</div><div class="sp-s">Toggle monitoring for each command &amp; installation</div></div>
      <div class="sp-bd">
        ${AGENCIES.map((a, i) => `<div class="ag-row"><div class="ag-l"><span class="ag-code">${a.code}</span><span class="ag-pill base">${a.base}</span><span class="ag-pill type">${a.type}</span></div><button class="ag-tg" data-ag="${i}">${tog(a.on)}</button></div>`).join('')}
        <button class="add-btn">+ Add agency / installation</button>
        <div class="note"><b>${AGENCIES.filter(a => a.on).length} agencies monitored.</b> Active agencies scope your Opportunities feed, Spending map, and CO network.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    notifs: () => `
      <div class="sp-hd"><div class="sp-t">Notification Preferences</div><div class="sp-s">Control what reaches your inbox</div></div>
      <div class="sp-bd">
        ${NOTIFS.map((n, i) => `<div class="nf-row"><div class="nf-l"><div class="nf-t">${n.t}</div><div class="nf-d">${n.d}</div></div><button class="nf-tg" data-nf="${i}">${tog(n.on)}</button></div>`).join('')}
        <div class="note">Delivered to <b>jose@apexprecision.com</b>. Critical alerts also push to the bell in your top bar.</div>
      </div>
      <div class="sp-foot"><span class="saved">✓ Saved</span><button class="save-btn">Save changes</button></div>`,

    team: () => `
      <div class="sp-hd"><div class="sp-t">Team Members</div><div class="sp-s">Manage workspace access</div></div>
      <div class="sp-bd">
        ${TEAM.map(m => `<div class="tm-row"><div class="tm-av">${m.name.split(' ').map(w => w[0]).join('')}</div><div class="tm-info"><div class="tm-name">${m.name}${m.you ? ' <span class="tm-you">You</span>' : ''}</div><div class="tm-email">${m.email}</div></div><span class="tm-role">${m.role}</span></div>`).join('')}
        <button class="add-btn">+ Invite team member</button>
        <div class="note"><b>Plan limit:</b> Design Partner plan includes 1 seat. Upgrade to Standard for 3 seats.</div>
      </div>`,

    billing: () => `
      <div class="sp-hd"><div class="sp-t">Billing &amp; Plan</div><div class="sp-s">Subscription &amp; usage</div></div>
      <div class="sp-bd">
        <div class="plan-card"><div class="pc-l"><div class="pc-name">Design Partner</div><div class="pc-desc">Full platform access · 1 seat · all 16 desks</div></div><div class="pc-r"><div class="pc-price">$0<span>/mo</span></div><div class="pc-badge">Active</div></div></div>
        <div class="usage-grid">
          <div class="ug"><div class="ug-v">847</div><div class="ug-l">Opportunities tracked</div></div>
          <div class="ug"><div class="ug-v">23</div><div class="ug-l">Audits run</div></div>
          <div class="ug"><div class="ug-v">∞</div><div class="ug-l">API calls</div></div>
        </div>
        <div class="note">Upgrade to <b>Standard ($499/mo)</b> for 3 seats, SAM.gov auto-sync, and priority feeds.</div>
        <div class="sp-foot" style="border:0;padding:14px 0 0"><button class="save-btn">Upgrade plan</button></div>
      </div>`
  };

  function renderNav() {
    $('setNav').innerHTML = NAV.map(n => `<button class="sn ${n.key === active ? 'active' : ''}" data-k="${n.key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${n.icon}"/></svg>${n.label}</button>`).join('');
    $('setNav').querySelectorAll('.sn').forEach(b => b.onclick = () => { active = b.dataset.k; renderNav(); renderPanel(); });
  }
  function renderPanel() {
    $('setContent').innerHTML = `<div class="set-panel">${PANELS[active]()}</div>`;
    // wire toggles
    $('setContent').querySelectorAll('.tgl').forEach(t => t.parentElement.onclick = (e) => { e.preventDefault(); t.classList.toggle('on'); flashSaved(); });
    $('setContent').querySelectorAll('.cert-tg, .ag-tg, .nf-tg, .nr-make, .nr-x').forEach(b => { if (b.classList.contains('cert-tg')) b.onclick = () => { b.classList.toggle('on'); b.textContent = (b.classList.contains('on') ? '✓ ' : '') + b.dataset.cert; flashSaved(); }; });
    const sb = $('setContent').querySelector('.save-btn'); if (sb) sb.onclick = () => flashSaved(true);
  }
  function flashSaved(big) {
    const el = $('savedAt'); if (el) { el.textContent = 'saved just now'; setTimeout(() => el.textContent = 'changes save automatically', 2200); }
  }

  function init() { renderNav(); renderPanel(); }
  window.PS_APP = { onThemeChange: () => renderPanel() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
