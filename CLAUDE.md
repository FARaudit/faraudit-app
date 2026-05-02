@AGENTS.md

## SESSION UPDATE — May 2 2026

### What shipped today:
- home-s05: thin JSX shell · live Supabase data · commit 2603134
- audit-intelligence-v1: full /audit/[id] report · PDF · KO email · commit 5c9860c
- track1-full-execution-v1: outcome tracking · KO intelligence · recompete · agency · pre-sol · commit 49fecec
- track1-tier1-intelligence-v1: incumbent · teaming · capability · kanban · live news · budget · commit 0675c39
- track1-full-platform-v1: protest · CMMC · win probability · labor · subcontract · Stripe · Newsletter #3 · commit 31382b5
- bullrize-full-signal-intelligence-v1: UW 6-feed · FRED · four-factor model · commit e469c17
- faraudit-api-v2: FPDS-NG · Congress · Regulatory AI · SAM wages · commit 6f7862f
- fix(email-ai): googleapis root fix · v3 OAuth Desktop app · all credentials rotated · commit 0d02d3c + 6ef36bf

### Railway fleet (9 services — all green):
FARaudit: sam-ingest · Audit-AI · Recompete-AI · Regulatory-AI
Bullrize: bullrize-cron · bullrize daily-pipeline
Both: QA-AI
CEO: apex-intel-pipeline · Email-AI

### Supabase migrations applied today:
003_intelligence_layer.sql ✅
004_incumbent_capability.sql ✅
005_platform_intelligence.sql ✅
006_apex_intelligence_apis.sql ✅
bullrize/002_signal_intelligence_layer.sql ✅
Total tables: apex-production 24 · bullrize-production 6

### APIs wired today:
FARaudit: FPDS-NG · GovInfo RSS · Federal Register · Congress.gov · SAM Wages
Bullrize: Unusual Whales 6-feed · SEC EDGAR Form4+13D · FRED macro · Polygon.io hook
Cross-platform: Four-factor signal model (FARaudit award → Bullrize ticker)

### New env vars added:
FRED_API_KEY · CONGRESS_API_KEY → Vercel + Railway shared variables

### Email-AI resolution:
Root cause: inactive OAuth client + credential mismatch
Fix: created email-ai-v3 Desktop app in Google Cloud Console
Old clients deleted: email-ai-v2 · faraudit-gmail-oauth
New credentials: saved to 1Password as Email-AI OAuth v3
Railway: GMAIL_CLIENT_ID · GMAIL_CLIENT_SECRET · GMAIL_REFRESH_TOKEN updated

### Notion databases created today:
API Tracker: https://www.notion.so/c69bc028f89a41578b29b04a713ca1e2
25 APIs logged · 3 views (P0 · By Platform · Not Wired)

### PENDING — carry to next session:
- home.html tab review (T1-1) — first thing tomorrow
- Email-AI inbox verification — check cron logs
- Digest overhaul visual review — open file:// link
- Accountant AI build — expense tracking automation
- Stripe env vars — complete billing setup
- Newsletter #3 publish — Monday May 9 08:30 CT
- Migration 005 note: subscriptions table now live — Stripe webhook ready
