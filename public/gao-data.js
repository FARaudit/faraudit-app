/* FARaudit · GAO Protests — data shape only.

   This file ships NO decisions. The page is served by /api/protest-intel from
   GAO's published decision feed, and gao-protests-live.js installs the result
   here before the first render.

   `state` is the discriminator the renderer keys on:
     loading | ready | empty | error */
window.GAO = {
  DECISIONS: [],
  AGENCIES: [],
  meta: { state: 'loading', reason: null, upstreamStatus: null, fetchedAt: null, source: null }
};
