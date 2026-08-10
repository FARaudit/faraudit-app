/* FARaudit · CMMC Readiness — render layer.

   Renders window.CMMC, which cmmc-readiness-live.js fills from
   /api/cmmc-readiness. Two kinds of fact appear on this page and they are
   never mixed:

     1. What the customer's OWN audited solicitations require — counts, the
        solicitations themselves, and the token in each one that triggered the
        level. Every one of these traces to an audit row.
     2. The DoD CMMC 2.0 model as reference — practice counts, triggering
        clauses, and what each level asks for.

   What is NOT here, and must not return: a readiness score, an open-controls
   count, a domain-by-domain posture, a certification timeline. The product
   holds no self-assessment, so it can say what a solicitation demands and
   nothing about whether this company meets it.

   Values reach the page as text nodes built through h(); this file never
   assigns markup. */
(function () {
  'use strict';

  const S = { level: 'all', q: '', sel: null };
  const $ = (id) => document.getElementById(id);
  const LEVELS = ['1', '2', '3'];

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

  /* WHETHER IT CAN STILL BE BID. SAM's own closing date, and the state that follows from
     it — a Level 2 obligation on a solicitation that closed last month is history, not a
     task, and the page could not tell the two apart. Null prints nothing: a missing
     deadline is not an open one. */
  function deadlineState(iso) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const days = Math.ceil((t - Date.now()) / 86400000);
    if (days < 0) return { cls: 'is-closed', text: 'Closed ' + fmtDate(iso) };
    if (days === 0) return { cls: 'is-due', text: 'Closes today' };
    if (days <= 14) return { cls: 'is-due', text: 'Closes ' + fmtDate(iso) + ' · ' + days + (days === 1 ? ' day' : ' days') };
    return { cls: '', text: 'Closes ' + fmtDate(iso) };
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const meta = () => (window.CMMC && window.CMMC.meta) || { state: 'loading' };
  const dist = () => (window.CMMC && window.CMMC.DISTRIBUTION) || { '0': 0, '1': 0, '2': 0, '3': 0 };
  const byLevel = () => (window.CMMC && window.CMMC.BY_LEVEL) || { '1': [], '2': [], '3': [] };
  const reference = () => (window.CMMC && window.CMMC.REFERENCE) || {};

  function allFlagged() {
    const b = byLevel();
    return LEVELS.flatMap((lv) => (b[lv] || []).map((r) => Object.assign({ level: lv }, r)));
  }

  function filtered() {
    const q = S.q.trim().toLowerCase();
    return allFlagged().filter((r) => {
      if (S.level !== 'all' && r.level !== S.level) return false;
      if (!q) return true;
      return [r.solicitation_number, r.title, r.agency, r.matched_on].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }

  /* ── state banner ───────────────────────────────────────────────────── */

  const EMPTY_COPY = {
    'no-audits': {
      label: 'No audits yet',
      body: 'This page reads the solicitations you have audited. Run an audit and any CMMC requirement it carries appears here.'
    },
    'none-flagged': {
      label: 'No CMMC requirement found',
      body: 'None of the solicitations you have audited names a CMMC level, a CUI obligation, or DFARS 252.204-7012/7021. The reference below still shows what each level would demand.'
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
        h('span', { text: 'Reading the CMMC requirements in your audited solicitations…' })
      ]);
      return;
    }
    if (m.state === 'error') {
      el.hidden = false;
      el.classList.add('is-error');
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Unavailable' }),
        h('span', { text: 'Your audits could not be read, so this page has nothing to report. It is not a clean bill of health — reload to try again.' }),
        m.detail ? h('b', { text: m.detail }) : null
      ]);
      return;
    }
    if (m.state === 'empty') {
      const copy = EMPTY_COPY[m.reason] || EMPTY_COPY['none-flagged'];
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: copy.label }),
        h('span', { text: copy.body })
      ]);
      return;
    }
    // Ready — but a count drawn from partly-unanalyzed audits carries its
    // caveat in place, not in a footnote nobody reads.
    if (m.unanalyzed > 0) {
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Note' }),
        h('span', { text: m.unanalyzed + ' of your ' + m.totalAudited + ' audits carry no analysis yet, so they answer neither way and are not counted as clear.' })
      ]);
      return;
    }
    el.hidden = true;
    fill(el, []);
  }

  /* ── header stats + distribution ────────────────────────────────────── */

  function renderStats() {
    const m = meta();
    const d = dist();
    const flagged = d['1'] + d['2'] + d['3'];
    const ready = m.state === 'ready' || m.state === 'empty';
    const put = (id, v) => { const el = $(id); if (el) el.textContent = ready ? String(v) : '—'; };
    put('hsAudited', m.totalAudited || 0);
    put('hsFlagged', flagged);
    const highest = LEVELS.filter((lv) => d[lv] > 0).pop();
    const hi = $('hsHighest');
    if (hi) hi.textContent = ready ? (highest ? 'L' + highest : 'None') : '—';
    const pill = $('livePill');
    if (pill) pill.hidden = m.state !== 'ready';
  }

  function renderDistribution() {
    const host = $('kpiStrip');
    if (!host) return;
    const d = dist();
    const m = meta();
    const shown = m.state === 'ready' || m.state === 'empty';
    // Label and practice count come from the reference the server sent, not from a copy kept
    // here. They were hardcoded, so the same number lived in two places and only one of them was
    // ever updated. The descriptor names what actually puts an audit at the level — Level 3 read
    // "critical programs", which described a trigger the engine no longer uses and never reliably
    // established.
    const ref = (window.CMMC && window.CMMC.REFERENCE) || {};
    const lvl = (k, fallbackLabel, what) => {
      const r = ref[k] || {};
      const n = typeof r.practices === 'number' ? r.practices : null;
      return { k: k, label: r.label || fallbackLabel, foot: what + (n ? ' · ' + n + ' practices' : '') };
    };
    const cells = [
      { k: '0', label: 'No CMMC named', foot: 'nothing in the audit triggers a level' },
      lvl('1', 'Level 1 — Foundational', 'FCI'),
      lvl('2', 'Level 2 — Advanced', 'CUI'),
      lvl('3', 'Level 3 — Expert', 'NIST SP 800-172')
    ];
    fill(host, cells.map((c) => h('div', { cls: 'kpi' }, [
      h('p', { cls: 'lbl', text: c.label }),
      h('div', { cls: 'kpi-val', text: shown ? String(d[c.k] || 0) : '—' }, [
        h('span', { cls: 'unit', text: 'audits' })
      ]),
      h('div', { cls: 'foot', text: c.foot })
    ])));
  }

  function renderLevelPills() {
    const host = $('prioFilters');
    if (!host) return;
    const d = dist();
    // EVERY LEVEL THE MODEL HAS, always. These were filtered to levels that happen to have
    // rows, so Level 1 disappeared from the filter while the strip above it still showed a
    // Level 1 card — two controls describing the same three levels and disagreeing about how
    // many there are. A level with nothing in it is disabled and says so, which is a fact
    // about this customer's audits rather than a gap in the model.
    const opts = [{ k: 'all', label: 'All', n: null }].concat(
      LEVELS.map((lv) => ({ k: lv, label: 'Level ' + lv, n: d[lv] || 0 }))
    );
    fill(host, opts.map((o) => {
      const empty = o.n === 0;
      const b = h('button', {
        cls: 'fpill' + (S.level === o.k ? ' active' : '') + (empty ? ' is-empty' : ''),
        text: o.label,
        attrs: Object.assign({ type: 'button' }, empty ? { disabled: '', title: 'No audit requires Level ' + o.k } : {})
      });
      if (!empty) b.addEventListener('click', () => { S.level = o.k; renderAll(); });
      return b;
    }));
  }

  /* ── the flagged solicitations ──────────────────────────────────────── */

  function emptyBlock(title, detail) {
    return h('div', { cls: 'cop-empty' }, [
      h('div', { cls: 't', text: title }),
      h('div', { cls: 'd', text: detail })
    ]);
  }

  function renderList() {
    const host = $('domList');
    if (!host) return;
    const rows = filtered();
    const total = allFlagged().length;

    const count = $('feedCount');
    if (count) {
      count.textContent = meta().state === 'ready'
        ? (rows.length === total ? total + ' solicitations' : rows.length + ' of ' + total + ' solicitations')
        : '';
    }

    if (rows.length === 0) {
      fill(host, [total === 0
        ? emptyBlock('Nothing flagged', 'See the note above.')
        : emptyBlock('No solicitation matches this filter', 'Clear the level filter or the search.')]);
      return;
    }

    fill(host, rows.map((r) => {
      const card = h('div', { cls: 'feed-card' + (S.sel === r.id ? ' sel' : '') }, [
        h('div', { cls: 'feed-top' }, [
          h('span', { cls: 'feed-clause', text: 'CMMC Level ' + r.level }),
          // LABELLED, because this is the date WE ran the audit — not the solicitation's
          // posted date and not its response deadline. A bare date beside a solicitation
          // number reads as the solicitation's own, and the two lead to opposite actions.
          h('span', { cls: 'feed-date', text: 'Audited ' + fmtDate(r.created_at) })
        ]),
        h('div', { cls: 'feed-title', text: r.title || r.solicitation_number || r.notice_id || 'Untitled solicitation' }),
        h('div', { cls: 'feed-summary', text: [r.solicitation_number, r.agency].filter(Boolean).join(' · ') || '—' }),
        (function () {
          const d = deadlineState(r.response_deadline);
          return d ? h('div', { cls: 'feed-deadline ' + d.cls, text: d.text }) : null;
        })(),
        h('div', { cls: 'feed-insight' }, [
          h('b', { text: 'Matched on' }),
          h('span', { text: r.matched_on || 'not recorded' })
        ])
      ]);
      card.addEventListener('click', () => { S.sel = r.id; renderList(); renderPanel(); });
      return card;
    }));
  }

  /* ── reference panel ────────────────────────────────────────────────── */

  function renderPanel() {
    const host = $('readyPanel');
    if (!host) return;
    const rows = allFlagged();
    const sel = rows.find((r) => r.id === S.sel) || null;
    const ref = reference();
    const d = dist();
    // With nothing selected, show the highest level the customer's own
    // solicitations actually demand; fall back to Level 2, the one most
    // contractors are asked for, purely as reference.
    const level = sel ? sel.level : (LEVELS.filter((lv) => d[lv] > 0).pop() || '2');
    const data = ref[level];

    if (!data) {
      fill(host, [emptyBlock('Reference unavailable', 'The CMMC level reference did not load.')]);
      return;
    }

    const checklist = h('div', { style: 'display:flex;flex-direction:column;gap:7px;margin-top:4px' },
      (data.checklist || []).map((c) => h('div', {
        text: '· ' + c,
        style: 'font-size:12px;color:var(--ink-2);line-height:1.5'
      })));

    const triggers = h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:2px' },
      (data.triggers || []).map((t) => h('span', { cls: 'fpill', text: t })));

    fill(host, [
      h('div', { cls: 'cop-head' }, [
        h('div', { cls: 'cop-id' }, [
          h('div', { cls: 'cop-name', text: data.label || 'CMMC Level ' + level }),
          h('div', { cls: 'cop-title', text: 'DoD CMMC 2.0 model · reference, not your assessment' }),
          h('div', { cls: 'cop-agy', text: (data.practices || '—') + ' practices' })
        ])
      ]),
      sel
        ? h('div', { cls: 'cop-note' }, [
            h('b', { text: 'Why this solicitation is here' }),
            h('span', { text: (sel.solicitation_number || sel.notice_id || 'This audit') + ' matched on ' + (sel.matched_on || 'a CMMC signal') + '.' })
          ])
        : null,
      // The obligation and whether it can still be acted on, together. Absent when SAM
      // recorded no closing date — an unknown deadline is not an open one.
      (function () {
        if (!sel) return null;
        const d = deadlineState(sel.response_deadline);
        return d ? h('div', { cls: 'cop-note' }, [
          h('b', { text: 'Response deadline' }),
          h('span', { cls: 'cop-deadline ' + d.cls, text: d.text })
        ]) : null;
      })(),
      h('div', { cls: 'cop-note' }, [h('b', { text: 'What it covers' }), h('span', { text: data.summary || '' })]),
      h('div', { cls: 'cop-note' }, [h('b', { text: 'Triggering clauses' }), triggers]),
      h('div', { cls: 'cop-note' }, [h('b', { text: 'What the level asks for' }), checklist]),
      sel
        ? h('div', { cls: 'cop-actions' }, [
            h('a', { cls: 'cop-btn primary', text: 'Open the audit', attrs: { href: '/audits/' + sel.id } })
          ])
        : null
    ]);
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function renderAll() {
    renderBanner();
    renderStats();
    renderDistribution();
    renderLevelPills();
    renderList();
    renderPanel();
  }

  function buildControls() {
    const search = $('searchInput');
    // `input` fires on every character AND on a paste, a drag-drop and an autofill — which
    // `keyup` would all miss. The filter runs on each one.
    if (search) search.addEventListener('input', (e) => { S.q = e.target.value; renderList(); });

    // The topbar control and the keyboard hint it advertises both land here.
    const focusSearch = () => {
      if (!search) return;
      search.scrollIntoView({ block: 'center' });
      search.focus();
      search.select();
    };
    const tb = $('tbSearch');
    if (tb) tb.addEventListener('click', focusSearch);
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
    });
    const reset = $('resetBtn');
    if (reset) {
      reset.addEventListener('click', () => {
        S.level = 'all'; S.q = ''; S.sel = null;
        if (search) search.value = '';
        renderAll();
      });
    }
  }

  function init() { buildControls(); renderAll(); }

  window.CMMC_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
