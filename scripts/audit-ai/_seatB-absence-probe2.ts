// SEAT B round 2 — widen each confirmed root and test naturalistic lens prose.
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;
const PWS = doc("PWS KO Approved - 20260720.pdf", "PWS BODY. ".repeat(200));
const WD4281 = doc("Wage Determination 2015-4281 Rev 22.pdf", "WD BODY. ".repeat(200));
const SCHED = doc("Attachment 2 - Pricing Schedule.pdf", "CLIN TABLE. ".repeat(200));
const EXH1 = doc("Exhibit 1 - Government Furnished Property.pdf", "GFP. ".repeat(200));
const ANNEX1 = doc("Annex 1 - Security Requirements.pdf", "SEC. ".repeat(200));

type C = { label: string; src: string; claim: string; prov?: string[]; sa?: string | null; expect: "STAND DOWN" | "fire"; why: string };

const cases: C[] = [
  // ROOT A — elided copula in the coordinate clause (gap ≤5 words, no is/are/was/were)
  { label: "A4 PWS present, WD missing — 'the wage determination not provided'", src: PWS,
    claim: "The PWS is attached, the wage determination not provided.", prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN", why: "the WD is genuinely absent from this source" },
  { label: "A5 with REPORT-TRUTH #2 prefix", src: PWS,
    claim: "UNVERIFIED ABSENCE — The PWS is present, drawings not furnished.", prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN", why: "about the drawings" },
  { label: "A6 'was' variant", src: PWS,
    claim: "The PWS was posted but Attachment C not included.", prov: [],
    expect: "STAND DOWN", why: "about Attachment C" },
  { label: "A7 gap of exactly 5 words", src: PWS,
    claim: "The PWS is here but the required security annex not provided.", prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN", why: "about the security annex" },

  // ROOT B — digits are not residue
  { label: "B3 Annex 2 vs Annex 1 in source", src: ANNEX1,
    claim: "Annex 2 is not provided, so the classification level is unknown.", prov: [],
    expect: "STAND DOWN", why: "Annex 2 genuinely absent" },
  { label: "B4 Exhibit 2 (analyzed-arm wording)", src: EXH1,
    claim: "Exhibit 2 is not attached.", prov: ["Exhibit 1 - Government Furnished Property.pdf"],
    expect: "STAND DOWN", why: "Exhibit 2 genuinely absent" },
  { label: "B5 second WD for a different county", src: WD4281,
    claim: "Wage Determination 2015-4517 is not included in the package.", prov: ["Wage Determination 2015-4281 Rev 22.pdf"],
    expect: "STAND DOWN", why: "a second, genuinely-absent WD" },

  // ROOT C — a second, TRUE absence claim in the same requirement is discarded
  { label: "C4 true second claim, no em-dash", src: PWS,
    claim: "PWS (Attachment 0001) is referenced but not provided. The Wage Determination is also not provided, so SCA rates cannot be priced.",
    prov: ["PWS KO Approved - 20260720.pdf"], expect: "fire", why: "watch sentence 2" },
  { label: "C5 same, but with an em-dash consequence", src: PWS,
    claim: "PWS (Attachment 0001) is referenced but not provided — note also that the Wage Determination is absent, so SCA rates cannot be priced.",
    prov: ["PWS KO Approved - 20260720.pdf"], expect: "fire", why: "control: does the dash preserve it?" },

  // ROOT D — parenthetical stripping removes the real subject
  { label: "D3 parenthesised subject, realistic", src: PWS,
    claim: "(Drawings referenced in the PWS) are not provided with this solicitation.", prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN", why: "about the drawings" },

  // ROOT E — common-word token collision across two different 'schedules'
  { label: "E2 delivery schedule vs Pricing Schedule attachment", src: SCHED,
    claim: "The schedule is not provided, so period-of-performance dates are unknown.", prov: ["Attachment 2 - Pricing Schedule.pdf"],
    expect: "STAND DOWN", why: "the DELIVERY schedule is what is missing; a pricing schedule is present" },

  // ROOT F — set-aside arm has no subject-residue check at all
  { label: "F5 NAICS code unstated", src: PWS, sa: "Total Small Business",
    claim: "The NAICS code for this set-aside is not identified.", prov: [], expect: "STAND DOWN", why: "NAICS genuinely unstated" },
  { label: "F6 size standard unstated", src: PWS, sa: "WOSB",
    claim: "The set-aside size standard is not specified.", prov: [], expect: "STAND DOWN", why: "size standard genuinely unstated" },
  { label: "F7 set-aside eligibility docs unstated", src: PWS, sa: "HUBZone",
    claim: "Required set-aside certifications are not specified.", prov: [], expect: "STAND DOWN", why: "cert requirements genuinely unstated" },
  { label: "F8 multi-sentence collateral deletion", src: PWS, sa: "8(a)",
    claim: "The set-aside is not stated. Proposals are due 15 August 2026 at 2:00 PM ET. The bonding requirement is not specified. Offerors must attend the site visit.",
    prov: [], expect: "fire", why: "watch which sentences survive" },
];

for (const c of cases) {
  const r = reconcileAbsenceClaims([{ id: "F1", requirement: c.claim }], c.src, new Set(c.prov ?? []), c.sa ?? null);
  const didFire = r.refuted.length > 0;
  const bad = (c.expect === "STAND DOWN" && didFire) || (c.expect === "fire" && !didFire);
  console.log(`\n${bad ? "### DEFECT" : "ok      "}  ${c.label}   [expect ${c.expect} / actual ${didFire ? "FIRED" : "stood down"}]`);
  console.log(`   IN : ${JSON.stringify(c.claim)}`);
  if (didFire) console.log(`   OUT: ${JSON.stringify(r.findings[0].requirement)}`);
  console.log(`   why: ${c.why}`);
}
