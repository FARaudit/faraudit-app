// Falsification probe for the 10 code-review findings (run RED pre-fix).
// Drives /opportunities with an intercepted /api/command-center-data fixture.
import { chromium } from '@playwright/test';
const SCRATCH='/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app--claude-worktrees-great-galileo-4db0c1/39b402da-3a7a-4dbe-8e76-71779362b673/scratchpad';
let pass=0, fail=0;
const check=(l,ok,d='')=>{ if(ok)pass++; else fail++; console.log(`${ok?'✓ PASS':'✗ FAIL'}  ${l}${ok?'':' — '+String(d).slice(0,120)}`); };
const iso = (days) => new Date(Date.now()+days*86400000).toISOString();

const ROWS = [
  { notice_id:'nx1', solicitation_number:'XSS-26-R-0001', title:'Widget <img id="xssprobe" src=x onerror="window.__xss=1"> & Co', agency:'A<b id="xssagency">gency</b>', naics_code:'336413', set_aside:'Total Small Business', document_type:'RFQ', compliance_score:88, incumbent_name:'Bad<i id="xssinc">guy</i>', response_deadline: iso(9), award_ceiling: 5000000, created_at: iso(-1) },
  { notice_id:'nx2', solicitation_number:'SRC-26-S-0002', title:'Sources sought test row', agency:'Test Agency', naics_code:'336413', set_aside:'Total Small Business', document_type:'SrcSght', compliance_score:null, incumbent_name:null, response_deadline: iso(12), award_ceiling: null, created_at: iso(-1) },
  { notice_id:'nx3', solicitation_number:'PRE-26-P-0003', title:'Presol test row', agency:'Test Agency', naics_code:'336413', set_aside:null, document_type:'PreSol', compliance_score:null, incumbent_name:null, response_deadline: null, award_ceiling: null, created_at: iso(-1) },
  { notice_id:'nx4a', solicitation_number:'AMD-26-R-0004', title:'Amendment base', agency:'Test Agency', naics_code:'332710', set_aside:null, document_type:'Solicitation', compliance_score:null, incumbent_name:null, response_deadline: iso(15), award_ceiling: null, created_at: iso(-1) },
  { notice_id:'nx4b', solicitation_number:'AMD-26-R-0004', title:'Amendment 0001', agency:'Test Agency', naics_code:'332710', set_aside:null, document_type:'Solicitation', compliance_score:null, incumbent_name:null, response_deadline: iso(20), award_ceiling: null, created_at: iso(-2) },
  { notice_id:'nx5', solicitation_number:'LOW-26-R-0005', title:'Low fit scored row', agency:'Test Agency', naics_code:'336413', set_aside:'Total Small Business', document_type:'RFQ', compliance_score:30, incumbent_name:null, response_deadline: iso(10), award_ceiling: 8000000, created_at: iso(-1) },
  { notice_id:'nx6', solicitation_number:'NUL-26-R-0006', title:'Unaudited plotted row', agency:'Test Agency', naics_code:'336413', set_aside:null, document_type:'RFQ', compliance_score:null, incumbent_name:null, response_deadline: iso(11), award_ceiling: 6000000, created_at: iso(-1) },
  { notice_id:'nx7', solicitation_number:'ADV-26-R-0007', title:'Advanced watch row', agency:'Test Agency', naics_code:'336413', set_aside:null, document_type:'RFQ', compliance_score:null, incumbent_name:null, response_deadline: iso(14), award_ceiling: null, created_at: iso(-1) },
  { notice_id:'nx8', solicitation_number:'PIP-26-R-0008', title:'Advanced pipeline row', agency:'Test Agency', naics_code:'336413', set_aside:null, document_type:'RFQ', compliance_score:null, incumbent_name:null, response_deadline: iso(16), award_ceiling: null, created_at: iso(-1) },
  { notice_id:'nx9', solicitation_number:'KVAL-26-R-0009', title:'Sub-100K ceiling row', agency:'Test Agency', naics_code:'336413', set_aside:null, document_type:'RFQ', compliance_score:null, incumbent_name:null, response_deadline: iso(18), award_ceiling: 45000, created_at: iso(-1) },
];

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: SCRATCH+'/storageState.json', viewport:{width:1500,height:1000} });
const pg = await ctx.newPage();
await pg.route('**/api/command-center-data', r => r.fulfill({ json: { opportunities: ROWS } }));
await pg.route('**/api/watch?*', r => r.fulfill({ json: { watching: { nx7: 'posted' } } }));
let deleteCalls = 0;
await pg.route('**/api/pipeline*', (r) => {
  const m = r.request().method();
  if (m === 'GET') return r.fulfill({ json: { pipeline: [ { solicitation_number:'PIP-26-R-0008', stage:'04', title:'Advanced pipeline row', estimated_value: null } ] } });
  if (m === 'DELETE') { deleteCalls++; return r.fulfill({ json: { ok:true, removed:0 } }); }
  return r.continue();
});
await pg.goto('http://localhost:3100/opportunities', { waitUntil:'networkidle' });
await pg.waitForTimeout(1200);

