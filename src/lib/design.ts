// FARaudit design tokens + shared formatters.

export const tokens = {
  bg:        "#050D1A",
  surface:   "#091322",
  surface2:  "#0D1C30",
  border:    "#122240",
  border2:   "#1a3560",
  text1:     "#EDF4FF",
  text2:     "#5B8AB8",
  text3:     "#2D5280",
  accent:    "#185FA5",
  accent2:   "#1D4ED8",
  mid:       "#378ADD",
  light:     "#B5D4F4",
  pale:      "#E6F1FB",
  gain:      "#10B981",
  loss:      "#EF4444",
  warn:      "#F59E0B",
  gold:      "#D4AF37"
} as const;

export const PRIORITY_BADGES: Record<"P0" | "P1" | "P2", { color: string; bg: string; label: string }> = {
  P0: { color: tokens.loss, bg: "rgba(239,68,68,0.12)", label: "P0" },
  P1: { color: tokens.warn, bg: "rgba(245,158,11,0.12)", label: "P1" },
  P2: { color: tokens.accent, bg: "rgba(24,95,165,0.15)", label: "P2" }
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export function timeAgo(ts: Date | string | number): string {
  const date = typeof ts === "string" || typeof ts === "number" ? new Date(ts) : ts;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
