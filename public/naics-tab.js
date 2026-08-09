/* FARaudit — NAICS Codes tab.
 *
 *   1. No row is given a field the source does not carry. The editorial fields (category,
 *      evaluation method, clause regime, note) exist on 27 of 978 rows and appear only
 *      there. A stated evaluation method nobody sourced could move a bid.
 *   2. Every count is derived at render time. Nothing on this page is typed.
 *
 * The rail is built ONCE and then synced — rebuilding it per render would restart its
 * transitions and drop focus, and the sector counts never change.
 */
(function () {
'use strict';
var R = window.NAICS_REF, SECTORS = R.SECTORS, DATA = R.DATA, CATS = R.CATS;
var CM = {}; CATS.forEach(function (c) { CM[c.id] = c; });
var SL = {}; SECTORS.forEach(function (s) { SL[s.id] = s.label; });
var EVAL = { bv: 'Best Value', lpta: 'LPTA' };
var CLAUSE = { far: 'FAR', dfars: 'FAR+DFARS', agar: 'FAR+AGAR', affars: 'FAR+AFFARS' };
var SEC_N = {}; DATA.forEach(function (r) { SEC_N[r[8]] = (SEC_N[r[8]] || 0) + 1; });

/* "My codes" IS the customer's capability statement, so it starts empty and stays empty
 * until that statement answers. The review copy of this file carried three literal codes
 * and nine drawn stand-ins, which is right for judging the band at counts no one customer
 * has — and wrong to serve, because every customer would have been shown the same three.
 * An empty scope is not a broken one: it renders the state that points at the Capability
 * Statement, which is the only thing that can fill it. */
var MINE_SET = [];
var MINE_ALL = MINE_SET;
function pinMode() { var v = document.documentElement.getAttribute('data-t-pin'); return v || 'off'; }
function mineCount() { var v = document.documentElement.getAttribute('data-t-mine'); return v == null ? S.mine : parseInt(v, 10); }
var S = { scope: pinMode() === 'off' ? 'mine' : 'all', q: '', mine: 0, dir: 1 };
var lastPin = pinMode();
var ORDER = ['mine', 'all'].concat(SECTORS.map(function (s) { return s.id; }));

function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
function mineMap() { var m = {}; MINE_ALL.slice(0, mineCount()).forEach(function (c) { m[c] = 1; }); return m; }
function isEd(r) { return !!(r[1] && r[5] && r[6] && r[7]); }
function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* THE THRESHOLD IS NOT ALWAYS REVENUE OR HEADCOUNT. Four rows carry a depository-
 * institution standard measured in ASSETS, stored in the served file as
 * "$850millioninassetsM" — spaces collapsed and an M appended by the generator. Printed
 * raw beside the word "revenue" it is unreadable AND misstates the basis. */
function parts(r) {
  var a = r[3].match(/^\$([\d.]+)\s*million\s*in\s*assets/i);
  if (a) return { fig: '$' + a[1] + 'M', unit: 'in assets', basis: 'assets', n: parseFloat(a[1]) };
  if (r[4] === 'rev') return { fig: r[3], unit: 'revenue', basis: 'revenue', n: parseFloat(r[3].replace(/[$M]/g, '')) };
  return { fig: r[3], unit: 'employees', basis: 'employees', n: parseInt(r[3].replace(/,/g, ''), 10) };
}

/* A section's summary is DERIVED: how many codes, how they are measured, and the span of
 * each basis actually present. Nothing is stated for a basis the section does not use. */
function summary(rows) {
  var by = { revenue: [], employees: [], assets: [] };
  rows.forEach(function (r) { var p = parts(r); if (!isNaN(p.n)) by[p.basis].push(p.n); });
  var out = [];
  function span(a, f) { var mn = Math.min.apply(null, a), mx = Math.max.apply(null, a); return mn === mx ? f(mn) : f(mn) + ' – ' + f(mx); }
  if (by.revenue.length) out.push({ v: span(by.revenue, function (n) { return '$' + n + 'M'; }), k: by.revenue.length + ' by revenue' });
  if (by.employees.length) out.push({ v: span(by.employees, fmtN), k: by.employees.length + ' by headcount' });
  if (by.assets.length) out.push({ v: span(by.assets, function (n) { return '$' + n + 'M'; }), k: by.assets.length + ' by assets' });
  return out;
}

/* A KEYWORD SEARCH THAT REQUIRES THE READER'S WORDS IN THE SOURCE'S ORDER IS A PHRASE
 * SEARCH WEARING A KEYWORD SEARCH'S PLACEHOLDER. "ballistic glass" is the page's own
 * suggested query and it returned 0 of 978: "ballistic" lives in a note, "glass" lives in
 * the title of the SAME row, and a single substring test can never see both. Every token
 * must hit somewhere in the row; a token that is all digits is matched as a code prefix,
 * so "332" still narrows by code rather than surfacing 811430. */
function matches(r, q) {
  if (/^\d+$/.test(q)) return r[0].indexOf(q) === 0;
  var cl = r[1] && CM[r[1]] ? CM[r[1]].label.toLowerCase() : '';
  var hay = (r[2] + ' ' + (r[7] || '') + ' ' + cl).toLowerCase();
  var toks = q.split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  return toks.every(function (t) { return /^\d+$/.test(t) ? r[0].indexOf(t) === 0 : hay.indexOf(t) >= 0; });
}
function visible() {
  var M = mineMap();
  return DATA.filter(function (r) {
    if (S.scope === 'mine' && !M[r[0]]) return false;
    if (S.scope !== 'mine' && S.scope !== 'all' && r[8] !== S.scope) return false;
    if (S.q && !matches(r, S.q)) return false;
    return true;
  });
}
function scopeName() { return S.scope === 'mine' ? 'your codes' : S.scope === 'all' ? '' : SL[S.scope]; }

/* ── the rail ───────────────────────────────────────────────────────────────── */
/* Scope and taxonomy are two different questions, so they are two groups with their own
 * headings. Every sector name is the regulation's own wording, set in full — it wraps, it
 * never clips. No proportional bar: counts run 2 to 346, so on a linear scale most sectors
 * render as near-identical slivers while the exact count is already printed beside them. */
function railItem(id, label, count, opts) {
  opts = opts || {};
  var b = el('button', 'nt-ri' + (opts.scope ? ' scope' : ''));
  b.type = 'button'; b.dataset.scope = id;
  if (opts.num) b.appendChild(el('span', 'nt-ri-n mono', opts.num));
  if (opts.dot) b.appendChild(el('i', 'nt-dot'));
  b.appendChild(el('span', 'nt-ri-l', label));
  b.appendChild(el('span', 'nt-ri-c mono', fmtN(count)));
  return b;
}
function buildRail() {
  var host = document.getElementById('ntRail');
  var w = el('nav', 'nt-rail-in'); w.setAttribute('aria-label', 'Filter codes');
  w.appendChild(el('i', 'nt-ind'));
  var h1 = el('p', 'nt-rk', 'Scope');
  w.appendChild(h1);
  /* WHEN THE BAND IS PINNED, A “My codes” SCOPE IS A SECOND CONTROL FOR THE SAME THING —
   * and the register would then print the same codes a reader can already see above it.
   * The band IS my codes; the rail is left to do one job, which is taxonomy. */
  if (pinMode() === 'off') w.appendChild(railItem('mine', 'My codes', mineCount(), { dot: true, scope: true }));
  w.appendChild(railItem('all', 'All codes', DATA.length, { scope: true }));
  var h2 = el('p', 'nt-rk');
  h2.appendChild(document.createTextNode('Sector'));
  h2.appendChild(el('span', 'nt-rk-s', '13 CFR 121.201 · ' + SECTORS.length));
  w.appendChild(h2);
  SECTORS.forEach(function (s) { w.appendChild(railItem(s.id, s.label, SEC_N[s.id] || 0, { num: s.id })); });
  host.replaceChildren(w);
}
/* The indicator is a single element that MOVES between items rather than nineteen bars
 * that appear and disappear — the motion is what says "you are still in one list". */
function syncRail() {
  var rail = document.querySelector('.nt-rail-in');
  if (!rail) return;
  var on = null;
  rail.querySelectorAll('[data-scope]').forEach(function (b) {
    var is = b.dataset.scope === S.scope;
    b.classList.toggle('on', is);
    if (is) { b.setAttribute('aria-current', 'true'); on = b; } else b.removeAttribute('aria-current');
  });
  var ind = rail.querySelector('.nt-ind');
  if (ind && on) {
    ind.style.height = on.offsetHeight + 'px';
    ind.style.transform = 'translateY(' + on.offsetTop + 'px)';
    ind.style.opacity = '1';
  } else if (ind) ind.style.opacity = '0';
}

/* ── the pinned band ────────────────────────────────────────────────── */
function pinCard(r) {
  var d = el('article', 'pc'); d.dataset.code = r[0];
  var h = el('div', 'pc-h');
  var c = el('span', 'pc-code mono');
  c.appendChild(el('b', 'nt-c1', r[0].slice(0, 3)));
  c.appendChild(el('span', 'nt-c2', r[0].slice(3)));
  h.appendChild(c);
  h.appendChild(el('span', 'nt-yours', 'Yours'));
  if (r[1] && CM[r[1]]) { var ct = el('span', 'pc-cat', CM[r[1]].label); ct.dataset.ed = ''; h.appendChild(ct); }
  d.appendChild(h);
  d.appendChild(el('h4', 'pc-t', r[2]));
  var p = parts(r);
  var f = el('div', 'pc-f');
  f.appendChild(el('span', 'pc-k', 'Size standard'));
  var v = el('span', 'pc-v');
  v.appendChild(el('b', 'mono', p.fig));
  v.appendChild(el('span', 'pc-u', p.unit));
  f.appendChild(v);
  d.appendChild(f);
  if (r[5] && r[6]) {
    var f2 = el('div', 'pc-f'); f2.dataset.ed = '';
    f2.appendChild(el('span', 'pc-k', 'Typical terms'));
    var ch = el('div', 'nt-chips');
    ch.appendChild(el('span', 'nt-chip', EVAL[r[5]]));
    ch.appendChild(el('span', 'nt-chip', CLAUSE[r[6]]));
    f2.appendChild(ch);
    d.appendChild(f2);
    d.appendChild(el('span', 'nt-dir', 'directional — confirm per solicitation'));
  }
  if (r[7]) {
    var n = el('div', 'pc-n'); n.dataset.ed = '';
    n.appendChild(el('span', 'pc-nk', 'What to expect'));
    n.appendChild(el('p', 'pc-nt', r[7]));
    d.appendChild(n);
  }
  return d;
}
function pinStripItem(r) {
  var d = el('article', 'ps'); d.dataset.code = r[0];
  var c = el('span', 'ps-code mono');
  c.appendChild(el('b', 'nt-c1', r[0].slice(0, 3)));
  c.appendChild(el('span', 'nt-c2', r[0].slice(3)));
  d.appendChild(c);
  d.appendChild(el('span', 'ps-t', r[2]));
  var p = parts(r);
  var f = el('span', 'ps-f');
  f.appendChild(el('b', 'mono', p.fig));
  f.appendChild(el('span', 'ps-u', p.unit));
  d.appendChild(f);
  return d;
}
function renderPin() {
  var host = document.getElementById('ntPin');
  if (!host) return;
  var mode = pinMode();
  if (mode === 'off') { host.replaceChildren(); return; }
  var rows = MINE_ALL.slice(0, mineCount()).map(function (c) { return R.byCode[c]; }).filter(Boolean);
  var w = el('div', 'nt-pin'); w.dataset.shape = mode;
  var h = el('div', 'nt-pin-h');
  /* The live dot marks what is YOURS. It used to sit on the rail's My codes item; with the
   * band pinned that item is gone, so the dot moves with the meaning rather than staying
   * where it was drawn. One dot, one meaning, always on screen. */
  h.appendChild(el('i', 'nt-dot'));
  h.appendChild(el('b', null, 'Your registered codes'));
  h.appendChild(el('span', null, rows.length
    ? fmtN(rows.length) + (rows.length === 1 ? ' code' : ' codes') + ' · here whatever you are browsing below'
    : 'nothing registered yet'));
  w.appendChild(h);
  if (!rows.length) {
    var e = el('p', 'nt-pin-e');
    e.appendChild(document.createTextNode('Your registered codes come from your '));
    var a = el('a', null, 'Capability Statement'); a.href = '/capability-statement';
    e.appendChild(a);
    e.appendChild(document.createTextNode('. Until it is set, the register below is the whole reference.'));
    w.appendChild(e);
  } else if (mode === 'strip') {
    var g = el('div', 'nt-pin-s');
    rows.forEach(function (r) { g.appendChild(pinStripItem(r)); });
    w.appendChild(g);
  } else {
    var gc = el('div', 'nt-pin-g');
    rows.forEach(function (r) { gc.appendChild(pinCard(r)); });
    w.appendChild(gc);
  }
  host.replaceChildren(w);
}

/* ── rows ───────────────────────────────────────────────────────────────────── */
/* The boundary between the two regions is a REGION HEADING, not a count of what is shown:
 * the result line inside the register already names the scope, and a second figure moving
 * with the filter would be two clocks reading as one. What this line has to settle is that
 * the register holds EVERYTHING — including the codes pinned above, in their own sectors —
 * so nobody reads the band as having taken them out of it. */
function renderDivider() {
  var host = document.getElementById('ntDiv');
  if (!host) return;
  if (pinMode() === 'off') { host.replaceChildren(); return; }
  var n = mineCount();
  var w = el('div', 'nt-div');
  w.appendChild(el('b', null, 'The full register'));
  w.appendChild(el('span', null, fmtN(DATA.length) + ' codes with an SBA size standard, grouped by sector'
    + (n ? ' — your ' + n + ' are in here too, marked where they sit' : '')));
  host.replaceChildren(w);
}

function row(r, M, i) {
  var d = el('article', 'nt-r' + (M[r[0]] ? ' mine' : ''));
  d.dataset.code = r[0];
  d.style.setProperty('--i', Math.min(i, 14));
  var c = el('span', 'nt-c mono');
  c.appendChild(el('b', 'nt-c1', r[0].slice(0, 3)));
  c.appendChild(el('span', 'nt-c2', r[0].slice(3)));
  d.appendChild(c);
  var t = el('span', 'nt-t');
  t.appendChild(document.createTextNode(r[2]));
  if (M[r[0]]) t.appendChild(el('span', 'nt-yours', 'Yours'));
  d.appendChild(t);
  var p = parts(r);
  d.appendChild(el('b', 'nt-fig mono', p.fig));
  d.appendChild(el('span', 'nt-unit', p.unit));
  if (isEd(r)) {
    var m = el('div', 'nt-m'); m.dataset.ed = '1';
    var ch = el('div', 'nt-chips');
    ch.appendChild(el('span', 'nt-chip cat', CM[r[1]].label));
    ch.appendChild(el('span', 'nt-chip', EVAL[r[5]]));
    ch.appendChild(el('span', 'nt-chip', CLAUSE[r[6]]));
    m.appendChild(ch);
    m.appendChild(el('p', 'nt-note', r[7]));
    m.appendChild(el('span', 'nt-dir', 'directional — confirm per solicitation'));
    d.appendChild(m);
  }
  return d;
}

function groups(list) {
  var g = [];
  if (S.scope === 'mine') g.push({ id: '', label: 'Your registered codes', rows: list });
  else if (S.scope === 'all') SECTORS.forEach(function (s) {
    var rs = list.filter(function (r) { return r[8] === s.id; });
    if (rs.length) g.push({ id: s.id, label: s.label, rows: rs });
  });
  else g.push({ id: S.scope, label: SL[S.scope], rows: list });
  return g;
}

function sectionHead(g) {
  var h = el('header', 'nt-sec' + (g.id ? '' : ' nosec'));
  if (g.id) h.appendChild(el('span', 'nt-sec-n mono', g.id));
  var b = el('div', 'nt-sec-b');
  b.appendChild(el('h2', 'nt-sec-l', g.label));
  var f = el('div', 'nt-facts');
  var f0 = el('span', 'nt-fact');
  f0.appendChild(el('b', 'mono', fmtN(g.rows.length)));
  f0.appendChild(el('span', 'nt-fk', g.rows.length === 1 ? 'code' : 'codes'));
  f.appendChild(f0);
  summary(g.rows).forEach(function (s) {
    var x = el('span', 'nt-fact');
    x.appendChild(el('b', 'mono', s.v));
    x.appendChild(el('span', 'nt-fk', s.k));
    f.appendChild(x);
  });
  b.appendChild(f);
  h.appendChild(b);
  return h;
}

function emptyState() {
  var d = el('div', 'nt-empty');
  if (S.scope === 'mine' && !S.q) {
    d.appendChild(el('p', 'nt-empty-h', 'No registered codes yet'));
    var p = el('p', 'nt-empty-b');
    p.appendChild(document.createTextNode('Set your NAICS codes on the '));
    var a = el('a', null, 'Capability Statement'); a.href = '/capability-statement';
    p.appendChild(a);
    p.appendChild(document.createTextNode(' and they appear here first.'));
    d.appendChild(p);
    return d;
  }
  var digits = /^\d+$/.test(S.q);
  var h = el('p', 'nt-empty-h');
  h.appendChild(document.createTextNode(digits ? 'No code begins ' : 'Nothing matches '));
  h.appendChild(el('b', 'mono', S.q));
  if (scopeName()) h.appendChild(document.createTextNode(' in ' + scopeName()));
  d.appendChild(h);
  if (S.scope !== 'all') {
    var wide = DATA.filter(function (r) { return matches(r, S.q); }).length;
    if (wide) {
      var p2 = el('p', 'nt-empty-b');
      p2.appendChild(el('b', 'mono', fmtN(wide)));
      p2.appendChild(document.createTextNode(wide === 1 ? ' code matches in the full table.' : ' codes match in the full table.'));
      d.appendChild(p2);
      var btn = el('button', 'nt-widen'); btn.type = 'button'; btn.dataset.scope = 'all';
      btn.textContent = 'Search all ' + fmtN(DATA.length) + ' codes';
      d.appendChild(btn);
      return d;
    }
  }
  d.appendChild(el('p', 'nt-empty-b', 'Searched all ' + fmtN(DATA.length) + ' codes carrying an SBA size standard.'));
  return d;
}

function resultLine(n) {
  var b = el('div', 'nt-res');
  var t = el('p', 'nt-res-t');
  t.appendChild(el('b', 'mono', fmtN(n)));
  if (S.q) {
    t.appendChild(document.createTextNode(/^\d+$/.test(S.q) ? ' code' + (n === 1 ? '' : 's') + ' starting ' : ' matching '));
    t.appendChild(el('b', 'mono', S.q));
    if (scopeName()) t.appendChild(el('span', 'nt-res-in', ' in ' + scopeName()));
  } else if (S.scope === 'mine') t.appendChild(document.createTextNode(' registered code' + (n === 1 ? '' : 's')));
  else if (S.scope === 'all') t.appendChild(document.createTextNode(' codes with an SBA size standard'));
  else t.appendChild(document.createTextNode(' code' + (n === 1 ? '' : 's') + ' in this sector'));
  b.appendChild(t);
  b.appendChild(el('p', 'nt-res-n mono', 'size standard = SBA threshold, 13 CFR 121.201'));
  return b;
}

function render(animate) {
  renderPin();
  renderDivider();
  var M = mineMap(), list = visible();
  var main = document.getElementById('ntMain');
  var frag = document.createDocumentFragment();
  frag.appendChild(resultLine(list.length));
  var body = el('div', 'nt-body' + (animate ? ' anim' : ''));
  body.style.setProperty('--dir', S.dir);
  if (!list.length) body.appendChild(emptyState());
  /* WITH THE BAND OFF, “My codes” IS A SCOPE YOU STAND IN — and a scope holding only your
   * codes has no sparse neighbours, so the rich card is safe there. This is the two-shapes
   * problem bounded rather than solved by subtraction: the cards are reachable, but they can
   * never sit in a grid beside the 951 that will never carry editorial content. */
  else if (pinMode() === 'off' && S.scope === 'mine') {
    var gc = el('div', 'nt-pin-g mine-cards');
    list.forEach(function (r) { gc.appendChild(pinCard(r)); });
    body.appendChild(gc);
  }
  else groups(list).forEach(function (g) {
    body.appendChild(sectionHead(g));
    var sec = el('div', 'nt-rows');
    g.rows.forEach(function (r, i) { sec.appendChild(row(r, M, i)); });
    body.appendChild(sec);
  });
  frag.appendChild(body);
  main.replaceChildren(frag);
  syncRail();
}

/* Moving DOWN the rail brings rows up from below; moving UP brings them down from above.
 * The motion carries the direction of the move, so the surface reads as one list being
 * traversed rather than a panel being replaced. */
function setScope(next) {
  var a = ORDER.indexOf(S.scope), b = ORDER.indexOf(next);
  S.dir = (b >= a) ? 1 : -1;
  S.scope = next;
  render(true);
  pingDot();
  document.getElementById('ntMain').scrollTop = 0;
}
/* The one-shot ring exists only to serve the `change` tune option; under the shipped `live`
 * default the ring runs continuously and the class would be an inert marker sitting in the
 * DOM forever. A TRANSIENT CLASS THAT NEVER CLEARS IS STATE, AND STATE THE PORT DOES NOT
 * SHARE SHOWS UP AS A DIFFERENCE. A CSS animation also does not restart when a class is
 * toggled on a node that already carries it: remove, force layout, re-add. */
function pingDot() {
  if (document.documentElement.getAttribute('data-t-dot') !== 'change') return;
  var d = document.querySelector('.nt-ri.on .nt-dot');
  if (!d) return;
  d.classList.remove('ping'); void d.offsetWidth; d.classList.add('ping');
}

/* The tuning panel writes attributes; two of them change what the RAIL contains and which
 * scope is reachable, so they cannot be answered by CSS alone. Re-entering an unreachable
 * scope is the defect to avoid: with the band pinned there is no “My codes” item to stand
 * on, so the scope moves to the register's own default rather than leaving the rail with
 * nothing marked. */
function retune() {
  buildRail();
  /* The two shapes land in different places, and each landing is the one that shows the
   * reader their own codes: with the band pinned they are already on screen, so the register
   * opens on everything; with it off, “My codes” is a rail scope and the tab opens standing
   * in it. Only a CHANGE of shape moves the scope — otherwise re-tuning anything else would
   * drag the reader out of the sector they were reading. */
  var pin = pinMode();
  if (pin !== lastPin) {
    if (pin !== 'off' && S.scope === 'mine') S.scope = 'all';
    if (pin === 'off' && S.scope === 'all') S.scope = 'mine';
    lastPin = pin;
  }
  if (pin !== 'off' && S.scope === 'mine') S.scope = 'all';
  render(false);
  syncRail();
  pingDot();
}

document.addEventListener('click', function (e) {
  var s = e.target.closest && e.target.closest('[data-scope]');
  if (s) { setScope(s.getAttribute('data-scope')); return; }
});
document.addEventListener('input', function (e) {
  if (e.target.id === 'ntSearch') { S.q = e.target.value.trim().toLowerCase(); S.dir = 1; render(true); }
});
window.addEventListener('resize', syncRail);

buildRail();
render(true);
requestAnimationFrame(function () { syncRail(); pingDot(); });

/* Read `naics_saved` — the saved ROW — and nothing else. `statement.naics_codes` is a
 * read-time overlay that falls back to codes derived from won audits, so reading it would
 * badge suggestions as "My codes" for a customer who has saved none. Both response shapes
 * carry naics_saved. A failed read leaves the scope empty, which states the truth: this
 * page could not confirm any registered code. It never invents one. */
fetch('/api/capability-statement', { credentials: 'include' })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (d) {
    var saved = (d && Array.isArray(d.naics_saved)) ? d.naics_saved : [];
    var seen = {};
    saved.forEach(function (c) {
      var code = String(c).trim();
      if (code && !seen[code]) { seen[code] = 1; MINE_ALL.push(code); }
    });
    S.mine = MINE_ALL.length;
    buildRail();
    render(true);
    requestAnimationFrame(function () { syncRail(); pingDot(); });
  })
  .catch(function () { /* left empty on purpose — see above */ });

window.NTAB = { S: S, DATA: DATA, SECTORS: SECTORS, SEC_N: SEC_N, MINE_SET: MINE_SET, mineMap: mineMap, isEd: isEd, parts: parts, summary: summary, visible: visible, render: render, syncRail: syncRail, setScope: setScope, matches: matches, retune: retune, renderPin: renderPin, renderDivider: renderDivider, pinMode: pinMode, mineCount: mineCount, MINE_ALL: MINE_ALL, byCode: R.byCode };
})();
