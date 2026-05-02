import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import {
  fetchHeaderCounter,
  fetchOpportunities,
  fetchRecentAudits
} from "@/lib/bd-os/queries";
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

  const [counter, opportunities, recentAudits] = await Promise.all([
    fetchHeaderCounter(supabase).catch(() => ({ audits: 0, traps: 0 })),
    fetchOpportunities(supabase, { limit: 200 }).catch(() => []),
    fetchRecentAudits(supabase, 25).catch(() => [])
  ]);

  return (
    <HomeClient
      user={{ email: user.email || "", id: user.id }}
      counter={counter}
      opportunities={opportunities}
      recentAudits={recentAudits}
    />
  );
}
