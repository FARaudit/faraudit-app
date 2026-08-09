import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveAgency } from "@/lib/capability-statement-tailoring";
import { fetchLogoBytes } from "@/lib/capability-statement-logo";
import { buildDocx, type CapStmt } from "@/lib/capability-statement-docx-doc";
import { Packer } from "docx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: stmt } = await supabase
    .from("capability_statements")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!stmt) return NextResponse.json({ error: "no capability statement saved yet" }, { status: 404 });

  // Refuses rather than substitutes, exactly as the PDF does — this goes out under the
  // customer's name and they cannot see the letterhead before it is sent for them.
  if (!String((stmt as CapStmt).company_name || "").trim()) {
    return NextResponse.json(
      { error: "Add your company name before exporting — a capability statement is sent under it." },
      { status: 409 }
    );
  }

  const agency = resolveAgency((stmt as CapStmt).past_performance, req.nextUrl.searchParams.get("agency"));
  const logo = await fetchLogoBytes((stmt as CapStmt).logo_url);
  const buffer = await Packer.toBuffer(buildDocx(stmt as CapStmt, agency, logo));
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const slug = String((stmt as CapStmt).company_name).replace(/[^A-Za-z0-9_-]+/g, "_");
  const edition = agency ? `-${agency.replace(/[^A-Za-z0-9]+/g, "_")}` : "";
  const filename = `${slug}${edition}-CapabilityStatement-${generatedAt}.docx`;

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
