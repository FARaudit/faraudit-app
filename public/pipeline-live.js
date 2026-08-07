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

  // auditByRef is TRI-STATE on purpose. null means the audit list has not been read,
  // or could not be — which is NOT the same as a pursuit having no audit. A card may
  // only say "No audit on file" once that list has actually arrived.
  // `loaded` records that a read SETTLED successfully, which is not the same as it
  // having returned rows. Without it an empty-but-healthy pipeline is indistinguishable
  // from one that never loaded, and the LIVE pill stays dark on a page that is in fact
  // showing live data — telling a customer with no pursuits that the page is stale.
  var STATE = { rows: [], loadError: null, loaded: false, stage: null, auditByRef: null };

  // The engine's poles, in the words the Decisions ledger uses for them. A pole with
  // no entry here is shown verbatim rather than mapped to a neighbour's word.
  var VERDICT_LABEL = {
    BID: 'Bid', BID_WITH_CAUTION: 'Bid · caution', NO_BID: 'No-bid',
    INELIGIBLE: 'Ineligible', NEEDS_HUMAN_REVIEW: 'Needs review',
    INCOMPLETE: 'Incomplete', OUT_OF_SCOPE: 'Out of scope'
  };
  function auditFor(row){
    if(!STATE.auditByRef) return undefined;                  // not known yet
    var k = String(row && row.solicitation_number || '').trim().toUpperCase();
    return STATE.auditByRef[k] || null;                      // null = known to have none
  }

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

  /* THE one ceiling derivation, so the card and the KPI strip cannot disagree.
     The strip counted `Number(v) > 0` while the card rendered on plain truthiness, so
     a legacy pre-formatted value — "$18.4M", which fmtValue passes through unchanged —
     printed "Ceiling $18.4M" on a card while the strip above it read "no ceiling
     recorded on any pursuit". One page, two contradictory claims about the same row.
     A value that will not read as a number is not a ceiling this page can stand
     behind, so neither surface claims one. */
  function ceilingOf(row){
    var n = Number(row && row.estimated_value);
    return isFinite(n) && n > 0 ? n : null;
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

  /* REMOVAL BELONGS ON THE PAGE THAT SHOWS THE PURSUIT.
     The Opportunities feed is SAM-live — it drops expired notices and caps at 200 —
     so a control that lives only on a feed card cannot reach a pursuit whose deadline
     has passed, nor one whose reference is an upload key rather than a SAM number.
     This page holds every row the customer has, so it is the one surface that can
     always reach them.

     DELETE keys on solicitation_number and is scoped to the capture stages, so it can
     legitimately match nothing. It reports `removed`, the count of rows it deleted, and
     that count is the success test: a zero-row delete is a 200 that changed nothing. */
  /* THE QUESTION IS ASKED ON THE CARD, NOT BY THE BROWSER.
     A native confirm() is host chrome: it announces the domain, cannot be styled, is
     unreadable to the page, and takes the whole window to ask one question about one
     row. Arming in place keeps the question beside the pursuit it concerns, so the
     customer can still see which one they are about to remove while deciding. Cancel
     and Escape both put it back. */
  function armRemove(row, btn, statusNode, actions){
    if(actions.querySelector('.pcard-cancel')) return;   // already armed
    var resting = btn.textContent;

    var cancel = el('button','pcard-cancel','Cancel');
    cancel.type = 'button';
    actions.appendChild(cancel);

    btn.classList.add('is-armed');
    btn.textContent = 'Remove';
    statusNode.className = 'pcard-msg ask';
    statusNode.textContent = 'Remove this pursuit? Its audit and report are kept.';
    statusNode.hidden = false;

    function disarm(){
      document.removeEventListener('keydown', onKey);
      if(cancel.parentNode) cancel.parentNode.removeChild(cancel);
      btn.classList.remove('is-armed');
      btn.textContent = resting;
      statusNode.hidden = true;
      statusNode.textContent = '';
      statusNode.className = 'pcard-msg';
      btn.onclick = function(){ armRemove(row, btn, statusNode, actions); };
    }
    function onKey(e){ if(e.key === 'Escape') disarm(); }

    document.addEventListener('keydown', onKey);
    cancel.onclick = disarm;
    btn.onclick = function(){
      document.removeEventListener('keydown', onKey);
      if(cancel.parentNode) cancel.parentNode.removeChild(cancel);
      removePursuit(row, btn, statusNode);
    };
    btn.focus();
  }

  function removePursuit(row, btn, statusNode){
    var ref = String(row && row.solicitation_number || '').trim();
    if(!ref){
      statusNode.className = 'pcard-msg';
      statusNode.textContent = 'This pursuit has no reference to remove it by.';
      statusNode.hidden = false;
      return;
    }

    btn.classList.remove('is-armed');
    btn.disabled = true;
    btn.textContent = 'Removing…';
    statusNode.hidden = true;
    statusNode.textContent = '';

    fetch('/api/pipeline?solicitationNumber=' + encodeURIComponent(ref), {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(j){
          return { ok: r.ok, status: r.status, body: j };
        });
      })
      .then(function(res){
        if(!res.ok) throw new Error((res.body && res.body.error) || ('HTTP ' + res.status));
        // A 200 is not a removal. Only the row count is.
        if(!res.body || Number(res.body.removed) < 1) throw new Error('nothing was removed');
        return loadPipeline();
      })
      .catch(function(e){
        btn.disabled = false;
        btn.textContent = 'Remove';
        // Back to resting, so a refusal can be read and then retried deliberately
        // rather than leaving a half-armed control on the card.
        btn.onclick = function(){ armRemove(row, btn, statusNode, btn.parentNode); };
        statusNode.className = 'pcard-msg';
        statusNode.textContent = 'Could not remove — ' + ((e && e.message) || 'request failed') + '.';
        statusNode.hidden = false;
        console.warn('[pipeline-live] remove failed:', e);
      });
  }

  /* CAPTURE IS A SEQUENCE, SO A PURSUIT MUST BE ABLE TO MOVE ALONG IT.
     This page draws eight stages; a pursuit that cannot leave the one it entered at
     keeps feeding the "P0 · action now" count with no in-product action able to clear
     it, leaving removal as the only exit.

     An unrecognised stage code is shown but not offered as a choice, so moving to a
     real stage is a repair rather than a silent rewrite. The row count returned by the
     write is the success test, since a zero-row update answers 200. */
  function stageControl(row, code, statusNode){
    var sel = el('select','stage-sel');
    sel.setAttribute('aria-label', 'Stage for ' + (row.title || row.solicitation_number || 'this pursuit'));
    if(!code){
      var unknown = document.createElement('option');
      unknown.value = ''; unknown.textContent = 'unrecognised stage';
      unknown.disabled = true; unknown.selected = true;
      sel.appendChild(unknown);
    }
    STAGES.forEach(function(s){
      var o = document.createElement('option');
      o.value = s; o.textContent = s + ' · ' + STAGE_LABELS[s];
      if(s === code) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function(){
      var next = sel.value;
      if(!next || next === code) return;
      sel.disabled = true;
      statusNode.hidden = true;
      statusNode.className = 'pcard-msg';
      fetch('/api/pipeline?solicitationNumber=' + encodeURIComponent(String(row.solicitation_number || '')), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageCode: next })
      })
        .then(function(r){
          return r.json().catch(function(){ return {}; }).then(function(j){ return { ok:r.ok, status:r.status, body:j }; });
        })
        .then(function(res){
          if(!res.ok) throw new Error((res.body && res.body.error) || ('HTTP ' + res.status));
          if(!res.body || Number(res.body.moved) < 1) throw new Error('nothing was moved');
          return loadPipeline();
        })
        .catch(function(e){
          sel.disabled = false;
          sel.value = code || '';
          statusNode.className = 'pcard-msg';
          statusNode.textContent = 'Could not move — ' + ((e && e.message) || 'request failed') + '.';
          statusNode.hidden = false;
          console.warn('[pipeline-live] stage move failed:', e);
        });
    };
    return sel;
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
    // The status line lives on the card, so a refused removal is reported next to
    // the thing that was not removed rather than in a toast that outlives the row.
    var statusNode = el('p','pcard-msg');
    statusNode.hidden = true;
    var rm = el('button','pcard-rm','Remove');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove ' + (c.title || c.solicitation_number || 'pursuit') + ' from pipeline');
    var actions = put(el('div','pcard-actions'), riskNode(d), rm);
    rm.onclick = function(){ armRemove(c, rm, statusNode, actions); };
    put(head, idBlock, actions);

    var meta = el('div','pcard-meta');
    put(meta, metaItem('Stage', put(el('span','v'), stageControl(c, code, statusNode))));
    put(meta, metaItem('Due', dueNode(d)));
    var ceil = ceilingOf(c);
    if(ceil !== null) put(meta, metaItem('Ceiling', el('span','v amount', fmtValue(ceil))));
    if(c.naics) put(meta, metaItem('NAICS', el('span','v', c.naics)));

    put(card, head, meta);
    if(c.notes){
      var n = el('p','pcard-agency', c.notes);
      n.style.cssText = 'margin-top:8px;font-size:11px;opacity:.65;line-height:1.5';
      card.appendChild(n);
    }
    /* THE DETAIL A PURSUIT HAS IS ITS AUDIT. Three states, and they are different
       answers: a report to open, no audit on file, or an audit list this page could
       not read — in which case the card says nothing rather than guessing. The
       no-audit case is deliberately NOT a link: the only page that would run one
       starts a paid run, and a card is not the place to send someone into that. */
    var found = auditFor(c);
    if (found) {
      var pole  = String(found.v3_verdict || '').toUpperCase().replace(/[\s-]+/g, '_');
      var label = VERDICT_LABEL[pole]
        || (String(found.status || '').toLowerCase() === 'complete' ? (pole || 'Unresolved') : 'In flight');
      var open  = el('a', 'pcard-open');
      open.href = '/audit/' + encodeURIComponent(String(c.solicitation_number));
      put(open, el('span', 'po-v', label), el('span', 'po-go', 'Open audit →'));
      card.appendChild(open);
    } else if (found === null) {
      card.appendChild(el('p', 'pcard-none', 'No audit on file for this pursuit.'));
    }

    card.appendChild(statusNode);
    return card;
  }

  function countsByStage(){
    var c = {}; STAGES.forEach(function(s){ c[s] = { n:0, p0:0, over:0, week:0, cliff:0 }; });
    STATE.rows.forEach(function(r){
      var s = stageOf(r); if(!s) return;
      var d = daysOf(r);
      c[s].n++;
      if(isP0(d)) c[s].p0++;
      if(d !== null && d < 0) c[s].over++;
      if(isDueWeek(d)) c[s].week++;
      if(d !== null && d >= 0 && d <= 3) c[s].cliff++;
    });
    return c;
  }

  // ── ground and ink ────────────────────────────────────────────
  // A ramp cell can be near-white or near-navy, so ink is derived against the
  // ground it actually lands on rather than declared once for all eight.
  function hx(h){
    var c = String(h).replace('#','').trim();
    if(c.length === 3) c = c.split('').map(function(x){ return x + x; }).join('');
    return [0,2,4].map(function(i){ return parseInt(c.substr(i,2),16); });
  }
  function lum(h){
    var a = hx(h).map(function(v){ v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); });
    return .2126*a[0] + .7152*a[1] + .0722*a[2];
  }
  function ratio(a,b){ var l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); }
  function mix(a,b,t){
    var pa = hx(a), pb = hx(b);
    return '#' + [0,1,2].map(function(i){
      return ('0' + Math.round(pa[i]*t + pb[i]*(1-t)).toString(16)).slice(-2);
    }).join('');
  }
  function cssv(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function inkFor(bg){
    var dark = '#0A1628', light = '#ffffff';
    var rd = ratio(dark,bg), rl = ratio(light,bg), ink = rd >= rl ? dark : light;
    // A SUBDUED INK IS NOT A FIXED ALPHA. rgba(navy,.62) clears 4.5 on white and
    // lands at 1.80:1 on the accent — one token, two grounds, which is the defect.
    // Step down from the ink and stop at the last value that still clears HERE.
    var sub = ink, need = 4.5;
    [.55,.65,.75,.85].some(function(t){
      var c = mix(ink, bg, t);
      if(ratio(c,bg) >= need){ sub = c; return true; }
      return false;
    });
    // No alarm tone is returned, and that is deliberate. A red clears AA on only 5 of
    // the 16 ramp steps, so hue here would encode by STAGE rather than by state: the
    // same expired clock red at one stage and not at another. Callers on a ramp get
    // ink and weight only. Hue lives where the ground is fixed — the strip's figures
    // take --alarm from CSS, forked per field.
    return { ink:ink, sub:sub };
  }

  // Five clock kinds, not one countdown — a single uniform countdown would be a
  // lie in six of the eight cells.
  var CLOCK = { '01':'none','02':'hard','03':'hard','04':'internal',
                '05':'cliff','06':'elapsed','07':'hard','08':'none' };
  // Red means a clock that ran out, and only where the move is the reader's.
  // Stuck is not red, because it is not your move.
  var ACT = ['01','02','03','04','05'];

  function clockLine(s, k){
    if(k.n === 0) return { t:'none', hot:false };
    var kind = CLOCK[s], out;
    if(kind === 'cliff')         out = k.cliff ? { t:k.cliff + ' in 72h', hot:true } : { t:'none in 72h', hot:false };
    else if(k.over)              out = { t:k.over + ' past due', hot:true };
    else if(kind === 'hard')     out = k.week  ? { t:k.week + ' in window', hot:true } : { t:'none in window', hot:false };
    else if(kind === 'internal') out = k.p0    ? { t:k.p0 + ' at P0', hot:false } : { t:'in production', hot:false };
    // 06 Evaluation. "Elapsed, not remaining" needs a stage-entry timestamp, and the
    // pipeline table records none — only due_date is on file. Deriving "34d out" from
    // any column we DO have would be a fabricated duration, so the cell states what it
    // knows. Never alarmed: time sitting with the government is not your failure.
    else if(kind === 'elapsed')  out = { t:'elapsed not tracked', hot:false };
    else                         out = { t:'no clock', hot:false };
    // Enforced here, not left to the data: an overdue row parked in 06/07/08 would
    // otherwise alarm a stage whose move is not the operator's.
    if(ACT.indexOf(s) < 0) out.hot = false;
    return out;
  }

  function visibleRows(){
    if(!STATE.stage) return STATE.rows.slice();
    return STATE.rows.filter(function(r){ return stageOf(r) === STATE.stage; });
  }

  // ── writers ──────────────────────────────────────────────────────────────
  // K1 SPLIT LEDGER. Two things you HAVE, a fence, two things that NEED you. A
  // demand differs from an inventory count by border weight, label ink and figure
  // colour — three channels, none load-bearing alone. And nothing is alarmed when
  // there is nothing to do: at zero a demand drops back to a 1px line and loses
  // --alarm, because a strip that looks urgent on an empty pipeline teaches the
  // operator to ignore it.
  function splitUnit(str){
    var m = String(str).match(/^(.*?)([MK])$/);
    return m ? { v:m[1], u:m[2] } : { v:String(str), u:'' };
  }
  function kbox(kind, lab, val, unit, foot, live){
    var d = el('div','kpi');
    d.dataset.kind = kind;
    if(live) d.dataset.live = live;
    var v = el('span','kval', val);
    v.dataset.v = val;                       // what the figure claims, for measurement
    if(unit) v.appendChild(el('span','u', unit));
    var f = el('span','kfoot');
    foot.forEach(function(part){
      f.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
    });
    return put(d, el('span','klab', lab), v, f);
  }
  function khint(text, right){
    return el('span','hint' + (right ? ' r' : ''), text);
  }
  function kfence(){ return put(el('span','fence'), el('i')); }

  function writeKPIs(){
    var strip = document.getElementById('kstrip');
    if(!strip) return;

    // A failed request supports NO claim about the portfolio — not even zero, and
    // certainly not a demand. Both demand cards go data-live="no" so the strip
    // cannot look urgent about a portfolio it failed to read.
    if(STATE.loadError){
      strip.replaceChildren(
        khint('What you have'), khint('What needs you', true),
        kbox('have','In flight','—','',['could not load']),
        kbox('have','Pipeline value','—','',['could not load']),
        kfence(),
        kbox('need','P0 · action now','—','',['could not load'],'no'),
        kbox('need','Due ≤ 7 days','—','',['could not load'],'no'));
      return;
    }

    var rows = STATE.rows;
    var occupied = STAGES.filter(function(s){
      return rows.some(function(r){ return stageOf(r) === s; });
    }).length;
    // Sum only the ceilings actually on file, and SAY how many that was. A total of
    // $0 over rows that simply have no ceiling recorded reads as "worth nothing",
    // which is a claim the data does not make — so absent renders as an em dash.
    var withVal = rows.filter(function(r){ return ceilingOf(r) !== null; });
    var total   = withVal.reduce(function(a,r){ return a + ceilingOf(r); }, 0);
    var money   = withVal.length ? splitUnit(fmtValue(total)) : { v:'—', u:'' };

    var days    = rows.map(daysOf);
    var p0      = days.filter(isP0).length;
    var week    = days.filter(isDueWeek).length;
    var overdue = days.filter(function(d){ return d !== null && d < 0; }).length;

    strip.replaceChildren(
      khint('What you have'), khint('What needs you', true),

      kbox('have','In flight', String(rows.length), '',
        rows.length
          ? ['active pursuits across ', el('b',null,occupied), ' stage' + (occupied === 1 ? '' : 's')]
          : ['nothing ingested yet']),

      kbox('have','Pipeline value', money.v, money.u,
        withVal.length
          ? ['stated ceiling · ', el('b',null,withVal.length), ' of ' + rows.length + ' pursuits have one']
          : (rows.length ? ['no ceiling recorded on any pursuit'] : ['no pursuits yet'])),

      kfence(),

      kbox('need','P0 · action now', String(p0), '',
        p0 ? (overdue ? ['critical — ', el('b',null,overdue + ' past due')] : ['critical, none past due'])
           : ['nothing at P0'],
        p0 > 0 ? 'yes' : 'no'),

      kbox('need','Due ≤ 7 days', String(week), '',
        week ? ['closing this week'] : ['nothing closing this week'],
        week > 0 ? 'yes' : 'no'));
  }

  function buildRail(){
    var rail = document.getElementById('rail');
    if(!rail) return;
    if(STATE.loadError){ rail.replaceChildren(); return; }
    var c = countsByStage();
    var muted = cssv('--mute') || '#64748b';
    var cells = STAGES.map(function(s, i){
      var k = c[s], n = k.n, empty = n === 0;
      // The ramp is read from the CSS custom properties, so it follows the field:
      // deeper toward award on white, brighter toward award on navy.
      var bg = cssv('--ramp-' + (i+1)) || '#ffffff';
      var tone = inkFor(bg);
      var ink = empty ? muted : tone.ink;
      var sub = empty ? muted : tone.sub;
      var cl  = clockLine(s, k);
      var hot = cl.hot && !empty;

      var b = el('button','cell' + (empty ? ' is-empty' : '') +
                          (STATE.stage === s && !empty ? ' is-active' : ''));
      b.type = 'button';
      b.dataset.stage = s;
      if(empty) b.disabled = true;
      // An empty cell is STRUCTURALLY empty: no ramp fill at all, just the 1px inset
      // outline from CSS. It is not a ramp step, so it does not paint one.
      if(!empty) b.style.background = bg;
      b.style.color = ink;

      var num = el('span','snum', s);
      num.style.color = sub;
      var top = put(el('span','top'), num, el('span','scount', n));

      // HUE IS NEVER THE RAIL'S CARRIER. Reddest-that-clears is correct on a stable
      // ground, but a red only clears AA on 5 of the 16 ramp steps, so the same
      // state — a clock that ran out — would render red at one stage and ink at
      // another, and a pursuit moving 03 -> 07 would change alarm treatment without
      // changing meaning. On the rail a hot clock is ALWAYS full ink plus the marker;
      // the ramp is the graphic, so the graphic cannot also be the alarm. Hue stays
      // where the ground is fixed: the strip's figures, on a card.
      var clock = el('span','sclock', (hot ? '▸ ' : '') + cl.t);
      clock.style.color = hot ? tone.ink : sub;
      var foot = put(el('span'), el('span','sname', STAGE_LABELS[s]), clock);

      put(b, top, foot);
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
    var withVal = rows.filter(function(r){ return ceilingOf(r) !== null; });
    var total = withVal.reduce(function(a,r){ return a + ceilingOf(r); }, 0);

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
    setLivePill(!STATE.loadError && STATE.loaded);
  }

  // The rail's grounds and every ink derived from them are computed AT RENDER from
  // the live custom properties, so a theme flip after first paint would otherwise
  // leave the light-field ramp painted on a navy card. Watch the attribute the
  // toggle actually writes rather than reaching into that script.
  function watchField(){
    if(typeof MutationObserver !== 'function') return;
    var last = document.documentElement.getAttribute('data-theme');
    new MutationObserver(function(){
      var now = document.documentElement.getAttribute('data-theme');
      if(now !== last){ last = now; render(); }
    }).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
  }

  function wirePipeline(){
    var b = document.getElementById('allBtn');
    if(b) b.addEventListener('click', function(){ STATE.stage = null; render(); });
    watchField();
    loadPipeline();
  }

  // The ONE read. Removal re-reads through this rather than splicing STATE.rows,
  // so what the page shows after a delete is what the server actually holds — a
  // local splice would render a removal the database may not have performed.
  function loadPipeline(){
    return fetch('/api/pipeline', { credentials: 'include' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data){
        STATE.loadError = null;
        STATE.loaded = true;
        STATE.rows = (data && data.pipeline) || [];
        var unknown = STATE.rows.filter(function(r){ return !stageOf(r); });
        if(unknown.length) console.warn('[pipeline-live] ' + unknown.length + ' row(s) carry an unrecognised stage code');
        render();
        console.log('[pipeline-live] rendered ' + STATE.rows.length + ' pursuits');
        return loadAudits();
      })
      .catch(function(e){
        // A failed request is a FAILURE, never an empty pipeline. No earlier
        // render may be left standing underneath a broken fetch.
        STATE.loadError = (e && e.message) || 'network error';
        STATE.loaded = false;
        STATE.rows = [];
        render();
        console.warn('[pipeline-live] failed:', STATE.loadError);
      });
  }

  /* A pursuit's detail already exists: it is the audit report. /audit/[id] resolves a
     solicitation number as a slug and returns the most recent audit for it, so a card
     needs no id lookup to link there — only the knowledge of WHETHER one exists.
     Read separately from the pipeline, and deliberately not fatal: a pursuit list that
     rendered must not be torn down because the audit list failed. On failure
     auditByRef stays null and the cards claim nothing either way. */
  function loadAudits(){
    return fetch('/api/audits?limit=201', { credentials: 'include' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data){
        var list = (data && (data.audits || data.rows || data.data)) || [];
        var map = {};
        list.forEach(function(a){
          [a.solicitation_number, a.notice_id].forEach(function(k){
            if(!k) return;
            var key = String(k).trim().toUpperCase();
            var prev = map[key];
            // Most recent wins — a package audited repeatedly opens its latest report.
            if(!prev || new Date(a.completed_at || a.created_at) > new Date(prev.completed_at || prev.created_at)) map[key] = a;
          });
        });
        STATE.auditByRef = map;
        render();
      })
      .catch(function(e){
        STATE.auditByRef = null;
        console.warn('[pipeline-live] audit lookup failed:', (e && e.message) || e);
      });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wirePipeline);
  } else {
    wirePipeline();
  }
})();
