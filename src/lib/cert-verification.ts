// CERT PROVENANCE — turn the customer's OWN SAM registration into verified eligibility records.
//
// WHY. `capability_statements.certifications` is a free-text tag list the customer types on /home.
// Under the legacy path those strings become eligibility tokens that CLEAR set-aside bars, so a typed
// "SDVOSB" is byte-indistinguishable from an SBA-registered one — inside a PAID audit. The engine's V2
// discipline already refuses to let a `customer_asserted` record satisfy a floored namespace
// (AUTHORITATIVE_ONLY_NS: se/setaside/sb/naics/size/…), but nothing was WRITING the authoritative
// alternative, so switching that discipline on would have made every certification inert.
//
// This is the producer. SAM's Entity Management record carries `socioeconomic.sbaBusinessTypeList` —
// the programs SBA has actually registered the firm under. That is the authoritative fact, and it
// arrives with its own time anchor (`registrationExpirationDate`), which is what the engine's
// expiry-vs-asOf veto needs to re-impose caution when a registration lapses.
//
// FAIL-CLOSED, in three places, because every failure here would be a false CLEAR:
//   1. the registration must be ACTIVE — a lapsed registration attests nothing;
//   2. the expiration must PARSE — no time anchor, no determination (the same rule the per-run size
//      path applies to receipts: a determination with no clock is the "no time dimension" vector);
//   3. an SBA business type we cannot canonicalize emits NOTHING — never a guess at what it meant.
// Every one of those returns records we simply do not emit, which lands the attribute on `unknown`,
// where the verify-caution governs. Absence is never a disqualifier.
//
// Size class is deliberately absent: `canonicalizeEligibilityAttr` only ever yields `se:*`, and stored
// size records are forbidden outright (size is computed per-run against THIS solicitation's NAICS).

import type { ProfileAttributeRecord } from "./audit-findings";
import { canonicalizeEligibilityAttr } from "./audit-decide";
import { fetchEntityByUei, type SamEntity } from "./sam-entity";

/** SAM publishes registration status as a code ("A") on some payloads and a word ("Active") on
 *  others. Both mean registered; anything else — Expired, Inactive, Submitted, Draft — does not. */
function registrationIsActive(status: string | null): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "a" || s === "active";
}

/** Derive verified eligibility records from a SAM entity record. PURE — no clock, no network: `nowIso`
 *  is the construction clock, injected so a gate can assert the output rather than a stub of it. */
export function verifiedCertRecords(
  entity: SamEntity | null | undefined,
  nowIso: string,
): ProfileAttributeRecord[] {
  if (!entity) return [];
  if (!registrationIsActive(entity.registration_status)) return [];

  // The registration's own expiry is the record's expiry: when SAM registration lapses the firm's
  // reps-and-certs are no longer attested, and the engine's expiry veto must re-impose caution on
  // exactly that date. Unparseable ⇒ emit nothing rather than an eternal record.
  const expiresAt = String(entity.registration_expiration ?? "").trim();
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) return [];

  const out: ProfileAttributeRecord[] = [];
  const seen = new Set<string>();
  for (const raw of entity.business_types ?? []) {
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    const attr = canonicalizeEligibilityAttr(raw);
    if (attr === null) continue;              // unrecognized SBA type — assert nothing
    if (seen.has(attr)) continue;
    seen.add(attr);
    out.push({ attr, source: "sam_api", verifiedAt: nowIso, expiresAt });
  }
  return out;
}

/** Fetch the customer's SAM record by UEI and derive their verified eligibility records.
 *  Returns [] on every failure path — "not verified", never "not certified". */
export async function verifyCertificationsForUei(
  uei: string | null | undefined,
  now: () => string = () => new Date().toISOString(),
): Promise<ProfileAttributeRecord[]> {
  const trimmed = String(uei ?? "").trim();
  if (!trimmed) return [];
  const entity = await fetchEntityByUei(trimmed);
  return verifiedCertRecords(entity, now());
}
