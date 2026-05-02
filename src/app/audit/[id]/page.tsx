import { redirect, notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import AuditReport from "./AuditReport";
import "../../home/home.css";
import "./report.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { id: string };

export default async function AuditDetailPage({
  params
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: audit } = await supabase.from("audits").select("*").eq("id", id).single();
  if (!audit) notFound();

  return <AuditReport audit={audit as Record<string, unknown>} userEmail={user.email || ""} />;
}
