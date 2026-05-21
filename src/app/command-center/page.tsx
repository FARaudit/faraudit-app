import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase-server"
import {
  fetchHomeStats,
  fetchOpportunities,
  fetchRecentAudits,
} from "@/lib/bd-os/queries"
import { CommandCenterClient } from "./CommandCenterClient"

export const dynamic = "force-dynamic"

export default async function CommandCenterPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in?next=/command-center")

  const [stats, opportunities, recentAudits] = await Promise.all([
    fetchHomeStats(supabase),
    fetchOpportunities(supabase),
    fetchRecentAudits(supabase),
  ])

  return (
    <CommandCenterClient
      stats={stats}
      opportunities={opportunities}
      recentAudits={recentAudits}
      userEmail={user.email ?? ""}
    />
  )
}
