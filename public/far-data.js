/* FARaudit · FAR/DFARS Updates — data shell.
   Records arrive at runtime from /api/regulatory-updates. Nothing is seeded here:
   an unreachable feed renders as unavailable, never as content. */
window.FARD = (function () {
  // type: DFARS (252.x) | FAR (52.x) | Deviation ; impact: HIGH|MEDIUM|LOW
  const UPDATES = [];

  const TYPES = [
    { key: 'all', label: 'All' }, { key: 'DFARS', label: 'DFARS' },
    { key: 'FAR', label: 'FAR' }, { key: 'Deviation', label: 'Deviation' }
  ];
  const IMPACTS = [
    { key: 'all', label: 'All' }, { key: 'HIGH', label: 'High' },
    { key: 'MEDIUM', label: 'Med' }, { key: 'LOW', label: 'Low' }
  ];
  const IMPACT_META = {
    HIGH:   { label: 'High', color: '#dc2626', rank: 3 },
    MEDIUM: { label: 'Medium', color: '#d97706', rank: 2 },
    LOW:    { label: 'Low', color: '#64748b', rank: 1 }
  };
  const TYPE_COLOR = { DFARS: '#185FA5', FAR: '#378ADD', Deviation: '#7c3aed' };

  // Effective-date countdowns. Derived from UPDATES at render time.
  const EFFECTIVE = [];

  // Solicitations in the signed-in account touched by a clause change.
  const AFFECTED = [];

  const SORTS = ['Newest', 'Impact', 'Most amended'];

  /* Feed state. 'loading' until the API answers; 'ok' with however many records
     arrived; 'unavailable' when the sources could not be reached. Counts render as
     em dashes under 'unavailable' — a zero there would be a number nobody counted. */
  const STATUS = { state: 'loading', sources: [], reason: '' };

  return { UPDATES, TYPES, IMPACTS, IMPACT_META, TYPE_COLOR, EFFECTIVE, AFFECTED, SORTS, STATUS };
})();
