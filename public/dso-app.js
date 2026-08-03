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
  // The two subtractions the funnel reports, as two predicates. Keeping them
  // separate is what lets read − outNaics − ineligible equal the sorted total
  // exactly, instead of a single filter reporting one number for two causes.
  function inNaics(o) { return !(S.naics.size && o.naics && !S.naics.has(o.naics)); }
  function base() { return readSet().filter((o) => inNaics(o) && certEligible(o)); }

  // Certifications come from the customer's SAM registration via
  // opportunities-live.js. A self-asserted certification is never read here: it
  // cannot clear a set-aside bar, so treating one as eligibility would tell a
  // firm it may compete for a pool it is not registered under.
  function PROFILE_CERTS() {
    const c = (window.DSO && window.DSO.CERTS) || null;
    return {
      state: (c && c.state) || 'loading',
      labels: (c && Array.isArray(c.records) ? c.records : []).map(function (r) { return r.label || r.attr; }),
      programs: new Set(c && Array.isArray(c.establishedPrograms) ? c.establishedPrograms : [])
    };
  }

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
           rule:'Special Notice — industry day, amendment, sole-source intent or cancellation. No solicitation document has posted for this requirement.'},
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

/* ── SET-ASIDE ELIGIBILITY — the ONE place the page removes a row for a reason
   other than the customer's own filters, so every exclusion has to be one SAM
   can attest.

   POLE → the canonical program that gates it. SB and SB-Partial are absent BY
   CONSTRUCTION and this is the load-bearing part of the map: small-business
   status is a size determination made per solicitation against that NAICS
   standard, and no registration record can settle it. A firm registered under
   zero socioeconomic programs is very often small, so gating those two poles on
   a program record would hide the largest slice of what it may actually bid.

   SoleSource, Full and UNKNOWN are absent for their own reasons: a sole-source
   notice is already screened by its band, full-and-open restricts nobody, and
   UNKNOWN means the set-aside was not read — which is not a restriction. ── */
const POLE_PROGRAM = {'8(a)':'se:8a', 'HUBZone':'se:hubzone', 'SDVOSB':'se:sdvosb', 'EDWOSB':'se:edwosb', 'WOSB':'se:wosb'};

/* Removed only when SAM has ANSWERED and the answer does not carry the program.
   'loading', 'no-uei', 'unverified' and 'registration-inactive' all keep the row:
   an unread registration is unknown, and unknown is never a disqualifier. */
function certEligible(o){
  const prog = POLE_PROGRAM[o.sa];
  if(!prog) return true;
  const p = PROFILE_CERTS();
  if(p.state !== 'verified') return true;
  return p.programs.has(prog);
}

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

/* ── header ──
   INVARIANT: #feedMeta has ONE writer, renderHeader. live.js owns #livePill only.
   The freshness clause is a fact about the FEED, which this layer cannot derive —
   it renders only from DSO.LAST_INGEST and is absent when nothing was measured.
   Every non-live feed state carries its own line: the count sentence asserts a
   live read, so it must not render unless one happened. */
/* ── feed status copy: ONE SOURCE, two lengths ──
   The header and the empty list state the same four facts. Authored separately
   they drifted: the page said "Connecting" in one place and "Reading" in the
   other about the same request, and named the window in one and not the other.
   The two surfaces may differ in LENGTH; they may not disagree. */
function windowPhrase(){
  /* derived — the server sends feedWindowDays. Typing the number is the frozen
     clock again. Absent → say less rather than guess. */
  const w = (window.DSO && window.DSO.FEED_WINDOW_DAYS);
  return w ? 'in the last '+w+' days' : 'in the window read';
}
const FEED_COPY = {
  error: {
    header: 'SAM.gov feed unavailable — no notices were read, so the counts below are empty, not zero.',
    list:   'SAM.gov feed unavailable — no notices were read. This list is empty because the read failed.'
  },
  'no-profile': {
    header: 'No NAICS codes on file — add the codes you sell under and this feed fills from <b>SAM.gov</b>.',
    list:   'No NAICS codes on file — add the codes you sell under and this list fills from <b>SAM.gov</b>.'
  },
  empty: {
    header: ()=>'Connected to the <b>live SAM.gov feed</b> — no notices under your NAICS codes '+windowPhrase()+'.',
    /* the header two inches above already said "Connected" — the list's job is
       the result, not the connection. */
    list:   ()=>'No notices under your NAICS codes '+windowPhrase()+'.'
  },
  reading: { header: 'Reading the live SAM.gov feed…', list: 'Reading the live SAM.gov feed…' }
};
/* Anything not one of the three named states — including the initial 'loading'
   and any state added later — resolves to READING. The neutral line is the only
   safe default: on this page every surface that states feed status has had the
   CONFIDENT branch as its fallback, and that is the shape being retired. */
