// GET /audit/[id] — renders the approved audit-report design with real data.
//
// Replaces the prior React shell (page.tsx + AuditReport.tsx) with the
// approved Claude Design template (_template.html), wired by _view-model.ts
// and _render.ts. Accepts either an audits.id UUID or a human-readable
// solicitation_number slug (case-insensitive, most-recent first).

import { redirect, notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";
import { buildViewModel } from "./_view-model";
import { renderAuditReport } from "./_render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return new Response("id required", { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/audit/${encodeURIComponent(id)}`);

  // UUID path: direct lookup. Slug path: case-insensitive
  // solicitation_number match, most recent first (some sol numbers are
  // audited multiple times).
  let audit: Record<string, unknown> | null = null;
  if (UUID_RE.test(id)) {
    const { data } = await supabase.from("audits").select("*").eq("id", id).single();
    audit = data as Record<string, unknown> | null;
  } else {
    const { data } = await supabase
      .from("audits")
      .select("*")
      .ilike("solicitation_number", id)
      .order("created_at", { ascending: false })
      .limit(1);
    audit = data && data.length > 0 ? (data[0] as Record<string, unknown>) : null;
  }
  if (!audit) notFound();

  const vm = buildViewModel(audit);

  const templatePath = path.join(process.cwd(), "src", "app", "audit", "[id]", "_template.html");
  const template = await readFile(templatePath, "utf8");
  const html = renderAuditReport(template, vm);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
