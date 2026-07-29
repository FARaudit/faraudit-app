import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import {
  fetchHeaderCounter,
  fetchRecentAudits,
  fetchKOs,
  fetchAgencyStats,
  fetchDefenseSpending
} from "@/lib/bd-os/queries";
import { fetchLiveOpportunities } from "@/lib/bd-os/live-opportunities";
import { cleanAgencyName } from "@/lib/audit-engine";
import HomeClient from "./HomeClient";
import "./home.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [counter, opportunities, recentAudits, kos, agencies, defenseSpending] = await Promise.all([
    fetchHeaderCounter(supabase).catch(() => ({ audits: 0, traps: 0 })),
    // Live SAM.gov feed (CEO 2026-07-29: go live-source; the sam-ingest cron
    // that fed pending_audits was retired 2026-05-30 and the queue froze).
    // Fail-closed inside; on error the feed renders empty, never stale rows.
    fetchLiveOpportunities(supabase).catch(() => []),
    fetchRecentAudits(supabase, user.id, 200).catch(() => []),
    fetchKOs(supabase).catch(() => []),
    fetchAgencyStats(supabase).catch(() => []),
    fetchDefenseSpending(supabase).catch(() => [])
  ]);

  // FA-167 — resolve the buying-office leaf server-side through the SAME
  // cleanAgencyName() the audit report uses (FA-151). office_leaf is the raw
  // SAM leaf ("FA4600  55 CONS  PKP" / "DLA AVIATION AT OKLAHOMA CITY, OK");
  // cleanAgencyName strips the redundant DEPT-OF-DEFENSE parent, the "AT"
  // preposition and trailing state code. Done here (server) so the heavy
  // engine module never reaches the client bundle.
  const recentAuditsForCard = recentAudits.map((a) => ({
    ...a,
    office_display: (a.office_leaf || a.agency)
      ? cleanAgencyName(a.office_leaf || a.agency || "").replace(/\s{2,}/g, " ").trim()
      : ""
  }));

  return (
    <HomeClient
      user={{ email: user.email || "", id: user.id }}
      counter={counter}
      opportunities={opportunities}
      recentAudits={recentAuditsForCard}
      kos={kos}
      agencies={agencies}
      defenseSpending={defenseSpending}
    />
  );
}
