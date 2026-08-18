/* FARaudit · idle auto sign-out.

   Injected on every railed page by injectRail(), so the timer follows the customer
   across the product instead of living on one surface. Idempotent — a page that
   already loads it is unaffected.

   What it actually does, stated plainly because the settings copy has to match it:
   after N minutes with no interaction it POSTs the SAME /api/auth/sign-out the rail's
   Sign out button posts. The server session really ends. It is not a claim about the
   session's own lifetime, which Supabase owns.

   OFF is the default and the only state reachable without a stored preference: an
   unread or failed preference read never signs anybody out. A control that acts on
   what it could not read is worse than one that does nothing.

   Guarded by test/public/_auto-signout.test.ts.
*/
(function () {
  'use strict';
  if (window.__faAutoSignout) return;
  window.__faAutoSignout = true;

  var WARN_MS = 60000;              // final countdown, inside the idle window
  var TICK_MS = 1000;
  var LAST_KEY = 'faraudit-last-activity';   // shared across tabs
  var MINUTES = null;               // null/0 ⇒ feature off, nothing scheduled
  var timer = null;
  var overlay = null;
  var signingOut = false;

  function now() { return Date.now(); }

  function readLast() {
    try {
      var v = parseInt(localStorage.getItem(LAST_KEY) || '', 10);
      return isFinite(v) && v > 0 ? v : now();
    } catch (e) { return now(); }
  }
  function writeLast(t) { try { localStorage.setItem(LAST_KEY, String(t)); } catch (e) {} }

  /* The real sign-out, not a redirect that leaves the session alive. Posting the
     form is what the rail's own Sign out button does, so both paths end the session
     the same way and there is one behaviour to reason about. */
  function signOut() {
    if (signingOut) return;
    signingOut = true;
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = '/api/auth/sign-out';
    f.style.display = 'none';
    document.body.appendChild(f);
    f.submit();
  }

  function dismissOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  /* The warning is a real countdown over the real remaining time, and "Stay signed
     in" resets the same clock the timer reads. A dialog that counted its own
     independent seconds would drift away from the deadline it is announcing. */
  function showWarning(msLeft) {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'faSignoutWarn';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.setAttribute('aria-label', 'You are about to be signed out');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(6,14,28,.55);backdrop-filter:blur(2px)';
    var card = document.createElement('div');
    card.style.cssText =
      'max-width:420px;margin:16px;padding:22px 24px;border-radius:14px;background:var(--card,#fff);' +
      'color:var(--ink,#0A1628);border:1px solid var(--line-2,#e5e7eb);' +
      'box-shadow:0 24px 60px -20px rgba(10,22,40,.45);font-family:Manrope,system-ui,sans-serif';
    var h = document.createElement('div');
    h.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:7px';
    h.textContent = 'Signing you out';
    var p = document.createElement('div');
    p.style.cssText = 'font-size:13.5px;line-height:1.5;color:var(--mute,#5d6b7e)';
    var count = document.createElement('b');
    count.id = 'faSignoutCount';
    var stay = document.createElement('button');
    stay.type = 'button';
    stay.id = 'faSignoutStay';
    stay.textContent = 'Stay signed in';
    stay.style.cssText =
      'margin-top:16px;padding:9px 15px;border-radius:9px;border:0;cursor:pointer;' +
      'font-family:inherit;font-size:13.5px;font-weight:700;background:var(--accent,#185FA5);color:#fff';
    stay.addEventListener('click', function () { bump(); dismissOverlay(); });
    p.appendChild(document.createTextNode('No activity for a while. You will be signed out in '));
    p.appendChild(count);
    p.appendChild(document.createTextNode('. This is the auto sign-out you set in Settings.'));
    card.appendChild(h); card.appendChild(p); card.appendChild(stay);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    paintCount(msLeft);
    stay.focus();
  }

  function paintCount(msLeft) {
    var el = document.getElementById('faSignoutCount');
    if (!el) return;
    var s = Math.max(0, Math.ceil(msLeft / 1000));
    el.textContent = s === 1 ? '1 second' : s + ' seconds';
  }

  function bump() {
    writeLast(now());
    dismissOverlay();
  }

  function tick() {
    if (!MINUTES) return;
    var idleFor = now() - readLast();
    var limit = MINUTES * 60000;
    var left = limit - idleFor;
    if (left <= 0) { dismissOverlay(); signOut(); return; }
    if (left <= WARN_MS) { showWarning(left); paintCount(left); }
    else if (overlay) dismissOverlay();   // another tab moved; withdraw the warning
  }

  function arm(minutes) {
    MINUTES = typeof minutes === 'number' && isFinite(minutes) && minutes > 0 ? minutes : null;
    if (timer) { clearInterval(timer); timer = null; }
    dismissOverlay();
    if (!MINUTES) return;                 // OFF means nothing is scheduled at all
    writeLast(now());
    timer = setInterval(tick, TICK_MS);
  }

  // Interaction resets the clock. Kept passive so a scroll listener cannot cost
  // frames on the long pages this rides along on.
  var EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  EVENTS.forEach(function (e) {
    window.addEventListener(e, function () { if (MINUTES && !overlay) writeLast(now()); }, { passive: true });
  });
  // Returning to the tab is not activity — the clock kept running while it was
  // hidden, and pretending otherwise would let a background tab hold a session open
  // indefinitely. Re-check instead.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  /* Settings changes the preference in the same tab; this lets the running timer
     pick it up without a reload, so the control the customer just moved is the one
     in force. */
  window.faSetAutoSignout = arm;

  function boot() {
    fetch('/api/preferences', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var p = d && d.preferences;
        arm(p ? p.auto_signout_minutes : null);
      })
      .catch(function () { /* unread preference ⇒ stays OFF, deliberately */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
