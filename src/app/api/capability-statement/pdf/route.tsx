import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { sniffImageType } from "@/lib/capability-statement-logo";
import { resolveAgency } from "@/lib/capability-statement-tailoring";
import { CapDoc, type CapStmt } from "@/lib/capability-statement-pdf-doc";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
/**
 * THE DOCUMENT MUST NOT FAIL TO DOWNLOAD BECAUSE OF A LOGO.
 *
 * Handing @react-pdf/renderer a URL makes it fetch during render, and a 404, a slow
 * bucket or a DNS blip then throws out of renderToBuffer — the customer clicks Download
 * PDF and gets a 500 for a decoration. The bytes are fetched here instead, with a
 * timeout, and a failure returns null so the statement renders without the logo.
 *
 * The bytes are re-sniffed even though the upload route already did. This URL is read
 * out of a database row, and the only thing that should ever reach a PDF renderer from
 * there is one of three image formats.
 */
async function fetchLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) return null;
    return sniffImageType(buf) ? buf : null;
  } catch {
    return null;
  }
}

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

  // REFUSE rather than substitute. This document goes to a contracting officer under
  // the customer's name; rendering one headed with a placeholder is worse than not
  // rendering one at all, because the customer cannot see the letterhead before it is
  // sent on their behalf.
  if (!String((stmt as CapStmt).company_name || "").trim()) {
    return NextResponse.json(
      { error: "Add your company name before exporting — a capability statement is sent under it." },
      { status: 409 }
    );
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  // Validated against the record: an edition may only name an agency the customer has
  // a recorded award with, so a query string cannot invent relevance.
  const agency = resolveAgency((stmt as CapStmt).past_performance, req.nextUrl.searchParams.get("agency"));
  const logo = await fetchLogo((stmt as CapStmt).logo_url);
  const buffer = await renderToBuffer(<CapDoc stmt={stmt as CapStmt} generatedAt={generatedAt} logo={logo} agency={agency} />);
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);

  const slug = String((stmt as CapStmt).company_name).replace(/[^A-Za-z0-9_-]+/g, "_");
  const edition = agency ? `-${agency.replace(/[^A-Za-z0-9]+/g, "_")}` : "";
  const filename = `${slug}${edition}-CapabilityStatement-${generatedAt}.pdf`;

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
