import { redirect, notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import AuditReport from "./AuditReport";
import "../../home/home.css";
import "./report.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route accepts either an audits.id UUID or a human-readable slug
// (currently audits.solicitation_number, e.g. "FA301626Q0068"). Defense BD
// leads pasting an /audit/{uuid} URL externally exposes internal DB UUIDs;
// the slug form lets them share /audit/fa301626q0068 instead. Case-insensitive
// match on solicitation_number handles users typing/pasting in either case.
// If the slug resolves to multiple audits (same sol# audited twice) we pick
// the most recent.
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

  const isUuid = UUID_RE.test(id);
  if (isUuid) {
    const { data: audit } = await supabase.from("audits").select("*").eq("id", id).single();
    if (!audit) notFound();
    return <AuditReport audit={audit as Record<string, unknown>} userEmail={user.email || ""} />;
  }

  // Slug path: case-insensitive solicitation_number lookup, most recent first.
  const { data: audits } = await supabase
    .from("audits")
    .select("*")
    .ilike("solicitation_number", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const audit = audits && audits.length > 0 ? audits[0] : null;
  if (!audit) notFound();

  return <AuditReport audit={audit as Record<string, unknown>} userEmail={user.email || ""} />;
}
