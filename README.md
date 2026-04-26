# FARaudit Empire — Next.js App

Three-product platform for the FARaudit empire:

- **FARaudit** — Federal contract intelligence (GovWin alternative)
- **Capital OS** — Market intelligence (Bloomberg alternative)
- **LexAnchor** — Legal intelligence (LexisNexis alternative)

## Architecture

- **Framework**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Auth & data**: Supabase (Postgres + Row Level Security)
- **AI**: Anthropic Claude (Sonnet 4) via official SDK
- **Cron / data ingestion**: Separate `faraudit-cron` repo deployed on Railway, writes to Supabase

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page — three product entry points |
| `/dashboard` | FARaudit unified dashboard |
| `/audit` | Audit submission form |
| `/audit/[id]` | Audit result detail |
| `/capital` | Capital OS market dashboard |
| `/legal` | LexAnchor legal intelligence |
| `/api/audit` | POST endpoint to enqueue an audit |
| `/api/solicitations` | GET — recent solicitations from Supabase |
| `/api/market` | GET — latest Capital OS snapshot |

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Deployment

Push to `main` → Vercel auto-deploys. The cron worker (`FARaudit/faraudit-cron`) runs on Railway and writes to Supabase.

## Local dev

```bash
npm install
npm run dev
```
