// Build a BidderProfile from a self-asserted capability statement (limit N5).
//
// SAFETY CONTRACT (CEO 2026-06-28, "conservative normalized wiring"): a capability
// statement is self-asserted and INCOMPLETE, so the profile it produces is OPEN-WORLD —
// a held attribute may CLEAR a bar, but its silence NEVER proves "fails" (no false
// INELIGIBLE). It emits ONLY recognized SOCIOECONOMIC certification tokens (the closed
// se: vocabulary). NAICS-size, security clearance, OEM/sole-source, QPL/QML and every
// structural qualification are deliberately EXCLUDED — a firm cannot self-clear those;
// they require independent confirmation and must stay "unknown" → human review. This is
// what makes the wiring incapable of a false BID via string coincidence: a bar can only
// be cleared by a recognized socioeconomic cert the firm explicitly listed.

import type { BidderProfile } from "./audit-findings";
import { canonicalizeEligibilityAttr } from "./audit-decide";

/** The subset of a capability_statements row we read. Minimal so any row satisfies it. */
export interface CapabilityProfileSource {
  certifications?: string[] | null;
}

/** Map a capability statement → an OPEN-WORLD BidderProfile, or null when nothing
 *  canonical is present (→ the engine runs exactly as the unknown-firm path). Only
 *  socioeconomic certs become tokens; everything else is ignored (never self-cleared). */
export function buildBidderProfileFromCapability(cap: CapabilityProfileSource | null | undefined): BidderProfile | null {
  const certs = cap?.certifications;
  if (!Array.isArray(certs) || certs.length === 0) return null;
  const tokens = new Set<string>();
  for (const c of certs) {
    if (typeof c !== "string") continue;
    const token = canonicalizeEligibilityAttr(c);
    if (token) tokens.add(token);
  }
  if (tokens.size === 0) return null;
  return { satisfiedAttributes: [...tokens], openWorld: true };
}
