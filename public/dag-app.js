/* FARaudit · Defense Agencies — render layer.

   One guard, one outcome. No agency data source is connected to this view, so
   there is nothing to draw: running panel renderers over empty arrays produces
   blank tiles, NaN axes and zeroed totals that read as measured values. The
   whole data region is replaced by a single stated notice instead, and the
   page header stays because it is the page's identity rather than its data.

   This mirrors /defense-spending exactly. When a source is connected, the
   renderers arrive with it — and they must key on fields that source actually
   returns, not on the shapes that were here before. */
(function () {
  'use strict';

  function status() {
    return (window.DAG && window.DAG.STATUS) || { state: 'loading', reason: '' };
  }

  function notice(title, body) {
    var box = document.createElement('div');
    box.className = 'dag-unavailable';
    box.setAttribute('role', 'status');
    box.style.cssText = 'margin:20px 0 0;padding:22px 24px;border:1px solid var(--line-2,rgba(0,0,0,.12));'
      + 'border-radius:10px;max-width:720px';
    var h = document.createElement('div');
    h.style.cssText = 'font-family:Manrope,sans-serif;font-weight:800;font-size:15px;margin-bottom:8px';
    h.textContent = title;
    var p = document.createElement('p');
    p.style.cssText = 'font-size:12.5px;line-height:1.65;color:var(--mute,#64748b);margin:0';
    p.textContent = body;
    box.appendChild(h);
    box.appendChild(p);
    return box;
  }

  function render() {
    var body = document.querySelector('.body');
    if (!body) return;
    var header = body.querySelector('.page-header');
    var children = [];
    for (var i = 0; i < body.children.length; i++) children.push(body.children[i]);
    children.forEach(function (el) { if (el !== header) el.remove(); });

    var s = status();
    var pill = document.getElementById('livePill');
    if (pill) pill.hidden = s.state !== 'ok';

    if (s.state === 'loading') {
      body.appendChild(notice('Loading', 'Asking for agency data\u2026'));
      return;
    }
    if (s.state === 'error') {
      body.appendChild(notice('Agency data unavailable',
        s.reason || 'The request failed, so nothing can be shown. This is not an empty agency list.'));
      return;
    }
    body.appendChild(notice('Agency data not connected',
      s.reason || 'This view has no agency source connected yet. Nothing is shown rather than showing figures that were never measured.'));
  }

  window.DAG_APP = { render: render, onThemeChange: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
