import { test, expect } from '@playwright/test';

test.describe('Tab 02 — Run Audit', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('loads without auth redirect or blank body', async ({ page }) => {
    await expect(page).not.toHaveURL(/sign-in/);
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(50);
    console.log('✓ Run Audit loaded');
  });

  test('sidebar: 17 nav links present', async ({ page }) => {
    const links = page.locator('aside.sidebar a.sb-icon');
    const count = await links.count();
    console.log(`Sidebar links: ${count}`);
    expect(count).toBe(17);
  });

  test('sidebar: Run Audit is active link', async ({ page }) => {
    const active = page.locator('aside.sidebar a.sb-icon.active');
    const href = await active.getAttribute('href');
    console.log('Active sidebar link:', href);
    expect(href).toContain('audit');
  });

  test('mode switcher: 2 mode buttons render (per spec Q1 — collapsed from 3)', async ({ page }) => {
    const modes = page.locator('button.ra-mode-btn');
    const count = await modes.count();
    console.log(`Mode buttons: ${count}`);
    expect(count).toBe(2);
    const labels: string[] = [];
    for (let i = 0; i < count; i++) labels.push(await modes.nth(i).innerText());
    console.log('Modes:', labels.join(' | '));
  });

  test('mode switcher: smart mode active by default', async ({ page }) => {
    const smartBtn = page.locator('button.ra-mode-btn[data-mode="smart"]');
    const cls = await smartBtn.getAttribute('class');
    console.log('smart class:', cls);
    expect(cls).toContain('active');
  });

  test('mode switcher: smart panel visible by default', async ({ page }) => {
    const panel = page.locator('[data-mode-panel="smart"]');
    await expect(panel).toBeVisible();
    const uploadPanel = page.locator('[data-mode-panel="upload"]');
    await expect(uploadPanel).toBeHidden();
  });

  test('mode switcher: clicking Upload mode shows upload panel', async ({ page }) => {
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    const uploadPanel = page.locator('[data-mode-panel="upload"]');
    await expect(uploadPanel).toBeVisible();
    const smartPanel = page.locator('[data-mode-panel="smart"]');
    await expect(smartPanel).toBeHidden();
    console.log('✓ Upload mode panel shown');
  });

  test('smart mode: input visible with correct placeholder', async ({ page }) => {
    const input = page.locator('#smartInput');
    await expect(input).toBeVisible();
    const ph = await input.getAttribute('placeholder');
    console.log('Placeholder:', ph);
    expect(ph?.toLowerCase()).toContain('url or notice id');
  });

  test('smart mode: input accepts notice ID + enables Run', async ({ page }) => {
    const input = page.locator('#smartInput');
    const run = page.locator('#smartRun');
    await expect(run).toBeDisabled();
    await input.fill('FA301626Q0068');
    await page.waitForTimeout(300);
    await expect(input).toHaveValue('FA301626Q0068');
    await expect(run).toBeEnabled();
    console.log('✓ Run enabled after valid ID entry');
  });

  test('smart mode: Run starts disabled per Q1 spec', async ({ page }) => {
    const run = page.locator('#smartRun');
    await expect(run).toBeDisabled();
    console.log('✓ Run disabled on empty input');
  });

  test('smart mode: empty submit cannot fire (button disabled)', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/audit') && req.method() === 'POST') calls.push(req.url());
    });
    const run = page.locator('#smartRun');
    await expect(run).toBeDisabled();
    // No click possible — disabled prevents submit by design
    await page.waitForTimeout(500);
    expect(calls.length).toBe(0);
    console.log('✓ Empty submit blocked by disabled Run');
  });

  test('Upload mode: dropzone visible with file input', async ({ page }) => {
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    const dropzone = page.locator('#dropzone');
    await expect(dropzone).toBeVisible();
    const fileInput = page.locator('#fileInput');
    expect(await fileInput.count()).toBe(1);
    console.log('✓ Dropzone + file input present');
  });

  test('Upload mode: shows PDF DOCX type hint', async ({ page }) => {
    await page.locator('button.ra-mode-btn[data-mode="upload"]').click();
    await page.waitForTimeout(300);
    const typeHint = page.locator('.ra-dz-types');
    await expect(typeHint).toBeVisible();
    const text = await typeHint.innerText();
    console.log('Type hint:', text);
    expect(text).toContain('PDF');
  });

  test('pipeline preview: always-visible explainer renders 3 intelligence call blocks', async ({ page }) => {
    // Pipeline is now always-open (no <details> toggle) — core value prop must
    // never collapse, even for repeat users. Container is div.pipeline.
    const container = page.locator('div.pipeline#pipelineDetails');
    await expect(container).toBeVisible();
    const label = container.locator('.pipeline-label .t');
    await expect(label).toHaveText(/What runs when you submit/);
    const calls = page.locator('.pcall');
    const count = await calls.count();
    console.log(`Pipeline call blocks: ${count}`);
    expect(count).toBe(3);
    for (let i = 0; i < count; i++) {
      const title = await calls.nth(i).locator('.pcall-title').innerText();
      console.log(`Call ${i+1}:`, title);
    }
  });

  test('recent audits: grid or empty state renders', async ({ page }) => {
    const grid = page.locator('#recentGrid');
    const empty = page.locator('#recentEmpty');
    const gridVisible = await grid.isVisible();
    const emptyVisible = await empty.isVisible();
    console.log(`Recent grid visible: ${gridVisible} · empty visible: ${emptyVisible}`);
    expect(gridVisible || emptyVisible).toBe(true);
  });

  test('recent audits: rows have score tiles with verdict word', async ({ page }) => {
    const rows = page.locator('.ra-recent-list .ra-row');
    const count = await rows.count();
    console.log(`Recent audit rows: ${count}`);
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 3); i++) {
      const n = await rows.nth(i).locator('.ra-score .n').innerText();
      const v = await rows.nth(i).locator('.ra-score .v').innerText();
      console.log(`Row ${i+1}: ${n.trim()} / ${v.trim()}`);
      expect(n.trim().length).toBeGreaterThan(0);
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });

  test('sample audit report link is present + has real href', async ({ page }) => {
    const link = page.locator('#sampleLink');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    const text = await link.innerText();
    console.log('Sample link href:', href, '·', text);
    expect(href).not.toBe('#');
    expect(href?.startsWith('/')).toBe(true);
  });

  test('topbar: theme toggle, notifications, user chip all present', async ({ page }) => {
    await expect(page.locator('button#themeToggle')).toBeVisible();
    await expect(page.locator('button#bellBtn')).toBeVisible();
    await expect(page.locator('.user-chip')).toBeVisible();
    console.log('✓ Topbar elements confirmed');
  });

  test('submit with valid ID intercepts POST to /api/audit', async ({ page }) => {
    await page.route('**/api/audit', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          solicitationNumber: 'FA301626Q0068',
          auditId: 'test-id'
        }),
      });
    });

    const requests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/audit') && req.method() === 'POST') requests.push(req.url());
    });

    const input = page.locator('#smartInput');
    await input.fill('FA301626Q0068');
    await page.waitForTimeout(400);
    const run = page.locator('#smartRun');
    await expect(run).toBeEnabled();
    await run.click();
    await page.waitForTimeout(2000);

    console.log('POST calls intercepted:', requests.length);
    expect(requests.length).toBeGreaterThan(0);
  });

});
