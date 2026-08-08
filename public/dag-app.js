/* FARaudit · Defense Agencies — render layer.

   Every office on this page came from the customer's own NAICS codes and the live SAM
   window. Nothing is typed by them and nothing is seeded here: an office appears because
   it is buying their codes right now, ranked by how much of it there is.

   THE SPAN IS STATED, NOT IMPLIED. Nothing persists notice history, so this ranks what is
   open in the current window. A rank that silently reshuffles between visits reads as a
   trend; this one says what it measures so it cannot be mistaken for one.

   EMPTY IS THREE ANSWERS. No codes on file, no notices this window, and a failed request
   are different facts with different next actions, so they get different words. Running
   panel renderers over an empty array instead would produce blank tiles and zeroed totals
   that read as measured values.

   Built with nodes, not markup: office and department names are external text from SAM.
   The visual language here is deliberately the page's own — one line per office, the
   page's existing type and rule tokens — because the design of this surface has not been
   through Design yet and inventing one here would be a port to undo. */
(function () {
  'use strict';

  function status() {
    return (window.DAG && window.DAG.STATUS) || { state: 'loading', reason: '' };
  }

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function notice(title, body) {
    var box = el('div', 'margin:20px 0 0;padding:22px 24px;border:1px solid var(--line-2,rgba(0,0,0,.12));'
      + 'border-radius:10px;max-width:720px');
    box.className = 'dag-unavailable';
    box.setAttribute('role', 'status');
    box.appendChild(el('div', 'font-family:Manrope,sans-serif;font-weight:800;font-size:15px;margin-bottom:8px', title));
    box.appendChild(el('p', 'font-size:12.5px;line-height:1.65;color:var(--mute,#64748b);margin:0', body));
    return box;
  }

  var MONO = '"IBM Plex Mono",monospace';

  function deadlineText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /* One office, one row. Counts are facts from the window; the audit line appears only
     when the customer has actually worked this office, because "0 audited" and "we have
     no record" are not the same statement. */
  function officeRow(o) {
    var row = el('div', 'padding:14px 0;border-bottom:1px solid var(--line-2,rgba(0,0,0,.08))');

    var top = el('div', 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap');
    top.appendChild(el('div', 'font-family:Manrope,sans-serif;font-weight:700;font-size:14.5px;color:var(--ink)',
      o.office || o.department || 'Unnamed office'));
    if (o.office && o.department) {
      top.appendChild(el('div', 'font-family:' + MONO + ';font-size:10.5px;color:var(--mute-2,#94a3b8)', o.department));
    }
    row.appendChild(top);

    var facts = [];
    facts.push(o.notices + ' open notice' + (o.notices === 1 ? '' : 's'));
    if (o.naics && o.naics.length) facts.push(o.naics.length + ' of your codes');
    if (o.in_pipeline) facts.push(o.in_pipeline + ' in your pipeline');
    if (o.audited) facts.push(o.audited + ' audited' + (o.decided ? ' · ' + o.decided + ' decided' : ''));
    var dl = deadlineText(o.next_deadline);
    if (dl) facts.push('next response due ' + dl);
    row.appendChild(el('div', 'font-family:' + MONO + ';font-size:11px;color:var(--mute);margin-top:5px', facts.join('  ·  ')));

    if (o.naics && o.naics.length) {
      row.appendChild(el('div', 'font-family:' + MONO + ';font-size:10.5px;color:var(--mute-2,#94a3b8);margin-top:4px',
        o.naics.join(' · ')));
    }
    return row;
  }

  function render() {
    var body = document.querySelector('.body');
    if (!body) return;
    var header = body.querySelector('.page-header');
    var children = [];
    for (var i = 0; i < body.children.length; i++) children.push(body.children[i]);
    children.forEach(function (e) { if (e !== header) e.remove(); });

    var s = status();
    var pill = document.getElementById('livePill');
    if (pill) pill.hidden = s.state !== 'ok';

    if (s.state === 'loading') {
      body.appendChild(notice('Loading', 'Asking which offices are buying your codes…'));
      return;
    }
    if (s.state === 'error') {
      body.appendChild(notice('Agency data unavailable',
        s.reason || 'The request failed, so nothing can be shown. This is not an empty list of offices.'));
      return;
    }
    if (s.state === 'empty') {
      if (s.reason === 'no-profile-codes') {
        body.appendChild(notice('No NAICS codes on your profile',
          'This page ranks the buying offices issuing work against your codes. With none on file there is '
          + 'nothing to rank. Add them under Profile & Settings → NAICS Configuration.'));
      } else {
        body.appendChild(notice('No open notices against your codes right now',
          'This is a real zero, not a missing source: your codes were searched and the current window '
          + 'holds nothing. It changes as agencies post.'));
      }
      return;
    }

    var meta = (window.DAG && window.DAG.META) || {};
    var offices = (window.DAG && window.DAG.OFFICES) || [];

    var lead = el('p', 'font-family:' + MONO + ';font-size:11.5px;color:var(--mute);margin:18px 0 0');
    lead.textContent = offices.length + ' buying office' + (offices.length === 1 ? '' : 's')
      + ' across ' + meta.departments + ' department' + (meta.departments === 1 ? '' : 's')
      + ' · ' + meta.notices + ' open notice' + (meta.notices === 1 ? '' : 's')
      + ' against your ' + (meta.naics_scope ? meta.naics_scope.length : 0) + ' code'
      + ((meta.naics_scope && meta.naics_scope.length === 1) ? '' : 's')
      + ' · ranked by volume in the current ' + meta.window_days + '-day window, not a running total';
    body.appendChild(lead);

    var list = el('div', 'margin-top:6px;max-width:860px');
    offices.forEach(function (o) { list.appendChild(officeRow(o)); });
    body.appendChild(list);
  }

  window.DAG_APP = { render: render, onThemeChange: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