function feedCopy(state, surface){
  const k = (state==='error'||state==='no-profile'||state==='empty') ? state : 'reading';
  const v = FEED_COPY[k][surface];
  return typeof v === 'function' ? v() : v;
}
function feedMetaHTML(state, shown, codeCount){
  if(state==='no-profile') return feedCopy(state,'header')+
    '<button type="button" id="addNaicsBtn">Add NAICS codes</button>';
  if(state==='error' || state==='empty') return feedCopy(state,'header');
  if(state==='live'){
    const ingest = (window.DSO && window.DSO.LAST_INGEST) ? ' · newest posted '+window.DSO.LAST_INGEST : '';
    return '<b>'+shown+'</b> open notices read live from SAM.gov · '+
      codeCount+' NAICS code'+(codeCount===1?'':'s')+' on your profile'+ingest;
  }
  return feedCopy(state,'header');
}
function renderHeader(){
  const rows = base();
  const codes = [...new Set(ROWS.map(o=>o.naics).filter(Boolean))].sort();
  $('feedMeta').innerHTML = feedMetaHTML((window.DSO && window.DSO.FEED_STATE) || null, rows.length, codes.length);
  /* no-profile is the one state whose entire content is a required action, so it
     gets a real control rather than prose — matching the certifications banner one
     line below it. The editor is already mounted in the empty list, so send them
     there instead of inventing a second surface. */
  const naicsBtn = $('addNaicsBtn');
  if(naicsBtn) naicsBtn.onclick = ()=>{
    const target = $('plistProfile') || $('plist');
    if(!target) return;
    target.scrollIntoView({behavior:'smooth', block:'center'});
    const field = target.querySelector('input,select,textarea');
    if(field) field.focus({preventScroll:true});
  };
  const counts = {}; ROWS.forEach(o=>{ if(o.naics) counts[o.naics]=(counts[o.naics]||0)+1; });
  $('hdrNaics').innerHTML = codes.map(c=>'<span class="npill'+(S.naics.has(c)?'':' off')+'" data-naics="'+c+'" title="'+counts[c]+' in this read">'+c+'</span>').join('');
  $('hdrNaics').querySelectorAll('[data-naics]').forEach(p=>p.onclick=()=>{
    const c=p.dataset.naics;
    if(S.naics.has(c)){ if(S.naics.size>1) S.naics.delete(c); } else S.naics.add(c);
    renderAll();
  });
  const active=[...S.naics].length, total=codes.length;
  $('hdrNaicsLabel').innerHTML = active<total ? 'Your NAICS · <b>'+active+' of '+total+' shown</b>' : 'Your NAICS codes · click to filter';
  renderCertBanner($('profileGap'));
}

/* ── the certifications banner: SIX states, and the five that are not
   'verified' say something different from each other.

   "No records" has five causes calling for five different actions — add a UEI,
   correct a UEI SAM does not recognise, renew a registration, wait out an
   outage, or nothing at all because the firm genuinely holds no socioeconomic
   program. One shared line would hand four of those five customers an
   instruction that does not apply to them.

   The uei-not-found / unverified pair is the one that has already gone wrong:
   both render zero programs, but one is ours to fix and the other is theirs, and
   the outage wording on a bad UEI leaves a customer waiting for nothing.

   Copy is DATA, not markup, so a gate can assert the six states directly. ── */
