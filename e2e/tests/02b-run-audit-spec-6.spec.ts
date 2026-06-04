import { test, expect } from '@playwright/test';

test.describe('Run Audit — 6 spec interactions', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  // ─── Q1 — Smart field detection ──────────────────────
  test('Q1 — 2 modes (no URL tab)', async ({ page }) => {
    const modes = page.locator('button.ra-mode-btn');
    expect(await modes.count()).toBe(2);
    const labels = (await modes.allInnerTexts()).map(t => t.trim()).join('|');
    console.log('Modes:', labels);
    expect(labels.toLowerCase()).toContain('paste link or id');
    expect(labels.toLowerCase()).toContain('upload');
  });

  test('Q1 — bare Notice ID resolves to ok detect chip', async ({ page }) => {
    await page.locator('#smartInput').fill('FA301626Q0068');
    await page.waitForTimeout(300);
    const detect = page.locator('#smartDetect');
    await expect(detect).toHaveClass(/\bok\b/);
    const txt = await detect.innerText();
    console.log('Detect:', txt.replace(/\n/g, ' · '));
    expect(txt.toUpperCase()).toContain('ID');
    await expect(page.locator('#smartRun')).toBeEnabled();
  });

  test('Q1 — hyphenated Notice ID (N00024-26-R-2207) accepts', async ({ page }) => {
    await page.locator('#smartInput').fill('N00024-26-R-2207');
    await page.waitForTimeout(300);
    const detect = page.locator('#smartDetect');
    await expect(detect).toHaveClass(/\bok\b/);
    await expect(page.locator('#smartRun')).toBeEnabled();
    console.log('✓ Hyphenated ID accepted');
  });

  test('Q1 — SAM.gov URL extracts noticeId', async ({ page }) => {
    await page.locator('#smartInput').fill('https://sam.gov/opp/FA301626Q0068/view');
    await page.waitForTimeout(300);
    const detect = page.locator('#smartDetect');
    await expect(detect).toHaveClass(/\bok\b/);
    const txt = await detect.innerText();
    console.log('Detect:', txt.replace(/\n/g, ' · '));
    expect(txt).toContain('FA301626Q0068');
    await expect(page.locator('#smartRun')).toBeEnabled();
  });

  test('Q1 + Q4 — bad URL surfaces inline error (no alert)', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', d => { alertFired = true; d.dismiss(); });
    await page.locator('#smartInput').fill('https://google.com/foo');
    await page.waitForTimeout(300);
    const detect = page.locator('#smartDetect');
    await expect(detect).toHaveClass(/\berr\b/);
    const txt = await detect.innerText();
    console.log('Bad URL detect:', txt.replace(/\n/g, ' · '));
    expect(txt.toLowerCase()).toContain('no notice id');
    await expect(page.locator('#smartRun')).toBeDisabled();
    expect(alertFired).toBe(false);
  });

  test('Q1 — Enter key submits when Run enabled', async ({ page }) => {
    await page.route('**/api/audit', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ solicitationNumber: 'FA301626Q0068', auditId: 't' }) });
    });
    const reqs: string[] = [];
    page.on('request', r => { if (r.url().includes('/api/audit') && r.method() === 'POST') reqs.push(r.url()); });
    await page.locator('#smartInput').fill('FA301626Q0068');
    await page.waitForTimeout(300);
    await page.locator('#smartInput').press('Enter');
    await page.waitForTimeout(1500);
    console.log('Enter POST count:', reqs.length);
    expect(reqs.length).toBeGreaterThan(0);
  });

  // ─── Q2 — Live pipeline loader ──────────────────────
  test('Q2 — submit triggers pipeline state machine (.pcall.active)', async ({ page }) => {
    // Stall the API so we can observe active state
    await page.route('**/api/audit', async route => {
      await new Promise(r => setTimeout(r, 3000));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ solicitationNumber: 'X', auditId: 't' }) });
    });
    await page.locator('#smartInput').fill('FA301626Q0068');
    await page.waitForTimeout(300);
    await page.locator('#smartRun').click();
    await page.waitForTimeout(1500);
    const activeCount = await page.locator('.pcall.active, .pcall.done').count();
    const elapsedShown = await page.locator('#plElapsed.show').count();
    console.log(`pcall active|done: ${activeCount} · elapsed visible: ${elapsedShown}`);
    expect(activeCount).toBeGreaterThan(0);
    expect(elapsedShown).toBe(1);
  });

  test('Q2 — pipeline explainer is always visible (no longer collapsible)', async ({ page }) => {
    // Core value prop must never collapse. Container is a plain <div> now —
    // it has no .open property and no <summary> toggle. Cards must render
    // at rest, before any submit.
    const container = page.locator('div.pipeline#pipelineDetails');
    await expect(container).toBeVisible();
    const detailsCount = await page.locator('details.pipeline').count();
    expect(detailsCount).toBe(0);
    const summaryCount = await page.locator('div.pipeline summary').count();
    expect(summaryCount).toBe(0);
    const calls = page.locator('.pcall');
    expect(await calls.count()).toBe(3);
    console.log('✓ Pipeline always visible · 3 .pcall cards rendered at rest');
  });

  // ─── Q3 — Dropzone real drag-drop + file chip + explicit Run ──
  test('Q3 — Upload mode shows dropzone, NOT chip+Run initially', async ({ page }) => {
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#dropzone')).toBeVisible();
    await expect(page.locator('#fileChip')).toBeHidden();
    await expect(page.locator('#uploadRunRow')).toBeHidden();
  });

  test('Q3 — selecting a fake file shows chip + explicit Run', async ({ page }) => {
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    // Use Playwright fileChooser pattern
    const buf = Buffer.from('%PDF-1.4 fake pdf body');
    await page.locator('#fileInput').setInputFiles({
      name: 'test-solicitation.pdf',
      mimeType: 'application/pdf',
      buffer: buf,
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#fileChip')).toBeVisible();
    await expect(page.locator('#uploadRunRow')).toBeVisible();
    const fname = await page.locator('#fcName').innerText();
    console.log('File chip name:', fname);
    expect(fname).toBe('test-solicitation.pdf');
    // Dropzone should be hidden when chip is shown
    await expect(page.locator('#dropzone')).toBeHidden();
  });

  test('Q3 — remove ✕ restores dropzone', async ({ page }) => {
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    await page.locator('#fileInput').setInputFiles({
      name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4'),
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#fileChip')).toBeVisible();
    await page.locator('#fcRemove').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#fileChip')).toBeHidden();
    await expect(page.locator('#dropzone')).toBeVisible();
    console.log('✓ Remove restores dropzone');
  });

  test('Q3 — oversize file (>25MB) shows inline error, no submit', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', d => { alertFired = true; d.dismiss(); });
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    const bigBuf = Buffer.alloc(26 * 1024 * 1024, '%');
    await page.locator('#fileInput').setInputFiles({
      name: 'huge.pdf', mimeType: 'application/pdf', buffer: bigBuf,
    });
    await page.waitForTimeout(400);
    const detect = page.locator('#uploadDetect');
    await expect(detect).toHaveClass(/\berr\b/);
    const txt = await detect.innerText();
    console.log('Size err:', txt.replace(/\n/g, ' · '));
    expect(txt).toContain('25MB');
    expect(alertFired).toBe(false);
  });

  test('Q3 — wrong file type (.txt) shows inline error', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', d => { alertFired = true; d.dismiss(); });
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    await page.locator('#fileInput').setInputFiles({
      name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
    });
    await page.waitForTimeout(400);
    const detect = page.locator('#uploadDetect');
    await expect(detect).toHaveClass(/\berr\b/);
    const txt = await detect.innerText();
    console.log('Type err:', txt.replace(/\n/g, ' · '));
    expect(txt.toLowerCase()).toContain('pdf or docx');
    expect(alertFired).toBe(false);
  });

  // ─── Q4 — Errors are inline (no alert) ──────────────────────
  test('Q4 — server error renders inline retry, no alert', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', d => { alertFired = true; d.dismiss(); });
    await page.route('**/api/audit', route => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Boom' }) });
    });
    await page.locator('#smartInput').fill('FA301626Q0068');
    await page.waitForTimeout(300);
    await page.locator('#smartRun').click();
    await page.waitForTimeout(1500);
    const detect = page.locator('#smartDetect');
    await expect(detect).toHaveClass(/\berr\b/);
    const role = await detect.getAttribute('role');
    console.log('Detect role:', role);
    expect(role).toBe('alert');
    expect(alertFired).toBe(false);
    const txt = await detect.innerText();
    console.log('Server err:', txt.replace(/\n/g, ' · '));
    expect(txt.toLowerCase()).toContain('retry');
  });

  // ─── Q5 — Page order: recent ABOVE pipeline explainer ──
  test('Q5 — recent block precedes pipeline explainer in DOM', async ({ page }) => {
    const order = await page.evaluate(() => {
      const recent = document.getElementById('recentBlock');
      const pipe   = document.getElementById('pipelineDetails');
      if (!recent || !pipe) return 'missing';
      const pos = recent.compareDocumentPosition(pipe);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? 'recent-first' : 'pipeline-first';
    });
    console.log('DOM order:', order);
    expect(order).toBe('recent-first');
  });

  test('Q5 — pipeline explainer is a non-collapsible <div> (always visible)', async ({ page }) => {
    // Core value prop — "What runs when you submit" must never collapse, even
    // for repeat users. Container is <div class="pipeline">, not <details>.
    const tag = await page.locator('#pipelineDetails').evaluate(el => el.tagName.toLowerCase());
    expect(tag).toBe('div');
    // CSS text-transform:uppercase rewrites innerText — use textContent for the source DOM string
    const labelText = await page.locator('#pipelineDetails .pipeline-label .t').evaluate(el => el.textContent || '');
    expect(labelText).toContain('What runs when you submit');
    console.log('✓ Pipeline is <div> · label:', labelText);
  });

  // ─── Q6 itemized ────────────────────────────────────────────
  test('Q6 — hero stack tightened (shield + title in single row)', async ({ page }) => {
    const head = page.locator('.ra-head');
    await expect(head).toBeVisible();
    const childCount = await head.locator('> *').count();
    expect(childCount).toBeGreaterThanOrEqual(2); // shield + h1 inline
    console.log(`.ra-head children: ${childCount}`);
  });

  test('Q6 — format chips replaced with caption (no fake buttons)', async ({ page }) => {
    const fakeChips = await page.locator('span.ra-chip').count();
    const hint = page.locator('.format-hint');
    await expect(hint).toBeVisible();
    const txt = await hint.innerText();
    console.log('format-hint:', txt);
    expect(fakeChips).toBe(0);
    expect(txt.toUpperCase()).toContain('RFQ');
  });

  test('Q6 — notifications panel wired (#bellBtn + #notifPanel)', async ({ page }) => {
    const bell = page.locator('#bellBtn');
    const panel = page.locator('#notifPanel');
    await expect(panel).not.toHaveClass(/open/);
    await bell.click();
    await page.waitForTimeout(300);
    await expect(panel).toHaveClass(/open/);
    const items = await page.locator('#npScroll .np-item').count();
    console.log(`Panel items: ${items}`);
    expect(items).toBe(7);
  });

  test('Q6 — Esc closes notifications panel', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#notifPanel')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#notifPanel')).not.toHaveClass(/open/);
  });

  test('Q6 — Arrow keys navigate between mode tabs (a11y)', async ({ page }) => {
    const smart = page.locator('button.ra-mode-btn[data-mode="smart"]');
    await smart.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const upload = page.locator('button.ra-mode-btn[data-mode="upload"]');
    const uploadActive = await upload.getAttribute('class');
    console.log('After ArrowRight, upload class:', uploadActive);
    expect(uploadActive).toContain('active');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const smartActive = await smart.getAttribute('class');
    expect(smartActive).toContain('active');
  });

  test('Q6 — sample link has real href (not href="#")', async ({ page }) => {
    const link = page.locator('#sampleLink');
    const href = await link.getAttribute('href');
    console.log('Sample link:', href);
    expect(href).not.toBe('#');
    expect(href?.startsWith('/')).toBe(true);
  });

  test('Q6 — recent rows have arrow + real href + readable headline (after API loads)', async ({ page }) => {
    await page.waitForTimeout(1500); // let /api/audits resolve
    const rows = page.locator('.ra-recent-list .ra-row');
    const count = await rows.count();
    console.log(`Recent rows: ${count}`);
    expect(count).toBeGreaterThan(0);

    const firstHref = await rows.first().getAttribute('href');
    const arrow = await rows.first().locator('.ra-row-arrow').count();
    console.log(`First href: ${firstHref} · arrow: ${arrow}`);
    expect(firstHref).not.toBe('#');
    expect(firstHref?.startsWith('/audit/')).toBe(true);
    expect(arrow).toBe(1);

    // Headline must NEVER be a raw UUID, a "pdf-<ts>" synthetic notice_id, or
    // a SAM.gov 20+ char opaque hex blob — none are human-readable. Meta line
    // must never contain a 20+ char hex blob or a status string (those belong
    // to the score tile's verdict word, not the agency slot).
    for (let i = 0; i < count; i++) {
      const sol = (await rows.nth(i).locator('.ra-row-sol').innerText()).trim();
      const meta = (await rows.nth(i).locator('.ra-row-meta').innerText()).trim();
      console.log(`Row ${i+1} sol: ${sol} · meta: ${meta || '(empty)'}`);

      expect(sol.toLowerCase().startsWith('pdf-')).toBe(false);
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sol)).toBe(false);
      const bare = sol.split(/\s/)[0];
      expect(/^[0-9a-f]{20,}$/i.test(bare)).toBe(false);
      expect(/\s[0-9a-f]{20,}$/i.test(sol)).toBe(false);
      expect(sol.length).toBeGreaterThan(0);

      expect(/[0-9a-f]{20,}/i.test(meta)).toBe(false);
      expect(/^(audit complete|awaiting score)$/i.test(meta)).toBe(false);
    }
  });

  test('Q6 — meta line shows bold .agency · title when /api/audits returns agency', async ({ page }) => {
    // Mock with agency-populated rows so we can verify the .agency span
    // renders correctly. Production audits often have agency=null right now
    // (a separate data-pipeline issue), so the positive-path assertion needs
    // its own mocked fixture.
    await page.route('**/api/audits*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          audits: [
            { id: 'aa-1', solicitation_number: 'N00024-26-R-2207', title: 'SPY-6 Phase IV Radar', agency: 'Naval Sea Systems Command', compliance_score: 94, status: 'complete', created_at: new Date().toISOString() },
            { id: 'aa-2', solicitation_number: 'FA8730-26-Q-0114', title: 'F-35 Test Harness',     agency: 'Dept. of the Air Force',    compliance_score: 88, status: 'complete', created_at: new Date().toISOString() }
          ]
        })
      });
    });
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const rows = page.locator('.ra-recent-list .ra-row');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Every row must render the bold .agency span with the agency text + the
    // title after a "·" separator.
    const r0agency = await rows.nth(0).locator('.ra-row-meta .agency').innerText();
    const r0meta = (await rows.nth(0).locator('.ra-row-meta').innerText()).trim();
    console.log(`Row 1 agency span: ${r0agency} · full meta: ${r0meta}`);
    expect(r0agency.trim()).toBe('Naval Sea Systems Command');
    expect(r0meta).toContain('Naval Sea Systems Command');
    expect(r0meta).toContain('SPY-6 Phase IV Radar');
    expect(r0meta).toContain('·');

    const r1agency = await rows.nth(1).locator('.ra-row-meta .agency').innerText();
    expect(r1agency.trim()).toBe('Dept. of the Air Force');
  });

});
