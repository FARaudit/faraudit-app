/* FARaudit · Teaming Partners — render layer.

   Renders window.TEAM, which teaming-partners-live.js fills from
   /api/teaming-partners. Every field on this page is a SAM registration fact:
   legal name, UEI, CAGE, state, primary NAICS, SBA business types, the
   registration's expiry, and the government business point of contact.

   What is NOT here, and must not return: a fit score, a complementarity score,
   past-performance dollars, an agency-overlap claim, or a written "insight"
   about why to team with someone. None of those has a writer — the product
   holds no past-performance data and no relationship between these entities
   and this customer.

   The one derived number the page shows is a COUNT of the certifications
   present in the pool it just listed, which is arithmetic over what is on
   screen rather than a claim about the market.

   Values reach the page as text nodes built through h(); this file never
   assigns markup. */
(function () {
  'use strict';

  const S = { naics: 'all', cert: 'all', q: '', sel: null };
  const $ = (id) => document.getElementById(id);

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

  function fmtDate(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    // Registration and certification expiry arrive as calendar dates, not instants. A
    // date-only string parses as UTC midnight, so formatting it in local time lands on the
    // previous day for any viewer west of UTC. A date with no time of day has no timezone to
    // convert, so it is formatted in UTC.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim());
    return new Date(t).toLocaleDateString('en-US',
      dateOnly ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
               : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const meta = () => (window.TEAM && window.TEAM.meta) || { state: 'loading' };
  const partners = () => (window.TEAM && Array.isArray(window.TEAM.PARTNERS) ? window.TEAM.PARTNERS : []);
  const scope = () => (window.TEAM && window.TEAM.SCOPE) || { codes: [], source: null };

  function certsOf(p) {
    return Array.isArray(p.certifications) ? p.certifications : [];
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    return partners().filter((p) => {
      if (S.cert !== 'all' && !certsOf(p).some((c) => c === S.cert)) return false;
      if (!q) return true;
      return [p.legal_business_name, p.uei, p.cage_code, p.state, p.poc_name]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }

  /* ── state banner ───────────────────────────────────────────────────── */

  const EMPTY_COPY = {
    'no-profile-codes': {
      label: 'No codes on file',
      body: 'Partners are matched on your NAICS codes, and none are on file yet. Add them on the Capability Statement page.',
      link: { href: '/capability-statement', text: 'Capability Statement' }
    },
    'sam-key-missing': {
      label: 'Partner search unavailable',
      body: 'The SAM entity search is not configured on the server, so no partner list could be requested. This is a configuration fault, not an empty market.'
    },
    'no-partners': {
      label: 'No registered entities',
      body: 'SAM answered and returned no active registrations under your primary codes.'
    },
    'no-match': {
      label: 'No entity matches this filter',
      body: 'SAM answered, but nothing matched the set-aside or state you asked for. Clear the filter to see the full list.'
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
        h('span', { text: 'Asking SAM for active registrations under your codes…' })
      ]);
      return;
    }
    if (m.state === 'error') {
      el.hidden = false;
      el.classList.add('is-error');
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Unavailable' }),
        h('span', { text: 'The partner search did not answer, so this page has nothing to show. It is not an empty market — reload to try again.' }),
        m.detail ? h('b', { text: m.detail }) : null
      ]);
      return;
    }
    if (m.state === 'empty') {
      const copy = EMPTY_COPY[m.reason] || EMPTY_COPY['no-partners'];
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: copy.label }),
        h('span', { text: copy.body }),
        copy.link ? h('a', { text: copy.link.text, attrs: { href: copy.link.href } }) : null
      ]);
      return;
    }
    // Ready — but SAM's entity search serves one page and rejects pageSize, so what arrived
    // is usually a small sample of what is registered. The count carries its caveat in
    // place: a list of ten drawn from thousands must not read as the whole market.
    if (typeof m.totalAvailable === 'number' && typeof m.shown === 'number' && m.totalAvailable > m.shown) {
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Partial list' }),
        h('span', { text: 'SAM holds ' + m.totalAvailable.toLocaleString() + ' active registrations under your codes. This page shows the ' + m.shown + ' it returns per request — narrow by NAICS to see a different set.' })
      ]);
      return;
    }
    el.hidden = true;
    fill(el, []);
  }

  /* ── header + controls ──────────────────────────────────────────────── */

  function certCounts() {
    const counts = {};
    for (const p of partners()) for (const c of certsOf(p)) counts[c] = (counts[c] || 0) + 1;
    return counts;
  }

  function renderStats() {
    const m = meta();
    const list = partners();
    const ready = m.state === 'ready' || m.state === 'empty';
    const put = (id, v) => { const el = $(id); if (el) el.textContent = ready ? String(v) : '—'; };
    put('hsTotal', list.length);
    put('hsCerts', Object.keys(certCounts()).length);
    put('hsCodes', (scope().codes || []).length);
    const pill = $('livePill');
    if (pill) pill.hidden = m.state !== 'ready';
  }

  function renderNaicsPills() {
    const host = $('naicsFilters');
    if (!host) return;
    const codes = scope().codes || [];
    const opts = [{ k: 'all', label: 'All codes' }].concat(codes.map((c) => ({ k: c, label: c })));
    fill(host, opts.map((o) => {
      const b = h('button', { cls: 'fpill' + (S.naics === o.k ? ' active' : ''), text: o.label, attrs: { type: 'button' } });
      b.addEventListener('click', () => { S.naics = o.k; reload(); });
      return b;
    }));
  }

  function renderCertPills() {
    const host = $('certFilters');
    if (!host) return;
    const counts = certCounts();
    const keys = Object.keys(counts).sort();
    const opts = [{ k: 'all', label: 'All certifications' }].concat(keys.map((k) => ({ k, label: k + ' · ' + counts[k] })));
    fill(host, opts.map((o) => {
      const b = h('button', { cls: 'fpill' + (S.cert === o.k ? ' active' : ''), text: o.label, attrs: { type: 'button' } });
      b.addEventListener('click', () => { S.cert = o.k; renderList(); renderPanel(); renderCertPills(); });
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

  function keyOf(p) {
    return String(p.uei || p.cage_code || p.legal_business_name || '');
  }

  function renderList() {
    const host = $('partnerList');
    if (!host) return;
    const rows = filtered();
    const total = partners().length;

    const count = $('pplCount');
    if (count) {
      count.textContent = meta().state === 'ready'
        ? (rows.length === total ? total + ' registered entities' : rows.length + ' of ' + total + ' registered entities')
        : '';
    }

    if (rows.length === 0) {
      fill(host, [total === 0
        ? emptyBlock('Nothing to list', 'See the note above for why.')
        : emptyBlock('No entity matches this filter', 'Clear the certification filter or the search.')]);
      return;
    }

    fill(host, rows.map((p) => {
      const certs = certsOf(p);
      const row = h('div', { cls: 'team-row' + (S.sel === keyOf(p) ? ' sel' : '') }, [
        h('div', { cls: 'tr-name' }, [
          h('div', { cls: 'tr-legal', text: p.legal_business_name || '(no legal name on file)' }),
          h('div', { cls: 'tr-uei mono', text: p.uei ? 'UEI ' + p.uei : (p.cage_code ? 'CAGE ' + p.cage_code : '—') })
        ]),
        h('div', { cls: 'tr-state', text: p.state || '—' }),
        h('div', { cls: 'tr-naics mono', text: p.primary_naics || '—' }),
        h('div', { cls: 'tr-certs' }, certs.length
          ? certs.slice(0, 3).map((c) => h('span', { cls: 'fpill', text: c }))
          : [h('span', { cls: 'tr-none', text: 'none registered' })])
      ]);
      row.addEventListener('click', () => { S.sel = keyOf(p); renderList(); renderPanel(); });
      return row;
    }));
  }

  /* ── detail panel ───────────────────────────────────────────────────── */

  function renderPanel() {
    const host = $('partnerPanel');
    if (!host) return;
    const rows = filtered();
    const p = partners().find((x) => keyOf(x) === S.sel) || null;

    if (!p) {
      fill(host, [rows.length
        ? emptyBlock('Select an entity', 'Pick a registration to see its identifiers, certifications and point of contact.')
        : emptyBlock('Nothing selected', 'There is no entity to select yet.')]);
      return;
    }

    const certs = certsOf(p);
    const sba = Array.isArray(p.sba_certifications) ? p.sba_certifications : [];

    const certBlock = certs.length
      ? h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:2px' },
          sba.length
            ? sba.map((c) => h('div', { style: 'font-size:12px;color:var(--ink-2)' }, [
                h('span', { text: c.description }),
                c.certifiedUntil ? h('span', { cls: 'mono', text: ' · until ' + fmtDate(c.certifiedUntil), style: 'color:var(--mute)' }) : null
              ]))
            : certs.map((c) => h('div', { text: c, style: 'font-size:12px;color:var(--ink-2)' })))
      : h('span', { text: 'No SBA business type is registered for this entity.' });

    const poc = p.poc_name || p.poc_email || p.poc_phone
      ? h('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-top:2px' }, [
          p.poc_name ? h('div', { text: p.poc_name, style: 'font-size:12.5px;font-weight:700;color:var(--ink)' }) : null,
          p.poc_email ? h('a', { cls: 'mono', text: p.poc_email, attrs: { href: 'mailto:' + p.poc_email }, style: 'font-size:11px' }) : null,
          p.poc_phone ? h('div', { cls: 'mono', text: p.poc_phone, style: 'font-size:11px;color:var(--mute)' }) : null
        ])
      : h('span', { text: 'SAM publishes no government business point of contact for this registration.' });

    fill(host, [
      h('div', { cls: 'cop-head' }, [
        h('div', { cls: 'cop-id' }, [
          h('div', { cls: 'cop-name', text: p.legal_business_name || '(no legal name on file)' }),
          h('div', { cls: 'cop-title', text: 'Active SAM registration' }),
          p.primary_naics ? h('div', { cls: 'cop-agy', text: 'Primary NAICS ' + p.primary_naics }) : null
        ])
      ]),
      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'Identifiers' }),
        h('span', { cls: 'mono', text: [p.uei ? 'UEI ' + p.uei : null, p.cage_code ? 'CAGE ' + p.cage_code : null].filter(Boolean).join(' · ') || '—' })
      ]),
      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'Location' }),
        h('span', { text: [p.state, p.zip].filter(Boolean).join(' ') || 'Not published' })
      ]),
      h('div', { cls: 'cop-note' }, [h('b', { text: 'SBA certifications' }), certBlock]),
      h('div', { cls: 'cop-note' }, [h('b', { text: 'Government business contact' }), poc]),
      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'Registration expires' }),
        h('span', { cls: 'mono', text: fmtDate(p.registration_expiration) })
      ]),
      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'What this is not' }),
        h('span', { text: 'A registration match on NAICS. It is not a past-performance record, a capability assessment, or evidence that this company would team with you.' })
      ])
    ]);
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function renderAll() {
    renderBanner();
    renderStats();
    renderNaicsPills();
    renderCertPills();
    renderList();
    renderPanel();
  }

  function reload() {
    if (typeof window.TEAM_LOAD !== 'function') return;
    window.TEAM.meta = Object.assign({}, meta(), { state: 'loading' });
    renderBanner();
    window.TEAM_LOAD({ naics: S.naics === 'all' ? null : S.naics });
  }

  function buildControls() {
    const search = $('searchInput');
    if (search) search.addEventListener('input', (e) => { S.q = e.target.value; renderList(); renderPanel(); });
    const reset = $('resetBtn');
    if (reset) {
      reset.addEventListener('click', () => {
        S.naics = 'all'; S.cert = 'all'; S.q = ''; S.sel = null;
        if (search) search.value = '';
        reload();
      });
    }
  }

  function init() { buildControls(); renderAll(); }

  window.TEAM_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