function certBannerCopy(){
  const p = PROFILE_CERTS();
  if(p.state === 'no-uei') return {
    pre:'', strong:'No UEI on your profile.',
    post:' Add it and your set-aside eligibility is read straight from your SAM registration — until then nothing is screened out on eligibility.',
    btn:'Add your UEI'
  };
  if(p.state === 'uei-not-found') return {
    pre:'', strong:'SAM has no active registration under the UEI on your profile.',
    post:' Check the UEI — until it matches a registration we cannot read your set-aside eligibility, so nothing is screened out on eligibility.',
    btn:'Check your UEI'
  };
  if(p.state === 'registration-inactive') return {
    pre:'', strong:'Your SAM registration is not active,',
    post:' so it attests no set-aside eligibility. Nothing is screened out on eligibility while it is lapsed.', btn:null
  };
  if(p.state === 'unverified') return {
    pre:'', strong:'We could not read your SAM registration just now,',
    post:' so nothing is screened out on eligibility. Every set-aside notice in this read is still listed below.', btn:null
  };
  if(p.state === 'verified' && p.labels.length) return {
    pre:'SAM-verified: ', strong:p.labels.join(' · '),
    post:'. Set-aside pools your registration does not cover are removed below; small-business set-asides are decided per row, by size.', btn:null
  };
  if(p.state === 'verified') return {
    pre:'', strong:'Your SAM registration lists no socioeconomic programs.',
    post:' Set-asides reserved for those programs are removed below; small-business set-asides are decided per row, by size.', btn:null
  };
  return { pre:'', strong:'', post:'Reading your SAM registration for set-aside eligibility…', btn:null };
}

/* Built from nodes rather than a markup string: the only variable part is the
   program list, and as a text node it cannot carry markup at all. */
function renderCertBanner(host){
  if(!host) return;
  while(host.firstChild) host.removeChild(host.firstChild);
  const c = certBannerCopy();
  const span = document.createElement('span');
  if(c.pre) span.appendChild(document.createTextNode(c.pre));
  if(c.strong){
    const b = document.createElement('b');
    b.textContent = c.strong;
    span.appendChild(b);
  }
  span.appendChild(document.createTextNode(c.post));
  host.appendChild(span);
  if(c.btn){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'addUeiBtn';
    btn.textContent = c.btn;
    // The UEI field lives in the capability statement, which the hash routing on
    // /home opens directly. The in-page editor below handles NAICS codes only, so
    // sending them there would be sending them to a form without the field.
    btn.onclick = ()=>{ window.location.href = '/home#capability'; };
    host.appendChild(btn);
  }
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
  // The funnel: what never reached a band at all. Each line is counted on its own
  // predicate over the full read, in order, so the two subtractions never claim
  // the same notice twice and read − outNaics − ineligible === rows exactly.
  const outNaics = read.filter(o=>!inNaics(o)).length;
  const ineligible = read.filter(o=>inNaics(o) && !certEligible(o)).length;
  const certs = PROFILE_CERTS();
  const eligLabel = ineligible
    ? 'set-asides your SAM registration does not cover'
    : certs.state==='verified'
      ? 'ineligible for the set-aside — none in this read are outside your registered programs'
      : 'ineligible for the set-aside — your SAM-registered programs are not known, so nothing is removed';
  const funnel = [
    {n:read.length, t:'notices in this read', cls:''},
    {n:outNaics, t:S.profile?'outside your NAICS codes':'outside your NAICS codes — no profile on record, so nothing is removed', cls:outNaics?'minus':'minus none', sign:'−'},
    {n:ineligible, t:eligLabel, cls:ineligible?'minus':'minus none', sign:'−'},
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
  /* pool is the whole rankable set; rows is the slice shown. The foot states the
     denominator the widget otherwise never gives — "the 7 soonest" of how many. */
  const pool = base().filter(o=>o.days!=null && verdict(o).band!=='screened').sort((a,b)=>a.days-b.days);
  const rows = pool.slice(0,7);
  $('actSub').textContent = 'The 7 soonest deadlines you can still respond to. Ordered by days left — the only fact these notices publish that can rank them.';
  $('actList').innerHTML = rows.map(o=>'<button class="act-row'+(o.days>7?' far':'')+'" data-id="'+esc(o.id)+'">'+
    '<span class="act-d">'+o.days+'<small>d</small></span>'+
    '<span style="min-width:0"><span class="act-title">'+esc(TITLECASE(o.title))+'</span><span class="act-agy">'+esc(officeName(o.office))+' · '+esc(o.id)+'</span></span>'+
    '<span class="vd '+verdict(o).cls+'">'+verdict(o).word+'</span></button>').join('');
  $('actFoot').textContent = pool.length > rows.length
    ? 'showing the '+rows.length+' soonest · '+pool.length+' notices in this read carry a published deadline'
    : 'showing all '+pool.length+' notices in this read that carry a published deadline';
  $('actList').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{ S.q=b.dataset.id.toLowerCase(); $('searchInput').value=b.dataset.id; renderAll(); });
}

