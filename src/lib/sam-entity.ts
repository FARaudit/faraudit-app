// SAM.gov Entity Management API v3 — searches the registered-vendor list.
// Docs: https://open.gsa.gov/api/entity-api/
// Requires SAM_API_KEY env var (already provisioned for sam-ingest).
//
// HOST: sam.gov/api/prod (NOT api.sam.gov — same convention as the opportunities
// API at src/app/api/sam/route.ts:55 and agents/sam-ingest/sam-client.ts).
// Evidence: production logs (2026-05-11 15:54 UTC) showed `[sam-entity] SAM
// responded 404` on three consecutive probes — host resolution failure, not
// param validation. Switched to sam.gov/api/prod path mirroring the working
// sam-ingest client.
const BASE = "https://sam.gov/api/prod/entity-information/v3/entities";

/** One SBA certification as SAM publishes it. `certifiedUntil` is the CERTIFICATION's own expiry
 *  (certificationExitDate) — a different and usually earlier clock than the registration expiry. */
export interface SbaCertification {
  code: string | null;
  description: string;
  certifiedFrom: string | null;
  certifiedUntil: string | null;
}

export interface SamEntity {
  uei: string | null;
  legal_business_name: string | null;
  cage_code: string | null;
  primary_naics: string | null;
  naics_codes: string[];
  state: string | null;
  zip: string | null;
  business_types: string[];
  certifications: string[];
  /** The SBA rows with their own certification dates. business_types keeps only the descriptions. */
  sba_certifications: SbaCertification[];
  poc_name: string | null;
  poc_email: string | null;
  poc_phone: string | null;
  registration_status: string | null;
  registration_expiration: string | null;
}

interface SamEntityRaw {
  entityRegistration?: {
    ueiSAM?: string;
    legalBusinessName?: string;
    cageCode?: string;
    registrationStatus?: string;
    registrationExpirationDate?: string;
  };
  coreData?: {
    physicalAddress?: { stateOrProvinceCode?: string; zipCode?: string };
    // THE REAL LOCATION of SBA certification data. `sbaBusinessTypeList` sits HERE, under coreData
    // .businessTypes — NOT under a top-level `socioeconomic` key. Measured against sam.gov/api/prod
    // 2026-08-03: a v3 entity payload's top-level keys are entityRegistration, coreData, assertions,
    // pointsOfContact. There is no `socioeconomic`.
    //
    // `businessTypeList` is the SELF-CERTIFIED list the firm ticks in its own registration
    // ("A5 = Veteran-Owned Business"). It is deliberately NOT read as certification: self-asserted is
    // exactly what the eligibility floor exists to refuse. Only sbaBusinessTypeList is authoritative.
    //
    // Rows arrive with all-null fields when the firm holds no SBA certification, so nulls are filtered.
    businessTypes?: {
      businessTypeList?: Array<{ businessTypeCode?: string; businessTypeDesc?: string }>;
      sbaBusinessTypeList?: Array<{
        sbaBusinessTypeCode?: string | null;
        sbaBusinessTypeDesc?: string | null;
        certificationEntryDate?: string | null;
        certificationExitDate?: string | null;
      }>;
    };
  };
  assertions?: {
    goodsAndServices?: { primaryNaics?: string; naicsList?: Array<{ naicsCode?: string }> };
  };
  qualifications?: {
    architectsEngineersQualifications?: unknown;
  };
  pointsOfContact?: {
    governmentBusinessPOC?: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string };
  };
  socioeconomic?: {
    sbaBusinessTypeList?: Array<{ sbaBusinessTypeDesc?: string }>;
  };
  certifications?: {
    fARResponses?: Array<{ provisionId?: string; isApplicable?: boolean }>;
  };
}

function toSamEntity(raw: SamEntityRaw): SamEntity {
  const er = raw.entityRegistration || {};
  const cd = raw.coreData || {};
  const a = raw.assertions || {};
  const poc = raw.pointsOfContact?.governmentBusinessPOC || {};
  const naicsList = Array.isArray(a.goodsAndServices?.naicsList)
    ? (a.goodsAndServices?.naicsList || []).map((n) => n.naicsCode || "").filter(Boolean)
    : [];
  // Read the path the API actually serves. The previous read was `raw.socioeconomic.sbaBusinessTypeList`,
  // a key that does not exist in a v3 payload, so business_types was ALWAYS [] and every downstream
  // certification derivation was structurally unable to emit a record.
  const sbaRows = (cd.businessTypes?.sbaBusinessTypeList || []).filter((b) => (b?.sbaBusinessTypeDesc || "").trim());
  const businessTypes: string[] = sbaRows.map((b) => String(b.sbaBusinessTypeDesc).trim());
  const sbaCertifications: SbaCertification[] = sbaRows.map((b) => ({
    code: (b.sbaBusinessTypeCode || "").trim() || null,
    description: String(b.sbaBusinessTypeDesc).trim(),
    certifiedFrom: (b.certificationEntryDate || "").trim() || null,
    certifiedUntil: (b.certificationExitDate || "").trim() || null,
  }));
  return {
    uei: er.ueiSAM || null,
    legal_business_name: er.legalBusinessName || null,
    cage_code: er.cageCode || null,
    primary_naics: a.goodsAndServices?.primaryNaics || null,
    naics_codes: naicsList,
    state: cd.physicalAddress?.stateOrProvinceCode || null,
    zip: cd.physicalAddress?.zipCode || null,
    business_types: businessTypes,
    certifications: businessTypes, // SBA business types double as certifications in our UI
    sba_certifications: sbaCertifications,
    poc_name: [poc.firstName, poc.lastName].filter(Boolean).join(" ") || null,
    poc_email: poc.email || null,
    poc_phone: poc.phoneNumber || null,
    registration_status: er.registrationStatus || null,
    registration_expiration: er.registrationExpirationDate || null
  };
}

