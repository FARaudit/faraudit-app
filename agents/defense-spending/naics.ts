// WHICH NAICS CODES THE NIGHTLY PULLS.
//
// Extracted from index.ts so it can be tested against the real implementation
// rather than a copy. index.ts opens a Supabase connection and runs a full
// nightly at import time, so anything left inside it can only be checked by a
// mirror in the test file — and a mirror passes happily while the real code
// changes underneath it. That is not hypothetical: the first version of this
// gate mirrored the union and stayed GREEN when the env var was flipped from a
// supplement into a restriction, which is the single behaviour it existed to
// protect.

export interface CapabilityStatementRow {
  naics_codes?: unknown;
}

/** Union of every customer's declared codes with an optional supplement.
 *
 *  THE SUPPLEMENT CAN ONLY ADD. If it could subtract, it would reintroduce the
 *  failure this replaced: a code list somebody typed once, going stale the
 *  moment a customer edits their profile, and expressing itself as an EMPTY
 *  market on /defense-spending rather than a wrong one — so nothing looks
 *  broken and nobody finds out. */
export function unionNaicsCodes(
  rows: CapabilityStatementRow[] | null,
  extra: string[] = []
): string[] {
  const fromCustomers = new Set<string>();
  for (const row of rows ?? []) {
    const raw = row?.naics_codes;
    // Both shapes are tolerated on purpose — the column has carried a text[]
    // and a comma-joined string. An unrecognised shape contributes nothing
    // rather than throwing: one malformed profile must not stop every other
    // customer's market from refreshing.
    if (Array.isArray(raw)) {
      for (const c of raw) { const s = String(c).trim(); if (s) fromCustomers.add(s); }
    } else if (typeof raw === "string") {
      for (const s of raw.split(",").map((x) => x.trim())) { if (s) fromCustomers.add(s); }
    }
  }
  return [...new Set([...fromCustomers, ...extra])].sort();
}

/** How many distinct codes the customers themselves declared — reported
 *  separately from the total so a log line can distinguish "no customers" from
 *  "customers, plus a supplement". */
export function customerCodeCount(rows: CapabilityStatementRow[] | null): number {
  return unionNaicsCodes(rows, []).length;
}
