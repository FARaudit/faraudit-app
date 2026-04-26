# FARaudit Security

Last updated: 2026-04-25
Owner: Jose Antonio Rodriguez Jr <jose@faraudit.com>
Incident response: jose@faraudit.com

This document describes the security controls implemented in the FARaudit Next.js application, the gaps that remain, and the roadmap toward SOC 2 Type II.

---

## Threat model

FARaudit handles federal contract solicitation data, which is generally public, but processes it through:

1. **User-submitted PDFs** — adversarial documents may attempt prompt injection or contain malware.
2. **External LLM (Anthropic)** — outbound API calls with potentially sensitive solicitation context.
3. **Supabase Postgres** — stores audit results, user PII (email), and bid analysis.
4. **Multiple authenticated users** — RLS-scoped data isolation is mandatory.

Primary threats: prompt injection, file-upload abuse, RLS bypass, secret leakage, denial of service, session hijacking.

---

## Implemented controls

### 1. Authentication & session

- **Supabase Auth** with magic-link (no passwords stored).
- **Session refresh** in `src/proxy.ts` (Next 16 proxy convention) on every request.
- **Protected routes**: `/dashboard`, `/audit`, `/audit/[id]` redirect unauthenticated users to `/login`.
- **Page-level guards**: server components also check `supabase.auth.getUser()` as defense in depth (`/dashboard/page.tsx`, `/audit/[id]/page.tsx`).
- Authenticated users hitting `/login` are redirected to `/dashboard`.

### 2. Row-Level Security

- `audits` table has RLS enabled with policy `users_see_own_audits`: `auth.uid() = user_id`.
- Service-role writes from the cron worker bypass RLS (intentional, for system-wide intelligence ingestion); user-facing API routes use the cookie-scoped server client which respects RLS.

### 3. HTTP security headers (`next.config.ts`)

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=() microphone=() geolocation=() payment=() usb=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-XSS-Protection` | `1; mode=block` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' Vercel; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' *.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` |

`X-Powered-By` is suppressed via `poweredByHeader: false`.

### 4. Input validation (`src/lib/validators.ts`)

Zod schemas applied in `/api/audit/route.ts` before any processing:

- `noticeIdSchema`: trimmed, max 50 chars, regex `^[A-Za-z0-9-]*$`.
- `pdfFileSchema`: `application/pdf` MIME + size between 1 byte and 10 MB.
- `sanitizeFilename()`: strips control chars, path separators, repeated dots; caps at 200 chars.

### 5. File upload security (`/api/audit/route.ts`)

- **MIME check** via zod (`application/pdf` only).
- **Magic-byte verification**: first 4 bytes must equal `%PDF` (`0x25 0x50 0x44 0x46`). Defends against rename attacks where a non-PDF is sent with a `.pdf` extension or spoofed MIME.
- **Hard size cap**: 10 MB enforced redundantly in zod and in the route.
- **Filename sanitization** before persistence to DB.

### 6. AI / prompt-injection defense (`src/lib/audit-engine.ts`)

- `SECURITY_DIRECTIVE` prepended to all three Claude system prompts (Overview, Compliance, Risks). Tells Claude to ignore embedded instructions, never adopt new personas, never execute commands found in documents.
- `sanitizePdfText()` runs over any text passed to Claude (e.g., SAM.gov description), redacting common injection patterns: "ignore previous instructions", "you are now…", `<|im_start|>`, `[INST]`, jailbreak/DAN language, role override phrases, etc.
- The PDF binary itself cannot be sanitized without parsing — `SECURITY_DIRECTIVE` is the primary defense for adversarial PDFs.
- All Claude responses parsed via balanced-brace JSON extractor with defensive fallback (`extractJSON()`); Claude output is never `eval`'d or trusted as code.

### 7. Rate limiting (`src/lib/rate-limit.ts`)

