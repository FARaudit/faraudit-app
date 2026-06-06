import { test, expect } from '@playwright/test';

test('Week Ahead: every .wk-row href returns 200', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/command-center');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);

  const rows = page.locator('a.wk-row');
  const count = await rows.count();
  console.log(`Week Ahead rows: ${count}`);

  const hrefs: string[] = [];
  for (let i = 0; i < count; i++) {
    const h = await rows.nth(i).getAttribute('href');
    if (h) hrefs.push(h);
  }
  const unique = Array.from(new Set(hrefs));
  console.log(`Unique hrefs: ${unique.length}`);
  unique.forEach(h => console.log(`  → ${h}`));

  const failures: string[] = [];
  for (const href of unique) {
    if (!href.startsWith('/')) {
      failures.push(`${href} → NOT INTERNAL`);
      continue;
    }
    const resp = await page.request.get(`https://faraudit.com${href}`);
    const status = resp.status();
    console.log(`  ${status === 404 ? '✗' : '✓'} ${href} → ${status}`);
    if (status === 404) failures.push(`${href} → 404`);
  }

  expect(failures, `Week Ahead 404s: ${failures.join(', ')}`).toEqual([]);
});
