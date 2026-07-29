// SBA small business size standards — curated subset of 13 CFR 121.201.
//
// Every value below was extracted from the PRIMARY SOURCE (SBA "Table of Size Standards",
// effective 2023-03-17 — the current version per sba.gov/document/support-table-size-standards
// as of 2026-07-29), not from memory. A NAICS code absent from this table yields null, and the
// caller MUST emit no size attribute for it (honest-fail: unknown → the eligibility caution
// stands; a guessed threshold could flip a verdict). Receipts thresholds are affiliate-inclusive
// average annual receipts (13 CFR 121.104); employee thresholds are affiliate-inclusive
// (13 CFR 121.106). The solicitation's own stated standard governs when it differs — this table
// is a fallback for computing the firm-side fact, never a substitute for the document.
export const SBA_TABLE_EFFECTIVE = "2023-03-17";

export type SizeStandard =
  | { kind: "receipts"; maxReceiptsUsd: number }   // average annual receipts ceiling, USD
  | { kind: "employees"; maxEmployees: number };

const TABLE: Record<string, SizeStandard> = {
  // Manufacturing (employee-based)
  "332710": { kind: "employees", maxEmployees: 500 },   // Machine Shops
  "332721": { kind: "employees", maxEmployees: 500 },   // Precision Turned Product Mfg
  "333415": { kind: "employees", maxEmployees: 1250 },  // AC / Commercial & Industrial Refrigeration Equipment Mfg
  "334290": { kind: "employees", maxEmployees: 800 },   // Other Communications Equipment Mfg
  "336413": { kind: "employees", maxEmployees: 1250 },  // Other Aircraft Part & Auxiliary Equipment Mfg
  // Construction / services (receipts-based, USD)
  "236220": { kind: "receipts", maxReceiptsUsd: 45_000_000 },  // Commercial & Institutional Building Construction
  "541330": { kind: "receipts", maxReceiptsUsd: 25_500_000 },  // Engineering Services (base standard; military-program exceptions differ)
  "541511": { kind: "receipts", maxReceiptsUsd: 34_000_000 },  // Custom Computer Programming Services
  "561320": { kind: "receipts", maxReceiptsUsd: 34_000_000 },  // Temporary Help Services
  "561720": { kind: "receipts", maxReceiptsUsd: 22_000_000 },  // Janitorial Services
  "561730": { kind: "receipts", maxReceiptsUsd: 9_500_000 },   // Landscaping Services
  "811210": { kind: "receipts", maxReceiptsUsd: 34_000_000 },  // Electronic & Precision Equipment Repair & Maintenance
};

/** The size standard for a NAICS code, or null when this curated table does not carry it.
 *  Null means UNKNOWN — the caller must not guess. Pure. */
export function sizeStandardFor(naics: string | null | undefined): SizeStandard | null {
  const code = (naics ?? "").trim();
  return /^\d{6}$/.test(code) ? TABLE[code] ?? null : null;
}

/** Whether a firm with these affiliate-inclusive facts is small under `std`. Facts that are not
 *  finite non-negative numbers yield null (unknown — never a guess). Pure. */
export function isSmallUnder(std: SizeStandard, facts: { receiptsAvg3yrUsd?: unknown; employees?: unknown }): boolean | null {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  if (std.kind === "receipts") {
    const r = num(facts.receiptsAvg3yrUsd);
    return r === null ? null : r <= std.maxReceiptsUsd;
  }
  const e = num(facts.employees);
  return e === null ? null : e <= std.maxEmployees;
}
