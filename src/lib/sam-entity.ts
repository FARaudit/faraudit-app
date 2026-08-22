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

/* THE KEY RIDES IN THE QUERY STRING, SO NOTHING MAY LOG THE REQUEST.
 * A Node fetch rejection carries the full request URL in its message, and this module puts
 * `api_key` in that URL — so `console.error(..., err)` prints the SAM key into production logs.
 * Four calls in this file did exactly that. Errors are reduced to a name and a redacted message
 * before they are ever printed. Fix the reach, never the declaration. */
function safeErr(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  const msg = err instanceof Error ? err.message : String(err);
  return `${name}: ${msg.replace(/api_key=[^&\s]*/gi, "api_key=[redacted]")}`;
}


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
    console.error("[sam-entity] uei fetch failed:", safeErr(err));
    return unreachable;
  }
  if (!res.ok) {
    console.error("[sam-entity] SAM responded", res.status);  // status only — an upstream body can echo the key
    return unreachable;
  }
  let data: { entityData?: SamEntityRaw[] } = {};
  try { data = await res.json(); } catch (err) {
    console.error("[sam-entity] uei JSON parse failed:", safeErr(err));
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

/** The SBA certifications SAM's entity search can actually filter on.
 *
 *  `sbaBusinessTypeCode` takes the CODE, not the description. Passing a description returns
 *  HTTP 200 with zero records — a fabricated "nothing matched", not an error. The previous
 *  code passed descriptions, so a set-aside filter could only ever report an empty market.
 *
 *  Every pair below was read back from live SAM, not assumed. Measured totals at the time of
 *  writing: A6 4,863 · A9 13,127 · XX 4,526 · A0 4,024 · JT 777. Codes that look plausible and
 *  return nothing on this parameter: A2, A5, QF, 8W, 27, 23.
 *
 *  THIS LIST IS COMPLETE, AND SDVOSB IS DELIBERATELY ABSENT. SAM's sbaBusinessTypeList carries
 *  SBA *certifications* only. Service-disabled veteran status appears in the sibling
 *  businessTypeList as self-certified code QF, which is the list toSamEntity deliberately does
 *  not read as certification. Offering an SDVOSB filter here would either return nothing or
 *  attest a self-assertion as an SBA certification. */
/* ── FINDING YOUR OWN SAM RECORD ──────────────────────────────────────────────
 *
 * WHY THIS EXISTS. `syncCertifications` reads the firm's SBA-registered certifications from SAM
 * and is already built — but it keys on a UEI, and nothing ever acquires one. Measured on the
 * live profile: `uei`, `cage_code` and `sam_registration_status` are all NULL, so the sync has
 * never had anything to run on and `attributes_v2` is empty. Five of the nine ruled title-block
 * cells render blank for the same reason, and FPDS past performance has no key at all.
 *
 * ⛔ THIS RETURNS CANDIDATES. IT NEVER BINDS ONE. The sibling lookupEntityByUei refuses a fuzzy
 * or first-result match because "a fuzzy or first-result match would attest one firm's
 * certifications onto another firm's profile, the worst failure available on this path." A name
 * search is fuzzy BY CONSTRUCTION — "Precision Machine" matches many real firms — so the same
 * rule applies with more force: the customer confirms which record is theirs, and only that
 * confirmation writes a UEI. Auto-picking the top hit would silently clear a set-aside bar using
 * someone else's certifications.
 *
 * ⛔ QUOTA. The entity API has a SMALL DAILY allowance that resets at 00:00 UTC — a handful of
 * large calls exhausts it for everyone. So this is an explicit, user-initiated search only. It
 * must never run on page load, on a keystroke, or on a loop.
 *
 * `total` is SAM's own totalRecords, not the length of `candidates`: the v3 search rejects
 * pageSize, so it returns roughly ten rows regardless. Showing ten of four hundred without
 * saying so states a sample as if it were the answer. */
export type EntityNameSearch =
  | { outcome: "ok"; candidates: SamEntity[]; total: number }
  | { outcome: "too-short"; candidates: null }
  | { outcome: "unconfigured"; candidates: null }
  | { outcome: "unreachable"; candidates: null };

export async function searchEntitiesByName(name: string): Promise<EntityNameSearch> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return { outcome: "unconfigured", candidates: null };
  const q = String(name ?? "").trim();
  /* A one- or two-character query would burn a quota call to return the whole register. The
     floor is ours to state, not SAM's to refuse. */
  if (q.length < 3) return { outcome: "too-short", candidates: null };

  const params = new URLSearchParams({ api_key: apiKey, legalBusinessName: q, registrationStatus: "A" });
  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error("[sam-entity] name search fetch failed:", safeErr(err));
    return { outcome: "unreachable", candidates: null };
  }
  if (!res.ok) {
    console.error("[sam-entity] SAM responded", res.status);  // status only — a body can echo the key
    return { outcome: "unreachable", candidates: null };
  }
  let data: { entityData?: SamEntityRaw[]; totalRecords?: number } = {};
  try { data = await res.json(); } catch (err) {
    console.error("[sam-entity] name search JSON parse failed:", safeErr(err));
    return { outcome: "unreachable", candidates: null };
  }
  const candidates = (data.entityData || []).map(toSamEntity).filter((e) => Boolean(e.uei));
  /* A zero here is a REAL answer — SAM has no active registration under that name — and is not
     the same as the outage above. The caller must render them differently. */
  return { outcome: "ok", candidates, total: Number(data.totalRecords ?? candidates.length) };
}

