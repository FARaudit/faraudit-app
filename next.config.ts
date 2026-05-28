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
  }
};

export default nextConfig;
