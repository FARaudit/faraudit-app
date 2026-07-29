// AUDIT_DOOR_PRIMARY_READ live verification — PR #320 arc (2026-07-29).
//
// Proves the DOOR'S PRIMARY-DOC CONTENT READ works on the DEPLOYED serverless
// surface (the DOMMatrix bundling fix), not on a workstation. Method mirrors
// _f2live-served-verify.ts: sign in as the demo customer through the real
// front door on the flagged PREVIEW deployment, then call the resolve API with
// the session and read the response the customer's front door would consume.
//
// ATTRIBUTION GUARD (placebo trap): coverageBasis === "content" can ALSO come
// from the L4 notice-body read, which never touches pdf-parse. The response
// alone therefore cannot prove the primary read ran — the caller must pair
// this with the deployment's function logs showing `[PDF-DIAG] extractText OK`
// on /api/audit/resolve (and no DOMMatrix / [DOOR-DIAG] failure line).
//
// Credentials are read from .env.local and never printed (Rule 32).
// usage: tsx _door-read-live-verify.ts <preview-origin> <share-url|-> <ref> [ref2…]
import { chromium } from "playwright";
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/josearodriguezjr./faraudit-app/.env.local", quiet: true });

const [ORIGIN, SHARE_URL, ...REFS] = process.argv.slice(2);
if (!ORIGIN || !SHARE_URL || REFS.length === 0) {
  console.error("usage: _door-read-live-verify.ts <preview-origin> <share-url|-> <ref> [ref2…]");
  process.exit(1);
}
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("DEMO_EMAIL / DEMO_PASSWORD missing from .env.local"); process.exit(1); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. Clear Vercel deployment protection via the share link (sets _vercel_jwt).
  if (SHARE_URL !== "-") {
    await page.goto(SHARE_URL, { waitUntil: "domcontentloaded" });
    console.log(`protection cleared → landed: ${page.url().split("?")[0]}`);
  }

  // 2. Real front-door sign-in (the /sign-in route, NOT the placeholder page).
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForTimeout(8000);
  const authCookies = (await ctx.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name));
  console.log(`auth cookies after sign-in: ${authCookies.length}`);
  if (authCookies.length === 0) { console.error("FAIL — no supabase session; nothing verified."); await browser.close(); process.exit(1); }

  // 3. Call the resolve door with the session, per ref. The door needs up to
  //    ~30s (maxDuration) — give the request 45s.
  let sawContent = false;
  for (const ref of REFS) {
    const t0 = Date.now();
    const resp = await page.request.get(`${ORIGIN}/api/audit/resolve?ref=${encodeURIComponent(ref)}`, {
      headers: { accept: "application/json" }, timeout: 45000,
    });
    const ms = Date.now() - t0;
    let body: Record<string, unknown> = {};
    try { body = (await resp.json()) as Record<string, unknown>; } catch { /* non-JSON → reported below */ }
    console.log(`\nref=${ref} → HTTP ${resp.status()} in ${ms}ms`);
    if (!body.ok) { console.log(`  not resolved: reason=${String(body.reason ?? "(non-JSON body)")}`); continue; }
    console.log(`  sol=${body.solNumber} files=${body.filesTotal} complete=${body.complete}`);
    console.log(`  coverageBasis=${body.coverageBasis}`);
    console.log(`  coverageStates=${JSON.stringify(body.coverageStates)}`);
    console.log(`  absentCore=${JSON.stringify(body.absentCore)} unverifiedCore=${JSON.stringify(body.unverifiedCore)}`);
    if (body.coverageBasis === "content") sawContent = true;
  }
  await browser.close();

  console.log(`\nRESULT: ${sawContent
    ? "coverageBasis=content observed — NOW CONFIRM [PDF-DIAG] extractText OK in this deployment's function logs (response alone cannot attribute content to the PRIMARY read vs the notice body)"
    : "FAIL — no content-basis coverage observed on any ref"}`);
  process.exit(sawContent ? 0 : 1);
})();
