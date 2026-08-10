import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { syncCertifications } from "@/lib/cert-sync";
import { suggestedNaics } from "@/lib/naics-suggestions";
import { PAST_PERFORMANCE_LIMIT } from "@/lib/capability-statement-limits";
import { naicsLines } from "@/lib/capability-statement-naics";
import { agencyOptions } from "@/lib/capability-statement-tailoring";

export const dynamic = "force-dynamic";

interface PatchBody {
  company_name?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  naics_codes?: string[];
  certifications?: string[];
  core_competencies?: string | null;
  differentiators?: string | null;
  // Structured forms. The plate draws four fields per competency and two per differentiator;
  // the TEXT columns can carry one. Both shapes are accepted and the readers prefer these.
  core_competencies_json?: unknown;
  differentiators_json?: unknown;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_website?: string | null;
  contact_address?: string | null;
  past_performance?: unknown;
}

const ALLOWED_FIELDS = new Set<keyof PatchBody>([
  // No duns: UEI replaced it for federal use in April 2022 and no surface renders
  // it. A field that can be written and is never read is a trap for whoever is next.
  "company_name", "uei", "cage_code",
  "naics_codes", "certifications",
  "core_competencies", "differentiators",
  "core_competencies_json", "differentiators_json",
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
      // NOT A CONTRACT VALUE. ceiling_value_estimate is a lens's reading of the
      // SOLICITATION's ceiling, not what this award was worth, and it was rendering in
      // a past-performance row and printing in the PDF as though it were. A contracting
      // officer reads a figure in that column as the award, has no way to tell it came
      // from a model, and cannot audit a qualifier we would attach to it. An absent
      // value costs the customer a number the record never held; a wrong one costs
      // their credibility on paper they sent under their own name.
      contract_value: null,
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
    // Same reason as the legacy path above: an estimated solicitation ceiling is not
    // this award's value. Only a recorded actual, or a figure already persisted on the
    // statement, may fill this column.
    byId.set(o.audit_id, {
      audit_id: o.audit_id,
      notice_id: existing?.notice_id ?? a.notice_id,
      title: existing?.title ?? a.title,
      agency: existing?.agency ?? a.agency,
      naics_code: existing?.naics_code ?? a.naics_code,
      contract_value: o.contract_value_actual ?? existing?.contract_value ?? null,
      period: existing?.period ?? ((ov.period_of_performance as string | null) ?? null),
      awarded_at: o.outcome_recorded_at ?? existing?.awarded_at ?? a.outcome_date,
      cpars_rating: o.cpars_rating ?? existing?.cpars_rating ?? null,
      customer_relationship: o.customer_relationship_strength ?? existing?.customer_relationship ?? null
    });
  }

  const ranked = Array.from(byId.values())
    .sort((a, b) => {
      const ta = a.awarded_at ? new Date(a.awarded_at).getTime() : 0;
      const tb = b.awarded_at ? new Date(b.awarded_at).getTime() : 0;
      return tb - ta;
    });

  // HOW MANY WERE WON IS REPORTED SEPARATELY FROM HOW MANY ARE SENT.
  // The page prints one row per award and a capability statement is read in one
  // sitting, so the list is capped — but the count is not the cap. A customer with
  // 300 wins whose statement says "20 awards on file" is understating their own past
  // performance to a contracting officer, and nothing on the page told them a cap
  // existed. The cap stays; the total travels with it.
  const pastTotal = ranked.length;
  const past = ranked.slice(0, PAST_PERFORMANCE_LIMIT);

  const naicsSet = new Set<string>();
  for (const p of ranked) if (p.naics_code) naicsSet.add(String(p.naics_code));
  return { past, pastTotal, naics: Array.from(naicsSet) };
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

  const { past, pastTotal, naics } = autoRes;

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
        // NULL, not [] — the stub has not been structured, it is not structured-and-empty,
        // and the readers key on exactly that difference.
        core_competencies_json: null,
        differentiators_json: null,
        contact_name: null,
        contact_email: user.email || null,
        contact_phone: null,
        contact_website: null,
        contact_address: null,
        past_performance: past,
        created_at: null,
        updated_at: null
      },
      // THE STUB CARRIES THE SAME TWO KEYS THE SAVED BRANCH DOES.
      // Without them an editor cannot tell "nothing saved" from "read failed": the
      // client requires naics_saved to be an array and treats its absence as an
      // outage, so a brand-new account could never add its FIRST code — "Could not
      // add 541611 — nothing was changed", permanently, on a page correctly showing
      // "No NAICS codes on file". There is no row yet, so nothing is saved and
      // everything autopopulate found is a suggestion — which is exactly what the
      // saved branch computes when its list is empty.
      naics_saved: [],
      naics_derived: naics,
      past_performance_total: pastTotal,
      past_performance_limit: PAST_PERFORMANCE_LIMIT,
      naics_titles: naicsTitles(naics),
      tailored_agencies: agencyOptions(past),
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

  // WHAT IS PERSISTED, REPORTED SEPARATELY FROM WHAT IS DISPLAYED.
  // `statement.naics_codes` above is a read-time overlay: with nothing saved it shows
  // codes derived from won audits. An editor that takes the array it was handed, adds
  // one, and PATCHes the result back persists those derived codes as though the
  // customer typed them — the display becomes the record because someone added a code.
  // An editor must build its writes from `naics_saved`, which is the row and nothing
  // else. `naics_derived` is what the overlay contributed: a suggestion until acted on.
  // SUBTRACT what is already saved; do not suppress the whole set once anything is. Rule and
  // rationale live in src/lib/naics-suggestions.ts, where they can be driven by a test.
  const derived = suggestedNaics(savedNaics, naics);

  return NextResponse.json({
    statement: merged,
    naics_saved: savedNaics,
    naics_derived: derived,
    past_performance_total: pastTotal,
    past_performance_limit: PAST_PERFORMANCE_LIMIT,
    // The industry titles for the codes on THIS record. Sent from here rather than read
    // from public/naics-reference.js so the page, the clipboard copy and the PDF all
    // quote 13 CFR 121.201 through one path — and so the page does not pull a 90 KB
    // table to print three lines. A code the regulation does not carry is simply absent.
    naics_titles: naicsTitles(merged.naics_codes),
    // Editions the record can support: an agency appears only because a win with it is
    // recorded. Offering the rest would name relevance the history does not back.
    tailored_agencies: agencyOptions(past),
    stub: false
  });
}

