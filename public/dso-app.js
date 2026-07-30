/* Opportunities — the render layer, ported 1:1 from the design drop.
 *
 * WHAT IS DESIGN'S AND UNTOUCHED: verdict()/VERDICTS/BANDS (one classifier drives
 * every band, count and group header, so they cannot disagree), saRender(),
 * clause(), the buyer name maps, and renderHeader/renderKPIs/renderBands/
 * renderAct/renderControls. Those arrived verbatim; only the FIELD NAMES changed.
 *
 * THE FIELD REMAP, which is the whole reason a copy-paste port would have failed
 * silently: Design builds against a baked fixture whose rows are {i,n,t,dep,off,
 * c,s,g,y}. The live feed emits {id,notice_id,title,agency,office,naics,sa,stage,
 * days}. A verbatim copy throws NOTHING — every field reads undefined, the page
 * renders empty, and Design's own checks still pass because they read the same
 * fixture. Remap applied per-occurrence, not globally: `b.t` inside BANDS is a
 * BAND TITLE, and `r.n`/`f.t`/`v.t` are reason, funnel and view objects — none of
 * them are rows, and rewriting them would have broken the hero.
 *
 * WHAT CODE OWNS AND CHANGED, in three places only:
 *   1. sortRows — Design's three sorts are kept exactly (Closing first · Longest
 *      window · Buyer) but their comparators are rebuilt on cmpMissingLast.
 *      Design's file ships `(a.days??Infinity)-(b.days??Infinity)`, which is
 *      Infinity−Infinity = NaN on any two undated rows: the identical defect
 *      fixed here days ago. A design decision is which sorts exist; a comparator
 *      being valid is not a design decision.
 *   2. rowHTML's two action buttons — Design's static file renders them inert
 *      (a baked fixture has no hydrate) and says so. The live wiring, the ids
 *      they carry and the four states are Code's.
 *   3. The data layer below — readSet/base/ROWS replace the fixture and the
 *      review-only example PROFILE.
 */
