// SAM.gov Entity Management API v3 — searches the registered-vendor list.
// Docs: https://open.gsa.gov/api/entity-api/
// Requires SAM_API_KEY env var (already provisioned for sam-ingest).

const BASE = "https://api.sam.gov/entity-information/v3/entities";

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
  const socio = Array.isArray(raw.socioeconomic?.sbaBusinessTypeList)
    ? (raw.socioeconomic?.sbaBusinessTypeList || []).map((b) => b.sbaBusinessTypeDesc || "").filter(Boolean)
    : [];
  const businessTypes: string[] = socio;
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
    poc_name: [poc.firstName, poc.lastName].filter(Boolean).join(" ") || null,
    poc_email: poc.email || null,
    poc_phone: poc.phoneNumber || null,
    registration_status: er.registrationStatus || null,
    registration_expiration: er.registrationExpirationDate || null
  };
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

  const params = new URLSearchParams({
    api_key: apiKey,
    primaryNaics: opts.naics,
    registrationStatus: "A", // active only
    samRegistered: "Yes",
    samBusinessType: "1", // SAM-registered (vs. exclusion list)
    pageSize: String(opts.limit || 25),
    pageNumber: "0"
  });
  if (opts.state) params.set("physicalAddressProvinceOrStateCode", opts.state);
  // SAM accepts SBA-business-type descriptions in `sbaBusinessTypeCode`; pass through as a free-text filter.
  if (opts.setAside) params.set("sbaBusinessTypeCode", opts.setAside);

  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: { entityData?: SamEntityRaw[] } = {};
  try {
    data = await res.json();
  } catch {
    return [];
  }
  const list = data.entityData || [];
  return list.map(toSamEntity);
}
