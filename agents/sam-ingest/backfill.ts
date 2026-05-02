// One-shot backfill — pulls SAM.gov for a wider lookback window than the daily
// cron. Use for T2-5 corpus seeding.
//
// Usage:   BACKFILL_DAYS=365 npx tsx agents/sam-ingest/backfill.ts
//          (or pass any number of days; default 365)
//
// Set DRY_RUN=true on first invocation to preview the row count + sample
// before committing the inserts (and the downstream Anthropic spend when
// audit-ai chews through them).

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.SAM_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[backfill] missing SAM_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS) || 365;

// Override DAILY_WINDOW_DAYS so the shared index.ts main() walks the bigger
// window. Then re-import index.ts dynamically — its main() runs and writes.
process.env.DAILY_WINDOW_DAYS = String(BACKFILL_DAYS);

console.log(`[backfill] starting backfill · ${BACKFILL_DAYS} days lookback`);
console.log(`[backfill] handing off to index.ts main()`);

// @ts-expect-error tsx
await import("./index.ts");