(function () {
  'use strict';
  const D = window.DSO;
  const $ = (id) => document.getElementById(id);

  // Every string here originates in the SAM feed (poster-controlled text) and is
  // interpolated into innerHTML, so it MUST be escaped. Covers attribute context.
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // A LIVE reference, not a copy: opportunities-live.js mutates this array in
  // place (`OPPS.length = 0; OPPS.push(...)`) when the feed answers, so binding
  // the reference once keeps every render reading the current rows.
  const ROWS = D.OPPS;

  // Design's two corpora, on production data. readSet() is everything the feed
  // returned; base() applies the customer's own NAICS pills. The funnel's
  // subtraction (read − outNaics) is the difference between them, which is why
  // they must stay two functions and not one.
  function readSet() { return ROWS.slice(); }
  function base() {
    return readSet().filter((o) => !(S.naics.size && o.naics && !S.naics.has(o.naics)));
  }

  // The client is never sent certifications, and under the engine's provenance
  // discipline a self-asserted one cannot clear a set-aside bar anyway — so the
  // "no certifications on record" state Design designed is the truthful one here,
  // not a placeholder. It stops being empty when verified records exist.
  const PROFILE = { certs: [] };

  // `-Infinity − -Infinity` is NaN and a NaN comparator is non-transitive:
  // Array#sort then leaves the group in an implementation-defined order. Missing
  // values park at the END regardless of direction — a row with no deadline is
  // not "soonest" and not "latest", it is absent.
  function cmpMissingLast(xv, yv, dir) {
    const x = xv == null ? Infinity : xv, y = yv == null ? Infinity : yv;
    if (x === y) return 0;
    if (!isFinite(x)) return 1;
    if (!isFinite(y)) return -1;
    return dir * (x - y);
  }

const VERDICTS = {
  READ  : {k:'READ',  word:'READ ONLY', band:'screened', cls:'vd-read',
           rule:'Special Notice — industry day, amendment or cancellation. No solicitation document has posted for this requirement.'},
  ASSERT: {k:'ASSERT',word:'ASSERT',    band:'screened', cls:'vd-assert',
           rule:'Sole-source intent published. Not open competition — the move is to assert capability inside the window.'},
  SHAPE : {k:'SHAPE', word:'SHAPE',     band:'shape',    cls:'vd-shape',
           rule:'Pre-solicitation or Sources Sought. The requirement is not fixed yet.'},
  ACT   : {k:'ACT',   word:'ACT',       band:'act',      cls:'vd-act',
           rule:'Open solicitation closing within 7 days.'},
  QUEUE : {k:'QUEUE', word:'QUEUE',     band:'queue',    cls:'vd-queue',
           rule:'Open solicitation with more than 7 days left.'}
};
function verdict(o){
  if(o.stage==='notice') return VERDICTS.READ;
  if(o.sa==='SoleSource') return VERDICTS.ASSERT;
  if(o.stage==='presol'||o.stage==='sources') return VERDICTS.SHAPE;
  if(o.days!=null&&o.days<=7) return VERDICTS.ACT;
  return VERDICTS.QUEUE;
}
const BANDS = [
  {k:'act',     t:'Act this week',  rule:'open solicitation · closes within 7 days', go:'these are your bids'},
  {k:'shape',   t:'Shape upstream', rule:'pre-solicitation + sources sought · requirement not fixed', go:'influence the scope'},
  {k:'queue',   t:'In the queue',   rule:'open solicitation · more than 7 days left', go:'read when you get to it'},
  {k:'screened',t:'Screened out',   rule:'nothing here is a bid you can place', go:'stop reading these'}
];

/* ── set-aside register: 5 poles, each with its own fill AND its own mark, so
   the encoding survives greyscale. SoleSource must never share a register with
   Full & Open — one means anyone may compete, the other means you may not. ── */
const SA_RESTRICTED = ['SB','SDVOSB','8(a)','HUBZone','WOSB','EDWOSB'];
function saRender(s){
  if(s==='SoleSource')  return {cls:'sa-barred',    label:'SOLE SOURCE',    reg:'barred'};
  if(s==='UNKNOWN')     return {cls:'sa-unread',    label:'SET-ASIDE UNREAD',reg:'unread'};
  if(s==='SB-Partial')  return {cls:'sa-partial',   label:'SB · PARTIAL',   reg:'partial'};
  if(SA_RESTRICTED.includes(s)) return {cls:'sa-restricted', label:s.toUpperCase(), reg:'restricted'};
  return {cls:'sa-open', label:'FULL & OPEN', reg:'open'};
}
const STAGE_LABEL = {rfp:'Open RFP', sources:'Sources Sought', presol:'Pre-Solicitation', notice:'Special Notice', eval:'In Evaluation', UNKNOWN:'Type not recognised'};
/* Buyer display names are MAPPED, not heuristically title-cased: a rule that
   preserves short all-caps tokens turned "DEPT OF THE AIR FORCE" into
   "AIR Force". Seven offices and four departments exist in this read; an
   unmapped value falls through to the raw string AND is counted by C11, so a
   new buying office shows up as a check failure instead of a mangled label. */
const OFFICE_NAME = {
  'DEFENSE LOGISTICS AGENCY':'Defense Logistics Agency',
  'US COAST GUARD':'US Coast Guard',
  'DEPT OF THE AIR FORCE':'Air Force',
  'DEPT OF THE NAVY':'Navy',
  'DEPT OF THE ARMY':'Army',
  'NATIONAL AERONAUTICS AND SPACE ADMINISTRATION':'NASA',
  'FEDERAL BUREAU OF INVESTIGATION':'FBI'
};
const DEPT_NAME = {
  'DEPT OF DEFENSE':'Dept of Defense',
  'HOMELAND SECURITY, DEPARTMENT OF':'Homeland Security',
  'NATIONAL AERONAUTICS AND SPACE ADMINISTRATION':'NASA',
  'JUSTICE, DEPARTMENT OF':'Justice'
};
const UNMAPPED = new Set();
const officeName = (o)=>{ if(!o) return '\u2014'; if(OFFICE_NAME[o]) return OFFICE_NAME[o]; UNMAPPED.add(o); return o; };
const deptName   = (d)=>{ if(DEPT_NAME[d]) return DEPT_NAME[d]; UNMAPPED.add(d); return d; };
const OFFICE_SHORT = officeName;
const TITLECASE = (s)=>s.replace(/[A-Za-z][A-Za-z'()./-]*/g,w=>/^[A-Z0-9'()./-]{1,4}$/.test(w)?w:w[0]+w.slice(1).toLowerCase());

/* ── the per-row clause: composed from the row's OWN facts, never a template
   branch. The live page produced 5 strings for 197 rows, one of them on 78%. ── */
function clause(o){
  const v = verdict(o), d = o.days;
  if(v.k==='READ')   return 'Special Notice · no solicitation document posted yet';
  if(v.k==='ASSERT') return d+' days to assert capability';
  if(v.k==='SHAPE')  return STAGE_LABEL[o.stage]+' · '+d+' days to respond';
  const sa = o.sa==='Full' ? 'full &amp; open' : o.sa==='UNKNOWN' ? 'set-aside unread' : esc(o.sa)+' set-aside';
  return (d<=1?'closes tomorrow':'closes in '+d+' days')+' · '+sa;
}

/* ── state ── */
const S = {naics:new Set(), init:false, stage:'all', sa:'all', view:null, band:null, q:'', sort:'closing', profile:false};

const filters = ()=>({stage:S.stage, sa:S.sa, view:S.view, band:S.band, q:S.q});

function filtered(){ return base().filter(o=>{
  const v = verdict(o);
  if(S.stage!=='all' && o.stage!==S.stage) return false;
  if(S.sa!=='all' && o.sa!==S.sa) return false;
  if(S.band && v.band!==S.band) return false;
  if(S.view==='eligible' && !(SA_RESTRICTED.includes(o.sa)||o.sa==='SB-Partial')) return false;
  if(S.view==='upstream' && v.k!=='SHAPE') return false;
  if(S.view==='week' && v.k!=='ACT') return false;
  if(S.q && !((o.title+' '+o.agency+' '+(o.office||'')+' '+o.id).toLowerCase().includes(S.q))) return false;
  return true;
});}

/* ── header ── */
function renderHeader(){
  const rows = base();
  const codes = [...new Set(ROWS.map(o=>o.naics).filter(Boolean))].sort();
  $('feedMeta').innerHTML = '<b>'+rows.length+'</b> open notices read live from SAM.gov · '+
    codes.length+' NAICS code'+(codes.length===1?'':'s')+' on your profile · newest posted 25h ago';
  const counts = {}; ROWS.forEach(o=>{ if(o.naics) counts[o.naics]=(counts[o.naics]||0)+1; });
  $('hdrNaics').innerHTML = codes.map(c=>'<span class="npill'+(S.naics.has(c)?'':' off')+'" data-naics="'+c+'" title="'+counts[c]+' in this read">'+c+'</span>').join('');
  $('hdrNaics').querySelectorAll('[data-naics]').forEach(p=>p.onclick=()=>{
    const c=p.dataset.naics;
    if(S.naics.has(c)){ if(S.naics.size>1) S.naics.delete(c); } else S.naics.add(c);
    renderAll();
  });
  const active=[...S.naics].length, total=codes.length;
  $('hdrNaicsLabel').innerHTML = active<total ? 'Your NAICS · <b>'+active+' of '+total+' shown</b>' : 'Your NAICS codes · click to filter';
  $('profileGap').innerHTML = PROFILE.certs.length
    ? '<span>Certifications on record: <b>'+PROFILE.certs.join(' · ')+'</b>. Set-aside eligibility is decided per row.</span>'
    : '<span><b>No certifications on record.</b> Until you add them we cannot tell you which set-asides you qualify for — so nothing is screened out on eligibility.</span><button type="button">Add certifications</button>';
}

/* ── KPIs: four values, all derived, none permanently em-dash ── */
function renderKPIs(){
  const rows = base();
  const by = k=>rows.filter(o=>verdict(o).band===k).length;
  const soon3 = rows.filter(o=>o.days!=null&&o.days<=3).length;
  const screened = by('screened');
  const noticeN = rows.filter(o=>o.stage==='notice').length, soleN = rows.filter(o=>o.sa==='SoleSource').length;
  const offices = new Set(rows.map(o=>OFFICE_SHORT(o.office))).size;
  const depts = new Set(rows.map(o=>o.agency)).size;
  const cards = [
    {lbl:'Open notices', val:rows.length, unit:'', foot:depts+' department'+(depts===1?'':'s')+' · '+offices+' buying office'+(offices===1?'':'s')},
    {lbl:'Act this week', val:by('act'), unit:'', foot:soon3+' of them close within 3 days'},
    {lbl:'Screened out', val:screened, unit:' of '+rows.length, foot:noticeN+' with no solicitation · '+soleN+' not open competition'},
    {lbl:'Audited', val:0, unit:' of '+rows.length, foot:'fit and contract value appear only after an audit'}
  ];
  $('kpiStrip').innerHTML = cards.map(c=>'<div class="kpi"><p class="lbl">'+c.lbl+'</p><div class="kpi-val">'+c.val+'<span class="unit">'+c.unit+'</span></div><div class="foot">'+c.foot+'</div></div>').join('');
}

/* ── triage bands + the funnel. TWO ledgers, each summing on its own corpus. ── */
function renderBands(){
  const rows = base(), read = readSet();
  const n = {}; BANDS.forEach(b=>n[b.k]=0);
  rows.forEach(o=>n[verdict(o).band]++);
  $('triageTitle').textContent = rows.length+' notices → what you actually do';
  // Reasons INSIDE the screened band. These sum to the band, nothing else.
  const screenReasons = [
    {n:rows.filter(o=>o.stage==='notice').length, t:'Special Notice — no solicitation document posted'},
    {n:rows.filter(o=>o.sa==='SoleSource').length, t:'sole-source intent — not open competition'}
  ];
  // The funnel: what never reached a band at all.
  const outNaics = read.length - rows.length;
  const ineligible = 0;
  const funnel = [
    {n:read.length, t:'notices in this read', cls:''},
    {n:outNaics, t:S.profile?'outside your NAICS codes':'outside your NAICS codes — no profile on record, so nothing is removed', cls:outNaics?'minus':'minus none', sign:'−'},
    {n:ineligible, t:'ineligible for the set-aside — no certifications on record', cls:'minus none', sign:'−'},
    {n:rows.length, t:'sorted into the four bands above', cls:'sum'}
  ];
  $('triageBands').innerHTML =
    BANDS.map(b=>'<button class="band'+(S.band===b.k?' active':'')+(n[b.k]===0?' dim':'')+'" data-band="'+b.k+'">'+
      '<span class="band-n">'+n[b.k]+'</span>'+
      '<span><span class="band-t">'+b.t+'</span><span class="band-r">'+b.rule+'</span></span>'+
      '<span class="band-go">'+(S.band===b.k?'showing ↓':b.go+' →')+'</span></button>').join('') +
    '<div class="screen-detail" id="screenDetail">'+screenReasons.map(r=>'<div class="sd-row"><span class="sd-n">'+r.n+'</span><span>'+r.t+'</span></div>').join('')+'</div>'+
    '<div class="funnel" id="funnel">'+funnel.map(f=>'<div class="fn-row '+f.cls+'"><span class="fn-n">'+(f.sign||'')+f.n+'</span><span class="fn-t">'+f.t+'</span></div>').join('')+'</div>';
  $('triageBands').querySelectorAll('[data-band]').forEach(b=>b.onclick=()=>{ S.band = S.band===b.dataset.band?null:b.dataset.band; S.view=null; renderAll(); });
  return {n, screenReasons, funnel:{read:read.length, outNaics, ineligible, remaining:rows.length}};
}
let LAST_BANDS = null;

/* ── closing first ── */
function renderAct(){
  const rows = base().filter(o=>o.days!=null && verdict(o).band!=='screened').sort((a,b)=>a.days-b.days).slice(0,7);
  $('actSub').textContent = 'The 7 soonest deadlines you can still respond to. Ordered by days left — the only fact these notices publish that can rank them.';
  $('actList').innerHTML = rows.map(o=>'<button class="act-row'+(o.days>7?' far':'')+'" data-id="'+esc(o.id)+'">'+
    '<span class="act-d">'+o.days+'<small>days</small></span>'+
    '<span style="min-width:0"><span class="act-title">'+esc(TITLECASE(o.title))+'</span><span class="act-agy">'+esc(officeName(o.office))+' · '+esc(o.id)+'</span></span>'+
    '<span class="vd '+verdict(o).cls+'">'+verdict(o).word+'</span></button>').join('');
  $('actList').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{ S.q=b.dataset.id.toLowerCase(); $('searchInput').value=b.dataset.id; renderAll(); });
}

/* ── controls ── */
function renderControls(){
  const rows = base();
  const cnt = (f)=>rows.filter(f).length;
  const stages = [['all','All types'],['presol','Pre-Sol'],['sources','Sources Sought'],['rfp','Open RFP'],['notice','Special Notice'],['eval','In Evaluation']];
  $('stageSeg').innerHTML = stages.map(([k,l])=>{
    const c = k==='all'?rows.length:cnt(o=>o.stage===k);
    return '<button data-stage="'+k+'" class="'+(k===S.stage?'active':'')+(c===0?' zero':'')+'">'+l+'<span class="n">'+c+'</span></button>';
  }).join('');
  $('stageSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.stage=b.dataset.stage;S.view=null;renderAll();});

  const saPoles = ['all','SB','SB-Partial','SDVOSB','8(a)','HUBZone','WOSB','EDWOSB','SoleSource','Full','UNKNOWN'];
  const present = saPoles.filter(k=>k==='all'||cnt(o=>o.sa===k)>0);
  const absent  = saPoles.filter(k=>k!=='all'&&cnt(o=>o.sa===k)===0);
  const label = (k)=>k==='all'?'All':saRender(k).label;
  let html = present.map(k=>{
    const c = k==='all'?rows.length:cnt(o=>o.sa===k);
    return '<button class="fpill'+(k===S.sa?' active':'')+'" data-sa="'+k+'">'+label(k)+'<span class="n">'+c+'</span></button>';
  }).join('');
  html += S.saOpen
    ? absent.map(k=>'<button class="fpill zero" data-sa="'+k+'">'+label(k)+'<span class="n">0</span></button>').join('')+'<button class="fpill more" data-more="0">fewer</button>'
    : '<button class="fpill more" data-more="1">+'+absent.length+' with none in this read</button>';
  $('saFilters').innerHTML = html;
  $('saFilters').querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>{S.sa=S.sa===b.dataset.sa?'all':b.dataset.sa;S.view=null;renderAll();});
  $('saFilters').querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{S.saOpen=b.dataset.more==='1';renderControls();});

  const views = [
    {k:'week',    t:'Closing this week', d:'open · ≤ 7 days',            n:cnt(o=>verdict(o).k==='ACT')},
    {k:'eligible',t:'Set-aside eligible',d:'restricted to small business',n:cnt(o=>SA_RESTRICTED.includes(o.sa)||o.sa==='SB-Partial')},
    {k:'upstream',t:'Upstream',          d:'pre-sol + sources sought',    n:cnt(o=>verdict(o).k==='SHAPE')}
  ];
  $('savedViews').innerHTML = views.map(v=>'<button class="view-chip'+(S.view===v.k?' active':'')+(v.n===0?' zero':'')+'" data-view="'+v.k+'"><span class="vc-t">'+v.t+'</span><span class="vc-d">'+v.d+' · '+v.n+'</span></button>').join('');
  $('savedViews').querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{S.view=S.view===b.dataset.view?null:b.dataset.view;S.stage='all';S.sa='all';S.band=null;renderAll();});

  const sorts=[['closing','Closing first'],['longest','Longest window'],['buyer','Buyer']];
  $('sortSeg').innerHTML = sorts.map(([k,l])=>'<button data-sort="'+k+'" class="'+(k===S.sort?'active':'')+'">'+l+'</button>').join('');
  $('sortSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.sort=b.dataset.sort;renderAll();});
}
/* ── sorts. Design's three, on comparators that are actually valid. ── */
function sortRows(data) {
  const d = data.slice();
  const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''));
  if (S.sort === 'closing') d.sort((a, b) => cmpMissingLast(a.days, b.days, 1) || byTitle(a, b));
  else if (S.sort === 'longest') d.sort((a, b) => cmpMissingLast(a.days, b.days, -1) || byTitle(a, b));
  else d.sort((a, b) => OFFICE_SHORT(a.office).localeCompare(OFFICE_SHORT(b.office)) || cmpMissingLast(a.days, b.days, 1) || byTitle(a, b));
  return d;
}

