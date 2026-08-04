// CMMC level inference — extracted from the route so it can be exercised
// against real audit rows without a request context, and so the level a page
// shows always arrives with the token that produced it.

// Static CMMC reference. Levels per DoD CMMC 2.0 model.
export const LEVELS = {
  "1": {
    label: "Level 1 — Foundational",
    practices: 17,
    summary: "Basic safeguarding of FCI (Federal Contract Information). Annual self-assessment.",
    triggers: ["DFARS 252.204-7012 (limited)", "FAR 52.204-21"],
    checklist: [
      "Limit information system access to authorized users",
      "Identify users + processes acting on behalf of users",
      "Verify and control connections to + use of external systems",
      "Sanitize or destroy media before disposal",
      "Identify, report, and correct flaws in a timely manner",
      "Provide protection from malicious code at appropriate locations",
      "Update malicious code protection mechanisms when new releases are available"
    ]
  },
  "2": {
    label: "Level 2 — Advanced",
    practices: 110,
    summary: "Protects CUI (Controlled Unclassified Information). Aligned with NIST SP 800-171. Triennial third-party assessment for prioritized contracts.",
    triggers: ["DFARS 252.204-7012", "DFARS 252.204-7019", "DFARS 252.204-7020", "DFARS 252.204-7021"],
    checklist: [
      "Develop a System Security Plan (SSP) covering all 110 NIST 800-171 controls",
      "Submit SPRS score in the Supplier Performance Risk System before contract award",
      "Identify and segment all CUI flows through your network",
      "Multi-factor authentication for privileged + remote access",
      "FIPS 140-2 validated cryptography for CUI in transit + at rest",
      "Incident response plan with 72-hour DoD reporting capability",
      "Engage a C3PAO for triennial assessment if your contract requires it",
      "Annual affirmation by senior official"
    ]
  },
  "3": {
    label: "Level 3 — Expert",
    practices: 134,
    summary: "Higher protection for CUI on the most sensitive programs. Government-led assessment every 3 years.",
    triggers: ["DFARS 252.204-7012 (with critical asset designation)"],
    checklist: [
      "All Level 2 practices + 24 additional from NIST SP 800-172",
      "Advanced threat protection for APT-class adversaries",
      "Government-led assessment by DoD Cyber Crimes Center or equivalent",
      "Penetration testing performed by qualified red team",
      "Threat hunting capability with documented runbooks"
    ]
  }
};

// A level is only ever REPORTED with the token that produced it, so the page
// can show why rather than assert. The triggers are ordered strongest first
// within each level: a clause number is a fact about the solicitation, a bare
// acronym is an inference from prose.
//
// The bare acronyms carry word boundaries deliberately. `cui` as a substring
// matches inside `circuit` — and `circuit` is already present twice in this
// customer's own audit corpus, on an aircraft-parts account where it will keep
// appearing. Without \b, a machining solicitation reads as CUI-bearing and the
// page tells a contractor they need a CMMC Level 2 assessment they do not.
export const LEVEL_TRIGGERS: Array<{ level: "1" | "2" | "3"; rx: RegExp; label: string }> = [
  { level: "3", rx: /critical (asset|program)/i, label: "critical asset/program designation" },
  { level: "3", rx: /\bcmmc[-\s]*(level[-\s]*)?3\b/i, label: "CMMC Level 3 named" },
  { level: "2", rx: /252\.204-7021/, label: "DFARS 252.204-7021" },
  { level: "2", rx: /nist\s*sp\s*800-171/i, label: "NIST SP 800-171" },
  { level: "2", rx: /controlled unclassified/i, label: "controlled unclassified information" },
  { level: "2", rx: /\bcmmc[-\s]*(level[-\s]*)?2\b/i, label: "CMMC Level 2 named" },
  { level: "2", rx: /\bCUI\b/, label: "CUI" },
  { level: "1", rx: /252\.204-7012/, label: "DFARS 252.204-7012" },
  { level: "1", rx: /federal contract information/i, label: "federal contract information" },
  { level: "1", rx: /\bcmmc[-\s]*(level[-\s]*)?1\b/i, label: "CMMC Level 1 named" },
  { level: "1", rx: /\bFCI\b/, label: "FCI" }
];

export function inferLevel(audit: Record<string, unknown>): { level: "0" | "1" | "2" | "3"; trigger: string | null } {
  const compJson = (audit.compliance_json as Record<string, unknown>) || {};
  const dfarsClauses = Array.isArray(compJson.dfars_clauses) ? (compJson.dfars_clauses as string[]) : [];
  const flags = Array.isArray(compJson.dfars_flags) ? (compJson.dfars_flags as Array<Record<string, unknown>>) : [];
  // Case is preserved: \bCUI\b and \bFCI\b are the acronyms, and lowercasing
  // first would have thrown away the only thing separating them from prose.
  const allText = [
    ...dfarsClauses,
    ...flags.map((f) => `${f.clause} ${f.title}`),
    JSON.stringify(compJson).slice(0, 4000)
  ].join(" ");

  for (const t of LEVEL_TRIGGERS) {
    if (t.rx.test(allText)) return { level: t.level, trigger: t.label };
  }
  return { level: "0", trigger: null };
}
