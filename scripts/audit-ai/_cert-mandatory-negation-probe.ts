// Worker for _cert-mandatory-negation. Builds the regex under whatever AUDIT_MANDATORY_NEGATION_GUARD is
// set in THIS process (the pattern is assembled at module load), then prints one JSON row per case.
export {};
import { SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "../../src/lib/audit-site-visit-patterns";
export const CASES: Array<[string, string, boolean]> = [
  // MUST STILL MATCH — a real mandatory-attendance bar. A miss here is a FALSE BID.
  ["MUST mandatory site visit",        "A mandatory site visit will be held on 12 May 2026", true],
  ["MUST attendance is mandatory",     "Attendance at the site visit is mandatory", true],
  ["MUST attendance is required",      "Attendance is required for award eligibility", true],
  ["MUST must attend",                 "Offerors must attend the pre-proposal conference", true],
  ["MUST failure->ineligible",         "Failure to attend the site visit will render an offeror ineligible", true],
  ["MUST only attendees may bid",      "Only those offerors who attended the site visit may submit a proposal", true],
  ["MUST site visit prerequisite",     "The site visit is a prerequisite to submitting a proposal", true],
  ["MUST mandatory job walk",          "A mandatory job walk is scheduled for 3 March", true],
  ["MUST FA813726R0033 verbatim",      "You must attend the Initial Site Visit for the project to be considered eligible to propose.", true],
  // MUST NOT MATCH — the leak and its neighbours. A hit here is the live fabrication.
  ["NOT  AOCSSB26R0023 verbatim",      "A NON-MANDATORY site visit will be held at the Capitol Building, room S-216", false],
  ["NOT  lowercase non-mandatory",     "a non-mandatory site visit will be held", false],
  ["NOT  spaced non mandatory",        "a non mandatory site visit will be held", false],
  ["NOT  not mandatory",               "The site visit is not mandatory but is strongly encouraged", false],
  ["NOT  FAR 52.237-1 idiom",          "Offerors are urged and expected to inspect the site", false],
  ["NOT  optional",                    "Attendance at the optional site visit is not required", false],
  ["NOT  conditional MUST register",   "To attend the site visit, all companies MUST register with the Contracting Officer", false],
];
if (process.env.PROBE_EMIT === "1") {
  const out = CASES.map(([n, t, want]) => {
    const re = new RegExp(SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i");
    return { n, want, got: re.test(t), hit: (re.exec(t) ?? [""])[0] };
  });
  console.log("__JSON__" + JSON.stringify(out));
}