/* ── the row. Design's markup; the two action buttons carry Code's wiring. ── */
function rowHTML(o) {
  const v = verdict(o), sa = saRender(o.sa);
  const far = o.days == null ? 'later' : o.days <= 3 ? '' : o.days <= 7 ? 'far' : 'later';
  const hasSolicitation = o.stage !== 'notice';
  const auditRef = o.notice_id || o.id;
  return '<div class="pcard' + (far ? ' ' + far : '') + (v.k === 'ASSERT' ? ' barred' : '') + '" data-id="' + esc(o.id) + '">' +
    '<div class="pc-when"><div class="pc-d">' + (o.days == null ? '—' : o.days + '<small>d</small>') + '</div><div class="pc-dl">' + (o.days == null ? 'NO DEADLINE' : 'LEFT') + '</div></div>' +
    '<div class="pc-main">' +
      '<div class="pc-title">' + esc(TITLECASE(o.title)) + '</div>' +
      '<div class="pc-buyer">' + (officeName(o.office) === deptName(o.agency) ? '<b>' + esc(officeName(o.office)) + '</b>' : '<b>' + esc(officeName(o.office)) + '</b> · ' + esc(deptName(o.agency))) + '</div>' +
      '<div class="pc-id">' + esc(o.id) + '</div>' +
      '<div class="pc-chips"><span class="chip naics">' + esc(o.naics || 'NAICS —') + '</span><span class="chip stage">' + esc(STAGE_LABEL[o.stage] || o.stage) + '</span><span class="chip ' + sa.cls + '">' + esc(sa.label) + '</span></div>' +
    '</div>' +
    '<div class="pc-state"><span class="vd ' + v.cls + '">' + v.word + '</span><span class="pc-note">' + clause(o) + '</span></div>' +
    '<div class="pc-actions">' +
      (hasSolicitation && auditRef
        ? '<a class="btn-open" href="/audit?noticeId=' + encodeURIComponent(auditRef) + '">Run audit</a>'
        : '<span class="btn-open off" title="' + (hasSolicitation ? 'No notice reference' : 'Special Notice — no solicitation document has posted for this requirement yet') + '">' + (hasSolicitation ? 'Run audit' : 'No solicitation yet') + '</span>') +
      '<button class="btn-2" type="button" data-watch-notice="' + esc(o.notice_id) + '">Track</button>' +
      '<button class="btn-2" type="button" data-track="' + esc(o.id) + '">Pipeline</button>' +
    '</div></div>';
}

