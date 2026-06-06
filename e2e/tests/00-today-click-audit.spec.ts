import { test, expect } from '@playwright/test';

test.describe('Tab 01 — Today — Full Click Audit', () => {

  test('every sidebar link resolves — no 404', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const links = page.locator('aside.sidebar a.sb-icon');
    const count = await links.count();
    const results: string[] = [];

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (!href) continue;

      const response = await page.goto(`https://faraudit.com${href}`);
      const status = response?.status();
      const finalUrl = page.url();
      const result = `${href} → ${status} (${finalUrl})`;
      results.push(result);
      console.log(result);

      expect(status, `${href} returned ${status}`).not.toBe(404);
      expect(finalUrl, `${href} redirected to sign-in`).not.toContain('sign-in');
    }

    console.log(`\n✓ ${results.length} sidebar links verified`);
  });

  test('every action feed CTA link resolves — no 404', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const ctaLinks = page.locator('#actFeed a.act-card');
    const count = await ctaLinks.count();
    console.log(`Action feed cards: ${count}`);

    for (let i = 0; i < count; i++) {
      const href = await ctaLinks.nth(i).getAttribute('href');
      if (!href || href === '#') {
        console.warn(`Card ${i+1}: href="${href}" — PLACEHOLDER`);
        continue;
      }
      const url = href.startsWith('http') ? href : `https://faraudit.com${href.startsWith('/') ? href : '/' + href}`;
      const response = await page.goto(url);
      const status = response?.status();
      console.log(`Card ${i+1} ${href} → ${status}`);
      expect(status, `CTA ${href} returned ${status}`).not.toBe(404);
      await page.goto('/command-center');
      await page.waitForTimeout(1000);
    }
  });

  test('KPI cards — verify clickable or static', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const kpiCards = page.locator('#kpiStrip [data-tone]');
    const count = await kpiCards.count();
    console.log(`KPI cards: ${count}`);

    for (let i = 0; i < count; i++) {
      const card = kpiCards.nth(i);
      const tag = await card.evaluate(el => el.tagName.toLowerCase());
      const href = await card.getAttribute('href');
      const onclick = await card.getAttribute('onclick');
      const label = await card.locator('.kpi-val').innerText().catch(() => 'no-val');
      console.log(`KPI ${i+1}: tag=${tag} href=${href} onclick=${onclick} val=${label}`);

      if (tag === 'a' && href && href !== '#') {
        const url = href.startsWith('http') ? href : `https://faraudit.com${href}`;
        const response = await page.goto(url);
        console.log(`KPI ${i+1} navigates → ${response?.status()}`);
        expect(response?.status()).not.toBe(404);
        await page.goto('/command-center');
        await page.waitForTimeout(1000);
      } else {
        console.log(`KPI ${i+1}: static display card — no navigation expected`);
      }
    }
  });

  test('Week Ahead calendar entries — links resolve or static', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const calLinks = page.locator('.wk-row a, [class*="wk-"] a');
    const count = await calLinks.count();
    console.log(`Calendar links: ${count}`);

    for (let i = 0; i < count; i++) {
      const href = await calLinks.nth(i).getAttribute('href');
      if (!href || href === '#') {
        console.warn(`Cal link ${i+1}: href="${href}" — PLACEHOLDER`);
        continue;
      }
      const url = href.startsWith('http') ? href : `https://faraudit.com${href.startsWith('/') ? href : '/' + href}`;
      const response = await page.goto(url);
      console.log(`Cal ${i+1} ${href} → ${response?.status()}`);
      expect(response?.status()).not.toBe(404);
      await page.goto('/command-center');
      await page.waitForTimeout(1000);
    }
  });

  test('Signals cards — links resolve or static', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const sigLinks = page.locator('.sig-desk a, [class*="sig-"] a');
    const count = await sigLinks.count();
    console.log(`Signal links: ${count}`);

    for (let i = 0; i < count; i++) {
      const href = await sigLinks.nth(i).getAttribute('href');
      if (!href || href === '#') {
        console.warn(`Signal link ${i+1}: href="${href}" — PLACEHOLDER`);
        continue;
      }
      const url = href.startsWith('http') ? href : `https://faraudit.com${href.startsWith('/') ? href : '/' + href}`;
      const response = await page.goto(url);
      console.log(`Signal ${i+1} ${href} → ${response?.status()}`);
      expect(response?.status()).not.toBe(404);
      await page.goto('/command-center');
      await page.waitForTimeout(1000);
    }
  });

  test('theme toggle — flips and persists across reload', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.locator('button#themeToggle').click();
    await page.waitForTimeout(300);
    const theme = await page.locator('html').getAttribute('data-theme');
    await page.reload();
    await page.waitForLoadState('networkidle');
    const afterReload = await page.locator('html').getAttribute('data-theme');
    console.log(`Theme after toggle: ${theme} · after reload: ${afterReload}`);
    expect(afterReload).toBe(theme);
    await page.locator('button#themeToggle').click();
  });

  test('priority tab filters — ALL CRITICAL THIS WEEK all work', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const tabs = [
      { selector: '.people-tab[data-f="all"]', label: 'ALL' },
      { selector: '.people-tab[data-f="crit"]', label: 'CRITICAL' },
      { selector: '.people-tab[data-f="warn"]', label: 'THIS WEEK' },
    ];

    for (const tab of tabs) {
      await page.locator(tab.selector).click();
      await page.waitForTimeout(400);
      const cards = await page.locator('#actFeed a.act-card').count();
      const active = await page.locator(tab.selector).getAttribute('class');
      console.log(`${tab.label}: ${cards} cards · active: ${active?.includes('active')}`);
      expect(active).toContain('active');
    }
    await page.locator('.people-tab[data-f="all"]').click();
  });

  test('sign out button — present and points to correct endpoint', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');

    const signout = page.locator('button.sb-signout, form[action*="sign-out"] button');
    await expect(signout).toBeVisible();
    const form = page.locator('form[action*="sign-out"]');
    const action = await form.getAttribute('action');
    console.log('Sign out action:', action);
    expect(action).toContain('sign-out');
    console.log('✓ Sign out present — NOT clicking to preserve session');
  });

});
