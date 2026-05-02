// BD OS — home page (server component).
// Auth check, initial data fetch, hands off to client shell.

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { fetchCorpusStats, fetchOpportunities, fetchRecentAudits, fetchHeaderCounter } from "@/lib/bd-os/queries";
import BdOsShell from "./_components/BdOsShell";

export const dynamic = "force-dynamic"; // always server-render fresh

export default async function HomePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Fan out data fetches in parallel — all are server-side, none block UI render
  // beyond their slowest.
  const [counter, corpus, opportunities, recentAudits] = await Promise.all([
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
    fetchRecentAudits(supabase, 25).catch(() => [])
  ]);

  return (
    <BdOsShell
      user={{ email: user.email || "", id: user.id }}
      counter={counter}
      corpus={corpus}
      opportunities={opportunities}
      recentAudits={recentAudits}
    />
  );
}
