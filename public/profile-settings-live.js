/* FARaudit · Profile & Settings — live wiring (Fork B render-layer pattern).
   Fetches /api/profile, mutates window.PS in place, calls window.PS_APP.render().
   ps-app.js is the structural truth; this file only swaps data. */
(function () {
  'use strict';

  async function wire() {
    try {
      document.body.classList.add('is-loading');
      const res = await fetch('/api/profile', { credentials: 'include' });
      if (!res.ok) throw new Error('profile fetch failed: ' + res.status);
      const data = await res.json();

      if (!window.PS) return;

      // Wire identity from Supabase auth (email + full_name).
      const c = window.PS.COMPANY;
      c.email   = data.email      || '';
      c.contact = data.full_name  || data.email || '';
      c.name    = '';   // TODO: user profile table needed
      c.cage    = '';   // TODO: user profile table needed
      c.uei     = '';   // TODO: user profile table needed
      c.address = '';   // TODO: user profile table needed
      c.phone   = '';   // TODO: user profile table needed

      // Clear mock arrays — no source table yet for these.
      // TODO: user profile table needed for certs / naics / agencies / notifs / usage.
      window.PS.CERTS.length    = 0;
      window.PS.NAICS.length    = 0;
      window.PS.AGENCIES.length = 0;
      window.PS.NOTIFS.length   = 0;
      window.PS.USAGE.length    = 0;

      // Team: render the signed-in user as the workspace owner.
      window.PS.TEAM.length = 0;
      window.PS.TEAM.push({
        name:  data.full_name || data.email || 'You',
        email: data.email || '',
        role:  'OWNER',
        you:   true
      });

      // Scalar plan fields — exposed for billing panel reads.
      window.PS.plan_tier          = data.plan_tier;
      window.PS.plan_label         = data.plan_label;
      window.PS.plan_price_monthly = data.plan_price_monthly;
      window.PS.plan_price_annual  = data.plan_price_annual;

      if (window.PS_APP && typeof window.PS_APP.render === 'function') {
        window.PS_APP.render();
      }
    } catch (e) {
      console.error('[profile-settings-live] wire failed:', e);
      document.body.classList.add('data-error');
    } finally {
      document.body.classList.remove('is-loading');
    }
  }

  // Theme re-render — ps-app.js re-templates panel HTML on theme flip.
  const obs = new MutationObserver(() => {
    if (window.PS_APP && typeof window.PS_APP.onThemeChange === 'function') {
      window.PS_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
