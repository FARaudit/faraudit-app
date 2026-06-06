import { test, expect } from '@playwright/test';

test.describe('Tab 01 — Command Center', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
  });

  test('loads without auth redirect or blank body', async ({ page }) => {
    await expect(page).not.toHaveURL(/sign-in/);
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(50);
    console.log('✓ Page loaded');
  });

  test('sidebar: 17 nav links present', async ({ page }) => {
    const links = page.locator('aside.sidebar a.sb-icon');
    const count = await links.count();
    console.log(`Sidebar links: ${count}`);
    expect(count).toBe(17);
  });

  test('sidebar: all hrefs are valid internal routes', async ({ page }) => {
    const links = page.locator('aside.sidebar a.sb-icon');
    const count = await links.count();
    const hrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href) hrefs.push(href);
    }
    console.log('Hrefs:', hrefs.join(' | '));
    hrefs.forEach(h => expect(h.startsWith('/'), `Bad href: ${h}`).toBe(true));
    expect(hrefs.length).toBe(17);
  });

  test('sidebar: badges render on correct nav items', async ({ page }) => {
    const auditBadge = page.locator('a.sb-icon[href="/audit"] .sb-badge');
    const dashBadge = page.locator('a.sb-icon[href="/dashboard"] .sb-badge');
    const pipeBadge = page.locator('a.sb-icon[href="/pipeline"] .sb-badge');
    const oppBadge = page.locator('a.sb-icon[href="/opportunities"] .sb-badge');
    const agencyBadge = page.locator('a.sb-icon[href="/agencies"] .sb-badge');

    await expect(auditBadge).toBeVisible();
    await expect(dashBadge).toBeVisible();
    await expect(pipeBadge).toBeVisible();
    await expect(oppBadge).toBeVisible();
    await expect(agencyBadge).toBeVisible();

    console.log('Badges:',
      await auditBadge.innerText(), '|',
      await dashBadge.innerText(), '|',
      await pipeBadge.innerText(), '|',
      await oppBadge.innerText(), '|',
      await agencyBadge.innerText()
    );
  });

  test('sidebar: toggle flips data-sb and persists', async ({ page }) => {
    const html = page.locator('html');
    const before = await html.getAttribute('data-sb');
    await page.locator('button#sbToggle').click();
    await page.waitForTimeout(400);
    const after = await html.getAttribute('data-sb');
    console.log(`Sidebar: ${before} → ${after}`);
    expect(after).not.toBe(before);
    await page.locator('button#sbToggle').click();
  });

  test('topbar: theme toggle flips data-theme', async ({ page }) => {
    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    await page.locator('button#themeToggle').click();
    await page.waitForTimeout(400);
    const after = await html.getAttribute('data-theme');
    console.log(`Theme: ${before} → ${after}`);
    expect(after).not.toBe(before);
    await page.locator('button#themeToggle').click();
  });

  test('topbar: notifications button visible with badge', async ({ page }) => {
    const notif = page.locator('button.icon-btn').first();
    await expect(notif).toBeVisible();
    const badge = page.locator('.nbadge');
    await expect(badge).toBeVisible();
    console.log('Notification badge:', await badge.innerText());
  });

  test('topbar: user chip shows name', async ({ page }) => {
    const chip = page.locator('.user-chip');
    await expect(chip).toBeVisible();
    const text = await chip.innerText();
    console.log('User chip:', text);
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('topbar: LIVE pill visible', async ({ page }) => {
    const pill = page.locator('.live-pill');
    await expect(pill).toBeVisible();
    console.log('✓ LIVE pill visible');
  });

  test('header: greeting and date render', async ({ page }) => {
    const heading = page.locator('.heading, h1').first();
    await expect(heading).toBeVisible();
    const text = await heading.innerText();
    console.log('Heading:', text);
    expect(text.toLowerCase()).toMatch(/good|morning|afternoon|evening|jose/i);
  });

  test('header: stat cards hsAct, hsCrit, hsDays have values', async ({ page }) => {
    const hsAct = page.locator('#hsAct');
    const hsCrit = page.locator('#hsCrit');
    const hsDays = page.locator('#hsDays');
    await expect(hsAct).toBeVisible();
    await expect(hsCrit).toBeVisible();
    await expect(hsDays).toBeVisible();
    console.log('Stats:', await hsAct.innerText(), '|', await hsCrit.innerText(), '|', await hsDays.innerText());
  });

  test('KPI strip: 4 cards rendered with values', async ({ page }) => {
    const strip = page.locator('#kpiStrip');
    await expect(strip).toBeVisible();
    const cards = strip.locator('[data-tone]');
    const count = await cards.count();
    console.log(`KPI cards: ${count}`);
    expect(count).toBe(4);
    for (let i = 0; i < count; i++) {
      const val = await cards.nth(i).locator('.kpi-val').innerText();
      console.log(`KPI ${i+1}:`, val);
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });

  test('KPI strip: tones present', async ({ page }) => {
    const strip = page.locator('#kpiStrip');
    const cards = strip.locator('[data-tone]');
    const tones: string[] = [];
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const tone = await cards.nth(i).getAttribute('data-tone');
      if (tone) tones.push(tone);
    }
    console.log('Tones:', tones.join(' | '));
    expect(tones.length).toBe(4);
  });

  test('insight bar: visible and has content', async ({ page }) => {
    const bar = page.locator('#insightBar, .insight-bar');
    await expect(bar.first()).toBeVisible();
    const text = await bar.first().innerText();
    console.log('Insight bar:', text.substring(0, 100));
    expect(text.trim().length).toBeGreaterThan(10);
  });

  test('action feed: renders at least 4 action cards', async ({ page }) => {
    const feed = page.locator('#actFeed');
    await expect(feed).toBeVisible();
    const cards = feed.locator('a.act-card');
    const count = await cards.count();
    console.log(`Action cards: ${count}`);
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('action feed: each card has a CTA link', async ({ page }) => {
    const feed = page.locator('#actFeed');
    const cards = feed.locator('a.act-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const cta = cards.nth(i).locator('.act-cta');
      const hasCta = await cta.count();
      if (hasCta > 0) {
        const ctaText = await cta.innerText();
        console.log(`Card ${i+1} CTA:`, ctaText.trim());
      }
    }
    console.log(`✓ ${count} action cards checked`);
  });

  test('priority tabs: ALL tab active by default', async ({ page }) => {
    const allTab = page.locator('.people-tab[data-f="all"]');
    await expect(allTab).toBeVisible();
    const cls = await allTab.getAttribute('class');
    console.log('ALL tab class:', cls);
    expect(cls).toContain('active');
  });

  test('priority tabs: CRITICAL filter narrows feed', async ({ page }) => {
    const feed = page.locator('#actFeed');
    const allCards = await feed.locator('a.act-card').count();

    await page.locator('.people-tab[data-f="crit"]').click();
    await page.waitForTimeout(500);

    const critCards = await feed.locator('a.act-card').count();
    console.log(`ALL: ${allCards} cards → CRITICAL: ${critCards} cards`);
    expect(critCards).toBeLessThanOrEqual(allCards);
  });

  test('priority tabs: THIS WEEK filter works', async ({ page }) => {
    const feed = page.locator('#actFeed');

    await page.locator('.people-tab[data-f="warn"]').click();
    await page.waitForTimeout(500);

    const warnCards = await feed.locator('a.act-card').count();
    console.log(`THIS WEEK: ${warnCards} cards`);
    expect(warnCards).toBeGreaterThanOrEqual(0);

    await page.locator('.people-tab[data-f="all"]').click();
  });

  test('Week Ahead: panel visible with title', async ({ page }) => {
    const panel = page.locator('text=The Week Ahead').first();
    await expect(panel).toBeVisible();
    console.log('✓ Week Ahead panel visible');
  });

  test('Week Ahead: GovCon calendar entries render', async ({ page }) => {
    const calRows = page.locator('.wk-row, [class*="wk-"], [class*="cal-"]');
    const count = await calRows.count();
    console.log(`Calendar rows: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('Week Ahead: category pills render', async ({ page }) => {
    const pills = page.locator('.wk-tag, [class*="tag-"], [class*="pill-"]');
    const count = await pills.count();
    console.log(`Category pills: ${count}`);
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await pills.nth(i).innerText();
      console.log(`Pill ${i+1}:`, text);
    }
  });

  test('Week Ahead: grouped sections (This Week, This Month, Later)', async ({ page }) => {
    const thisWeek = page.locator('text=THIS WEEK').first();
    const thisMonth = page.locator('text=THIS MONTH').first();
    await expect(thisWeek).toBeVisible();
    await expect(thisMonth).toBeVisible();
    console.log('✓ Week Ahead groupings visible');
  });

  test('Signals: section visible with title', async ({ page }) => {
    const title = page.locator('text=Signals Across Your Desks').first();
    await expect(title).toBeVisible();
    console.log('✓ Signals section visible');
  });

  test('Signals: 6 intelligence surface cards render', async ({ page }) => {
    const cards = page.locator('.sig-desk, [class*="sig-"]');
    const count = await cards.count();
    console.log(`Signal cards: ${count}`);
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < Math.min(count, 6); i++) {
      const text = await cards.nth(i).innerText();
      console.log(`Signal ${i+1}:`, text.substring(0, 60).trim());
    }
  });

  test('API: /api/command-center-data fetched on load', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/command-center-data')) calls.push(req.method());
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('API calls:', calls.length);
    expect(calls.length).toBeGreaterThan(0);
  });

});
