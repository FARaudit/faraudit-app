// FA-118 / FA-PIEE-01 — shared PIEE detector.
//
// Some DoD solicitations (e.g. Army ACC-DTA, AFSC procurement offices) are
// hosted in PIEE (piee.eb.mil), a DoD-only portal, rather than on SAM.gov.
// They cannot be auto-fetched via API — the customer must download the
// document manually from PIEE and upload it to FARaudit. This util is the
// single source of truth for both surfaces that need to recognize that state:
//   • FA-PIEE-01 — the Opportunities tab (proactive badge + instruction)
//   • FA-118     — the Run Audit fetch-error path (badge + instruction
//                  instead of a generic error)
//
// v1 is a hostname/substring check on piee.eb.mil. The input may be a bare
// resource URL (Opportunities row pdf_url) OR a fetch-error message that
// embedded the attempted URL (Run Audit failure reason) — a substring match
// covers both without the caller having to parse the URL out first.

export function isPieeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.toLowerCase().includes("piee.eb.mil");
}

export function getPieeInstructions(): string {
  return "This solicitation is hosted on PIEE (piee.eb.mil), a DoD-only portal. Download the document at piee.eb.mil, then upload it directly to FARaudit.";
}
