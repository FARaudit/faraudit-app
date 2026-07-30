/* FARaudit · profile editor (NAICS) — the write path for the field the live
   Opportunities feed scopes on.

   SCOPE IS DELIBERATELY NAICS-ONLY. See PR notes: certifications[] are turned
   into engine eligibility tokens with NO provenance field, so a self-typed
   "SDVOSB" would be indistinguishable from an SBA-API-verified one and could
   clear a set-aside bar in a paid audit. That needs a provenance ruling first,
   not a text input. NAICS is safe: it scopes which notices we SHOW and clears
   no bar.

   Fail-closed: a failed save says so and leaves the codes untouched. Nothing
   here ever writes a default or a guess. */
(function () {
  'use strict';

  var RE = /^\d{6}$/;

  function normalize(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (c) {
      var v = String(c == null ? '' : c).trim();
      if (!RE.test(v) || seen[v]) return;
      seen[v] = 1; out.push(v);
    });
    return out;
  }

  function styles() {
    if (document.getElementById('pe-css')) return;
    var s = document.createElement('style');
    s.id = 'pe-css';
    s.textContent =
      '.pe{max-width:560px;margin:0 auto;text-align:left;font-family:Manrope,system-ui,sans-serif}' +
      '.pe h4{margin:0 0 6px;font-size:15px;font-weight:800;color:var(--ink,#0f172a)}' +
      '.pe .pe-sub{margin:0 0 14px;font-size:12.5px;line-height:1.55;color:var(--mute,#64748b)}' +
      '.pe-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:26px}' +
      '.pe-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;' +
      'background:rgba(55,138,221,.12);color:#185FA5;font-family:"IBM Plex Mono",monospace;font-size:11.5px;font-weight:600}' +
      '.pe-chip button{border:0;background:transparent;cursor:pointer;color:#185FA5;font-size:14px;line-height:1;padding:0}' +
      '.pe-row{display:flex;gap:8px;margin-bottom:10px}' +
      '.pe-row input{flex:1;padding:9px 11px;border:1px solid var(--line,#dbe3ec);border-radius:8px;' +
      'font-family:"IBM Plex Mono",monospace;font-size:13px;background:var(--card,#fff);color:var(--ink,#0f172a)}' +
      '.pe-row button,.pe-save{padding:9px 14px;border:0;border-radius:8px;background:#378ADD;color:#fff;' +
      'font-size:12.5px;font-weight:700;cursor:pointer}' +
      '.pe-save[disabled]{opacity:.55;cursor:default}' +
      '.pe-msg{margin-top:10px;font-size:12px;line-height:1.5;min-height:17px}' +
      '.pe-msg.err{color:#b91c1c}.pe-msg.ok{color:#047857}.pe-msg.wait{color:var(--mute,#64748b)}';
    document.head.appendChild(s);
  }

  // mount(el, opts) — opts.heading / opts.sub override the copy; opts.onSaved
  // fires after a CONFIRMED write (server echo), never optimistically.
  function mount(el, opts) {
    if (!el) return;
    opts = opts || {};
    styles();
    var codes = [];
    el.innerHTML =
      '<div class="pe">' +
      '<h4>' + (opts.heading || 'Add your NAICS codes') + '</h4>' +
      '<p class="pe-sub">' + (opts.sub ||
        'The Opportunities feed searches SAM.gov for the codes you sell under. ' +
        'Until at least one is on file there is nothing honest to show you — we will not fill the tab with someone else’s market.') +
      '</p>' +
      '<div class="pe-chips" id="peChips"></div>' +
      '<div class="pe-row"><input id="peInput" inputmode="numeric" maxlength="6" placeholder="6-digit code, e.g. 336413" aria-label="NAICS code">' +
      '<button type="button" id="peAdd">Add</button></div>' +
      '<button type="button" class="pe-save" id="peSave" disabled>Save</button>' +
      '<div class="pe-msg" id="peMsg" role="status" aria-live="polite"></div>' +
      '</div>';

    var $ = function (id) { return el.querySelector('#' + id); };
    var msg = function (t, cls) { var m = $('peMsg'); m.textContent = t || ''; m.className = 'pe-msg' + (cls ? ' ' + cls : ''); };

    function renderChips() {
      $('peChips').innerHTML = codes.length
        ? codes.map(function (c, i) {
            return '<span class="pe-chip">' + c + '<button type="button" data-rm="' + i + '" aria-label="Remove ' + c + '">×</button></span>';
          }).join('')
        : '<span class="pe-sub" style="margin:0">No codes yet.</span>';
      $('peChips').querySelectorAll('[data-rm]').forEach(function (b) {
        b.onclick = function () { codes.splice(+b.dataset.rm, 1); renderChips(); dirty(); };
      });
    }
    function dirty() { $('peSave').disabled = false; }

    function add() {
      var v = String($('peInput').value || '').trim();
      if (!RE.test(v)) { msg('A NAICS code is exactly 6 digits.', 'err'); return; }
      if (codes.indexOf(v) >= 0) { msg(v + ' is already on the list.', 'err'); return; }
      codes.push(v); $('peInput').value = ''; msg(''); renderChips(); dirty();
    }
    $('peAdd').onclick = add;
    $('peInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    $('peSave').onclick = function () {
      $('peSave').disabled = true;
      msg('Saving…', 'wait');
      fetch('/api/capability-statement', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ naics_codes: codes })
      }).then(function (r) {
        if (!r.ok) throw new Error('save failed: ' + r.status);
        return r.json();
      }).then(function (d) {
        // Trust the SERVER ECHO, not our local array — if the write was partially
        // rejected the customer must see what actually persisted.
        var saved = normalize(d && d.statement && d.statement.naics_codes);
        codes = saved; renderChips();
        msg(saved.length
          ? 'Saved ' + saved.length + ' code' + (saved.length === 1 ? '' : 's') + '. Reloading the feed…'
          : 'Saved — no codes on file.', 'ok');
        if (typeof opts.onSaved === 'function') opts.onSaved(saved);
      }).catch(function (e) {
        // Fail-closed: say it failed, keep the edits, change nothing silently.
        msg('Could not save (' + e.message + '). Your codes were not changed — try again.', 'err');
        $('peSave').disabled = false;
      });
    };

    // Prefill from whatever is on file. A failed read leaves the list empty and
    // says so, rather than implying the profile is blank.
    msg('Loading your profile…', 'wait');
    fetch('/api/capability-statement', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { msg('Could not read your profile — add codes below to set them.', 'err'); renderChips(); return; }
        codes = normalize(d.statement && d.statement.naics_codes);
        msg(''); renderChips();
      })
      .catch(function () { msg('Could not read your profile — add codes below to set them.', 'err'); renderChips(); });

    renderChips();
  }

  window.FAR_PROFILE_EDITOR = { mount: mount, normalizeCodes: normalize, CODE_RE: RE };
})();
