/* FARaudit · the phone control — one behaviour, every surface that shows a number.

   A desktop browser has nothing to dial with, so a `tel:` target raises an
   operating-system handler prompt — "wants to open this application" — rather
   than placing a call. What a reader does with a contracting officer's number is
   move it somewhere else: a phone, a CRM, a note. So the number copies.

   ⛔ ONE CONTROL, NOT ONE PER PAGE. Contracting Officers and the recompete record
   both render officer numbers out of the same directory. Two implementations of
   one idea are two ideas, and they diverge a line at a time until one number
   behaves differently depending on which tab a reader found it on. Every surface
   emits the same markup and this file owns what happens next.

   Handled by DELEGATION rather than per-element listeners: the surfaces that use
   this re-render whole sections when the feed refreshes or the scope changes, and
   a handler bound to an element does not survive its element. A listener on the
   document does.

   MARKUP CONTRACT — a surface emits:
     <button class="ph-copy" data-phone="2027812397">(202) 781-2397</button>
   `data-phone` carries the DIALLABLE value (digits, optional leading +) and the
   label carries the formatted one. Both come from the renderer, so this file
   never reformats a number and cannot disagree with what is on screen. */
(function () {
  'use strict';

  var RESTORE_MS = 1600;

  /* The copy is CONFIRMED, never assumed. writeText can reject — a denied
     permission, an insecure context, a browser that has neither path — and a
     control that says "Copied" on a clipboard it did not write is worse than one
     that says nothing, because the reader walks away and pastes something stale.
     So the label reports what actually happened. */
  function write(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var done = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        done ? resolve() : reject(new Error('copy refused'));
      } catch (e) { reject(e); }
    });
  }

  function flash(btn, msg, state) {
    if (btn.dataset.busy === '1') return;
    var original = btn.textContent;
    btn.dataset.busy = '1';
    btn.textContent = msg;
    btn.setAttribute('data-state', state);
    /* Announced as well as shown. The label change is the whole feedback, and a
       reader who is not looking at the button gets nothing from a colour. */
    btn.setAttribute('aria-live', 'polite');
    setTimeout(function () {
      btn.textContent = original;
      btn.removeAttribute('data-state');
      btn.dataset.busy = '';
    }, RESTORE_MS);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.ph-copy');
    if (!btn) return;
    e.preventDefault();
    var digits = btn.getAttribute('data-phone') || '';
    if (!digits) return;
    write(digits).then(
      function () { flash(btn, 'Copied', 'ok'); },
      function () { flash(btn, 'Press ⌘C', 'fail'); }
    );
  });
})();
