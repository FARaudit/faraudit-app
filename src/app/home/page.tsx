// BD OS — home page (server component).
// Auth check, parallel-fetch all data, hand off to client shell.

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import {
  fetchCorpusStats,
  fetchOpportunities,
  fetchRecentAudits,
  fetchHeaderCounter,
  fetchHomeStats
} from "@/lib/bd-os/queries";
import BdOsShell from "./_components/BdOsShell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [counter, corpus, opportunities, recentAudits, homeStats] = await Promise.all([
    fetchHeaderCounter(supabase).catch(() => ({ audits: 0, traps: 0 })),
    fetchCorpusStats(supabase).catch(() => ({
      total_audits: 0,
      total_corpus_rows: 0,
      trap_breakdown: [],
      agency_breakdown: [],
      recent_30d_audits: 0,
      pending_queue_size: 0
    })),
    fetchOpportunities(supabase, { limit: 50 }).catch(() => []),
    fetchRecentAudits(supabase, 25).catch(() => []),
    fetchHomeStats(supabase).catch(() => ({
      critical_p0: 0,
      expiring_7d: 0,
      live_sam_gov: 0,
      audit_activity_month: 0,
      total_traps_caught: 0,
      value_audited_estimate: "$0"
    }))
  ]);

  return (
    <BdOsShell
      user={{ email: user.email || "", id: user.id }}
      counter={counter}
      corpus={corpus}
      opportunities={opportunities}
      recentAudits={recentAudits}
      homeStats={homeStats}
    />
  );
}