/* ── the four Track/Pipeline states.
 * '' available · 'on' · 'on locked' (on, and the toggle would DESTROY something)
 * · 'unknown' (hydrate failed). The two refusals share the locked register
 * deliberately: neither is an error. A null hydrate must never render as the
 * available state — that would be a false negative, telling a customer they are
 * not tracking something they are. ── */
function wireActions() {
  const WATCHED = D.WATCHED_NOTICE_IDS;   // Map notice_id→status, or null = unavailable
  const PIPE = D.PIPELINE_IDS;            // Set, or null = unavailable

  $('plist').querySelectorAll('[data-track]').forEach((b) => {
    const id = b.dataset.track;
    const o = ROWS.find((x) => x.id === id);
    if (!id || !o) { b.className = 'btn-2 unknown'; b.disabled = true; b.title = 'No solicitation reference'; return; }
    if (PIPE == null) { b.className = 'btn-2 unknown'; b.disabled = true; b.title = 'Pipeline state unavailable'; return; }
    const on = PIPE.has(id);
    b.className = 'btn-2' + (on ? ' on' : '');
    b.textContent = on ? 'In pipeline' : 'Pipeline';
    b.title = on ? 'In your pipeline board — click to remove' : 'Add to your pipeline board at capture stage';
    b.onclick = (e) => {
      e.stopPropagation();
      if (b.dataset._busy === '1') return;
      b.dataset._busy = '1';
      const isOn = b.classList.contains('on');
      const req = isOn
        ? fetch('/api/pipeline?solicitationNumber=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' })
        : fetch('/api/pipeline', {
            method: 'POST', credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              solicitationNumber: id, title: o.title || null, agency: o.agency || null,
              naics: o.naics || null, dueDate: o.response_deadline || null, estimatedValueM: o.ceiling,
              stageCode: o.stage === 'presol' ? '01' : o.stage === 'sources' ? '02' : '03'
            })
          });
      req.then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, data: d })))
        .then((out) => {
          b.dataset._busy = '';
          if (!out.ok) { console.warn('[pipeline] failed', out); return; }
          if (isOn) {
            // removed:0 means the server REFUSED — the pursuit advanced past
            // capture. Flipping the button off would assert a removal that never
            // happened, so it stays on and says why.
            if (!(out.data && out.data.removed > 0)) {
              b.className = 'btn-2 on locked';
              b.title = 'Advanced past capture on the pipeline board — remove it there';
              return;
            }
            PIPE.delete(id); b.className = 'btn-2'; b.textContent = 'Pipeline';
          } else { PIPE.add(id); b.className = 'btn-2 on'; b.textContent = 'In pipeline'; }
        })
        .catch((err) => { b.dataset._busy = ''; console.warn('[pipeline] error', err); });
    };
  });

  $('plist').querySelectorAll('[data-watch-notice]').forEach((b) => {
    const noticeId = b.dataset.watchNotice;
    const o = ROWS.find((x) => x.notice_id === noticeId);
    if (!noticeId || !o) { b.className = 'btn-2 unknown'; b.disabled = true; b.title = 'No notice id'; return; }
    if (WATCHED == null) { b.className = 'btn-2 unknown'; b.disabled = true; b.title = 'Watch state unavailable'; return; }
    const status = WATCHED.get(noticeId) || null;
    // A watch past 'watching' (posted / audited) carries audit linkage. Untracking
    // would DELETE that history, so the toggle is refused, not offered.
    if (status && status !== 'watching') {
      b.className = 'btn-2 on locked'; b.disabled = true; b.textContent = 'Tracking';
      b.title = 'Watch has advanced (' + status + ') — manage it on the Watching page';
      return;
    }
    b.className = 'btn-2' + (status ? ' on' : '');
    b.textContent = status ? 'Tracking' : 'Track';
    b.title = status ? 'Watching this notice — click to stop' : 'Watch this notice — you are alerted on amendments and deadline changes';
    b.onclick = (e) => {
      e.stopPropagation();
      if (b.dataset._busy === '1') return;
      b.dataset._busy = '1';
      const isOn = b.classList.contains('on');
      const init = isOn
        ? { method: 'DELETE', credentials: 'include' }
        : {
            method: 'POST', credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              noticeId: noticeId, title: o.title || null, agency: o.agency || null,
              solicitationNumber: o.id || null, noticeType: o.notice_type || null,
              responseDeadline: o.response_deadline || null
            })
          };
      fetch(isOn ? '/api/watch?noticeId=' + encodeURIComponent(noticeId) : '/api/watch', init)
        .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, data: d })))
        .then((out) => {
          b.dataset._busy = '';
          if (!out.ok) { console.warn('[watch] failed', out); return; }
          if (isOn) { WATCHED.delete(noticeId); b.className = 'btn-2'; b.textContent = 'Track'; }
          else {
            WATCHED.set(noticeId, out.data && out.data.status ? out.data.status : 'watching');
            b.className = 'btn-2 on'; b.textContent = 'Tracking';
          }
        })
        .catch((err) => { b.dataset._busy = ''; console.warn('[watch] error', err); });
    };
  });
}

