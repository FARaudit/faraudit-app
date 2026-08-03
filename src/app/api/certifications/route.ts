// VERIFIED CERTIFICATIONS — the customer's own SAM registration, read as eligibility.
//
// The Opportunities page needs one question answered: which set-aside pools may this firm compete
// in? The only honest answer comes from SAM's Entity Management record — the programs SBA has
// actually registered the firm under. `capability_statements.certifications` is free text the
// customer typed; it is deliberately NOT read here, because a typed "SDVOSB" is byte-identical to
// a registered one and must never clear a set-aside bar.
//
// FIVE STATES, NOT TWO. "no records" has five different causes and they are not interchangeable on
// screen: a missing UEI is a profile the customer can fix, a UEI SAM has never registered is a
// DIFFERENT profile fix, a failed lookup is our outage, a lapsed registration is their renewal, and
// an active registration carrying no socioeconomic program is a real zero. Collapsing them would
// tell four of those five customers something untrue, so the state is carried out of here rather
// than inferred from an empty array.
//
// The uei-not-found / unverified split was not theoretical. The demo profile carries a UEI that SAM
// answers for with HTTP 200 and totalRecords 0, and the collapsed version of this route told that
// customer to wait out an outage that was not happening, while their profile sat on a UEI SAM has
// never heard of. Only driving the signed-in page surfaced it.
//
// Eligibility is only ever NARROWED by this route's answer, and only on the five programs SAM can
// attest. Size-based pools (Total / Partial Small Business) are absent by construction: size is
// computed per-solicitation against that NAICS standard, so nothing here can screen a small-business
// set-aside out, and the page must not either.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { lookupEntityByUei } from "@/lib/sam-entity";
import {
  verifiedCertRecords,
  establishedPrograms,
  PROGRAM_LABEL,
} from "@/lib/cert-verification";

export const dynamic = "force-dynamic";

type CertState = "no-uei" | "uei-not-found" | "unverified" | "registration-inactive" | "verified";

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

  const lookup = await lookupEntityByUei(uei);

  // SAM ANSWERED, and the answer is that nothing is registered under this UEI. That is a fixable
  // profile problem — almost always a mistyped or stale UEI — and it must not wear the outage copy.
  if (lookup.outcome === "not-registered") {
    return NextResponse.json({
      state: "uei-not-found", uei, legalName: null, registrationExpires: null,
      records: [], establishedPrograms: [], checkedAt: nowIso,
    } satisfies CertPayload);
  }

  // We did not read it: no API key, network failure, non-200, unparseable JSON. None of these is
  // "they do not hold it", and none of them is the customer's to fix.
  if (lookup.outcome === "unreachable") {
    return NextResponse.json({
      state: "unverified", uei, legalName: null, registrationExpires: null,
      records: [], establishedPrograms: [], checkedAt: nowIso,
    } satisfies CertPayload);
  }

  const entity = lookup.entity;

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
