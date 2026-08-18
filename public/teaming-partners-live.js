/* FARaudit · Teaming Partners — live wiring.

   Fetches /api/teaming-partners and installs the result on window.TEAM, then
   renders. The request carries no NAICS: the server answers with the customer's
   own codes, so this page cannot show one account's market to another.

   There is no fallback dataset. An empty answer renders as empty with its
   reason named — "SAM answered and nothing is registered" and "SAM could not be
   asked" require opposite actions from the customer and must not look alike. */
(function () {
  'use strict';

  function apply(next) {
    window.TEAM.PARTNERS = Array.isArray(next.partners) ? next.partners : [];
    window.TEAM.SCOPE = next.scope && typeof next.scope === 'object' ? next.scope : { codes: [], source: null };
    const m = next.meta || {};
    window.TEAM.meta = {
      state: window.TEAM.PARTNERS.length > 0 ? 'ready' : 'empty',
      reason: m.reason || null,
      perCode: m.per_code || {},
      stateFilter: m.state || null,
      setAside: m.set_aside || null,
      // How many SAM holds vs how many arrived. The renderer says so when they differ.
      totalAvailable: typeof m.total_available === 'number' ? m.total_available : null,
      shown: typeof m.shown === 'number' ? m.shown : window.TEAM.PARTNERS.length,
      // The certifications SAM can actually be filtered on, named by the server so the codes
      // live in one place. Absent from a response means keep whatever we already had.
      setAsideOptions: Array.isArray(m.set_aside_options) ? m.set_aside_options : (window.TEAM.meta && window.TEAM.meta.setAsideOptions) || []
    };
  }

  function fail(detail) {
    window.TEAM.PARTNERS = [];
    const keep = (window.TEAM.meta && window.TEAM.meta.setAsideOptions) || [];
    window.TEAM.meta = { state: 'error', reason: 'fetch-failed', detail: detail || null, perCode: {}, stateFilter: null, setAside: null, totalAvailable: null, shown: 0, setAsideOptions: keep };
  }

  function paint() {
    if (window.TEAM_APP && typeof window.TEAM_APP.render === 'function') window.TEAM_APP.render();
  }

  async function load(opts) {
    const o = opts || {};
    const params = new URLSearchParams();
    if (o.naics) params.set('naics', o.naics);
    if (o.setAside) params.set('setAside', o.setAside);
    const qs = params.toString();
    try {
      const res = await fetch('/api/teaming-partners' + (qs ? '?' + qs : ''), { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.partners)) {
        fail(res.status === 401 ? 'Session expired' : 'HTTP ' + res.status);
      } else {
        apply(data);
      }
    } catch (e) {
      fail(e && e.message ? e.message : null);
    }
    paint();
  }

  // A NAICS or set-aside change is a server round-trip against SAM, not a
  // client-side filter of rows already held.
  window.TEAM_LOAD = load;

  const obs = new MutationObserver(() => {
    if (window.TEAM_APP && typeof window.TEAM_APP.onThemeChange === 'function') window.TEAM_APP.onThemeChange();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => load({}));
  else load({});
})();
