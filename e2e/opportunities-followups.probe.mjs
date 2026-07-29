// Falsification probe for the cut-by-cap follow-ups. Run RED before the fixes.
import { chromium } from '@playwright/test';
const SCRATCH='/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app--claude-worktrees-great-galileo-4db0c1/39b402da-3a7a-4dbe-8e76-71779362b673/scratchpad';
let pass=0, fail=0;
const check=(l,ok,d='')=>{ if(ok)pass++; else fail++; console.log(`${ok?'✓ PASS':'✗ FAIL'}  ${l}${ok?'':' — '+String(d).slice(0,140)}`); };
const iso = (d) => new Date(Date.now()+d*86400000).toISOString();
const ROWS = Array.from({length: 12}, (_,i) => ({
  notice_id:'fu'+i, solicitation_number:'FU-26-R-'+String(i).padStart(4,'0'), title:'Follow-up row '+i,
  agency:'Test Agency '+i, naics_code:'336413', set_aside:null, document_type:'RFQ',
  compliance_score: i%3===0 ? 80 : null, incumbent_name:null,
  response_deadline: iso(5+i), award_ceiling: 1e6*(i+1), created_at: iso(-1)
}));
// duplicate display identity (server should dedupe)
ROWS.push({ ...ROWS[0], notice_id:'fu0-dupe', created_at: iso(-2) });

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: SCRATCH+'/storageState.json', viewport:{width:1500,height:1000} });

// ── FU1: first paint must not wait on watch/pipeline hydration ──
{
  const pg = await ctx.newPage();
  await pg.route('**/api/command-center-data', r => r.fulfill({ json: { opportunities: ROWS } }));
  // Hydration endpoints stall for 3s.
  await pg.route('**/api/watch?*', async r => { await new Promise(s=>setTimeout(s,3000)); r.fulfill({ json:{ watching:{} } }); });
  await pg.route('**/api/pipeline*', async r => { await new Promise(s=>setTimeout(s,3000)); r.fulfill({ json:{ pipeline:[] } }); });
  await pg.goto('http://localhost:3100/opportunities', { waitUntil:'commit' });
  const t0 = Date.now();
  let painted = -1;
  try { await pg.waitForSelector('.pcard', { timeout: 2500 }); painted = Date.now()-t0; } catch { painted = -1; }
  check('FU1: cards paint before hydration completes (<2.5s)', painted > 0, painted<0 ? 'no cards within 2.5s (blocked on hydration)' : String(painted));
  await pg.close();
}

// ── FU2/FU3: search debounce + no full chart rebuild per keystroke; selection is targeted ──
{
  const pg = await ctx.newPage();
  await pg.route('**/api/command-center-data', r => r.fulfill({ json: { opportunities: ROWS } }));
  await pg.route('**/api/watch?*', r => r.fulfill({ json:{ watching:{} } }));
  await pg.route('**/api/pipeline*', r => r.fulfill({ json:{ pipeline:[] } }));
  await pg.goto('http://localhost:3100/opportunities', { waitUntil:'networkidle' });
  await pg.waitForSelector('.pcard');
  await pg.waitForTimeout(500);

  // Count list rebuilds via MutationObserver on #plist childList. Each full
  // renderList() replaces innerHTML = one record. (Two earlier instruments were
  // INERT here: svg mutation records batch-undercount, and wrapping
  // DSO_APP.render misses the keystroke path, which calls the internal
  // renderAll closure directly. Known-positive: the unfixed code scores ~9.)
  await pg.evaluate(() => {
    window.__listRebuilds = 0;
    new MutationObserver(recs => { window.__listRebuilds += recs.length; })
      .observe(document.getElementById('plist'), { childList: true });
  });
  await pg.locator('#searchInput').pressSequentially('Follow-up', { delay: 60 });
  await pg.waitForTimeout(700);
  const rebuilds = await pg.evaluate(() => window.__listRebuilds);
  check('FU2: typing 9 chars does not rebuild the list 9 times', rebuilds <= 3, `${rebuilds} list rebuilds for 9 keystrokes`);

  await pg.locator('#searchInput').fill('');
  await pg.waitForTimeout(400);

  // selection must not destroy/recreate the clicked card node
  const first = pg.locator('.pcard').first();
  await first.evaluate(el => { el.__marker = 'kept'; });
  await first.click({ position: { x: 300, y: 20 } });
  await pg.waitForTimeout(400);
  const kept = await pg.locator('.pcard').first().evaluate(el => el.__marker === 'kept');
  check('FU3: selecting a card does not recreate the DOM node', kept, 'card node was destroyed and rebuilt');
  await pg.close();
}

