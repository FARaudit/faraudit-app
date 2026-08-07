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
  /* A SIX-DIGIT CODE IS NOT A DESCRIPTION. Read from the ONE reference table
     (/naics-reference.js), the same one the NAICS directory renders from.
     That table is a CURATED subset — SAM carries roughly a thousand codes — so a miss
     is expected and is NOT an error: the row shows the code alone and says the table
     does not carry it, rather than inventing a title or refusing a code the customer
     is entitled to save. The size standard is a REFERENCE figure from 13 CFR 121.201;
     the solicitation's own stated standard governs when it differs. */
  function naicsMeta(code) {
    var ref = window.NAICS_REF;
    var r = ref && ref.byCode && ref.byCode[String(code)];
    if (!r) return null;
    // A title with no size standard is a real state: the table carries the code's name
    // but no primary-sourced 13 CFR 121.201 threshold for it. Show the name, claim no
    // figure — a guessed threshold is the one error here that could flip a verdict.
    return { title: r[2], size: r[3] ? r[3] + ' ' + (r[4] === 'emp' ? 'employees' : 'revenue') : '' };
  }
  /* EVERY ROW EMITS EVERY CELL. The grid gives code / title / reach / size their own
     tracks, so a row that omits an absent value shifts every cell after it and the
     column breaks. Missing values render as an empty cell holding its place. */
  function naicsRow(code) {
    var m = naicsMeta(code);
    return `<div class="naics-row"><div class="nr-l">`
      + `<span class="nr-code">${esc(code)}</span>`
      + (m ? `<span class="nr-title">${esc(m.title)}</span>`
           : `<span class="nr-unknown">not in the reference table</span>`)
      + (m && m.size
        ? `<span class="nr-size" title="SBA size standard — the solicitation's own stated standard governs when it differs">${esc(m.size)}</span>`
        : `<span class="nr-gap"></span>`)
      + `</div><button class="nr-x" type="button" data-naics-rm="${esc(code)}" title="Remove" aria-label="Remove NAICS ${esc(code)}">✕</button></div>`;
  }

  /* A chip is GREEN only when SAM established the program. Anything else reads as
     carried-but-unverified, because a set-aside bar is cleared by the registration, not
     by the profile — and a chip that looks the same either way is the profile
     attesting on SAM's behalf. */
  /* THREE STATES, NOT TWO — the programs do not all work the same way.
     8(a), HUBZone, WOSB/EDWOSB and SDVOSB/VOSB are CERTIFIED by SBA (SDVOSB through
     VetCert, which replaced the VA's CVE process); self-certification is no longer
     accepted for any of them, so SAM is the authority and a green chip means SAM said
     so. "Small business" is different in kind: it is SELF-REPRESENTED in SAM against the
     size standard for the firm's NAICS code, so it can never appear in SBA's certified
     programs and must not be shown as failing a check it is not subject to. */
  function isSelfRepresented(name) {
    return /small\s*business/i.test(String(name || ''));
  }
  function certChip(c) {
    var name = esc(c.k || c);
    if (c.on) return `<span class="cert-tg on" title="Established in SAM under this firm's UEI">${name}</span>`;
    if (isSelfRepresented(c.k || c)) {
      return `<span class="cert-tg" title="Self-represented in SAM against the size standard for your NAICS codes — this is not an SBA-certified program, so there is nothing for SAM to establish">${name}</span>`;
    }
    return `<span class="cert-tg" title="Carried on your profile — not established in SAM under the UEI on file">${name}</span>`;
  }
  /* The reason is stated ONCE, from the SAM state, and only when there is something
     unverified to explain. A null state is our own read failing: say nothing rather than
     tell a customer their certification is unverified because we could not check. */
  function certNote() {
    var st = window.PS.CERT_STATE;
    // Self-represented entries are excluded: they are not awaiting a check, so counting
    // them would make the note appear over a profile with nothing wrong with it.
    var anyUnverified = (window.PS.CERTS || []).some(function (c) {
      return !c.on && !isSelfRepresented(c.k || c);
    });
    if (!st || !anyUnverified) return '';
    var why = st === 'uei-not-found'
        ? 'SAM has no registration under the UEI on your profile, so none of these is established there.'
      : st === 'no-uei'
        ? 'No UEI is on file, so there is nothing for SAM to establish these against.'
      : st === 'registration-inactive'
        ? 'The SAM registration under this UEI has lapsed, so it establishes nothing until it is renewed.'
      : st === 'verified'
        ? 'SAM was read successfully; the unfilled ones are not registered under this UEI.'
      : '';
    if (!why) return '';
    /* SAY WHAT WAS READ, AND WHAT WOULD CHANGE IT. The state is named against the UEI it
       was checked for, and the sentence after it says how the row fills in — on its own,
       from the registration, with nothing here to type. Without that, an unpromoted row
       is indistinguishable from a fault. */
    var uei = window.PS.COMPANY && window.PS.COMPANY.uei;
    var stamp = st === 'uei-not-found' ? 'Not found in SAM'
      : st === 'no-uei' ? 'No UEI on file'
      : st === 'registration-inactive' ? 'SAM registration lapsed'
      : 'Read from SAM';
    return `<div class="cert-state"><span class="cs-dot"></span>`
      + `<span class="cs-t">${esc(stamp)}</span>`
      + (uei ? `<span class="cs-u">${esc(uei)}</span>` : '')
      + `</div>`
      + `<div class="fld-note" style="margin-top:6px">${esc(why)} `
      + `These are read from your SAM registration and fill in on their own — there is nothing to type here. `
      + `A set-aside bar is cleared by the registration, not by this list.</div>`;
  }

  function editable(id, label, val, ph) { return `<div class="fld"><label>${label}</label><input type="text" id="${id}" value="${esc(val)}" placeholder="${esc(ph)}"></div>`; }
  /* Read-only value. "Not on file" rather than an empty box, so nothing-on-file is visibly
     different from a field you are meant to fill in. */
  function ro(label, val, note) {
    return `<div class="fld"><label>${label}</label><div class="fld-ro">${val ? esc(val) : '<span class="fld-none">Not on file</span>'}</div>${note ? `<div class="fld-note">${esc(note)}</div>` : ''}</div>`;
  }

  /* Plan comes from the subscription record, and there are three answers, not two:
     a plan, no subscription, or a record that could not be read. An unreadable
     billing record must never render as "no subscription". */
  function planName() {
    if (window.PS.plan_unreadable) return '<span class="fld-none">Could not be read</span>';
    return window.PS.plan_label ? esc(window.PS.plan_label)
      : '<span class="fld-none">No subscription on file</span>';
  }
  /* NO PRICE IS RENDERED. What a customer pays is agreed with their point of contact
     and is stored nowhere this page can read, so the page states that instead of a
     figure. A number here would be the one thing on this screen a customer might act
     on, and it would not be theirs. */
  function planPrice() {
    return 'Pricing is agreed with your point of contact.';
  }
  function planStatus() {
    const s = window.PS.plan_status;
    if (!s) return '';
    const end = window.PS.plan_period_end;
    const when = end && !isNaN(new Date(end).getTime())
      ? new Date(end).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : null;
    return esc(s) + (when ? ' · renews ' + when : '');
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
        ${NAICS.length ? '' : '<div class="note note-warn">No NAICS codes on file, so Today, Opportunities, Contracting Officers and Teaming Partners have nothing to match against and will stay empty. Add them under NAICS Configuration.</div>'}
        <div class="fld-sec">Certifications</div>
        <div class="cert-row">${CERTS.length ? CERTS.map(c => certChip(c)).join('') : '<span class="fld-none">None on file</span>'}</div>
        ${certNote()}
        <div class="note">This is the same record the <a href="/capability-statement">capability statement</a> prints and the audit engine reads when it judges whether you are eligible to bid — so what you enter here shapes real verdicts. NAICS codes are edited under NAICS Configuration. Certifications are shown here only: one clears a set-aside bar just when it is verified against SAM, so there is nothing useful to type.</div>
      </div>
      <div class="sp-foot"><span class="saved" id="psSavedNote" hidden></span><button class="save-btn" id="psSaveBtn">Save changes</button></div>`,

    /* The row carries the CODE and nothing else. There is no NAICS title anywhere in
       this product — not in the column, not from SAM, not in any lookup — and the
       PRIMARY / SECONDARY / MONITOR ONLY vocabulary has no source, no writer and no
       reader. A description column filled with a dash reads as "we hold this and it is
       blank"; a posture badge derived from array order would render an ordering
       artifact as a business fact. Neither is shown.
       Removal is keyed on the code, not the row index: the panel re-templates on every
       theme flip and nav click, so an index goes stale across the round trip. */
    naics: () => window.PS.loadError ? `
      <div class="sp-hd"><div class="sp-t">NAICS Configuration</div><div class="sp-s">These codes scope what the platform shows you</div></div>
      <div class="sp-bd">
        <div class="ps-failed">
          <div class="ps-failed-t">Your NAICS codes could not be loaded</div>
          <div class="ps-failed-s">A connection problem, not an empty list — nothing has been lost and nothing has been changed. Reload to try again.</div>
        </div>
      </div>` : `
      <div class="sp-hd"><div class="sp-t">NAICS Configuration</div><div class="sp-s">These codes scope what the platform shows you</div></div>
      <div class="sp-bd">
        ${NAICS.length
          ? `<div class="naics-head"><span>Code</span><span>Description</span><span class="nh-r">Size standard</span><span></span></div>`
            + NAICS.map(n => naicsRow(n.code)).join('')
          : '<div class="fld-none" style="padding:6px 2px 12px">No NAICS codes on file.</div>'}
        ${(window.PS.NAICS_DERIVED || []).length ? `
        <div class="naics-sugg">
          <div class="ns-t">From contracts you have won — not saved to your profile yet</div>
          <div class="ns-row">${window.PS.NAICS_DERIVED.map(c => `<button class="ns-chip" type="button" data-naics-add="${esc(c)}" title="Add ${esc(c)} to your profile">${esc(c)} <span>+</span></button>`).join('')}</div>
          <div class="ns-s">These scope nothing until you add them. Adding one saves only that code.</div>
        </div>` : ''}
        <div class="pe-add">
          <input type="text" id="psNaicsInput" maxlength="60" placeholder="Six-digit code, or search — &quot;software&quot;, &quot;construction&quot;" aria-label="NAICS code to add, or a word to search for one" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="psNaicsResults">
          <button class="save-btn" type="button" id="psNaicsAdd">Add code</button>
        </div>
        <!-- Search results. Typing a word finds codes; typing six digits still adds
             directly, because the reference table is a convenience and not an allowlist. -->
        <div class="naics-find" id="psNaicsResults" role="listbox" aria-label="Matching NAICS codes" hidden></div>
        <div class="naics-msg" id="psNaicsMsg" role="status" hidden></div>
        <div class="note"><b>How this works:</b> your NAICS codes are what Today, Opportunities, Contracting Officers and Teaming Partners match against — with none on file those pages have nothing to match and stay empty. Wage Benchmarks offers them as an optional filter over a national reference table; it is not scoped by them. Each page picks up a change the next time it loads.</div>
      </div>
      `,

    /* NOT BUILDABLE TODAY, so nothing here pretends otherwise. There is no agency
       column in any table, no writer, and no reader: the Opportunities feed is scoped
       by NAICS alone. The panel used to render per-agency monitoring switches with no
       handler and no column to write to, above a note that counted "0 of 0 agencies
       monitored" and claimed active agencies scope the feed, the Spending map and the
       CO network. A greyed-out switch is still a claim that this is a setting you
       have, so no switch is rendered at all. The unavailable reason is printed from
       the route rather than re-authored here — one sentence, one source. */
    agencies: () => `
      <div class="sp-hd"><div class="sp-t">Target Agencies</div><div class="sp-s">Not yet available</div></div>
      <div class="sp-bd">
        <div class="ps-notlive" id="agState">Checking…</div>
        <div class="note">Your Opportunities feed, Spending map and Contracting Officer network are scoped by the NAICS codes on your profile. Agency-level targeting is not built, so nothing on this tab changes what you see.</div>
      </div>
      `,

    /* ONE ROW, AND IT SAYS WHAT IT DOES. The digest preference persists to
       user_preferences, but nothing reads it: there is no weekly-digest mailer, and
       every scheduled job sends to a fixed internal address rather than to the signed
       in customer. So the switch is real and its effect is not, and the row says so
       instead of implying a schedule and a channel. The five other alert types were
       template rows with no handler and no backing preference; they are gone. The bell
       is genuinely wired — notifications are written by the watcher and read by the
       page — so that sentence stays. */
    notifs: () => `
      <div class="sp-hd"><div class="sp-t">Notification Preferences</div><div class="sp-s">What reaches you, and what does not yet</div></div>
      <div class="sp-bd" id="alerts">
        <div class="nf-row" data-pref-row>
          <div class="nf-l">
            <div class="nf-t">Weekly digest of watched opportunities <span class="nf-tag">Not yet sending</span></div>
            <div class="nf-d">Your choice is saved, but the digest itself is not built — nothing is emailed on a schedule today. Set it now and it will apply when it ships.</div>
          </div>
          <button class="nf-tg" data-pref-tg="weekly_digest_watched"><span class="tgl"><i></i></span></button>
        </div>
        <div class="naics-msg" id="psPrefNote" role="status" hidden></div>
        <div class="note">Alerts on the notices you are watching are emailed to <b>${esc(COMPANY.email)}</b> as they post, and also appear on the bell in your top bar. Turning those off is not built yet.</div>
      </div>
      `,

    /* NO ROLE BADGE. There is no membership table, no invitation, no seat and no role
       model anywhere in the product — the OWNER pill was a literal typed into the array
       one line before it rendered, and a role badge implies other roles that do not
       exist. The seat sentence pointed at a Billing tab that holds no seat count. What
       is true: one account, and it is yours. */
    team: () => `
      <div class="sp-hd"><div class="sp-t">Team Members</div><div class="sp-s">Who can sign in to this workspace</div></div>
      <div class="sp-bd">
        ${TEAM.map(m => `<div class="tm-row"><div class="tm-av">${esc(String(m.name || '?').split(' ').map(w => w[0]).join(''))}</div><div class="tm-info"><div class="tm-name">${esc(m.name)}${m.you ? ' <span class="tm-you">You</span>' : ''}</div><div class="tm-email">${esc(m.email)}</div></div></div>`).join('')}
        <p class="ps-unwired">Inviting teammates is not built yet. This workspace has a single account, yours.</p>
      </div>`,

    billing: () => `
      <div class="sp-hd"><div class="sp-t">Billing &amp; Plan</div><div class="sp-s">Your plan, and what this page can and cannot change</div></div>
      <div class="sp-bd">
        <div class="plan-card"><div class="pc-l"><div class="pc-kicker">Current plan</div><div class="pc-name">${planName()}</div>${planStatus() ? `<div class="pc-status">${planStatus()}</div>` : ''}<div class="pc-desc">${planPrice()}</div></div></div>
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
  /* WHAT THE CUSTOMER TYPED SURVIVES A RE-RENDER.
     Every panel is re-templated from window.PS, and each input carries its value from
     that state — so a re-render between typing and saving rebuilds the box and restores
     the stored value. A theme flip, a tab click, or the initial load settling is enough.
     Nothing is announced: the edit is simply gone, and the next save writes the old
     value back under a "✓ Saved".

     Only DIRTY fields are restored. An input the customer never touched must take the
     freshly rendered value, or a re-render following a successful save — or the load
     that first fills these boxes — would put a stale one back. */
  var DIRTY = {};
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.id && t.closest && t.closest('#setContent')) DIRTY[t.id] = t.value;
  });
  /* Cleared once the server has confirmed the write: from then on the rendered value IS
     the customer's value, and holding the old edit would fight the record. */
  function clearDirty() { DIRTY = {}; }

  function renderPanel() {
    $('setContent').innerHTML = `<div class="set-panel">${PANELS[active]()}</div>`;
    Object.keys(DIRTY).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value !== DIRTY[id]) el.value = DIRTY[id];
    });
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
  const PREF_LABELS = { weekly_digest_watched: 'Weekly digest' };
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
          savePref(key, next).then(ok => { b.disabled = false;
            // NAME what saved. flash() was called bare, so `what` was undefined and the
            // note rendered hidden and empty — a confirmed save reported nothing.
            if (ok) { prefs[key] = next; flash(PREF_LABELS[key] || key, true); }
            // A REFUSED SAVE NAMES ITSELF. Reverting the switch is not a message: the
            // route rate-limits at 30/min, and a toggle that will not move with nothing
            // on screen is indistinguishable from a dead control.
            else { tgl.classList.toggle('on', !next); flash(PREF_LABELS[key] || key, false); } });
        };
      });
    });
  }
  // Confirms a save that the server acknowledged, naming the field.
  /* Reports into the panel that is actually on screen. This targeted a #savedAt that
     exists in no settings markup, so `if (!el) return` swallowed every confirmation and
     a successful preference save looked exactly like a click that did nothing. */
  function flash(what, ok) {
    const el = $('psPrefNote');
    if (!el) return;
    if (!what) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    // A failure stays on screen. Clearing it on a timer would return the row to the
    // same silence the customer just failed to escape.
    if (ok === false) {
      el.textContent = '\u2715 Could not save ' + what + ' \u2014 nothing was changed.';
      return;
    }
    el.textContent = '\u2713 ' + what + ' saved';
    setTimeout(() => { el.textContent = ''; el.hidden = true; }, 2600);
  }

  function init() { renderNav(); renderPanel(); }
  window.PS_APP = { render: init, onThemeChange: () => renderPanel(), clearDirty: clearDirty };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
