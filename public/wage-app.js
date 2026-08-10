/* FARaudit · Wage Benchmarks — render layer.

   Renders window.WAGE, which wage-benchmarks-live.js fills from
   /api/labor-rates. Every row is a labor category with a low/median/high band
   and the source that produced it — a curated benchmark row, the BLS OES +
   SCA reference table, or live GSA CALC+ awarded rates when a category is
   searched. The source travels with the row and is always shown.

   What is NOT here, and must not return: "your rate", a variance against
   market, a compliance status, or a wage-determination renewal countdown. The
   product holds no payroll and fetches no wage determinations, so it can show
   what the market pays and nothing about what this company pays.

   Values reach the page as text nodes built through h(); this file never
   assigns markup. */
(function () {
  'use strict';

  const S = { naics: 'all', q: '', sel: null, sort: 'category', compare: null };
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

  function money(n) {
    if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '—';
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }

  const meta = () => (window.WAGE && window.WAGE.meta) || { state: 'loading' };
  const rates = () => (window.WAGE && Array.isArray(window.WAGE.RATES) ? window.WAGE.RATES : []);
  const scope = () => (window.WAGE && window.WAGE.SCOPE) || { codes: [], source: null };

  function sorted(list) {
    const out = list.slice();
    if (S.sort === 'median') out.sort((a, b) => (b.rate_median || 0) - (a.rate_median || 0));
    else out.sort((a, b) => String(a.category).localeCompare(String(b.category)));
    return out;
  }

  /* ── state banner ───────────────────────────────────────────────────── */

  const EMPTY_COPY = {
    'no-match': {
      label: 'No category matches',
      body: 'Nothing in the benchmark set matches this filter. Clear it, or search a different labor category — a search also asks GSA CALC+ for awarded rates under that name.'
    },
    'reference-empty': {
      label: 'No rates available',
      body: 'The benchmark set returned nothing at all, which is a fault rather than an answer. Reload, and if it persists the rate service needs attention.'
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
        h('span', { text: 'Reading benchmark rates for your codes…' })
      ]);
      return;
    }
    if (m.state === 'error') {
      el.hidden = false;
      el.classList.add('is-error');
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Unavailable' }),
        h('span', { text: 'The rate service did not answer, so this page has nothing to show. It is not an empty benchmark set — reload to try again.' }),
        m.detail ? h('b', { text: m.detail }) : null
      ]);
      return;
    }
    if (m.state === 'empty') {
      const copy = EMPTY_COPY[m.reason] || EMPTY_COPY['no-match'];
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: copy.label }),
        h('span', { text: copy.body })
      ]);
      return;
    }
    if (m.liveAwarded > 0) {
      el.hidden = false;
      fill(el, [
        h('span', { cls: 'sb-label', text: 'Live' }),
        h('span', { text: 'GSA CALC+ answered for "' + m.query + '" — those awarded rates are in the list, marked with their own source.' })
      ]);
      return;
    }
    el.hidden = true;
    fill(el, []);
  }

  /* ── header + controls ──────────────────────────────────────────────── */

  function renderStats() {
    const m = meta();
    const list = rates();
    const ready = m.state === 'ready' || m.state === 'empty';
    const put = (id, v) => { const el = $(id); if (el) el.textContent = ready ? String(v) : '—'; };
    put('hsCats', list.length);
    put('hsCurated', m.curated || 0);
    const codes = scope().codes || [];
    const cs = $('hsCodes');
    if (cs) cs.textContent = ready ? (codes.length ? String(codes.length) : '0') : '—';
    const pill = $('livePill');
    if (pill) pill.hidden = !(m.state === 'ready' && m.liveAwarded > 0);
  }

  function renderNaicsPills() {
    const host = $('locFilters');
    if (!host) return;
    const codes = scope().codes || [];
    const opts = [{ k: 'all', label: 'All codes' }].concat(codes.map((c) => ({ k: c, label: c })));
    fill(host, opts.map((o) => {
      const b = h('button', { cls: 'fpill' + (S.naics === o.k ? ' active' : ''), text: o.label, attrs: { type: 'button' } });
      b.addEventListener('click', () => {
        S.naics = o.k;
        reload();
      });
      return b;
    }));
  }

  function renderSort() {
    const host = $('sortSeg');
    if (!host) return;
    const opts = [{ k: 'category', label: 'Category' }, { k: 'median', label: 'Median rate' }];
    fill(host, opts.map((o) => {
      const b = h('button', { cls: 'fpill' + (S.sort === o.k ? ' active' : ''), text: o.label, attrs: { type: 'button' } });
      b.addEventListener('click', () => { S.sort = o.k; renderList(); });
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

  function rowId(r) {
    return String(r.category) + '|' + String(r.source);
  }

  function renderList() {
    const host = $('wageList');
    if (!host) return;
    const list = sorted(rates());

    const count = $('feedCount');
    if (count) count.textContent = meta().state === 'ready' ? list.length + ' categories' : '';

    if (list.length === 0) {
      fill(host, [emptyBlock('Nothing to list', 'See the note above.')]);
      return;
    }

    fill(host, list.map((r) => {
      const row = h('div', { cls: 'wage-row' + (S.sel === rowId(r) ? ' sel' : '') }, [
        h('div', { cls: 'wr-cat' }, [
          h('div', { cls: 'wr-name', text: r.category }),
          h('div', { cls: 'wr-src', text: r.source || 'source not recorded' })
        ]),
        h('div', { cls: 'wr-codes mono', text: (r.naics_codes || []).join(' · ') || '—' }),
        h('div', { cls: 'wr-rate mono', text: money(r.rate_low) }),
        h('div', { cls: 'wr-rate wr-med mono', text: money(r.rate_median) }),
        h('div', { cls: 'wr-rate mono', text: money(r.rate_high) })
      ]);
      row.addEventListener('click', () => {
        S.sel = rowId(r);
        /* The comparison belongs to the row that asked for it. Without clearing it, a fast
           click to a second category paints the first category's awarded rates under the
           second one's name — which is worse than showing nothing. */
        S.compare = null;
        renderList(); renderPanel();
        if (typeof window.WAGE_COMPARE === 'function') {
          const asked = rowId(r);
          window.WAGE_COMPARE(r.category).then((c) => {
            if (S.sel !== asked) return;   // selection moved on; this answer is stale
            S.compare = c;
            renderPanel();
          });
        }
      });
      return row;
    }));
  }

  /* ── detail panel ───────────────────────────────────────────────────── */

  function renderPanel() {
    const host = $('wagePanel');
    if (!host) return;
    const list = rates();
    const r = list.find((x) => rowId(x) === S.sel) || null;

    if (!r) {
      fill(host, [list.length
        ? emptyBlock('Select a category', 'Pick a labor category to see its band and where the number came from.')
        : emptyBlock('Nothing selected', 'There is no category to select yet.')]);
      return;
    }

    /* THE PANEL SAYS WHAT THE ROW CANNOT. The row already prints low, median and high, so
       repeating them here spends the whole panel restating the line the customer just read.
       What it adds instead: what the category IS, what it takes to fill it, and what primes
       have actually been awarded for it. */
    const rows = (pairs) => h('div', { style: 'display:flex;flex-direction:column;gap:7px;margin-top:5px' },
      pairs.map(([label, v, strong]) => h('div', { style: 'display:flex;justify-content:space-between;gap:12px' }, [
        h('span', { text: label, style: 'font-size:12px;color:var(--mute)' }),
        h('span', { cls: 'mono', text: v, style: 'font-size:13px;font-weight:' + (strong ? '800' : '600') + ';color:var(--ink)' })
      ])));

    const spec = r.spec || null;
    const cmp = S.compare && S.compare.category === r.category ? S.compare : null;

    /* WHERE IT CAME FROM, ONLY WHEN IT DIFFERS. 50 of the 55 reference rows carry the same
       source string, so printing it on every panel is a line the reader learns to skip. It is
       stated once beneath the table and repeated here only when this row is one of the few
       that came from somewhere else. */
    const DEFAULT_SOURCE = 'BLS OES 2024 + SCA';
    const oddSource = r.source && r.source !== DEFAULT_SOURCE ? r.source : null;

    fill(host, [
      h('div', { cls: 'cop-head' }, [
        h('div', { cls: 'cop-id' }, [
          h('div', { cls: 'cop-name', text: r.category }),
          h('div', { cls: 'cop-title', text: r.curated ? 'Curated benchmark' : 'Reference rate' }),
          (r.naics_codes || []).length ? h('div', { cls: 'cop-agy', text: (r.naics_codes || []).join(' · ') }) : null
        ])
      ]),

      spec ? h('div', { cls: 'cop-note' }, [h('b', { text: 'What this role does' }), h('span', { text: spec.what })]) : null,
      spec ? h('div', { cls: 'cop-note' }, [h('b', { text: 'Typical qualifications' }), h('span', { text: spec.quals })]) : null,
      spec ? h('div', { cls: 'cop-note' }, [
        h('span', { text: 'Role summary and qualifications are FARaudit editorial, not a government standard.',
                    style: 'font-size:11px;color:var(--mute)' })
      ]) : null,

      /* AGAINST WHAT PRIMES HAVE WON. Four states, each said plainly — a blank panel for
         "loading", "not in the index" and "the lookup failed" would tell three different
         customers the same untrue thing. */
      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'Against awarded rates' }),
        !cmp ? h('span', { text: 'Checking GSA CALC+ for awarded rates…', style: 'color:var(--mute)' })
        : cmp.state === 'found' ? rows([
            ['Your reference median', money(r.rate_median), false],
            ['Awarded median (GSA CALC+)', money(cmp.median), true],
            ['Awarded range', money(cmp.min) + ' – ' + money(cmp.max), false],
            ['Awarded rates in sample', String(cmp.count), false],
            ['Difference', (cmp.median >= r.rate_median ? '+' : '−') + money(Math.abs(cmp.median - r.rate_median)), true]
          ])
        : cmp.state === 'none' ? h('span', { text: 'GSA CALC+ indexes no awarded rate under this category name. That is a gap in the index, not a rate of zero.', style: 'color:var(--mute)' })
        : h('span', { text: 'The GSA CALC+ lookup could not be reached, so no comparison is shown rather than a stale one.', style: 'color:var(--mute)' })
      ]),

      oddSource ? h('div', { cls: 'cop-note' }, [h('b', { text: 'Where this one came from' }), h('span', { text: oddSource })]) : null,

      h('div', { cls: 'cop-note' }, [
        h('b', { text: 'What it is not' }),
        h('span', { text: 'A market band, not your payroll and not an SCA wage determination for a specific place of performance. Check the WD named in the solicitation before you price to it.' })
      ])
    ].filter(Boolean));
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function renderAll() {
    renderBanner();
    renderStats();
    renderNaicsPills();
    renderSort();
    renderList();
    renderPanel();
  }

  function reload() {
    if (typeof window.WAGE_LOAD !== 'function') return;
    window.WAGE.meta = Object.assign({}, meta(), { state: 'loading' });
    renderBanner();
    window.WAGE_LOAD({ naics: S.naics === 'all' ? null : S.naics, q: S.q.trim() || null });
  }

  function buildControls() {
    const search = $('searchInput');
    if (search) {
      // A search is a server round-trip (it also asks GSA CALC+), so it fires
      // on Enter rather than on every keystroke.
      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        S.q = e.target.value;
        S.sel = null;
        reload();
      });
    }
    const reset = $('resetBtn');
    if (reset) {
      reset.addEventListener('click', () => {
        S.naics = 'all'; S.q = ''; S.sel = null; S.sort = 'category';
        if (search) search.value = '';
        reload();
      });
    }
  }

  function init() { buildControls(); renderAll(); }

  window.WAGE_APP = { render: renderAll, onThemeChange: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
