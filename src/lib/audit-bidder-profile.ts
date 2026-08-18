// Build a BidderProfile from a self-asserted capability statement (limit N5) — plus, under
// AUDIT_PROFILE_SCHEMA_V2, the U-C construction side: provenance/expiry attribute records and
// the per-run size computation.
//
// SAFETY CONTRACT (CEO 2026-06-28, "conservative normalized wiring"): a capability
// statement is self-asserted and INCOMPLETE, so the profile it produces is OPEN-WORLD —
// a held attribute may CLEAR a bar, but its silence NEVER proves "fails" (no false
// INELIGIBLE). The legacy path emits ONLY recognized SOCIOECONOMIC certification tokens
// (the closed se: vocabulary). NAICS-size, security clearance, OEM/sole-source, QPL/QML and
// every structural qualification are deliberately EXCLUDED from self-assertion — they require
// independent confirmation.
//
// U-C V2 (panel 2026-07-29 M2): a row may carry `attributes_v2` (ProfileAttributeRecord[] —
// attr + provenance source + verifiedAt/expiresAt) and `size_facts` (raw affiliate-inclusive
// receipts/employees; 13 CFR 121.104/121.106). The builder then:
//   • validates the records (malformed dropped, jsonb nulls tolerated) and attaches them,
//   • stamps `asOf` from the CONSTRUCTION clock (this is the route layer — the engine never
//     reads a wall clock; asOf rides the profile into the run record, replay-faithful),
//   • computes size PER-RUN against THIS solicitation's NAICS via the verified SBA table:
//     small ⇒ emit `naics:<code>-small` + `sb:total` records carrying the facts' declared
//     source; not-small / unknown standard / missing fact-kind ⇒ emit NOTHING (open-world —
//     absence is unknown, never a false INELIGIBLE; a guessed threshold could flip a verdict).
// Whether a record may SATISFY stays the ENGINE's call (profileAttrSatisfiable: authoritative-
// namespace floor + expiry-vs-asOf) — the builder records provenance, it never adjudicates it.
// Flag OFF ⇒ byte-identical legacy output even when the V2 columns are populated.

import type { BidderProfile, ProfileAttributeRecord } from "./audit-findings";
import { canonicalizeEligibilityAttr } from "./audit-decide";
import { sizeStandardFor, isSmallUnder } from "./sba-size-standards";

/** The subset of a capability_statements row we read. Minimal so any row satisfies it. */
export interface CapabilityProfileSource {
  certifications?: string[] | null;
  /** U-C — jsonb column `attributes_v2`; validated here, never trusted as typed. */
  attributes_v2?: unknown;
  /** U-C — jsonb column `size_facts`; raw affiliate-inclusive facts, size computed per-run. */
  size_facts?: unknown;
}

/** Per-run construction context. `now` is the construction clock (injectable for tests). */
export interface ProfileConstructionOptions {
  solicitationNaics?: string | null;
  now?: () => string;
}

// AUDIT_PROFILE_SCHEMA_V2 is no longer read here. Deleted rather than left dangling so the
// discipline cannot be reopened by restoring one call site — see the ruling note in audit-decide.ts.
const RECORD_SOURCES = new Set(["sam_api", "sba_api", "verified_import", "customer_asserted", "document"]);
// Verification round F2: size-class namespaces may NEVER ride in via attributes_v2 — a stored
// `sb:total`/`naics:*-small`/`size:*` record is exactly the NAICS-independent derived boolean the
// per-run doctrine forbids (it would clear Total-SB bars on every solicitation regardless of the
// standard). The per-run computation below is the ONLY size source. Namespace rule, not a phrase list.
const SIZE_CLASS_NS = new Set(["sb", "size", "naics"]);
const recordNamespace = (attr: string): string => (attr.includes(":") ? attr.slice(0, attr.indexOf(":")).toLowerCase() : "");

/** Validate a jsonb attributes_v2 payload → well-formed ProfileAttributeRecord[]. Malformed rows
 *  are DROPPED (fail-safe: a record that cannot be trusted contributes nothing, it never blocks
 *  the rest); jsonb nulls on the date fields read as absent. Pure. */
