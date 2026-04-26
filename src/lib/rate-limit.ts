// In-memory per-user rate limiter for the audit endpoint.
//
// Caveats (documented in SECURITY.md):
// - Map state is per-instance; serverless cold starts reset it.
// - Not shared across regions or replicas.
// - For production at scale, replace with Upstash Redis or @vercel/kv.

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface RateLimitOk {
  ok: true;
  remaining: number;
  resetAt: number;
}

export interface RateLimitDenied {
  ok: false;
  retryAfter: number; // seconds
  resetAt: number;
}

export type RateLimitResult = RateLimitOk | RateLimitDenied;

export function checkRateLimit(
  key: string,
  options: { max?: number; windowMs?: number } = {}
): RateLimitResult {
  const max = options.max ?? DEFAULT_MAX;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    const resetAt = oldest + windowMs;
    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
    buckets.set(key, bucket);
    return { ok: false, retryAfter, resetAt };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  return {
    ok: true,
    remaining: max - bucket.timestamps.length,
    resetAt: now + windowMs
  };
}

// Periodic cleanup so the Map doesn't grow unbounded. Runs every 5 minutes
// after the first request comes in.
let cleanupInterval: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, bucket] of buckets.entries()) {
        bucket.timestamps = bucket.timestamps.filter(
          (t) => now - t < DEFAULT_WINDOW_MS
        );
        if (bucket.timestamps.length === 0) buckets.delete(key);
      }
    },
    5 * 60 * 1000
  );
}

ensureCleanup();
