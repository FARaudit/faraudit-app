// VERIFIED CERTIFICATIONS — the customer's own SAM registration, read as eligibility.
//
// The Opportunities page needs one question answered: which set-aside pools may this firm compete
// in? The only honest answer comes from SAM's Entity Management record — the programs SBA has
// actually registered the firm under. `capability_statements.certifications` is free text the
// customer typed; it is deliberately NOT read here, because a typed "SDVOSB" is byte-identical to
// a registered one and must never clear a set-aside bar.
//
// FOUR STATES, NOT TWO. "no records" has four different causes and they are not interchangeable on
// screen: a missing UEI is a profile the customer can fix, a failed lookup is our outage, a lapsed
// registration is their renewal, and an active registration carrying no socioeconomic program is a
// real zero. Collapsing them would tell three of those four customers something untrue, so the
// state is carried out of here rather than inferred from an empty array.
//
// Eligibility is only ever NARROWED by this route's answer, and only on the five programs SAM can
// attest. Size-based pools (Total / Partial Small Business) are absent by construction: size is
// computed per-solicitation against that NAICS standard, so nothing here can screen a small-business
// set-aside out, and the page must not either.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchEntityByUei } from "@/lib/sam-entity";
import {
  verifiedCertRecords,
  establishedPrograms,
  PROGRAM_LABEL,
} from "@/lib/cert-verification";

export const dynamic = "force-dynamic";

type CertState = "no-uei" | "unverified" | "registration-inactive" | "verified";

interface CertPayload {
  state: CertState;
  uei: string | null;
  legalName: string | null;
  registrationExpires: string | null;
  records: Array<{ attr: string; label: string; expiresAt: string }>;
  establishedPrograms: string[];
  checkedAt: string;
}

// Per-instance memo so a reload does not re-hit SAM. Serverless instances are short-lived and
// numerous, so this is a courtesy to SAM's rate limit rather than a cache anyone may depend on —
// a cold instance simply fetches again, and the answer is identical either way.
const TTL_MS = 15 * 60 * 1000;
const memo = new Map<string, { at: number; payload: CertPayload }>();

function registrationIsActive(status: string | null): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "a" || s === "active";
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("capability_statements")
    .select("uei")
    .eq("user_id", user.id)
    .maybeSingle();

  // A lookup failure is not "no UEI". Say so, and let the page hold its unknown state.
  if (error) {
    return NextResponse.json(
      { error: `profile lookup failed: ${error.message}` },
      { status: 503 }
    );
  }

  const uei = String(data?.uei ?? "").trim().toUpperCase();
  const nowIso = new Date().toISOString();

  if (!uei) {
    return NextResponse.json({
      state: "no-uei", uei: null, legalName: null, registrationExpires: null,
      records: [], establishedPrograms: [], checkedAt: nowIso,
    } satisfies CertPayload);
  }

  const hit = memo.get(uei);
  if (hit && Date.now() - hit.at < TTL_MS) {
    // Expiry is re-applied against the CURRENT clock, never the clock the entity was read on: a
    // registration can lapse between the fetch and this request, and a memo that froze the
    // programs would keep clearing bars after the attestation behind them expired.
    return NextResponse.json({
      ...hit.payload,
      establishedPrograms: establishedPrograms(hit.payload.records, nowIso),
      checkedAt: nowIso,
    });
  }

  const entity = await fetchEntityByUei(uei);

  // null covers no API key, network failure, non-200, unparseable JSON and no exact-UEI match.
  // Every one of them means "we did not read it", which is not "they do not hold it".
  if (!entity) {
    return NextResponse.json({
      state: "unverified", uei, legalName: null, registrationExpires: null,
      records: [], establishedPrograms: [], checkedAt: nowIso,
    } satisfies CertPayload);
  }

  if (!registrationIsActive(entity.registration_status)) {
    return NextResponse.json({
      state: "registration-inactive", uei,
      legalName: entity.legal_business_name,
      registrationExpires: entity.registration_expiration,
      records: [], establishedPrograms: [], checkedAt: nowIso,
    } satisfies CertPayload);
  }

  const records = verifiedCertRecords(entity, nowIso);

  // An active registration whose expiry does not parse yields no records for a reason that is NOT
  // "no programs" — the determination has no clock, so it cannot be time-bounded. Distinguish it,
  // or a firm with three programs and one malformed date reads as a firm with none.
  const expiryParses = !Number.isNaN(Date.parse(String(entity.registration_expiration ?? "")));
  if (!expiryParses) {
    return NextResponse.json({
      state: "unverified", uei,
      legalName: entity.legal_business_name,
      registrationExpires: entity.registration_expiration,
      records: [], establishedPrograms: [], checkedAt: nowIso,
    } satisfies CertPayload);
  }

  const payload: CertPayload = {
    state: "verified",
    uei,
    legalName: entity.legal_business_name,
    registrationExpires: entity.registration_expiration,
    records: records.map((r) => ({
      attr: r.attr,
      label: PROGRAM_LABEL[r.attr] ?? r.attr,
      expiresAt: String(r.expiresAt ?? ""),
    })),
    establishedPrograms: establishedPrograms(records, nowIso),
    checkedAt: nowIso,
  };

  memo.set(uei, { at: Date.now(), payload });
  return NextResponse.json(payload);
}