function validAttributeRecords(raw: unknown): ProfileAttributeRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileAttributeRecord[] = [];
  for (const r of raw) {
    if (r === null || typeof r !== "object") continue;
    const { attr, source, verifiedAt, expiresAt } = r as Record<string, unknown>;
    if (typeof attr !== "string" || attr.trim().length === 0) continue;
    if (SIZE_CLASS_NS.has(recordNamespace(attr.trim()))) continue;  // F2 — size is per-run only, never stored
    if (typeof source !== "string" || !RECORD_SOURCES.has(source)) continue;
    if (verifiedAt !== undefined && verifiedAt !== null && typeof verifiedAt !== "string") continue;
    if (expiresAt !== undefined && expiresAt !== null && typeof expiresAt !== "string") continue;
    out.push({
      attr: attr.trim(),
      source: source as ProfileAttributeRecord["source"],
      ...(typeof verifiedAt === "string" ? { verifiedAt } : {}),
      ...(typeof expiresAt === "string" ? { expiresAt } : {}),
    });
  }
  return out;
}

/** Per-run size computation (U-C): affiliate-inclusive facts vs THIS solicitation's NAICS
 *  standard. Emits records ONLY on an affirmative small determination; every unknown
 *  (no facts / unknown NAICS / missing fact-kind / not-small) emits nothing.
 *  Freshness (verification round F5): facts without a parseable `verifiedAt` emit NOTHING —
 *  receipts drift and a firm outgrows a standard, so a size determination with no time anchor
 *  is the B1 "no time dimension" vector reintroduced. Emitted records expire one year after
 *  verification (the SAM reps-and-certs recertification cadence), so the engine's
 *  expiry-vs-asOf veto re-imposes the caution when the facts go stale. Pure. */
function sizeAttributeRecords(rawFacts: unknown, solicitationNaics: string | null | undefined): ProfileAttributeRecord[] {
  if (rawFacts === null || typeof rawFacts !== "object") return [];
  const f = rawFacts as Record<string, unknown>;
  const std = sizeStandardFor(solicitationNaics);
  if (!std) return [];
  const small = isSmallUnder(std, {
    receiptsAvg3yrUsd: f.receiptsAvg3yrAffiliateInclusiveUsd,
    employees: f.employeesAffiliateInclusive,
  });
  if (small !== true) return [];
  const verifiedMs = typeof f.verifiedAt === "string" ? Date.parse(f.verifiedAt) : NaN;
  if (Number.isNaN(verifiedMs)) return [];  // F5 — no time anchor, no size determination
  const source = typeof f.source === "string" && RECORD_SOURCES.has(f.source)
    ? (f.source as ProfileAttributeRecord["source"]) : "customer_asserted";
  const dates = { verifiedAt: f.verifiedAt as string, expiresAt: new Date(verifiedMs + 365 * 24 * 3600 * 1000).toISOString() };
  return [
    { attr: `naics:${(solicitationNaics ?? "").trim()}-small`, source, ...dates },
    { attr: "sb:total", source, ...dates },
  ];
}

/** Map a capability statement → an OPEN-WORLD BidderProfile, or null when nothing
 *  canonical is present (→ the engine runs exactly as the unknown-firm path). Legacy path:
 *  only socioeconomic certs become tokens. V2 path (flag ON + V2 columns populated): the
 *  validated records and per-run size records join the profile with provenance + asOf. */
export function buildBidderProfileFromCapability(
  cap: CapabilityProfileSource | null | undefined,
  opts?: ProfileConstructionOptions,
): BidderProfile | null {
  const tokens = new Set<string>();
  const certs = cap?.certifications;
  if (Array.isArray(certs)) {
    for (const c of certs) {
      if (typeof c !== "string") continue;
      const token = canonicalizeEligibilityAttr(c);
      if (token) tokens.add(token);
    }
  }
  // UNGATED 2026-08-08 (CEO ruling, with firmStatus). Gating CONSTRUCTION while the satisfy
  // discipline is unconditional builds a wall: the records that CAN clear a bar would never
  // reach the profile, so a SAM-verified firm and a firm asserting the same string would both
  // come back `unknown`. Refusing a claim is the ruling; refusing the proof is not.
  const v2 = [...validAttributeRecords(cap?.attributes_v2), ...sizeAttributeRecords(cap?.size_facts, opts?.solicitationNaics)];
  if (v2.length === 0) {
    // legacy shape — nothing V2 materialized on this record
    if (tokens.size === 0) return null;
    return { satisfiedAttributes: [...tokens], openWorld: true };
  }
  for (const r of v2) tokens.add(r.attr);
  return {
    satisfiedAttributes: [...tokens],
    openWorld: true,
    attributes: v2,
    asOf: (opts?.now ?? (() => new Date().toISOString()))(),
  };
}