/* ── controls ──
   Lays a hidden probe carrying the real cell styles, measures every declared
   label at max-content, and publishes the widest as --cell-floor. Re-derive it
   whenever the declared set can change. It is a webfont measurement, so it is
   re-run on document.fonts.ready. */
function setCellFloor(labels, worstCount){
  const panel = document.querySelector('.controls');
  if(!panel || !labels.length) return;
  const probe = document.createElement('div');
  probe.className = 'seg';
  probe.style.cssText = 'position:absolute;visibility:hidden;width:max-content;flex-wrap:nowrap;pointer-events:none;left:-9999px;top:0';
  const btn = document.createElement('button');
  btn.style.flex = '0 0 auto';
  probe.appendChild(btn);
  panel.appendChild(probe);
  let widest = 0;
  labels.forEach(l=>{
    btn.innerHTML = esc(String(l))+'<span class="n">'+worstCount+'</span>';
    widest = Math.max(widest, btn.getBoundingClientRect().width);
  });
  probe.remove();
  if(widest > 0) panel.style.setProperty('--cell-floor', Math.ceil(widest)+'px');
}

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
  /* Set-aside is the SAME cell module as notice type — two parallel filter axes
     should not speak two idioms. The disclosure is not a VALUE of the axis, so it
     sits beside the control as a text button rather than among the cells. */
  const saBtn = (k,c,zero)=>'<button data-sa="'+k+'" class="'+(k===S.sa?'active':'')+(zero?' zero':'')+'">'+label(k)+'<span class="n">'+c+'</span></button>';
  let html = present.map(k=>saBtn(k, k==='all'?rows.length:cnt(o=>o.sa===k), false)).join('');
  if(S.saOpen) html += absent.map(k=>saBtn(k,0,true)).join('');
  $('saFilters').innerHTML = html;
  $('saFilters').querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>{S.sa=S.sa===b.dataset.sa?'all':b.dataset.sa;S.view=null;renderAll();});
  $('saMore').textContent = S.saOpen ? 'fewer' : '+'+absent.length+' with none in this read';
  $('saMore').onclick = ()=>{ S.saOpen = !S.saOpen; renderControls(); };

  /* The floor is MEASURED from every DECLARED label at its worst-case count, not
     picked from whichever labels happen to be on screen. Flex items carry
     min-width:auto, so a label wider than the basis grows its own cell past the
     others — and the widest label is a zero-count pole that only appears once the
     disclosure is open, which would make a muted bucket the largest cell in the
     panel. */
  setCellFloor([...stages.map(s=>s[1]), ...saPoles.map(label)], rows.length);

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
    /* the label states the EXCEPTION, it does not repeat the rule: with LEFT the
       row said the deadline three times (numeral, word, and the note below). */
    '<div class="pc-when"><div class="pc-d">' + (o.days == null ? '—' : o.days + '<small>d</small>') + '</div>' +
      (o.days == null ? '<div class="pc-dl">NO DEADLINE</div>' : '') + '</div>' +
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
    /* keyed on FEED_STATE, never FEED_SCOPE: feedScopeSource's value is
       'no-profile-codes', so `FEED_SCOPE === 'no-profile'` could never match and
       the fixable case fell through to "the feed is empty" — hiding exactly the
       distinction live.js sets that field to protect. */
    const noProfile = D.FEED_STATE === 'no-profile';
    $('plist').innerHTML = '<div class="empty">' + feedCopy(D.FEED_STATE, 'list') + '</div>' +
      (noProfile ? '<div id="plistProfile"></div>' : '');
    /* the container is rendered HERE, in the only state that needs it. Without it
       this mount never ran and the Add NAICS codes control had nothing to reach. */
    if (noProfile && window.FAR_PROFILE_EDITOR && $('plistProfile')) window.FAR_PROFILE_EDITOR.mount($('plistProfile'), {});
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

/* renderHeader is exported so live.js can refresh the feed line as soon as the
   fetch answers, without waiting on watch/pipeline hydration. */
window.DSO_APP = { render: renderAll, renderHeader: renderHeader, onThemeChange: onThemeChange };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
else renderAll();
/* the cell floor is a webfont measurement — re-derive once the fonts land, or
   it is computed against fallback metrics and reports a generous number. */
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ renderControls(); });
})();
