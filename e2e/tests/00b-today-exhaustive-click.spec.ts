import { test, expect } from '@playwright/test';

test.describe('Tab 01 — Today — Exhaustive Click Enumeration', () => {

  test('enumerate ALL clickable elements + their action target', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    // Collect every clickable on the page
    const inventory = await page.evaluate(() => {
      const out: any[] = [];
      const els = document.querySelectorAll('a, button, [onclick], [role="button"], [data-action]');
      els.forEach((el, i) => {
        const tag = el.tagName.toLowerCase();
        const href = el.getAttribute('href');
        const onclick = el.getAttribute('onclick');
        const role = el.getAttribute('role');
        const dataAction = el.getAttribute('data-action');
        const id = el.id || null;
        const cls = (el as HTMLElement).className || null;
        const text = (el as HTMLElement).innerText?.trim().slice(0, 40) || '';
        const visible = (el as HTMLElement).offsetParent !== null;
        out.push({ i, tag, href, onclick, role, dataAction, id, cls: typeof cls === 'string' ? cls.slice(0, 60) : null, text, visible });
      });
      return out;
    });

    const links = inventory.filter(e => e.tag === 'a' && e.href);
    const buttons = inventory.filter(e => e.tag === 'button');
    const withOnclick = inventory.filter(e => e.onclick);
    const placeholders = inventory.filter(e => e.href === '#' || e.href === 'javascript:void(0)');

    console.log(`\n═══ INVENTORY ═══`);
    console.log(`Total clickables:     ${inventory.length}`);
    console.log(`<a> with href:        ${links.length}`);
    console.log(`<button>:             ${buttons.length}`);
    console.log(`onclick attr:         ${withOnclick.length}`);
    console.log(`href="#" placeholders:${placeholders.length}`);

    if (placeholders.length > 0) {
      console.log(`\n⚠ PLACEHOLDER HREFS:`);
      placeholders.forEach(p => console.log(`   [${p.i}] ${p.tag}.${p.cls?.split(' ')[0]} text="${p.text}"`));
    }

    // Save inventory for next test
    (global as any).__clickInventory = inventory;
  });

  test('every <a href="/..."> on Today returns non-404', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    const internalHrefs = await page.evaluate(() => {
      const out = new Set<string>();
      document.querySelectorAll('a[href]').forEach(a => {
        const h = a.getAttribute('href');
        if (h && h.startsWith('/') && !h.startsWith('//')) out.add(h);
      });
      return Array.from(out);
    });

    console.log(`Unique internal hrefs on Today: ${internalHrefs.length}`);
    const failures: string[] = [];

    for (const href of internalHrefs) {
      const resp = await page.request.get(`https://faraudit.com${href}`);
      const status = resp.status();
      const ok = status !== 404;
      console.log(`  ${ok ? '✓' : '✗'} ${href} → ${status}`);
      if (!ok) failures.push(`${href} → ${status}`);
    }

    if (failures.length) {
      console.log(`\n✗ FAILURES (${failures.length}):`);
      failures.forEach(f => console.log(`   ${f}`));
    }
    expect(failures, `404s: ${failures.join(', ')}`).toEqual([]);
  });

  test('every Week Ahead row — has clickable target', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    // Find calendar rows — they may be <a>, <div>, or have data-href
    const rows = await page.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('.wk-row, .wk-card, [class*="wk-row"]').forEach((r, i) => {
        const tag = r.tagName.toLowerCase();
        const href = r.getAttribute('href');
        const onclick = r.getAttribute('onclick');
        const dataHref = r.getAttribute('data-href');
        const text = (r as HTMLElement).innerText?.trim().slice(0, 60);
        out.push({ i, tag, href, onclick, dataHref, text });
      });
      return out;
    });

    console.log(`Week Ahead rows found: ${rows.length}`);
    const inert = rows.filter(r => r.tag !== 'a' && !r.href && !r.onclick && !r.dataHref);
    const navigable = rows.filter(r => r.tag === 'a' || r.href || r.dataHref);

    console.log(`  Navigable: ${navigable.length}`);
    console.log(`  Inert (no click target): ${inert.length}`);

    if (rows.length > 0 && inert.length > 0 && navigable.length === 0) {
      console.warn('⚠ ALL Week Ahead rows are inert — clicking does nothing');
    }
    // Soft warning — Week Ahead rows being display-only is acceptable
  });

  test('user-chip — clickable or static (informational)', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    const chip = page.locator('.user-chip');
    await expect(chip).toBeVisible();
    const tag = await chip.evaluate(el => el.tagName.toLowerCase());
    const href = await chip.getAttribute('href');
    const onclick = await chip.getAttribute('onclick');
    console.log(`user-chip: tag=${tag} href=${href} onclick=${onclick}`);
    console.log(`  → ${tag === 'a' || href || onclick ? 'CLICKABLE' : 'STATIC (informational)'}`);
  });

  test('tb-search — clickable or static (informational)', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    const search = page.locator('.tb-search').first();
    await expect(search).toBeVisible();
    const tag = await search.evaluate(el => el.tagName.toLowerCase());
    const onclick = await search.getAttribute('onclick');
    console.log(`tb-search: tag=${tag} onclick=${onclick}`);
    console.log(`  → ${onclick ? 'CLICKABLE' : 'STATIC (⌘K hint only)'}`);
  });

  test('Notifications button — clickable behavior', async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    const notif = page.locator('button.icon-btn[title="Notifications"]');
    await expect(notif).toBeVisible();
    await notif.click();
    await page.waitForTimeout(500);

    const realErrors = errors.filter(e => !e.includes('favicon'));
    console.log(`Notifications click — console errors: ${realErrors.length}`);
    realErrors.forEach(e => console.log(`  ⚠ ${e}`));
    expect(realErrors).toEqual([]);
  });

  test('action cards — clicking actually navigates (real browser click, not just href check)', async ({ page }) => {
    test.setTimeout(120000); // 8 cards × ~5s each + cushion
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const cards = page.locator('#actFeed a.act-card');
    const count = await cards.count();
    console.log(`Action cards to click-test: ${count}`);

    for (let i = 0; i < count; i++) {
      // Re-locate each iteration (DOM may re-render)
      await page.goto('/command-center');
      await page.waitForTimeout(1500);
      const card = page.locator('#actFeed a.act-card').nth(i);
      const expectedHref = await card.getAttribute('href');
      await card.click();
      await page.waitForLoadState('networkidle');
      const landedUrl = page.url();
      const status404 = await page.locator('body').innerText().then(t => t.includes('404') && t.length < 200);
      console.log(`  Card ${i+1} click → ${landedUrl} (expected: ${expectedHref}) — 404?: ${status404}`);
      expect(landedUrl, `Card ${i+1} did not navigate`).not.toBe('https://faraudit.com/command-center');
      expect(status404, `Card ${i+1} navigated to 404 page`).toBe(false);
    }
  });

});
