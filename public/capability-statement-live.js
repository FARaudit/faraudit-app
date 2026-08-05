/* FARaudit · Capability Statement — live wiring.

   Renders the customer's own capability_statements record. Every region below is
   either filled from that record or says plainly that it is empty and how to fill
   it. Nothing on this page is invented: it is the document customers send to
   contracting officers, and it is the same record the audit engine reads when it
   judges whether they are eligible to bid.

   Core competencies, differentiators and the contact block are edited here and
   saved through PATCH /api/capability-statement. Past performance is not editable
   — the route recomputes it from won audits on every load.

   All text reaches the page through textContent. Nothing here builds markup from
   record values, so a company name containing angle brackets is a company name. */
(function () {
  'use strict';

  var API = '/api/capability-statement';
  var REC = null;

  function el(sel, root) { return (root || document).querySelector(sel); }
  function has(v) { return typeof v === 'string' && v.trim().length > 0; }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function unset(text) { return make('span', 'cs-unset', text); }

  /* An empty region states the consequence, not just the absence. A blank space
     reads as "nothing to say here"; this reads as "a contracting officer will see
     a gap". */
  function emptyNote(what, why) {
    return make('p', 'cs-empty', 'No ' + what + ' on file. ' + why);
  }

  /* ── the letterhead ─────────────────────────────────────────────────────── */
  function paintLetterhead() {
    var name = el('.lh-name-edit');
    if (name) {
      clear(name);
      name.appendChild(has(REC.company_name)
        ? document.createTextNode(REC.company_name)
        : unset('Set your company name'));
    }
    /* The tagline had no source field, so it is built from the codes the record
       actually carries rather than from a sentence nobody wrote. */
    var tag = el('.lh-tag');
    if (tag) {
      clear(tag);
      var codes = list(REC.naics_codes);
      var certs = list(REC.certifications);
      var parts = [];
      if (codes.length) parts.push('NAICS ' + codes.join(' · '));
      if (certs.length) parts.push(certs.join(' · '));
      tag.appendChild(parts.length
        ? document.createTextNode(parts.join('  |  '))
        : unset('No NAICS codes or certifications on file'));
    }
  }

  /* ── prose sections, editable in place ──────────────────────────────────── */
  function sectionByTitle(title) {
    var heads = document.querySelectorAll('.doc-section .sec-title');
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].textContent.trim() === title) return heads[i].closest('.doc-section');
    }
    return null;
  }

  function paintProse(title, field, emptyWhat, emptyWhy) {
    var section = sectionByTitle(title);
    if (!section) return;
    var body = el('.cs-body', section);
    if (!body) {
      body = make('div', 'cs-body');
      var old = section.querySelector('.bullet-list, .diff-list');
      if (old) old.parentNode.replaceChild(body, old); else section.appendChild(body);
    }
    clear(body);
    var v = REC[field];
    if (has(v)) {
      String(v).split(/\n+/).forEach(function (para) {
        if (para.trim()) body.appendChild(make('p', 'cs-prose', para.trim()));
      });
    } else {
      body.appendChild(emptyNote(emptyWhat, emptyWhy));
    }
    var btn = el('.edit-btn', section);
    if (btn) {
      btn.setAttribute('data-cs-field', field);
      btn.setAttribute('aria-label', 'Edit ' + title);
    }
  }

  /* ── past performance — auto-pulled, never typed ────────────────────────── */
  function paintPastPerformance() {
    var wrap = el('.perf-list');
    if (!wrap) return;
    clear(wrap);
    var rows = list(REC.past_performance);
    if (!rows.length) {
      wrap.appendChild(emptyNote(
        'past performance yet',
        'It fills in automatically from audits you record as won — nothing to type here.'
      ));
      return;
    }
    rows.forEach(function (p) {
      var item = make('div', 'perf-item');
      item.appendChild(make('span', 'perf-title', p.title || 'Untitled award'));
      if (p.contract_value !== null && p.contract_value !== undefined && p.contract_value !== '') {
        item.appendChild(make('span', 'perf-value', p.contract_value));
      }
      var who = [p.agency, p.notice_id].filter(Boolean).join(' · ');
      if (who) item.appendChild(make('span', 'perf-agency', who));
      wrap.appendChild(item);
    });
  }

  /* ── contact strip ──────────────────────────────────────────────────────── */
  var CONTACT_FIELDS = ['contact_name', 'contact_email', 'contact_phone', 'contact_website', 'contact_address'];

  function paintContact() {
    var cells = document.querySelectorAll('.contact-strip .contact-item .cv');
    if (cells.length < CONTACT_FIELDS.length) return;
    for (var i = 0; i < CONTACT_FIELDS.length; i++) {
      var v = REC[CONTACT_FIELDS[i]];
      clear(cells[i]);
      cells[i].appendChild(has(v) ? document.createTextNode(v) : unset('Not set'));
      var item = cells[i].closest('.contact-item');
      if (item) item.setAttribute('data-cs-contact', CONTACT_FIELDS[i]);
    }
  }

  /* ── completeness — COUNTED, never asserted ─────────────────────────────── */
  var CHECKS = [
    { label: 'Company name',     ok: function () { return has(REC.company_name); } },
    { label: 'UEI',              ok: function () { return has(REC.uei); } },
    { label: 'CAGE code',        ok: function () { return has(REC.cage_code); } },
    { label: 'NAICS codes',      ok: function () { return list(REC.naics_codes).length > 0; } },
    { label: 'Certifications',   ok: function () { return list(REC.certifications).length > 0; } },
    { label: 'Core competencies',ok: function () { return has(REC.core_competencies); } },
    { label: 'Differentiators',  ok: function () { return has(REC.differentiators); } },
    { label: 'Point of contact', ok: function () { return has(REC.contact_name); } },
    { label: 'Contact email',    ok: function () { return has(REC.contact_email); } },
    { label: 'Contact phone',    ok: function () { return has(REC.contact_phone); } },
    { label: 'Business address', ok: function () { return has(REC.contact_address); } },
    { label: 'Past performance', ok: function () { return list(REC.past_performance).length > 0; } }
  ];

  function completeness() {
    var done = 0;
    for (var i = 0; i < CHECKS.length; i++) if (CHECKS[i].ok()) done++;
    return { done: done, total: CHECKS.length, pct: Math.round((done / CHECKS.length) * 100) };
  }

  function paintHealth() {
    var c = completeness();
    var pct = el('.pct');
    if (pct) pct.textContent = c.pct + '%';

    var cap = el('.health-cap');
    if (cap) {
      clear(cap);
      var missing = c.total - c.done;
      if (missing === 0) {
        cap.appendChild(make('b', null, 'Complete.'));
        cap.appendChild(document.createTextNode(' Every field a contracting officer looks for is filled in.'));
      } else {
        cap.appendChild(make('b', null, c.done + ' of ' + c.total + ' filled.'));
        cap.appendChild(document.createTextNode(
          ' ' + missing + (missing === 1 ? ' field is' : ' fields are') +
          ' still empty — each one is a gap on the page a CO reads.'));
      }
    }

    var ul = el('.health-missing');
    if (ul) {
      clear(ul);
      CHECKS.forEach(function (k) { ul.appendChild(make('li', k.ok() ? 'done' : 'todo', k.label)); });
    }
  }

  /* ── stat strip ─────────────────────────────────────────────────────────── */
  function statCard(card, label, valueNode, sub, mono) {
    clear(card);
    card.appendChild(make('p', 'lbl', label));
    var v = make('p', mono ? 'val mono' : 'val');
    v.appendChild(valueNode);
    card.appendChild(v);
    card.appendChild(make('p', 'sub', sub));
  }

  function paintStats() {
    var cards = document.querySelectorAll('.stat-strip .stat-card');
    if (cards.length < 4) return;
    var c = completeness();
    var codes = list(REC.naics_codes);
    var perf = list(REC.past_performance);

    statCard(cards[0], 'Awards on file', document.createTextNode(String(perf.length)),
      perf.length ? 'pulled from audits you won' : 'record an audit as won to fill this');

    var codeNode;
    if (codes.length) {
      codeNode = document.createDocumentFragment();
      codes.forEach(function (code, i) {
        if (i) codeNode.appendChild(document.createElement('br'));
        codeNode.appendChild(document.createTextNode(code));
      });
    } else {
      codeNode = unset('None');
    }
    statCard(cards[1], 'NAICS codes', codeNode,
      codes.length === 1 ? 'primary'
        : codes.length ? 'primary + ' + (codes.length - 1) + ' secondary'
        : 'set them to scope your feed', true);

    var pctNode = document.createDocumentFragment();
    pctNode.appendChild(document.createTextNode(String(c.pct)));
    var sign = make('span', null, '%');
    sign.style.fontSize = '16px';
    sign.style.color = 'var(--mute)';
    pctNode.appendChild(sign);
    statCard(cards[2], 'Completeness', pctNode, (c.total - c.done) + ' of ' + c.total + ' fields empty');

    var when = REC.updated_at ? new Date(REC.updated_at) : null;
    var known = when && !isNaN(when.getTime());
    statCard(cards[3], 'Last saved',
      known ? document.createTextNode(when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))
            : unset('Never'),
      known ? when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'nothing saved yet');
  }

  /* ── editing ────────────────────────────────────────────────────────────── */
  var FIELD_LABELS = {
    company_name: 'Company name',
    core_competencies: 'Core Competencies',
    differentiators: 'Differentiators',
    contact_name: 'Point of contact',
    contact_email: 'Email',
    contact_phone: 'Phone',
    contact_website: 'Website',
    contact_address: 'Business address'
  };

  function note(msg, ok) {
    var n = el('#csNote');
    if (!n) return;
    n.hidden = false;
    n.textContent = msg;
    n.classList.toggle('is-error', !ok);
  }

  /* A save reports only what the server confirms. The route returns the persisted
     row, so a mismatch here means the write did not land. */
  function save(patch) {
    note('Saving…', true);
    fetch(API, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(function (r) {
      return r.json().catch(function () { return null; })
        .then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
    }).then(function (res) {
      if (!res.ok) {
        note((res.body && res.body.error) || ('Could not save (HTTP ' + res.status + ')'), false);
        return;
      }
      var saved = res.body && res.body.statement;
      if (!saved) { note('Save did not persist — reload and try again', false); return; }
      var keys = Object.keys(patch);
      for (var i = 0; i < keys.length; i++) {
        var want = patch[keys[i]] === '' ? null : patch[keys[i]];
        var got = saved[keys[i]] === '' ? null : saved[keys[i]];
        if (String(want) !== String(got)) {
          note('Save did not persist — reload and try again', false);
          return;
        }
      }
      REC = saved;
      renderAll();
      note('✓ Saved', true);
    }).catch(function () { note('Could not reach the server', false); });
  }

  function openEditor(field) {
    var current = REC[field] == null ? '' : String(REC[field]);
    var next = window.prompt('Edit ' + (FIELD_LABELS[field] || field), current);
    if (next === null) return;
    var patch = {};
    patch[field] = next.trim();
    save(patch);
  }

  /* Delegated: the sections are re-rendered on every save, which detaches any
     directly-bound listener. */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var edit = e.target.closest('[data-cs-field]');
    if (edit) { e.preventDefault(); openEditor(edit.getAttribute('data-cs-field')); return; }
    var contact = e.target.closest('[data-cs-contact]');
    if (contact) { e.preventDefault(); openEditor(contact.getAttribute('data-cs-contact')); return; }
    if (e.target.closest('#csCopy')) { e.preventDefault(); copyStatement(); }
  });

  /* ── copy to clipboard — built from the record, so it cannot drift ───────── */
  function statementText() {
    var L = [];
    L.push(has(REC.company_name) ? REC.company_name : '(company name not set)');
    var ids = [];
    if (has(REC.uei)) ids.push('UEI ' + REC.uei);
    if (has(REC.cage_code)) ids.push('CAGE ' + REC.cage_code);
    if (has(REC.duns)) ids.push('DUNS ' + REC.duns);
    if (ids.length) L.push(ids.join('  ·  '));
    if (list(REC.naics_codes).length) L.push('NAICS: ' + list(REC.naics_codes).join(', '));
    if (list(REC.certifications).length) L.push('Certifications: ' + list(REC.certifications).join(', '));
    if (has(REC.core_competencies)) L.push('', 'CORE COMPETENCIES', REC.core_competencies);
    if (has(REC.differentiators)) L.push('', 'DIFFERENTIATORS', REC.differentiators);
    var perf = list(REC.past_performance);
    if (perf.length) {
      L.push('', 'PAST PERFORMANCE');
      perf.forEach(function (p) {
        L.push('- ' + [p.title, p.agency, p.notice_id, p.contract_value].filter(Boolean).join(' · '));
      });
    }
    var contact = [REC.contact_name, REC.contact_email, REC.contact_phone, REC.contact_website, REC.contact_address].filter(has);
    if (contact.length) L.push('', 'CONTACT', contact.join('\n'));
    return L.join('\n');
  }

  function copyStatement() {
    var text = statementText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { note('✓ Copied — ' + text.length + ' characters', true); },
        function () { note('Could not copy', false); }
      );
    } else {
      note('Could not copy', false);
    }
  }

  function renderAll() {
    paintLetterhead();
    paintProse('Core Competencies', 'core_competencies', 'core competencies',
      'This is the first thing a contracting officer reads. Add it with Edit.');
    paintProse('Differentiators', 'differentiators', 'differentiators',
      'This is what separates you from the other bidders. Add it with Edit.');
    paintPastPerformance();
    paintContact();
    paintHealth();
    paintStats();
  }

  function wire() {
    fetch(API, { credentials: 'include' })
      .then(function (r) {
        if (!r.ok) throw new Error('capability statement fetch failed: ' + r.status);
        return r.json();
      })
      .then(function (d) {
        /* The route documents its shape as { statement, stub }. Anything else is a
           failure to read, which is a different answer from an empty record. */
        if (!d || !d.statement || typeof d.statement !== 'object') {
          throw new Error('capability statement: no statement in response');
        }
        REC = d.statement;
        renderAll();
        document.body.classList.add('cs-ready');
      })
      .catch(function (e) {
        console.error('[capability-statement-live]', e);
        document.body.classList.add('cs-unreadable');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
