// CMMC level inference — extracted from the route so it can be exercised
// against real audit rows without a request context, and so the level a page
// shows always arrives with the token that produced it.

// Static CMMC reference. Levels per DoD CMMC 2.0 model.
export const LEVELS = {
  "1": {
    label: "Level 1 — Foundational",
    practices: 17,
    summary: "Basic safeguarding of FCI (Federal Contract Information). Annual self-assessment.",
    // 252.204-7012 is NOT a Level 1 trigger and was removed from this list. It is the covered
    // defense information safeguarding clause and it requires NIST SP 800-171 — Level 2. Level 1
    // is the FCI floor, and FAR 52.204-21 is what sets it.
    triggers: ["FAR 52.204-21"],
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
    // Level 3 is a government designation, not a phrase in a solicitation. This list used to read
    // "252.204-7012 (with critical asset designation)", which described a signal the recogniser
    // reached by matching the words "critical program" in any prose — so the panel named a
    // condition the engine could not actually establish. These two are what it can.
    triggers: ["CMMC Level 3 named in the solicitation", "NIST SP 800-172"],
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
// THE TABLE MUST AGREE WITH THE REFERENCE ABOVE. Four clauses that LEVELS names as its own
// triggers had no rule here at all — 252.204-7019, 252.204-7020 and FAR 52.204-21 — so the page
// printed them in the reference panel as the things that put you at a level while being unable
// to recognise any of them. 252.204-7020 alone is detected 21 times in the live corpus.
//
// 252.204-7012 MOVED FROM LEVEL 1 TO LEVEL 2. It is the safeguarding clause for covered defense
// information: it requires NIST SP 800-171, which is Level 2 by definition, and LEVELS["2"]
// already listed it. Reporting it as Level 1 told a contractor holding CDI that they faced a
// self-assessment against 17 practices when the obligation is 110 plus an SPRS score. Level 1 is
// FAR 52.204-21 — FCI only — which is why that clause is the one added in its place.
//
// The bare acronyms carry word boundaries deliberately. `cui` as a substring matches inside
// `circuit` — and `circuit` is already present twice in this customer's own audit corpus, on an
// aircraft-parts account where it will keep appearing. Without \b, a machining solicitation reads
// as CUI-bearing and the page tells a contractor they need a CMMC Level 2 assessment they do not.
//
// `critical (asset|program)` WAS REMOVED as a Level 3 trigger. It matched ordinary prose — "the
// critical program milestones", "mission critical program support" — and it sat first in the
// table, so any one of those outranked every clause below it and reported the highest level the
// model has. It fires zero times across the live corpus, so removing it costs no observed
// detection. Level 3 is a government designation; the honest signals for it are an explicit CMMC
// Level 3 statement or NIST SP 800-172, both of which are kept.
export const LEVEL_TRIGGERS: Array<{ level: "1" | "2" | "3"; rx: RegExp; label: string }> = [
  { level: "3", rx: /\bcmmc[-\s]*(level[-\s]*)?3\b/i, label: "CMMC Level 3 named" },
  { level: "3", rx: /nist\s*sp\s*800-172/i, label: "NIST SP 800-172" },
  { level: "2", rx: /252\.204-7021/, label: "DFARS 252.204-7021" },
  { level: "2", rx: /252\.204-7012/, label: "DFARS 252.204-7012" },
  { level: "2", rx: /252\.204-7019/, label: "DFARS 252.204-7019" },
  { level: "2", rx: /252\.204-7020/, label: "DFARS 252.204-7020" },
  { level: "2", rx: /nist\s*sp\s*800-171/i, label: "NIST SP 800-171" },
  { level: "2", rx: /controlled unclassified/i, label: "controlled unclassified information" },
  { level: "2", rx: /\bcmmc[-\s]*(level[-\s]*)?2\b/i, label: "CMMC Level 2 named" },
  { level: "2", rx: /\bCUI\b/, label: "CUI" },
  // Not preceded by a digit: DFARS numbers are 252.204-xxxx, and a bare substring match would
  // read the FAR provision out of the middle of a DFARS one.
  { level: "1", rx: /(?<!\d)52\.204-21\b/, label: "FAR 52.204-21" },
  { level: "1", rx: /federal contract information/i, label: "federal contract information" },
  { level: "1", rx: /\bcmmc[-\s]*(level[-\s]*)?1\b/i, label: "CMMC Level 1 named" },
  { level: "1", rx: /\bFCI\b/, label: "FCI" }
];

export function inferLevel(audit: Record<string, unknown>): { level: "0" | "1" | "2" | "3"; trigger: string | null } {
  const compJson = (audit.compliance_json as Record<string, unknown>) || {};
  const dfarsClauses = Array.isArray(compJson.dfars_clauses) ? (compJson.dfars_clauses as string[]) : [];
  const rawFlags = Array.isArray(compJson.dfars_flags) ? (compJson.dfars_flags as Array<Record<string, unknown>>) : [];

  // A FLAG IS A VERDICT, NOT A MENTION. Each dfars_flag carries the analyst's own `detected`
  // boolean, and a flag reading { clause: "252.204-7021", detected: false } is the finding that
  // the clause is ABSENT. Every flag used to be read for its clause number regardless, so the
  // record of a clause's absence was the evidence used to report it present.
  //
  // Measured on the live corpus: 258 of 377 flags are detected:false, and honouring the boolean
  // moves 23 of 46 audits — Level 2 falls from 31 to 11. Those twenty were being told they need a
  // 110-practice assessment, an SSP and an SPRS score on the strength of a clause their own audit
  // says is not in the solicitation. §04 of the report already filters on this same boolean, so
  // the CMMC page and the report were disagreeing about the same audit.
  //
  // dfars_clauses stays UNGATED: it is the extracted list of clauses genuinely present, and it
  // agrees with the detected flags 115 times against 1 conflict, so it is a second positive
  // source rather than a second copy of the same judgement.
  const detectedFlags = rawFlags.filter((f) => f && f.detected === true);

  // The remainder of compliance_json is real prose — verdicts, coverage, reasons — and for the
  // 16 corpus rows that carry no structured clause data it is the only text there is, so it is
  // kept. dfars_flags is destructured OUT before serialising: leaving it in would put every
  // undetected clause number back into the search text through the back door, and the serialised
  // form carries `"detected": false` as inert characters that no regex here reads as a negation.
  const { dfars_flags: _flags, dfars_clauses: _clauses, ...prose } = compJson;

  // Case is preserved: \bCUI\b and \bFCI\b are the acronyms, and lowercasing
  // first would have thrown away the only thing separating them from prose.
  //
  // NOT TRUNCATED. This was cut at 4000 characters of the serialised object while 45 of the 46
  // corpus rows exceed that and the largest is 8,714 — so for almost every audit the majority of
  // its own compliance record was unreadable to the thing classifying it, and a trigger's
  // visibility depended on where it happened to land in key order.
  const allText = [
    ...dfarsClauses,
    ...detectedFlags.map((f) => `${f.clause} ${f.title}`),
    JSON.stringify(prose)
  ].join(" ");

  for (const t of LEVEL_TRIGGERS) {
    if (t.rx.test(allText)) return { level: t.level, trigger: t.label };
  }
  return { level: "0", trigger: null };
}
