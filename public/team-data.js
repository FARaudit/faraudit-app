/* FARaudit · Teaming Partners — data shape only.

   This file ships NO partners. The page is served by /api/teaming-partners
   from SAM entity registrations matching the customer's own NAICS codes, and
   teaming-partners-live.js installs the result here before the first render.

   `state` is the discriminator the renderer keys on:
     loading | ready | empty | error */
window.TEAM = {
  PARTNERS: [],
  SCOPE: { codes: [], source: null },
  meta: { state: 'loading', reason: null, perCode: {}, stateFilter: null, setAside: null, setAsideOptions: [] }
};
