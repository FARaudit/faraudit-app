/* FARaudit · Profile & Settings — live wiring (render-layer pattern).
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
      // The name field is EDITABLE, so it must show what is stored — not the email as a
      // stand-in. Falling back to the email made an unset name look already filled in.
      c.contact = data.full_name  || '';
      c.phone   = '';   // no source field anywhere yet

      // The COMPANY record HAS a source — capability_statements — and it is the same record
      // the audit engine reads. Settings shows it READ-ONLY; the capability statement tab
      // edits it. A failed read leaves the fields empty and flags the body, because "not on
      // file" and "could not be read" are different answers and only one is fixable by
      // typing something in.
      c.name = ''; c.cage = ''; c.uei = ''; c.address = '';
      window.PS.CERTS.length = 0;
      window.PS.NAICS.length = 0;
      try {
        const capRes = await fetch('/api/capability-statement', { credentials: 'include' });
        if (capRes.ok) {
          const cap = await capRes.json();
          // The route returns { statement, stub }. Reading `cap` itself as a last resort
          // accepted the envelope as the record, which reads every field as absent and
          // reports it as "Not on file" — an outage wearing the same face as an empty
          // record. If the shape is not what the route documents, say so instead.
          const rec = cap && cap.statement;
          if (!rec || typeof rec !== 'object') {
            document.body.classList.add('company-unreadable');
            throw new Error('capability-statement: no statement in response');
          }
          // These are the column names. Reading rec.cage and rec.address — which the
          // route has never returned — is why this page said "CAGE code: Not on file"
          // over a record holding one.
          c.name    = rec.company_name    || '';
          c.cage    = rec.cage_code       || '';
          c.uei     = rec.uei             || '';
          c.address = rec.contact_address || '';
          (Array.isArray(rec.naics_codes) ? rec.naics_codes : [])
            .forEach(function (n) { if (n) window.PS.NAICS.push({ code: String(n) }); });
          (Array.isArray(rec.certifications) ? rec.certifications : [])
            .forEach(function (k) { if (k) window.PS.CERTS.push({ k: String(k), on: true }); });
        } else {
          document.body.classList.add('company-unreadable');
        }
      } catch (e) {
        document.body.classList.add('company-unreadable');
      }

      // Cleared — agencies / notifs / usage still have no source field.
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
      setLivePill(true);
    } catch (e) {
      console.error('[profile-settings-live] wire failed:', e);
      document.body.classList.add('data-error');
      setLivePill(false);
    } finally {
      document.body.classList.remove('is-loading');
    }
  }

  /* The green LIVE pill is a claim about THIS page's data, so only a settled fetch
     may turn it on — it ships hidden and stays hidden when the profile could not be
     loaded. Gated by test/public/_rail-live-badge.test.ts Part L. */
  function setLivePill(on) {
    const pill = document.getElementById('livePill');
    if (pill) pill.hidden = !on;
  }

  /* SAVE — the person, and only the person.
     This page previously rendered a "Save changes" button, a "✓ Saved" badge and the line
     "changes save automatically" over a form with NO write path at all: every keystroke was
     discarded and the page said it had saved. So this handler reports only what the server
     confirms, and says the word "saved" in exactly one case — a 2xx whose echoed value
     matches what was sent. Delegated, because ps-app.js re-templates the panel on render
     and on every theme flip, which detaches any directly-bound listener. */
  function note(msg, ok) {
    const el = document.getElementById('psSavedNote');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', !ok);
  }

  document.addEventListener('click', async function (e) {
    const btn = e.target && e.target.closest && e.target.closest('#psSaveBtn');
    if (!btn) return;
    const input = document.getElementById('psFullName');
    if (!input) return;
    const full_name = input.value.trim();
    btn.disabled = true;
    note('Saving…', true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { note((body && body.error) || ('Could not save (HTTP ' + res.status + ')'), false); return; }
      // Believe the SERVER's echo, not the input box. The route reads the value back from
      // the persisted user before returning it, so a mismatch here means it did not land.
      if (!body || body.full_name !== full_name) { note('Save did not persist — reload and try again', false); return; }
      window.PS.COMPANY.contact = body.full_name;
      document.querySelectorAll('.sb-avatar-name').forEach(function (el) { el.textContent = body.full_name; });
      note('✓ Saved', true);
    } catch (err) {
      note('Could not reach the server', false);
    } finally {
      btn.disabled = false;
    }
  });

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
