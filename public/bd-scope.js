/* BD SCOPE — the fiscal year and NAICS code a market view is looking at.
 *
 * WHY THIS EXISTS. Three panels — the primes who owe a subcontracting plan, the room left on awarded
 * contracts, and Recompete Radar — are moving out of Defense Spending to their own destination. They
 * are a WEEKLY read ("who do I call") sitting inside a TWICE-A-YEAR one (orientation), and the weekly
 * read loses to the long scroll every time.
 *
 * ⛔ THE MOVE IS NOT THE MARKUP. A panel that only works inside one page's filter cannot BE a
 * destination: land on it directly and it has no scope; send someone the link and the recipient sees
 * whatever their own last click left behind. Copying a page-local filter variable into a second file
 * ships two of them, and two copies of one rule are two rules.
 *
 * So the scope stops being a page's private state and becomes a thing with an address:
 *
 *   URL            ?fy=FY2026&code=336611   — wins, always. A link has to mean what it says.
 *   localStorage   the last scope this browser chose — continuity when you navigate between pages.
 *   neither        null, and the page picks its own default (the latest measured year).
 *
 * ⛔ A SCOPE IS A REQUEST, NOT A FACT. `?fy=FY2019` on a feed that measured FY2024-26 must not render
 * FY2026 under a URL saying 2019, and must not render an empty page either. `reconcile()` returns what
 * was asked, what can be shown, and whether they differ — the caller prints the difference. A
 * substitution the reader is not told about is a page misstating its own year.
 */
(function () {
  var KEY = 'faraudit-bd-scope';
  var listeners = [];
  var current = null;

  function readUrl() {
    try {
      var q = new URLSearchParams(window.location.search);
      var fy = q.get('fy'), code = q.get('code');
      return { fy: fy || null, code: code || null };
    } catch (e) { return { fy: null, code: null }; }
  }

  function readStore() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return { fy: null, code: null };
      var o = JSON.parse(raw);
      return { fy: o && typeof o.fy === 'string' ? o.fy : null,
               code: o && typeof o.code === 'string' ? o.code : null };
    } catch (e) { return { fy: null, code: null }; }
  }

  function load() {
    var u = readUrl(), s = readStore();
    // Field by field, not object by object: a URL naming only a code should not
    // discard the year the reader was already on.
    return { fy: u.fy || s.fy, code: u.code || s.code, fromUrl: { fy: !!u.fy, code: !!u.code } };
  }

  function writeStore(sc) {
    try { window.localStorage.setItem(KEY, JSON.stringify({ fy: sc.fy, code: sc.code })); }
    catch (e) { /* private browsing — the scope still works, it just does not persist */ }
  }

  /* The URL is kept in step with what is on screen, via replaceState so the back
     button still means "the previous page" rather than "the previous filter
     click". A reader who filters and then copies the address bar gets the view
     they are actually looking at. */
  function writeUrl(sc) {
    try {
      var q = new URLSearchParams(window.location.search);
      if (sc.fy) q.set('fy', sc.fy); else q.delete('fy');
      if (sc.code) q.set('code', sc.code); else q.delete('code');
      var qs = q.toString();
      window.history.replaceState(null, '',
        window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    } catch (e) { /* no history API — everything else still holds */ }
  }

  function get() {
    if (!current) current = load();
    return { fy: current.fy, code: current.code };
  }

  /** Merge a partial scope. Pass null for a field to clear it. */
  function set(patch, opts) {
    var sc = get();
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'fy')) sc.fy = patch.fy || null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'code')) sc.code = patch.code || null;
    current = { fy: sc.fy, code: sc.code, fromUrl: current ? current.fromUrl : { fy: false, code: false } };
    writeStore(sc);
    if (!opts || opts.url !== false) writeUrl(sc);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](get()); } catch (e) { /* one bad listener must not stop the others */ }
    }
  }

  function subscribe(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* WHAT WAS ASKED FOR vs WHAT CAN BE SHOWN.
     `years` and `codes` are what the feed actually measured. A requested value
     outside them is always reported: `note` is the sentence the page prints.
     Returning the fallback on its own would leave the reader unable to tell
     which year is on screen. */
  function reconcile(years, codes) {
    var sc = get();
    var ys = Array.isArray(years) ? years : [];
    var cs = Array.isArray(codes) ? codes : [];
    var fyOk = !sc.fy || ys.indexOf(sc.fy) >= 0;
    var codeOk = !sc.code || cs.indexOf(sc.code) >= 0;
    var fy = fyOk && sc.fy ? sc.fy : (ys.length ? ys[ys.length - 1] : null);
    var code = codeOk ? sc.code : null;
    var notes = [];
    if (!fyOk) notes.push(sc.fy + ' has not been measured for these codes' + (fy ? ' — showing ' + fy : ''));
    if (!codeOk) notes.push('NAICS ' + sc.code + ' is not one of your tracked codes — showing all of them');
    return { fy: fy, code: code, requestedFy: sc.fy, requestedCode: sc.code,
             ok: fyOk && codeOk, note: notes.join(' · ') };
  }

  window.BD_SCOPE = { get: get, set: set, subscribe: subscribe, reconcile: reconcile, KEY: KEY };
})();
