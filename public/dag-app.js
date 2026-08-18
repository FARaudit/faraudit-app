/* FARaudit · Defense Agencies — render layer.

   WHAT THIS PAGE MAY SAY. Every figure here is a count from the live SAM window against the
   customer's own NAICS codes. There is no spend, no share-of-market, no forecast and no score,
   because no source for any of those is connected. The page says so out loud rather than
   leaving the absence to be inferred.

   THE SPAN IS STATED, NOT IMPLIED. Nothing persists notice history, so this ranks what is open
   in the current window. A rank that silently reshuffles between visits reads as a trend.

   EMPTY IS THREE ANSWERS. No codes on file, no notices this window, and a failed request are
   different facts with different next actions, so they get different words.

   NAMES ARE EXTERNAL TEXT. SAM publishes office and department names in caps. They are recased
   for reading and NOTHING ELSE: tc() is gated case-only (see caseOnly()), so no word is added,
   dropped, expanded or reordered. We never restate a source's agency name as our own claim.

   Built with nodes and textContent, never markup. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  /* ---------- presentational casing · CASE ONLY ---------- */
  var SMALL = { of: 1, the: 1, and: 1, for: 1, to: 1, in: 1, on: 1, at: 1, a: 1, an: 1 };
  var KEEP = { US: 1, USA: 1, USDA: 1, NASA: 1, NOAA: 1, DLA: 1, DCMA: 1, DOD: 1, DHS: 1, VA: 1,
    GSA: 1, TSA: 1, NIH: 1, CDC: 1, EPA: 1, FAA: 1, IRS: 1, SBA: 1, DOE: 1, DOT: 1, HHS: 1,
    NGA: 1, NSA: 1, DIA: 1, DTRA: 1, DISA: 1, MDA: 1, DHA: 1, DFAS: 1, SOCOM: 1, CENTCOM: 1,
    NAVFAC: 1, NAVSUP: 1, NAVSEA: 1, NAVAIR: 1, USACE: 1, AFB: 1, II: 1, III: 1, IV: 1 };
  function tcWord(w, i) {
    var m = String(w).match(/^([^A-Za-z]*)([A-Za-z']*)([\s\S]*)$/);
    if (!m || !m[2]) return w;
    var pre = m[1], core = m[2], post = m[3], up = core.toUpperCase(), low = core.toLowerCase();
    if (KEEP[up]) return pre + up + post;
    if (i > 0 && SMALL[low]) return pre + low + post;
    return pre + low.charAt(0).toUpperCase() + low.slice(1) + post;
  }
  /* Whitespace is normalised; letters are only recased. */
  function tc(s) { return s ? String(s).trim().split(/\s+/).map(tcWord).join(' ') : ''; }
  function caseOnly(src, out) {
    var n = function (v) { return String(v).toUpperCase().replace(/\s+/g, ' ').trim(); };
    return n(src) === n(out);
  }

  /* ---------- dates · rendered in the notice's OWN zone, from the ISO string ----------
     Never through Date#toLocaleDateString: that re-zones the instant and can print a day early
     or late depending on where the reader is sitting. The deadline belongs to the notice. */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  function fmtDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
  }
  function rel(iso, now) {
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    var ms = t - now;
    if (ms < 0) return { k: 'closed', t: 'now closed' };
    if (ms < 86400000) return { k: 'soon', t: 'under 24 hours' };
    var d = Math.floor(ms / 86400000);
    return { k: d <= 3 ? 'soon' : 'later', t: 'in ' + d + ' day' + (d === 1 ? '' : 's') };
  }

  /* ---------- set-asides · the field the old page collected and never rendered ----------
     The route returns the DISTINCT set-asides seen on those notices, not counts. So this may
     say which kinds appeared and never what share of the notices carried them. */
  function setAside(list) {
    var arr = Array.isArray(list) ? list : [];
    if (!arr.length) return { h: '—', s: 'not reported', none: true };
    var open = false, sb = false, other = false, kinds = [];
    arr.forEach(function (raw) {
      var v = String(raw);
      if (/^no set[- ]aside/i.test(v)) { open = true; return; }
      var k = v.replace(/^.*set[- ]aside\s*-?\s*/i, '').trim().toLowerCase();
      if (/small business/i.test(v)) { sb = true; kinds.push(k || 'small business'); }
      else { other = true; kinds.push(v.toLowerCase()); }
    });
    if (!kinds.length) return { h: 'Unrestricted', s: 'no set-aside seen', none: true };
    return {
      h: (sb && !other) ? 'Small business' : 'Set-aside',
      s: kinds.join(', ') + (open ? ' + unrestricted' : ''),
      none: false
    };
  }

  /* ---------- the department ramp · ONE hue, N steps of value ----------
     Five departments is a categorical field and a five-hue palette would be five new brand
     colours. Value carries it instead: endpoints come from the theme, steps are interpolated,
     so any number of departments lands on one ordered scale. */
  function hex2rgb(h) {
    var s = String(h).trim().replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
  }
  function rampStep(i, n) {
    var cs = getComputedStyle(document.documentElement);
    var hi = cs.getPropertyValue('--dep-hi') || '#185FA5';
    var lo = cs.getPropertyValue('--dep-lo') || '#CFE1F7';
    return n <= 1 ? mix(hi, lo, 0) : mix(hi, lo, i / (n - 1));
  }
  /* A label printed on a segment is painted on that segment, so its ink is chosen against
     that fill and not against the card. */
  function lum(rgb) {
    var m = String(rgb).match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return 1;
    return [1, 2, 3].map(function (i) {
      var c = +m[i] / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function inkOn(fill) {
    var m = String(fill).match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return null;
    var L = lum(fill);
    var white = 1.05 / (L + 0.05), dark = (L + 0.05) / (0.0113 + 0.05);
    /* An inline label is only printed where an ink CLEARS on that fill. On the middle steps of
       a value ramp neither white nor navy reaches 4.5:1, so the label is dropped and the legend
       carries the figure — a number nobody can read is not a number. */
    if (white >= 4.5 && white >= dark) return '#ffffff';
    if (dark >= 4.5) return '#0A1628';
    return null;
  }

  /* ---------- state ---------- */
  var ui = { dept: 'all', sort: 'volume', q: '' };
  var NOW = null; /* frozen per render so every row is measured against one clock */

  function status() { return (window.DAG && window.DAG.STATUS) || { state: 'loading', reason: '' }; }
  function offices() { return (window.DAG && Array.isArray(window.DAG.OFFICES)) ? window.DAG.OFFICES : []; }
  function meta() { return (window.DAG && window.DAG.META) || {}; }

  function departments(list) {
    var byName = {}, order = [];
    list.forEach(function (o) {
      var d = o.department || '';
      if (!byName[d]) { byName[d] = { name: d, notices: 0, offices: 0 }; order.push(byName[d]); }
      byName[d].notices += (typeof o.notices === 'number' ? o.notices : 0);
      byName[d].offices += 1;
    });
    return order.sort(function (a, b) { return b.notices - a.notices || a.name.localeCompare(b.name); });
  }

  function matches(o, q) {
    if (!q) return true;
    var hay = [o.office || '', o.department || ''].concat(o.naics || []).join(' ').toLowerCase();
    /* Every token must hit somewhere in the row. A single-substring test would be a phrase
       search wearing a keyword search's placeholder, and would miss rows whose tokens are
       spread across title, department and code. */
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) {
      if (/^\d+$/.test(tok)) return (o.naics || []).some(function (c) { return String(c).indexOf(tok) === 0; }) || hay.indexOf(tok) > -1;
      return hay.indexOf(tok) > -1;
    });
  }

  function visible() {
    var list = offices().filter(function (o) {
      return (ui.dept === 'all' || o.department === ui.dept) && matches(o, ui.q);
    });
    if (ui.sort === 'deadline') {
      list = list.slice().sort(function (a, b) {
        var A = Date.parse(a.next_deadline), B = Date.parse(b.next_deadline);
        if (isNaN(A) && isNaN(B)) return 0;
        if (isNaN(A)) return 1;
        if (isNaN(B)) return -1;
        return A - B;
      });
    }
    return list;
  }

  /* ---------- banner ---------- */
  function banner(kind, label, text, node) {
    var b = $('stateBanner');
    if (!b) return;
    clear(b);
    b.className = 'state-banner' + (kind === 'error' ? ' is-error' : '');
    b.hidden = false;
    b.appendChild(el('span', 'sb-label', label));
    b.appendChild(el('span', 'sb-text', text));
    if (node) b.appendChild(node);
  }

  function showData(on) {
    ['concWidget', 'controls', 'regWidget'].forEach(function (id) { var n = $(id); if (n) n.hidden = !on; });
  }

  /* ---------- header ---------- */
  function paintHeader(m, list) {
    var deps = departments(list);
    var set = function (id, v) { var n = $(id); if (n) n.textContent = v; };
    set('hsOffices', String(list.length));
    set('hsNotices', String(typeof m.notices === 'number' ? m.notices : list.reduce(function (s, o) { return s + o.notices; }, 0)));
    set('hsDepts', String(deps.length));
    var codes = (m.naics_scope || []).length;
    set('pageSub', 'Ranked by what is open in the current ' + (m.window_days || 30)
      + '-day window against your ' + codes + ' NAICS code' + (codes === 1 ? '' : 's')
      + ' — a snapshot of what is live, not a running total.');
  }

  /* ---------- concentration ----------
     The strip and its legend are ONE control: the legend items ARE the department filter, so
     there is no second row of department pills saying the same thing in a duller shape. The
     strip always shows the whole window — selecting a department marks it, it never re-scales
     the graphic, because a proportion that changes when you filter is not a proportion. */
  function paintConcentration(m, list) {
    var deps = departments(list);
    var total = deps.reduce(function (s, d) { return s + d.notices; }, 0);
    var strip = $('concStrip'), legend = $('concLegend');
    clear(strip); clear(legend);
    var pending = [];

    deps.forEach(function (d, i) {
      var fill = rampStep(i, deps.length);
      var on = ui.dept === d.name, any = ui.dept !== 'all';
      var seg = el('div', 'conc-seg' + (any && !on ? ' dim' : ''));
      seg.style.flex = d.notices + ' 1 0px';
      seg.style.background = fill;
      seg.style.animationDelay = (i * 40) + 'ms';
      seg.setAttribute('data-dep', d.name);
      seg.setAttribute('data-notices', String(d.notices));
      seg.setAttribute('aria-hidden', 'true');
      var lbl = el('span', 'seg-lbl', Math.round(d.notices / total * 100) + '%');
      var ink = inkOn(fill);
      /* ONLY THE LEADING SEGMENT CARRIES AN INLINE LABEL, and only if an ink clears on its own
         fill. Labelling “wherever an ink happens to clear” made the rule depend on where a step
         lands in the ramp — and the ramp flips with the theme, so light printed one label and
         dark printed two: the same graphic saying different things. One headline share, the
         legend carries the rest, identical in both themes (gated by C14). */
      if (i === 0 && ink) {
        lbl.style.color = ink;
        seg.appendChild(lbl);
        pending.push([seg, lbl]);
      }
      strip.appendChild(seg);

      var item = el('button', 'cl' + (on ? ' on' : ''));
      item.type = 'button';
      item.setAttribute('aria-pressed', on ? 'true' : 'false');
      var sw = el('span', 'cl-sw');
      sw.style.background = fill;
      item.appendChild(sw);
      item.appendChild(el('span', 'cl-n', tc(d.name)));
      item.appendChild(el('span', 'cl-c', String(d.notices)));
      item.appendChild(el('span', 'cl-p', Math.round(d.notices / total * 100) + '%'));
      item.addEventListener('click', function () { ui.dept = on ? 'all' : d.name; render(); });
      legend.appendChild(item);
    });

    /* The inline share is printed only where it MEASURES as fitting. A label that has to be
       guessed at is a label that will one day be clipped. */
    pending.forEach(function (pair) {
      var seg = pair[0], lbl = pair[1];
      if (lbl.scrollWidth + 22 > seg.clientWidth) seg.removeChild(lbl);
    });

    /* The findings are assembled from derived parts and set as findings — figure, claim,
       working. Not one number in them is typed. */
    var read = $('concRead');
    clear(read);
    function note(fig, title, detail) {
      var n = el('div', 'note');
      n.appendChild(el('div', 'note-f', fig));
      n.appendChild(el('div', 'note-t', title));
      n.appendChild(el('div', 'note-d', detail));
      read.appendChild(n);
    }
    var ranked = list.slice().sort(function (a, b) { return b.notices - a.notices; });
    if (ranked.length >= 2) {
      var two = ranked[0].notices + ranked[1].notices;
      note(Math.round(two / total * 100) + '%',
        'of everything open sits with two offices',
        tc(ranked[0].office) + ' and ' + tc(ranked[1].office) + ' · ' + two + ' of ' + total);
    }
    if (deps.length >= 2) {
      var top = deps[0], outO = list.length - top.offices, outN = total - top.notices;
      note(Math.round(outN / total * 100) + '%',
        'of the volume is bought outside ' + tc(top.name),
        outO + ' of the ' + list.length + ' offices · ' + outN + ' of ' + total);
    }

    var sub = $('concSub');
    if (sub) sub.textContent = total + ' notice' + (total === 1 ? '' : 's') + ' · '
      + deps.length + ' department' + (deps.length === 1 ? '' : 's')
      + ' · select one to filter the register';
    var src = $('concSource');
    if (src) src.textContent = 'SAM · ' + (m.window_days || 30) + '-day window';
  }

  /* ---------- controls ---------- */
  function pill(label, count, on, fn) {
    var b = el('button', 'fpill' + (on ? ' on' : ''));
    b.type = 'button';
    b.appendChild(el('span', 'lb', label));
    if (count != null) b.appendChild(el('span', 'ct', String(count)));
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.addEventListener('click', fn);
    return b;
  }

  function paintControls(list) {
    var sorts = $('sortPills');
    clear(sorts);
    sorts.appendChild(pill('Most open now', null, ui.sort === 'volume', function () { ui.sort = 'volume'; render(); }));
    sorts.appendChild(pill('Closing soonest', null, ui.sort === 'deadline', function () { ui.sort = 'deadline'; render(); }));

    var input = $('searchInput');
    /* NEVER rewrite the field the user is typing in. Syncing it unconditionally deleted a
       trailing space mid-word and snapped the caret to the end — the render was editing the
       control that drives it. Sync only when the value came from somewhere else. */
    if (input && document.activeElement !== input && input.value !== ui.q) input.value = ui.q;
  }

  /* ---------- one row ---------- */
  function row(o, m, total, i) {
    var r = el('div', 'reg-row');
    r.style.animationDelay = Math.min(i, 11) * 26 + 'ms';
    r.setAttribute('data-office', o.office || '');

    /* office */
    var c1 = el('div', 'c of');
    c1.appendChild(el('div', 'of-n', tc(o.office || o.department || 'Unnamed office')));
    var sameName = o.office && o.department
      && String(o.office).trim().toUpperCase() === String(o.department).trim().toUpperCase();
    if (o.department && !sameName) c1.appendChild(el('div', 'of-d', tc(o.department)));
    /* SAM named no sub-office here: the office string IS the department string. Printing it
       twice is not a second fact. */
    else if (o.department) c1.appendChild(el('div', 'of-d', 'no sub-office named'));
    if (o.in_pipeline) {
      var p = el('span', 'of-pipe', o.in_pipeline + ' in your pipeline');
      c1.appendChild(p);
    }
    r.appendChild(c1);

    /* open notices */
    var c2 = el('div', 'c n r');
    c2.appendChild(el('div', 'n-v', String(o.notices)));
    c2.appendChild(el('div', 'n-s', Math.round(o.notices / total * 100) + '% of ' + total));
    r.appendChild(c2);

    /* next response due */
    var c3 = el('div', 'c dl');
    var d = fmtDate(o.next_deadline), rl = rel(o.next_deadline, NOW);
    if (d) {
      c3.appendChild(el('div', 'dl-d', d));
      if (rl) {
        var rn = el('div', 'dl-r ' + rl.k, rl.t);
        c3.appendChild(rn);
        if (rl.k === 'soon') r.classList.add('soon');
      }
    } else {
      c3.appendChild(el('div', 'dl-d none', '—'));
      c3.appendChild(el('div', 'dl-r', 'no deadline published'));
    }
    r.appendChild(c3);

    /* your codes */
    var c4 = el('div', 'c codes');
    (o.naics || []).forEach(function (code) { c4.appendChild(el('span', 'code', String(code))); });
    if (!(o.naics || []).length) c4.appendChild(el('span', 'sa-s', 'not reported'));
    r.appendChild(c4);

    /* set-asides seen */
    var sa = setAside(o.set_asides), c5 = el('div', 'c sa');
    c5.appendChild(el('div', 'sa-h' + (sa.none ? ' none' : ''), sa.h));
    c5.appendChild(el('div', 'sa-s', sa.s));
    r.appendChild(c5);

    /* your audits — the customer's OWN record, so 0 is a measured zero, not a gap.
       (The pre-design page suppressed the zero; in a sentence that was right, in a column
       whose header asks the question it leaves the answer blank.) */
    var c6 = el('div', 'c au');
    c6.appendChild(el('div', 'au-v' + (o.audited ? '' : ' zero'), String(o.audited || 0)));
    c6.appendChild(el('div', 'au-s', o.audited
      ? (o.decided ? o.decided + ' decided' : 'none decided yet')
      : 'none yet'));
    r.appendChild(c6);

    return r;
  }

  /* ---------- register ---------- */
  function paintRegister(m, all) {
    var list = visible(), total = all.reduce(function (s, o) { return s + o.notices; }, 0);
    var host = $('regList'), empty = $('regEmpty');
    clear(host); clear(empty);

    list.forEach(function (o, i) { host.appendChild(row(o, m, total, i)); });

    var shownNotices = list.reduce(function (s, o) { return s + o.notices; }, 0);
    var scope = ui.dept === 'all' ? 'all departments' : tc(ui.dept);
    var line = $('resultLine');
    if (line) {
      line.textContent = list.length + ' of ' + all.length + ' offices · '
        + shownNotices + ' of ' + total + ' open notices · ' + scope
        + (ui.q ? ' · matching “' + ui.q + '”' : '')
        + ' · ordered by ' + (ui.sort === 'deadline' ? 'soonest response deadline' : 'open notices');
    }
    var reset = $('resetBtn');
    if (reset) reset.hidden = (ui.dept === 'all' && !ui.q && ui.sort === 'volume');

    empty.hidden = list.length > 0;
    if (!list.length) {
      var wider = offices().filter(function (o) { return matches(o, ui.q); });
      var where = ui.dept === 'all' ? 'your window' : tc(ui.dept);
      empty.appendChild(el('div', 't', ui.q
        ? 'Nothing in ' + where + ' matches “' + ui.q + '”'
        : 'No offices in ' + where));
      empty.appendChild(el('div', 'd', ui.q && wider.length && ui.dept !== 'all'
        ? wider.length + ' office' + (wider.length === 1 ? '' : 's') + ' elsewhere in your window '
          + (wider.length === 1 ? 'does' : 'do') + '.'
        : 'Your codes were searched. This is what the current window holds.'));
      if (ui.q && wider.length && ui.dept !== 'all') {
        var b = el('button', 'wide-btn', 'Search all ' + offices().length + ' offices');
        b.type = 'button';
        b.addEventListener('click', function () { ui.dept = 'all'; render(); });
        empty.appendChild(b);
      }
    }
  }

  /* ---------- render ---------- */
  function render() {
    NOW = Date.now();
    var s = status(), m = meta(), all = offices();
    var pill = $('livePill');
    if (pill) pill.hidden = s.state !== 'ok';
    var b = $('stateBanner');

    if (s.state !== 'ok') {
      showData(false);
      if (s.state === 'loading') {
        banner('info', 'Loading', 'Asking which offices are buying your codes…');
      } else if (s.state === 'error') {
        banner('error', 'Unavailable', s.reason
          || 'The request failed, so nothing can be shown. This is not an empty list of offices.');
      } else if (s.state === 'empty') {
        /* EMPTY IS NOT ONE STATE, so it is not one message. A customer with no codes on
           file has something they can fix; a customer whose codes drew nothing this window
           has a real zero result. Collapsing the two hides the one they can act on. */
        if (s.reason === 'no-profile-codes') {
          var a = el('a', null, 'Profile & Settings → NAICS Configuration');
          a.href = '/settings';
          banner('info', 'No codes on file', 'This page ranks the buying offices issuing work against your NAICS codes. With none on file there is nothing to rank. Add them under ', a);
        } else {
          banner('info', 'A real zero', 'Your codes were searched and the current window holds no open notices. This is not a missing source — it changes as agencies post.');
        }
      } else {
        /* An unrecognised state is a failure, not a zero. Saying "a real zero" here would
           be asserting a measurement nothing produced. */
        banner('error', 'Unavailable', 'The agency service answered in a way this page does not recognise, so nothing can be shown.');
      }
      return;
    }
    if (b) { b.hidden = true; clear(b); }
    showData(true);
    paintHeader(m, all);
    paintConcentration(m, all);
    paintControls(all);
    paintRegister(m, all);
  }

  function wireStaticControls() {
    var input = $('searchInput');
    if (input) {
      input.addEventListener('input', function () { ui.q = input.value.trim(); render(); });
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !input.value) return;
        e.preventDefault();
        input.value = '';
        ui.q = '';
        render();
      });
    }
    var reset = $('resetBtn');
    if (reset) reset.addEventListener('click', function () {
      ui.dept = 'all'; ui.q = ''; ui.sort = 'volume';
      if (input) input.value = '';
      render();
    });
  }

  window.DAG_APP = {
    render: render,
    onThemeChange: render,
    /* exposed so a review battery can re-derive rather than trust the render */
    _derive: { tc: tc, caseOnly: caseOnly, fmtDate: fmtDate, rel: rel, setAside: setAside,
      departments: departments, matches: matches, ui: ui }
  };

  function boot() { wireStaticControls(); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
