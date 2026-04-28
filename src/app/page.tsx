import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import LandingClient from "./_components/landing-client";

// Auth-aware: signed-in visitors jump to /dashboard; otherwise the v3 landing.
export const dynamic = "force-dynamic";

async function maybeRedirectToDashboard(): Promise<void> {
  try {
    const sb = await createServerClient();
    const {
      data: { user }
    } = await sb.auth.getUser();
    if (user) redirect("/dashboard");
  } catch {
    /* never block the public landing on a transient auth-check error */
  }
}

export default async function HomePage() {
  await maybeRedirectToDashboard();
  return <LandingClient />;
}