function naicsTitles(codes: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of naicsLines(codes)) if (line.title) out[line.code] = line.title;
  return out;
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

  // A UEI edit is the moment the firm's verified eligibility can change, so re-derive it HERE rather
  // than waiting for the next Opportunities load. Two reasons this is the right seam:
  //   1. the customer finds out immediately whether SAM recognises what they typed — until now a bad
  //      UEI saved silently and only surfaced later, on a different page, as a banner;
  //   2. `attributes_v2` is what the AUDIT engine reads for set-aside eligibility. Leaving it to a page
  //      visit would mean an audit run between the save and that visit scores the firm on stale records.
  // Records are UEI-bound, so a changed UEI drops the previous firm's programs even if SAM is down.
  //
  // NEVER fails the save. The statement is already persisted and the customer's edit is not contingent
  // on SAM being reachable; `certSync` is reported so the caller can say what happened.
  let certSync: unknown = null;
  if ("uei" in body) {
    try {
      const r = await syncCertifications(supabase, user.id);
      certSync = "error" in r
        ? { state: "unverified", error: r.error }
        : { state: r.state, persisted: r.persisted, programs: r.records.map((x) => x.attr) };
    } catch (e) {
      console.error("[capability-statement] cert sync failed:", e);
      certSync = { state: "unverified", error: "sync failed" };
    }
  }

  return NextResponse.json({ statement: data, savedAt: update.updated_at, certSync });
}