/** WHY THIS IS NOT JUST A NULLABLE FETCH. "No entity came back" has two causes that call for
 *  OPPOSITE actions from the customer: SAM was unreachable (wait — nothing is wrong with your
 *  profile) versus SAM answered and nothing is registered under that UEI (check the UEI you
 *  entered). Collapsing them tells the second customer to wait out an outage that is not
 *  happening, while their profile carries a UEI SAM has never heard of.
 *
 *  Measured on the demo profile: UEI APXDF5339KL2 returns HTTP 200 with `totalRecords: 0`.
 *  That is the SECOND case, and the collapsed version of this function reported it as the first.
 *
 *  `not-registered` covers both "SAM returned zero rows" and "SAM returned rows but none match
 *  this UEI exactly" — in both, SAM has spoken and the answer is that this UEI is not a
 *  registered entity. Exact-UEI only: a fuzzy or first-result match would attest one firm's
 *  certifications onto another firm's profile, the worst failure available on this path. */
export type EntityLookup =
  | { outcome: "found"; entity: SamEntity }
  | { outcome: "not-registered"; entity: null }
  | { outcome: "unreachable"; entity: null };

export async function lookupEntityByUei(uei: string): Promise<EntityLookup> {
  const unreachable = { outcome: "unreachable", entity: null } as const;
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return unreachable;
  const trimmed = String(uei ?? "").trim();
  // An absent UEI is the caller's own state to report, not a SAM answer about one.
  if (!trimmed) return unreachable;

  const params = new URLSearchParams({ api_key: apiKey, ueiSAM: trimmed });
  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error("[sam-entity] uei fetch failed:", err);
    return unreachable;
  }
  if (!res.ok) {
    console.error("[sam-entity] SAM responded", res.status, await res.text().catch(() => ""));
    return unreachable;
  }
  let data: { entityData?: SamEntityRaw[] } = {};
  try { data = await res.json(); } catch (err) {
    console.error("[sam-entity] uei JSON parse failed:", err);
    return unreachable;
  }
  const list = data.entityData || [];
  const hit = list.map(toSamEntity).find((e) => (e.uei || "").trim().toUpperCase() === trimmed.toUpperCase());
  return hit ? { outcome: "found", entity: hit } : { outcome: "not-registered", entity: null };
}

/** Look up ONE registered entity by its UEI. This is the customer's own record — the
 *  authoritative source for which socioeconomic programs SBA has actually registered them
 *  under, as opposed to what they typed into a capability statement. Returns null on any
 *  failure (no key, network, non-200, unparseable, no match): the caller must treat null as
 *  "not verified", never as "not certified" — absence is unknown, never a disqualifier.
 *
 *  Callers that need to tell "SAM was down" from "that UEI is not registered" want
 *  lookupEntityByUei above; this wrapper deliberately discards that distinction. */
export async function fetchEntityByUei(uei: string): Promise<SamEntity | null> {
  return (await lookupEntityByUei(uei)).entity;
}

export interface TeamingSearch {
  naics: string;
  state?: string | null;
  setAside?: string | null; // SBA business type description, e.g. "Service Disabled Veteran Owned Small Business"
  limit?: number;
}

export async function searchTeamingPartners(opts: TeamingSearch): Promise<SamEntity[]> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return [];
  if (!opts.naics) return [];

  // SAM Entity v3 param shape (May 11 2026, evidence-based via direct curl tests
  // against sam.gov/api/prod):
  //   - `pageSize`/`pageNumber` REJECTED with HTTP 400 "do not exist". REMOVED.
  //     (API returns its default page size, ~10 records. UI caps at 25 anyway.)
  //   - `primaryNaics` returned 1,424 records · `naicsCode` returned 6,299
  //     (the latter matches secondary NAICS too). For teaming, primary is more
  //     relevant — restored.
  //   - `purposeOfRegistrationCode: "Z2"` ("All Awards") added — combined with
  //     registrationStatus=A + samRegistered=Yes, narrows to 793 active
  //     federal-eligible entities for NAICS 336411.
  //   - opts.limit is now informational only; the API doesn't expose a limit
  //     param. Caller-side slice/truncate if needed.
  const params = new URLSearchParams({
    api_key: apiKey,
    primaryNaics: opts.naics,
    registrationStatus: "A", // active only
    samRegistered: "Yes",
    purposeOfRegistrationCode: "Z2" // "All Awards" — federal-contract-eligible
  });
  if (opts.state) params.set("physicalAddressStateOrProvinceCode", opts.state);
  // SAM accepts SBA-business-type descriptions in `sbaBusinessTypeCode`; pass through as a free-text filter.
  if (opts.setAside) params.set("sbaBusinessTypeCode", opts.setAside);

  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    console.error("[sam-entity] fetch failed:", err);
    return [];
  }
  if (!res.ok) {
    console.error("[sam-entity] SAM responded", res.status, await res.text().catch(() => ""));
    return [];
  }

  let data: { entityData?: SamEntityRaw[] } = {};
  try {
    data = await res.json();
  } catch (err) {
    console.error("[sam-entity] JSON parse failed:", err);
    return [];
  }
  const list = data.entityData || [];
  const mapped = list.map(toSamEntity);
  const seen = new Set<string>();
  return mapped.filter(e => {
    const key = e.uei || e.cage_code || e.legal_business_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