// ── FU4: server-side dedup — /api/command-center-data returns no duplicate display identities ──
{
  const pg = await ctx.newPage();
  const res = await pg.request.get('http://localhost:3100/api/command-center-data');
  const data = await res.json();
  const ids = (data.opportunities||[]).map(o => o.solicitation_number || o.notice_id || o.id);
  const dupes = ids.length - new Set(ids).size;
  check('FU4: feed API returns deduped rows', dupes === 0, `${dupes} duplicate display identities in ${ids.length} rows`);
  await pg.close();
}

// ── FU5: pipeline POST idempotency ──
//   FU5a (provable now): a repeat POST creates no second row.
//   FU5b (migration-gated): CONCURRENT POSTs need the unique index from
//        20260729190000_pipeline_stage_codes.sql. Applying that migration is a
//        production DB change (CEO-gated), so this asserts nothing today — it is
//        REPORTED, never counted as a pass.
{
  const pg = await ctx.newPage();
  const REF = 'RACE-PROBE-0001';
  await pg.request.delete('http://localhost:3100/api/pipeline?solicitationNumber='+REF);
  const body = { solicitationNumber: REF, title:'Race probe', stageCode:'03', agency:'probe', naics:'336413', dueDate:'2026-09-01', estimatedValueM: 2 };

  await pg.request.post('http://localhost:3100/api/pipeline', { data: body });
  await pg.request.post('http://localhost:3100/api/pipeline', { data: body });
  let list = (await (await pg.request.get('http://localhost:3100/api/pipeline')).json()).pipeline || [];
  check('FU5a: repeat POST is idempotent (one row)', list.filter(r => r.solicitation_number === REF).length === 1,
        `${list.filter(r => r.solicitation_number === REF).length} rows`);
  await pg.request.delete('http://localhost:3100/api/pipeline?solicitationNumber='+REF);

  await Promise.all([
    pg.request.post('http://localhost:3100/api/pipeline', { data: body }),
    pg.request.post('http://localhost:3100/api/pipeline', { data: body }),
    pg.request.post('http://localhost:3100/api/pipeline', { data: body }),
  ]);
  list = (await (await pg.request.get('http://localhost:3100/api/pipeline')).json()).pipeline || [];
  const nConc = list.filter(r => r.solicitation_number === REF).length;
  console.log(`ℹ️  FU5b (migration-gated): 3 concurrent POSTs → ${nConc} row(s). ` +
    (nConc === 1 ? 'Index appears applied.' : 'Expected until pipeline_user_solicitation_uniq is applied; route already treats 23505 as idempotent.'));
  await pg.request.delete('http://localhost:3100/api/pipeline?solicitationNumber='+REF);
  await pg.close();
}

// ── FU6: /audit sign-in redirect preserves ?noticeId= IN THE next PARAM ──
{
  const anon = await b.newContext();
  const pg = await anon.newPage();
  const res = await pg.request.get('http://localhost:3100/audit?noticeId=ABC-123-XYZ', { maxRedirects: 0 });
  const loc = res.headers()['location'] || '';
  const nextParam = decodeURIComponent(new URL(loc, 'http://localhost:3100').searchParams.get('next') || '');
  check('FU6: sign-in `next` carries the noticeId deep link', nextParam.includes('noticeId=ABC-123-XYZ'), `next=${nextParam}`);
  await anon.close();
}

// ── FU7: sign-in `next` cannot bounce the user off-site (open redirect) ──
{
  const anon = await b.newContext();
  const pg = await anon.newPage();
  // example.com is never loaded: assert we never navigate off-origin.
  await pg.route('**://example.com/**', r => r.fulfill({ status: 200, body: 'OFFSITE' }));
  await pg.goto('http://localhost:3100/sign-in?next=https%3A%2F%2Fexample.com%2Fevil', { waitUntil:'domcontentloaded' });
  await pg.fill('input[type="email"], input[name="email"], #email', process.env.DEMO_EMAIL);
  await pg.fill('input[type="password"], input[name="password"], #password', process.env.DEMO_PASSWORD);
  await pg.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');
  await pg.waitForTimeout(4000);
  const landed = pg.url();
  check('FU7: off-site `next` does not navigate off-origin', landed.startsWith('http://localhost:3100'), landed);
  await anon.close();
}

console.log(`\n${fail===0?'ALL PASS':'FAILURES'} — ${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail?1:0);
