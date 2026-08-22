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
  "332722": { kind: "employees", maxEmployees: 600 },   // Bolt, Nut, Screw, Rivet & Washer Mfg
  "333415": { kind: "employees", maxEmployees: 1250 },  // AC / Commercial & Industrial Refrigeration Equipment Mfg
  "334290": { kind: "employees", maxEmployees: 800 },   // Other Communications Equipment Mfg
  "336411": { kind: "employees", maxEmployees: 1500 },  // Aircraft Mfg
  "336412": { kind: "employees", maxEmployees: 1500 },  // Aircraft Engine & Engine Parts Mfg
  "336413": { kind: "employees", maxEmployees: 1250 },  // Other Aircraft Part & Auxiliary Equipment Mfg
  "336414": { kind: "employees", maxEmployees: 1300 },  // Guided Missile & Space Vehicle Mfg
  // Construction / services (receipts-based, USD)
  "236220": { kind: "receipts", maxReceiptsUsd: 45_000_000 },  // Commercial & Institutional Building Construction
  // Added 2026-08-22 — the R&D corpus audits these and the table returned null, so the size bar could never
  // resolve on the two packages we stress-test most. Values read from the SAME primary source and vintage as
  // the rows above (13 CFR 121.201, govinfo CFR-2024-title13-vol1-sec121-201), cross-checked 3/3 against
  // 236220 / 332710 / 336412 already in this table before adding anything. (561730 was already present.)
  "237310": { kind: "receipts", maxReceiptsUsd: 45_000_000 },  // Highway, Street & Bridge Construction
  "336611": { kind: "employees", maxEmployees: 1300 },         // Ship Building & Repairing
  "541330": { kind: "receipts", maxReceiptsUsd: 25_500_000 },  // Engineering Services (base standard; military-program exceptions differ)
  "541511": { kind: "receipts", maxReceiptsUsd: 34_000_000 },  // Custom Computer Programming Services
  "541512": { kind: "receipts", maxReceiptsUsd: 34_000_000 },  // Computer Systems Design Services
  "541519": { kind: "receipts", maxReceiptsUsd: 34_000_000 },  // Other Computer Related Services (base standard; the 150-employee ITVAR standard is the footnote-18 exception, not this code's base)
  "561210": { kind: "receipts", maxReceiptsUsd: 47_000_000 },  // Facilities Support Services
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

/** Human-readable form of a size standard for report display: "1,250 employees" /
 *  "$25.5M avg annual receipts". Formatting only — pass a standard obtained from
 *  sizeStandardFor(); there is no unknown case here by construction. Pure. */
export function formatSizeStandard(std: SizeStandard): string {
  if (std.kind === "employees") return `${std.maxEmployees.toLocaleString("en-US")} employees`;
  return `$${std.maxReceiptsUsd / 1_000_000}M avg annual receipts`;
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
