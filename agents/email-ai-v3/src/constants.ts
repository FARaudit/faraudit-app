export const STALE_THREAD_MAX_DAYS_NOW = 3;
export const WAITING_THRESHOLD_HOURS = 4;
export const WAITING_EXPIRY_DAYS = 14;
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
export const SNIPPET_MAX_CHARS = 500;

// De-arm (#657): allowlist-gated archiving. A thread may leave the inbox ONLY when its classification
// was deterministic AND its sender domain matches this allowlist (exact or subdomain, so notification
// senders like notifications.github.com match github.com). Overridable via env ARCHIVE_ALLOWLIST
// (comma-separated domains). Default = machine-noise notification senders only.
export const ARCHIVE_ALLOWLIST: string[] = (process.env.ARCHIVE_ALLOWLIST
  ? process.env.ARCHIVE_ALLOWLIST.split(",")
  : ["github.com", "vercel.com", "railway.app", "supabase.com"]
).map((d) => d.trim().toLowerCase()).filter(Boolean);

// Blacklist de-arm (#657): matched senders are labeled here + pulled from inbox, never trashed.
export const BLACKLIST_LABEL = "AI/Blacklisted";
