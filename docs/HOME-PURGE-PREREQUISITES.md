# `/home` purge — BLOCKED (prerequisites)

**Status:** Do **NOT** delete `/home`. This branch documents the gate; it is closed without merging.
**Date:** 2026-06-15 · **Decision owner:** Brain/CEO · **Last live commit:** `99fe3db`

## Why the purge was stopped

`/home` is the **live data platform**, and the surfaces meant to replace it
(`/today`, `/command-center`) are still **static mock**. Deleting `/home` now
would take the only live-data surface offline, 404 five of six workspace nav
tabs, and break the password-reset flow. This is the same purge correctly
halted at FA-166.

### `/home` is referenced by active routes/components (NOT isolated)

| Reference | Breaks if `/home` deleted |
|---|---|
| `Navigation.tsx:219` — "Today" → `/home` | 404 |
| `Navigation.tsx:221` — "Run Audit" → `/home#audit` | 404 |
| `Navigation.tsx:222` — "Past Audits" → `/home#past-audits` | 404 |
| `Navigation.tsx:223` — "Pipeline" → `/home#pipeline` | 404 |
| `Navigation.tsx:224` — "Capability Statement" → `/home#capability` | 404 |
| `Navigation.tsx:190` — sidebar suppression `pathname.startsWith("/home")` | nav layout breaks |
| `auth/update-password/page.tsx:57` — reset → `router.push("/home")` | reset flow 404s |

**5 of 6 workspace nav items route into `/home`.**

### `/home` is live; the replacement is mock
- `src/app/home/page.tsx` is `force-dynamic`, fetches real Supabase data
  (`fetchHeaderCounter`, `fetchOpportunities`, `fetchRecentAudits`, `fetchKOs`,
  `fetchAgencyStats`, `fetchDefenseSpending`).
- `/command-center` + `/today` are static HTML with a hardcoded date and mock
  `cc-app.js` data; `fetchCommandCenterDigest` is **unbuilt**. Platform state:
  *all 17 tabs built, ZERO live-wired.*

## The 3 files (clean delete — only after the prerequisites below)
```
src/app/home/page.tsx
src/app/home/HomeClient.tsx
src/app/home/home.css
```
Nothing outside `/home` imports these, so the eventual delete is a clean
3-file removal. Their shared dependencies (`@/lib/bd-os/queries`,
`@/lib/audit-engine`, `@/lib/audit-display`, supabase clients,
`NaicsCombobox`, `feedback-widget`, …) are used by other routes and must stay.

## Prerequisites — ALL required before `/home` can be deleted

1. **`fetchCommandCenterDigest` built** — `/today` (+ `/command-center`)
   live-wired to real data; kill the mock `cc-app.js` data + the hardcoded date.
2. **All 5 nav tabs repointed** from `/home*` to the new live routes
   (`Navigation.tsx` workspaceDefs), plus the `update-password` redirect.
3. **Parity verified** — the new surfaces serve the *same real data* `/home`
   serves (FA-166 lesson: `/dashboard` showed a fake 71/Proceed vs the real
   35/Decline; verify the live values match, not just that data renders).
4. **Only then:** delete `src/app/home/` (3 files) + remove the route.

No further work happens on this branch. It exists solely as the record of the
gate. Re-open the purge only after 1–3 are done and verified.
