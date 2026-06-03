/* FARaudit · Wage Benchmarks (best-in-class) — data. Illustrative mock.
   SCA wage determinations · BLS OES market · your rates. $/hr. */
window.WAGE = (function () {
  // status: Compliant | Watch | FLAG (below market) ; var = % your vs market
  const WAGES = [
    { wd: 'WD 2015-4267', cat: 'Aircraft Mechanic I', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 28.14, yours: 29.5, market: 28.8, var: 2.4, status: 'Compliant' },
    { wd: 'WD 2015-4267', cat: 'Aircraft Mechanic II', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 31.8, yours: 32.0, market: 32.4, var: -1.2, status: 'Watch' },
    { wd: 'WD 2015-4267', cat: 'Aircraft Inspector I', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 31.22, yours: 31.0, market: 32.1, var: -3.4, status: 'FLAG', insight: 'Your rate is 3.4% below market. Risk of losing inspectors to primes. Adjust +$1.10/hr.' },
    { wd: 'WD 2015-4267', cat: 'Aircraft Inspector II', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 34.5, yours: 34.0, market: 35.2, var: -3.4, status: 'FLAG', insight: '3.4% below market for senior inspectors. Same fix recommended as Inspector I.' },
    { wd: 'WD 2015-4267', cat: 'Sheet Metal Worker', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 26.88, yours: 27.2, market: 27.0, var: 0.7, status: 'Compliant' },
    { wd: 'WD 2015-4267', cat: 'Hydraulics Mechanic', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 29.1, yours: 29.5, market: 29.8, var: -1.0, status: 'Watch' },
    { wd: 'WD 2015-4267', cat: 'Avionics Technician I', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 32.1, yours: 33.0, market: 33.4, var: -1.2, status: 'Watch' },
    { wd: 'WD 2015-4267', cat: 'Avionics Technician II', loc: 'JBSA San Antonio TX', site: 'JBSA', sca: 36.2, yours: 36.5, market: 36.8, var: -0.8, status: 'Watch' },
    { wd: 'WD 2015-3119', cat: 'CNC Machinist I', loc: 'Tinker AFB OK', site: 'Tinker', sca: 24.6, yours: 26.2, market: 25.4, var: 3.1, status: 'Compliant' },
    { wd: 'WD 2015-3119', cat: 'CNC Machinist II', loc: 'Tinker AFB OK', site: 'Tinker', sca: 27.9, yours: 28.1, market: 29.0, var: -3.1, status: 'FLAG', insight: 'Senior machinists 3.1% under market in a tight Oklahoma labor pool. Raise to retain.' },
    { wd: 'WD 2015-3119', cat: 'Quality Inspector', loc: 'Tinker AFB OK', site: 'Tinker', sca: 26.4, yours: 27.0, market: 26.8, var: 0.7, status: 'Compliant' },
    { wd: 'WD 2015-3119', cat: 'Welder / Fabricator', loc: 'Tinker AFB OK', site: 'Tinker', sca: 25.2, yours: 25.4, market: 26.1, var: -2.7, status: 'FLAG', insight: 'Welders 2.7% below market. Skilled-trades shortage — adjust before recompete.' },
    { wd: 'WD 2015-3119', cat: 'Assembler', loc: 'Tinker AFB OK', site: 'Tinker', sca: 21.1, yours: 21.6, market: 21.3, var: 1.4, status: 'Compliant' },
    { wd: 'WD 2015-2188', cat: 'Precision Grinder', loc: 'Robins AFB GA', site: 'Robins', sca: 24.9, yours: 25.0, market: 25.8, var: -3.1, status: 'FLAG', insight: 'Grinders 3.1% under market. Niche skill — premium needed to compete with depot hiring.' },
    { wd: 'WD 2015-2188', cat: 'CMM Operator', loc: 'Robins AFB GA', site: 'Robins', sca: 27.3, yours: 28.0, market: 27.6, var: 1.4, status: 'Compliant' },
    { wd: 'WD 2015-2188', cat: 'Toolmaker', loc: 'Robins AFB GA', site: 'Robins', sca: 28.8, yours: 29.1, market: 29.9, var: -2.7, status: 'FLAG', insight: 'Toolmakers 2.7% below market. High-value skill — close the gap or risk attrition.' },
    { wd: 'WD 2015-2188', cat: 'Materials Handler', loc: 'Robins AFB GA', site: 'Robins', sca: 18.4, yours: 19.0, market: 18.6, var: 2.2, status: 'Compliant' },
    { wd: 'WD 2015-4419', cat: 'NDT Technician', loc: 'Wright-Patterson OH', site: 'WPAFB', sca: 30.6, yours: 31.5, market: 31.0, var: 1.6, status: 'Compliant' },
    { wd: 'WD 2015-4419', cat: 'Composite Tech', loc: 'Wright-Patterson OH', site: 'WPAFB', sca: 27.7, yours: 27.9, market: 28.7, var: -2.8, status: 'FLAG', insight: 'Composite techs 2.8% below market. Growing demand — adjust to hold your bench.' },
    { wd: 'WD 2015-4419', cat: 'Calibration Tech', loc: 'Wright-Patterson OH', site: 'WPAFB', sca: 29.2, yours: 29.8, market: 29.5, var: 1.0, status: 'Compliant' }
  ];

  const LOCATIONS = [
    { key: 'all', label: 'All sites' }, { key: 'JBSA', label: 'JBSA' }, { key: 'Tinker', label: 'Tinker' },
    { key: 'Robins', label: 'Robins' }, { key: 'WPAFB', label: 'WPAFB' }
  ];
  const STATUSES = [
    { key: 'all', label: 'All' }, { key: 'FLAG', label: 'Below market' },
    { key: 'Watch', label: 'Watch' }, { key: 'Compliant', label: 'Compliant' }
  ];
  const STATUS_META = {
    Compliant: { label: 'Compliant', color: '#059669', rank: 1 },
    Watch:     { label: 'Watch', color: '#d97706', rank: 2 },
    FLAG:      { label: 'Below Market', color: '#dc2626', rank: 3 }
  };

  const RENEWALS = [
    { wd: 'WD 2015-4267', loc: 'JBSA San Antonio TX', days: 22, tone: 'red' },
    { wd: 'WD 2015-3119', loc: 'Tinker AFB OK', days: 58, tone: 'amber' },
    { wd: 'WD 2015-2188', loc: 'Robins AFB GA', days: 95, tone: 'blue' }
  ];

  const SORTS = ['Variance', 'Your rate', 'Category'];
  return { WAGES, LOCATIONS, STATUSES, STATUS_META, RENEWALS, SORTS };
})();
