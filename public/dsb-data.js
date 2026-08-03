/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Spending (best-in-class) — data layer
   All figures are illustrative mock data for the prototype.
   Your NAICS: 336413 (aircraft parts) · 332710 (machine shops) · 332721 (precision turning)
   ═══════════════════════════════════════════════════════════════════ */
window.DSB = (function () {

  const FYS = ['FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026'];

  /* ─── KPI headline metrics per FY (value + 5yr spark + delta) ─── */
  const KPIS = {};

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
  const AGENCIES = [];

  /* ─── Competition matrix (scatter): per NAICS-segment, # firms vs $/firm, total $, fit ─── */
  const COMPETITION = [];

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
  const BUDGET = [];

  /* ─── Recompete radar (timeline by FY27 quarter) ─── */
  const RECOMPETES = [];

  /* ─── Incumbent intelligence (recent awards = teaming targets) ─── */
  const INCUMBENTS = [];

  /* ─── Pricing intelligence ($K per contract) ─── */
  const PRICING = [];

  /* ─── NDAA highlights ─── */
  const NDAA = [];

  const AGENCY_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'navy', label: 'Navy' }, { key: 'airforce', label: 'Air Force' },
    { key: 'army', label: 'Army' }, { key: 'dla', label: 'DLA' },
    { key: 'navair', label: 'NAVAIR' }, { key: 'aflcmc', label: 'AFLCMC' },
    { key: 'tacom', label: 'TACOM' }, { key: 'ssc', label: 'SSC' }
  ];

  return { FYS, KPIS, STATES, AGENCIES, COMPETITION, MARKET_TREND, BUDGET, RECOMPETES, INCUMBENTS, PRICING, NDAA, AGENCY_FILTERS };
})();

/* Feed state. 'unwired' until /api/defense-spending returns real records:
   this page has no live data source yet, and says so rather than drawing
   figures nobody counted. */
if (window.DSB) { window.DSB.STATUS = { state: 'unwired', reason: '' }; }
