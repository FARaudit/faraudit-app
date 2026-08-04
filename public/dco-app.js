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

  function avColor(seed) {
    let n = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    const hues = [212, 199, 258, 172, 28, 340];
    const hue = hues[n % hues.length];
    return 'background:linear-gradient(155deg,hsl(' + hue + ',62%,52%),hsl(' + hue + ',68%,34%))';
  }

  function officers() {
    return Array.isArray(window.DCO && window.DCO.OFFICERS) ? window.DCO.OFFICERS : [];
  }

  function meta() {
    return (window.DCO && window.DCO.meta) || { state: 'loading' };
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
    fill(host, list.map((a) => {
      const b = h('button', {
        cls: 'fpill' + (S.agency === a ? ' active' : ''),
        text: a === 'all' ? 'All' : a,
        attrs: { type: 'button' }
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

  function renderPeople() {
    const host = $('pplList');
    if (!host) return;
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
      const naics = (o.naics || []).join(' · ');
      const row = h('div', { cls: 'ppl-row' + (S.sel === o.id ? ' sel' : '') }, [
        h('div', { cls: 'ppl-av', text: o.initials, style: avColor(o.email || o.id) }),
        h('div', { cls: 'ppl-info' }, [
          h('div', { cls: 'ppl-name', text: o.name }),
          h('div', { cls: 'ppl-sub', text: o.office || o.email })
        ]),
        h('div', { cls: 'ppl-touch' }, [h('div', { cls: 'pt-v', text: o.agency || '—' })]),
        h('div', { cls: 'ppl-touch' }, [h('div', { cls: 'pt-v mono', text: naics || '—' })]),
        h('div', { cls: 'ppl-touch' }, [
          h('div', { cls: 'pt-v', text: fmtDate(o.latestPosted) }),
          h('div', { cls: 'pt-l', text: 'POSTED', style: 'color:var(--mute)' })
        ]),
        h('div', { cls: 'ppl-awd', text: o.noticeCount }, [h('small', { text: 'NOTICES' })])
      ]);
      row.addEventListener('click', () => { S.sel = o.id; renderPeople(); renderPanel(); });
      return row;
    }));
  }

  /* ── detail panel ───────────────────────────────────────────────────── */

  function noticeRow(n) {
    const label = n.solicitation_number || n.notice_id;
    const bits = [
      n.naics_code ? ' · ' + n.naics_code : '',
      n.set_aside ? ' · ' + n.set_aside : '',
      ' · closes ' + fmtDate(n.response_deadline)
    ].join('');
    const line = h('div', { cls: 'mono', style: 'font-size:10.5px;color:var(--mute);margin-top:4px' });
    if (n.ui_link) {
      line.appendChild(h('a', { text: label, attrs: { href: n.ui_link, target: '_blank', rel: 'noopener noreferrer' } }));
    } else {
      line.appendChild(document.createTextNode(String(label || '')));
    }
    line.appendChild(document.createTextNode(bits));
    return h('div', { style: 'padding:10px 0;border-bottom:1px solid var(--line-3)' }, [
      h('div', { text: n.title || 'Untitled notice', style: 'font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.35' }),
      line
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
      (o.naics || []).map((c) => h('span', { cls: 'fpill', text: c })));

    const noticeList = h('div', { style: 'max-height:260px;overflow-y:auto' },
      (o.notices || []).map(noticeRow));

    const actions = h('div', { cls: 'cop-actions' }, [
      h('a', { cls: 'cop-btn primary', text: 'Email', attrs: { href: 'mailto:' + o.email } }),
      o.phone
        ? h('a', { cls: 'cop-btn ghost', text: o.phone, attrs: { href: 'tel:' + String(o.phone).replace(/[^0-9+]/g, '') } })
        : h('span', { cls: 'cop-btn ghost', text: 'No phone published', style: 'cursor:default;opacity:.7' })
    ]);

    fill(host, [
      h('div', { cls: 'cop-head' }, [
        h('div', { cls: 'cop-av', text: o.initials, style: avColor(o.email || o.id) }),
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
    renderBanner();
    renderStats();
    renderAgencyPills();
    renderPeople();
    renderPanel();
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
