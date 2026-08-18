// TAILORING IS SELECTION AND ORDERING. IT NEVER WRITES ANYTHING.
//
// CEO ruling, 2026-08-09. An agency-specific edition reorders what the customer has
// already recorded so the work most relevant to that buyer is what a contracting officer
// reads first. It does not rewrite core competencies, it does not generate claims, and
// it does not add a sentence the customer did not type. A model-written assertion about
// a firm's capabilities, printed on paper that firm sends under its own name, is a
// fabricated claim with their signature on it.
//
// WHY THE AGENCY LIST COMES FROM THE AWARD HISTORY AND NOWHERE ELSE. Offering the full
// list of federal agencies would let a customer produce a "U.S. Navy edition" for a Navy
// they have never worked with — a document identical to the default but named in a way
// that implies relevance it does not have. An agency appears here only because the
// customer has recorded a win with it, so every edition on offer differs from the
// default in a way the record can support.

export interface PastRow {
  agency?: string | null;
  awarded_at?: string | null;
  [key: string]: unknown;
}

export interface AgencyOption {
  agency: string;
  /** How many recorded awards name this agency. Counted, never asserted. */
  count: number;
}

/** Agencies the customer has actually won with, most-awarded first. */
export function agencyOptions(past: unknown): AgencyOption[] {
  if (!Array.isArray(past)) return [];
  const counts = new Map<string, number>();
  for (const row of past as PastRow[]) {
    const agency = String(row?.agency ?? "").trim();
    if (!agency) continue;
    counts.set(agency, (counts.get(agency) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([agency, count]) => ({ agency, count }))
    .sort((a, b) => (b.count - a.count) || a.agency.localeCompare(b.agency));
}

/**
 * The award list reordered for one agency: its awards first, everything else after, each
 * group keeping the order it arrived in (the route already sorted by recency).
 *
 * A STABLE PARTITION, NOT A FILTER. Dropping the other awards would hide a firm's own
 * past performance from the document — the point is which work leads, not which work
 * exists. An unrecognised agency returns the list untouched rather than an empty one.
 */
export function orderForAgency<T extends PastRow>(past: T[] | null | undefined, agency: string | null | undefined): T[] {
  const rows = Array.isArray(past) ? past : [];
  const want = String(agency ?? "").trim().toLowerCase();
  if (!want) return rows.slice();
  const match: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    (String(row?.agency ?? "").trim().toLowerCase() === want ? match : rest).push(row);
  }
  return match.length ? [...match, ...rest] : rows.slice();
}

/**
 * The agency to tailor for, validated against what the record can support. A caller can
 * put anything in a query string; an edition is only honoured when the customer has a
 * recorded award with that agency, so the name printed on the document is one their own
 * history backs. Returns null for everything else, which yields the default edition.
 */
export function resolveAgency(past: unknown, requested: string | null | undefined): string | null {
  const want = String(requested ?? "").trim().toLowerCase();
  if (!want) return null;
  const found = agencyOptions(past).find((o) => o.agency.toLowerCase() === want);
  return found ? found.agency : null;
}
