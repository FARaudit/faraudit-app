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
  /* How many awards were WON, and how many the route sent. They differ once a customer
     passes the cap, and every number on this page reports the first. */
  var PAST_TOTAL = null;
  var PAST_LIMIT = null;
  /* A capability statement is a one-page document and the convention is three to five
     past-performance entries, so the EXPORT carries five while the page shows the whole
     record. Mirrors PAST_PERFORMANCE_EXPORT_LIMIT in src/lib/capability-statement-limits.ts,
     which the PDF uses; a gate asserts the two numbers agree. */
  var EXPORT_LIMIT = 5;
  /* Industry titles for the codes on this record, sent by the route from 13 CFR 121.201.
     A code the regulation does not carry is simply absent — the bare code prints, never
     a guessed title, because a wrong industry name misdescribes the firm. */
  var NAICS_TITLES = {};

  /* FIRST IS PRIMARY — the record's own convention, and the customer controls the order.
     The primary is the code the firm's size standard is judged against, so it is marked
     rather than left for a contracting officer to infer. */
  function naicsLines() {
    var codes = list(REC.naics_codes);
    var seen = {};
    var out = [];
    for (var i = 0; i < codes.length; i++) {
      var code = String(codes[i] == null ? '' : codes[i]).trim();
      if (!code || seen[code]) continue;
      seen[code] = true;
      out.push({ code: code, title: NAICS_TITLES[code] || null, primary: out.length === 0 });
    }
    return out;
  }

  function naicsLineText(l) {
    var head = l.title ? (l.code + '  ' + l.title) : l.code;
    return l.primary ? (head + ' (primary)') : head;
  }

  function el(sel, root) { return (root || document).querySelector(sel); }
  function has(v) { return typeof v === 'string' && v.trim().length > 0; }
  /* A PHONE IS READ, NOT PARSED. The record keeps exactly what was typed — this only
     changes how it is SHOWN, so a customer who entered an extension or a foreign number
     never sees it mangled: anything that is not a plain 10-digit US number is printed
     through untouched rather than forced into a shape it does not have. */
  function fmtPhone(v) {
    if (!has(v)) return v;
    var d = String(v).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (d.length !== 10) return String(v);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

  /* ── STRUCTURED SECTIONS ──────────────────────────────────────────────────
     Core competencies and differentiators exist in two forms: the original prose
     column, and a structured list whose items carry the separate fields the
     document draws. These rules MIRROR the server resolver exactly — the page,
     the PDF and the Word export must agree about one profile, and a second
     interpretation written here is how they would stop agreeing.

     A null structured column means "not structured yet" and the prose column
     answers. An EMPTY ARRAY means "structured, and empty" — the section is
     omitted and the prose is NOT brought back. */
  var STRUCTURED = {
    core_competencies: {
      json: 'core_competencies_json',
      exact: 3,
      parts: [
        { key: 'k', label: 'Category', hint: 'One or two words — Machining, Sustainment, Logistics', area: false },
        { key: 'h', label: 'What it is', hint: 'The line a buyer skims. Required.', area: false },
        { key: 'b', label: 'Detail', hint: 'One sentence a contracting officer can act on', area: true },
        { key: 's', label: 'Qualifier', hint: 'Approvals, equipment or terms that back it up', area: false }
      ]
    },
    differentiators: {
      json: 'differentiators_json',
      max: 6,
      parts: [
        { key: 'h', label: 'The claim', hint: 'Why you over the firm bidding against you. Required.', area: false },
        { key: 'b', label: 'What backs it', hint: 'The fact behind the claim', area: true }
      ]
    }
  };

  function itemsOf(field) {
    var spec = STRUCTURED[field];
    var raw = REC[spec.json];
    if (Array.isArray(raw)) {
      return raw.filter(function (x) { return x && typeof x === 'object' && has(x.h); })
        .map(function (x) {
          var out = {};
          spec.parts.forEach(function (p) { out[p.key] = has(x[p.key]) ? String(x[p.key]).trim() : ''; });
          return out;
        });
    }
    // Legacy prose: each line is a head and nothing else. Nothing is invented to
    // fill the other fields for a customer who never wrote them.
    return String(REC[field] == null ? '' : REC[field]).split(/\r?\n+/)
      .map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (h) { var out = { h: h }; spec.parts.forEach(function (p) { if (p.key !== 'h') out[p.key] = ''; }); return out; });
  }

  function isStructured(field) { return Array.isArray(REC[STRUCTURED[field].json]); }

  /* The caps Design measured on the plate. Reported, never applied: trimming here
     would silently drop the customer's material, and which three competencies
     print is an editorial decision only they can make. */
  function capNote(field) {
    var spec = STRUCTURED[field], n = itemsOf(field).length;
    if (spec.exact != null && n !== spec.exact) {
      return n < spec.exact
        ? 'The document prints exactly ' + spec.exact + ' — add ' + (spec.exact - n) + ' more before exporting.'
        : 'The document prints exactly ' + spec.exact + ' and ' + n + ' are on file. Remove ' + (n - spec.exact) + ' — a fourth runs off the page.';
    }
    if (spec.max != null && n > spec.max) {
      return 'The document holds up to ' + spec.max + ' and ' + n + ' are on file. Remove ' + (n - spec.max) + '.';
    }
    return null;
  }
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

  /* WHAT GOOD LOOKS LIKE, shown where the field is empty. This is GUIDANCE and never
     data: it is not in REC, it is not written by any save, and statementText() cannot
     reach it — an empty field copies as empty. The customer fills this record as a
     customer, so nothing here may pre-write a word of it for them. */
  var PROSE_GUIDE = {
    core_competencies: {
      lead: 'What to put here — three or four sentences, no bullet lists:',
      points: [
        'What you actually build, machine, repair or deliver — in the words a buyer would search',
        'The NAICS work you have really performed, and for which services or commands',
        'Certifications and approvals that qualify the work: ISO, AS9100, ITAR, DCAA-compliant accounting',
        'Capacity a CO needs to believe you: facility, headcount, throughput, lead time'
      ]
    },
    differentiators: {
      lead: 'What to put here — why you, over the firm bidding against you:',
      points: [
        'Something a competitor cannot simply claim: a source approval, a clearance, an incumbent relationship',
        'A number you can stand behind — on-time rate, quote turnaround, years without a DFARS finding',
        'Equipment, tooling or a facility that narrows the field',
        'Set-aside status that changes which solicitations you can win'
      ]
    }
  };

  function proseGuide(field) {
    var g = PROSE_GUIDE[field];
    if (!g) return null;
    var box = make('div', 'cs-guide');
    box.appendChild(make('p', 'cs-guide-lead', g.lead));
    var ul = make('ul', 'cs-guide-list');
    g.points.forEach(function (t) { ul.appendChild(make('li', null, t)); });
    box.appendChild(ul);
    return box;
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
      var lines = naicsLines();
      var certs = list(REC.certifications);
      var parts = [];
      /* The tagline stays a single line — it sits beside the company name on a dark
         band. The titles belong on the document, not crammed into the letterhead
         strapline, so this marks the primary and leaves the rest as codes. */
      if (lines.length) {
        parts.push('NAICS ' + lines.map(function (l) {
          return l.primary && l.title ? (l.code + ' ' + l.title) : l.code;
        }).join(' · '));
      }
      if (certs.length) parts.push(certs.join(' · '));
      tag.appendChild(parts.length
        ? document.createTextNode(parts.join('  |  '))
        : unset('No NAICS codes or certifications on file'));
    }
  }

  /* ── tailored versions — SELECTION AND ORDERING, never authorship ────────── */
  /* An edition reorders the awards the customer already recorded so the work most
     relevant to that buyer leads. It rewrites nothing. Agencies come from the award
     history, so every edition on offer differs from the default in a way the record
     supports — a "Navy edition" for a Navy they have never worked with would be the
     same document under a name implying relevance it does not have. */
  var AGENCIES = [];
  var EDITION = null;

  function paintVersions() {
    var intro = el('.ver-intro');
    var listEl = el('.ver-list');
    if (!intro || !listEl) return;
    clear(intro);
    clear(listEl);

    if (!AGENCIES.length) {
      intro.appendChild(document.createTextNode(
        'Agency editions come from the agencies you have won with. Record an audit as won and its agency appears here.'));
      return;
    }

    intro.appendChild(document.createTextNode(
      'Leads with the work you have done for that agency. Nothing else about the statement changes.'));

    var opts = [{ agency: null, count: null, label: 'Default — most recent first' }]
      .concat(AGENCIES.map(function (a) { return { agency: a.agency, count: a.count, label: a.agency }; }));

    opts.forEach(function (o) {
      var b = make('button', 'ver-opt');
      b.type = 'button';
      b.setAttribute('data-cs-edition', o.agency === null ? '' : o.agency);
      if ((EDITION || null) === o.agency) b.className += ' is-active';
      b.appendChild(document.createTextNode(o.label));
      if (o.count !== null) {
        b.appendChild(make('span', 'vc', o.count + (o.count === 1 ? ' award' : ' awards')));
      }
      listEl.appendChild(b);
    });
  }

  function setEdition(agency) {
    EDITION = has(agency) ? agency : null;
    paintVersions();
    /* The statement card is the document, so the preview reorders with the edition —
       what the customer reads is what the export sends. */
    paintPastPerformance();
    paintAwardHistory();
  }

  /* Mirrors orderForAgency() in src/lib/capability-statement-tailoring.ts: a stable
     partition, never a filter, and an unmatched agency leaves the list untouched. */
  function orderForEdition(rows) {
    if (!EDITION) return rows.slice();
    var want = String(EDITION).trim().toLowerCase();
    var match = [];
    var rest = [];
    for (var i = 0; i < rows.length; i++) {
      var a = String(rows[i] && rows[i].agency ? rows[i].agency : '').trim().toLowerCase();
      (a === want ? match : rest).push(rows[i]);
    }
    return match.length ? match.concat(rest) : rows.slice();
  }

  function editionQuery() {
    return EDITION ? ('?agency=' + encodeURIComponent(EDITION)) : '';
  }

  /* ── the company logo ───────────────────────────────────────────────────── */
  function paintLogo() {
    var box = el('.lh-logo');
    var img = el('.lh-logo-img');
    var cta = el('.lh-logo-cta');
    var rm = el('.lh-logo-remove');
    if (!box || !img || !cta || !rm) return;
    var url = has(REC.logo_url) ? REC.logo_url : null;
    box.classList.toggle('is-set', !!url);
    /* Nothing is substituted when there is no logo. A mark the customer never chose
       does not go on paper they send under their own name. */
    if (url) { img.src = url; img.hidden = false; cta.hidden = true; rm.hidden = false; }
    else { img.removeAttribute('src'); img.hidden = true; cta.hidden = false; rm.hidden = true; }
  }

  function logoBusy(on) {
    var box = el('.lh-logo');
    var input = el('.lh-logo-input');
    if (box) box.classList.toggle('is-busy', !!on);
    if (input) input.disabled = !!on;
  }

  function uploadLogo(file) {
    if (!file) return;
    var body = new FormData();
    body.append('file', file);
    logoBusy(true);
    note('Uploading logo…', true, true);
    fetch(API + '/logo', { method: 'POST', credentials: 'include', body: body })
      .then(function (r) {
        return r.json().catch(function () { return null; })
          .then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      })
      .then(function (res) {
        if (!res.ok || !res.body || !has(res.body.logo_url)) {
          note((res.body && res.body.error) || ('Could not upload the logo (HTTP ' + res.status + ')'), false);
          return;
        }
        REC.logo_url = res.body.logo_url;
        paintLogo();
        /* Completeness is NOT repainted. A logo is not one of the twelve fields a
           contracting officer looks for, and counting it would put every customer
           without one below 100% for a gap that is not one. */
        note('✓ Logo saved', true);
      })
      .catch(function () { note('Could not upload the logo', false); })
      .then(function () {
        logoBusy(false);
        var input = el('.lh-logo-input');
        if (input) input.value = '';
      });
  }

  function removeLogo() {
    logoBusy(true);
    note('Removing logo…', true, true);
    fetch(API + '/logo', { method: 'DELETE', credentials: 'include' })
      .then(function (r) {
        return r.json().catch(function () { return null; })
          .then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      })
      .then(function (res) {
        if (!res.ok) {
          note((res.body && res.body.error) || ('Could not remove the logo (HTTP ' + res.status + ')'), false);
          return;
        }
        REC.logo_url = null;
        paintLogo();
        note('Logo removed', true);
      })
      .catch(function () { note('Could not remove the logo', false); })
      .then(function () { logoBusy(false); });
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
    var items = STRUCTURED[field] ? itemsOf(field) : [];
    if (STRUCTURED[field] && items.length) {
      items.forEach(function (it) {
        var row = make('div', 'cs-item');
        if (has(it.k)) row.appendChild(make('p', 'cs-item-k', it.k));
        row.appendChild(make('p', 'cs-item-h', it.h));
        if (has(it.b)) row.appendChild(make('p', 'cs-prose', it.b));
        if (has(it.s)) row.appendChild(make('p', 'cs-item-s', it.s));
        body.appendChild(row);
      });
      // The cap is REPORTED here, never applied. Which items print is the customer's
      // editorial call, and the export refuses rather than choosing for them.
      var cap = capNote(field);
      if (cap) body.appendChild(make('p', 'cs-cap', cap));
    } else if (has(REC[field]) && !isStructured(field)) {
      String(REC[field]).split(/\n+/).forEach(function (para) {
        if (para.trim()) body.appendChild(make('p', 'cs-prose', para.trim()));
      });
    } else {
      body.appendChild(emptyNote(emptyWhat, emptyWhy));
      var guide = proseGuide(field);
      if (guide) body.appendChild(guide);
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
    var rows = orderForEdition(list(REC.past_performance));
    if (!rows.length) {
      wrap.appendChild(emptyNote(
        'past performance yet',
        'It fills in automatically from audits you record as won — nothing to type here.'
      ));
      return;
    }
    /* THE CARD IS THE DOCUMENT. It shows exactly the awards that leave with the
       statement, so what the customer reads here is what the contracting officer
       receives. Everything they have won lives in Award history below, which is the
       record and is not sent. */
    rows.slice(0, EXPORT_LIMIT).forEach(function (p) {
      var item = make('div', 'perf-item');
      item.appendChild(make('span', 'perf-title', p.title || 'Untitled award'));
      if (p.contract_value !== null && p.contract_value !== undefined && p.contract_value !== '') {
        item.appendChild(make('span', 'perf-value', p.contract_value));
      }
      /* Period of performance is a standard field on a capability statement and the PDF
         already printed it. The page did not, so the document a customer checked on
         screen and the one they sent described the same award differently. */
      var who = [p.agency, p.notice_id, p.period].filter(Boolean).join(' · ');
      if (who) item.appendChild(make('span', 'perf-agency', who));
      wrap.appendChild(item);
    });

    /* A CO reading this document cannot tell a short list from a shortened one, and
       neither could the customer who sent it. Say so on the page itself. */
    var total = PAST_TOTAL === null ? rows.length : PAST_TOTAL;
    if (total > EXPORT_LIMIT) {
      wrap.appendChild(make('div', 'perf-more',
        'These ' + EXPORT_LIMIT + ' go out with the statement — the ' + EXPORT_LIMIT +
        ' most recent of ' + total + ' awards. All ' + total + ' are in Award history below.'));
    }
  }

  /* ── award history — every win, and NOT part of the sent document ───────────── */
  function paintAwardHistory() {
    var section = document.getElementById('awardHistory');
    if (!section) return;
    var body = el('.ah-body', section);
    var sub = el('.ah-sub', section);
    if (!body || !sub) return;
    clear(body);

    var rows = orderForEdition(list(REC.past_performance));
    var total = PAST_TOTAL === null ? rows.length : PAST_TOTAL;

    /* Below the export limit the card already lists every award, so a second table
       repeating the same rows would be noise. The section appears exactly when the
       record holds more than the document carries. */
    if (total <= EXPORT_LIMIT) { section.hidden = true; return; }
    section.hidden = false;

    clear(sub);
    sub.appendChild(document.createTextNode(
      rows.length < total
        ? ('The ' + rows.length + ' most recent of ' + total + ' awards you have recorded as won. This is your record — the statement above sends ' + EXPORT_LIMIT + '.')
        : ('All ' + total + ' awards you have recorded as won. This is your record — the statement above sends ' + EXPORT_LIMIT + '.')
    ));

    rows.forEach(function (p) {
      var row = make('div', 'ah-row');
      row.setAttribute('role', 'row');
      row.appendChild(make('span', 'ah-title', p.title || p.notice_id || 'Untitled award'));
      row.appendChild(cell(p.agency));
      row.appendChild(cell(p.notice_id, 'ah-mono'));
      row.appendChild(cell(p.period));
      /* Blank, never a dash or a zero: an absent award value is a figure the record
         does not hold, and a number here reads to a CO as what the work was worth. */
      var v = make('span', 'ah-cell ah-value');
      if (p.contract_value !== null && p.contract_value !== undefined && p.contract_value !== '') {
        v.appendChild(document.createTextNode(String(p.contract_value)));
      }
      row.appendChild(v);
      body.appendChild(row);
    });
  }

  function cell(value, extra) {
    var s = make('span', 'ah-cell' + (extra ? ' ' + extra : ''));
    if (has(value)) s.appendChild(document.createTextNode(value));
    else { s.className += ' ah-empty'; s.appendChild(document.createTextNode('—')); }
    return s;
  }

  /* ── contact strip ──────────────────────────────────────────────────────── */
  var CONTACT_FIELDS = ['contact_name', 'contact_email', 'contact_phone', 'contact_website', 'contact_address'];

  function paintContact() {
    var items = document.querySelectorAll('.contact-strip .contact-item');
    for (var i = 0; i < items.length; i++) {
      var field = items[i].getAttribute('data-cs-contact');
      var cell = items[i].querySelector('.cv');
      if (!cell) continue;
      if (CONTACT_FIELDS.indexOf(field) === -1) { clear(cell); continue; }
      var v = REC[field];
      clear(cell);
      var shown = field === 'contact_phone' ? fmtPhone(v) : v;
      cell.appendChild(has(v) ? document.createTextNode(shown) : unset('Not set'));
    }
  }

  /* ── completeness — COUNTED, never asserted ─────────────────────────────── */
  var CHECKS = [
    { label: 'Company name',     ok: function () { return has(REC.company_name); } },
    { label: 'UEI',              ok: function () { return has(REC.uei); } },
    { label: 'CAGE code',        ok: function () { return has(REC.cage_code); } },
    { label: 'NAICS codes',      ok: function () { return list(REC.naics_codes).length > 0; } },
    { label: 'Certifications',   ok: function () { return list(REC.certifications).length > 0; } },
    { label: 'Core competencies',ok: function () { return itemsOf('core_competencies').length > 0; } },
    { label: 'Differentiators',  ok: function () { return itemsOf('differentiators').length > 0; } },
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

    /* THE ARC IS DRAWN FROM THE SAME NUMBER AS THE LABEL. The ring shipped with a
       fixed stroke-dashoffset, so it always drew the same arc no matter what the
       record held — a page reading 42% inside a ring drawn at 82%. Of the two, the
       ring is what is seen first. Circumference is the declared dasharray, so the two
       cannot drift apart here. */
    var ring = el('.health-ring-fg');
    if (ring) {
      var circ = parseFloat(ring.getAttribute('stroke-dasharray')) || 0;
      var frac = Math.max(0, Math.min(1, c.pct / 100));
      ring.setAttribute('stroke-dashoffset', String(circ * (1 - frac)));
    }

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

    var total = PAST_TOTAL === null ? perf.length : PAST_TOTAL;
    statCard(cards[0], 'Awards on file', document.createTextNode(String(total)),
      total > perf.length ? ('showing the ' + perf.length + ' most recent below')
        : total ? 'pulled from audits you won'
        : 'record an audit as won to fill this');

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

  /* A confirmation is an event, not a state. It clears itself, and a second press
     restarts the clock instead of stacking another copy beside the first. */
  var NOTE_MS = 4000;
  var noteTimer = null;
  function note(msg, ok, sticky) {
    var n = el('#csNote');
    if (!n) return;
    n.hidden = false;
    n.textContent = msg;
    n.classList.toggle('is-error', !ok);
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
    if (!sticky) {
      noteTimer = setTimeout(function () {
        n.textContent = '';
        n.hidden = true;
        n.classList.remove('is-error');
        noteTimer = null;
      }, NOTE_MS);
    }
  }

  /* A save reports only what the server confirms. The route returns the persisted
     row, so a mismatch here means the write did not land. */
  function save(patch) {
    note('Saving…', true, true);
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
        // COMPARE BY VALUE, NOT BY String(). String([{a:1}]) is "[object Object]" for
        // every array of objects, so the structured sections would confirm a save that
        // never landed — the check would pass on any two lists of the same length, and
        // on lists of different content entirely. Scalars keep their old comparison so
        // 7 and "7" still match the way the route round-trips them.
        var same = (want !== null && typeof want === 'object') || (got !== null && typeof got === 'object')
          ? JSON.stringify(want) === JSON.stringify(got)
          : String(want) === String(got);
        if (!same) {
          note('Save did not persist — reload and try again', false);
          return;
        }
      }
      REC = saved;
      renderAll();
      note('✓ Saved', true);
    }).catch(function () { note('Could not reach the server', false); });
  }

  /* WHAT EACH FIELD IS FOR, in the reader's terms. A contracting officer is the
     audience for every one of these, so the helper says what THEY do with it rather
     than describing the input. `prose` fields hold paragraphs — the old prompt gave
     them a single line, which is why Core Competencies was unreadable while editing. */
  var FIELD_SPEC = {
    company_name:     { kind: 'Identity', help: 'The legal name on your SAM registration. It heads the document and the engine matches it against the entity record.' },
    core_competencies:{ kind: 'The document', prose: true, help: 'The first thing a contracting officer reads. What you build or do, in your own words — plain sentences beat a keyword list.' },
    differentiators:  { kind: 'The document', prose: true, help: 'Why you over the other bidders. Certifications, facilities, clearances, past programs — the things another firm cannot simply claim.' },
    contact_name:     { kind: 'Contact', help: 'Who a contracting officer asks for by name.' },
    contact_email:    { kind: 'Contact', type: 'email', help: 'Where a solicitation question lands. Use a monitored address, not a personal one.' },
    contact_phone:    { kind: 'Contact', type: 'tel', help: 'A number answered during business hours in your own time zone.' },
    contact_website:  { kind: 'Contact', type: 'url', help: 'Your company site. Include https:// so it resolves when pasted.' },
    contact_address:  { kind: 'Contact', prose: true, help: 'Your place of performance address, as it appears on the SAM registration.' }
  };

  var feScrim = null, feReturnTo = null;

  function closeEditor() {
    if (!feScrim) return;
    feScrim.hidden = true;
    feScrim.replaceChildren();
    document.removeEventListener('keydown', feKeys, true);
    if (feReturnTo && feReturnTo.focus) feReturnTo.focus();
    feReturnTo = null;
  }

  function feKeys(e) {
    if (!feScrim || feScrim.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeEditor(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      var ok = feScrim.querySelector('[data-fe-save]');
      if (ok) ok.click();
      return;
    }
    if (e.key === 'Tab') {                       // keep focus inside the sheet
      var f = feScrim.querySelectorAll('button, input, textarea');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  /* Replaces window.prompt(). The prompt was browser chrome sitting on a designed
     document, it could not hold a paragraph, and it named the field with a bare
     label and no explanation of what the field is for. */
  /* The repeating editor for the two structured sections. The document draws each
     item as several separate fields, so the editor asks for them separately —
     a single textarea cannot say which line is the category and which is the
     detail, and guessing from position is how the wrong string ends up in the
     wrong slot on a document sent to a contracting officer.

     A profile still on prose opens with its existing lines as the heads, so
     nothing the customer wrote is discarded on the way in. */
  function openStructuredEditor(field) {
    var spec = STRUCTURED[field];
    var fspec = FIELD_SPEC[field] || {};
    var draft = itemsOf(field).map(function (it) {
      var c = {}; spec.parts.forEach(function (p) { c[p.key] = it[p.key] || ''; }); return c;
    });
    var wasStructured = isStructured(field);
    feReturnTo = document.activeElement;

    if (!feScrim) {
      feScrim = make('div', 'fe-scrim');
      feScrim.hidden = true;
      document.body.appendChild(feScrim);
      feScrim.addEventListener('mousedown', function (e) { if (e.target === feScrim) closeEditor(); });
    }

    var sheet = make('div', 'fe');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'feTitle');

    var head = make('div', 'fe-head');
    head.appendChild(make('p', 'fe-kind', fspec.kind || 'The document'));
    var h2 = make('h2', 'fe-title', FIELD_LABELS[field] || field);
    h2.id = 'feTitle';
    head.appendChild(h2);
    if (fspec.help) head.appendChild(make('p', 'fe-help', fspec.help));
    sheet.appendChild(head);

    var body = make('div', 'fe-body');
    var listBox = make('div', 'fe-items');
    body.appendChild(listBox);

    var addBtn = make('button', 'fe-btn', 'Add another');
    addBtn.type = 'button';
    var countNote = make('p', 'fe-cap');

    function limit() { return spec.exact != null ? spec.exact : spec.max; }

    function paint() {
      clear(listBox);
      draft.forEach(function (item, i) {
        var card = make('div', 'fe-item');
        var bar = make('div', 'fe-item-bar');
        bar.appendChild(make('span', 'fe-item-n', String(i + 1)));
        var rm = make('button', 'fe-item-x', 'Remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove item ' + (i + 1));
        rm.addEventListener('click', function () { draft.splice(i, 1); paint(); });
        bar.appendChild(rm);
        card.appendChild(bar);

        spec.parts.forEach(function (p) {
          var lab = make('label', 'fe-lab', p.label + (p.key === 'h' ? '' : ' — optional'));
          var id = 'fe-' + field + '-' + i + '-' + p.key;
          lab.setAttribute('for', id);
          card.appendChild(lab);
          var inp = document.createElement(p.area ? 'textarea' : 'input');
          inp.className = p.area ? 'fe-area fe-area-sm' : 'fe-input';
          if (!p.area) inp.type = 'text';
          inp.id = id;
          inp.value = item[p.key] || '';
          inp.placeholder = p.hint;
          inp.addEventListener('input', function () { item[p.key] = inp.value; recount(); });
          card.appendChild(inp);
        });
        listBox.appendChild(card);
      });
      recount();
    }

    function recount() {
      var n = draft.filter(function (d) { return has(d.h); }).length;
      var lim = limit();
      var msg;
      if (spec.exact != null) {
        msg = n === spec.exact
          ? n + ' of ' + spec.exact + ' — this is what the document prints.'
          : (n < spec.exact
              ? n + ' of ' + spec.exact + '. The document prints exactly ' + spec.exact + ' — add ' + (spec.exact - n) + ' more.'
              : n + ' on file. The document prints exactly ' + spec.exact + ' — remove ' + (n - spec.exact) + '. A fourth runs off the page.');
      } else {
        msg = n > spec.max
          ? n + ' on file. The document holds up to ' + spec.max + ' — remove ' + (n - spec.max) + '.'
          : n + ' of up to ' + spec.max + '.';
      }
      // An empty card is not counted, because it will not be saved. Say so — otherwise
      // six cards beside "1 of up to 6" reads as a broken counter rather than as the
      // truth about what will print.
      var blank = draft.length - n;
      if (blank > 0) msg += ' ' + blank + (blank === 1 ? ' card has' : ' cards have') + ' no ' +
        (spec.exact != null ? 'entry in "What it is"' : 'claim') + ' yet and will not be saved.';
      countNote.textContent = msg;
      countNote.className = 'fe-cap' + (spec.exact != null ? (n === spec.exact ? '' : ' is-off') : (n > spec.max ? ' is-off' : ''));
      addBtn.disabled = draft.length >= lim;
    }

    addBtn.addEventListener('click', function () {
      if (draft.length >= limit()) return;
      var c = {}; spec.parts.forEach(function (p) { c[p.key] = ''; });
      draft.push(c); paint();
      var inputs = listBox.querySelectorAll('.fe-item:last-child input,.fe-item:last-child textarea');
      if (inputs.length) inputs[0].focus();
    });

    body.appendChild(addBtn);
    body.appendChild(countNote);
    sheet.appendChild(body);

    var foot = make('div', 'fe-foot');
    foot.appendChild(make('span', 'fe-hint', 'Esc to cancel'));
    var cancel = make('button', 'fe-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', closeEditor);
    foot.appendChild(cancel);

    var ok = make('button', 'fe-btn primary', 'Save');
    ok.type = 'button';
    ok.setAttribute('data-fe-save', '');
    ok.addEventListener('click', function () {
      // An item with no head is not an item — it is an empty card the customer
      // opened and did not fill, and saving it would print a blank row.
      var next = draft.filter(function (d) { return has(d.h); }).map(function (d) {
        var out = {};
        spec.parts.forEach(function (p) { out[p.key] = has(d[p.key]) ? String(d[p.key]).trim() : null; });
        return out;
      });
      var before = wasStructured ? JSON.stringify(REC[spec.json] || []) : null;
      closeEditor();
      if (before !== null && before === JSON.stringify(next)) return;  // nothing changed
      var patch = {};
      patch[spec.json] = next;
      save(patch);
    });
    foot.appendChild(ok);
    sheet.appendChild(foot);

    paint();
    feScrim.replaceChildren(sheet);
    feScrim.hidden = false;
    document.addEventListener('keydown', feKeys, true);
    var first = listBox.querySelector('input,textarea');
    if (first) first.focus(); else addBtn.focus();
  }

  function openEditor(field) {
    if (STRUCTURED[field]) return openStructuredEditor(field);
    var spec = FIELD_SPEC[field] || {};
    var current = REC[field] == null ? '' : String(REC[field]);
    feReturnTo = document.activeElement;

    if (!feScrim) {
      feScrim = make('div', 'fe-scrim');
      feScrim.hidden = true;
      document.body.appendChild(feScrim);
      feScrim.addEventListener('mousedown', function (e) { if (e.target === feScrim) closeEditor(); });
    }

    var sheet = make('div', 'fe');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'feTitle');

    var head = make('div', 'fe-head');
    head.appendChild(make('p', 'fe-kind', spec.kind || 'Field'));
    var h = make('h2', 'fe-title', FIELD_LABELS[field] || field);
    h.id = 'feTitle';
    head.appendChild(h);
    if (spec.help) head.appendChild(make('p', 'fe-help', spec.help));
    sheet.appendChild(head);

    var body = make('div', 'fe-body');
    var input = document.createElement(spec.prose ? 'textarea' : 'input');
    input.className = spec.prose ? 'fe-area' : 'fe-input';
    if (!spec.prose) input.type = spec.type || 'text';
    input.value = current;
    input.setAttribute('aria-label', FIELD_LABELS[field] || field);
    body.appendChild(input);
    sheet.appendChild(body);

    var foot = make('div', 'fe-foot');
    var count = make('span', 'fe-count');
    var setCount = function () {
      count.textContent = spec.prose
        ? input.value.length + ' characters'
        : (input.value.trim() ? '' : 'empty — the field will be cleared');
    };
    input.addEventListener('input', setCount);
    setCount();
    foot.appendChild(count);
    foot.appendChild(make('span', 'fe-hint', 'Esc to cancel'));

    var cancel = make('button', 'fe-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', closeEditor);
    foot.appendChild(cancel);

    var ok = make('button', 'fe-btn primary', 'Save');
    ok.type = 'button';
    ok.setAttribute('data-fe-save', '');
    ok.addEventListener('click', function () {
      var next = input.value.trim();
      closeEditor();
      if (next === current.trim()) return;   // nothing changed — do not claim a save
      var patch = {};
      patch[field] = next;
      save(patch);
    });
    foot.appendChild(ok);
    sheet.appendChild(foot);

    feScrim.replaceChildren(sheet);
    feScrim.hidden = false;
    document.addEventListener('keydown', feKeys, true);
    input.focus();
    if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
  }

  /* Delegated: the sections are re-rendered on every save, which detaches any
     directly-bound listener. */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var edit = e.target.closest('[data-cs-field]');
    if (edit) { e.preventDefault(); openEditor(edit.getAttribute('data-cs-field')); return; }
    var contact = e.target.closest('[data-cs-contact]');
    if (contact) { e.preventDefault(); openEditor(contact.getAttribute('data-cs-contact')); return; }
    var copyBtn = e.target.closest('[data-cs-copy]');
    if (copyBtn) { e.preventDefault(); copyStatement(copyBtn); return; }
    var dl = e.target.closest('[data-cs-download]');
    if (dl) { e.preventDefault(); downloadExport(dl, dl.getAttribute('data-cs-download')); return; }
    if (e.target.closest('.lh-logo-remove')) { e.preventDefault(); removeLogo(); return; }
    var ed = e.target.closest('[data-cs-edition]');
    if (ed) { e.preventDefault(); setEdition(ed.getAttribute('data-cs-edition')); return; }
  });

  /* The file input is inside the label, so a click on the box opens the picker on its
     own. Only the change needs handling. */
  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.classList) return;
    if (!e.target.classList.contains('lh-logo-input')) return;
    uploadLogo(e.target.files && e.target.files[0]);
  });

  /* ── copy to clipboard — built from the record, so it cannot drift ───────── */
  function statementText() {
    var L = [];
    L.push(has(REC.company_name) ? REC.company_name : '(company name not set)');
    var ids = [];
    if (has(REC.uei)) ids.push('UEI ' + REC.uei);
    if (has(REC.cage_code)) ids.push('CAGE ' + REC.cage_code);
    if (ids.length) L.push(ids.join('  ·  '));
    var textLines = naicsLines();
    if (textLines.length) {
      L.push('', 'NAICS');
      for (var t = 0; t < textLines.length; t++) L.push('  ' + naicsLineText(textLines[t]));
    }
    if (list(REC.certifications).length) L.push('Certifications: ' + list(REC.certifications).join(', '));
    var compText = itemsOf('core_competencies');
    if (compText.length) {
      L.push('', 'CORE COMPETENCIES');
      compText.forEach(function (it) {
        L.push((has(it.k) ? it.k + ' — ' : '') + it.h);
        if (has(it.b)) L.push('  ' + it.b);
        if (has(it.s)) L.push('  ' + it.s);
      });
    }
    var difText = itemsOf('differentiators');
    if (difText.length) {
      L.push('', 'DIFFERENTIATORS');
      difText.forEach(function (it) {
        L.push(it.h);
        if (has(it.b)) L.push('  ' + it.b);
      });
    }
    var allPerf = orderForEdition(list(REC.past_performance));
    var perf = allPerf.slice(0, EXPORT_LIMIT);
    if (perf.length) {
      L.push('', 'PAST PERFORMANCE');
      perf.forEach(function (p) {
        L.push('- ' + [p.title, p.agency, p.notice_id, p.period, p.contract_value].filter(Boolean).join(' · '));
      });
      var knownTotal = PAST_TOTAL === null ? allPerf.length : PAST_TOTAL;
      if (knownTotal > perf.length) {
        L.push('(Showing the ' + perf.length + ' most recent of ' + knownTotal + ' awards on file.)');
      }
    }
    var contact = [REC.contact_name, REC.contact_email, REC.contact_phone, REC.contact_address, REC.contact_website].filter(has);
    if (contact.length) L.push('', 'CONTACT', contact.join('\n'));
    return L.join('\n');
  }

  /* THE EXPORT CARRIES THE DOCUMENT, NOT A TRANSCRIPT OF IT. The page renders a
     letterhead — company name, identifiers, ruled section headings — and the copy handed
     over a flat wall of text, so pasting into Word or an email produced something that
     looked nothing like the statement on screen. The clipboard now takes TWO flavours at
     once: text/html for anything that understands it (Word, Google Docs, Outlook, Gmail)
     and text/plain for anything that does not. Same record behind both, so the two cannot
     drift apart.

     Inline styles, not a stylesheet — a pasted fragment arrives with no CSS attached and
     Word discards <style> blocks. Every value below comes from REC; nothing is typed. */
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* The pasted document and the PDF are the same letterhead: FARaudit blue rule,
     the company ON FILE as the name, identifiers under it. Word and Google Docs drop
     <style> blocks and classes, so every rule here is inline or it does not survive
     the paste. */
  var X_ACCENT = '#378ADD';
  var X_INK = '#0f172a';
  var X_MUTE = '#475569';

  function statementHtml() {
    var F = 'font-family:Calibri,Arial,Helvetica,sans-serif';
    var H = [];
    H.push('<div style="' + F + ';color:' + X_INK + ';max-width:660px">');

    /* THE CUSTOMER'S NAME IS THE LETTERHEAD. This document goes to a contracting
       officer under their company's name, so ours does not sit above it.

       The logo is an absolute URL into a PUBLIC bucket for exactly this reason: the
       recipient opens this in Word or an email client with no session, possibly days
       later, and a signed URL would have expired and stripped the letterhead. */
    if (has(REC.logo_url)) {
      /* HEIGHT AS AN ATTRIBUTE. Word discards CSS max-height on a pasted image and
         renders it at natural size, so a square favicon filled most of a page. The
         attribute is honoured, and width is left to scale with the aspect ratio. */
      H.push('<div style="margin-bottom:10px"><img src="' + esc(REC.logo_url)
        + '" alt="" height="42" style="height:42px;width:auto"></div>');
    }
    H.push('<div style="font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:' + X_MUTE + '">Capability Statement</div>');
    H.push('<div style="font-size:24px;font-weight:700;letter-spacing:-.01em;margin:2px 0 8px;padding-bottom:10px;border-bottom:2px solid ' + X_ACCENT + '">'
      + esc(has(REC.company_name) ? REC.company_name : '(company name not set)') + '</div>');

    /* Identifiers a contracting officer checks today: UEI and CAGE. */
    var ids = [];
    if (has(REC.uei)) ids.push('UEI ' + esc(REC.uei));
    if (has(REC.cage_code)) ids.push('CAGE ' + esc(REC.cage_code));
    if (ids.length) H.push('<div style="font-size:12px;color:' + X_MUTE + ';margin-bottom:2px">' + ids.join(' &nbsp;&middot;&nbsp; ') + '</div>');
    var nl = naicsLines();
    if (nl.length) {
      H.push('<div style="margin:6px 0 2px">');
      H.push('<div style="font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:' + X_MUTE + ';margin-bottom:3px">NAICS</div>');
      for (var ni = 0; ni < nl.length; ni++) {
        H.push('<div style="font-size:12px;color:' + X_INK + ';line-height:1.5">'
          + '<span style="font-weight:700">' + esc(nl[ni].code) + '</span>'
          + (nl[ni].title ? ' &nbsp;' + esc(nl[ni].title) : '')
          + (nl[ni].primary ? ' <span style="font-size:8px;letter-spacing:.1em;color:' + X_ACCENT + '">PRIMARY</span>' : '')
          + '</div>');
      }
      H.push('</div>');
    }
    if (list(REC.certifications).length) {
      H.push('<div style="font-size:12px;color:' + X_MUTE + '">Certifications &nbsp;' + list(REC.certifications).map(esc).join(', ') + '</div>');
    }

    var sec = function (label, inner) {
      H.push('<div style="font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:' + X_ACCENT + ';margin:18px 0 6px">' + label + '</div>');
      H.push(inner);
    };
    var paras = function (v) {
      return String(v).split(/\n+/).filter(function (x) { return x.trim(); })
        .map(function (x) { return '<p style="margin:0 0 8px;font-size:13.5px;line-height:1.55">' + esc(x.trim()) + '</p>'; }).join('');
    };

    var itemHtml = function (arr) {
      return arr.map(function (it) {
        return '<p style="margin:0 0 8px;font-size:13.5px;line-height:1.55">'
          + (has(it.k) ? '<strong>' + esc(it.k) + '</strong> — ' : '')
          + '<strong>' + esc(it.h) + '</strong>'
          + (has(it.b) ? '<br>' + esc(it.b) : '')
          + (has(it.s) ? '<br>' + esc(it.s) : '')
          + '</p>';
      }).join('');
    };
    var compCopy = itemsOf('core_competencies');
    if (compCopy.length) sec('Core competencies', itemHtml(compCopy));
    var difCopy = itemsOf('differentiators');
    if (difCopy.length) sec('Differentiators', itemHtml(difCopy));

    var all = orderForEdition(list(REC.past_performance));
    var perf = all.slice(0, EXPORT_LIMIT);
    if (perf.length) {
      var body = '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.55">' + perf.map(function (pp) {
        return '<li>' + esc([pp.title, pp.agency, pp.notice_id, pp.period, pp.contract_value].filter(Boolean).join(' · ')) + '</li>';
      }).join('') + '</ul>';
      /* The pasted document carries the same disclosure the page does, or the customer
         sends a shortened list under their own name without knowing it. */
      var known = PAST_TOTAL === null ? all.length : PAST_TOTAL;
      if (known > perf.length) {
        body += '<div style="font-size:11px;color:' + X_MUTE + ';margin-top:6px">Showing the '
          + perf.length + ' most recent of ' + known + ' awards on file.</div>';
      }
      sec('Past performance', body);
    }

    var c = [];
    if (has(REC.contact_name)) c.push(esc(REC.contact_name));
    if (has(REC.contact_email)) c.push(esc(REC.contact_email));
    if (has(fmtPhone(REC.contact_phone))) c.push(esc(fmtPhone(REC.contact_phone)));
    if (has(REC.contact_address)) c.push(esc(REC.contact_address));
    if (has(REC.contact_website)) c.push(esc(REC.contact_website));
    if (c.length) sec('Contact', '<div style="font-size:13.5px;line-height:1.7">' + c.join('<br>') + '</div>');

    H.push('<div style="border-top:1px solid #cbd5e1;margin-top:20px;padding-top:8px;font-size:9px;color:#94a3b8">'
      + esc(has(REC.company_name) ? REC.company_name : 'Capability statement')
      + ' &nbsp;&middot;&nbsp; Confidential</div>');

    H.push('</div>');
    return H.join('');
  }

  /* The route refuses to render a statement with no company name on it (409) and has
     nothing to render before the first save (404). Both are answers the customer can
     act on, so they are read out of the response rather than dumped as raw JSON into
     a new tab — which is what a plain link to the endpoint would have done. */
  var DOWNLOADS = {
    pdf: { path: '/pdf', label: 'PDF', fallback: 'capability-statement.pdf' },
    docx: { path: '/docx', label: 'Word document', fallback: 'capability-statement.docx' }
  };

  function downloadExport(btn, kind) {
    var spec = DOWNLOADS[kind];
    if (!spec) return;
    var say = function (msg, ok) { localNote(btn, msg, ok); };
    say('Building ' + spec.label + '…', true);
    fetch(API + spec.path + editionQuery(), { credentials: 'include' })
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return null; }).then(function (b) {
            throw new Error((b && b.error) || ('Could not build the ' + spec.label + ' (HTTP ' + r.status + ')'));
          });
        }
        var name = spec.fallback;
        var cd = r.headers.get('content-disposition') || '';
        var m = cd.match(/filename="([^"]+)"/);
        if (m) name = m[1];
        return r.blob().then(function (blob) { return { blob: blob, name: name }; });
      })
      .then(function (d) {
        var url = URL.createObjectURL(d.blob);
        var a = document.createElement('a');
        a.href = url; a.download = d.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        say('✓ Downloaded ' + d.name, true);
      })
      .catch(function (e) { say(e.message || ('Could not build the ' + spec.label), false); });
  }

  function copyStatement(where) {
    var text = statementText();
    /* ONE confirmation, at the control that was pressed. Reporting the same copy in
       both places put two identical messages on screen for a single click. */
    var say = function (msg, ok) { if (where) localNote(where, msg, ok); else note(msg, ok); };
    var plainOnly = function () {
      if (!(navigator.clipboard && navigator.clipboard.writeText)) { say('Could not copy', false); return; }
      navigator.clipboard.writeText(text).then(
        function () { say('✓ Copied as text — ' + text.length + ' characters', true); },
        function () { say('Could not copy', false); }
      );
    };
    if (!(navigator.clipboard && window.ClipboardItem && navigator.clipboard.write)) { plainOnly(); return; }
    var item;
    try {
      item = new window.ClipboardItem({
        'text/html': new Blob([statementHtml()], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
    } catch (e) { plainOnly(); return; }
    navigator.clipboard.write([item]).then(
      function () { say('✓ Copied — keeps its formatting in Word, Docs and email', true); },
      plainOnly
    );
  }

  /* The confirmation has to appear where the button was pressed. The Export control sits
     ~900px below #csNote, so a copy from down there reported success off-screen and read
     as a dead button. */
  var localTimers = [];
  function localNote(btn, msg, ok) {
    var host = btn.parentNode;
    if (!host) return;
    /* One note per control, reused — and cleared, so a copy does not leave a
       permanent green sentence sitting beside the button. */
    for (var i = 0; i < localTimers.length; i++) clearTimeout(localTimers[i]);
    localTimers = [];
    var stale = document.querySelectorAll('.cs-localnote');
    for (var j = 0; j < stale.length; j++) if (stale[j].parentNode !== host) stale[j].remove();
    var n = host.querySelector('.cs-localnote');
    if (!n) { n = make('span', 'cs-localnote'); host.appendChild(n); }
    n.textContent = msg;
    n.classList.toggle('is-error', !ok);
    localTimers.push(setTimeout(function () { if (n.parentNode) n.remove(); }, NOTE_MS));
  }

  function renderAll() {
    paintLetterhead();
    paintLogo();
    paintProse('Core Competencies', 'core_competencies', 'core competencies',
      'This is the first thing a contracting officer reads. Add it with Edit.');
    paintProse('Differentiators', 'differentiators', 'differentiators',
      'This is what separates you from the other bidders. Add it with Edit.');
    paintPastPerformance();
    paintAwardHistory();
    paintVersions();
    paintContact();
    paintHealth();
    paintStats();
  }

  /* The green LIVE pill is a claim about THIS page's data, so only a settled fetch
     may turn it on — it ships hidden and stays hidden when the statement could not
     be read. Gated by test/public/_rail-live-badge.test.ts Part L. */
  function setLivePill(on) {
    var pill = document.getElementById('livePill');
    if (pill) pill.hidden = !on;
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
        /* Absent is not zero. An older route that does not send these leaves the page
           counting the rows it was given, which is what it did before. */
        PAST_TOTAL = typeof d.past_performance_total === 'number' ? d.past_performance_total : null;
        PAST_LIMIT = typeof d.past_performance_limit === 'number' ? d.past_performance_limit : null;
        NAICS_TITLES = (d.naics_titles && typeof d.naics_titles === 'object') ? d.naics_titles : {};
        AGENCIES = Array.isArray(d.tailored_agencies) ? d.tailored_agencies : [];
        renderAll();
        document.body.classList.add('cs-ready');
        setLivePill(true);
      })
      .catch(function (e) {
        console.error('[capability-statement-live]', e);
        document.body.classList.add('cs-unreadable');
        setLivePill(false);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
