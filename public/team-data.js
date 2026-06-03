/* FARaudit · Teaming Partners (best-in-class) — data. Illustrative mock.
   NAICS-matched partners · cert overlap · agency past-performance · $ = past-perf $M */
window.TEAM = (function () {
  // fit derived: NAICS overlap + cert value + agency complementarity (0-100)
  const PARTNERS = [
    { id: 'p-001', name: 'Falcon Aero Supply Inc.', loc: 'San Antonio TX', naics: ['336413', '332710'], certs: ['SB'], agencies: ['AETC', 'DLA'], value: 2.1, fit: 84, complement: 72, insight: 'Strong AETC overlap. Complementary DLA Aviation experience strengthens geographic coverage.' },
    { id: 'p-002', name: 'Desert Aerospace LLC', loc: 'Tucson AZ', naics: ['336413', '336411'], certs: ['SB', 'SDVOSB'], agencies: ['AFMC', 'AFLCMC'], value: 4.8, fit: 91, complement: 88, insight: 'SDVOSB cert adds set-aside eligibility. AFLCMC past performance fills your C-130J gap.' },
    { id: 'p-003', name: 'Precision Aviation Parts LLC', loc: 'Oklahoma City OK', naics: ['332710', '332721', '332722'], certs: ['SB'], agencies: ['AFMC', 'DLA'], value: 3.2, fit: 88, complement: 90, insight: 'Tinker AFB proximity matches OC-ALC work. Precision machining fills your 332721 gap.' },
    { id: 'p-004', name: 'SkyBridge Defense Systems', loc: 'Dallas TX', naics: ['336413', '336411'], certs: ['SB', 'WOSB'], agencies: ['AETC'], value: 1.4, fit: 76, complement: 64, insight: 'WOSB cert opens WOSB set-asides. Local TX presence supports JBSA delivery.' },
    { id: 'p-005', name: 'Vector Defense LLC', loc: 'San Antonio TX', naics: ['336413'], certs: ['SB'], agencies: ['AFMC'], value: 2.8, fit: 71, complement: 48, insight: 'Direct 336413 overlap. Shared San Antonio base strengthens T-38 maintenance teams.' },
    { id: 'p-006', name: 'Coastal Defense Supply Co.', loc: 'Savannah GA', naics: ['336413', '332710'], certs: ['SB'], agencies: ['AFLCMC'], value: 1.9, fit: 79, complement: 70, insight: 'Robins AFB proximity fills WR-ALC geographic gap. C-130J supply-chain experience is additive.' },
    { id: 'p-007', name: 'Atlas Aerospace Supply', loc: 'Fort Worth TX', naics: ['332710', '332721'], certs: ['SB'], agencies: ['AETC', 'AFMC'], value: 5.1, fit: 86, complement: 82, insight: 'Largest past performance in the pool. Strong AFMC relationships complement your AETC focus.' },
    { id: 'p-008', name: 'Summit HUBZone Mfg.', loc: 'Pueblo CO', naics: ['332710', '332721'], certs: ['SB', 'HUBZone'], agencies: ['DLA'], value: 1.2, fit: 80, complement: 86, insight: 'HUBZone cert unlocks HUBZone set-asides — a category you cannot bid alone today.' },
    { id: 'p-009', name: 'Ironwood 8(a) Industries', loc: 'Albuquerque NM', naics: ['336413', '332710'], certs: ['SB', '8(a)'], agencies: ['AFRL', 'SSC'], value: 3.6, fit: 83, complement: 84, insight: '8(a) status enables sole-source awards. AFRL/SSC relationships open new agencies for you.' },
    { id: 'p-010', name: 'Lone Star Precision', loc: 'Houston TX', naics: ['332721', '332722'], certs: ['SB'], agencies: ['DLA', 'AFSC'], value: 2.4, fit: 74, complement: 76, insight: 'Deep precision-turning bench fills your 332721 capacity at peak demand.' }
  ];

  const MY = { naics: ['336413', '332710', '332721'], certs: ['SB'], agencies: ['AETC'] };

  const NAICS_FILTERS = [
    { key: 'all', label: 'All NAICS' }, { key: '336413', label: '336413' },
    { key: '332710', label: '332710' }, { key: '332721', label: '332721' }
  ];
  const CERT_FILTERS = [
    { key: 'all', label: 'All certs' }, { key: 'SDVOSB', label: 'SDVOSB' },
    { key: '8(a)', label: '8(a)' }, { key: 'HUBZone', label: 'HUBZone' }, { key: 'WOSB', label: 'WOSB' }
  ];
  const CERT_COLOR = { SB: '#64748b', SDVOSB: '#185FA5', '8(a)': '#7c3aed', HUBZone: '#0d9488', WOSB: '#d97706' };

  // certs you reach only via teaming
  const CERT_COVERAGE = [
    { cert: 'SB', label: 'Small Business', yours: true, via: 0 },
    { cert: 'SDVOSB', label: 'Service-Disabled Vet', yours: false, via: 1 },
    { cert: '8(a)', label: '8(a) Business Dev', yours: false, via: 1 },
    { cert: 'HUBZone', label: 'HUBZone', yours: false, via: 1 },
    { cert: 'WOSB', label: 'Women-Owned', yours: false, via: 1 }
  ];

  // active teaming opportunities where partnering wins
  const TEAMING_OPPS = [
    { sol: 'FA3016-26-R-0091', title: 'T-38 Depot Support IDIQ', need: 'Needs SDVOSB set-aside + C-130J past perf', match: 'Desert Aerospace LLC', val: 14.2 },
    { sol: 'SP4701-26-Q-0942', title: 'OC-ALC Precision Components', need: 'Needs 332721 capacity + Tinker proximity', match: 'Precision Aviation Parts LLC', val: 6.8 },
    { sol: 'FA8501-26-R-0077', title: 'WR-ALC C-130 Structural', need: 'Needs HUBZone eligibility', match: 'Summit HUBZone Mfg.', val: 13.1 }
  ];

  const SORTS = ['Best fit', 'Complementarity', 'Past performance'];
  return { PARTNERS, MY, NAICS_FILTERS, CERT_FILTERS, CERT_COLOR, CERT_COVERAGE, TEAMING_OPPS, SORTS };
})();
