// POST /api/internal/watcher-tick — Bearer-authed internal endpoint that
// drives the watcher pass. Called from the Railway sam-ingest cron at the
// tail of each tick. Also reachable for ad-hoc manual ticks via curl when
// debugging.
//
// Auth: `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` — the cron
// already holds this credential, no new secret to plumb. Constant-time
// compare prevents timing-based key probes.
//
// Query params:
//   ?dryRun=1   — exercises the read path + status='watching' SELECT but
//                 doesn't flip rows or run audits.
//   ?maxRows=N  — clamps the per-tick budget (clamped to MAX_TICK_PER_RUN
//                 inside the lib).

import { NextResponse } from "next/server";
import { runWatcherTick } from "@/lib/watcher-tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// runAudit (Sonnet 4.6 three-call pipeline) per row × up to MAX_TICK_PER_RUN
// rows — share the 300s budget the main audit POST + refetch already use.
export const maxDuration = 300;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function POST(req: Request) {
  // Dedicated Bearer for the cron→endpoint hop. Falls back to the service
  // role key during the brief env-propagation window after Phase 2 ship —
  // both Vercel-prod and Railway sam-ingest already carry the service role
  // key, so the fallback prevents a deploy-vs-env-rollout race from
  // wedging the watcher tick. Once WATCHER_TICK_BEARER is set on both
  // sides, the service-role fallback path is dead code.
  const primary = process.env.WATCHER_TICK_BEARER;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!primary && !fallback) {
    return NextResponse.json({ error: "watcher-tick bearer not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const matchPrimary = !!primary && !!bearer && timingSafeEqual(bearer, primary);
  const matchFallback = !!fallback && !!bearer && timingSafeEqual(bearer, fallback);
  if (!matchPrimary && !matchFallback) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dry") === "1";
  const maxRowsParam = url.searchParams.get("maxRows");
  const maxRows = maxRowsParam ? Number(maxRowsParam) : undefined;

  try {
    const result = await runWatcherTick({
      dryRun,
      maxRows: Number.isFinite(maxRows) ? maxRows : undefined,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "tick failed" },
      { status: 500 }
    );
  }
}
