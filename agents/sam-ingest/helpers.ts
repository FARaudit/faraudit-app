// Shared SAM → pending_audits field-mapping helpers. Both the daily ingest
// (index.ts) and the one-shot backfill (backfill-fields.ts) import from here so
// the precedence rules are defined exactly once.

import type { SamOpportunity } from "./sam-client.ts";

// Agency resolution. SAM v2 search payloads no longer return department or
// subTier as standalone fields (probed 2026-05-07) — agency now arrives only
// as fullParentPathName, a dotted hierarchy like
// "INTERIOR, DEPARTMENT OF THE.NATIONAL PARK SERVICE.MWR MIDWEST REGION(60000)".
//
// Behavior:
//   1. Pick fullParentPathName first; fall back to department / subTier for
//      legacy responses or other endpoints that still emit them.
//   2. If the value is dotted, take the first two segments (department · service).
//      Single-segment values pass through unchanged.
//   3. Strip trailing parenthetical org codes from each kept segment
//      (e.g. "MWR MIDWEST REGION(60000)" → "MWR MIDWEST REGION").
//   4. Join with " · " (Unicode middle dot, surrounded by single spaces) —
//      same separator the UI uses elsewhere.
//   5. No title-casing — SAM caps stay; queued as P3 polish.
//
// Returns null only when SAM truly has nothing.
export function resolveAgency(o: SamOpportunity & { fullParentPathName?: string | null }): string | null {
  const raw =
    (o as { fullParentPathName?: string | null }).fullParentPathName ||
    o.department ||
    o.subTier ||
    null;
  if (!raw) return null;

  const stripParens = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const segments = raw.includes(".") ? raw.split(".").slice(0, 2) : [raw];
  const cleaned = segments.map(stripParens).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" · ") : null;
}

// Document-type classifier. Previously returned null for everything except
// IDIQ / BPA / Task Order / Modification — which dropped 90%+ of the daily
// feed (plain "Solicitation" / "Combined Synopsis/Solicitation" entries) into
// blank cells. Now falls back to a normalized short-form bucket so the Type
// column is always populated.
//
// Priority: contract-structure markers first (IDIQ / BPA / Task Order / Mod
// are more specific than the generic SAM "type" string and may co-occur with
// it). Then SAM canonical type strings normalized per spec. Final fallback:
// title-case the first word of the input (e.g. "RFI" → "Rfi", "Bid Notice"
// → "Bid"); empty / null inputs return "Other".
export function classifyDocType(t: string | null): string {
  const raw = (t || "").trim();
  const s = raw.toLowerCase();
  if (s.includes("idiq")) return "IDIQ";
  if (s.includes("bpa")) return "BPA";
  if (s.includes("task order")) return "TaskOrd";
  if (s.includes("modification")) return "Mod";
  if (s.includes("sources sought")) return "SrcSght";
  if (s.includes("presolicitation") || s.includes("pre-sol") || s.includes("pre sol")) return "PreSol";
  if (s.includes("combined")) return "Combined";
  if (s.includes("award")) return "Award";
  if (s.includes("solicitation")) return "RFQ"; // most common defense small-biz type
  if (!raw) return "Other";
  const first = raw.split(/[\s/,]+/)[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
