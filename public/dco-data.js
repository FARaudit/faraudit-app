/* FARaudit · Contracting Officers — data shape only.

   This file ships NO officers. The directory is served by
   /api/ko-intelligence from the points of contact SAM published on the
   notices in the signed-in customer's feed, and contracting-officers-live.js
   installs it here before the first render.

   `state` is the discriminator the renderer keys on:
     loading | ready | empty | error
   It starts at `loading`, and only the live fetch moves it. */
window.DCO = {
  OFFICERS: [],
  AGENCY_FILTERS: ['all'],
  meta: { state: 'loading', reason: null, source: null, noticeCount: 0, windowDays: null }
};
