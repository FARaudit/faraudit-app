/* uei-editor.js — the UEI/CAGE identity block on /capability-statement.
 *
 * Reads and writes GET/PATCH /api/capability-statement, the same path the NAICS
 * editor uses, so there is a single writer. PATCHing `uei` triggers
 * syncCertifications() server-side, which reads the SAM Entity record and
 * persists the verified programs.
 *
 * Built with DOM methods, never innerHTML: this file is served verbatim to the
 * browser and every value it renders comes from the network.
 *
 * Rendering rules:
 *  - a value not on file renders as an explicit "not on file", never as a
 *    plausible-looking placeholder;
 *  - a read that does not succeed says so, and does not imply the profile is blank;
 *  - a write that does not succeed keeps the customer's text and reports that no
 *    save occurred;
 *  - the SERVER ECHO is what is rendered back, never the local string.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  // SAM assigns a 12-character alphanumeric UEI. Reject early rather than
  // letting SAM answer "not found" for what is really a typo.
  var UEI_RE = /^[A-Z0-9]{12}$/;

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function css(n, s) { for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) n.style[k] = s[k]; return n; }

  function cell(label, valueId) {
    var c = el('div', 'lh-code');
    c.appendChild(el('div', 'k', label));
    var v = el('div', 'v', '—');
    v.id = valueId;
    c.appendChild(v);
    return c;
  }

  function mount(host) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(cell('CAGE', 'ueCage'));
    host.appendChild(cell('UEI', 'ueUei'));

    var wrap = css(el('div', 'lh-code'), { gridColumn: 'span 2' });
    wrap.appendChild(el('div', 'k', 'SAM registration'));

    var row = css(el('div'), { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' });
    var input = el('input');
    input.id = 'ueInput';
    input.maxLength = 12;
    input.placeholder = '12-character SAM UEI';
    css(input, {
      flex: '1', minWidth: '0', fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px',
      padding: '5px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,.18)',
      background: 'rgba(255,255,255,.04)', color: '#fff', textTransform: 'uppercase'
    });
    var save = el('button', null, 'SAVE');
    save.id = 'ueSave';
    save.type = 'button';
    css(save, {
      fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px', fontWeight: '700',
      letterSpacing: '.06em', padding: '6px 11px', borderRadius: '4px', cursor: 'pointer',
      border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.08)', color: '#fff'
    });
    row.appendChild(input);
    row.appendChild(save);
    wrap.appendChild(row);

    var m = el('div');
    m.id = 'ueMsg';
    css(m, { fontSize: '10px', marginTop: '5px', color: '#aebbcf', minHeight: '13px' });
    wrap.appendChild(m);
    host.appendChild(wrap);

    var msg = function (t, kind) {
      m.textContent = t || '';
      m.style.color = kind === 'err' ? '#fca5a5' : kind === 'ok' ? '#86efac' : '#aebbcf';
    };

    // "not on file" is a FACT about the profile; "could not read" is a fact
    // about the request. They are never collapsed into the same rendering.
    function paint(st) {
      $('ueCage').textContent = (st && st.cage_code) ? st.cage_code : 'not on file';
      $('ueUei').textContent = (st && st.uei) ? st.uei : 'not on file';
      if (st && st.uei) input.value = st.uei;
    }

    save.onclick = function () {
      var v = String(input.value || '').trim().toUpperCase();
      if (!UEI_RE.test(v)) { msg('A SAM UEI is exactly 12 letters or digits.', 'err'); return; }
      save.disabled = true;
      msg('Saving and checking SAM…', 'wait');
      fetch('/api/capability-statement', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uei: v })
      }).then(function (r) {
        if (!r.ok) throw new Error('save failed: ' + r.status);
        return r.json();
      }).then(function (d) {
        paint(d && d.statement);
        // certSync reports what SAM said. Each state gets its OWN sentence --
        // "SAM has no record" and "we could not reach SAM" demand opposite
        // actions from the customer and must never render the same.
        var cs = d && d.certSync, state = cs && cs.state;
        if (state === 'verified') {
          var n = (cs.programs || []).length;
          msg(n
            ? 'Saved. SAM verified ' + n + ' program' + (n === 1 ? '' : 's') + ' — eligibility now screens on them.'
            : 'Saved. SAM has this registration but lists no set-aside programs on it.', 'ok');
        } else if (state === 'uei-not-found') {
          msg('Saved, but SAM returned no entity for that UEI. Check it against your SAM registration.', 'err');
        } else if (state === 'unverified') {
          msg('Saved, but SAM could not be reached — programs are unverified, not absent. Try again later.', 'err');
        } else {
          msg('Saved.', 'ok');
        }
        save.disabled = false;
        if (window.DSO_APP && typeof window.DSO_APP.render === 'function') window.DSO_APP.render();
      }).catch(function (e) {
        msg('Could not save (' + e.message + '). Nothing was changed — try again.', 'err');
        save.disabled = false;
      });
    };

    msg('Loading your registration…', 'wait');
    fetch('/api/capability-statement', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { msg('Could not read your profile — enter your UEI below to set it.', 'err'); paint(null); return; }
        paint(d.statement); msg('');
      })
      .catch(function () { msg('Could not read your profile — enter your UEI below to set it.', 'err'); paint(null); });
  }

  function boot() { var h = $('lhCodes'); if (h) mount(h); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
