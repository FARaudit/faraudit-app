/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Agencies (best-in-class) — Org & posture intelligence
   Illustrative mock data. Your NAICS: 336413 · 332710 · 332721
   ═══════════════════════════════════════════════════════════════════ */
window.DAG = (function () {

  /* Top-level departments → sub-commands (org hierarchy).
     spend = $M obligated in your NAICS (12mo), sb = small-biz share %,
     fit = portfolio match to your codes, access = how reachable/SB-friendly,
     trend 5yr spark, contacts = # COs in your network there. */
  const DEPTS = [
    {
      key: 'navy', name: 'Department of the Navy', short: 'NAVY', spend: 890, sb: 32, fit: 92, access: 78,
      color: '#185FA5', contacts: 3, prime: '336413',
      children: [
        { key: 'navsea', name: 'NAVSEA', desc: 'Naval Sea Systems', spend: 410, sb: 30, fit: 90, access: 72, trend: [300,330,360,388,410], contacts: 1 },
        { key: 'navair', name: 'NAVAIR', desc: 'Naval Air Systems', spend: 290, sb: 44, fit: 94, access: 86, trend: [200,230,260,278,290], contacts: 1 },
        { key: 'nswc',   name: 'NSWC',   desc: 'Surface Warfare Centers', spend: 120, sb: 38, fit: 85, access: 80, trend: [80,92,104,112,120], contacts: 1 },
        { key: 'spawar', name: 'NIWC',   desc: 'Information Warfare', spend: 70, sb: 26, fit: 64, access: 58, trend: [40,50,58,64,70], contacts: 0 }
      ]
    },
    {
      key: 'af', name: 'Department of the Air Force', short: 'USAF', spend: 738, sb: 38, fit: 90, access: 74,
      color: '#2C6CB4', contacts: 2, prime: '336413',
      children: [
        { key: 'aflcmc', name: 'AFLCMC', desc: 'Life Cycle Management', spend: 380, sb: 40, fit: 91, access: 76, trend: [260,300,340,360,380], contacts: 1 },
        { key: 'afsc',   name: 'AFSC',   desc: 'Sustainment Center', spend: 210, sb: 36, fit: 78, access: 64, trend: [150,170,185,198,210], contacts: 1 },
        { key: 'ssc',    name: 'SSC',    desc: 'Space Systems Command', spend: 98, sb: 34, fit: 76, access: 60, trend: [40,58,74,86,98], contacts: 1 },
        { key: 'afrl',   name: 'AFRL',   desc: 'Research Laboratory', spend: 50, sb: 30, fit: 58, access: 52, trend: [30,36,42,46,50], contacts: 0 }
      ]
    },
    {
      key: 'army', name: 'Department of the Army', short: 'ARMY', spend: 340, sb: 41, fit: 80, access: 70,
      color: '#378ADD', contacts: 2, prime: '332710',
      children: [
        { key: 'tacom',  name: 'TACOM',  desc: 'Tank-automotive & Armaments', spend: 150, sb: 44, fit: 82, access: 68, trend: [110,124,134,142,150], contacts: 1 },
        { key: 'amcom',  name: 'AMCOM',  desc: 'Aviation & Missile', spend: 110, sb: 40, fit: 84, access: 72, trend: [78,88,98,104,110], contacts: 1 },
        { key: 'usace',  name: 'USACE',  desc: 'Corps of Engineers', spend: 80, sb: 38, fit: 60, access: 66, trend: [60,66,72,76,80], contacts: 0 }
      ]
    },
    {
      key: 'dla', name: 'Defense Logistics Agency', short: 'DLA', spend: 125, sb: 52, fit: 88, access: 90,
      color: '#5E9BD6', contacts: 1, prime: '336413',
      children: [
        { key: 'dla-av', name: 'DLA Aviation', desc: 'Aviation supply chain', spend: 78, sb: 54, fit: 89, access: 92, trend: [54,62,68,73,78], contacts: 1 },
        { key: 'dla-ts', name: 'DLA Troop Support', desc: 'Troop & general supply', spend: 47, sb: 49, fit: 80, access: 86, trend: [32,37,41,44,47], contacts: 0 }
      ]
    },
    {
      key: 'dod4', name: '4th Estate / Defense-Wide', short: '4TH EST', spend: 96, sb: 36, fit: 70, access: 62,
      color: '#94a3b8', contacts: 0, prime: '332710',
      children: [
        { key: 'disa',  name: 'DISA',  desc: 'Information Systems', spend: 44, sb: 30, fit: 62, access: 58, trend: [28,33,38,41,44], contacts: 0 },
        { key: 'darpa', name: 'DARPA', desc: 'Advanced Research', spend: 32, sb: 44, fit: 74, access: 66, trend: [18,22,26,29,32], contacts: 0 },
        { key: 'mda',   name: 'MDA',   desc: 'Missile Defense', spend: 20, sb: 28, fit: 68, access: 54, trend: [12,15,17,19,20], contacts: 0 }
      ]
    }
  ];

  /* Set-aside posture heatmap: % of each dept's eligible $ that goes to each vehicle.
     Higher = friendlier to that set-aside type. */
  const SETASIDES = ['SB', 'SDVOSB', '8(a)', 'HUBZone', 'WOSB', 'Full&Open'];
  const POSTURE = {
    navy:  { SB: 32, SDVOSB: 14, '8(a)': 9,  HUBZone: 4, WOSB: 7,  'Full&Open': 34 },
    af:    { SB: 38, SDVOSB: 11, '8(a)': 12, HUBZone: 6, WOSB: 8,  'Full&Open': 25 },
    army:  { SB: 41, SDVOSB: 16, '8(a)': 14, HUBZone: 9, WOSB: 10, 'Full&Open': 10 },
    dla:   { SB: 52, SDVOSB: 18, '8(a)': 11, HUBZone: 8, WOSB: 12, 'Full&Open': 9 },
    dod4:  { SB: 36, SDVOSB: 9,  '8(a)': 15, HUBZone: 5, WOSB: 8,  'Full&Open': 27 }
  };

  /* per-dept procurement forecast (next 4 quarters, $M expected in your codes) */
  const FORECAST = {
    navy: [120, 145, 132, 160], af: [98, 110, 125, 118], army: [60, 72, 68, 80],
    dla: [28, 34, 31, 38], dod4: [18, 22, 24, 26]
  };

  const NAICS_COLORS = { '336413': '#185FA5', '332710': '#378ADD', '332721': '#8FC0ED' };

  const SORTS = [
    { key: 'fit', label: 'Best fit' },
    { key: 'spend', label: 'Spend' },
    { key: 'sb', label: 'SB share' },
    { key: 'access', label: 'Accessibility' }
  ];

  return { DEPTS, SETASIDES, POSTURE, FORECAST, NAICS_COLORS, SORTS };
})();
