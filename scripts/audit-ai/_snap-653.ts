import { chromium } from "playwright";
import * as fs from "fs";

const AUDIT = "653570ea-ac6a-43c1-a9e6-c733bfa3c3d1";
const BASE = "https://www.faraudit.com";
const OUT = "ceo/report-exhibits";

(async () => {
  const cookies = JSON.parse(fs.readFileSync("/tmp/_cab_cookies.json", "utf8"));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const url = `${BASE}/audit/${AUDIT}`;
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  console.log(`GET ${url} → ${resp?.status()}`);
  console.log(`final URL: ${page.url()}`);
  // Give any client hydration / polls a moment; report re-renders live from the row.
  await page.waitForTimeout(2500);
  const title = await page.title();
  console.log(`title: ${title}`);
  // Pull the verdict pole + a few key strings for a text-truth check.
  const bodyText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/653-BWC-domtext.txt`, bodyText);
  const verdictHit = /BID WITH CAUTION|BID_WITH_CAUTION|Bid with caution/i.test(bodyText);
  const nhrHit = /NEEDS HUMAN REVIEW|NEEDS_HUMAN_REVIEW/i.test(bodyText);
  const failHit = /ran out of time|processing failed|hit an unexpected error/i.test(bodyText);
  console.log(`verdict=BWC? ${verdictHit} · NHR? ${nhrHit} · failed-page? ${failHit} · domtext ${bodyText.length} chars`);
  await page.screenshot({ path: `${OUT}/653-BWC-fullpage.png`, fullPage: true });
  // Also save the raw served HTML for archival.
  const html = await page.content();
  fs.writeFileSync(`${OUT}/653-BWC.html`, html);
  console.log(`saved: ${OUT}/653-BWC-fullpage.png · 653-BWC.html · 653-BWC-domtext.txt`);
  await browser.close();
})().catch((e) => { console.error("SNAP ERR", e.message); process.exit(1); });
