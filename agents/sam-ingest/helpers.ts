// Shared SAM → pending_audits field-mapping helpers. Both the daily ingest
// (index.ts) and the one-shot backfill (backfill-fields.ts) import from here so
// the precedence rules are defined exactly once.

import type { SamOpportunity } from "./sam-client.ts";

// Agency precedence: department first (the canonical top-level agency on most
// opportunities), then subTier (set on DLA/DoD micro-purchase items where
// department is empty), then fullParentPathName (the dotted breadcrumb string
// used as last-resort label, e.g. "DEPT OF DEFENSE.DEPT OF THE ARMY.AMC").
//
// Returns null only when SAM truly has nothing — keeps the UI fallback to "—"
// reachable but rare.
export function resolveAgency(o: SamOpportunity & { fullParentPathName?: string | null }): string | null {
  return (
    o.department ||
    o.subTier ||
    (o as { fullParentPathName?: string | null }).fullParentPathName ||
    null
  );
}

// Document-type classifier. Previously returned null for everything except
// IDIQ / BPA / Task Order / Modification — which dropped 90%+ of the daily
// feed (plain "Solicitation" / "Combined Synopsis/Solicitation" entries) into
// blank cells. Now falls back to a normalized short-form bucket so the Type
// column is always populated.
export function classifyDocType(t: string | null): string {
  const s = (t || "").toLowerCase();
  if (s.includes("idiq")) return "IDIQ";
  if (s.includes("bpa")) return "BPA";
  if (s.includes("task order")) return "TaskOrd";
  if (s.includes("modification")) return "Mod";
  if (s.includes("sources sought")) return "SrcSght";
  if (s.includes("presolicitation") || s.includes("pre-sol") || s.includes("pre sol")) return "PreSol";
  if (s.includes("combined")) return "Combined";
  if (s.includes("solicitation")) return "Sol";
  if (s.includes("special notice")) return "Special";
  if (s.includes("award")) return "Award";
  return "Other";
}
