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

interface AuditCore {
  id: string;
  notice_id: string | null;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  outcome_date: string | null;
  overview_json: Record<string, unknown> | null;
}

interface AwardedOutcomeCore {
  audit_id: string;
  contract_value_actual: number | null;
  cpars_rating: number | null;
  customer_relationship_strength: string | null;
  outcome_recorded_at: string | null;
}

type Past = {
  audit_id: string;
  notice_id: string | null;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  contract_value: string | number | null;
  period: string | null;
  awarded_at: string | null;
  cpars_rating: number | null;
  customer_relationship: string | null;
};

async function autopopulate(supabase: Awaited<ReturnType<typeof createServerClient>>, _userId: string) {
  // Two sources of "won" status coexist; union both into past_performance.
  //   audits.outcome = 'won'              (legacy lifecycle vocabulary)
  //   audit_outcomes.outcome = 'awarded'  (Layer 3 rich-data vocabulary)
  //
  // Enrich each row with audit_outcomes rich fields when present:
  // contract_value_actual, cpars_rating, customer_relationship_strength.
  //
  // We deliberately use TWO queries rather than a PostgREST audits!inner()
  // embed because the cross-table join silently drops rows whenever the
  // RLS policies on audits and audit_outcomes don't both pass for the
  // calling user's auth context. The two-query split runs each select
  // through its own RLS gate independently, then we merge in TS.

  const [wonAuditsRes, awardedOutcomesRes] = await Promise.all([
    supabase
      .from("audits")
      .select("id, notice_id, title, agency, naics_code, outcome_date, overview_json")
      .eq("outcome", "won"),
    supabase
      .from("audit_outcomes")
      .select("audit_id, contract_value_actual, cpars_rating, customer_relationship_strength, outcome_recorded_at")
      .eq("outcome", "awarded")
  ]);

  const wonAudits = (wonAuditsRes.data || []) as AuditCore[];
  const awardedOutcomes = (awardedOutcomesRes.data || []) as AwardedOutcomeCore[];

  // Hydrate audit-side fields for the audit_ids referenced by awarded outcomes
  // that aren't already covered by the wonAudits query. Skip the second
  // round-trip when no Layer 3 rows exist.
  const wonIds = new Set(wonAudits.map((a) => a.id));
  const missingIds = awardedOutcomes
    .map((o) => o.audit_id)
    .filter((id) => !wonIds.has(id));

  let extraAudits: AuditCore[] = [];
  if (missingIds.length > 0) {
    const { data } = await supabase
      .from("audits")
      .select("id, notice_id, title, agency, naics_code, outcome_date, overview_json")
      .in("id", missingIds);
    extraAudits = (data || []) as AuditCore[];
  }
  const auditsById = new Map<string, AuditCore>();
  for (const a of wonAudits) auditsById.set(a.id, a);
  for (const a of extraAudits) auditsById.set(a.id, a);

  const byId = new Map<string, Past>();

  for (const a of wonAudits) {
    const ov = a.overview_json || {};
    byId.set(a.id, {
      audit_id: a.id,
      notice_id: a.notice_id,
      title: a.title,
      agency: a.agency,
      naics_code: a.naics_code,
      contract_value: (ov.ceiling_value_estimate as string | number | null) ?? null,
      period: (ov.period_of_performance as string | null) ?? null,
      awarded_at: a.outcome_date,
      cpars_rating: null,
      customer_relationship: null
    });
  }

  for (const o of awardedOutcomes) {
    const a = auditsById.get(o.audit_id);
    if (!a) continue; // outcome row references an audit the caller can't see
    const existing = byId.get(o.audit_id);
    const ov = a.overview_json || {};
    const fallbackValue = (ov.ceiling_value_estimate as string | number | null) ?? null;
    byId.set(o.audit_id, {
      audit_id: o.audit_id,
      notice_id: existing?.notice_id ?? a.notice_id,
      title: existing?.title ?? a.title,
      agency: existing?.agency ?? a.agency,
      naics_code: existing?.naics_code ?? a.naics_code,
      contract_value: o.contract_value_actual ?? existing?.contract_value ?? fallbackValue,
      period: existing?.period ?? ((ov.period_of_performance as string | null) ?? null),
      awarded_at: o.outcome_recorded_at ?? existing?.awarded_at ?? a.outcome_date,
      cpars_rating: o.cpars_rating ?? existing?.cpars_rating ?? null,
      customer_relationship: o.customer_relationship_strength ?? existing?.customer_relationship ?? null
    });
  }

  const past = Array.from(byId.values())
    .sort((a, b) => {
      const ta = a.awarded_at ? new Date(a.awarded_at).getTime() : 0;
      const tb = b.awarded_at ? new Date(b.awarded_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 20);

  const naicsSet = new Set<string>();
  for (const p of past) if (p.naics_code) naicsSet.add(String(p.naics_code));
  return { past, naics: Array.from(naicsSet) };
}

export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Always recompute past_performance from won audits + audit_outcomes on
  // every GET. Past performance is auto-pulled by definition (per the UI
  // label) and the persisted snapshot goes stale the moment a new outcome
  // is recorded. Computing fresh every load surfaces newly-won audits
  // immediately without requiring a PATCH cycle to refresh.
  const [stmtRes, autoRes] = await Promise.all([
    supabase
      .from("capability_statements")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    autopopulate(supabase, user.id)
  ]);

  if (stmtRes.error) {
    return NextResponse.json(
      { error: `lookup failed: ${stmtRes.error.message}` },
      { status: 503 }
    );
  }

  const { past, naics } = autoRes;

  // First-time visit — no saved row yet. Return a stub seeded from autopopulate.
  if (!stmtRes.data) {
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

  // Existing row: keep customer-edited fields, overlay fresh past_performance.
  // For naics_codes, customer may have added their own — only seed from
  // autopopulate when the saved list is empty.
  const savedNaics = Array.isArray(stmtRes.data.naics_codes) ? stmtRes.data.naics_codes : [];
  const merged = {
    ...stmtRes.data,
    past_performance: past,
    naics_codes: savedNaics.length > 0 ? savedNaics : naics
  };

  return NextResponse.json({ statement: merged, stub: false });
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
