import type { NextConfig } from "next";
import path from "path";

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
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mammoth", "exceljs"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      },
      // CEO 2026-05-25 — transitional Clear-Site-Data on /home to flush the
      // browser-cached 308 permanent redirects (the prior next.config used
      // permanent redirects from /audit, /dashboard, /upstream-intel,
      // /prospects → /home; removed but cached at browser level). Browser
      // arrives at /home via the cached redirect, gets the header, clears
      // its HTTP cache including the stale 308. Remove this entry once
      // production user agents have rolled over (e.g. one week from now).
      {
        source: "/home",
        headers: [
          { key: "Clear-Site-Data", value: '"cache"' }
        ]
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
  },
  // ━━ PIN `sharp` TO THE ROOT COPY — makes the LOCAL build gate match Vercel ━━
  // `npm run build` failed on a clean main locally while Vercel built green, so there was no local gate
  // that matched the deploy gate and a build-breaking change was only catchable after push.
  //
  // Cause: the Railway worker has its own install at agents/audit-ai/node_modules (gitignored, so it exists
  // on a developer box and NEVER on Vercel). The app reaches the worker's PDF helper —
  // src/app/api/audit/route.ts → src/lib/sam-pdf.ts → agents/audit-ai/pdf.ts — and from there Node resolves
  // `sharp` to the NESTED copy. Next's automatic opt-out for `sharp` (it is on the built-in
  // serverExternalPackages list, which our array concats onto rather than replaces) matches the root
  // node_modules copy, so the nested one gets BUNDLED instead — and a bundled sharp cannot load its native
  // binary. Page-data collection then died with "Could not load the sharp module using the darwin-arm64
  // runtime" on every route that reaches pdf.ts. Proven by moving the nested tree aside: build went green,
  // restored: build failed again.
  //
  // On Vercel this alias is a NO-OP — the nested tree is not installed there, so `sharp` already resolves to
  // exactly this path. It only removes the local divergence. Deleting the worker's install would also fix
  // the build, but the worker legitimately owns it (and `ws` is worker-only, absent at root).
  webpack: (config: { resolve: { alias: Record<string, string> } }) => {
    config.resolve.alias = { ...config.resolve.alias, sharp: path.resolve(__dirname, "node_modules/sharp") };
    return config;
  }
};

export default nextConfig;
