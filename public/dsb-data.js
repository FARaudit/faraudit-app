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
  STATUS: { state: 'loading', reason: '' },
  /* WHEN THIS BROWSER LAST ASKED — a different fact from `as_of`, which is when
     the feed itself was measured. `checkedAt` of null means no read has
     completed yet, which is not the same as a read that returned nothing. */
  FRESHNESS: { checkedAt: null, state: 'loading', reason: '' }
};