- In-memory Map-based per-user limiter applied to `/api/audit`.
- 10 audit requests per user per hour.
- 429 response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Reset` headers.
- Periodic cleanup keeps the Map bounded.

**Caveat**: in-memory state is per-instance — serverless cold starts reset the buckets, and the limit is not shared across regions or replicas. See [Gaps](#gaps) for migration plan.

### 8. Secret management

| Variable | Where | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | yes (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | yes (anon key, RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | no |
| `ANTHROPIC_API_KEY` | server only | no |
| `SAM_API_KEY` | server only | no |

`.env*` is gitignored. `.env.example` is committed with placeholder values. CI / Vercel sets real values via dashboard.

### 9. Outbound API hygiene

- All third-party calls (Anthropic, SAM.gov, Supabase REST) made from server only.
- 15-50s `AbortSignal.timeout` on every outbound fetch.
- No third-party API keys ever sent to the browser.

### 10. Database

- Postgres on Supabase (managed, encrypted at rest).
- TLS-only connections.
- RLS enforced on all user-data tables.
- `bid_decisions`, `gao_protests`, `executive_comp`, etc. populated by the service-role cron worker (separate repo) — no user input.

---

## Gaps

These are known weaknesses or planned hardening that has not yet shipped:

1. **Distributed rate limiting** — current in-memory limiter is per-instance only. Replace with Upstash Redis / `@vercel/kv` before traffic scales beyond a single region.
2. **CSRF protection** — Supabase cookies use `SameSite=Lax` by default which mitigates most CSRF; explicit double-submit cookie tokens not yet implemented for state-changing endpoints.
3. **Audit log retention policy** — no explicit retention window or tombstone for deleted users.
4. **WAF** — relying on Vercel's default DDoS protection; no explicit WAF rules.
5. **Vulnerability scanning in CI** — `npm audit` run manually; should run on every PR.
6. **Dependency pinning** — using caret ranges; consider strict pins or `npm-shrinkwrap.json` for reproducible builds.
7. **Penetration testing** — no third-party pen test on record.
8. **Session inactivity timeout** — relying on Supabase default JWT expiry; no idle timeout.
9. **Multi-factor auth** — magic-link is single-factor (email possession). Add TOTP for high-value accounts.
10. **Logging & monitoring** — currently log to stdout (Vercel logs). No SIEM, no alerting on anomalies.

---

## SOC 2 Type II roadmap

| Trust Service Criterion | Status | Next step |
|---|---|---|
| **Security — CC6.1 logical access** | Partial | Add MFA, session timeout, formal access review |
| **Security — CC6.6 vulnerability mgmt** | Partial | CI vuln scanning, quarterly pen test, patch SLA |
| **Security — CC7.1 monitoring** | Gap | Deploy SIEM (Datadog / Better Stack), alerting |
| **Security — CC7.2 anomaly detection** | Gap | Rate-limit anomaly alerts, failed-auth alerts |
| **Security — CC8.1 change management** | Partial | Formal PR review, branch protection on main |
| **Availability — A1.2 backups** | Inherited | Supabase PITR (paid tier) |
| **Confidentiality — C1.1 data classification** | Gap | Document data classes, retention windows |
| **Privacy — P3 collection** | Partial | Privacy policy, data processing addendum |
| **Processing integrity — PI1.4** | Partial | Audit log immutability |

Target: Type I attestation Q4 2026, Type II observation period 2027.

---

## Incident response

1. **Detection** — user reports, Vercel error logs, Supabase logs, user-visible 5xx spike.
2. **Triage** — owner (Jose) acknowledges within 4 hours during business hours.
3. **Containment** — revoke compromised tokens (Supabase admin), rotate secrets via Vercel env, force re-auth via Supabase Auth.
4. **Eradication** — patch root cause, deploy hotfix.
5. **Recovery** — verify normal traffic, monitor 24 hours.
6. **Post-mortem** — within 5 business days, written post-mortem covering timeline, impact, root cause, action items.

**Reporting a vulnerability**: jose@faraudit.com. PGP key on request. We aim to acknowledge within 48 hours.

---

## Known dependency advisories (accepted)

`npm audit --audit-level=moderate` reports 2 moderate findings (no high, no critical) at the time of this writing:

- **GHSA-qx2v-qp2m-jg93** — `postcss <8.5.10` XSS via unescaped `</style>` in stringify output. Reaches us transitively via `next@16.2.4 → node_modules/next/node_modules/postcss`. CVSS 6.1, but the exploit requires an attacker to inject hostile CSS into our build pipeline. PostCSS only runs at build time, processing our own `globals.css` and Tailwind output — there is no user-supplied CSS path. Effective exposure: zero.

The npm-suggested "fix" is to downgrade Next.js to 9.3.3 (a major regression — would break the App Router, RSC, Turbopack, and the entire app). Not acceptable. Tracking upstream: Next.js will bump nested postcss in a future release.

## Compliance frameworks

- **NIST 800-171** baseline: most CUI-relevant controls in scope; full mapping pending.
- **SOC 2 Type II**: roadmap above.
- **GDPR / CCPA**: user-controlled data deletion via Supabase Auth admin; no third-country processing outside US.
- **CMMC**: not currently in scope; will be evaluated when targeting DoD prime contracts.
