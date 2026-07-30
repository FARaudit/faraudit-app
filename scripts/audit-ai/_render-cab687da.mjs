import { chromium } from "playwright";
import * as fs from "fs";
const cookies = JSON.parse(fs.readFileSync("/tmp/_cab_cookies.json", "utf8"));
const ID = "cab687da-11a4-4b6e-8820-20516f293a1c";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 2400 } });
await ctx.addCookies(cookies);
const p = await ctx.newPage();
const resp = await p.goto(`https://www.faraudit.com/audit/${ID}`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
const finalUrl = p.url();
const status = resp?.status();
const bodyText = await p.evaluate(() => document.body.innerText);
const title = await p.title();
await p.screenshot({ path: "/tmp/_cab_render.png", fullPage: true });
// structural probes
const has = (re) => re.test(bodyText);
const probe = {
  status, finalUrl, title,
  redirectedToSignIn: /\/sign-in/.test(finalUrl),
  textLen: bodyText.length,
  mentionsHumanReview: has(/human review|needs human|not.*trustworthy|could not.*decide|verification/i),
  mentionsFindings: has(/finding|requirement|clause|FAR|52\.|insurance|subcontract|wage|SCA/i),
  mentionsCaveat: has(/caveat|caution|watch|note/i),
  emptyShellMarker: has(/upload (the |your )?pdf|drag.*drop|no audit|get started/i),
  headings: await p.$$eval("h1,h2,h3", els => els.slice(0,25).map(e => e.textContent.trim()).filter(Boolean)),
};
fs.writeFileSync("/tmp/_cab_render.txt", bodyText);
console.log(JSON.stringify(probe, null, 1));
console.log("\n=== first 1200 chars of visible text ===\n" + bodyText.slice(0, 1200));
await b.close();
