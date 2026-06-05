// PDF Service — Railway-hosted HTML→PDF renderer.
//
// Why this exists: Next 16 / Vercel's bundler-plus-file-tracer combo could
// not reliably ship @sparticuz/chromium's brotli-compressed binary onto the
// lambda for /api/audit/[id]/pdf. Both serverExternalPackages and the
// --webpack build-flag opt-out left the bin/ data dir missing at runtime.
// We split chromium off the lambda entirely: this Railway worker keeps the
// binary on a persistent container filesystem, and the Vercel route is now
// a thin proxy that POSTs rendered HTML and streams back PDF bytes.
//
// POST /pdf
//   Auth:   Authorization: Bearer ${RAILWAY_PDF_SECRET}
//   Body:   { auditId: string, html: string }
//   Returns: PDF bytes · Content-Type: application/pdf
//
// GET /healthz
//   Returns: 200 with { ok, chromium, browserWarm }
//
// Browser lifecycle: keep one puppeteer instance warm between requests; on
// crash we relaunch lazily. Chromium cold-start is the dominant cost so a
// reused browser is the single biggest perf win.

import express from "express";
import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const PORT = Number(process.env.PORT) || 3000;
const SECRET = process.env.RAILWAY_PDF_SECRET || "";
// Soft cap on the HTML payload. The audit-report template is ~140KB; real
// runs land ~150-200KB after data interpolation. 4MB is comfortable headroom
// without exposing the service to OOM via giant payloads.
const MAX_HTML_BYTES = 4 * 1024 * 1024;
// Hard cap on a single PDF render. Chromium cold start + setContent + pdf()
// for the audit-report fits in 25s warm; cold starts add ~5-8s. 90s is the
// outer Railway boundary we don't want to approach.
const RENDER_TIMEOUT_MS = 60_000;

if (!SECRET) {
  console.error("[pdf-service] FATAL: RAILWAY_PDF_SECRET not set");
  process.exit(1);
}

const app = express();
// Raise the body limit; default 100kb truncates audit HTML silently.
app.use(express.json({ limit: `${MAX_HTML_BYTES}b` }));

// ── browser lifecycle ───────────────────────────────────────────────────────

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      // puppeteer-core v25: `browser.connected` reflects active CDP transport.
      if ((b as unknown as { connected?: boolean }).connected !== false) return b;
    } catch {
      // fall through to relaunch
    }
  }
  browserPromise = puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true
  });
  const b = await browserPromise;
  b.on("disconnected", () => {
    browserPromise = null;
  });
  return b;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function normalizeBearer(s: string | null | undefined): string {
  if (!s) return "";
  let v = s.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
  return v;
}

// ── routes ──────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "pdf-service" });
});

app.get("/healthz", async (_req, res) => {
  res.json({
    ok: true,
    chromium: chromium.args ? "available" : "missing",
    browserWarm: !!browserPromise
  });
});

app.post("/pdf", async (req, res) => {
  // Auth — Bearer must match RAILWAY_PDF_SECRET.
  const auth = req.header("authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const bearer = normalizeBearer(raw);
  const expected = normalizeBearer(SECRET);
  if (!bearer || !timingSafeEqual(bearer, expected)) {
    return res.status(401).json({
      error: "unauthorized",
      bearerRecvLen: bearer.length,
      acceptedLen: expected.length
    });
  }

  const { auditId, html } = (req.body ?? {}) as { auditId?: string; html?: string };
  if (typeof html !== "string" || html.length === 0) {
    return res.status(400).json({ error: "html (string) required in body" });
  }
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return res.status(413).json({ error: `html exceeds ${MAX_HTML_BYTES} bytes` });
  }

  const t0 = Date.now();
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pdf-service] browser launch failed: ${msg}`);
    return res.status(500).json({ error: "chromium launch failed", detail: msg.slice(0, 200) });
  }

  let pdfBytes: Buffer | null = null;
  const page = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    // The render must finish inside RENDER_TIMEOUT_MS — race the work.
    const renderWork = (async () => {
      await page.setContent(html, { waitUntil: "load" });
      const out = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        format: "Letter",
        margin: { top: "13mm", right: "13mm", bottom: "13mm", left: "13mm" }
      });
      return out as Buffer;
    })();
    pdfBytes = await Promise.race<Buffer>([
      renderWork,
      new Promise<Buffer>((_, reject) =>
        setTimeout(() => reject(new Error(`PDF render exceeded ${RENDER_TIMEOUT_MS}ms`)), RENDER_TIMEOUT_MS)
      )
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pdf-service] render failed (auditId=${auditId ?? "—"}): ${msg}`);
    try { await page.close(); } catch {}
    return res.status(500).json({ error: "render failed", detail: msg.slice(0, 200) });
  }
  try { await page.close(); } catch {}

  const ms = Date.now() - t0;
  console.log(`[pdf-service] rendered auditId=${auditId ?? "—"} bytes=${pdfBytes.byteLength} in ${ms}ms`);

  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(pdfBytes.byteLength));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Pdf-Service-Render-Ms", String(ms));
  res.end(pdfBytes);
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

const server = app.listen(PORT, () => {
  console.log(`[pdf-service] listening on :${PORT}`);
  // Warm the browser eagerly so the first user request doesn't pay the
  // cold-start tax on top of the inherent render cost.
  getBrowser()
    .then(() => console.log("[pdf-service] browser warm"))
    .catch(err => console.error(`[pdf-service] warm-up failed: ${err instanceof Error ? err.message : err}`));
});

// Graceful shutdown — close the browser so the container's last log line
// isn't a zombie chromium process.
function shutdown(signal: string) {
  console.log(`[pdf-service] ${signal} received — shutting down`);
  server.close(async () => {
    if (browserPromise) {
      try { (await browserPromise).close(); } catch {}
    }
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
