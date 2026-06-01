import { NextResponse }       from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import {
  fetchHeaderCounter,
  fetchOpportunities,
  fetchRecentAudits,
  fetchHomeStats,
} from "@/lib/bd-os/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()                { return cookieStore.getAll(); },
          setAll(cookiesToSet)    {
            try { cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)); } catch {}
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [counters, homeStats, rawOpps, recentAudits] = await Promise.all([
      fetchHeaderCounter(supabase).catch(() => ({ audits: 0, traps: 0 })),
      fetchHomeStats(supabase).catch(() => null),
      fetchOpportunities(supabase, { limit: 250 }).catch(() => []),
      fetchRecentAudits(supabase, 200).catch(() => []),
    ]);

    const nowMs = Date.now();
    const opportunities = (rawOpps as any[]).filter((o) => {
      if (!o?.response_deadline) return true;
      const ms = new Date(o.response_deadline).getTime();
      if (Number.isNaN(ms)) return true;
      return ms >= nowMs;
    });

    return NextResponse.json({
      liveCount:        homeStats?.live_sam_gov        ?? (opportunities as any[]).length,
      trapCount:        homeStats?.total_traps_caught  ?? counters.traps,
      deadlineSoon:     homeStats?.expiring_7d         ?? 0,
      auditsThisMonth:  homeStats?.audit_activity_month ?? counters.audits,
      auditTotal:       (recentAudits as any[]).length,
      opportunities:    opportunities,
      lastSync:         new Date().toISOString(),
    });
  } catch (err) {
    console.error("[command-center-data]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
