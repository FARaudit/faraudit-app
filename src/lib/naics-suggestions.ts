/** WHAT TO OFFER A CUSTOMER, GIVEN WHAT THEY HAVE ALREADY SAVED.
 *
 *  Extracted from the capability-statement GET so it can be driven directly. The rule it
 *  replaces returned suggestions ONLY while the saved list was empty, which made the
 *  "from contracts you have won" panel an onboarding-only surface: it vanished on the
 *  first save and never returned, so a customer who won work in a NEW code the following
 *  year was never told.
 *
 *  The guarantee that rule was protecting is not weakened by subtracting instead of
 *  suppressing. The record is `naics_saved`; editors build their writes from
 *  `naics_saved`; and once the saved list is non-empty the overlay `naics_codes` IS the
 *  saved list. So a suggestion has no path into the row — it has to be added, which is
 *  the point of offering it.
 */
export function suggestedNaics(
  savedCodes: readonly unknown[] | null | undefined,
  wonCodes: readonly unknown[] | null | undefined,
): string[] {
  const norm = (v: unknown): string => String(v ?? "").trim();
  // Normalize BOTH sides before comparing. A saved "541611 " and a won "541611" are the same
  // code, and offering a customer something they already hold reads as the panel being broken.
  const saved = new Set((savedCodes ?? []).map(norm).filter(Boolean));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of wonCodes ?? []) {
    const c = norm(raw);
    if (!c || saved.has(c) || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}
