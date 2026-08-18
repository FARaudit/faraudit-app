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
  // ━━ Defense News photographs ━━
  // The image optimizer is a fetching proxy, so this list is a security
  // boundary before it is a performance one: hostname:"**" would let anyone
  // route any URL on the internet through our origin. Only the image hosts the
  // four wired feeds actually publish from are named, each verified against the
  // live feed on 2026-08-11. A host that is not here still renders — the page
  // falls back to the publisher's own URL — it simply is not resized by us.
  images: {
    remotePatterns: [
      // Defense News (Arc Publishing) — media:content on every item, originals
      // run to 5554px, which is the reason this block exists.
      { protocol: "https", hostname: "cloudfront-us-east-1.images.arcpublishing.com" },
      { protocol: "https", hostname: "*.arc-cdn.net" },
      // DoD News — <enclosure> on every item. Note: media.defense.gov answers
      // 403 to server-side fetches, so the optimizer will fail on it and the
      // raw-URL fallback is what actually paints. Listed anyway: this block
      // states which hosts are permitted, not which ones succeed.
      { protocol: "https", hostname: "media.defense.gov" },
      // FedScoop — no feed carrier; resolved from the article's og:image.
      { protocol: "https", hostname: "fedscoop.com" },
      { protocol: "https", hostname: "*.fedscoop.com" }
    ],
    // The widths this page actually asks for (side thumb · card · lead hero).
    // imageSizes holds the values below the smallest deviceSize; a width absent
    // from both is rejected outright by the optimizer.
    imageSizes: [256],
    deviceSizes: [640, 1080],
    // Next 16 changed images.qualities from "anything" to [75], and a request
    // outside the list is a 400 INVALID_IMAGE_OPTIMIZE_REQUEST — not a soft
    // downgrade. 75 is the only quality this page asks for.
    qualities: [75],
    minimumCacheTTL: 86400
  },
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
  // pdf-parse — SAME defect class, found INDEPENDENTLY twice on 2026-07-29 (this branch: the
  // demo refetch, 422-char source, verdict INCOMPLETE; main #322: GET /api/audit/resolve):
  // webpack bundles pdf-parse's pdfjs-dist into the route chunk, where pdfjs's dynamic
  // require of @napi-rs/canvas dies ("Cannot load @napi-rs/canvas package") → no DOMMatrix →
  // extractText throws on EVERY serverless PDF parse, while the Railway worker (plain node,
  // same commit) extracts fine. External = plain runtime require from node_modules.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mammoth", "exceljs", "pdf-parse", "@napi-rs/canvas"],
  // pdfjs loads @napi-rs/canvas AND its own pdf.worker.mjs via dynamic require/import the
  // file tracer misses — the round-2 preview proof of this branch ("Setting up fake worker
  // failed: Cannot find module '…/pdf-parse/dist/…/pdf.worker.mjs'") and main #322's
  // pruned-file-set probe found the same two misses independently. Either miss silently
  // recreates the extraction failure, so force-include BOTH packages whole. MERGE NOTE
  // (2026-07-29, this branch × main #322): main scoped the includes to /api/audit/resolve +
  // /api/audit, which leaves /api/audit/[id]/refetch and /api/internal/watcher-tick — both of
  // which parse PDFs through the same extractor — with pruned traces (the refetch route is
  // where this branch's live proof ran). Union: one /api/** glob covering every API function;
  // the @napi-rs/** glob also matches the platform dirs (e.g. canvas-linux-x64-gnu).
  outputFileTracingIncludes: {
    // @fontsource woff files are read by capability-statement-fonts.ts at render time from a
    // path built with process.cwd(). The tracer cannot see a runtime-built path, so without
    // this the capability statement deploys and quietly renders in a substituted face — the
    // exact drift the Manrope ruling exists to prevent. Change this and that module together.
    "/api/**": ["./node_modules/pdf-parse/**/*", "./node_modules/@napi-rs/**",
      "./node_modules/@fontsource/manrope/files/*.woff",
      "./node_modules/@fontsource/jetbrains-mono/files/*.woff"],
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
      // Override: PER-USER API RESPONSES ARE NOT `public`.
      //
      // The catch-all above exists for un-hashed assets in /public, and `public` is
      // right for those — they are the same bytes for everyone. It also landed on
      // /api/*, which is NOT: /api/audits, /api/profile and /api/preferences carry one
      // account's data. `public` invites any shared cache to store that response and
      // hand it to the next requester; the only reason it has not is `s-maxage=0`
      // holding the CDN off. That makes cross-user exposure one header edit away, and
      // the header would look harmless in the diff that made it.
      //
      // `private` states the fact instead of relying on a second directive to contain
      // it: browser cache only, never a shared one. Freshness is UNCHANGED —
      // max-age=0 + must-revalidate still forces a conditional request before any
      // reuse — so this is a labelling fix, not a speed change. Making tab switches
      // fast needs a different decision (see below) and is the CEO's to make.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, max-age=0, must-revalidate" }
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
      // ━━ OPPORTUNITIES → NOTICES, AUDIT → AUDITS (CEO 2026-08-08) ━━
      // The pages moved to /notices and /audits. These keep every URL already in the
      // world working: bookmarks, the /audit?noticeId=<ref> deep link out of the feed,
      // and — the one that cannot be re-sent — the audit permalinks in mail already
      // delivered. Query values are carried to the destination by Next, so the deep
      // link arrives with its noticeId intact.
      //
      // 308, deliberately. These paths are retired for good, and a browser caching the
      // hop is the desired outcome rather than the trap the /signin.html note below
      // describes — that one is 307 because the destination may yet change.
      //
      // A note from 2026-05-25 in this file records /audit redirects being REMOVED
      // because they masked a real route handler: redirects are checked before the
      // filesystem. That is exactly why these are correct now and were wrong then —
      // there is no longer a route at either old path for them to mask.
      { source: "/opportunities", destination: "/notices", permanent: true },
      { source: "/audit", destination: "/audits", permanent: true },
      // Covers /audit/<id> (the shared report permalink) and /audit/report alike.
      { source: "/audit/:path*", destination: "/audits/:path*", permanent: true },
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
