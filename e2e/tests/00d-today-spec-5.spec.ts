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
  // Owner: public/notifications-chrome.js (shared chrome on all 21 surfaces).
  //
  // These assertions used to be `items===7 / unread===4 / badge==="4"` — the
  // seven INVENTED notifications that commit 704f668 deleted. The spec was
  // never updated, so it sat asserting a fabrication: it could only pass if
  // the invented rows came back. Counts are now derived from the API response
  // (self-consistency) and the load-bearing cases plant their own fixtures so
  // the gate can actually fail.

  const FIXTURE = [
    { id: '11111111-1111-4111-8111-111111111111', kind: 'watcher_posted',
      title: 'W912 tracked notice just posted', body: 'Auto-audit complete · BID',
      link: '/audit/11111111-1111-4111-8111-111111111111', meta: {},
      read_at: null, created_at: new Date().toISOString() },
    { id: '22222222-2222-4222-8222-222222222222', kind: 'watcher_posted',
      title: 'Hostile link row', body: 'link must not survive validation',
      link: 'javascript:alert(1)', meta: {},
      read_at: null, created_at: new Date().toISOString() },
    { id: '33333333-3333-4333-8333-333333333333', kind: 'unknown_kind_xyz',
      title: 'Already read', body: 'should not count as unread',
      link: '/past-audits', meta: {},
      read_at: new Date().toISOString(), created_at: '2020-01-02T00:00:00.000Z' }
  ];

  /** Serve a fixed list for the list endpoint, leaving /read alone. */
  async function stubList(page: any, body: any, status = 200) {
    await page.route('**/api/notifications**', async (route: any) => {
      if (route.request().url().includes('/read')) return route.fallback();
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
  }

  test('Q5 — bell click opens .notif-panel.open', async ({ page }) => {
    const panel = page.locator('#notifPanel');
    const bell = page.locator('#bellBtn');
    await expect(panel).not.toHaveClass(/open/);
    await bell.click();
    await page.waitForTimeout(300);
    await expect(panel).toHaveClass(/open/);
  });

  test('Q5 — Esc key closes panel', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#notifPanel')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#notifPanel')).not.toHaveClass(/open/);
  });

  test('Q5 — outside-click closes panel', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#notifPanel')).toHaveClass(/open/);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.waitForTimeout(300);
    await expect(page.locator('#notifPanel')).not.toHaveClass(/open/);
  });

  test('Q5 — panel is never blank: always rows or exactly one honest state', async ({ page }) => {
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(600);
    const text = (await page.locator('#npScroll').innerText()).trim();
    expect(text.length, 'panel rendered empty — the naics/run-audit defect').toBeGreaterThan(0);
    // Never still "Loading…" once the fetch has settled.
    expect(text).not.toContain('Loading…');
  });

  test('Q5 — badge, #npCount and .unread rows all agree', async ({ page }) => {
    await stubList(page, { unreadCount: 2, notifications: FIXTURE });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(400);

    const unreadRows = await page.locator('#npScroll .np-item.unread').count();
    const countTxt   = (await page.locator('#npCount').innerText()).trim();
    const badgeTxt   = (await page.locator('#bellBadge').innerText()).trim();
    console.log(`unread rows=${unreadRows} · npCount="${countTxt}" · badge="${badgeTxt}"`);

    expect(unreadRows).toBe(2);                    // 2 of the 3 fixtures are unread
    expect(countTxt).toBe(String(unreadRows));
    expect(badgeTxt).toBe(String(unreadRows));
    expect(await page.locator('#npScroll .np-item').count()).toBe(FIXTURE.length);
    // Two different created_at eras → Today + Earlier
    expect(await page.locator('#npScroll .np-grp').count()).toBe(2);
  });

  // FALSIFICATION PROBE. An outage must NOT read as an empty inbox — "you're
  // all caught up" over data we failed to fetch is a false all-clear.
  test('Q5 — a 503 says "unavailable", never "all caught up"', async ({ page }) => {
    await stubList(page, { error: 'down' }, 503);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(400);

    const text = await page.locator('#npScroll').innerText();
    console.log('outage text:', text.replace(/\s+/g, ' ').slice(0, 90));
    expect(text).toContain('unavailable');
    expect(text).not.toContain('caught up');
    expect(text).not.toContain('No notifications');
    // Nothing trustworthy to mark, so no badge is asserted.
    await expect(page.locator('#bellBadge')).toBeHidden();
  });

  test('Q5 — empty inbox says "caught up", never "unavailable"', async ({ page }) => {
    await stubList(page, { unreadCount: 0, notifications: [] });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(400);

    const text = await page.locator('#npScroll').innerText();
    expect(text).toContain('caught up');
    expect(text).not.toContain('unavailable');
    await expect(page.locator('#bellBadge')).toBeHidden();
  });

  // FALSIFICATION PROBE. Row values are DB rows seeded from SAM-sourced titles,
  // i.e. externally influenced. A javascript: link must never become an href.
  test('Q5 — row hrefs are safe: same-origin paths only, no javascript:', async ({ page }) => {
    await stubList(page, { unreadCount: 2, notifications: FIXTURE });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(400);

    const hrefs = await page.locator('#npScroll .np-item').evaluateAll(
      (els: Element[]) => els.map(e => e.getAttribute('href'))
    );
    console.log('hrefs:', hrefs);
    // The hostile row still renders, but as a non-link.
    expect(hrefs).toContain(null);
    hrefs.filter(Boolean).forEach(h => {
      expect(h!.startsWith('/'), `bad href: ${h}`).toBe(true);
      expect(h!.startsWith('//'), `protocol-relative href: ${h}`).toBe(false);
      expect(/^javascript:/i.test(h!), `javascript href: ${h}`).toBe(false);
    });
    // And it is not smuggled into the DOM another way.
    expect(await page.locator('#npScroll').innerHTML()).not.toContain('javascript:');
  });

  // Read-state must be PERSISTED — a local-only clear returns on reload.
  test('Q5 — mark-all-read PATCHes each unread row and zeros the badge', async ({ page }) => {
    await stubList(page, { unreadCount: 2, notifications: FIXTURE });
    const patched: string[] = [];
    await page.route('**/api/notifications/*/read', async (route: any) => {
      patched.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(400);

    await page.locator('#npMark').click();
    await page.waitForTimeout(500);

    console.log(`PATCHed ${patched.length}:`, patched.map(u => u.split('/').slice(-2)[0]));
    expect(patched.length, 'read-state was cleared locally without persisting').toBe(2);
    // The already-read fixture must not be re-PATCHed.
    expect(patched.some(u => u.includes('33333333'))).toBe(false);
    expect(await page.locator('#npScroll .np-item.unread').count()).toBe(0);
    await expect(page.locator('#bellBadge')).toBeHidden();
  });

  test('Q5 — a single row click persists its own read state', async ({ page }) => {
    await stubList(page, { unreadCount: 2, notifications: FIXTURE });
    const patched: string[] = [];
    await page.route('**/api/notifications/*/read', async (route: any) => {
      patched.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#bellBtn').click();
    await page.waitForTimeout(400);

    // Click the hostile (non-link) row so no navigation races the assertion.
    await page.locator('#npScroll .np-item').nth(1).click();
    await page.waitForTimeout(400);
    expect(patched.length).toBe(1);
    expect(patched[0]).toContain('22222222');
  });

});
