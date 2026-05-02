import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface PatchBody {
  company_name?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  duns?: string | null;
  naics_codes?: string[];
  certifications?: string[];
  core_competencies?: string | null;
  differentiators?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_website?: string | null;
  contact_address?: string | null;
  past_performance?: unknown;
}

const ALLOWED_FIELDS = new Set<keyof PatchBody>([
  "company_name", "uei", "cage_code", "duns",
  "naics_codes", "certifications",
  "core_competencies", "differentiators",
  "contact_name", "contact_email", "contact_phone", "contact_website", "contact_address",
  "past_performance"
]);

async function autopopulate(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  // Pull won audits for this user → past_performance JSON; aggregate distinct NAICS codes.
  const { data: wonAudits } = await supabase
    .from("audits")
    .select("id, notice_id, title, agency, naics_code, outcome_date, overview_json")
    .eq("outcome", "won")
    .order("outcome_date", { ascending: false })
    .limit(20);

  const past = (wonAudits || []).map((a) => {
    const ov = (a.overview_json as Record<string, unknown> | null) || {};
    return {
      audit_id: a.id,
      notice_id: a.notice_id,
      title: a.title,
      agency: a.agency,
      naics_code: a.naics_code,
      contract_value: ov.ceiling_value_estimate ?? null,
      period: ov.period_of_performance ?? null,
      awarded_at: a.outcome_date
    };
  });

  const naicsSet = new Set<string>();
  for (const a of wonAudits || []) {
    if (a.naics_code) naicsSet.add(String(a.naics_code));
  }
  return { past, naics: Array.from(naicsSet) };
}

export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("capability_statements")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `lookup failed: ${error.message} — run migration 004_incumbent_capability.sql` },
      { status: 503 }
    );
  }

  // First-time visit — return a draft populated from past performance.
  if (!data) {
    const { past, naics } = await autopopulate(supabase, user.id);
    return NextResponse.json({
      statement: {
        user_id: user.id,
        company_name: null,
        uei: null,
        cage_code: null,
        naics_codes: naics,
        certifications: [],
        core_competencies: null,
        differentiators: null,
        contact_name: null,
        contact_email: user.email || null,
        contact_phone: null,
        contact_website: null,
        contact_address: null,
        past_performance: past,
        created_at: null,
        updated_at: null
      },
      stub: true
    });
  }

  return NextResponse.json({ statement: data, stub: false });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  for (const k of Object.keys(body) as (keyof PatchBody)[]) {
    if (ALLOWED_FIELDS.has(k)) update[k] = body[k] as unknown;
  }

  // Auto-refresh past_performance from won audits if caller didn't override.
  if (!("past_performance" in body)) {
    const { past } = await autopopulate(supabase, user.id);
    update.past_performance = past;
  }

  const { data, error } = await supabase
    .from("capability_statements")
    .upsert(update, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `save failed: ${error.message} — run migration 004_incumbent_capability.sql` },
      { status: 503 }
    );
  }

  return NextResponse.json({ statement: data, savedAt: update.updated_at });
}
