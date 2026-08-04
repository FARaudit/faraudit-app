/* FARaudit · Wage Benchmarks — data shape only.

   This file ships NO rates. The page is served by /api/labor-rates, and
   wage-benchmarks-live.js installs the result here before the first render.

   `state` is the discriminator the renderer keys on:
     loading | ready | empty | error */
window.WAGE = {
  RATES: [],
  SCOPE: { codes: [], source: null },
  meta: { state: 'loading', reason: null, curated: 0, liveAwarded: 0, query: null, naics: null }
};
