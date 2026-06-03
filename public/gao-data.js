/* FARaudit · GAO Protests (best-in-class) — data. Illustrative mock.
   status: Active | Sustained | Denied | Dismissed */
window.GAO = (function () {
  const PROTESTS = [
    { id: 'gp-001', docket: 'B-422314.2', status: 'Active', title: 'Apex Aerospace vs. AFMC — C-17 Maintenance IDIQ', agency: 'AFMC', protester: 'Apex Aerospace Solutions', ground: 'Technical evaluation', filed: '2026-04-12', val: 4.2, days: 45, naics: '336413', year: '2026', detail: 'Panel applied a 3-year past-performance recency requirement not stated in Section M. Technical evaluation is the #1 sustained ground in FY2025.' },
    { id: 'gp-002', docket: 'B-421988', status: 'Active', title: 'Falcon Aero vs. DLA — Aviation Fasteners IDIQ', agency: 'DLA', protester: 'Falcon Aero Supply', ground: 'Cost/price evaluation', filed: '2026-03-28', val: 0.88, days: 60, naics: '332722', year: '2026', detail: 'Agency deemed price unreasonably high vs. IGE but never disclosed IGE methodology. Cost/price is the #2 sustained ground FY2025.' },
    { id: 'gp-003', docket: 'B-421744', status: 'Active', title: 'SkyBridge vs. AETC — T-38 Ground Support', agency: 'AETC', protester: 'SkyBridge Defense', ground: 'OCI', filed: '2026-03-15', val: 0.29, days: 73, naics: '336413', year: '2026', detail: 'Incumbent employee served on the technical evaluation panel. OCI frequently triggers corrective action even when not formally sustained.' },
    { id: 'gp-004', docket: 'B-421102', status: 'Sustained', title: 'Desert Aerospace vs. AFMC — Landing Gear Overhaul', agency: 'AFMC', protester: 'Desert Aerospace', ground: 'Technical evaluation', filed: '2025-12-01', val: 0.89, days: 75, naics: '336413', year: '2025', detail: 'GAO sustained — agency applied disparate evaluation standards. Directed to reevaluate with consistent criteria.' },
    { id: 'gp-005', docket: 'B-420887', status: 'Sustained', title: 'Precision Aviation vs. DLA — Bearings IDIQ', agency: 'DLA', protester: 'Precision Aviation Parts', ground: 'Proposal rejection', filed: '2025-11-08', val: 0.11, days: 75, naics: '332722', year: '2025', detail: 'GAO sustained — inadequate market research before a brand-name-or-equal solicitation. Directed to revise the solicitation.' },
    { id: 'gp-006', docket: 'B-420341', status: 'Denied', title: 'Coastal Defense vs. AFLCMC — C-130J Parts', agency: 'AFLCMC', protester: 'Coastal Defense Supply', ground: 'Technical acceptability', filed: '2025-09-14', val: 1.4, days: 65, naics: '336413', year: '2025', detail: 'GAO denied — agency properly applied qualification requirements. Protester failed Section C specs. Qualification-based denials are highly defensible.' },
    { id: 'gp-007', docket: 'B-419988', status: 'Denied', title: 'Atlas Aerospace vs. AETC — Hydraulic Fittings', agency: 'AETC', protester: 'Atlas Aerospace Supply', ground: 'Unbalanced pricing', filed: '2025-08-22', val: 0.13, days: 69, naics: '336413', year: '2025', detail: 'GAO denied — pricing was not mathematically unbalanced and posed no undue risk.' },
    { id: 'gp-008', docket: 'B-419512', status: 'Sustained', title: 'Vector Defense vs. AFMC — Engine Fan Blades', agency: 'AFMC', protester: 'Vector Defense', ground: 'Unequal discussions', filed: '2025-07-10', val: 0.67, days: 64, naics: '336413', year: '2025', detail: 'GAO sustained — agency raised weaknesses with the awardee but not the protester. Directed to reopen discussions. Unequal discussions are reliably sustained when documented.' },
    { id: 'gp-009', docket: 'B-418977', status: 'Dismissed', title: 'Pacific Aero vs. DLA — Fastener Supply', agency: 'DLA', protester: 'Pacific Aero Parts', ground: 'Timeliness', filed: '2025-05-20', val: 0.22, days: 15, naics: '332722', year: '2025', detail: 'Dismissed as untimely — filed beyond the 10-day window. The 10-day rule is strictly enforced.' },
    { id: 'gp-010', docket: 'B-418441', status: 'Denied', title: 'Ironclad vs. AETC — Safety Equipment', agency: 'AETC', protester: 'Ironclad Supply', ground: 'Technical evaluation', filed: '2025-04-01', val: 0.089, days: 70, naics: '336413', year: '2024', detail: 'GAO denied — experience requirement clearly stated and reasonably evaluated. Clear requirements give agencies strong denial grounds.' }
  ];

  const STATUS_META = {
    Active:    { label: 'Active', color: '#378ADD' },
    Sustained: { label: 'Sustained', color: '#059669' },
    Denied:    { label: 'Denied', color: '#dc2626' },
    Dismissed: { label: 'Dismissed', color: '#64748b' }
  };
  const STATUS_FILTERS = [
    { key: 'all', label: 'All' }, { key: 'Active', label: 'Active' },
    { key: 'Sustained', label: 'Sustained' }, { key: 'Denied', label: 'Denied' }, { key: 'Dismissed', label: 'Dismissed' }
  ];
  const AGENCY_FILTERS = [
    { key: 'all', label: 'All' }, { key: 'AFMC', label: 'AFMC' }, { key: 'DLA', label: 'DLA' },
    { key: 'AETC', label: 'AETC' }, { key: 'AFLCMC', label: 'AFLCMC' }
  ];

  // FY2025 GAO annual report (national)
  const NATIONAL = { filed: 1688, meritDecisions: 581, sustained: 81, sustainRate: 14, effectiveness: 52 };

  // sustained-rate by agency (your NAICS, last 24mo)
  const BY_AGENCY = [
    { agency: 'AFMC', filed: 38, sustained: 9, rate: 24 },
    { agency: 'DLA', filed: 52, sustained: 7, rate: 13 },
    { agency: 'AETC', filed: 24, sustained: 2, rate: 8 },
    { agency: 'AFLCMC', filed: 31, sustained: 5, rate: 16 },
    { agency: 'AFSC', filed: 18, sustained: 4, rate: 22 }
  ];

  // protest grounds — sustain likelihood
  const GROUNDS = [
    { ground: 'Technical evaluation', share: 28, sustainOdds: 'High' },
    { ground: 'Unequal discussions', share: 11, sustainOdds: 'High' },
    { ground: 'Cost/price evaluation', share: 18, sustainOdds: 'Medium' },
    { ground: 'Proposal rejection', share: 9, sustainOdds: 'Medium' },
    { ground: 'OCI', share: 8, sustainOdds: 'Medium' },
    { ground: 'Technical acceptability', share: 14, sustainOdds: 'Low' },
    { ground: 'Unbalanced pricing', share: 7, sustainOdds: 'Low' },
    { ground: 'Timeliness', share: 5, sustainOdds: 'Dismissed' }
  ];
  const ODDS_COLOR = { High: '#059669', Medium: '#d97706', Low: '#dc2626', Dismissed: '#64748b' };

  // live risk signals
  const SIGNALS = [
    { tone: 'red', title: 'Incumbent disruption · AFMC C-17 IDIQ', body: 'Active protest could vacate award you are tracking. Watch for corrective action.' },
    { tone: 'amber', title: 'High sustain-rate agency · AFMC 24%', body: 'AFMC sustains nearly 1 in 4 in your NAICS. Tighten your evaluation-record reviews before bidding.' },
    { tone: 'blue', title: 'Pattern · undisclosed recency requirements', body: 'Two recent sustains hinged on unstated past-performance recency. Flag Section M ambiguity early.' }
  ];

  const SORTS = ['Newest', 'Value', 'Days open'];
  return { PROTESTS, STATUS_META, STATUS_FILTERS, AGENCY_FILTERS, NATIONAL, BY_AGENCY, GROUNDS, ODDS_COLOR, SIGNALS, SORTS };
})();
