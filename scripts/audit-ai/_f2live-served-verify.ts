// F2-LIVE **SERVED** VERIFICATION — ARC #747, task ARC747-F2LIVE-VERIFY.
//
// _f2live-verify.ts proved the fix against the file ON DISK. That is a proof about the repo, not about what
// faraudit.com hands a signed-in customer. run-audit.html sits behind the auth wall (307 to /sign-in), so an
// anonymous curl can never see it — which is exactly how a merged-but-not-serving fix stays invisible.
//
// METHOD: sign in as the demo customer through the real front door, load the served /run-audit.html, and
// replay the SERVED page's own verdictOf() — read out of the live DOM, never reimplemented — over the real
// audits rows. Same four gates as the disk verifier, so the two are directly comparable.
//
// Credentials are read from .env.local and never printed (Rule 32).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const ORIGIN = process.env.F2_ORIGIN ?? "https://faraudit.com";
const ROWS = process.argv[2];
if (!ROWS) { console.error("usage: _f2live-served-verify.ts <rows.json>"); process.exit(1); }
const rows = JSON.parse(readFileSync(ROWS, "utf8")) as Record<string, unknown>[];

const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("DEMO_EMAIL / DEMO_PASSWORD missing from .env.local"); process.exit(1); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on("console", (m) => { if (m.type() === "error") console.log(`  [page error] ${m.text().slice(0, 200)}`); });
  // NOTE: /signin.html is a placeholder that accepts ANY credentials and authenticates nothing — the real
  // front door is the /sign-in route. Signing in through the placeholder verifies nothing.
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: "networkidle" });
  await page.fill("input[name=email]", EMAIL);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForTimeout(8000);
  const err = await page.locator(".auth-error").textContent().catch(() => null);
  if (err && err.trim()) console.log(`  sign-in error surfaced: ${err.trim().slice(0, 200)}`);
  const authCookies = (await ctx.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name));
  console.log(`  auth cookies after sign-in: ${authCookies.length} (${authCookies.map((c) => c.domain).join(", ")})`);

  const resp = await page.goto(`${ORIGIN}/run-audit.html`, { waitUntil: "domcontentloaded" });
  const status = resp?.status() ?? 0;
  const url = page.url();
  console.log(`served status: ${status}   landed: ${url}`);
  if (!/\/run-audit\.html/.test(url)) {
    console.error("FAIL — did not land on run-audit.html (auth wall not cleared); nothing was verified.");
    await browser.close(); process.exit(1);
  }

  // Pull the verdict logic OUT OF THE SERVED PAGE. If the deploy is stale, this block is the old one and the
  // gates below fail — which is the entire point of running it here instead of against the working tree.
  const servedBlock = await page.evaluate(() => {
    const src = Array.from(document.scripts).map((s) => s.textContent ?? "").join("\n");
    const a = src.indexOf("var POLE_ROW = {");
    const b = src.indexOf("function insightOf(", a);
    return a >= 0 && b >= 0 ? src.slice(a, b) : null;
  });
  if (!servedBlock) {
    console.error("FAIL — served page has no POLE_ROW/verdictOf block: the six-pole fix is NOT serving.");
    await browser.close(); process.exit(1);
  }
  const localBlock = (() => {
    const s = readFileSync("public/run-audit.html", "utf8");
    const a = s.indexOf("var POLE_ROW = {"), b = s.indexOf("function insightOf(", a);
    return s.slice(a, b);
  })();
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  console.log(`served verdict block: ${servedBlock.length} bytes · identical to working tree: ${norm(servedBlock) === norm(localBlock)}`);

  // Evaluate the SERVED function over the real rows, inside the page.
  const labels = await page.evaluate(
    ({ block, data }) => {
      const verdictOf = new Function(`${block}; return verdictOf;`)() as (a: Record<string, unknown>) => { cls: string; label: string };
      return (data as Record<string, unknown>[]).map((r) => verdictOf(r));
    },
    { block: servedBlock, data: rows },
  );
  await browser.close();

  const COMMITTAL = new Set(["is-proceed", "is-caution", "is-nobid"]);
  const NO_VERDICT_POLES = new Set(["NEEDS_HUMAN_REVIEW", "INCOMPLETE"]);
  const WORD: Record<string, string> = { BID: "BID", BID_WITH_CAUTION: "BID · CAUTION", NO_BID: "NO-BID",
    INELIGIBLE: "INELIGIBLE", NEEDS_HUMAN_REVIEW: "NEEDS REVIEW", INCOMPLETE: "INCOMPLETE" };

  const tally = new Map<string, number>();
  for (const v of labels) tally.set(v.label, (tally.get(v.label) ?? 0) + 1);
  console.log(`\nrows replayed through the SERVED logic: ${rows.length}`);
  for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${k}`);

  const idx = rows.map((r, i) => ({ r, v: labels[i] }));
  const g1 = idx.filter(({ r, v }) => NO_VERDICT_POLES.has(String(r.v3_verdict ?? "")) && COMMITTAL.has(v.cls));
  const g2 = idx.filter(({ r, v }) => { const p = String(r.v3_verdict ?? ""); return WORD[p] && v.label !== WORD[p]; });
  const g3 = idx.filter(({ r, v }) => !r.v3_verdict && !r.exec_verdict && !r.recommendation && v.label === "CAUTION");
  const g4 = idx.filter(({ r, v }) => ["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "INELIGIBLE"].includes(String(r.v3_verdict ?? "")) && v.label === "CAUTION");

  console.log("\n── GATES (against the SERVED surface) ──");
  console.log(`  G1 no-verdict poles in a committal register ......... ${g1.length === 0 ? "PASS (0)" : "FAIL (" + g1.length + ")"}`);
  console.log(`  G2 authoritative pole renders its own word .......... ${g2.length === 0 ? "PASS (0 mismatches)" : "FAIL (" + g2.length + ")"}`);
  console.log(`  G3 no residual guess-CAUTION on empty rows .......... ${g3.length === 0 ? "PASS (0)" : "FAIL (" + g3.length + ")"}`);
  console.log(`  G4 previously-misrepresented rows now honest ........ ${g4.length === 0 ? "PASS (0)" : "FAIL (" + g4.length + " remain)"}`);
  for (const { r, v } of g2.slice(0, 5)) console.log(`     G2 mismatch: ${r.solicitation_number} pole=${r.v3_verdict} rendered=${v.label}`);

  const pass = !g1.length && !g2.length && !g3.length && !g4.length;
  console.log(`\nRESULT (SERVED): ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
})();
