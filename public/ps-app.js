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
  // NOTHING HERE IS A COMPANY. Every field starts empty and is filled only by
  // profile-settings-live.js from the account's own record. A page that carries a
  // company in its source can show that company when the fetch fails, and the
  // customer reads it as theirs.
  //
  // loadError is the third state: empty, failure and data are three different
  // answers and none may wear another's clothes.
  window.PS = window.PS || {
    loadError: false,
    COMPANY: { name: '', cage: '', uei: '', address: '', contact: '', email: '', phone: '' },
    CERTS: [], NAICS: [], AGENCIES: [], NOTIFS: [], TEAM: [], USAGE: []
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
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* An editable field carries an id so the save handler can read it back. Anything with no
     write path must NOT render as an <input>: a text box that silently discards what you
     type is the defect this panel shipped with. */
  function editable(id, label, val, ph) { return `<div class="fld"><label>${label}</label><input type="text" id="${id}" value="${esc(val)}" placeholder="${esc(ph)}"></div>`; }
  /* Read-only value. "Not on file" rather than an empty box, so nothing-on-file is visibly
     different from a field you are meant to fill in. */
  function ro(label, val, note) {
    return `<div class="fld"><label>${label}</label><div class="fld-ro">${val ? esc(val) : '<span class="fld-none">Not on file</span>'}</div>${note ? `<div class="fld-note">${esc(note)}</div>` : ''}</div>`;
  }

  // Plan name and price come from /api/profile. No field renders unless the route
  // supplies it.
  const money = (n) => typeof n === 'number' && isFinite(n)
    ? '$' + n.toLocaleString('en-US') : null;
  function planName() {
    return window.PS.plan_label || '<span class="fld-none">Not on file</span>';
  }
  function planPrice() {
    const m = money(window.PS.plan_price_monthly), y = money(window.PS.plan_price_annual);
    if (!m && !y) return '<span class="fld-none">Price not on file</span>';
    return [m && m + ' / month', y && 'or ' + y + ' / year'].filter(Boolean).join(' · ');
  }

  const PANELS = {
    /* SETTINGS OWNS THE PERSON. The company — name, UEI, CAGE, address, NAICS,
       certifications — lives in the capability statement, which is a document the customer
       sends to contracting officers AND the record the audit engine reads to judge
       eligibility. It is shown here read-only with one link out: one record, one editor.
       Everything below that has no write path renders as text, never as an <input>. */
    company: () => window.PS.loadError ? `
      <div class="sp-hd"><div class="sp-t">Your Account</div><div class="sp-s">Your details, and the company record the platform runs on</div></div>
      <div class="sp-bd">
        <div class="ps-failed">
          <div class="ps-failed-t">Your company record could not be loaded</div>
          <div class="ps-failed-s">A connection problem, not an empty record — nothing has been lost and nothing has been changed. Reload to try again.</div>
        </div>
      </div>` : `
      <div class="sp-hd"><div class="sp-t">Your Account</div><div class="sp-s">Your details, and the company record the platform runs on</div></div>
      <div class="sp-bd">
        <div class="fld-sec">Your details</div>
        <div class="fld-grid">
          ${editable('psFullName', 'Full name', COMPANY.contact, 'Your name')}
          ${ro('Email', COMPANY.email, 'Your sign-in address. Changing it needs a verification step — not editable here.')}
        </div>
        <div class="fld-sec">Company record</div>
        <div class="fld-grid">
          ${editable('psCompanyName', 'Company name', COMPANY.name, 'Registered legal name')}
          ${editable('psUei', 'SAM.gov UEI', COMPANY.uei, '12-character UEI')}
          ${editable('psCage', 'CAGE code', COMPANY.cage, '5-character CAGE')}
          ${editable('psAddress', 'Business address', COMPANY.address, 'Street, city, state ZIP')}
        </div>
        <div class="fld-sec">NAICS codes</div>
        <div class="cert-row">${NAICS.length ? NAICS.map(n => `<span class="cert-tg on">${esc(n.code || n.k || n)}</span>`).join('') : '<span class="fld-none">None on file</span>'}</div>
        ${NAICS.length ? '' : '<div class="note note-warn">No NAICS codes on file, so Opportunities, Teaming Partners, Contracting Officers and Wage Benchmarks have nothing to match against and will stay empty. Add them in the capability statement.</div>'}
        <div class="fld-sec">Certifications</div>
        <div class="cert-row">${CERTS.length ? CERTS.map(c => `<span class="cert-tg on">${esc(c.k || c)}</span>`).join('') : '<span class="fld-none">None on file</span>'}</div>
        <div class="note">This is the same record the <a href="/capability-statement">capability statement</a> prints and the audit engine reads when it judges whether you are eligible to bid — so what you enter here shapes real verdicts. NAICS codes and certifications are shown here but edited elsewhere.</div>
      </div>
      <div class="sp-foot"><span class="saved" id="psSavedNote" hidden></span><button class="save-btn" id="psSaveBtn">Save changes</button></div>`,

    naics: () => `
      <div class="sp-hd"><div class="sp-t">NAICS Configuration</div><div class="sp-s">These codes drive every intelligence filter across FARaudit</div></div>
      <div class="sp-bd">
        ${NAICS.map(n => `<div class="naics-row"><div class="nr-l"><span class="nr-code">${n.code}</span><span class="nr-label">${n.desc}</span></div><span class="nr-tag ${n.tag === 'PRIMARY' ? 'p' : n.tag === 'MONITOR ONLY' ? 'm' : 's'}">${n.tag}</span><button class="nr-x" title="Remove">✕</button></div>`).join('')}
        <a class="add-btn" href="/capability-statement">Edit NAICS codes on your capability statement</a>
        <div class="note"><b>How this works:</b> Your NAICS codes filter opportunities, contracting officers, agencies, wage benchmarks, and teaming partners. Changes take effect immediately across all pages.</div>
      </div>
      `,

    agencies: () => `
      <div class="sp-hd"><div class="sp-t">Target Agencies</div><div class="sp-s">Toggle monitoring for each command &amp; installation</div></div>
      <div class="sp-bd">
        ${AGENCIES.map((a, i) => `<div class="ag-row"><div class="ag-l"><span class="ag-code">${a.code}</span><span class="ag-pill base">${a.base}</span><span class="ag-pill type">${a.type}</span></div><button class="ag-tg" data-ag="${i}">${tog(a.on)}</button></div>`).join('')}
        <p class="ps-unwired">Adding an agency is not built yet. Your Opportunities feed is scoped by the NAICS codes on your capability statement.</p>
        <div class="note"><b>${AGENCIES.filter(a => a.on).length} of ${AGENCIES.length} agencies monitored.</b> Active agencies scope your Opportunities feed, Spending map, and CO network.</div>
      </div>
      `,

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
      `,

    team: () => `
      <div class="sp-hd"><div class="sp-t">Team Members</div><div class="sp-s">Manage who has access to your FARaudit workspace</div></div>
      <div class="sp-bd">
        ${TEAM.map(m => `<div class="tm-row"><div class="tm-av">${m.name.split(' ').map(w => w[0]).join('')}</div><div class="tm-info"><div class="tm-name">${m.name}${m.you ? ' <span class="tm-you">You</span>' : ''}</div><div class="tm-email">${m.email}</div></div><span class="tm-role">${m.role}</span></div>`).join('')}
        <p class="ps-unwired">Inviting teammates is not built yet. This workspace has one seat, yours.</p>
        <div class="note">One seat, yours. Seat limits are set by your plan — see Billing.</div>
      </div>`,

    billing: () => `
      <div class="sp-hd"><div class="sp-t">Billing &amp; Plan</div><div class="sp-s">Manage your subscription and usage</div></div>
      <div class="sp-bd">
        <div class="plan-card"><div class="pc-l"><div class="pc-kicker">Current plan</div><div class="pc-name">${planName()}</div><div class="pc-desc">${planPrice()}</div></div></div>
        <div class="fld-sec">Usage this period</div>
        ${USAGE.length
          ? `<div class="usage-list">${USAGE.map(u => `<div class="us-row"><div class="us-l">${u.l}${u.s ? `<small>${u.s}</small>` : ''}</div><span class="us-v">${u.v}</span></div>`).join('')}</div>`
          : '<p class="ps-unwired">Usage metering is not built yet, so there is nothing to show for this period.</p>'}
        <p class="ps-unwired">Changing or cancelling your plan, and invoices, are not self-service yet — they go through your point of contact. Nothing on this page can alter your billing.</p>
      </div>`
  };

  function renderNav() {
    $('setNav').innerHTML = NAV.map(n => `<button class="sn ${n.key === active ? 'active' : ''}" data-k="${n.key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${n.icon}"/></svg>${n.label}</button>`).join('');
    $('setNav').querySelectorAll('.sn').forEach(b => b.onclick = () => { active = b.dataset.k; renderNav(); renderPanel(); });
  }
  function renderPanel() {
    $('setContent').innerHTML = `<div class="set-panel">${PANELS[active]()}</div>`;
    // Server-backed preferences bind below, by key. The company panel's Save binds in
    // profile-settings-live.js. Nothing else on the page is interactive.
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
  // Confirms a save that the server acknowledged, naming the field.
  function flash(what) {
    const el = $('savedAt');
    if (!el) return;
    el.textContent = what ? '\u2713 ' + what + ' saved' : '';
    if (what) setTimeout(() => { el.textContent = ''; }, 2600);
  }

  function init() { renderNav(); renderPanel(); }
  window.PS_APP = { render: init, onThemeChange: () => renderPanel() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
