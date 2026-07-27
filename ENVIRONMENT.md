# Environment Variables

Required environment variables and where they need to be set.
This file is the source of truth for what must be configured in
Railway production, Vercel production, and local `.env.local`.

## API Keys

### `NEWS_API_KEY` — NewsAPI.org

**Purpose**: Powers `/api/news-feed`, which feeds the static Defense News
design page at `/defense-news`. Returns 7 most recent defense-contracting
articles with `urlToImage` for the magazine-style grid.

**Get a key**: https://newsapi.org/register (free tier: 100 requests/day,
1-month data window, non-commercial use only — upgrade for prod).

**Where to set**:
- Vercel production env vars (Production + Preview)
- Railway production env vars (if running the Next server outside Vercel)
- Local `.env.local` for `npm run dev`

**Behavior if missing**: The `/api/news-feed` route returns an EMPTY article
list plus a `reason`, and the Defense News page renders with no articles. It
does NOT invent content.

Until 2026-07-27 it fell back to 7 hand-written "articles" attributed to real
outlets (Defense News, Breaking Defense, Janes), two of which carried invented
regulatory claims. Those were deleted under ARC #747: a fallback that fabricates
attributed journalism the moment a key lapses is the same class as a report
asserting a fact it never computed.

**Cost guardrails**: Route caches for 15 minutes at the edge
(`s-maxage=900`). Free tier (~100 req/day) is sufficient for the
current traffic level but will need to be upgraded if `/defense-news`
becomes a high-traffic page.

**Note**: Distinct from `ANTHROPIC_API_KEY`, which powers the existing
`/api/defense-news` route (RSS + Claude insights, used by `/home`).
The two news routes coexist:
- `/api/defense-news` — RSS + Claude + Supabase cache (auth-gated, /home)
- `/api/news-feed` — NewsAPI.org, fails CLOSED to an empty list (public, /defense-news)

---

## Other required vars (existing, documented here for completeness)

See `.env.local` and Railway/Vercel dashboards for the full list. This
file currently only catalogs vars added during the design-rebuild work.
Add entries here as new third-party integrations come online.