/* ── the list ── */
function renderList() {
  // The feed's three honest poles are preserved verbatim from the served build:
  // an outage must never render as an empty result, and neither may be dressed
  // as the other. This is the affordance the tab exists to protect.
  if (!ROWS.length) {
    $('plistCount').innerHTML = '';
    $('plist').innerHTML = '<div class="empty">' + (
      D.FEED_STATE === 'loading' ? 'Connecting to the SAM.gov feed…'
      : D.FEED_STATE === 'error' ? 'SAM.gov feed unavailable — no data shown. Nothing on this page is sample data; retry shortly.'
      : D.FEED_SCOPE === 'no-profile' ? 'No NAICS codes on file — add one and the feed scopes to it.'
      : 'The live SAM.gov feed is empty right now — no notices matched in the current window.'
    ) + '</div>';
    if (window.FAR_PROFILE_EDITOR && $('plistProfile')) window.FAR_PROFILE_EDITOR.mount($('plistProfile'), {});
    return;
  }

  const data = filtered();
  const total = base().length;
  // MEASURED, never asserted: Design's file states "no stated contract value on
  // any of them", which is true of today's feed and is still a claim. Count it.
  const priced = data.filter((o) => o.ceiling != null).length;
  const valueNote = data.length === 0 ? ''
    : priced === 0 ? ' · no stated contract value on any of them'
    : priced === data.length ? ' · all with a stated value'
    : ' · ' + priced + ' with a stated value';
  $('plistCount').innerHTML = '<b>' + data.length + '</b> of ' + total + ' shown' +
    (S.band ? ' · band: ' + BANDS.find((b) => b.k === S.band).t : '') +
    (S.stage !== 'all' ? ' · type: ' + STAGE_LABEL[S.stage] : '') +
    (S.sa !== 'all' ? ' · set-aside: ' + saRender(S.sa).label : '') +
    (S.view ? ' · view: ' + esc(S.view) : '') +
    (S.q ? ' · matching “' + esc(S.q) + '”' : '') + valueNote;

  if (!data.length) {
    $('plist').innerHTML = '<div class="empty">No notice matches this combination.<br>' +
      esc([S.band ? 'band ' + S.band : null, S.stage !== 'all' ? 'type ' + STAGE_LABEL[S.stage] : null,
           S.sa !== 'all' ? 'set-aside ' + saRender(S.sa).label : null, S.q ? 'search “' + S.q + '”' : null]
          .filter(Boolean).join(' + ') || 'current filters') +
      '<br><br><a href="#" id="clearAll">clear filters</a></div>';
    const c = $('clearAll'); if (c) c.onclick = (e) => { e.preventDefault(); reset(); };
    return;
  }

  // Grouped by BAND — the same spine that drives the hero, so the header and the
  // body can never tell two stories.
  let html = '';
  BANDS.forEach((b) => {
    const g = sortRows(data.filter((o) => verdict(o).band === b.k));
    if (!g.length) return;
    html += '<div class="grouphd"><span class="gh-n">' + g.length + '</span><span class="gh-t">' + b.t + '</span><span class="gh-r">' + b.rule + '</span></div>' + g.map(rowHTML).join('');
  });
  $('plist').innerHTML = html;
  wireActions();
}

function reset() {
  S.stage = 'all'; S.sa = 'all'; S.view = null; S.band = null; S.q = '';
  const si = $('searchInput'); if (si) si.value = '';
  S.naics = new Set(ROWS.map((o) => o.naics).filter(Boolean));
  renderAll();
}

function renderAll() {
  if (!S.init && ROWS.length) { S.naics = new Set(ROWS.map((o) => o.naics).filter(Boolean)); S.init = true; }
  UNMAPPED.clear();
  renderHeader(); renderKPIs(); renderBands(); renderAct(); renderControls(); renderList();
}

function onThemeChange() { renderAll(); }

window.DSO_APP = { render: renderAll, onThemeChange: onThemeChange };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
else renderAll();
})();
