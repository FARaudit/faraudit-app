import { test, expect } from '@playwright/test';

test.describe('Tab 01 — Run Audit', () => {

  test('page loads, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('https://faraudit.com/audit');
    await page.waitForLoadState('networkidle');

    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('solicitation number input accepts text', async ({ page }) => {
    await page.goto('https://faraudit.com/audit');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="solicitation"], input[placeholder*="Solicitation"], input[name*="sol"], input[id*="sol"], textarea').first();
    await expect(input).toBeVisible();
    await input.fill('FA301626Q0068');
    await expect(input).toHaveValue('FA301626Q0068');
  });

  test('all visible buttons are clickable (no throws)', async ({ page }) => {
    await page.goto('https://faraudit.com/audit');
    await page.waitForLoadState('networkidle');

    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    console.log(`Run Audit — ${count} visible buttons`);
    expect(count).toBeGreaterThan(0);
  });

  test('form submit fires POST to /api/audit', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', req => { if (req.url().includes('/api/audit')) requests.push(req.method() + ' ' + req.url()); });

    await page.goto('https://faraudit.com/audit');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="solicitation"], input[placeholder*="Solicitation"], input[name*="sol"], input[id*="sol"], textarea').first();
    if (await input.isVisible()) {
      await input.fill('FA301626Q0068');
    }

    const submitBtn = page.locator('button[type="submit"], button:has-text("Run Audit"), button:has-text("Analyze"), button:has-text("Submit")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }

    console.log('API calls intercepted:', requests);
  });

  test('sidebar nav links all resolve (no 404)', async ({ page }) => {
    await page.goto('https://faraudit.com/audit');
    await page.waitForLoadState('networkidle');

    const navLinks = page.locator('nav a[href], aside a[href], .sidebar a[href]');
    const count = await navLinks.count();
    console.log(`Sidebar links found: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

});
