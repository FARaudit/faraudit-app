/* FARaudit · Contracting Officers — render layer.

   Renders window.DCO, which contracting-officers-live.js fills from
   /api/ko-intelligence. Every value on this page is carried from the notice
   SAM published: name, address, phone, agency, office, NAICS and the notices
   themselves. Nothing here scores, averages or infers, so there is no branch
   that can print a number the feed did not contain.

   Officer fields are external input, so every one of them reaches the page as
   a text node built through h() — this file never assigns markup. */
(function () {
  'use strict';

  const S = { agency: 'all', q: '', sel: null };

  /* ── An agency arriving in the URL ──
     News names agencies the way reporting does ("Army"); SAM names them the way a
     notice does ("DEPT OF THE ARMY"). The two vocabularies are unrelated, so the
     request resolves against the agencies present in this reader's feed and
     applies only on a hit — a filter value no officer carries renders an empty
     list. `askedAgency` is retained on a miss so the notice can name what the
     reader asked for. */
  let askedAgency = null;
  let agencyApplied = false;
  function requestedAgency() {
    try {
      const v = new URLSearchParams(window.location.search).get('agency');
      return v ? v.trim() : null;
    } catch (_) { return null; }
  }
  function resolveAgency(asked) {
    if (!asked) return null;
    const list = Array.isArray(window.DCO.AGENCY_FILTERS) ? window.DCO.AGENCY_FILTERS : [];
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const a = norm(asked);
    if (!a) return null;
    let hit = list.find((f) => f !== 'all' && norm(f) === a);
    if (hit) return hit;
    // "Army" inside "DEPT OF THE ARMY". Longest match wins, so "Air Force" does
    // not lose to a shorter incidental containment.
    const partial = list.filter((f) => f !== 'all' && (norm(f).indexOf(a) !== -1 || a.indexOf(norm(f)) !== -1));
    partial.sort((x, y) => String(y).length - String(x).length);
    return partial[0] || null;
  }
  function applyRequestedAgency() {
    const asked = requestedAgency();
    if (!asked) return;
    askedAgency = asked;
    const hit = resolveAgency(asked);
    if (hit) S.agency = hit;
  }
  const $ = (id) => document.getElementById(id);

  /* h(tag, opts, children) — opts: {cls, text, attrs, style} */
  function h(tag, opts, children) {
    const o = opts || {};
    const node = document.createElement(tag);
    if (o.cls) node.className = o.cls;
    if (o.text !== undefined && o.text !== null) node.textContent = String(o.text);
    if (o.style) node.setAttribute('style', o.style);
    if (o.attrs) {
      for (const k of Object.keys(o.attrs)) {
        const v = o.attrs[k];
        if (v !== null && v !== undefined) node.setAttribute(k, String(v));
      }
    }
    (children || []).forEach((c) => { if (c) node.appendChild(c); });
    return node;
  }

  function fill(host, children) {
    if (!host) return;
    host.replaceChildren.apply(host, children.filter(Boolean));
  }

  /* An unparseable date renders as an em dash, never as "Invalid Date" and
     never as today. */
  function fmtDate(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* The avatar tile is one colour for every officer and is set in CSS. The hue used
     to come from a hash of the email: it encoded nothing a reader could act on, and
     two of the six hues sat at the contrast floor because of it. */

  /* The list covers a 30-day window, so the year is identical on every row and prints
     132 times. It is added back whenever the date does NOT fall in the current year,
     so a January boundary can never read as this year. The panel keeps the full date. */
  function fmtDateShort(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    const d = new Date(t);
    const opts = d.getFullYear() === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', opts);
  }

  function officers() {
    return Array.isArray(window.DCO && window.DCO.OFFICERS) ? window.DCO.OFFICERS : [];
  }

  function meta() {
    return (window.DCO && window.DCO.meta) || { state: 'loading' };
  }

  /* ── how an agency is named in a list ──
     SAM qualifies every agency with its department, so five of the ten in a typical
     feed open with the same eleven characters. A token carried by half the set
     distinguishes nothing, and it is what makes the filter bar three rows deep and
     the agency column three lines tall. The sub-agency is printed alone, UNLESS two
     agencies in this feed share one — then both keep the department, so shortening
     can never merge two distinct agencies into one label. The detail panel keeps the
     qualified string, so the department is one click away and never lost. */
  let shortNames = null;
  function buildShortNames() {
    const tail = (s) => { const p = String(s).split('·'); return p[p.length - 1].trim(); };
    /* "DEPT OF THE" is grammar, not identity — it is carried by three of the ten and
       distinguishes none of them. Stripped as a rule, not from a list of services, so
       a service this feed has never seen shortens the same way. */
    const tidy = (s) => s.replace(/^(DEPARTMENT OF THE|DEPT OF THE|DEPARTMENT OF|DEPT OF)\s+/i, '');
    const label = (s) => tidy(tail(s));
    const counts = {};
    const all = officers().map((o) => o.agency).filter(Boolean);
    all.forEach((s) => { const t = label(s); (counts[t] = counts[t] || {})[s] = 1; });
    shortNames = {};
    all.forEach((s) => { const t = label(s); shortNames[s] = Object.keys(counts[t]).length > 1 ? s : t; });
  }
  function agencyShort(a) {
    if (!a) return a;
    if (!shortNames) buildShortNames();
    return shortNames[a] || a;
  }

  /* ── which code an officer is shown under ──
     An officer posts in every code their notices carry, so this is a set, not a value.
     The row prints the one they post in MOST, with a counted overflow marker — a
     truncation that says how much it hid. The panel lists all of them, same order.
     Membership comes from the record's own list; the notices only order it, so a code
     the record does not claim can never appear. */
  function orderedCodes(o) {
    const n = {};
    (o.notices || []).forEach((x) => {
      if (!x.naics_code) return;
      n[x.naics_code] = (x.naics_code in n ? n[x.naics_code] : 0) + 1;
    });
    const at = (c) => (c in n ? n[c] : 0);
    return (o.naics || []).slice().sort((a, b) => at(b) - at(a) || String(a).localeCompare(String(b)));
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    return officers().filter((o) => {
      if (S.agency !== 'all' && o.agency !== S.agency) return false;
      if (!q) return true;
      return [o.name, o.email, o.office, o.agency].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }

  /* ── state banner ───────────────────────────────────────────────────── */

  const EMPTY_COPY = {
    'no-profile-codes': {
      label: 'No codes on file',
      body: 'Your feed has no NAICS codes yet, so there are no notices to read contacts from. Add your codes on the Capability Statement page and they appear here.',
      link: { href: '/capability-statement', text: 'Capability Statement' }
    },
    'no-notices-in-window': {
      label: 'No open notices',
      body: 'SAM published no open notices in your codes in this window, so there are no points of contact to list.'
    },
    'no-contacts-on-notices': {
      label: 'No contacts published',
      body: 'The notices in your feed carry no point-of-contact email, which is the only field this page can identify an officer by.'
    }
  };

  function renderBanner() {
    const el = $('stateBanner');
    if (!el) return;
    const m = meta();
    el.classList.remove('is-error');

    if (m.state === 'loading') {
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Loading' }),
        h('span', { text: 'Reading the points of contact on the notices in your feed…' })
      ]);
      return;
    }
    if (m.state === 'error') {
      el.hidden = false;
      el.classList.add('is-error');
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Unavailable' }),
        h('span', { text: 'The live feed did not answer, so this page has nothing to show. It is not an empty directory — reload to try again.' }),
        m.detail ? h('b', { text: m.detail }) : null
      ]);
      return;
    }
    if (m.state === 'empty') {
      const copy = EMPTY_COPY[m.reason] || EMPTY_COPY['no-notices-in-window'];
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: copy.label }),
        h('span', { text: copy.body }),
        copy.link ? h('a', { text: copy.link.text, attrs: { href: copy.link.href } }) : null
      ]);
      return;
    }
    el.hidden = true;
    fill(el, []);
  }

  /* ── header + controls ──────────────────────────────────────────────── */

  function renderStats() {
    const list = officers();
    const m = meta();
    const agencies = new Set(list.map((o) => o.agency).filter(Boolean));
    const ready = m.state === 'ready' || m.state === 'empty';
    const put = (id, n) => { const el = $(id); if (el) el.textContent = ready ? String(n) : '—'; };
    put('hsTotal', list.length);
    put('hsNotices', m.noticeCount || 0);
    put('hsAgencies', agencies.size);
    // The LIVE pill is a claim about the feed, so it appears only when the feed
    // actually answered. During an outage it must not keep pulsing green.
    const pill = $('livePill');
    if (pill) pill.hidden = m.state !== 'ready';
  }

  function renderAgencyPills() {
    const host = $('agencyFilters');
    if (!host) return;
    const list = Array.isArray(window.DCO.AGENCY_FILTERS) ? window.DCO.AGENCY_FILTERS : ['all'];
    /* Ordered by the label the READER sees, not by the stored string. Sorted on the
       qualified name, half the set sorts under its department and the visible order
       reads as no order at all. */
    const ordered = list.filter((a) => a !== 'all').sort((x, y) => agencyShort(x).localeCompare(agencyShort(y)));
    const head = list.indexOf('all') !== -1 ? ['all'] : [];
    fill(host, head.concat(ordered).map((a) => {
      const b = h('button', {
        cls: 'fpill' + (S.agency === a ? ' active' : ''),
        text: a === 'all' ? 'All' : agencyShort(a),
        attrs: { type: 'button', title: a === 'all' ? 'All agencies' : a }
      });
      b.addEventListener('click', () => { S.agency = a; renderAll(); });
      return b;
    }));
  }

  /* ── list ───────────────────────────────────────────────────────────── */

  function emptyBlock(title, detail) {
    return h('div', { cls: 'cop-empty' }, [
      h('div', { cls: 't', text: title }),
      h('div', { cls: 'd', text: detail })
    ]);
  }

  /* The panel opens on the first officer rather than on an instruction: half a page
     telling the reader to click is the page describing itself instead of doing its
     work. The selection follows the filter — an officer who is no longer in the list
     cannot stay selected, so the panel and the list can never disagree. */
  function ensureSelection() {
    const rows = filtered();
    if (!rows.length) { S.sel = null; return; }
    if (!rows.some((o) => o.id === S.sel)) S.sel = rows[0].id;
  }

  function renderPeople() {
    const host = $('pplList');
    if (!host) return;
    ensureSelection();
    const rows = filtered();
    const total = officers().length;
    const m = meta();

    const count = $('pplCount');
    if (count) {
      count.textContent = m.state === 'ready'
        ? (rows.length === total ? total + ' officers' : rows.length + ' of ' + total + ' officers')
        : '';
    }
    const src = $('pplSource');
    if (src) {
      src.textContent = m.state === 'ready' && m.windowDays ? 'SAM.gov · last ' + m.windowDays + ' days' : '';
    }

    if (rows.length === 0) {
      fill(host, [total === 0
        ? emptyBlock('Nothing to list', 'See the note above for why.')
        : emptyBlock('No officer matches this filter', 'Clear the agency filter or the search to see the full list.')]);
      return;
    }

    fill(host, rows.map((o) => {
      const codes = orderedCodes(o);
      const naicsCell = h('div', { cls: 'pt-v mono pt-naics', text: codes[0] || '—' });
      if (codes.length > 1) {
        naicsCell.appendChild(h('span', { cls: 'more', text: '+' + (codes.length - 1) }));
        naicsCell.setAttribute('title', codes.join(' · '));
      }
      const row = h('div', { cls: 'ppl-row' + (S.sel === o.id ? ' sel' : '') }, [
        h('div', { cls: 'ppl-av', text: o.initials }),
        h('div', { cls: 'ppl-info' }, [
          h('div', { cls: 'ppl-name', text: o.name }),
          h('div', { cls: 'ppl-sub', text: o.office || o.email, attrs: { title: o.office || o.email } })
        ]),
        h('div', { cls: 'ppl-touch' }, [h('div', { cls: 'pt-v pt-agy', text: agencyShort(o.agency) || '—' })]),
        h('div', { cls: 'ppl-touch' }, [naicsCell]),
        h('div', { cls: 'ppl-touch' }, [
          h('div', { cls: 'pt-v', text: fmtDateShort(o.latestPosted) })
        ]),
        h('div', { cls: 'ppl-awd', text: o.noticeCount }, [h('small', { text: 'NOTICES' })])
      ]);
      row.addEventListener('click', () => { S.sel = o.id; renderPeople(); renderPanel(); });
      return row;
    }));
  }

  /* ── detail panel ───────────────────────────────────────────────────── */

  /* Each fact is its own element and none of them wraps internally, so a break can only
     ever happen BETWEEN facts. The line used to be one long run with separators as
     text, which is why "closes Aug 20, 2026" split across two lines. Fixing the count
     of rows would not have fixed that — a notice carries three facts or two. */
  function noticeRow(n) {
    const label = n.solicitation_number || n.notice_id;
    const meta = h('div', { cls: 'nt-meta' });
    if (n.ui_link) {
      meta.appendChild(h('a', { text: label, attrs: { href: n.ui_link, target: '_blank', rel: 'noopener noreferrer' } }));
    } else {
      meta.appendChild(h('span', { text: String(label || '') }));
    }
    if (n.naics_code) meta.appendChild(h('span', { text: n.naics_code }));
    if (n.set_aside) meta.appendChild(h('span', { text: n.set_aside }));
    meta.appendChild(h('span', { text: 'closes ' + fmtDate(n.response_deadline) }));
    return h('div', { cls: 'nt-row' }, [
      h('div', { cls: 'nt-title', text: n.title || 'Untitled notice' }),
      meta
    ]);
  }

  function noteBlock(label, body) {
    return h('div', { cls: 'cop-note' }, [h('b', { text: label }), body]);
  }

  function renderPanel() {
    const host = $('coPanel');
    if (!host) return;
    const list = filtered();
    const o = officers().find((x) => x.id === S.sel) || null;

    if (!o) {
      fill(host, [list.length
        ? emptyBlock('Select an officer', 'Pick a name to see their contact details and every notice they posted in your codes.')
        : emptyBlock('No officer selected', 'There is no one to select yet.')]);
      return;
    }

    const naicsChips = h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:2px' },
      orderedCodes(o).map((c) => h('span', { cls: 'fpill', text: c })));

  /* SAM publishes this field unvalidated and the feed is not all domestic: the
     overseas Navy commands carry Japanese and Italian numbers in six different
     shapes, one record holds two numbers in one field, and one is ten zeros.
     A number is reshaped only into the format of the country it belongs to, and
     the country is corroborated by the officer's own office — never inferred
     from the digits alone. Anything that does not resolve is shown exactly as
     published. */
  const JP_OFFICE = /YOKOSUKA|SASEBO|ATSUGI|OKINAWA|IWAKUNI|MISAWA|JAPAN/i;
  const IT_OFFICE = /NAPLES|SIGONELLA|GAETA|ITALY/i;

  /* Area code to state, for the codes this feed actually carries. A code that is
     not in the table is not labelled with a place — 392 appears twice and is not
     an assigned NANP code, and naming a state for it would invent a fact. */
  const US_AREA = {
    '202': 'District of Columbia', '206': 'Washington', '301': 'Maryland', '315': 'New York',
    '360': 'Washington', '385': 'Utah', '401': 'Rhode Island', '405': 'Oklahoma',
    '410': 'Maryland', '415': 'California', '445': 'Pennsylvania', '504': 'Louisiana',
    '510': 'California', '518': 'New York', '564': 'Washington', '571': 'Virginia',
    '573': 'Missouri', '603': 'New Hampshire', '614': 'Ohio', '619': 'California',
    '656': 'Florida', '757': 'Virginia', '801': 'Utah', '808': 'Hawaii',
    '812': 'Indiana', '937': 'Ohio'
  };
  function usPlace(d) {
    const st = US_AREA[d.slice(0, 3)];
    return st ? st + ' \u00b7 as published by SAM'
              : 'area code not recognised \u00b7 as published by SAM';
  }

  function isNanp(d) {
    return d.length === 10 && d[0] !== '0' && d[0] !== '1' && d[3] !== '0' && d[3] !== '1';
  }
  function nanp(d) {
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  /* Japan: nine significant digits behind the trunk zero. The two area codes in
     this feed are Yokosuka 46 and Sasebo 956; any other length is left alone
     rather than split at a guessed boundary. */
  function jp(nat) {
    if (nat.length !== 9) return null;
    if (nat.slice(0, 2) === '46') return '+81 46-' + nat.slice(2, 5) + '-' + nat.slice(5);
    if (nat.slice(0, 3) === '956') return '+81 956-' + nat.slice(3, 5) + '-' + nat.slice(5);
    return '+81 ' + nat;
  }
  /* Italy keeps its leading zero in the national number. */
  function it(nat) {
    if (nat.slice(0, 3) === '081' && nat.length === 10) {
      return '+39 081 ' + nat.slice(3, 6) + '-' + nat.slice(6);
    }
    return '+39 ' + nat;
  }

  function phoneParts(raw, office) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    if (/[a-z]/i.test(s)) return { text: s, note: 'as published by SAM' };
    const d = s.replace(/[^0-9]/g, '');
    if (!d || /^0+$/.test(d)) return null;
    const o = String(office || '');

    if (isNanp(d)) return { text: nanp(d), note: usPlace(d) };

    if (d.length === 20 && isNanp(d.slice(0, 10)) && isNanp(d.slice(10))) {
      return { text: nanp(d.slice(0, 10)) + '  ·  ' + nanp(d.slice(10)),
               note: US_AREA[d.slice(0, 3)] ? US_AREA[d.slice(0, 3)] + ' \u00b7 SAM published two numbers in this field' : 'SAM published two numbers in this field' };
    }

    const intl = d.replace(/^(?:011|00)/, '');
    if (JP_OFFICE.test(o)) {
      const nat = intl.slice(0, 2) === '81' ? intl.slice(2) : (d[0] === '0' ? d.slice(1) : null);
      const f = nat ? jp(nat) : null;
      if (f) return { text: f, note: 'Japan \u00b7 as published by SAM' };
      if (d.length === 7) return { text: d, note: 'DSN extension \u00b7 as published by SAM' };
      return { text: s, note: 'overseas · shown as SAM published it' };
    }
    if (IT_OFFICE.test(o)) {
      const nat = intl.slice(0, 2) === '39' ? intl.slice(2) : null;
      const f = nat ? it(nat) : null;
      if (f) return { text: f, note: 'Italy \u00b7 as published by SAM' };
      return { text: s, note: 'overseas · shown as SAM published it' };
    }
    return { text: s, note: 'shown as SAM published it' };
  }

    const noticeList = h('div', { style: 'max-height:260px;overflow-y:auto' },
      (o.notices || []).map(noticeRow));

    const ph = phoneParts(o.phone, o.office);
    /* The note belongs to the NUMBER, so it lives in the number's column rather
       than under the whole row — centred across both buttons it read as a
       caption for the email too. */
    /* THE NUMBER COPIES RATHER THAN DIALS. A desktop browser has nothing to dial
       with, so a tel: link raises an operating-system handler prompt instead of
       doing anything useful. The shared control in phone-copy.js owns what
       happens on click, and the recompete record emits the same markup, so one
       number behaves the same way whichever surface a reader found it on.
       data-phone carries the diallable value; the label keeps its formatting and
       the title keeps the string exactly as SAM published it. */
    const phoneCtl = ph
      ? h('button', {
          cls: 'cop-btn ghost ph-copy',
          text: ph.text,
          attrs: { type: 'button',
                   'data-phone': String(o.phone).replace(/[^0-9+]/g, ''),
                   title: 'Click to copy · as published by SAM: ' + String(o.phone) }
        })
      : h('span', { cls: 'cop-btn ghost', text: 'No phone published', style: 'cursor:default;opacity:.7' });
    const phoneCol = h('div', { cls: 'cop-phcol' }, [
      phoneCtl,
      ph && ph.note ? h('p', { cls: 'cop-phnote', text: ph.note }) : null
    ]);
    const actions = h('div', { cls: 'cop-actions' }, [
      h('a', { cls: 'cop-btn primary', text: 'Email', attrs: { href: 'mailto:' + o.email } }),
      phoneCol
    ]);

    fill(host, [
      h('div', { cls: 'cop-head' }, [
        h('div', { cls: 'cop-av', text: o.initials }),
        h('div', { cls: 'cop-id' }, [
          h('div', { cls: 'cop-name', text: o.name }),
          h('div', { cls: 'cop-title', text: o.contactType ? o.contactType + ' contact on SAM' : 'Point of contact on SAM' }),
          o.agency ? h('div', { cls: 'cop-agy', text: o.agency }) : null
        ])
      ]),
      noteBlock('Office', h('span', { text: o.office || 'Not published on the notice' })),
      noteBlock('Address', h('span', { cls: 'mono', text: o.email })),
      (o.naics || []).length ? noteBlock('Codes they posted in', naicsChips) : null,
      noteBlock(o.noticeCount + ' notice' + (o.noticeCount === 1 ? '' : 's') + ' in your feed', noticeList),
      actions
    ]);
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function renderAll() {
    shortNames = null;
    // The incoming agency can only be resolved once the feed has told us which
    // agencies exist. render() is called again when the live data lands, so this
    // runs then — and applies at most once.
    if (!agencyApplied && Array.isArray(window.DCO.AGENCY_FILTERS) && window.DCO.AGENCY_FILTERS.length > 1) {
      applyRequestedAgency();
      agencyApplied = true;
    }
    renderBanner();
    renderAgencyNotice();
    renderStats();
    renderAgencyPills();
    renderPeople();
    renderPanel();
  }

  /* Names the outcome for an agency arriving in the URL: a request that matches
     nothing and no request at all are different states. */
  function renderAgencyNotice() {
    const host = $('agencyFilters');
    if (!host || !askedAgency) return;
    const resolved = resolveAgency(askedAgency);
    const note = h('span', {
      cls: 'fpill-note',
      style: 'font-family:"IBM Plex Mono",monospace;font-size:10px;color:var(--mute);margin-left:8px',
      text: resolved
        ? 'from Defense News · ' + askedAgency
        : 'No officers in your feed are from ' + askedAgency + ' — showing all'
    });
    host.appendChild(note);
  }

  function buildControls() {
    const search = $('searchInput');
    if (search) search.addEventListener('input', (e) => { S.q = e.target.value; renderPeople(); renderPanel(); });
    const reset = $('resetBtn');
    if (reset) {
      reset.addEventListener('click', () => {
        S.agency = 'all';
        S.q = '';
        S.sel = null;
        askedAgency = null;
        agencyApplied = true;
        if (search) search.value = '';
        renderAll();
      });
    }
  }

  function init() {
    buildControls();
    renderAll();
  }

  window.DCO_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
