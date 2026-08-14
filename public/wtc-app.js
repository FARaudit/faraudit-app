/* FARaudit · /who-to-call — the recompete record.

   Renders one document into #o4 from the payload defense-spending-live.js
   installs on window.DSB. Five sections, all derived:

     01  the concentration    — the expiry cluster, one cell per contract
     02  who to call          — buying offices ranked by value at stake
     03  the record           — every contract held, by expiry
     04  who already wins     — window.DSB.CONCENTRATION
     05  small-business share — window.DSB.SB_WINNERS

   UNITS ARE NOT UNIFORM ACROSS THIS PAYLOAD AND MUST NOT BE INFERRED.
   RECOMPETES.amount is RAW DOLLARS and takes full() or cur().
   CONCENTRATION and SB_WINNERS carry top5_val, total, val, sb_total and
   code_total in MILLIONS and take curM(). A money field added later picks its
   formatter from this note, never from resemblance to a neighbouring field.

   Nothing here is typed: every figure, every count, and every numeral spelled
   out in the prose is computed from the payload, so the copy cannot drift from
   the data it describes. */
(function () {
  'use strict';

  var HOST = 'o4';

  /* Markup is parsed inert and adopted, so a value that reaches the document
     carrying angle brackets becomes text rather than an element. Every
     interpolated field is also escaped at the point of use. */
  var PARSER = new DOMParser();
  function setHTML(el, html) {
    if (!el) return;
    var doc = PARSER.parseFromString('<body>' + html + '</body>', 'text/html');
    el.replaceChildren.apply(el, Array.prototype.slice.call(doc.body.childNodes));
  }

  /* ── FORMATTERS ──────────────────────────────────────────────────────────
     Null is a distinct answer from zero throughout. The feed publishes nullable
     amounts and nullable percentages, and rendering either as 0 would state a
     measurement we do not hold, so each formatter has an explicit absent branch
     and prints a dash rather than a figure. */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function iso(s) {
    if (!s) return '—';
    var p = String(s).split('-');
    if (p.length < 3) return String(s);
    return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var SMALL = { Llc: 'LLC', Inc: 'Inc.', 'Inc.': 'Inc.', Usa: 'USA', Lp: 'LP' };
  function tc(s) {
    return String(s || '').toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); })
      .split(' ').map(function (w) { return SMALL[w] || w; }).join(' ');
  }

  /* Compact currency over raw dollars. The list spans roughly $150K to $1.9B,
     so a fixed unit prints either eight zeros or a rounding error. */
  function cur(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    return '$' + Math.round(n / 1e3) + 'K';
  }

  /* Exact dollars, for the record and its foot. */
  function full(n) {
    if (n == null) return 'Not stated';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  /* MILLIONS. Passing a CONCENTRATION value through cur() prints $25.0K for a
     figure that means $25.04B, so the two scales get two formatters. */
  function curM(m) {
    if (m == null) return '—';
    if (m >= 1000) return '$' + (m / 1000).toFixed(2) + 'B';
    if (m >= 1) return '$' + m.toFixed(m >= 100 ? 0 : 1) + 'M';
    return '$' + Math.round(m * 1000) + 'K';
  }

  function pc(p) {
    if (p == null || !isFinite(p)) return '—';
    return (p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : Math.round(p)) + '%';
  }

  function ord(n) {
    return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  /* A sentence scoped "per code" is derived from EVERY code. Reading the count
     off the first element states one code's figure over all of them, so this
     prints a single figure only where every code agrees and a range otherwise,
     with the ordinal following the figure rather than being typed. */
  function listedNote(set, noun) {
    noun = noun || 'recipients';
    var ns = [];
    set.forEach(function (c) {
      if (typeof c.listed === 'number' && ns.indexOf(c.listed) === -1) ns.push(c.listed);
    });
    ns.sort(function (a, b) { return a - b; });
    if (!ns.length) return '';
    if (ns.length === 1) {
      return 'The ' + ns[0] + ' largest ' + noun + ' in each code are held, so these are the '
        + 'largest — firms below the ' + ord(ns[0]) + ' are not named.';
    }
    return 'Between ' + ns[0] + ' and ' + ns[ns.length - 1] + ' of the largest ' + noun
      + ' are held per code, so these are the largest — firms below that are not named.';
  }

  /* Ten digits set as (206) 555-0142; eleven beginning 1 is the same number
     carrying a country code. Anything else prints exactly as held — a string we
     cannot parse is still dialable, and reshaping one we do not understand is
     how a digit goes missing. The tel: target always carries the raw value. */
  function tel(s) {
    var d = String(s || '').replace(/\D/g, '');
    var n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
    return n.length === 10 ? '(' + n.slice(0, 3) + ') ' + n.slice(3, 6) + '-' + n.slice(6) : String(s || '');
  }

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function word(n) {
    return n < 20 ? ONES[n]
      : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
  }
  function Word(n) { var w = word(n); return w.charAt(0).toUpperCase() + w.slice(1); }

  /* ── THE DOCUMENT ────────────────────────────────────────────────────────*/
  function build(D) {
    var asOf = D.as_of ? new Date(D.as_of) : null;
    function days(s) {
      if (!s || !asOf || isNaN(asOf)) return null;
      return Math.round((new Date(s + 'T00:00:00Z') - asOf) / 864e5);
    }

    var tracked = (D.coverage && D.coverage.tracked) || [];

    /* THE MASTHEAD STATES THE SCOPE, INCLUDING THAT IT IS A SUBSET. Printing the
       one selected code alone would let a scoped record be read as the whole
       account; printing all three while showing one code's contracts would be
       worse. Named code first, then how many others are on file. */
    var others = tracked.length - 1;
    var scopeLine = D.code
      ? esc(D.code) + (others > 0 ? ' · ' + word(others) + ' more code'
        + (others === 1 ? '' : 's') + ' on file' : '')
      : (tracked.length ? tracked.map(esc).join(' · ') : 'none on file');

    var mast = '<header class="o4-h"><div class="o4-hk">FARaudit · Recompete record</div>'
      + '<div class="o4-hd">Prepared ' + esc(iso(String(D.as_of || '').slice(0, 10)))
      + ' · NAICS ' + scopeLine + '</div></header>';

    /* WHAT THIS DOCUMENT IS SPEAKING ABOUT, in prose, derived once. Every
       sentence that names the searched set takes this, so a record narrowed to
       one code never describes itself as covering all of the account's codes.
       Held in one place because a phrase written out at each site is a rule in
       as many copies as it has sites, and they drift one at a time. */
    var subject = D.code ? 'NAICS ' + esc(D.code) : 'your codes';

    /* A row with no period-of-performance end cannot be placed on a record
       ordered by expiry. It is held out of the ordering and counted, and §03
       states that count, so the set the document prints is never larger or
       smaller than the set it describes. */
    var all = (D.rows || []).slice();
    var undated = all.filter(function (r) { return !r.end_date; });
    var rows = all.filter(function (r) { return !!r.end_date; })
      .sort(function (a, b) {
        return a.end_date.localeCompare(b.end_date) || (b.amount || 0) - (a.amount || 0);
      });

    function undatedNote() {
      if (!undated.length) return '';
      return undated.length + ' award' + (undated.length === 1 ? '' : 's')
        + ' in ' + subject + ' carry no end date and cannot be placed on a record ordered by expiry. ';
    }

    /* EMPTY. A document with no record states what it looked for and what it
       excludes: a page that only says nothing found cannot be told apart from
       one that failed to run. No hero, no summary strip, no sections. */
    if (!rows.length) {
      return mast + '<div class="o4-empty"><p class="o4-lede">No contract in '
        + subject + ' comes up for recompete.</p>'
        + '<p class="o4-p">We looked at every federal contract whose period of performance ends '
        + 'inside the window we monitor, in NAICS '
        + (D.code ? esc(D.code)
          : tracked.length ? tracked.map(esc).join(', ')
            : '— no codes are on file for this account')
        + '. Nothing matched.'
        + (D.code && tracked.length > 1
          ? ' This record is scoped to one of your ' + word(tracked.length)
            + ' codes — clear the scope to see the others.' : '')
        + '</p>'
        + '<p class="o4-n">' + undatedNote()
        + 'This is a statement about the window and the codes, not about the market: a contract '
        + 'ending outside the window, or in a code you do not track, does not appear here. Add a '
        + 'code and the record is rebuilt on the next pull.</p></div>';
    }

    function officers(office) { return (D.offices || {})[office] || []; }
    function contactable(list) {
      return (list || []).filter(function (x) { return x && x.email; });
    }

    /* Grouped by buying office — the only join the record supports. Officers key
       to an office and offices to contracts; there is no officer-on-contract
       field, and manufacturing that join is the one thing this page must not do. */
    var byOffice = (function () {
      var m = {}, order = [];
      rows.forEach(function (r) {
        var k = r.office || '—';
        if (!m[k]) { m[k] = { office: k, rows: [], val: 0, agencies: [] }; order.push(k); }
        var o = m[k];
        o.rows.push(r);
        o.val += r.amount || 0;
        if (r.agency && o.agencies.indexOf(r.agency) === -1) o.agencies.push(r.agency);
      });
      return order.map(function (k) {
        var o = m[k];
        o.officers = officers(o.office);
        return o;
      }).sort(function (a, b) { return b.val - a.val; });
    })();

    var total = rows.reduce(function (n, r) { return n + (r.amount || 0); }, 0);

    /* The repeated expiry is the finding this document is built on. */
    var byDate = (function () {
      var m = {}, order = [];
      rows.forEach(function (r) {
        if (!m[r.end_date]) { m[r.end_date] = 0; order.push(r.end_date); }
        m[r.end_date]++;
      });
      return order.map(function (d) { return [d, m[d]]; })
        .sort(function (a, b) { return b[1] - a[1]; });
    })();
    var peak = byDate[0];
    var shared = byDate.filter(function (d) { return d[1] > 1; })
      .reduce(function (n, d) { return n + d[1]; }, 0);
    var alone = rows.length - shared;

    /* THE OFFICER DIRECTORY HAS THREE STATES, NOT TWO, and only one of them
       licenses a claim about who works where. It arrives on its own fetch after
       the record is already on screen, so until it settles we hold no officers
       merely because we have not looked yet. Rendering that as a contacts count
       of zero would state, of every office on the record, that nobody there can
       be called — a claim about the offices made out of a claim about our own
       reading. offKnown gates every sentence and every cell that counts. */
    var offState = D.officerState || 'loading';
    var offKnown = offState === 'ok';

    var callable = byOffice.filter(function (o) { return contactable(o.officers).length; });
    function pctOf(v) { var p = v / total * 100; return p < 1 ? '<1' : Math.round(p); }

    /* THE RECORD IS A CAPPED SET, NOT A TOTAL. The collector stops at a fixed
       number of rows per NAICS code, so a code sitting on exactly that number is
       very likely truncated. Every count on this page therefore says SHOWN, and
       §03 names the codes at the ceiling. A loop bound presented as a
       measurement is the one number this document must not print. */
    var PER_CODE_CAP = (D.coverage && typeof D.coverage.top_n === 'number')
      ? D.coverage.top_n : 10;
    var perCode = (function () {
      var m = {}, order = [];
      rows.forEach(function (r) {
        if (!m[r.naics]) { m[r.naics] = 0; order.push(r.naics); }
        m[r.naics]++;
      });
      return order.map(function (c) { return [c, m[c]]; })
        .sort(function (a, b) { return b[1] - a[1]; });
    })();
    var atCap = perCode.filter(function (c) { return c[1] >= PER_CODE_CAP; });

    /* The cluster is a FINDING, derived, never assumed. Where no date repeats,
       peak is 1, and "one expires on a single afternoon" would be true of every
       contract ever written, so the headline follows the data. §01 additionally
       requires enough rows to be worth summarising: a one-cell count block is
       not a summary of anything. */
    var clustered = peak[1] > 1;
    var summarise = clustered && rows.length >= 3;

    var h = mast;

    h += '<div class="o4-hero"><p class="o4-lede">'
      + (clustered
        ? Word(peak[1]) + ' of your ' + word(rows.length) + ' recompetes expire on a single afternoon.'
        : rows.length === 1
          ? 'One contract in ' + subject + ' comes up for recompete, on '
            + esc(iso(rows[0].end_date)) + '.'
          : 'Your ' + word(rows.length) + ' recompetes expire on ' + word(byDate.length)
            + ' separate dates.')
      + '</p>'
      + '<div class="o4-fig"><b>' + cur(total) + '</b>'
      + '<i>total award value coming up<br>for recompete in ' + subject + '</i></div></div>';

    var largest = rows.reduce(function (m, r) {
      return r.amount == null ? m : (m == null ? r.amount : Math.max(m, r.amount));
    }, null);

    h += '<div class="o4-sum">'
      + [['Contracts shown', String(rows.length)],
        ['Buying offices', String(byOffice.length)],
        ['Offices you can call', (offKnown ? String(callable.length) : '—') + ' of ' + byOffice.length],
        ['Earliest expiry', esc(iso(rows[0].end_date))],
        ['Latest expiry', esc(iso(rows[rows.length - 1].end_date))],
        ['Largest single award', cur(largest)]]
        .map(function (kv) {
          return '<div class="o4-sc"><dt>' + kv[0] + '</dt><dd>' + kv[1] + '</dd></div>';
        }).join('')
      + '</div>';

    /* §01 · the prose and the distribution on one spread, so the reader is not
       asked to take the sentence on trust. */
    if (summarise) {
      var pkStart = rows.findIndex(function (r) { return r.end_date === peak[0]; });
      var unit = 100 / rows.length;
      h += '<section class="o4-s"><h3><span>01</span> The concentration</h3>'
        + '<div class="o4-two"><div><p class="o4-p">One date carries <b>' + peak[1] + ' of '
        + rows.length + '</b> expiries. It is ' + esc(iso(peak[0])) + '.</p></div>'
        + '<div class="o4-rail"><div class="o4-rk">One cell per contract, in order of expiry · '
        + shared + ' share a date, ' + alone + ' stand alone</div>'
        /* One cell per contract, nothing scaled, so the reader VERIFIES the
           headline instead of trusting an encoding. Its axis is ORDER, not time,
           which is why the true first and last expiry stay printed beneath it. */
        + '<div class="o4-blk">'
        + rows.map(function (r) {
          return '<span class="o4-cell' + (r.end_date === peak[0] ? ' on' : '') + '"></span>';
        }).join('')
        + '</div><div class="o4-brk">'
        + '<span class="o4-bk" style="left:' + (pkStart * unit).toFixed(2)
        + '%;width:' + (peak[1] * unit).toFixed(2) + '%"></span>'
        + '<span class="o4-bl" style="left:' + ((pkStart + peak[1] / 2) * unit).toFixed(2)
        + '%">' + peak[1] + ' on ' + esc(iso(peak[0])) + '</span></div>'
        + '<div class="o4-rr"><span>' + esc(iso(rows[0].end_date)) + '</span>'
        + '<span>' + rows.length + ' contracts</span>'
        + '<span>' + esc(iso(rows[rows.length - 1].end_date)) + '</span></div></div></div></section>';
    }

    /* §02 · what makes this a document to act from rather than only read. */
    h += '<section class="o4-s"><h3><span>02</span> Who to call</h3>';
    if (!offKnown) {
      /* Not yet read, and saying so. Neither of these sentences makes any claim
         about the offices — both describe the state of our own lookup. */
      h += '<p class="o4-p">'
        + (offState === 'loading'
          ? 'Looking up the contracting officers who post from these buying offices…'
          : 'The contracting-officer directory could not be read, so this section cannot yet '
            + 'name who to call.')
        + '</p><p class="o4-n">'
        + (offState === 'loading'
          ? 'The offices themselves are on the record in §03; the officers land here when the '
            + 'lookup returns.'
          : 'This is a statement about our read of the directory, not about these offices: every '
            + 'one of them is named on its award. It refreshes nightly.')
        + '</p></section>';
    } else if (!callable.length) {
      /* The honest failure is OURS and says so: every office is named on its
         award, we simply hold no officer for it. An empty ranked table reports
         the data broken; an omitted section reports that there is nobody to
         call. Written as a branch so no tag is emitted mid-string. */
      h += '<p class="o4-p">'
        + (byOffice.length === 1
          ? 'We hold no contracting officer for the one buying office on this record. It is named '
            + 'on its award — the gap is ours, not an office without officers.'
          : 'We hold no contracting officer for any of the ' + word(byOffice.length)
            + ' buying offices on this record. Every one of them is named on its award — the gap '
            + 'is ours, not an office without officers.')
        + '</p>'
        + '<p class="o4-n">The offices are listed in §03 with a contacts count of zero. Ask '
        + 'through SAM in the meantime, or tell us which office matters and we will go and get '
        + 'it.</p></section>';
    } else {
      h += '<table class="o4-t o4-call"><thead><tr><th class="r">#</th><th>Buying office</th>'
        + '<th>Contracting officer <em>who posts from this office</em></th>'
        + '<th class="c">Contracts</th><th class="n">Value at stake</th>'
        + '<th class="n">Share</th></tr></thead><tbody>'
        + callable.slice(0, 6).map(function (o, i) {
          var cs = contactable(o.officers);
          var lead = cs[0];
          var withPhone = cs.filter(function (x) { return x.phone; })[0] || {};
          var more = cs.length - 1;
          /* THE ROSTER LINK BELONGS TO THE OFFICE, NOT THE LEAD OFFICER. It
             carries the raw office string, URI-encoded, matching how the
             directory is keyed. It renders only where we already hold more than
             one officer, so a reader never follows it from a row we know nothing
             about. The number itself stays on this page: a page called Who to
             call that sends you elsewhere for the number is a page called Who to
             look up. */
          return '<tr><td class="o4-rk2">' + String(i + 1).padStart(2, '0') + '</td>'
            + '<td class="o4-rc"><b>' + esc(tc(o.office)) + '</b><i>'
            + o.agencies.map(esc).join(' · ') + '</i>'
            + (more ? '<a class="o4-more" href="/contracting-officers?office='
              + esc(encodeURIComponent(o.office)) + '">' + (more + 1)
              + ' officers at this office →</a>' : '') + '</td>'
            + '<td class="o4-oc"><b>' + esc(tc(lead.name)) + '</b>'
            + '<span class="o4-cm">'
            + (withPhone.phone ? '<a class="o4-tel" href="tel:' + esc(withPhone.phone) + '">'
              + esc(tel(withPhone.phone)) + '</a>' : '')
            + '<a class="o4-mail" href="mailto:' + esc(lead.email) + '">' + esc(lead.email) + '</a>'
            + '</span></td><td class="o4-ct">' + o.rows.length + '</td>'
            + '<td class="o4-vl">' + full(o.val) + '</td>'
            + '<td class="o4-pc">' + pctOf(o.val) + '%</td></tr>';
        }).join('')
        + '</tbody></table>'
        /* The caveat rides in the column key, where it qualifies the thing it is
           about. What stays here is the fact the table cannot state about
           itself: how many of the offices it shows. */
        + '<p class="o4-n">Ranked by value at stake, ' + Math.min(6, callable.length) + ' of '
        + byOffice.length + ' offices shown. ' + (byOffice.length - callable.length)
        + ' hold ' + cur(byOffice.filter(function (o) { return !contactable(o.officers).length; })
          .reduce(function (n, o) { return n + o.val; }, 0))
        + ' between them with no contact on file — our gap, not an office without officers.'
        + '</p></section>';
    }

    /* §03 · the whole record. */
    h += '<section class="o4-s"><h3><span>03</span> The record <em>'
      + (rows.length === 1 ? 'the one contract on this record'
        : rows.length + ' contracts, by expiry · ' + PER_CODE_CAP + ' per code at most')
      + '</em></h3>'
      + '<table class="o4-t o4-rec"><thead><tr><th>Expires</th><th class="r">Days</th>'
      + '<th>Incumbent</th><th>Agency · NAICS · award</th><th>Buying office</th>'
      + '<th class="c">Contacts <em>on file</em></th>'
      + '<th class="n">Award value</th></tr></thead><tbody>'
      + rows.map(function (r, i) {
        var rep = i > 0 && r.end_date === rows[i - 1].end_date;
        var nc = contactable(officers(r.office)).length;
        var d = days(r.end_date);
        /* A REPEATED EXPIRY IS NOT RENDERED. Painting it transparent leaves it
           invisible to a reader and still announced to a screen reader, so the
           cell is empty and the run reads as one date governing several rows. */
        return '<tr class="' + (rep ? 'rep' : '') + '"><td class="o4-dt">'
          + (rep ? '' : esc(iso(r.end_date))) + '</td>'
          + '<td class="o4-dy">' + (rep || d == null ? '' : d) + '</td>'
          + '<td class="o4-in">' + esc(tc(r.recipient)) + '</td>'
          + '<td class="o4-id">' + esc(r.agency || '—') + ' · ' + esc(r.naics) + ' · '
          + esc(r.award_id || '—') + '</td>'
          + '<td class="o4-of">' + esc(r.office || '—') + '</td>'
          /* A FACT THAT EXISTS FOR EVERY ROW IS A COLUMN, NOT A NOTE ON SOME
             ROWS. As a count it is one glyph on every row and comparable down
             the column, and a zero states the same thing without a sentence.
             The key carries "on file": the number is what WE hold, never a claim
             about how many officers the office employs. */
          + '<td class="o4-ct' + (offKnown && nc ? '' : ' zero') + '">'
          + (offKnown ? nc : '—') + '</td>'
          + '<td class="o4-vl">' + full(r.amount) + '</td></tr>';
      }).join('')
      + '<tr class="tot"><td colspan="6">Total of the ' + rows.length + ' shown</td>'
      + '<td class="o4-vl">' + full(total) + '</td></tr>'
      + '</tbody></table>'
      + '<p class="o4-n">'
      + (atCap.length
        ? 'This record holds at most ' + PER_CODE_CAP + ' contracts per NAICS code, the soonest '
          + 'to expire. ' + (atCap.length === 1 ? 'Code ' : 'Codes ')
          + atCap.map(function (c) { return esc(c[0]); }).join(' and ') + ' '
          + (atCap.length === 1 ? 'is' : 'are') + ' at that ceiling, so further recompetes exist '
          + 'in ' + (atCap.length === 1 ? 'it' : 'them') + ' and are not shown here. '
        : 'This record holds at most ' + PER_CODE_CAP + ' contracts per NAICS code; no code is '
          + 'at that ceiling, so every recompete in the window appears. ')
      + undatedNote()
      + (offKnown
        ? 'Contacts on file counts the contracting officers we hold for that buying office — a '
          + 'zero is our gap, not an office without officers. '
        : 'Contacts on file reads as a dash because the contracting-officer directory has not '
          + 'been read yet; a dash is an unread count, not a count of none. ')
      + 'Values are total award value as reported to USAspending, not obligations to date. '
      + 'A blank expiry repeats the date above it.'
      + '</p></section>';

    /* §04 · WHO ALREADY WINS HERE. EVERY SHARE NAMES ITS BASE IN THE COLUMN KEY:
       this one is share of the CODE's total, and §05's is share of the
       SMALL-BUSINESS total. Two denominators one section apart is how a page
       ends up asking to be trusted about a number it never states. */
    var conc = (D.concentration || []).slice()
      .sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
    if (conc.length) {
      var tight = conc.slice().sort(function (a, b) {
        return (b.top5_pct || 0) - (a.top5_pct || 0);
      })[0];
      var sumTop5 = conc.reduce(function (n, c) { return n + (c.top5_val || 0); }, 0);
      var sumTotal = conc.reduce(function (n, c) { return n + (c.total || 0); }, 0);
      h += '<section class="o4-s"><h3><span>04</span> Who already wins here'
        + '<em>' + esc(conc[0].fy) + ' to date · the year is open</em></h3>'
        /* THE SECOND SENTENCE IS AN AGGREGATE ACROSS CODES, so it only exists
           when there is more than one code to aggregate. Scoped to a single
           code it would restate the first sentence with the same two figures
           and call it a different finding. */
        + '<p class="o4-p">In <b>' + esc(tight.naics) + '</b>, five firms hold <b>'
        + pc(tight.top5_pct) + '</b> of ' + curM(tight.total) + '.'
        + (conc.length > 1
          ? ' Across your ' + word(conc.length) + ' codes the top five take '
            + pc(sumTotal ? sumTop5 / sumTotal * 100 : null) + ' of ' + curM(sumTotal) + '.'
          : '')
        + '</p>'
        + '<table class="o4-t o4-rec o4-conc"><thead><tr><th>NAICS</th><th class="r">#</th>'
        + '<th>Recipient</th><th class="n">Obligated</th><th class="n">Share of code</th>'
        + '<th class="n">Code total</th></tr></thead><tbody>'
        + conc.map(function (c) {
          return (c.leaders || []).slice(0, 5).map(function (l, i) {
            return '<tr' + (i ? ' class="rep"' : '') + '>'
              + '<td class="o4-nc">' + (i ? '' : esc(c.naics)) + '</td>'
              + '<td class="o4-rk2">' + (i + 1) + '</td>'
              + '<td class="o4-in">' + esc(tc(l.name)) + '</td>'
              + '<td class="o4-vl">' + curM(l.val) + '</td>'
              + '<td class="o4-pc">' + pc(l.pct) + '</td>'
              + '<td class="o4-vl">' + (i ? '' : curM(c.total)) + '</td></tr>';
          }).join('');
        }).join('')
        + '</tbody></table>'
        + '<p class="o4-n">Share of code is each firm’s obligations against that code’s full '
        + esc(conc[0].fy) + ' total. ' + listedNote(conc)
        + ' A blank NAICS repeats the code above it.</p></section>';
    }

    /* §05 · THE SMALL-BUSINESS SHARE. §05 does NOT copy §04's column order: §04
       ranks five firms INSIDE one code, §05 narrows one code DOWN TO one firm.
       The spanning group keys name each figure's base before it is read, so a
       code-level share is never taken for the named firm's. */
    var win = (D.winners || []).slice()
      .sort(function (a, b) { return (b.sb_pct || 0) - (a.sb_pct || 0); });
    if (win.length) {
      h += '<section class="o4-s"><h3><span>05</span> What reaches small business'
        + '<em>' + esc(win[0].fy) + ' to date · the year is open</em></h3>'
        + '<p class="o4-p">Small business takes <b>' + pc(win[0].sb_pct) + '</b> of '
        + esc(win[0].naics)
        + (win.length > 1 ? ' and <b>' + pc(win[win.length - 1].sb_pct) + '</b> of '
          + esc(win[win.length - 1].naics) + '.' : '.')
        + '</p>'
        + '<table class="o4-t o4-rec o4-sb"><thead>'
        + '<tr class="o4-grp"><th></th><th colspan="3">The code</th>'
        + '<th colspan="3">Its largest small-business recipient</th></tr>'
        + '<tr><th>NAICS</th><th class="n">FY total</th>'
        + '<th class="n">To small business</th><th class="n">Share of code</th>'
        + '<th>Recipient</th><th class="n">Awarded</th>'
        + '<th class="n">Share of that</th></tr></thead><tbody>'
        + win.map(function (w) {
          var t = (w.winners || [])[0];
          return '<tr><td class="o4-nc">' + esc(w.naics) + '</td>'
            + '<td class="o4-vl">' + curM(w.code_total) + '</td>'
            + '<td class="o4-vl">' + curM(w.sb_total) + '</td>'
            + '<td class="o4-pc">' + pc(w.sb_pct) + '</td>'
            + '<td class="o4-in">' + (t ? esc(tc(t.name)) : 'None recorded') + '</td>'
            + '<td class="o4-vl">' + (t ? curM(t.val) : '—') + '</td>'
            + '<td class="o4-pc">' + (t ? pc(t.pct_of_sb) : '—') + '</td></tr>';
        }).join('')
        + '</tbody></table>'
        + '<p class="o4-n">Read a row left to right: the code’s full ' + esc(win[0].fy)
        + ' total, how much of it reached small business, and the largest single small-business '
        + 'award inside that slice. <b>Share of that</b> is the firm’s share of the '
        + 'small-business total only — never of the code. '
        + listedNote(win, 'small-business recipients') + '</p></section>';
    }

    return h;
  }

  /* ── MOUNT ───────────────────────────────────────────────────────────────
     THREE STATES, NOT TWO. Until the payload settles the document draws
     nothing; a read that could not complete says so in its own words; only a
     settled OK payload draws the record. Treating an unread payload as an empty
     one would state that no contract comes up for recompete on the strength of
     a fetch that never landed.

     The officer directory arrives on a separate fetch AFTER the first paint, so
     this re-runs when it lands: §02 and §03's contacts column are what change. */
  /* ── THE NAICS SCOPE ─────────────────────────────────────────────────────
     Through the shared window.BD_SCOPE, never a local variable: the scope has an
     address (URL, then localStorage), so a link means what it says and the next
     destination opens on the code this one was left on.

     reconcile() is what makes a scope a REQUEST rather than a fact. A URL naming
     a code this account does not track must not quietly render all of them — it
     returns the note, and the strip prints it. A substitution the reader is not
     told about is a page misstating its own subject. */
  function renderScope(tracked, fys) {
    var el = document.getElementById('wtcScope');
    if (!el) return { code: null, note: '' };
    var SC = window.BD_SCOPE;
    if (!SC || !tracked.length) { setHTML(el, ''); return { code: null, note: '' }; }

    var r = SC.reconcile(fys, tracked);
    var code = r.code;

    setHTML(el, '<span class="wsk">NAICS</span>'
      + '<button type="button" data-code="" aria-pressed="' + (code ? 'false' : 'true') + '">'
      + 'All ' + word(tracked.length) + '</button>'
      + tracked.map(function (c) {
        return '<button type="button" data-code="' + esc(c) + '" aria-pressed="'
          + (code === c ? 'true' : 'false') + '">' + esc(c) + '</button>';
      }).join('')
      + (r.note ? '<span class="wsn">' + esc(r.note) + '</span>' : ''));

    el.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        SC.set({ code: b.dataset.code || null });
        render();
      };
    });
    return { code: code, note: r.note };
  }

  /* ── FRESHNESS ───────────────────────────────────────────────────────────
     TWO CLOCKS, STATED SEPARATELY, BECAUSE THEY ANSWER DIFFERENT QUESTIONS.
     "Read" is how old the MEASUREMENT is — the nightly worker's `as_of`, and the
     only one that bears on whether a figure is current. "Checked" is when this
     browser last asked. They are printed as two sentences: a re-check confirms
     that the measurement is unchanged, so it moves the second clock and leaves
     the first where it is. A single "updated" stamp cannot express that.

     The relative age is recomputed on every paint from the timestamps rather
     than rendered once, so it cannot sit frozen while the clock moves. */
  function ago(ms) {
    if (ms == null) return null;
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    var m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (s < 60) return 'just now';
    if (m < 60) return m + ' min ago';
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  function paintFreshness() {
    var el = document.getElementById('wtcFresh');
    if (!el) return;
    var DSB = window.DSB || {};
    var f = DSB.FRESHNESS || { checkedAt: null, state: 'loading', reason: '' };
    var busy = !!(window.DSB_LIVE && window.DSB_LIVE.isRefreshing && window.DSB_LIVE.isRefreshing());

    var measured = DSB.as_of ? new Date(DSB.as_of).getTime() : null;
    if (measured != null && !isFinite(measured)) measured = null;

    var read = measured == null
      ? 'Measurement date not stated by the feed'
      : 'Read from USAspending ' + ago(measured);

    var checked = busy ? 'checking now…'
      : f.state === 'failed'
        /* The record on screen is still the last good read, and the sentence has
           to say that rather than implying the data is gone. */
        ? 'last check did not complete' + (f.checkedAt ? ' · last successful check '
          + ago(f.checkedAt) : '')
        : f.checkedAt ? 'checked ' + ago(f.checkedAt) : 'checking…';

    setHTML(el, '<span class="wf-t' + (f.state === 'failed' ? ' warn' : '') + '">'
      + esc(read) + ' · ' + esc(checked) + '</span>'
      + '<button type="button" id="wtcRefresh"' + (busy ? ' disabled' : '') + '>'
      + (busy ? 'Checking…' : 'Refresh') + '</button>'
      + (f.state === 'failed' && f.reason
        ? '<span class="wf-n">' + esc(f.reason)
          + ' The record below is the last one we read in full, not a partial or '
          + 'a guess.</span>'
        : ''));

    var btn = document.getElementById('wtcRefresh');
    if (btn) {
      btn.onclick = function () {
        if (!window.DSB_LIVE) return;
        window.DSB_LIVE.refresh();
        paintFreshness();
      };
    }
  }

  function render() {
    var host = document.getElementById(HOST);
    if (!host) return;
    paintFreshness();
    var DSB = window.DSB || {};
    var st = DSB.STATUS || { state: 'loading', reason: '' };

    if (st.state === 'loading') { setHTML(host, ''); return; }

    if (st.state !== 'ok') {
      setHTML(host,
        '<header class="o4-h"><div class="o4-hk">FARaudit · Recompete record</div>'
        + '<div class="o4-hd">Not connected</div></header>'
        + '<div class="o4-empty"><p class="o4-lede">This record could not be read.</p>'
        + '<p class="o4-p">' + esc(st.reason || 'Federal spending data could not be loaded.')
        + '</p><p class="o4-n">This is a statement about our read, not about your codes: it does '
        + 'not mean there is nothing coming up for recompete. It refreshes nightly.</p></div>');
      return;
    }

    var tracked = (DSB.coverage && DSB.coverage.tracked) || [];
    var scope = renderScope(tracked, Array.isArray(DSB.FYS) ? DSB.FYS : []);
    var code = scope.code;

    /* SCOPING FILTERS THE INPUT, IT DOES NOT HIDE THE OUTPUT. Every figure in
       the document — the headline, the cluster, the dollar total, the count
       block, the per-code ceiling sentence, both share tables — is computed from
       whatever build() is handed. Narrowing the arrays here therefore RECOMPUTES
       the record rather than re-rendering a filtered view of the wider one:
       six of twenty-one and one of ten are not the same story, and the page must
       tell the second one when that is what it is showing. */
    var byCode = function (x) { return !code || x.naics === code; };

    /* ONE FIELD AT A TIME. A payload key with no line here reaches the browser
       and stops, so a field added upstream and not copied leaves the section
       that needs it empty rather than half-built from a stale shape. */
    setHTML(host, build({
      rows: (Array.isArray(DSB.RECOMPETES) ? DSB.RECOMPETES : []).filter(byCode),
      offices: (DSB.OFFICERS && DSB.OFFICERS.offices) || {},
      officerState: (DSB.OFFICERS && DSB.OFFICERS.state) || 'loading',
      concentration: (Array.isArray(DSB.CONCENTRATION) ? DSB.CONCENTRATION : []).filter(byCode),
      winners: (Array.isArray(DSB.SB_WINNERS) ? DSB.SB_WINNERS : []).filter(byCode),
      coverage: DSB.coverage || null,
      as_of: DSB.as_of || null,
      code: code
    }));
  }

  window.WTC_APP = { render: render, paintFreshness: paintFreshness };
})();
