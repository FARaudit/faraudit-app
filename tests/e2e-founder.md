# FARaudit — Founder E2E checklist

**Founder account:** jose@faraudit.com
**Production URL:** https://faraudit.com

Run after each major deploy. Mark each step PASS / FAIL and paste the table into `outputs/e2e-faraudit.txt`.

---

## Setup
- [ ] Browser cookies cleared (or use incognito)
- [ ] Vercel latest deploy is live for `main`
- [ ] Supabase apex-production migrations applied per `schema/MIGRATIONS.md`

## Account creation
1. Go to **https://faraudit.com/signup** (or `/login` if signup is on the same page)
2. Create account with `jose@faraudit.com`
3. Verify magic-link email arrives (Supabase auth)
4. Click link → redirected to `/dashboard`

## Dashboard
5. Stat cards render: Audits Run · Traps Caught · KO Emails Sent · Active Solicitations
6. Morning Brief streams (Claude SSE) — text appears, blink cursor active until done
7. Recent audits table renders (empty state on a fresh account is fine)

## Audit flow
8. Navigate to `/audit`
9. Upload `SolicitationFA301626Q0068.pdf` (or any multi-page text PDF)
10. Click **Run audit**
11. 5-step progress ladder advances: Upload → Classify → Overview → Compliance → Risks
12. Within ~50 seconds, redirected to `/audit/<id>`
13. Result page renders with: classification badge (SOW / PWS / SOO / RFP / RFQ / IFB / Sources Sought / Other), DFARS trap grid, P0/P1/P2 risk cards, FAR/DFARS clause table, CLIN section, Section L/M, KO email button
14. KO email modal: enter `test@example.com` recipient → **Draft**, then **Send via Resend** (only if `RESEND_API_KEY` is set; otherwise verify the draft renders)

## How It Works
15. Navigate to `/how-it-works` — lifecycle visual loads (8 stages, gap map, demo script)
16. Tabs (Overview · FARaudit · Clauses · Risks) switch correctly within each stage

## Prospects
17. Navigate to `/prospects` — 4 seeded prospects render (Snoe Inc · PMR Global · Southern Machine Works · American Valmark)
18. Click **American Valmark** → 6-tab record (Snapshot · Financials · Authority · Compliance · Play · Anchors)
19. Play tab streams a 3-step outreach plan via Claude

## Settings + deletion
20. Navigate to `/settings` — Profile section renders user email
21. Click **Delete account** in Danger Zone → 30-second countdown banner appears
22. Click **Cancel** during countdown — verify account is NOT deleted

## Cleanup
23. Sign out from any nav (header SignOutButton)
24. Verify `/dashboard` redirects to `/login`

---

## Report

```
                                        PASS / FAIL
1.  Account creation                    [   ]
2.  Dashboard renders                   [   ]
3.  Morning Brief streams               [   ]
4.  Audit upload + classify             [   ]
5.  Audit results render                [   ]
6.  KO email draft                      [   ]
7.  KO email send                       [   ]
8.  How It Works lifecycle              [   ]
9.  Prospects index                     [   ]
10. Prospect detail (6 tabs)            [   ]
11. Settings page                       [   ]
12. Delete countdown + cancel           [   ]
```
