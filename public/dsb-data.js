/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Defense Spending — data container.

   Holds NO figures. Everything on this page arrives from
   /api/defense-spending, which reads USAspending obligations out of
   defense_spending_intel.

   STATUS starts at 'loading', NOT 'unwired': the data region is torn out only
   for a SETTLED failure, so a successful response always has a DOM to fill.
   ═══════════════════════════════════════════════════════════════════ */
window.DSB = {
  FYS: [],
  BY_FY: {},
  MARKET_TREND: { labels: [], series: {}, open: [] },
  RECOMPETES: [],
  AGENCY_FILTERS: [{ key: 'all', label: 'All' }],
  coverage: null,
  as_of: null,
  unsupported: [],
  STATUS: { state: 'loading', reason: '' }
};
