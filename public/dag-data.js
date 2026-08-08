/* FARaudit · Defense Agencies — data shape only.

   This file ships NO offices. Everything rendered comes from /api/agencies, which
   derives the buying offices from this customer's own NAICS codes and the live SAM
   window. Nothing here is a fallback: an empty array means the request has not
   answered yet, and agencies-live.js records which of the possible answers it was. */
window.DAG = {
  OFFICES: [],
  META: null,
  STATUS: { state: 'loading', reason: '' }
};
