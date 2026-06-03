/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Spending (best-in-class) — data layer
   All figures are illustrative mock data for the prototype.
   Your NAICS: 336413 (aircraft parts) · 332710 (machine shops) · 332721 (precision turning)
   ═══════════════════════════════════════════════════════════════════ */
window.DSB = (function () {

  const FYS = ['FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026'];

  /* ─── KPI headline metrics per FY (value + 5yr spark + delta) ─── */
  const KPIS = {
    FY2026: {
      addressable: { val: 2.41, unit: 'B', label: 'Addressable Spend', sub: 'your NAICS · all agencies', spark: [1.74, 1.93, 2.05, 2.22, 2.41], delta: '+8.6%', tone: 'blue' },
      recompete:   { val: 23,   unit: '',  label: 'Recompetes Due',    sub: 'FY27 expiry · $1.1B ceiling', spark: [31, 29, 27, 25, 23], delta: '−2 vs FY25', tone: 'amber' },
      sbshare:     { val: 34,   unit: '%', label: 'SB Win Share',      sub: 'of awards in your NAICS', spark: [29, 30, 31, 32, 34], delta: '+2.0 pts', tone: 'green' },
      cycle:       { val: 68,   unit: 'd', label: 'Synopsis → Award',  sub: 'avg cycle · your NAICS', spark: [76, 74, 72, 70, 68], delta: '−4 days', tone: 'blue' }
    }
  };

  /* ─── State spend (your NAICS, FY2026 $M) — fips key for d3 choropleth ───
     gap = high spend, no recorded activity from your firm (BD opportunity). */
  const STATES = {
    '48': { abbr: 'TX', name: 'Texas',          val: 340, yoy:  8, sb: 34, note: 'JBSA Lackland · DLA Aviation' },
    '51': { abbr: 'VA', name: 'Virginia',       val: 290, yoy: 12, sb: 28, note: 'NAVAIR Pax River · Quantico' },
    '06': { abbr: 'CA', name: 'California',      val: 245, yoy: -3, sb: 31, note: 'Edwards AFB · MCAS Miramar' },
    '24': { abbr: 'MD', name: 'Maryland',        val: 195, yoy:  5, sb: 38, note: 'Aberdeen PG · Andrews AFB' },
    '12': { abbr: 'FL', name: 'Florida',         val: 165, yoy:  2, sb: 29, note: 'MacDill AFB · NAS Jacksonville' },
    '53': { abbr: 'WA', name: 'Washington',      val: 134, yoy: 11, sb: 36, note: 'NAVAIR Whidbey · Boeing supply', gap: true },
    '01': { abbr: 'AL', name: 'Alabama',         val: 112, yoy:  7, sb: 41, note: 'Redstone Arsenal · AMCOM' },
    '08': { abbr: 'CO', name: 'Colorado',        val:  88, yoy: 11, sb: 37, note: 'Peterson SFB · Buckley' },
    '04': { abbr: 'AZ', name: 'Arizona',         val:  48, yoy:  9, sb: 40, note: 'Luke AFB · Davis-Monthan', gap: true },
    '39': { abbr: 'OH', name: 'Ohio',            val:  67, yoy:  4, sb: 35, note: 'WPAFB · DLA Aviation Columbus', gap: true },
    '13': { abbr: 'GA', name: 'Georgia',         val:  54, yoy:  3, sb: 33, note: 'Robins AFB · Warner Robins ALC', gap: true },
    '42': { abbr: 'PA', name: 'Pennsylvania',    val:  72, yoy:  2, sb: 39, note: 'NSWC Philadelphia · Tobyhanna' },
    '36': { abbr: 'NY', name: 'New York',        val:  44, yoy:  1, sb: 42, note: 'Watervliet · Fort Drum' },
    '09': { abbr: 'CT', name: 'Connecticut',     val:  98, yoy:  6, sb: 22, note: 'Pratt & Whitney · Electric Boat' },
    '34': { abbr: 'NJ', name: 'New Jersey',      val:  41, yoy:  3, sb: 37, note: 'Picatinny Arsenal · JB MDL' },
    '25': { abbr: 'MA', name: 'Massachusetts',   val:  58, yoy:  5, sb: 30, note: 'Hanscom AFB · Natick' },
    '29': { abbr: 'MO', name: 'Missouri',        val:  62, yoy:  4, sb: 28, note: 'Boeing St. Louis · Whiteman' },
    '18': { abbr: 'IN', name: 'Indiana',         val:  46, yoy:  6, sb: 44, note: 'NSWC Crane · Rolls-Royce' },
    '21': { abbr: 'KY', name: 'Kentucky',        val:  28, yoy:  2, sb: 47, note: 'Fort Knox · Blue Grass' },
    '40': { abbr: 'OK', name: 'Oklahoma',        val:  57, yoy:  3, sb: 31, note: 'Tinker AFB · OC-ALC', gap: true },
    '22': { abbr: 'LA', name: 'Louisiana',       val:  19, yoy:  1, sb: 49, note: 'Fort Polk · Barksdale' },
    '28': { abbr: 'MS', name: 'Mississippi',     val:  31, yoy:  4, sb: 45, note: 'Stennis · Keesler AFB' },
    '47': { abbr: 'TN', name: 'Tennessee',       val:  35, yoy:  3, sb: 38, note: 'Arnold AFB · Holston AAP' },
    '37': { abbr: 'NC', name: 'North Carolina',  val:  49, yoy:  5, sb: 40, note: 'Fort Liberty · Cherry Point' },
    '45': { abbr: 'SC', name: 'South Carolina',  val:  33, yoy:  6, sb: 35, note: 'Shaw AFB · Charleston' },
    '17': { abbr: 'IL', name: 'Illinois',        val:  26, yoy:  1, sb: 41, note: 'Scott AFB · Rock Island' },
    '26': { abbr: 'MI', name: 'Michigan',        val:  43, yoy:  4, sb: 36, note: 'TACOM · Detroit Arsenal' },
    '55': { abbr: 'WI', name: 'Wisconsin',       val:  22, yoy:  2, sb: 43, note: 'Fincantieri Marinette' },
    '27': { abbr: 'MN', name: 'Minnesota',       val:  18, yoy:  1, sb: 39, note: 'Arctic Cat · BAE' },
    '20': { abbr: 'KS', name: 'Kansas',          val:  21, yoy:  2, sb: 44, note: 'Fort Riley · McConnell' },
    '32': { abbr: 'NV', name: 'Nevada',          val:  16, yoy:  3, sb: 51, note: 'Nellis AFB · Hawthorne' },
    '49': { abbr: 'UT', name: 'Utah',            val:  31, yoy:  7, sb: 43, note: 'Hill AFB · Dugway' },
    '35': { abbr: 'NM', name: 'New Mexico',      val:  37, yoy:  5, sb: 43, note: 'Kirtland · White Sands' },
    '16': { abbr: 'ID', name: 'Idaho',           val:   9, yoy:  2, sb: 52, note: 'Mountain Home AFB' },
    '41': { abbr: 'OR', name: 'Oregon',          val:  14, yoy:  4, sb: 44, note: 'Boeing Portland' },
    '02': { abbr: 'AK', name: 'Alaska',          val:  17, yoy:  3, sb: 48, note: 'JBER · Eielson AFB' },
    '15': { abbr: 'HI', name: 'Hawaii',          val:  29, yoy:  4, sb: 33, note: 'Pearl Harbor · Hickam' },
    '31': { abbr: 'NE', name: 'Nebraska',        val:  11, yoy:  0, sb: 46, note: 'Offutt AFB' },
    '19': { abbr: 'IA', name: 'Iowa',            val:   8, yoy:  1, sb: 45, note: 'Iowa AAP' },
    '05': { abbr: 'AR', name: 'Arkansas',        val:  12, yoy:  2, sb: 42, note: 'Little Rock AFB' },
    '30': { abbr: 'MT', name: 'Montana',         val:   6, yoy: -1, sb: 55, note: 'Malmstrom AFB' },
    '38': { abbr: 'ND', name: 'North Dakota',    val:   9, yoy:  2, sb: 48, note: 'Minot AFB · Grand Forks' },
    '46': { abbr: 'SD', name: 'South Dakota',    val:   5, yoy:  0, sb: 60, note: 'Ellsworth AFB' },
    '56': { abbr: 'WY', name: 'Wyoming',         val:   4, yoy: -2, sb: 62, note: 'F.E. Warren AFB' },
    '11': { abbr: 'DC', name: 'District of Columbia', val: 39, yoy: 3, sb: 25, note: 'Pentagon · NAVSEA HQ' },
    '50': { abbr: 'VT', name: 'Vermont',         val:   7, yoy:  1, sb: 41, note: 'GE Aviation' },
    '33': { abbr: 'NH', name: 'New Hampshire',   val:  13, yoy:  3, sb: 38, note: 'Portsmouth NSY' },
    '23': { abbr: 'ME', name: 'Maine',           val:  15, yoy:  2, sb: 36, note: 'Bath Iron Works' },
    '44': { abbr: 'RI', name: 'Rhode Island',    val:  10, yoy:  2, sb: 39, note: 'NUWC Newport' },
    '10': { abbr: 'DE', name: 'Delaware',        val:   8, yoy:  1, sb: 40, note: 'Dover AFB' },
    '54': { abbr: 'WV', name: 'West Virginia',   val:   6, yoy:  1, sb: 50, note: 'Allegany Ballistics' }
  };

  /* ─── Agency breakdown — FY values ($M, your NAICS) + SB share + 5yr spark + child NAICS for treemap ─── */
  const AGENCIES = [
    { key: 'navy',     name: 'U.S. Navy / NAVSEA',  short: 'NAVY',   val: 890, sb: 32, trend: 'up',   spark: [690, 740, 820, 855, 890], naics: { '336413': 470, '332710': 250, '332721': 170 } },
    { key: 'airforce', name: 'U.S. Air Force',      short: 'USAF',   val: 680, sb: 38, trend: 'up',   spark: [520, 560, 630, 655, 680], naics: { '336413': 410, '332710': 160, '332721': 110 } },
    { key: 'army',     name: 'U.S. Army',           short: 'ARMY',   val: 340, sb: 41, trend: 'flat', spark: [340, 355, 310, 328, 340], naics: { '336413': 150, '332710': 120, '332721': 70 } },
    { key: 'dla',      name: 'Defense Logistics',   short: 'DLA',    val: 125, sb: 52, trend: 'up',   spark: [92, 100, 108, 117, 125], naics: { '336413': 55, '332710': 45, '332721': 25 } },
    { key: 'navair',   name: 'NAVAIR',              short: 'NAVAIR', val: 97,  sb: 44, trend: 'up',   spark: [70, 80, 88, 92, 97],     naics: { '336413': 60, '332710': 22, '332721': 15 } },
    { key: 'aflcmc',   name: 'AFLCMC',              short: 'AFLCMC', val: 79,  sb: 40, trend: 'up',   spark: [92, 84, 76, 76, 79],     naics: { '336413': 48, '332710': 18, '332721': 13 } },
    { key: 'tacom',    name: 'TACOM',               short: 'TACOM',  val: 65,  sb: 48, trend: 'up',   spark: [48, 55, 58, 62, 65],     naics: { '336413': 20, '332710': 30, '332721': 15 } },
    { key: 'ssc',      name: 'Space Systems Cmd',   short: 'SSC',    val: 58,  sb: 34, trend: 'up',   spark: [22, 34, 44, 51, 58],     naics: { '336413': 30, '332710': 16, '332721': 12 } }
  ];

  /* ─── Competition matrix (scatter): per NAICS-segment, # firms vs $/firm, total $, fit ─── */
  const COMPETITION = [
    { code: '336413', label: 'Aircraft parts (broad)',        firms: 142, total: 1650, perFirm: 11.6, fit: 'core' },
    { code: '336413-N', label: 'Aircraft parts · NAVAIR',     firms: 38,  total: 420,  perFirm: 11.1, fit: 'core' },
    { code: '332710', label: 'Machine shops (broad)',         firms: 540, total: 360,  perFirm: 0.67, fit: 'core' },
    { code: '332710-D', label: 'Machine shops · DLA',         firms: 96,  total: 145,  perFirm: 1.51, fit: 'core' },
    { code: '332721', label: 'Precision turning',             firms: 54,  total: 245,  perFirm: 4.54, fit: 'core' },
    { code: '336412', label: 'Aircraft engine parts',         firms: 88,  total: 510,  perFirm: 5.80, fit: 'adjacent' },
    { code: '332722', label: 'Bolts/nuts/screws',             firms: 210, total: 180,  perFirm: 0.86, fit: 'adjacent' },
    { code: '334511', label: 'Search/nav instruments',        firms: 64,  total: 690,  perFirm: 10.8, fit: 'stretch' },
    { code: '336419', label: 'Other space/aux equip',         firms: 22,  total: 130,  perFirm: 5.91, fit: 'adjacent' },
    { code: '332912', label: 'Fluid power valves',            firms: 118, total: 96,   perFirm: 0.81, fit: 'stretch' }
  ];

  /* ─── Market trend per NAICS (FY22–FY27, last is projected) ─── */
  const MARKET_TREND = {
    labels: ['FY22', 'FY23', 'FY24', 'FY25', 'FY26', 'FY27p'],
    series: {
      '336413': [980, 1100, 1280, 1380, 1520, 1650],
      '332710': [280, 310, 290, 305, 338, 360],
      '332721': [180, 195, 210, 200, 220, 245]
    }
  };

  /* ─── DoD topline budget ($B) with status ─── */
  const BUDGET = [
    { fy: 'FY22', val: 742, status: 'enacted' },
    { fy: 'FY23', val: 797, status: 'enacted' },
    { fy: 'FY24', val: 825, status: 'cr' },
    { fy: 'FY25', val: 831, status: 'shutdown' },
    { fy: 'FY26', val: 839, status: 'enacted' }
  ];

  /* ─── Recompete radar (timeline by FY27 quarter) ─── */
  const RECOMPETES = [
    { name: 'F-35 GSE Support IDIQ',      incumbent: 'DRS Technologies', val: 500, agency: 'AFLCMC', q: 2, naics: '336413' },
    { name: 'NAVAIR Depot Maintenance',   incumbent: 'Vertex Aerospace', val: 180, agency: 'NAVAIR', q: 3, naics: '336413' },
    { name: 'DLA Aviation Parts BOA',     incumbent: 'Aviall Services',  val: 90,  agency: 'DLA',    q: 1, naics: '336413' },
    { name: 'Army TACOM Components',      incumbent: 'AM General',       val: 67,  agency: 'TACOM',  q: 4, naics: '332710' },
    { name: 'NSWC Test Equipment',        incumbent: 'SAIC',             val: 45,  agency: 'NAVY',   q: 2, naics: '332721' },
    { name: 'Hill AFB Tooling IDIQ',      incumbent: 'StandardAero',     val: 38,  agency: 'AFLCMC', q: 3, naics: '332710' },
    { name: 'Tinker Engine Hardware',     incumbent: 'Heico Corp',       val: 52,  agency: 'AFLCMC', q: 1, naics: '332721' }
  ];

  /* ─── Incumbent intelligence (recent awards = teaming targets) ─── */
  const INCUMBENTS = [
    { awd: 'Raytheon Intel & Space', agy: 'NAVSEA',  val: 54.2, naics: '336413', sa: 'lp',  date: 'May 26' },
    { awd: 'Ducommun Inc',           agy: 'AFLCMC',  val: 32.1, naics: '336413', sa: 'sb',  date: 'May 25' },
    { awd: 'General Dynamics Land',  agy: 'TACOM',   val: 87.5, naics: '332710', sa: 'lp',  date: 'May 24' },
    { awd: 'Magellan Aerospace',     agy: 'DLA',     val: 12.4, naics: '336413', sa: 'sb',  date: 'May 24' },
    { awd: 'TransDigm Group',        agy: 'NAVAIR',  val: 8.9,  naics: '332710', sa: 'sb',  date: 'May 23' },
    { awd: 'Boeing IDS',             agy: 'AFLCMC',  val: 44.7, naics: '336413', sa: 'lp',  date: 'May 23' },
    { awd: 'Astronics Test',         agy: 'NAVAIR',  val: 15.8, naics: '336413', sa: 'sb',  date: 'May 22' },
    { awd: 'Parker Hannifin',        agy: 'DLA',     val: 6.3,  naics: '332721', sa: 'lp',  date: 'May 21' }
  ];

  /* ─── Pricing intelligence ($K per contract) ─── */
  const PRICING = [
    { code: '336413', median: 28, range: [8, 340], avg: 47, top: 'NAVAIR $62K' },
    { code: '332710', median: 11, range: [2, 180], avg: 18, top: 'DLA $24K' },
    { code: '332721', median: 34, range: [12, 420], avg: 52, top: 'AFLCMC $71K' }
  ];

  /* ─── NDAA highlights ─── */
  const NDAA = [
    { tone: 'amber', tag: 'Action Required', title: 'CMMC Phase 2 · Nov 10, 2026', body: 'Mandatory C3PAO certification for CUI contracts. 158 days to enforcement.' },
    { tone: 'green', tag: 'Favorable',       title: 'TINA threshold → $5M · §815', body: 'Contracts under $5M now exempt from certified cost or pricing data.' },
    { tone: 'blue',  tag: 'Monitor',         title: 'DFARS 252.204-7018 · Telecom', body: 'Covered-telecom prohibition active across all contracts. Rep required at offer.' }
  ];

  const AGENCY_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'navy', label: 'Navy' }, { key: 'airforce', label: 'Air Force' },
    { key: 'army', label: 'Army' }, { key: 'dla', label: 'DLA' },
    { key: 'navair', label: 'NAVAIR' }, { key: 'aflcmc', label: 'AFLCMC' },
    { key: 'tacom', label: 'TACOM' }, { key: 'ssc', label: 'SSC' }
  ];

  return { FYS, KPIS, STATES, AGENCIES, COMPETITION, MARKET_TREND, BUDGET, RECOMPETES, INCUMBENTS, PRICING, NDAA, AGENCY_FILTERS };
})();
