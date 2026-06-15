// FA-119 Phase 3 gate — call-3 salvage (OUTCOME 2).
//
// REAL-DATA DISCIPLINE: the fixture is NOT hand-authored. These three findings
// are verbatim capture-manager output from a real successful run (audit
// d062ab22, call3.outcome="ok") — copied from audits.risks_json. The test
// reproduces the live failure mode (max_tokens truncation mid-array) by cutting
// the serialized JSON inside the 3rd finding, then asserts salvageRiskFindings
// recovers the COMPLETE findings that survived the cut instead of returning
// nothing (which would force the DFARS-trap boilerplate fallback).
//
// This proves the salvage MECHANISM only. It does NOT prove OUTCOME 1 (that a
// 16000-token ceiling stops truncation) or the end-to-end §05 render — those
// are provable solely by the live re-run of b91c1ac6 on the deployed build.

import { test, expect } from '@playwright/test';
import { salvageRiskFindings, validateRisksJson } from '../../src/lib/audit-engine';

// Verbatim from audit d062ab22 risks_json.risk_findings (engine schema only).
const REAL_FINDINGS = JSON.parse(`[
  {
    "title": "NAICS 561210 mismatched to construction glazing work",
    "text": "The solicitation assigns NAICS 561210 (Facilities Support Services, $47M size standard) to what is clearly a construction/glazing replacement task (PSC Z2AA — Maintenance/Repair of Office Buildings), creating a mismatch that could expose the award to a size-standard protest and may disqualify offerors who are registered under the correct construction NAICS (e.g., 238150 Glass and Glazing Contractors) but not 561210, or vice versa; offerors must verify their SAM.gov primary NAICS and SB self-certification align with 561210 before submission.",
    "category": "Disqualification",
    "citation": "FAR 19.102; Block 10 SF1449 (NAICS 561210)",
    "faraudit_action": "Confirm your SAM.gov registration lists NAICS 561210 with annual receipts under $47M; if your glazing/construction work is registered only under 238150, add 561210 to your SAM profile before the June 24 deadline or submit a question to the KO by June 16 challenging the NAICS assignment.",
    "offerorActionRequired": true
  },
  {
    "title": "UL 752 Level 8 / NIJ 0108.01 ballistic glass sourcing risk",
    "text": "The PWS (Section 1.3/1.4, dated 15 Apr 2026) mandates UL 752 Level 8 AND NIJ 0108.01 rated glazing, 2 inches thick, Solar Cooled gray reflective, with one-way visibility per UFC 4-023-07; this is a highly specialized product with very few domestic manufacturers, and lead times for certified ballistic glazing panels routinely run 8-16 weeks, which directly conflicts with the 60-calendar-day period of performance stated in the delivery schedule on Page 6.",
    "category": "Technical",
    "citation": "PWS Section 1.3/1.4; Page 6 Deliveries or Performance",
    "faraudit_action": "Before submitting, obtain written lead-time quotes from at least two UL 752 Level 8 / NIJ 0108.01 certified glazing suppliers; if lead time exceeds 30 days, price in expedite fees and include a realistic schedule in your technical plan.",
    "offerorActionRequired": false
  },
  {
    "title": "Period of performance conflict: 60 days vs. 90 days",
    "text": "The delivery schedule on Page 6 states 60 calendar days from date of award for both CLINs 0001 and 0002, while PWS Section 1.5 states Period of Performance is 90 days from Notice to Proceed; this direct contradiction means the contractor could be held to the shorter 60-day contractual delivery schedule, creating a default-for-delay risk if the contractor prices and plans to the 90-day figure.",
    "category": "Schedule",
    "citation": "Page 6 Deliveries or Performance; PWS Section 1.5",
    "faraudit_action": "Submit a written question to the KO by June 16, 2026 requesting a clarifying amendment that reconciles the 60-day CLIN delivery schedule with the 90-day PWS period of performance.",
    "offerorActionRequired": false
  }
]`);

const fullPayload = JSON.stringify({ risk_findings: REAL_FINDINGS });

test('SALVAGE-1 truncated mid-array → recovers the COMPLETE findings (not zero)', () => {
  // Reproduce a max_tokens cut INSIDE the 3rd finding: F1 + F2 complete, F3 cut.
  const f3TitlePos = fullPayload.indexOf(REAL_FINDINGS[2].title);
  const truncated = fullPayload.slice(0, f3TitlePos + 120); // no closing braces — exactly what extractJSON returns null on
  expect(truncated.endsWith('}')).toBe(false); // genuinely truncated

  const salvaged = salvageRiskFindings(truncated);
  expect(salvaged.length).toBe(2); // F1 + F2 survived; F3 dropped (incomplete)
  expect(salvaged.map((f) => f.title)).toEqual([REAL_FINDINGS[0].title, REAL_FINDINGS[1].title]);
  // a partial-but-real set passes the same validator the engine gates on
  expect(validateRisksJson({ risk_findings: salvaged }).valid).toBe(true);
  // recovered findings carry the real engine schema, not boilerplate
  expect(typeof salvaged[0].faraudit_action).toBe('string');
  expect(salvaged[0].category).toBe('Disqualification');
});

test('SALVAGE-2 complete payload → recovers all findings', () => {
  expect(salvageRiskFindings(fullPayload).length).toBe(3);
});

test('SALVAGE-3 genuinely empty / no array → recovers nothing (and validator rejects)', () => {
  expect(salvageRiskFindings('').length).toBe(0);
  expect(salvageRiskFindings('I cannot complete this request.').length).toBe(0);
  expect(validateRisksJson({ risk_findings: salvageRiskFindings('') }).valid).toBe(false);
});
