/* FARaudit · Teaming Partners — Fork B live wiring.
   Fetches /api/teaming-partners?naics=336413 (real SAM.gov entity search,
   SAM_API_KEY-backed). Maps SAM entity records into the window.TEAM.PARTNERS
   shape and re-renders via team-app.js.

   Bug A fix: previous version targeted bare global `PARTNERS`, which is
   closure-scoped inside team-data.js IIFE and undefined globally — silent
   no-op. Now writes window.TEAM.PARTNERS correctly.

   TODO: pull user's NAICS list from /api/capability-statement, call this
   route per NAICS, union results. Compute fit/complement against MY profile.
   Currently defaults fit=75/complement=50 and hard-codes the primary NAICS. */
(function () {
  'use strict';

  function mapPartner(p, i) {
    const naics =
      Array.isArray(p.naics_codes) ? p.naics_codes :
      p.naics ? [p.naics] : ['336413'];
    const certs =
      Array.isArray(p.certifications) ? p.certifications :
      p.business_size ? [p.business_size] : [];
    const valueRaw = p.past_performance_value || p.total_awards || 0;
    return {
      id:         'live-' + (p.uei || p.cage_code || i),
      name:       p.legal_business_name || p.name || '',
      loc:        [p.city, p.state].filter(Boolean).join(', '),
      naics,
      certs,
      agencies:   Array.isArray(p.agencies) ? p.agencies : [],
      value:      typeof valueRaw === 'number' ? valueRaw / 1e6 : 0,
      fit:        75,        // TODO: compute from NAICS overlap with TEAM.MY
      complement: 50,        // TODO: compute from cert + agency complementarity
      insight:    p.insight || '',
      cage:       p.cage_code || '',
      uei:        p.uei || ''
    };
  }

  async function wire() {
    try {
      const res = await fetch('/api/teaming-partners?naics=336413', { credentials: 'include' });
      if (!res.ok) throw new Error('teaming-partners fetch failed: ' + res.status);
      const data = await res.json();
      const partners = Array.isArray(data.partners) ? data.partners : [];
      if (!partners.length) return;
      if (!window.TEAM || !Array.isArray(window.TEAM.PARTNERS)) return;

      const mapped = partners.map(mapPartner);
      window.TEAM.PARTNERS.length = 0;
      window.TEAM.PARTNERS.push(...mapped);

      if (window.TEAM_APP && typeof window.TEAM_APP.render === 'function') {
        window.TEAM_APP.render();
      }
    } catch (e) {
      console.error('[teaming-partners-live] wire failed:', e);
    }
  }

  const obs = new MutationObserver(() => {
    if (window.TEAM_APP && typeof window.TEAM_APP.onThemeChange === 'function') {
      window.TEAM_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
