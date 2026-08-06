/* Pipeline — the page's ONLY renderer.
 *
 * Invariants this file exists to hold:
 *
 *  1. ONE renderer owns the KPI strip, the stage rail, the banner and the cards.
 *     Two renderers on one region means a click can hand the region to the wrong
 *     one, and nothing in the markup may state a number before the fetch settles.
 *  2. ONE stage-code format, '01'..'08' — the DB check constraint, the API,
 *     data-stage, and every lookup key. A second format cannot be compared to
 *     the first and fails silently.
 *  3. ONE urgency derivation, daysOf(). The cards, the rail's P0 pills and both
 *     deadline KPIs read it, so they cannot disagree.
 *  4. EVERY customer value reaches the page through textContent, never through a
 *     markup string. title/agency/naics/notes are stored verbatim from SAM, so
 *     building nodes instead of markup removes the injection class outright
 *     rather than depending on an escaper being exhaustive.
 *  5. Empty renders EMPTY; a failed request renders a FAILURE. They are different
 *     answers, neither may look like the other, and neither may look like data.
 */
(function(){
  'use strict';

  var STAGES = ['01','02','03','04','05','06','07','08'];
  var STAGE_LABELS = {
    '01':'Pre-Sol Synopsis','02':'Sources Sought','03':'Solicitation',
    '04':'Proposal Dev','05':'Submission','06':'Evaluation',
    '07':'Award','08':'Post-Award'
  };
  var STAGE_FULL = {
    '01':'Pre-Solicitation Synopsis','02':'Sources Sought / RFI','03':'Solicitation Released',
    '04':'Proposal Development','05':'Submission','06':'Government Evaluation',
    '07':'Award & Performance','08':'Post-Award'
  };

  var STATE = { rows: [], loadError: null, stage: null };

  // ── tiny DOM builders — the only way anything reaches the page ────────────
  function el(tag, cls, text){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = String(text);
    return n;
  }
  function put(parent){
    for(var i=1;i<arguments.length;i++) if(arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  function stageOf(row){
    var s = String(row && row.stage || '').trim();
    return STAGE_LABELS[s] ? s : null; // an unrecognised code is not silently rehomed
  }

  // estimated_value is a plain dollar number. Legacy rows holding a pre-formatted
  // string like "$18.4M" are passed through unchanged.
  function fmtValue(v){
    var n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!isFinite(n) || /[^0-9.\-]/.test(String(v).trim())) return String(v);
    if (n >= 1e6) { var m = n/1e6; return '$' + (m % 1 === 0 ? m : m.toFixed(1)) + 'M'; }
    if (n >= 1e3) { var k = n/1e3; return '$' + (k % 1 === 0 ? k : k.toFixed(1)) + 'K'; }
    return '$' + n.toLocaleString();
  }

  // THE one urgency derivation. Null means no due date on file — which is not
  // "not urgent", it is unknown, and it never counts toward a deadline KPI.
  function daysOf(row){
    if(!row || !row.due_date) return null;
    var t = new Date(row.due_date).getTime();
    if(isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 864e5);
  }
  function isP0(d){ return d !== null && d <= 2; }        // overdue or inside 2 days
  function isDueWeek(d){ return d !== null && d >= 0 && d <= 7; }

  function dueNode(d){
    if(d === null) return el('span','v','—');
    if(d < 0)  return el('span','v crit','expired');
    if(d <= 2) return el('span','v crit', d + 'd left');
    if(d <= 7) return el('span','v warn', d + 'd left');
    return el('span','v', d + 'd left');
  }
  function riskNode(d){
    if(d === null || d > 7) return el('span','risk-badge p2','—');
    return d <= 2 ? el('span','risk-badge p0','P0') : el('span','risk-badge p1','P1');
  }
  function metaItem(label, valueNode){
    return put(el('div','item'), el('span','k',label), valueNode);
  }

  function buildCard(c){
    var d = daysOf(c);
    var code = stageOf(c);
    // .p0/.p1 are the classes the stylesheet actually binds (the retired
    // priority-p0/priority-p1 pair matched no rule, so the spine never coloured).
    var pri = d === null ? '' : (d <= 2 ? ' p0' : d <= 7 ? ' p1' : '');
    var card = el('article','pcard' + pri);

    var head = el('div','pcard-head');
    var idBlock = el('div');
    put(idBlock,
      el('div','pcard-id', c.solicitation_number || '—'),
      el('h2','pcard-title', c.title || 'Untitled'),
      el('p','pcard-agency', c.agency || '—'));
    put(head, idBlock, riskNode(d));

    var meta = el('div','pcard-meta');
    var stagePill = el('span','stage-pill', code ? code + ' · ' + STAGE_LABELS[code] : 'unrecognised stage');
    put(meta, metaItem('Stage', put(el('span','v'), stagePill)));
    put(meta, metaItem('Due', dueNode(d)));
    if(c.estimated_value) put(meta, metaItem('Ceiling', el('span','v amount', fmtValue(c.estimated_value))));
    if(c.naics) put(meta, metaItem('NAICS', el('span','v', c.naics)));

    put(card, head, meta);
    if(c.notes){
      var n = el('p','pcard-agency', c.notes);
      n.style.cssText = 'margin-top:8px;font-size:11px;opacity:.65;line-height:1.5';
      card.appendChild(n);
    }
    return card;
  }

  function countsByStage(){
    var c = {}; STAGES.forEach(function(s){ c[s] = { n:0, p0:0 }; });
    STATE.rows.forEach(function(r){
      var s = stageOf(r); if(!s) return;
      c[s].n++;
      if(isP0(daysOf(r))) c[s].p0++;
    });
    return c;
  }

  function visibleRows(){
    if(!STATE.stage) return STATE.rows.slice();
    return STATE.rows.filter(function(r){ return stageOf(r) === STATE.stage; });
  }

  // ── writers ──────────────────────────────────────────────────────────────
  function writeKPIs(){
    var k = document.querySelectorAll('.kpi-strip .kpi');
    function set(i, val, foot){
      if(!k[i]) return;
      var v = k[i].querySelector('.kpi-val'); if(v) v.textContent = val;
      var f = k[i].querySelector('.foot');    if(f) f.textContent = foot;
    }
    // A failed request supports NO claim about the portfolio — not even zero.
    if(STATE.loadError){
      for(var i=0;i<4;i++) set(i, '—', 'could not load');
      return;
    }
    var rows = STATE.rows;
    var occupied = STAGES.filter(function(s){
      return rows.some(function(r){ return stageOf(r) === s; });
    }).length;
    set(0, String(rows.length),
        'active pursuits across ' + occupied + ' stage' + (occupied === 1 ? '' : 's'));

    // Sum only the ceilings actually on file, and SAY how many that was. A total
    // of $0 over rows that simply have no ceiling recorded reads as "worth
    // nothing", which is a claim the data does not make.
    var withVal = rows.filter(function(r){ return Number(r.estimated_value) > 0; });
    var total = withVal.reduce(function(a,r){ return a + Number(r.estimated_value); }, 0);
    set(1, withVal.length ? fmtValue(total) : '—',
        withVal.length
          ? 'stated ceiling · ' + withVal.length + ' of ' + rows.length + ' pursuits have one'
          : (rows.length ? 'no ceiling recorded on any pursuit' : 'no pursuits yet'));

    var days = rows.map(daysOf);
    var overdue = days.filter(function(d){ return d !== null && d < 0; }).length;
    set(2, String(days.filter(isP0).length),
        overdue ? overdue + ' overdue · rest due within 2 days' : 'overdue or due within 2 days');
    set(3, String(days.filter(isDueWeek).length), 'submissions closing within 7 days');
  }

  function buildRail(){
    var rail = document.getElementById('rail');
    if(!rail) return;
    if(STATE.loadError){ rail.replaceChildren(); return; }
    var c = countsByStage();
    var max = Math.max.apply(null, STAGES.map(function(s){ return c[s].n; }).concat([1]));
    var cells = STAGES.map(function(s){
      var n = c[s].n, empty = n === 0;
      var b = el('button','stage-cell' + (STATE.stage === s ? ' active' : '') + (empty ? ' empty' : ''));
      b.type = 'button';
      b.dataset.stage = s;
      if(empty) b.disabled = true;
      var bottom = el('span','stage-bottom');
      var vol = el('span','vol');
      var bar = el('i');
      bar.style.height = (empty ? 6 : Math.max(8, Math.round(n / max * 28))) + 'px';
      put(vol, bar);
      put(bottom, el('span','stage-num-big', n), vol);
      put(b, el('span','stage-num', s), el('span','stage-name', STAGE_LABELS[s]), bottom);
      if(c[s].p0 > 0) b.appendChild(el('span','stage-p0', c[s].p0 + ' P0'));
      // Bound here, on the node that exists NOW. buildRail() replaces this subtree
      // on every render, so a listener attached elsewhere would be silently dropped.
      if(!empty) b.addEventListener('click', function(){
        STATE.stage = (STATE.stage === s) ? null : s;
        render();
      });
      return b;
    });
    rail.replaceChildren.apply(rail, cells);
  }

  function writeBanner(){
    var elm = document.getElementById('banner');
    if(!elm) return;
    if(STATE.loadError){ elm.replaceChildren(); return; }
    var rows = visibleRows();
    var withVal = rows.filter(function(r){ return Number(r.estimated_value) > 0; });
    var total = withVal.reduce(function(a,r){ return a + Number(r.estimated_value); }, 0);

    var left = el('span');
    var strong = el('b');
    if(STATE.stage){
      strong.textContent = 'Stage ' + STATE.stage + ' — ' + STAGE_FULL[STATE.stage];
      left.appendChild(document.createTextNode('Showing '));
      left.appendChild(strong);
      left.appendChild(document.createTextNode(' · ' + rows.length + ' pursuit' + (rows.length === 1 ? '' : 's')));
    } else {
      strong.textContent = 'all ' + rows.length + ' pursuit' + (rows.length === 1 ? '' : 's');
      left.appendChild(document.createTextNode('Showing '));
      left.appendChild(strong);
    }
    var right = el('span','bval');
    if(withVal.length){
      right.appendChild(document.createTextNode(STATE.stage ? 'Stage ceiling ' : 'Total ceiling '));
      right.appendChild(el('b', null, fmtValue(total)));
    }
    elm.replaceChildren(left, right);
  }

  function emptyState(title, sub){
    var w = el('div','empty-stage');
    return put(w, el('div','t', title), el('div','s', sub));
  }

  function writeCards(){
    var grid = document.getElementById('cards') || document.querySelector('.cards-grid');
    if(!grid) return;

    // THREE distinct outcomes that must never wear each other's clothes.
    if(STATE.loadError){
      grid.replaceChildren(emptyState(
        'Your pipeline could not be loaded',
        'A connection problem, not an empty pipeline — nothing has been lost. Reload to try again.'));
      return;
    }
    var rows = visibleRows();
    if(!rows.length){
      if(STATE.stage){
        grid.replaceChildren(emptyState('No pursuits in stage ' + STATE.stage,
          STAGE_FULL[STATE.stage] + ' — click the stage again to show every pursuit.'));
      } else {
        grid.replaceChildren(emptyState('No pursuits yet',
          'Add a solicitation from Opportunities and it appears here, at the stage the notice is in.'));
      }
      return;
    }
    // Soonest due first; rows with no due date sort LAST rather than first —
    // absent is not imminent.
    rows.sort(function(a,b){
      var da = daysOf(a), db = daysOf(b);
      if(da === null && db === null) return 0;
      if(da === null) return 1;
      if(db === null) return -1;
      return da - db;
    });
    grid.replaceChildren.apply(grid, rows.map(buildCard));
  }

  function writeShowAll(){
    var b = document.getElementById('allBtn');
    if(!b) return;
    if(STATE.loadError){ b.hidden = true; return; }
    b.hidden = !STATE.stage;                       // only offered when a filter is on
    b.textContent = 'Show all ' + STATE.rows.length + ' →';
  }

  // The green LIVE pill claims this page is showing live data, so only a settled
  // fetch may turn it on. Gated by test/public/_rail-live-badge.test.ts Part L.
  function setLivePill(on){
    var p = document.getElementById('livePill');
    if(p) p.hidden = !on;
  }

  function render(){
    writeKPIs();
    buildRail();
    writeBanner();
    writeCards();
    writeShowAll();
    setLivePill(!STATE.loadError && STATE.rows.length > 0);
  }

  function wirePipeline(){
    var b = document.getElementById('allBtn');
    if(b) b.addEventListener('click', function(){ STATE.stage = null; render(); });

    fetch('/api/pipeline', { credentials: 'include' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data){
        STATE.loadError = null;
        STATE.rows = (data && data.pipeline) || [];
        var unknown = STATE.rows.filter(function(r){ return !stageOf(r); });
        if(unknown.length) console.warn('[pipeline-live] ' + unknown.length + ' row(s) carry an unrecognised stage code');
        render();
        console.log('[pipeline-live] rendered ' + STATE.rows.length + ' pursuits');
      })
      .catch(function(e){
        // A failed request is a FAILURE, never an empty pipeline. No earlier
        // render may be left standing underneath a broken fetch.
        STATE.loadError = (e && e.message) || 'network error';
        STATE.rows = [];
        render();
        console.warn('[pipeline-live] failed:', STATE.loadError);
      });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wirePipeline);
  } else {
    wirePipeline();
  }
})();
