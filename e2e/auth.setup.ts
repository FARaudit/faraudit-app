import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/storageState.json');

setup('authenticate', async ({ page }) => {
  await page.goto('https://faraudit.com/sign-in');
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"], input[name="email"], #email', process.env.DEMO_EMAIL!);
  await page.fill('input[type="password"], input[name="password"], #password', process.env.DEMO_PASSWORD!);
  await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');

  await page.waitForURL(/\/(command-center|today|dashboard|home)/, { timeout: 15000 });
  await expect(page).not.toHaveURL(/sign-in/);

  await page.context().storageState({ path: authFile });
  console.log('Auth session cached to', authFile);
});
