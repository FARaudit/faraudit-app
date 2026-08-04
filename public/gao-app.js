/* FARaudit · GAO Protests — render layer.

   Renders window.GAO, which gao-protests-live.js fills from /api/protest-intel.
   Every row is a decision GAO published: docket, decision date, agency,
   protester, ground and outcome, with the link back to GAO's own page. The
   per-agency panel is a count over exactly those rows.

   What must never appear here: sustain ODDS by protest ground, risk signals,
   protest values in dollars, or a days-to-decision figure. None of those is
   carried in GAO's feed, so none can be rendered.

   Values reach the page as text nodes built through h(); this file never
   assigns markup. */
(function () {
  'use strict';

  const S = { outcome: 'all', agency: 'all', q: '', sel: null };
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
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const meta = () => (window.GAO && window.GAO.meta) || { state: 'loading' };
  const decisions = () => (window.GAO && Array.isArray(window.GAO.DECISIONS) ? window.GAO.DECISIONS : []);
  const agencies = () => (window.GAO && Array.isArray(window.GAO.AGENCIES) ? window.GAO.AGENCIES : []);

  const OUTCOMES = ['sustained', 'denied', 'dismissed', 'withdrawn'];

  function filtered() {
    const q = S.q.trim().toLowerCase();
    return decisions().filter((d) => {
      if (S.outcome !== 'all' && d.outcome !== S.outcome) return false;
      if (S.agency !== 'all' && d.agency !== S.agency) return false;
      if (!q) return true;
      return [d.docket, d.protester, d.agency, d.ground, d.solicitation]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }

  /* ── state banner ───────────────────────────────────────────────────── */

  function renderBanner() {
    const el = $('stateBanner');
    if (!el) return;
    const m = meta();
    el.classList.remove('is-error');

    if (m.state === 'loading') {
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Loading' }),
        h('span', { text: 'Reading GAO’s published bid-protest decisions…' })
      ]);
      return;
    }
    if (m.state === 'error') {
      el.hidden = false;
      el.classList.add('is-error');
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Unavailable' }),
        h('span', { text: 'The protest feed did not answer, so this page has nothing to show. It is not an empty docket — reload to try again.' }),
        m.detail ? h('b', { text: m.detail }) : null
      ]);
      return;
    }
    if (m.state === 'empty') {
      el.hidden = false;
      if (m.reason === 'upstream-blocked' || m.reason === 'upstream-error') {
        el.classList.add('is-error');
        fill(el, [
          h('span', { cls: 'sb-label', text: 'Source refused' }),
          h('span', { text: 'GAO did not serve its decision feed to this request' + (m.upstreamStatus ? ' (HTTP ' + m.upstreamStatus + ')' : '') + ', so no decisions can be listed. Nothing is shown rather than showing dockets that were never published.' })
        ]);
      } else {
        fill(el, [
          h('span', { cls: 'sb-label', text: 'No decisions' }),
          h('span', { text: 'GAO answered and its current feed carries no decisions.' })
        ]);
      }
      return;
    }
    el.hidden = true;
    fill(el, []);
  }

  /* ── header + outcome counts ────────────────────────────────────────── */

  function outcomeCounts() {
    const counts = { sustained: 0, denied: 0, dismissed: 0, withdrawn: 0, unclassified: 0 };
    for (const d of decisions()) {
      if (d.outcome && counts[d.outcome] !== undefined) counts[d.outcome]++;
      else counts.unclassified++;
    }
    return counts;
  }

  function renderStats() {
    const m = meta();
    const list = decisions();
    const ready = m.state === 'ready' || m.state === 'empty';
    const counts = outcomeCounts();
    const put = (id, v) => { const el = $(id); if (el) el.textContent = ready ? String(v) : '—'; };
    put('hsFiled', list.length);
    put('hsSustained', counts.sustained);
    put('hsAgencies', agencies().length);
    const pill = $('livePill');
    if (pill) pill.hidden = m.state !== 'ready';
  }

  function renderCounts() {
    const host = $('kpiStrip');
    if (!host) return;
    const m = meta();
    const shown = m.state === 'ready';
    const counts = outcomeCounts();
    const cells = [
      { k: 'sustained', label: 'Sustained' },
      { k: 'denied', label: 'Denied' },
      { k: 'dismissed', label: 'Dismissed' },
      { k: 'withdrawn', label: 'Withdrawn' }
    ];
    fill(host, cells.map((c) => h('div', { cls: 'kpi' }, [
      h('p', { cls: 'lbl', text: c.label }),
      h('div', { cls: 'kpi-val', text: shown ? String(counts[c.k]) : '—' }, [
        h('span', { cls: 'unit', text: 'decisions' })
      ]),
      h('div', { cls: 'foot', text: shown ? 'in the ' + decisions().length + ' GAO published' : 'awaiting the feed' })
    ])));
  }

  function renderFilters() {
    const outHost = $('statusFilters');
    if (outHost) {
      const counts = outcomeCounts();
      const opts = [{ k: 'all', label: 'All' }].concat(
        OUTCOMES.filter((o) => counts[o] > 0).map((o) => ({ k: o, label: o.charAt(0).toUpperCase() + o.slice(1) }))
      );
      fill(outHost, opts.map((o) => {
        const b = h('button', { cls: 'fpill' + (S.outcome === o.k ? ' active' : ''), text: o.label, attrs: { type: 'button' } });
        b.addEventListener('click', () => { S.outcome = o.k; renderList(); renderPanel(); renderFilters(); });
        return b;
      }));
    }
    const agHost = $('agencyFilters');
    if (agHost) {
      const names = agencies().map((a) => a.agency).filter(Boolean);
      const opts = [{ k: 'all', label: 'All agencies' }].concat(names.slice(0, 12).map((n) => ({ k: n, label: n })));
      fill(agHost, opts.map((o) => {
        const b = h('button', { cls: 'fpill' + (S.agency === o.k ? ' active' : ''), text: o.label, attrs: { type: 'button' } });
        b.addEventListener('click', () => { S.agency = o.k; renderList(); renderPanel(); renderFilters(); });
        return b;
      }));
    }
  }

  /* ── list ───────────────────────────────────────────────────────────── */

  function emptyBlock(title, detail) {
    return h('div', { cls: 'cop-empty' }, [
      h('div', { cls: 't', text: title }),
      h('div', { cls: 'd', text: detail })
    ]);
  }

  function renderList() {
    const host = $('protList');
    if (!host) return;
    const rows = filtered();
    const total = decisions().length;

    const count = $('feedCount');
    if (count) {
      count.textContent = meta().state === 'ready'
        ? (rows.length === total ? total + ' decisions' : rows.length + ' of ' + total + ' decisions')
        : '';
    }

    if (rows.length === 0) {
      fill(host, [total === 0
        ? emptyBlock('Nothing to list', 'See the note above for why.')
        : emptyBlock('No decision matches this filter', 'Clear the outcome or agency filter.')]);
      return;
    }

    fill(host, rows.map((d) => {
      const card = h('div', { cls: 'feed-card' + (S.sel === d.docket ? ' sel' : '') }, [
        h('div', { cls: 'feed-top' }, [
          h('span', { cls: 'feed-clause', text: d.docket || 'no docket' }),
          h('span', { cls: 'feed-date', text: fmtDate(d.decision_date) })
        ]),
        h('div', { cls: 'feed-title', text: d.protester ? d.protester + (d.agency ? ' · ' + d.agency : '') : (d.agency || 'Protest decision') }),
        h('div', { cls: 'feed-summary', text: d.ground || 'Ground not stated in the feed entry' }),
        h('div', { cls: 'feed-insight' }, [
          h('b', { text: 'Outcome' }),
          h('span', { text: d.outcome ? d.outcome : 'not stated in the feed entry' })
        ])
      ]);
      card.addEventListener('click', () => { S.sel = d.docket; renderList(); renderPanel(); });
      return card;
    }));
  }

  /* ── panel: the selected decision, else per-agency counts ───────────── */

  function renderPanel() {
    const host = $('protPanel');
    if (!host) return;
    const d = decisions().find((x) => x.docket === S.sel) || null;

    if (d) {
      fill(host, [
        h('div', { cls: 'cop-head' }, [
          h('div', { cls: 'cop-id' }, [
            h('div', { cls: 'cop-name', text: d.docket || 'Protest decision' }),
            h('div', { cls: 'cop-title', text: 'GAO published ' + fmtDate(d.decision_date) }),
            d.agency ? h('div', { cls: 'cop-agy', text: d.agency }) : null
          ])
        ]),
        h('div', { cls: 'cop-note' }, [h('b', { text: 'Protester' }), h('span', { text: d.protester || 'Not stated in the feed entry' })]),
        h('div', { cls: 'cop-note' }, [h('b', { text: 'Solicitation' }), h('span', { cls: 'mono', text: d.solicitation || 'Not stated in the feed entry' })]),
        h('div', { cls: 'cop-note' }, [h('b', { text: 'Ground' }), h('span', { text: d.ground || 'Not stated in the feed entry' })]),
        h('div', { cls: 'cop-note' }, [h('b', { text: 'Outcome' }), h('span', { text: d.outcome || 'Not stated in the feed entry' })]),
        d.decision_url
          ? h('div', { cls: 'cop-actions' }, [
              h('a', { cls: 'cop-btn primary', text: 'Read it on GAO', attrs: { href: d.decision_url, target: '_blank', rel: 'noopener noreferrer' } })
            ])
          : null
      ]);
      return;
    }

    const ags = agencies();
    if (ags.length === 0) {
      fill(host, [emptyBlock('No agency breakdown', 'It is counted from the decisions above, and there are none.')]);
      return;
    }
    fill(host, [
      h('div', { cls: 'cop-head' }, [
        h('div', { cls: 'cop-id' }, [
          h('div', { cls: 'cop-name', text: 'By agency' }),
          h('div', { cls: 'cop-title', text: 'Counted from the ' + decisions().length + ' decisions listed' })
        ])
      ]),
      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'Decisions per agency' }),
        h('div', { style: 'display:flex;flex-direction:column;gap:7px;margin-top:3px' },
          ags.slice(0, 12).map((a) => h('div', { style: 'display:flex;justify-content:space-between;gap:12px' }, [
            h('span', { text: a.agency, style: 'font-size:12px;color:var(--ink-2)' }),
            h('span', { cls: 'mono', text: a.sustained + ' of ' + a.total + ' sustained', style: 'font-size:11.5px;color:var(--mute)' })
          ])))
      ])
    ]);
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function renderAll() {
    renderBanner();
    renderStats();
    renderCounts();
    renderFilters();
    renderList();
    renderPanel();
  }

  function buildControls() {
    const search = $('searchInput');
    if (search) search.addEventListener('input', (e) => { S.q = e.target.value; renderList(); renderPanel(); });
    const reset = $('resetBtn');
    if (reset) {
      reset.addEventListener('click', () => {
        S.outcome = 'all'; S.agency = 'all'; S.q = ''; S.sel = null;
        if (search) search.value = '';
        renderAll();
      });
    }
  }

  function init() { buildControls(); renderAll(); }

  window.GAO_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
