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

      // PLAN SCALARS ARE ASSIGNED HERE, BEFORE THE CAPABILITY-STATEMENT READ.
      // They come from /api/profile, which has already succeeded by this line. The
      // capability-statement read below rethrows on failure, so anything assigned after
      // it is undefined whenever that record is unreadable — and an undefined plan
      // renders as "No subscription on file", which is a different claim from "could
      // not be read". Billing's three-answer guard only works if these are set.
      window.PS.plan_tier       = data.plan_tier;
      window.PS.plan_label      = data.plan_label;
      window.PS.plan_status     = data.plan_status;
      window.PS.plan_period_end = data.plan_period_end;
      window.PS.plan_unreadable = !!data.plan_unreadable;

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
          // THE SAVED ARRAY, not the displayed one. statement.naics_codes is a
          // read-time overlay that falls back to codes derived from won audits, so
          // editing it and writing it back would persist a suggestion as the record.
          // naics_derived is offered separately, and only becomes yours if you add it.
          (Array.isArray(cap.naics_saved) ? cap.naics_saved : [])
            .forEach(function (n) { if (n) window.PS.NAICS.push({ code: String(n) }); });
          window.PS.NAICS_DERIVED = (Array.isArray(cap.naics_derived) ? cap.naics_derived : [])
            .map(String);
          (Array.isArray(rec.certifications) ? rec.certifications : [])
            .forEach(function (k) { if (k) window.PS.CERTS.push({ k: String(k), on: true }); });
        } else {
          throw new Error('capability-statement: HTTP ' + capRes.status);
        }
      } catch (e) {
        // RETHROW, so the company record's failure reaches loadError. A read that did
        // not complete may not present itself as a form to fill in: blank inputs over a
        // live Save button write empty strings into company_name, uei, cage_code and
        // contact_address, and a body carrying `uei` also drives the route's
        // certification sync down its no-UEI branch, clearing verified eligibility.
        throw e;
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

      // Plan scalars were assigned before the capability-statement read, above.

      window.PS.loadError = false;
      writeHeaderStats();

      if (window.PS_APP && typeof window.PS_APP.render === 'function') {
        window.PS_APP.render();
      }
      setLivePill(true);
    } catch (e) {
      console.error('[profile-settings-live] wire failed:', e);
      // A failed read is a FAILURE, not an empty account. Nothing may be left
      // standing from before, and the header counters may not keep claiming a
      // total nobody could read.
      window.PS.loadError = true;
      window.PS.NAICS.length = 0;
      window.PS.CERTS.length = 0;
      window.PS.TEAM.length  = 0;
      Object.keys(window.PS.COMPANY).forEach(function (k) { window.PS.COMPANY[k] = ''; });
      writeHeaderStats();
      if (window.PS_APP && typeof window.PS_APP.render === 'function') {
        window.PS_APP.render();
      }
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
  /* The three header counters shipped as LITERALS in the markup — 3 NAICS, 6 Agencies,
     2 Certs — and no script on this page ever touched them. They matched nobody's
     account, and the Agencies figure contradicted the Agencies tab, which reads zero
     from the same page load. A number nothing computes is decoration wearing the
     costume of a measurement.
     Agencies renders an em dash, not 0: agency scoping has no source at all, and 0 is
     a count. Absent is not zero. */
  function writeHeaderStats() {
    const err = !!window.PS.loadError;
    const put = function (id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    put('hsNaics', err ? '—' : String(window.PS.NAICS.length));
    put('hsCerts', err ? '—' : String(window.PS.CERTS.length));
    put('hsAgencies', '—');
  }

  /* ── NAICS: add and remove ──────────────────────────────────────────────────
     The API takes the WHOLE array, so both operations send the full intended list
     and are confirmed by SET EQUALITY against the server's echo — not by a 2xx, and
     not against the local array. A write that silently dropped or kept a code would
     otherwise report success. Delegated, because the panel is re-templated on every
     nav click and theme flip, which detaches a directly-bound listener. */
  const CODE_RE = /^\d{6}$/;

  function naicsMsg(text, kind) {
    const el = document.getElementById('psNaicsMsg');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'naics-msg' + (kind ? ' ' + kind : '');
  }
  function currentCodes() {
    return window.PS.NAICS.map(function (n) { return String(n.code); });
  }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(function (c) { return s.has(c); });
  }
  function adoptCodes(codes) {
    window.PS.NAICS.length = 0;                    // mutate in place — ps-app holds the reference
    codes.forEach(function (c) { window.PS.NAICS.push({ code: String(c) }); });
    writeHeaderStats();
    if (window.PS_APP && typeof window.PS_APP.render === 'function') window.PS_APP.render();
  }

  /* READ THE SAVED ARRAY, THEN WRITE. The panel's list is a render of a fetch that may
     be minutes old, and the capability statement edits the same row from another tab.
     A whole-array replace built from page state can reinstate codes deleted elsewhere,
     or drop ones added there. The mutator is applied to what the row holds NOW, never
     to what the screen shows. */
  async function savedCodes() {
    const res = await fetch('/api/capability-statement', { credentials: 'include' });
    if (!res.ok) throw new Error('read failed');
    const cap = await res.json();
    if (!Array.isArray(cap && cap.naics_saved)) throw new Error('read failed');
    return cap.naics_saved.map(String);
  }

  async function writeCodes(mutate, okMsg, failMsg) {
    let next;
    try {
      next = mutate(await savedCodes());
    } catch (_) {
      throw new Error(failMsg);   // could not establish what is on file — write nothing
    }
    const res = await fetch('/api/capability-statement', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ naics_codes: next })
    });
    const body = await res.json().catch(() => null);
    // The envelope only. Accepting `body` itself as the record reads every field as
    // absent and reports an outage as an empty list.
    const rec = body && body.statement;
    if (!res.ok || !rec || !Array.isArray(rec.naics_codes)) throw new Error(failMsg);
    const saved = rec.naics_codes.map(String);
    if (!sameSet(saved, next)) throw new Error(failMsg);
    adoptCodes(saved);
    naicsMsg(okMsg, 'ok');
  }

  document.addEventListener('click', async function (e) {
    const t = e.target && e.target.closest;
    if (!t) return;

    const rm = e.target.closest('[data-naics-rm]');
    if (rm) {
      const code = rm.getAttribute('data-naics-rm');
      rm.disabled = true;
      naicsMsg('Removing ' + code + '…', 'wait');
      try {
        await writeCodes(
          function (saved) { return saved.filter(function (c) { return c !== code; }); },
          code + ' removed.',
          'Could not remove ' + code + ' — nothing was changed.');
      } catch (err) {
        naicsMsg(err.message, 'err');   // DOM untouched: the list still shows what is on file
        rm.disabled = false;
      }
      return;
    }

    // Adopting a suggestion is an explicit click, and it saves ONLY that code —
    // never the whole derived set, which is how a suggestion becomes a record by
    // accident.
    const sugg = e.target.closest('[data-naics-add]');
    if (sugg) {
      const code = sugg.getAttribute('data-naics-add');
      sugg.disabled = true;
      naicsMsg('Adding ' + code + '…', 'wait');
      try {
        await writeCodes(
          function (saved) { return saved.indexOf(code) >= 0 ? saved : saved.concat([code]); },
          code + ' added to your profile.',
          'Could not add ' + code + ' — nothing was changed.');
      } catch (err) {
        naicsMsg(err.message, 'err');
        sugg.disabled = false;
      }
      return;
    }

    const addBtn = e.target.closest('#psNaicsAdd');
    if (addBtn) {
      const input = document.getElementById('psNaicsInput');
      if (!input) return;
      const code = String(input.value || '').trim();
      if (!CODE_RE.test(code)) { naicsMsg('A NAICS code is exactly six digits.', 'err'); return; }
      if (currentCodes().indexOf(code) >= 0) { naicsMsg(code + ' is already on your list.', 'err'); return; }
      addBtn.disabled = true;
      naicsMsg('Adding ' + code + '…', 'wait');
      try {
        await writeCodes(
          // Re-checked against the row, not the screen: it may have been added elsewhere.
          function (saved) { return saved.indexOf(code) >= 0 ? saved : saved.concat([code]); },
          code + ' added.',
          'Could not add ' + code + ' — nothing was changed.');
      } catch (err) {
        naicsMsg(err.message, 'err');
      } finally {
        addBtn.disabled = false;
        const el = document.getElementById('psNaicsInput');
        if (el) el.value = '';
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (!el || el.id !== 'psNaicsInput') return;
    e.preventDefault();
    const add = document.getElementById('psNaicsAdd');
    if (add) add.click();
  });

  /* The unavailable reason is PRINTED FROM THE ROUTE, not re-authored here. One
     sentence with one source: if agency targeting ships, the route stops saying
     "unwired" and this panel stops saying it too, with nothing to remember to edit. */
  async function writeAgencyState() {
    const el = document.getElementById('agState');
    if (!el) return;
    try {
      const res = await fetch('/api/agencies', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (d && d.state === 'unwired') {
        el.textContent = d.reason || 'Agency targeting is not built yet.';
      } else {
        el.textContent = 'Agency targeting reported a state this page does not recognise.';
      }
    } catch (_) {
      el.textContent = 'Could not check whether agency targeting is available.';
    }
  }

  function note(msg, ok) {
    const el = document.getElementById('psSavedNote');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', !ok);
  }

  /* The account spans TWO records: full_name is auth identity (/api/profile), the rest
     is the capability statement (/api/capability-statement). One button, two writes, so
     "Saved" may only be said when BOTH landed. A partial save reports which half landed
     and which did not — saying "✓ Saved" over a half-write is the same lie as saying it
     over no write at all, and harder to notice.
     Every field is confirmed against the SERVER'S ECHO, never against the input box. */
  const CAP_FIELDS = [
    { id: 'psCompanyName', col: 'company_name',    label: 'Company name' },
    { id: 'psUei',         col: 'uei',             label: 'SAM.gov UEI' },
    { id: 'psCage',        col: 'cage_code',       label: 'CAGE code' },
    { id: 'psAddress',     col: 'contact_address', label: 'Business address' }
  ];

  document.addEventListener('click', async function (e) {
    const btn = e.target && e.target.closest && e.target.closest('#psSaveBtn');
    if (!btn) return;
    const nameInput = document.getElementById('psFullName');
    if (!nameInput) return;
    const full_name = nameInput.value.trim();

    const patch = {};
    CAP_FIELDS.forEach(function (f) {
      const el = document.getElementById(f.id);
      if (el) patch[f.col] = el.value.trim();
    });

    btn.disabled = true;
    note('Saving…', true);
    const failed = [];
    try {
      // ── identity ──
      try {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ full_name })
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || body.full_name !== full_name) {
          failed.push('Full name');
        } else {
          window.PS.COMPANY.contact = body.full_name;
          document.querySelectorAll('.sb-avatar-name, .user-chip .nm').forEach(function (el) {
            el.textContent = body.full_name;
          });
        }
      } catch (_) { failed.push('Full name'); }

      // ── company record ──
      if (Object.keys(patch).length) {
        try {
          const res = await fetch('/api/capability-statement', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch)
          });
          const body = await res.json().catch(() => null);
          const rec = body && (body.statement || body);
          if (!res.ok || !rec || typeof rec !== 'object') {
            CAP_FIELDS.forEach(function (f) { failed.push(f.label); });
          } else {
            // Per FIELD, against the echo. An empty box is stored as null, so compare
            // the round-trip the way the server stores it, not the way the box reads.
            CAP_FIELDS.forEach(function (f) {
              const want = patch[f.col] === '' ? null : patch[f.col];
              const got  = rec[f.col] === undefined ? null : rec[f.col];
              if ((got || null) !== (want || null)) { failed.push(f.label); return; }
              if (f.col === 'company_name')    window.PS.COMPANY.name    = patch[f.col];
              if (f.col === 'uei')             window.PS.COMPANY.uei     = patch[f.col];
              if (f.col === 'cage_code')       window.PS.COMPANY.cage    = patch[f.col];
              if (f.col === 'contact_address') window.PS.COMPANY.address = patch[f.col];
            });
          }
        } catch (_) { CAP_FIELDS.forEach(function (f) { failed.push(f.label); }); }
      }

      if (!failed.length) note('✓ Saved', true);
      else if (failed.length >= CAP_FIELDS.length + 1) note('Nothing saved — reload and try again', false);
      else note('Partly saved · did NOT save: ' + failed.join(', '), false);
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

  /* #agState only exists while that tab is rendered, and the panel is re-templated on
     every nav click AND every theme flip. Watching the container catches both; binding
     to the nav alone would miss the theme path and leave the box reading "Checking…". */
  function watchPanels() {
    const host = document.getElementById('setContent');
    if (!host || typeof MutationObserver !== 'function') return;
    const fill = function () {
      const el = document.getElementById('agState');
      if (el && el.dataset.filled !== '1') { el.dataset.filled = '1'; writeAgencyState(); }
    };
    new MutationObserver(fill).observe(host, { childList: true, subtree: true });
    fill();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(); watchPanels(); });
  } else {
    wire(); watchPanels();
  }
})();
