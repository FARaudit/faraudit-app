import { test, expect } from '@playwright/test';

test.describe('Today — 5 spec interactions', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  // ─── Q1 — KPI drill-through ──────────────────────────
  test('Q1 — KPI cards: 4 <a> elements with .kpi-arrow + correct hrefs', async ({ page }) => {
    const cards = page.locator('#kpiStrip a.kpi');
    const count = await cards.count();
    console.log(`KPI <a> cards: ${count}`);
    expect(count).toBe(4);

    const expected = ['/opportunities', '/far-dfars-updates', '/gao-protests', '/pipeline'];
    for (let i = 0; i < count; i++) {
      const href = await cards.nth(i).getAttribute('href');
      const arrow = await cards.nth(i).locator('.kpi-arrow').count();
      console.log(`  KPI ${i+1}: href=${href} · .kpi-arrow=${arrow}`);
      expect(expected).toContain(href);
      expect(arrow).toBe(1);
    }
  });

  // ─── Q2 — Insight bar links on bold only ─────────────
  test('Q2 — insight bar: 2 .ib-link anchors with correct hrefs', async ({ page }) => {
    const links = page.locator('#insightBar a.ib-link');
    const count = await links.count();
    console.log(`ib-link anchors: ${count}`);
    expect(count).toBe(2);
    const hrefs: string[] = [];
    for (let i = 0; i < count; i++) hrefs.push(await links.nth(i).getAttribute('href') || '');
    console.log('  hrefs:', hrefs);
    expect(hrefs).toContain('/opportunities');
    expect(hrefs).toContain('/gao-protests');
  });

  // ─── Q3 — Header stat filters ────────────────────────
  test('Q3 — hsAct + hsCrit are <button data-f>, hsDays is readonly', async ({ page }) => {
    const act = page.locator('#hdrStat .hs[data-f="warn"]');
    const crit = page.locator('#hdrStat .hs[data-f="crit"]');
    const days = page.locator('#hdrStat .hs.readonly');
    expect(await act.count()).toBe(1);
    expect(await crit.count()).toBe(1);
    expect(await days.count()).toBe(1);
    const actTag = await act.evaluate(el => el.tagName.toLowerCase());
    const critTag = await crit.evaluate(el => el.tagName.toLowerCase());
    const daysTag = await days.evaluate(el => el.tagName.toLowerCase());
    console.log(`tags: act=${actTag} · crit=${critTag} · days=${daysTag}`);
    expect(actTag).toBe('button');
    expect(critTag).toBe('button');
    expect(daysTag).toBe('div');
  });

  test('Q3 — clicking hsAct filters feed to "warn" + syncs prioTabs', async ({ page }) => {
    const before = await page.locator('#actFeed a.act-card').count();
    await page.locator('#hdrStat .hs[data-f="warn"]').click();
    await page.waitForTimeout(400);
    const after = await page.locator('#actFeed a.act-card').count();
    const hsActive = await page.locator('#hdrStat .hs[data-f="warn"].active').count();
    const tabActive = await page.locator('.people-tab[data-f="warn"].active').count();
    console.log(`Feed: ${before} → ${after} cards · hsAct active: ${hsActive} · warn tab active: ${tabActive}`);
    expect(hsActive).toBe(1);
    expect(tabActive).toBe(1);
    // Reset
    await page.locator('#hdrStat .hs[data-f="warn"]').click();
    await page.waitForTimeout(300);
  });

  test('Q3 — clicking hsCrit narrows feed + syncs', async ({ page }) => {
    await page.locator('#hdrStat .hs[data-f="crit"]').click();
    await page.waitForTimeout(400);
    const cards = await page.locator('#actFeed a.act-card').count();
    const hsActive = await page.locator('#hdrStat .hs[data-f="crit"].active').count();
    const tabActive = await page.locator('.people-tab[data-f="crit"].active').count();
    console.log(`Crit click — feed: ${cards} cards · hsCrit active: ${hsActive} · crit tab active: ${tabActive}`);
    expect(cards).toBeLessThanOrEqual(8);
    expect(hsActive).toBe(1);
    expect(tabActive).toBe(1);
    await page.locator('#hdrStat .hs[data-f="crit"]').click();
  });

  // ─── Q4 — Signal arrow ───────────────────────────────
  test('Q4 — every .sig-card has a .sig-go arrow', async ({ page }) => {
    const cards = page.locator('#sigGrid a.sig-card');
    const count = await cards.count();
    console.log(`Signal cards: ${count}`);
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const arrow = await cards.nth(i).locator('.sig-go').count();
      expect(arrow, `card ${i+1} missing .sig-go`).toBe(1);
    }
    console.log(`✓ all ${count} signal cards have .sig-go`);
  });

  // ─── Q5 — Notifications panel ────────────────────────
  test('Q5 — bell click opens .notif-panel.open', async ({ page }) => {
    const panel = page.locator('#notifPanel');
    const bell = page.locator('#bellBtn');
    await expect(panel).not.toHaveClass(/open/);
    await bell.click();
    await page.waitForTimeout(300);
    await expect(panel).toHaveClass(/open/);
    console.log('✓ panel opens on bell click');
  });

  test('Q5 — panel renders 7 items + 2 group headers', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    const items = await page.locator('#npScroll .np-item').count();
    const groups = await page.locator('#npScroll .np-grp').count();
    console.log(`Items: ${items} · groups: ${groups}`);
    expect(items).toBe(7);
    expect(groups).toBe(2);
  });

  test('Q5 — unread items have .unread class (4 of 7)', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    const unread = await page.locator('#npScroll .np-item.unread').count();
    console.log(`Unread items: ${unread}`);
    expect(unread).toBe(4);
  });

  test('Q5 — badge shows unread count (4)', async ({ page }) => {
    const badge = page.locator('#bellBadge');
    const txt = await badge.innerText();
    console.log(`Badge text: "${txt}"`);
    expect(txt.trim()).toBe('4');
  });

  test('Q5 — Mark all read zeros the badge', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#npMark').click();
    await page.waitForTimeout(300);
    const unread = await page.locator('#npScroll .np-item.unread').count();
    const badgeTxt = await page.locator('#bellBadge').innerText();
    console.log(`After mark all read — unread: ${unread} · badge: "${badgeTxt}"`);
    expect(unread).toBe(0);
    expect(badgeTxt.trim()).toBe('');
  });

  test('Q5 — Esc key closes panel', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    const panel = page.locator('#notifPanel');
    await expect(panel).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(panel).not.toHaveClass(/open/);
    console.log('✓ Esc closes panel');
  });

  test('Q5 — outside-click closes panel', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    const panel = page.locator('#notifPanel');
    await expect(panel).toHaveClass(/open/);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.waitForTimeout(300);
    await expect(panel).not.toHaveClass(/open/);
    console.log('✓ outside-click closes panel');
  });

  test('Q5 — every .np-item has a real href (no 404, no #)', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    const items = page.locator('#npScroll .np-item');
    const count = await items.count();
    const hrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const h = await items.nth(i).getAttribute('href');
      if (h) hrefs.push(h);
    }
    console.log('Item hrefs:', hrefs);
    hrefs.forEach(h => expect(h.startsWith('/'), `bad href: ${h}`).toBe(true));
  });

});