export const SBA_SET_ASIDES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "A6", label: "SBA Certified 8(a) Program Participant" },
  { code: "A9", label: "SBA-Certified Women-Owned Small Business" },
  { code: "XX", label: "SBA Certified HUBZone Firm" },
  { code: "A0", label: "SBA-Certified Economically Disadvantaged Women-Owned Small Business" },
  { code: "JT", label: "SBA Certified 8(a) Joint Venture" }
];

export function isKnownSetAside(code: string): boolean {
  return SBA_SET_ASIDES.some((s) => s.code === code);
}

export interface TeamingSearch {
  naics: string;
  state?: string | null;
  setAside?: string | null; // an SBA_SET_ASIDES code, e.g. "A6" — never a description
  limit?: number;
}

/** Same discrimination as EntityLookup above, for the same reason, on the search path.
 *
 *  This function used to return `[]` on every failure — no key, network throw, non-2xx,
 *  unparseable body. Its one caller maps an empty list to `reason: "no-partners"`, which the
 *  page renders as "SAM answered and returned no active registrations under your primary
 *  codes." So a SAM outage was reported to the customer as a positive statement about the
 *  market: that nobody is registered under their codes. The action that invites — stop
 *  looking for partners — is the opposite of the correct one, which is to try again later.
 *
 *  The sibling lookupEntityByUei, twenty lines up, already drew this distinction and
 *  documented why. The rot was in the function next to the fixed one.
 *
 *  `total` is SAM's own totalRecords — how many active registrations exist under this code,
 *  NOT how many are in `partners`. Measured live 2026-08-09: primaryNaics=332710 answers
 *  totalRecords 4384 and returns 10 rows. The v3 search rejects pageSize/pageNumber, so ten
 *  is the whole page the API will give. A page that shows those ten and says nothing states
 *  an arbitrary 0.2% sample as if it were the market — the same invented-absence defect as
 *  the one above, one floor down. The caller must carry this number to the surface. */
export type TeamingSearchResult =
  | { outcome: "ok"; partners: SamEntity[]; total: number }
  | { outcome: "unconfigured"; partners: null }
  | { outcome: "unreachable"; partners: null };

export async function searchTeamingPartners(opts: TeamingSearch): Promise<TeamingSearchResult> {
  const unreachable = { outcome: "unreachable", partners: null } as const;
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return { outcome: "unconfigured", partners: null };
  // An absent NAICS is the caller's own state to report, not a SAM answer about one.
  if (!opts.naics) return { outcome: "unconfigured", partners: null };

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
    console.error("[sam-entity] fetch failed:", safeErr(err));
    return unreachable;
  }
  if (!res.ok) {
    console.error("[sam-entity] SAM responded", res.status);  // status only — an upstream body can echo the key
    return unreachable;
  }

  let data: { entityData?: SamEntityRaw[]; totalRecords?: number } = {};
  try {
    data = await res.json();
  } catch (err) {
    console.error("[sam-entity] JSON parse failed:", safeErr(err));
    return unreachable;
  }
  const list = data.entityData || [];
  const mapped = list.map(toSamEntity);
  const seen = new Set<string>();
  // A zero-length list here is a real answer from SAM and stays `ok` — a quiet market must
  // still be reportable, or this becomes a fail-everything machine.
  const partners = mapped.filter(e => {
    const key = e.uei || e.cage_code || e.legal_business_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Fall back to the row count, never to 0: an absent totalRecords must not make a capped
  // page look complete.
  const total = typeof data.totalRecords === "number" ? data.totalRecords : partners.length;
  return { outcome: "ok", partners, total };
}
