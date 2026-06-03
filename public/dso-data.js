/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Opportunities (best-in-class) — Pursuit Intelligence data
   Illustrative mock data. Your NAICS: 336413 · 332710 · 332721
   ═══════════════════════════════════════════════════════════════════ */
window.DSO = (function () {

  // stage: presol | sources | rfp | eval   (acquisition lifecycle)
  // sa: SB | SDVOSB | 8(a) | HUBZone | Full   (Full = full & open)
  const OPPS = [
    { id: 'N00024-26-R-2207', title: 'SPY-6 Radar Sustainment Engineering — Phase IV CDRL Refresh', agency: 'Navy · NAVSEA', office: 'PEO IWS 2.0 · Washington Navy Yard', naics: '336413', sa: 'SDVOSB', stage: 'rfp', type: 'RFP', ceiling: 18.4, days: 6, fit: 94, incumbent: 'Raytheon (recompete)', posted: '12d ago' },
    { id: 'FA8101-26-R-0027', title: 'AWACS Mission Computer Component Overhaul & Repair', agency: 'Air Force · AFLCMC', office: 'Tinker AFB, OK', naics: '336413', sa: 'SB', stage: 'rfp', type: 'RFP', ceiling: 9.2, days: 9, fit: 92, incumbent: 'Boeing IDS (recompete)', posted: '8d ago' },
    { id: 'SP4701-26-Q-0942', title: 'Predictive Maintenance Analytics — H-60 Fleet', agency: 'DLA · Aviation', office: 'Richmond, VA', naics: '336413', sa: 'SB', stage: 'rfp', type: 'RFP', ceiling: 6.8, days: 11, fit: 88, incumbent: 'New requirement', posted: '5d ago' },
    { id: 'W56HZV-26-R-0078', title: 'Ground Vehicle Precision-Machined Spares IDIQ', agency: 'Army · TACOM', office: 'Detroit Arsenal, MI', naics: '332710', sa: 'SB', stage: 'rfp', type: 'IDIQ', ceiling: 14.2, days: 13, fit: 81, incumbent: 'AM General (recompete)', posted: '15d ago' },
    { id: 'N00164-26-Q-0788', title: 'Energetic Materials R&D Machining Support', agency: 'Navy · NSWC Crane', office: 'Crane, IN', naics: '332721', sa: 'SDVOSB', stage: 'sources', type: 'Sources Sought', ceiling: 5.5, days: 9, fit: 86, incumbent: 'New requirement', posted: '3d ago' },
    { id: 'FA2517-26-R-0033', title: 'GPS III Ground Station Precision Hardware', agency: 'Space Force · SSC', office: 'Peterson SFB, CO', naics: '332721', sa: 'Full', stage: 'rfp', type: 'RFP', ceiling: 24.6, days: 4, fit: 73, incumbent: 'L3Harris (recompete)', posted: '20d ago' },
    { id: 'SS-AETC-2026-041', title: 'Sources Sought — Landing Gear Component Remanufacture', agency: 'Air Force · AETC', office: 'JBSA Randolph, TX', naics: '336413', sa: 'SB', stage: 'sources', type: 'Sources Sought', ceiling: 4.1, days: 5, fit: 90, incumbent: 'Market research', posted: '2d ago' },
    { id: 'W912DY-26-R-0089', title: 'Critical Infrastructure Fabrication & Welding', agency: 'Army · USACE Huntsville', office: 'Huntsville, AL', naics: '332710', sa: '8(a)', stage: 'rfp', type: 'RFP', ceiling: 3.2, days: 6, fit: 68, incumbent: 'New requirement', posted: '9d ago' },
    { id: 'HC1028-26-R-1015', title: 'Depot Tooling & Fixture Manufacturing — JWCC adjacent', agency: 'DISA', office: 'Fort Meade, MD', naics: '332710', sa: 'Full', stage: 'eval', type: 'RFP', ceiling: 32.0, days: 28, fit: 64, incumbent: 'Leidos (recompete)', posted: '34d ago' },
    { id: 'FA8730-26-Q-0114', title: 'F-35 Mission Systems Test Harness Hardware', agency: 'Air Force · AFLCMC', office: 'Hanscom AFB, MA', naics: '336413', sa: 'SB', stage: 'rfp', type: 'RFP', ceiling: 7.9, days: 5, fit: 89, incumbent: 'New requirement', posted: '6d ago' },
    { id: 'N40192-26-Q-1188', title: 'Energetics Storage Inspection Fixtures — Guam', agency: 'Navy · NAVFAC Pacific', office: 'Santa Rita, GU', naics: '332721', sa: 'HUBZone', stage: 'sources', type: 'Sources Sought', ceiling: 8.7, days: 20, fit: 77, incumbent: 'Market research', posted: '11d ago' },
    { id: 'W58RGZ-26-Q-0418', title: 'Aviation Ground Support Equipment Calibration', agency: 'Army · AMCOM', office: 'Redstone Arsenal, AL', naics: '336413', sa: 'SB', stage: 'rfp', type: 'RFP', ceiling: 3.4, days: 6, fit: 83, incumbent: 'Vectrus (recompete)', posted: '7d ago' },
    { id: 'SP0700-26-R-0210', title: 'Field Feeding Equipment Precision Parts FY26', agency: 'DLA · Troop Support', office: 'Philadelphia, PA', naics: '332710', sa: 'SB', stage: 'rfp', type: 'IDIQ', ceiling: 4.9, days: 2, fit: 71, incumbent: 'New requirement', posted: '18d ago' },
    { id: 'N00178-26-R-3071', title: 'Energetics Material Handling Hardware — Bldg 4042', agency: 'Navy · NSWC Indian Head', office: 'Indian Head, MD', naics: '332721', sa: 'SDVOSB', stage: 'rfp', type: 'RFP', ceiling: 5.6, days: 3, fit: 85, incumbent: 'New requirement', posted: '10d ago' },
    { id: 'FA8501-26-R-0077', title: 'C-130 Depot Structural Component Refurb', agency: 'Air Force · AFSC', office: 'Robins AFB, GA', naics: '336413', sa: 'Full', stage: 'eval', type: 'RFP', ceiling: 13.1, days: 34, fit: 59, incumbent: 'StandardAero (recompete)', posted: '40d ago' },
    { id: 'W519TC-26-R-0066', title: 'Enterprise Machine Shop Sustainment Services', agency: 'Army · NETCOM', office: 'Fort Huachuca, AZ', naics: '332710', sa: '8(a)', stage: 'presol', type: 'Pre-Solicitation', ceiling: 21.5, days: 45, fit: 62, incumbent: 'Est. RFP 45d', posted: '4d ago' },
    { id: 'N00421-26-R-0145', title: 'Flight Test Instrumentation Precision Components', agency: 'Navy · NAWCAD', office: 'Patuxent River, MD', naics: '336413', sa: 'SB', stage: 'eval', type: 'RFP', ceiling: 16.7, days: 25, fit: 79, incumbent: 'Clarifications', posted: '30d ago' },
    { id: 'HQ0034-26-R-2058', title: 'Resilient Tactical Edge Compute Enclosures — SBIR II', agency: 'DARPA · MTO', office: 'Arlington, VA', naics: '332710', sa: 'SB', stage: 'presol', type: 'Pre-Solicitation', ceiling: 12.0, days: 75, fit: 67, incumbent: 'Synopsis posted', posted: '1d ago' }
  ];

  const NAICS = [
    { code: '336413', label: 'Aircraft parts' },
    { code: '332710', label: 'Machine shops' },
    { code: '332721', label: 'Precision turning' }
  ];
  const STAGES = [
    { key: 'all', label: 'All stages' },
    { key: 'presol', label: 'Pre-Sol' },
    { key: 'sources', label: 'Sources Sought' },
    { key: 'rfp', label: 'Open RFP' },
    { key: 'eval', label: 'In Evaluation' }
  ];
  const STAGE_META = {
    presol:  { label: 'Pre-Solicitation', color: '#94a3b8' },
    sources: { label: 'Sources Sought',   color: '#d97706' },
    rfp:     { label: 'Open RFP',          color: '#378ADD' },
    eval:    { label: 'In Evaluation',     color: '#7c3aed' }
  };
  const SETASIDES = ['all', 'SB', 'SDVOSB', '8(a)', 'HUBZone', 'Full'];

  const SAVED_VIEWS = [
    { key: 'hot', label: '🎯 High-fit & closing', desc: 'fit ≥ 85 · ≤ 10 days' },
    { key: 'sb', label: 'Set-aside eligible', desc: 'SB / SDVOSB / 8(a) / HUBZone' },
    { key: 'recompete', label: 'Recompetes', desc: 'incumbent contracts up for re-award' },
    { key: 'upstream', label: 'Upstream (shape it)', desc: 'pre-sol + sources sought' }
  ];

  return { OPPS, NAICS, STAGES, STAGE_META, SETASIDES, SAVED_VIEWS };
})();
