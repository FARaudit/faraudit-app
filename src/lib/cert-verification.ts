// CERT PROVENANCE — turn the customer's OWN SAM registration into verified eligibility records.
//
// WHY. `capability_statements.certifications` is a free-text tag list the customer types on /home.
// Under the legacy path those strings become eligibility tokens that CLEAR set-aside bars, so a typed
// "SDVOSB" is byte-indistinguishable from an SBA-registered one — inside a PAID audit. The engine's V2
// discipline already refuses to let a `customer_asserted` record satisfy a floored namespace
// (AUTHORITATIVE_ONLY_NS: se/setaside/sb/naics/size/…), but nothing was WRITING the authoritative
// alternative, so switching that discipline on would have made every certification inert.
//
// This is the producer. SAM's Entity Management record carries the programs SBA has actually certified
// the firm under at `coreData.businessTypes.sbaBusinessTypeList`. Measured against sam.gov/api/prod on
// 2026-08-03, the vocabulary is exactly FIVE codes — an exhaustive sweep of all 1,296 two-character
// combinations returned no others:
//     A6  SBA Certified 8(a) Program Participant                          (4,933 firms)
//     JT  SBA Certified 8(a) Joint Venture                                  (773)
//     XX  SBA Certified HUBZone Firm                                      (4,586)
//     A9  SBA-Certified Women-Owned Small Business                       (13,386)
//     A0  SBA-Certified Economically Disadvantaged Women-Owned Small Business (4,089)
//
// THERE IS NO SDVOSB CODE. Service-disabled veteran status is certified through VA VetCert, not SBA,
// and does not appear in this list at all. So this source can NEVER establish se:sdvosb or se:vosb —
// which means no consumer may treat their absence here as evidence a firm lacks them.
//
// Each row carries its own `certificationExitDate`, a different and usually earlier clock than the
// registration expiry, and the record takes the EARLIER of the two.
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

  // TWO CLOCKS, AND THE RECORD EXPIRES ON THE EARLIER. The registration expiry bounds the whole
  // registration; `certificationExitDate` bounds THIS certification, and it is usually the earlier of
  // the two (an 8(a) term runs nine years, a HUBZone certification three, on their own cycles). Taking
  // only the registration date would keep asserting a program whose certification had already lapsed —
  // an over-claim in the one direction that clears a set-aside bar.
  const rows = entity.sba_certifications ?? [];
  const byDescription = new Map<string, string | null>();
  for (const c of rows) byDescription.set(c.description, c.certifiedUntil);

  const out: ProfileAttributeRecord[] = [];
  const seen = new Set<string>();
  for (const raw of entity.business_types ?? []) {
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    const attr = canonicalizeEligibilityAttr(raw);
    if (attr === null) continue;              // unrecognized SBA type — assert nothing
    if (seen.has(attr)) continue;

    const certUntil = byDescription.get(raw.trim()) ?? null;
    let effective = expiresAt;
    if (certUntil) {
      const c = Date.parse(certUntil);
      // An unparseable certification date is not a licence to fall back to the longer clock — it is a
      // determination with no time anchor, and those emit nothing (the same rule as a missing
      // registration expiry, one paragraph up).
      if (Number.isNaN(c)) continue;
      if (c < Date.parse(expiresAt)) effective = certUntil;
    }
    seen.add(attr);
    out.push({ attr, source: "sam_api", verifiedAt: nowIso, expiresAt: effective });
  }
  return out;
}

/** Display label per canonical program. The Opportunities banner names the programs SBA has
 *  registered the firm under, so the label space is exactly the attr space this file emits. */
export const PROGRAM_LABEL: Readonly<Record<string, string>> = {
  "se:8a": "8(a)",
  "se:hubzone": "HUBZone",
  "se:sdvosb": "SDVOSB",
  "se:edwosb": "EDWOSB",
  "se:wosb": "WOSB",
  "se:vosb": "VOSB",
};

/** ONE-WAY program containment. An EDWOSB firm is a WOSB firm by definition, and an SDVOSB is a
 *  VOSB, so a registration under the narrower program also establishes eligibility for the wider
 *  pool. The converse is FALSE in both pairs and must never be added: a WOSB is not economically
 *  disadvantaged, and a VOSB is not service-disabled. 8(a) and HUBZone contain nothing.
 *
 *  This is the only place eligibility is WIDENED, so it is the only place a wrong entry could
 *  clear a bar the firm does not hold. */
const PROGRAM_IMPLIES: Readonly<Record<string, readonly string[]>> = {
  "se:edwosb": ["se:wosb"],
  "se:sdvosb": ["se:vosb"],
};

/** The programs a record set establishes AS OF `nowIso` — expiry applied, containment expanded.
 *
 *  A record whose expiry has passed establishes nothing: SAM registration lapsed, so the
 *  reps-and-certs behind it are no longer attested. It is dropped rather than downgraded, which
 *  lands the program on "not established" — where absence is never a disqualifier, only a
 *  non-clear. Pure; `nowIso` is injected so a gate asserts the output, not a stub of the clock. */
export function establishedPrograms(
  // The structural minimum this needs, so a caller holding the serialized shape
  // (attr + expiry, provenance already applied upstream) can pass it directly
  // rather than casting a narrower object into a record it is not.
  records: readonly { attr: string; expiresAt?: string | null }[] | null | undefined,
  nowIso: string,
): string[] {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) return [];
  const out = new Set<string>();
  for (const r of records ?? []) {
    if (!r || typeof r.attr !== "string") continue;
    const exp = Date.parse(String(r.expiresAt ?? ""));
    if (Number.isNaN(exp) || exp <= now) continue;
    out.add(r.attr);
    for (const implied of PROGRAM_IMPLIES[r.attr] ?? []) out.add(implied);
  }
  return [...out].sort();
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
