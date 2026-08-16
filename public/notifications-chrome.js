/* notifications-chrome.js — single owner of the topbar notifications bell.
 *
 * Loaded as shared chrome by every surface that has a bell. Injects the CSS and
 * panel markup a host page is missing, and reuses the panel when one is present.
 *
 * Data comes from /api/notifications (list + unreadCount); read-state is
 * persisted via /api/notifications/<id>/read. Nothing is rendered that the API
 * did not return.
 *
 * Invariants:
 *   - the badge shows a count only from a successful response
 *   - loading, outage, empty and populated are four distinct rendered states
 *   - row text is escaped and row links are validated before use
 */
(function () {
  if (window.__farNotifChrome) return;
  window.__farNotifChrome = 1;

  var LIMIT = 20;

  /* Desk attribution. A row is labelled only when its `kind` names a desk;
   * unknown kinds render neutral rather than being attributed to a desk they
   * may not belong to. */
  var NDESK = {
    watcher_posted: { c: '#378ADD', l: 'Watcher',       href: null },
    opp:            { c: '#378ADD', l: 'Notices', href: '/notices' },
    gao:            { c: '#dc2626', l: 'GAO',           href: '/gao-protests' },
    cmmc:           { c: '#0891b2', l: 'CMMC',          href: '/cmmc' },
    far:            { c: '#7c3aed', l: 'FAR/DFARS',     href: '/far-dfars-updates' },
    co:             { c: '#185FA5', l: 'Contracting',   href: '/contracting-officers' },
    wage:           { c: '#d97706', l: 'Wage',          href: '/wage-benchmarks' },
    spend:          { c: '#2C6CB4', l: 'Spending',      href: '/defense-spending' }
  };

  /* Escapes text and attribute context; row values are externally sourced and
   * are never placed into innerHTML raw. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Row links: same-origin absolute paths and http(s) only. Anything else
   * renders as plain text instead of a click target. */
  function safeHref(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (/^\/(?!\/)/.test(s)) return s;            // "/audit/123", not "//host"
    if (/^https?:\/\//i.test(s)) return s;
    return null;
  }

  function relTime(iso) {
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return '';
    var mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    var h = Math.floor(mins / 60);
    if (h < 24) return h + 'h';
    var d = Math.floor(h / 24);
    return d < 7 ? d + 'd' : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  var CSS = '.notif-panel{position:absolute;top:46px;right:0;width:362px;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;z-index:60;transform-origin:top right;opacity:0;transform:translateY(-6px) scale(.98);pointer-events:none;transition:opacity .16s ease,transform .16s cubic-bezier(.16,1,.3,1)}'
    + '.notif-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}'
    + '.np-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:1px solid var(--line-2)}'
    + '.np-head h3{font-size:14px;font-weight:800;margin:0;letter-spacing:-.01em;color:var(--ink)}'
    + '.np-count{font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:700;color:#fff;background:var(--accent);border-radius:999px;padding:1px 7px}'
    + '.np-mark{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:10.5px;font-weight:700;color:var(--accent-deep);background:none;border:0;cursor:pointer;padding:0}'
    + '.np-mark:hover{text-decoration:underline}'
    + '[data-theme="dark"] .np-mark{color:var(--accent-light)}'
    + '.np-mark[hidden]{display:none}'
    + '.np-scroll{max-height:340px;overflow-y:auto}'
    + '.np-grp{font-family:"IBM Plex Mono",monospace;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);padding:11px 16px 5px;display:flex;align-items:center;gap:8px}'
    + '.np-grp::after{content:"";flex:1;height:1px;background:var(--line-2)}'
    + '.np-item{display:grid;grid-template-columns:9px 1fr auto;gap:11px;align-items:start;padding:10px 16px 11px;text-decoration:none;color:inherit;border-left:3px solid transparent;cursor:pointer;transition:background .12s}'
    + '.np-item:hover{background:var(--card-soft)}'
    + '.np-item.unread{background:var(--accent-pale);border-left-color:var(--accent)}'
    + '.np-item.unread:hover{background:var(--accent-light)}'
    + '[data-theme="dark"] .np-item.unread{background:rgba(55,138,221,.1)}'
    + '[data-theme="dark"] .np-item.unread:hover{background:rgba(55,138,221,.16)}'
    + '.np-dot{width:9px;height:9px;border-radius:50%;margin-top:5px}'
    + '.np-body{min-width:0}'
    /* The empty and failure states are NOT rows. .np-item is a 3-column grid
       (dot | body | time) and these carry only a body, so as an .np-item the text
       landed in the 9px DOT track and wrapped one word per line. A track belongs to
       the row, never to whichever child happens to be present. */
    + '.np-note{display:block;padding:18px 16px 20px;cursor:default}'
    + '.np-note .np-t{font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.32}'
    + '.np-note .np-d{font-size:11px;color:var(--mute);line-height:1.45;margin-top:3px}'
    + '.np-t{font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.32}'
    + '.np-t .np-desk{font-family:"IBM Plex Mono",monospace;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-right:6px}'
    + '.np-d{font-size:11px;color:var(--mute);line-height:1.45;margin-top:2px}'
    + '.np-time{font-family:"IBM Plex Mono",monospace;font-size:9.5px;color:var(--mute-2);white-space:nowrap;padding-top:2px}'
    + '.np-foot{padding:11px 16px;border-top:1px solid var(--line-2);text-align:center}'
    + '.np-foot a{font-size:12px;font-weight:700;color:var(--accent-deep);text-decoration:none;display:inline-flex;align-items:center;gap:6px}'
    + '.np-foot a svg{width:13px;height:13px}'
    + '[data-theme="dark"] .np-foot a{color:var(--accent-light)}';

  var PANEL_HTML = '<div class="np-head">'
    + '<h3>Notifications</h3><span class="np-count" id="npCount">0</span>'
    + '<button class="np-mark" id="npMark" type="button">Mark all read</button>'
    + '</div>'
    + '<div class="np-scroll" id="npScroll"></div>'
    + '<div class="np-foot"><a href="/dashboard">View all activity '
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
    + '</a></div>';

  function findBell() {
    var b = document.getElementById('bellBtn');
    if (b) return b;
    // The 15 pages + 2 audit templates that ship no id: the .icon-btn wrapping
    // a .nbadge is the bell.
    var badge = document.querySelector('.icon-btn .nbadge');
    return badge ? badge.closest('.icon-btn') : null;
  }

  function init() {
    var bell = findBell();
    if (!bell) return;

    var badge = bell.querySelector('.nbadge');

    /* Fail closed: the badge stays blank until a successful response supplies a
     * count, so markup defaults never stand in for real data. */
    if (badge) { badge.textContent = ''; badge.style.display = 'none'; }

    if (!document.getElementById('npChromeCss')) {
      var st = document.createElement('style');
      st.id = 'npChromeCss';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    // Reuse the host page's panel when it has one; build it otherwise. Either
    // way it is anchored to the bell's own action cluster.
    var panel = document.getElementById('notifPanel');
    var host = bell.parentElement;
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'notif-panel';
      panel.id = 'notifPanel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Notifications');
      panel.innerHTML = PANEL_HTML;
      (host || document.body).appendChild(panel);
    }
    // `.notif-panel` is position:absolute, so its containing block must be the
    // cluster rather than whichever ancestor happens to be positioned.
    var anchor = panel.parentElement;
    if (anchor && getComputedStyle(anchor).position === 'static') {
      anchor.style.position = 'relative';
    }

    var scroll = panel.querySelector('#npScroll');
    var count  = panel.querySelector('#npCount');
    var mark   = panel.querySelector('#npMark');
    if (!scroll) return;

    bell.setAttribute('aria-expanded', 'false');
    bell.setAttribute('aria-haspopup', 'dialog');

    var ITEMS = [], loaded = false, failed = false;

    function render() {
      var html = '', last = '';
      ITEMS.forEach(function (n, i) {
        if (n.grp !== last) { html += '<div class="np-grp">' + esc(n.grp) + '</div>'; last = n.grp; }
        var dk = (n.desk && NDESK[n.desk]) || { c: '#64748b', l: '', href: null };
        var href = n.href || dk.href || null;
        var label = dk.l ? '<span class="np-desk" style="color:' + dk.c + '">' + esc(dk.l) + '</span>' : '';
        var inner = '<span class="np-dot" style="background:' + dk.c + '"></span>'
          + '<div class="np-body"><div class="np-t">' + label + esc(n.t) + '</div>'
          + (n.d ? '<div class="np-d">' + esc(n.d) + '</div>' : '')
          + '</div><span class="np-time">' + esc(n.time) + '</span>';
        var cls = 'np-item' + (n.unread ? ' unread' : '');
        html += href
          ? '<a class="' + cls + '" data-i="' + i + '" href="' + esc(href) + '">' + inner + '</a>'
          : '<div class="' + cls + '" data-i="' + i + '" style="cursor:default">' + inner + '</div>';
      });

      /* Four distinct states, never conflated: an outage must not read as an
       * empty inbox, and the panel must not sit on "Loading…" once settled. */
      var t, d;
      if (failed)      { t = 'Notifications unavailable'; d = 'We could not read them just now — this is not an empty inbox. Retry shortly.'; }
      else if (loaded) { t = 'No notifications';          d = "You're all caught up."; }
      else             { t = 'Loading…';                  d = 'Reading your notifications.'; }

      scroll.innerHTML = html || '<div class="np-note"><div class="np-t">'
        + t + '</div><div class="np-d">' + d + '</div></div>';

      var unread = ITEMS.filter(function (n) { return n.unread; }).length;
      if (count) count.textContent = String(unread);
      // Hide the control when there is nothing to mark, rather than offering a
      // button with no effect.
      if (mark) mark.hidden = unread === 0;
      if (badge) {
        badge.textContent = unread ? String(unread) : '';
        badge.style.display = unread ? '' : 'none';
      }

      scroll.querySelectorAll('.np-item[data-i]').forEach(function (el) {
        el.addEventListener('click', function () {
          var n = ITEMS[+el.dataset.i];
          if (n && n.unread) { n.unread = false; markRead(n.id); render(); }
          // Navigation proceeds for <a> rows — the href is a validated route.
        });
      });
    }

    /* Read-state is persisted; a local-only clear would reappear on reload. */
    function markRead(id) {
      if (!id) return;
      fetch('/api/notifications/' + encodeURIComponent(id) + '/read', {
        method: 'PATCH', credentials: 'include'
      }).catch(function (e) { console.error('[notif-chrome] mark-read failed:', e); });
    }

    function load() {
      fetch('/api/notifications?limit=' + LIMIT, {
        credentials: 'include', headers: { accept: 'application/json' }
      }).then(function (r) {
        if (!r.ok) throw new Error('notifications ' + r.status);
        return r.json();
      }).then(function (data) {
        var rows = Array.isArray(data.notifications) ? data.notifications : [];
        var startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        ITEMS.length = 0;
        rows.forEach(function (n) {
          var ts = n.created_at ? new Date(n.created_at).getTime() : NaN;
          ITEMS.push({
            id: n.id,
            grp: !isNaN(ts) && ts >= startOfToday.getTime() ? 'Today' : 'Earlier',
            desk: Object.prototype.hasOwnProperty.call(NDESK, n.kind) ? n.kind : null,
            t: n.title || '(untitled)',
            d: n.body || '',
            href: safeHref(n.link),
            time: n.created_at ? relTime(n.created_at) : '',
            unread: !n.read_at
          });
        });
        loaded = true;
        render();
      }).catch(function (e) {
        console.error('[notif-chrome] load failed:', e);
        failed = true;               // an outage, NOT an empty inbox
        render();
      });
    }

    function open()  { panel.classList.add('open');    bell.classList.add('on');    bell.setAttribute('aria-expanded', 'true');  }
    function close() { panel.classList.remove('open'); bell.classList.remove('on'); bell.setAttribute('aria-expanded', 'false'); }

    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('open')) { close(); return; }
      open();
      // Re-read on each open so a tray left open on a stale tab isn't trusted.
      if (failed || !loaded) { failed = false; render(); }
      load();
    });

    if (mark) mark.addEventListener('click', function (e) {
      e.stopPropagation();
      // No bulk endpoint exists — persist each, or the clear returns on reload.
      ITEMS.filter(function (n) { return n.unread; }).forEach(function (n) { markRead(n.id); });
      ITEMS.forEach(function (n) { n.unread = false; });
      render();
    });

    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && !bell.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    render();  // paint "Loading…" so the panel is never blank
    load();    // hydrate the badge on page load, not just on open
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
