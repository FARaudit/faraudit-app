// GET /audit/report — historical entry point. The live audit report now
// renders at /audit/[id] (the approved Design template wired to real data).
// Redirect /audit/report to the Past Audits list so users land on the index
// and pick an audit to view. Behind the auth gate to preserve prior semantics.

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  redirect("/dashboard");
}