// F1 — XSS
check('F1: no injected element from title', await pg.locator('#xssprobe').count() === 0);
check('F1: no injected element from agency', await pg.locator('#xssagency').count() === 0);
check('F1: no injected element from incumbent', await pg.locator('#xssinc').count() === 0);
check('F1: onerror did not run', await pg.evaluate(() => !window.__xss));
check('F1: title renders literally', (await pg.locator('#plist').textContent()).includes('Widget <img'));

// F2 — SrcSght classification
const srcCard = pg.locator('.pcard', { hasText: 'Sources sought test row' });
check('F2: SrcSght row carries Sources Sought stage chip', (await srcCard.locator('.chip.stage').textContent().catch(()=> '')) === 'Sources Sought');

// F8 (+F2) — Upstream view shows presol AND sources rows
await pg.locator('#savedViews [data-view="upstream"]').click();
await pg.waitForTimeout(300);
const upTxt = await pg.locator('#plist').textContent();
check('F8: Upstream view shows presol row', upTxt.includes('Presol test row'));
check('F8: Upstream view shows sources row', upTxt.includes('Sources sought test row'));
await pg.locator('#savedViews [data-view="upstream"]').click();
await pg.waitForTimeout(300);

// F6 — amendment dedupe by display identity
check('F6: same-sol# amendment pair renders as ONE card', await pg.locator('.pcard', { hasText: 'Amendment' }).count() === 1);

// F10 — bubble radii
const radii = await pg.locator('#bubbleSvg circle.bub').evaluateAll(els => els.map(e => ({ r: parseFloat(e.getAttribute('r')), dash: e.getAttribute('stroke-dasharray') })));
check('F10: no negative/NaN bubble radius', radii.length > 0 && radii.every(x => x.r > 0), JSON.stringify(radii));
check('F10: low-fit (30) row is plotted', radii.length >= 3, `plotted ${radii.length}`);
const dashed = radii.filter(x => x.dash);
check('F10: fit-null rows visually distinct (dashed)', dashed.length >= 1, JSON.stringify(radii));

// F9 — advanced watch status
const advWatch = pg.locator('.pcard', { hasText: 'Advanced watch row' }).locator('.btn-watch');
check('F9: advanced-status watch button is non-toggleable', await advWatch.isDisabled(), 'enabled');
check('F9: advanced-status watch button shows tracked state', await advWatch.evaluate(e => e.classList.contains('on')));

// F5 — pipeline DELETE removed:0 keeps button on
const pipBtn = pg.locator('.pcard', { hasText: 'Advanced pipeline row' }).locator('.btn-save');
check('F5-pre: advanced pipeline row hydrates as In Pipeline', await pipBtn.evaluate(e => e.classList.contains('on')));
await pipBtn.click();
await pg.waitForTimeout(700);
check('F5: removed:0 → button STAYS on', await pipBtn.evaluate(e => e.classList.contains('on')), 'button flipped off despite removed:0');
check('F5: DELETE was attempted', deleteCalls === 1, String(deleteCalls));

// F3 (display half) — sub-$100K ceiling not rendered as $0.0M
const kvalTxt = await pg.locator('.pcard', { hasText: 'Sub-100K ceiling row' }).locator('.pc-ceiling').textContent();
check('F3: $45,000 ceiling not shown as $0.0M', !kvalTxt.includes('$0.0M'), kvalTxt.trim());

await pg.screenshot({ path: SCRATCH+'/shots/fixture-drive.png', fullPage:false });
console.log(`\n${fail===0?'ALL PASS':'FAILURES'} — ${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail?1:0);
