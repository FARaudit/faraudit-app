import type { NextConfig } from "next";

// ━━ Content Security Policy ━━
// Tailwind v4 generates dynamic styles at runtime — 'unsafe-inline' style is required.
// Next.js hydration ships inline scripts; without nonces we must allow 'unsafe-inline' script.
// Anthropic + SAM.gov are called server-side only — never in connect-src.
// Dev-only: React Refresh + Next.js Fast Refresh use eval() — gated to NODE_ENV=development
// so production CSP stays strict.
const isDev = process.env.NODE_ENV === "development";
const scriptSrc = `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://va.vercel-scripts.com https://vercel.live`;
const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com https://vercel.live",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests"
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Content-Security-Policy", value: csp }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF route (/api/audit/[id]/pdf) launches headless Chromium via
  // puppeteer-core + @sparticuz/chromium. The latter ships a brotli-
  // compressed Chromium binary that's extracted at runtime — Next.js's
  // bundler can't trace those non-JS assets, so it must leave both
  // packages alone and ship them verbatim in node_modules.
  //
  // mammoth (.docx) + exceljs (.xlsx) drive nonpdf-extractor's require()-based
  // text extraction (sam-attachments normalizeToPdf). They pull optional/native
  // and lazy-required deps the Next bundler rewrites incorrectly on the
  // serverless target — extraction then silently no-ops in prod while working
  // locally (the 2026-07-06 preview divergence: two .docx synopsis forms read
  // has_text=false on preview but extracted fine on the box). Shipping them
  // verbatim from node_modules makes require() resolve at runtime, same as local.
  //
  // pdf-parse — SAME defect class, found live 2026-07-29 on GET /api/audit/resolve:
  // webpack bundles pdf-parse's pdfjs-dist into the route chunk, where pdfjs's
  // dynamic require of @napi-rs/canvas dies ("Cannot load @napi-rs/canvas
  // package") → no DOMMatrix polyfill → extractText throws "DOMMatrix is not
  // defined" on EVERY serverless PDF parse (the door's content read + /api/audit's
  // sync-path has_text census both silently degrade to their honest fallbacks).
  // External = plain runtime require from node_modules, identical to local + the
  // Railway worker (where the same commit extracts fine).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mammoth", "exceljs", "pdf-parse"],
  // pdfjs loads @napi-rs/canvas AND its own pdf.worker.mjs via dynamic
  // require/import the file tracer misses — a pruned-file-set probe (2026-07-29)
  // proved the nft trace ships index.cjs but NOT pdf.worker.mjs ("Setting up
  // fake worker failed") and can miss the native binary. Either miss silently
  // recreates the serverless extraction failure. Force-include both packages
  // whole for the two routes that parse PDFs serverless (the canvas glob also
  // matches the platform dirs, e.g. @napi-rs/canvas-linux-x64-gnu on Vercel;
  // harmless where a platform dir is absent).
  outputFileTracingIncludes: {
    "/api/audit/resolve": ["./node_modules/pdf-parse/**/*", "./node_modules/@napi-rs/canvas*/**/*"],
    "/api/audit": ["./node_modules/pdf-parse/**/*", "./node_modules/@napi-rs/canvas*/**/*"]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      },
      // ━━ CACHE STRATEGY (CEO 2026-06-03) ━━
      // Symptom: deploys took ~17 min to surface in normal browsers because
      // un-hashed /public/* assets (cc-app.js, run-audit.html, *-live.js)
      // were being served from the Vercel edge with age=1024s — the CDN
      // applied its own internal TTL despite Next's default
      // `Cache-Control: public, max-age=0, must-revalidate`. Browsers also
      // honored that and kept the cached file across deploys.
      //
      // Fix: explicit `s-maxage=0` defeats the CDN cache, and
      // `must-revalidate` forces browsers to send conditional requests
      // (ETag-based 304s when nothing changed — cheap revalidation, no
      // body re-fetch). HTML page route handlers now use `no-store`
      // directly (see src/app/*/route.ts).
      //
      // Latter rule wins per Next.js header-merge semantics: the
      // /_next/static override below restores long-cache immutability
      // for content-hashed assets.
      //
      // Route handlers that set Cache-Control on their Response (e.g.
      // /audit, /command-center) override this catch-all explicitly.
      //
      // Long-term: hash /public/*.js filenames at build time so they can
      // use immutable caching too. Today this is fine — every page load
      // makes one cheap 304 per script.
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate, s-maxage=0" }
        ]
      },
      // Override: Next.js content-hashed assets — safe to cache forever.
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  },
  async redirects() {
    return [
      { source: "/login", destination: "/sign-in", permanent: true },
      { source: "/login/:path*", destination: "/sign-in", permanent: true },
      // /signin.html was a design placeholder that accepted ANY credentials, printed "Identity verified."
      // and bounced the visitor to /home — where middleware sent them straight back to /sign-in, because
      // nothing had authenticated. It was the "Sign In" link on the landing page. The file is deleted;
      // this catches bookmarks and any old link. Redirects are checked before /public, so it holds even if
      // a file by that name ever reappears. TEMPORARY (307) on purpose — a 308 would cache in browsers and
      // is exactly the trap documented in the headers() block above.
      { source: "/signin.html", destination: "/sign-in", permanent: false },
      // /sign-in.html was the other half of the same problem: a served design mock of the sign-in page whose
      // form carried onsubmit="return false". Nothing linked to it, but it answered 200 in production, so a
      // visitor who found it typed a password into a control that did nothing at all.
      { source: "/sign-in.html", destination: "/sign-in", permanent: false },
      // /alerts has no route under src/app — keep redirecting to /home so the
      // path doesn't 404. Re-add to a route folder + delete this when ready.
      { source: "/alerts", destination: "/home", permanent: true }
      // CEO 2026-05-25 — Removed permanent redirects for /audit, /dashboard,
      // /upstream-intel, /prospects. These all have real route handlers /
      // page.tsx under src/app, and the redirects were masking them (sidebar
      // links from the static command-center-design.html were funneling to
      // /home instead of their real destinations). /settings was already a
      // real route.
    ];
  }
};

export default nextConfig;
