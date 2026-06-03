/* FARaudit · FAR/DFARS Updates (best-in-class) — data. Illustrative mock. */
window.FARD = (function () {
  // type: DFARS (252.x) | FAR (52.x) | Deviation ; impact: HIGH|MEDIUM|LOW
  const UPDATES = [
    { clause: '252.204-7021', title: 'CMMC Requirements', type: 'DFARS', date: '2026-03-15', impact: 'HIGH', summary: 'Level 2 certification threshold lowered to contracts >$100K with CUI.', insight: '7 of your tracked solicitations now require CMMC Level 2. Assess readiness before bidding.', affects: 7, diff: { before: 'Contractor shall have a current CMMC Level 2 certificate for contracts exceeding $250,000 involving covered defense information.', after: 'Contractor shall have a current CMMC Level 2 certificate for contracts exceeding $100,000 involving controlled unclassified information (CUI).' } },
    { clause: '252.225-7060', title: 'Xinjiang Uyghur Prohibition', type: 'DFARS', date: '2026-02-28', impact: 'HIGH', summary: 'Supply-chain certification now required at the subcontractor level.', insight: 'Affects all NAICS 336413 contracts with overseas material sourcing. Certify your supply chain.', affects: 5, diff: { before: 'The prime Contractor certifies that goods provided do not contain materials sourced from the Xinjiang region.', after: 'The Contractor certifies that goods, at every tier of the supply chain, do not contain materials sourced from the Xinjiang region.' } },
    { clause: '252.204-7018', title: 'Covered Telecom Prohibition', type: 'DFARS', date: '2026-02-14', impact: 'HIGH', summary: 'Expanded definition now includes satellite communications equipment.', insight: 'Review all comms equipment in your facilities. New annual rep required at contract renewal.', affects: 4 },
    { clause: '52.219-14', title: 'Limitations on Subcontracting', type: 'FAR', date: '2026-01-30', impact: 'MEDIUM', summary: 'Self-performance percentage calculation method clarified for supply contracts.', insight: 'Calculation change affects cost-plus supply contracts. Review your subcontracting plans.', affects: 3 },
    { clause: '252.223-7008', title: 'Hexavalent Chromium', type: 'DFARS', date: '2026-01-15', impact: 'MEDIUM', summary: 'New exemption process for legacy aircraft maintenance applications.', insight: 'Exemption available for T-38 and C-130 legacy primers. File written request before delivery.', affects: 2 },
    { clause: '52.225-1', title: 'Buy American Supplies', type: 'FAR', date: '2026-01-08', impact: 'MEDIUM', summary: 'Domestic content threshold increased from 55% to 60% for commercial items.', insight: 'Review all commercial item components. Threshold change effective for awards after Feb 1 2026.', affects: 6, diff: { before: 'The cost of domestic components must exceed 55 percent of the cost of all components.', after: 'The cost of domestic components must exceed 60 percent of the cost of all components.' } },
    { clause: '252.232-7006', title: 'WAWF Payment Instructions', type: 'DFARS', date: '2025-12-20', impact: 'LOW', summary: 'Combo document type now required for all fixed-price deliverables regardless of value.', insight: 'Update your WAWF templates to the combo document type to avoid payment delays.', affects: 1 },
    { clause: 'DEV 2026-O0003', title: 'Class Deviation · TINA Threshold', type: 'Deviation', date: '2025-12-10', impact: 'MEDIUM', summary: 'Certified cost or pricing data threshold raised to $5M under FY26 NDAA §815.', insight: 'Contracts under $5M now exempt — simplifies your proposals on mid-size pursuits.', affects: 4 },
    { clause: '52.204-25', title: 'Covered Telecom (Section 889)', type: 'FAR', date: '2025-11-28', impact: 'HIGH', summary: 'Annual representation expanded to cover beneficial-ownership disclosure.', insight: 'New rep language in SAM.gov. Update your annual reps before your next offer.', affects: 5 },
    { clause: 'DEV 2026-O0001', title: 'Class Deviation · Commercial COTS', type: 'Deviation', date: '2025-11-15', impact: 'LOW', summary: 'Streamlined determination for commercial off-the-shelf precision parts.', insight: 'Easier commercial-item determinations for NAICS 332710/332721 — fewer cost submissions.', affects: 2 },
    { clause: '252.211-7003', title: 'Item Unique Identification', type: 'DFARS', date: '2025-11-04', impact: 'LOW', summary: 'IUID marking now required on items with acquisition cost ≥ $5,000 (was $5,000+).', insight: 'Minor threshold clarification. Confirm your marking process covers sub-assemblies.', affects: 1 },
    { clause: '52.204-21', title: 'Basic Safeguarding of CCI', type: 'FAR', date: '2025-10-22', impact: 'MEDIUM', summary: 'Fifteen basic safeguarding controls now flow down to all tiers of subcontractors.', insight: 'Push the 15 controls to your subs now — a precursor to full CMMC enforcement.', affects: 3 },
    { clause: '252.225-7001', title: 'Buy American / Balance of Payments', type: 'DFARS', date: '2025-10-08', impact: 'LOW', summary: 'Qualifying country list updated; two additions affecting fastener sourcing.', insight: 'Check your fastener BOM against the updated qualifying-country list.', affects: 2 },
    { clause: '252.246-7007', title: 'Contractor Counterfeit Part Detection', type: 'DFARS', date: '2025-09-26', impact: 'MEDIUM', summary: 'Electronic part traceability documentation requirements tightened.', insight: 'Strengthen traceability records for electronic components in 336413 work.', affects: 2 }
  ];

  const TYPES = [
    { key: 'all', label: 'All' }, { key: 'DFARS', label: 'DFARS' },
    { key: 'FAR', label: 'FAR' }, { key: 'Deviation', label: 'Deviation' }
  ];
  const IMPACTS = [
    { key: 'all', label: 'All' }, { key: 'HIGH', label: 'High' },
    { key: 'MEDIUM', label: 'Med' }, { key: 'LOW', label: 'Low' }
  ];
  const IMPACT_META = {
    HIGH:   { label: 'High', color: '#dc2626', rank: 3 },
    MEDIUM: { label: 'Medium', color: '#d97706', rank: 2 },
    LOW:    { label: 'Low', color: '#64748b', rank: 1 }
  };
  const TYPE_COLOR = { DFARS: '#185FA5', FAR: '#378ADD', Deviation: '#7c3aed' };

  const EFFECTIVE = [
    { name: 'CMMC Level 2 threshold', clause: '252.204-7021', days: 15, tone: 'red' },
    { name: 'Buy American 60% threshold', clause: '52.225-1', days: 0, tone: 'amber' },
    { name: 'Xinjiang subcontractor cert', clause: '252.225-7060', days: 0, tone: 'amber' },
    { name: 'Section 889 ownership rep', clause: '52.204-25', days: 42, tone: 'blue' }
  ];

  const AFFECTED = [
    { sol: 'FA3016-26-Q-0068', clause: '252.223-7008 · Hexavalent Chromium', action: 'Review supply chain for legacy primer compliance', impact: 'HIGH' },
    { sol: 'FA8615-21-C-0088', clause: '252.204-7021 · CMMC Level 2', action: 'Certification required before contract performance', impact: 'HIGH' },
    { sol: 'FA8102-26-D-0007', clause: '52.219-14 · Subcontracting Limits', action: 'Update subcontracting plan to new calculation method', impact: 'MEDIUM' },
    { sol: 'N00024-26-R-2207', clause: '52.204-25 · Section 889', action: 'Refresh annual beneficial-ownership representation', impact: 'MEDIUM' }
  ];

  const SORTS = ['Newest', 'Impact', 'Most affected'];
  return { UPDATES, TYPES, IMPACTS, IMPACT_META, TYPE_COLOR, EFFECTIVE, AFFECTED, SORTS };
})();
