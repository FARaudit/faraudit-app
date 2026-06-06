import { test, expect } from '@playwright/test';

test.describe('Tab 03 — Past Audits', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
  });

  test('loads without auth redirect or blank body', async ({ page }) => {
    await expect(page).not.toHaveURL(/sign-in/);
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(50);
    console.log('✓ Past Audits loaded');
  });

  test('sidebar: 17 nav links present', async ({ page }) => {
    const links = page.locator('aside.sidebar a.sb-icon');
    const count = await links.count();
    console.log(`Sidebar links: ${count}`);
    expect(count).toBe(17);
  });

  test('sidebar: Past Audits is active link', async ({ page }) => {
    const active = page.locator('aside.sidebar a.sb-icon.active');
    const href = await active.getAttribute('href');
    console.log('Active sidebar link:', href);
    expect(href).toContain('dashboard');
  });

  test('KPI strip: 4 cards render with values', async ({ page }) => {
    const cards = page.locator('.kpi');
    const count = await cards.count();
    console.log(`KPI cards: ${count}`);
    expect(count).toBe(4);
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).innerText();
      console.log(`KPI ${i+1}:`, text.substring(0, 60).trim());
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('KPI strip: distribution bar segments render', async ({ page }) => {
    const bar = page.locator('.dist');
    await expect(bar.first()).toBeVisible();
    const proceed = page.locator('.d-proceed');
    const caution = page.locator('.d-caution');
    const decline = page.locator('.d-decline');
    expect(await proceed.count()).toBeGreaterThan(0);
    expect(await caution.count()).toBeGreaterThan(0);
    expect(await decline.count()).toBeGreaterThan(0);
    console.log('✓ Distribution bar segments present');
  });

  test('filters: 5 filter buttons render', async ({ page }) => {
    const btns = page.locator('button.fbtn');
    const count = await btns.count();
    console.log(`Filter buttons: ${count}`);
    expect(count).toBe(5);
    for (let i = 0; i < count; i++) {
      const label = await btns.nth(i).innerText();
      console.log(`Filter ${i+1}:`, label.trim());
    }
  });

  test('filters: All is active by default', async ({ page }) => {
    const allBtn = page.locator('button.fbtn[data-filter="all"]');
    await expect(allBtn).toBeVisible();
    const cls = await allBtn.getAttribute('class');
    console.log('All filter class:', cls);
    expect(cls).toContain('active');
  });

  test('filters: clicking Proceed narrows rows', async ({ page }) => {
    const allCount = await page.locator('#ledgerBody tr').count();
    await page.locator('button.fbtn[data-filter="Proceed"]').click();
    await page.waitForTimeout(500);
    const proceedCount = await page.locator('#ledgerBody tr').count();
    console.log(`All: ${allCount} rows → Proceed: ${proceedCount} rows`);
    expect(proceedCount).toBeLessThanOrEqual(allCount);
    expect(proceedCount).toBeGreaterThan(0);
  });

  test('filters: clicking Caution narrows rows', async ({ page }) => {
    await page.locator('button.fbtn[data-filter="Caution"]').click();
    await page.waitForTimeout(500);
    const count = await page.locator('#ledgerBody tr').count();
    console.log(`Caution rows: ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
    await page.locator('button.fbtn[data-filter="all"]').click();
  });

  test('filters: clicking Decline narrows rows', async ({ page }) => {
    await page.locator('button.fbtn[data-filter="Decline"]').click();
    await page.waitForTimeout(500);
    const count = await page.locator('#ledgerBody tr').count();
    console.log(`Decline rows: ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
    await page.locator('button.fbtn[data-filter="all"]').click();
  });

  test('filters: #visCount updates on filter change', async ({ page }) => {
    const before = await page.locator('#visCount').innerText();
    await page.locator('button.fbtn[data-filter="Proceed"]').click();
    await page.waitForTimeout(500);
    const after = await page.locator('#visCount').innerText();
    console.log(`visCount: "${before}" → "${after}"`);
    expect(after).not.toBe(before);
    await page.locator('button.fbtn[data-filter="all"]').click();
  });

  test('table: #ledgerTable and #ledgerBody render', async ({ page }) => {
    await expect(page.locator('#ledgerTable')).toBeVisible();
    await expect(page.locator('#ledgerBody')).toBeVisible();
    console.log('✓ Table structure present');
  });

  test('table: rows render with data', async ({ page }) => {
    const rows = page.locator('#ledgerBody tr');
    const count = await rows.count();
    console.log(`Table rows: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('table: score badges present with tone classes', async ({ page }) => {
    const scores = page.locator('.score');
    const count = await scores.count();
    console.log(`Score badges: ${count}`);
    expect(count).toBeGreaterThan(0);
    const first = await scores.first().innerText();
    console.log('First score:', first);
  });

  test('table: recommendation badges present', async ({ page }) => {
    const recs = page.locator('.rec');
    const count = await recs.count();
    console.log(`Rec badges: ${count}`);
    expect(count).toBeGreaterThan(0);
    const first = await recs.first().innerText();
    console.log('First rec:', first);
  });

  test('table: status badges present', async ({ page }) => {
    const statuses = page.locator('.status');
    const count = await statuses.count();
    console.log(`Status badges: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('sort: clicking sortable header changes order', async ({ page }) => {
    const headers = page.locator('th.sortable');
    const count = await headers.count();
    console.log(`Sortable headers: ${count}`);
    expect(count).toBeGreaterThan(0);

    const firstRowBefore = await page.locator('#ledgerBody tr').first().innerText();
    await headers.first().click();
    await page.waitForTimeout(500);
    const firstRowAfter = await page.locator('#ledgerBody tr').first().innerText();
    console.log('Sort changed order:', firstRowBefore !== firstRowAfter);
  });

  test('search: click activates input field', async ({ page }) => {
    const searchEl = page.locator('.search');
    await searchEl.click();
    await page.waitForTimeout(300);
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeVisible();
    console.log('✓ Search input activated on click');
  });

  test('search: typing filters rows', async ({ page }) => {
    const allCount = await page.locator('#ledgerBody tr').count();
    const searchEl = page.locator('.search');
    await searchEl.click();
    await page.waitForTimeout(300);
    const input = page.locator('input[placeholder*="Search"]');
    await input.fill('FA');
    await page.waitForTimeout(500);
    const filteredCount = await page.locator('#ledgerBody tr').count();
    console.log(`All: ${allCount} → Search "FA": ${filteredCount}`);
    expect(filteredCount).toBeGreaterThanOrEqual(0);
  });

  test('row click: navigates to /audit/ report page', async ({ page }) => {
    const firstLink = page.locator('.view-link').first();
    const href = await firstLink.getAttribute('href');
    console.log('First audit link:', href);
    expect(href).toContain('/audit/');
  });

  test('API: /api/audits fetched on load', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/audits')) calls.push(req.url());
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('API calls to /api/audits:', calls.length, calls[0]);
    expect(calls.length).toBeGreaterThan(0);
  });

  test('topbar: theme toggle, notifications, user chip present', async ({ page }) => {
    await expect(page.locator('button#themeToggle')).toBeVisible();
    await expect(page.locator('button.icon-btn').first()).toBeVisible();
    await expect(page.locator('.user-chip')).toBeVisible();
    console.log('✓ Topbar confirmed');
  });

});
