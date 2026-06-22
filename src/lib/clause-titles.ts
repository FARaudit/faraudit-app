// FA-150 — static DFARS/FAR clause-number → title lookup for the known corpus.
//
// Purpose: the §04 clause matrix renders a placeholder ("(title not extracted
// — verify in solicitation)") whenever the PDF extraction carries a clause
// NUMBER but no TITLE. On a $2,500/mo report, rows that admit extraction
// failure read as a defect. This deterministic map resolves the title for the
// clauses we actually see in the corpus — NO LLM call. Truly unknown clauses
// still fall back to the honest placeholder.
//
// Seeded from demo audit 41a2baa0 (SPRTA1-26-R-0081): the 13 DFARS trap
// clauses surfaced in its dfars_flags carry authoritative in-house titles, so
// those are reproduced here verbatim-in-spirit (expanded to the official
// clause prescription names). The remainder are the high-frequency FAR/DFARS
// clauses observed across the audit corpus.
//
// Keys are the bare clause number exactly as the extractor emits it
// ("252.204-7020", "52.212-1"). Lookup normalizes whitespace + a leading
// "FAR "/"DFARS " label before matching.

export const CLAUSE_TITLES: Record<string, string> = {
  // ── DFARS trap clauses (demo 41a2baa0 dfars_flags — authoritative) ──────────
  "252.204-7020": "NIST SP 800-171 DoD Assessment Requirements",
  "252.204-7019": "Notice of NIST SP 800-171 DoD Assessment Requirements",
  "252.227-7025": "Limitations on the Use or Disclosure of Government-Furnished Information Marked with Restrictive Legends",
  "252.225-7009": "Restriction on Acquisition of Certain Articles Containing Specialty Metals",
  "252.211-7003": "Item Unique Identification and Valuation",
  "252.223-7008": "Prohibition of Hexavalent Chromium",
  "252.204-7018": "Prohibition on the Acquisition of Covered Defense Telecommunications Equipment or Services",
  "252.204-7021": "Cybersecurity Maturity Model Certification (CMMC) Requirements",
  "252.225-7060": "Prohibition on Certain Procurements from the Xinjiang Uyghur Autonomous Region",
  "252.232-7006": "Wide Area WorkFlow Payment Instructions",
  "252.225-7001": "Buy American and Balance of Payments Program",
  "252.215-7010": "Requirements for Certified Cost or Pricing Data and Data Other Than Certified Cost or Pricing Data",
  "252.247-7023": "Transportation of Supplies by Sea",
  "5352.242-9000": "Contractor Access to Air Force Installations",

  // ── Other high-frequency DFARS clauses ──────────────────────────────────────
  "252.204-7012": "Safeguarding Covered Defense Information and Cyber Incident Reporting",
  "252.204-7017": "Prohibition on the Acquisition of Covered Defense Telecommunications Equipment or Services—Representation",
  "252.203-7000": "Requirements Relating to Compensation of Former DoD Officials",
  "252.203-7002": "Requirement to Inform Employees of Whistleblower Rights",
  "252.204-7003": "Control of Government Personnel Work Product",
  "252.204-7008": "Compliance with Safeguarding Covered Defense Information Controls",
  "252.209-7004": "Subcontracting with Firms That Are Owned or Controlled by the Government of a Country that is a State Sponsor of Terrorism",
  "252.225-7012": "Preference for Certain Domestic Commodities",
  "252.225-7048": "Export-Controlled Items",
  "252.232-7003": "Electronic Submission of Payment Requests and Receiving Reports",
  "252.232-7010": "Levies on Contract Payments",
  "252.243-7001": "Pricing of Contract Modifications",
  "252.244-7000": "Subcontracts for Commercial Products or Commercial Services",
  "252.246-7003": "Notification of Potential Safety Issues",

  // ── High-frequency FAR clauses ───────────────────────────────────────────────
  "52.212-1": "Instructions to Offerors—Commercial Products and Commercial Services",
  "52.212-3": "Offeror Representations and Certifications—Commercial Products and Commercial Services",
  "52.212-4": "Contract Terms and Conditions—Commercial Products and Commercial Services",
  "52.204-7": "System for Award Management",
  "52.204-8": "Annual Representations and Certifications",
  "52.204-24": "Representation Regarding Certain Telecommunications and Video Surveillance Services or Equipment",
  "52.204-25": "Prohibition on Contracting for Certain Telecommunications and Video Surveillance Services or Equipment",
  "52.204-26": "Covered Telecommunications Equipment or Services—Representation",
  "52.209-6": "Protecting the Government's Interest When Subcontracting with Contractors Debarred, Suspended, or Proposed for Debarment",
  "52.211-5": "Material Requirements",
  "52.214-34": "Submission of Offers in the English Language",
  "52.214-35": "Submission of Offers in U.S. Currency",
  "52.219-6": "Notice of Total Small Business Set-Aside",
  "52.219-8": "Utilization of Small Business Concerns",
  "52.225-2": "Buy American Certificate",
  "52.232-1": "Payments",
  "52.232-25": "Prompt Payment",
  "52.232-33": "Payment by Electronic Funds Transfer—System for Award Management",
  "52.233-1": "Disputes",
  "52.233-2": "Service of Protest",
  "52.246-2": "Inspection of Supplies—Fixed-Price",
  "52.249-2": "Termination for Convenience of the Government (Fixed-Price)",
  "52.249-8": "Default (Fixed-Price Supply and Service)",
};

// Stage-5 facts (2026-06-22): authoritative FAR/DFARS clause titles generated
// from the official eCFR (Title 48, issue 2026-06-02) — 7,339 clauses
// (FAR 52.x=667, DFARS 252.x=387, + agency supplements). Deterministic, $0,
// regenerate with scripts/audit-ai/gen-clause-titles.ts. The hand-curated
// CLAUSE_TITLES above stays as a fallback for the rare clause eCFR lacks.
import GENERATED_CLAUSE_TITLES from "./clause-titles.generated.json";

// Resolve a clause title. eCFR (authoritative) first, hand-curated fallback,
// then null so callers keep their honest placeholder.
export function resolveClauseTitle(clauseNumber: string | null | undefined): string | null {
  if (!clauseNumber) return null;
  const key = clauseNumber.trim().replace(/^(?:FAR|DFARS)\s+/i, "");
  return (GENERATED_CLAUSE_TITLES as Record<string, string>)[key] ?? CLAUSE_TITLES[key] ?? null;
}
