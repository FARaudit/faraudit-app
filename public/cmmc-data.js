/* FARaudit · CMMC Readiness — data shape only.

   This file ships NO assessment. The page is served by /api/cmmc-readiness
   from the CMMC requirements found in the customer's own audited
   solicitations, and cmmc-readiness-live.js installs it here before the
   first render.

   `state` is the discriminator the renderer keys on:
     loading | ready | empty | error */
window.CMMC = {
  DISTRIBUTION: { '0': 0, '1': 0, '2': 0, '3': 0 },
  BY_LEVEL: { '1': [], '2': [], '3': [] },
  REFERENCE: {},
  meta: { state: 'loading', reason: null, totalAudited: 0, unanalyzed: 0 }
};
