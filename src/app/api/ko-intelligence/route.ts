import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface PostBody {
  ko_email: string;
  ko_name?: string | null;
  ko_phone?: string | null;
  agency?: string | null;
  agency_office?: string | null;
  naics_codes?: string[];
  notes?: string | null;
  last_solicitation_id?: string | null;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const agency = url.searchParams.get("agency");

  if (email) {
    const { data, error } = await supabase
      .from("ko_intelligence")
      .select("*")
      .eq("ko_email", email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: `lookup failed: ${error.message} — run migration 003_intelligence_layer.sql` }, { status: 503 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ko: data });
  }

  let q = supabase
    .from("ko_intelligence")
    .select("*")
    .order("last_contact", { ascending: false, nullsFirst: false });
  if (agency) q = q.eq("agency", agency);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `list failed: ${error.message} — run migration 003_intelligence_layer.sql` }, { status: 503 });
  return NextResponse.json({ kos: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.ko_email || !EMAIL_RX.test(body.ko_email)) {
    return NextResponse.json({ error: "valid ko_email required" }, { status: 400 });
  }

  // Upsert by ko_email.
  const row = {
    ko_email: body.ko_email,
    ko_name: body.ko_name ?? null,
    ko_phone: body.ko_phone ?? null,
    agency: body.agency ?? null,
    agency_office: body.agency_office ?? null,
    naics_codes: Array.isArray(body.naics_codes) ? body.naics_codes : [],
    notes: body.notes ?? null,
    last_contact: new Date().toISOString(),
    last_solicitation_id: body.last_solicitation_id ?? null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("ko_intelligence")
    .upsert(row, { onConflict: "ko_email" })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `upsert failed: ${error.message} — run migration 003_intelligence_layer.sql` },
      { status: 503 }
    );
  }

  return NextResponse.json({ ko: data });
}
