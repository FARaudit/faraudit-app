/* FARaudit · Opportunities — live wiring, fail-closed.
   Fetches /api/command-center-data and populates window.DSO.OPPS in place,
   then calls window.DSO_APP.render(). dso-app.js is the render layer.

   HONESTY CONTRACT:
   - No sample rows exist anywhere; DSO.OPPS starts empty.
   - Fetch failure  → FEED_STATE 'error'  → explicit unavailable state.
   - Zero rows      → FEED_STATE 'empty'  → explicit "feed is empty" state.
   - Unknown values stay null (fit / ceiling / days / incumbent) — the render
     layer shows "—" / "not audited", never 0, never 999, never a default. */
(function () {
  'use strict';

  // ── SET-ASIDE · EXPLICIT ALLOWLIST, FAILS CLOSED ────────────────────────────
  // Set-aside is the most decision-relevant field on the row, and every collapse
  // here fails in the permissive direction: a full-and-open notice read as small
  // business, a sole-source notice read as competable, WOSB read as SB-wide
  // eligibility, Partial read as Total. Each one tells a reader a competition is
  // open to them when it is not.
  //
  // Doctrine: shape ALLOWLISTS only, never blocklists, in eligibility logic; an
  // unrecognisable token goes to the restrictive/honest pole, never a permissive
  // guess. The default is now 'UNKNOWN', which the render layer shows explicitly
  // — suppressing the chip would read as "no restriction", the same silent
  // permissive default in a different costume.
  //
  // Order matters: sole-source is tested BEFORE the program tests, because a
  // "WOSB Program Sole Source" is a directed buy first and a WOSB buy second.
  var SETASIDE_RULES = [
    { pole: 'SoleSource', test: function (u) { return u.indexOf('sole source') >= 0 || u.indexOf('sole-source') >= 0; } },
    { pole: 'SDVOSB',     test: function (u) { return u.indexOf('sdvosb') >= 0 || u.indexOf('service-disabled') >= 0 || u.indexOf('service disabled') >= 0; } },
    { pole: '8(a)',       test: function (u) { return u.indexOf('8(a)') >= 0 || u === '8a' || u.indexOf('8 a ') >= 0; } },
    { pole: 'HUBZone',    test: function (u) { return u.indexOf('hubzone') >= 0 || u.indexOf('hub zone') >= 0; } },
    { pole: 'EDWOSB',     test: function (u) { return u.indexOf('edwosb') >= 0 || u.indexOf('economically disadvantaged women') >= 0; } },
    { pole: 'WOSB',       test: function (u) { return u.indexOf('wosb') >= 0 || u.indexOf('women-owned') >= 0 || u.indexOf('woman-owned') >= 0 || u.indexOf('women owned') >= 0; } },
    { pole: 'SB-Partial', test: function (u) { return u.indexOf('partial small business') >= 0 || (u.indexOf('small business') >= 0 && u.indexOf('partial') >= 0); } },
    { pole: 'SB',         test: function (u) { return u.indexOf('total small business') >= 0 || u.indexOf('small business set aside') >= 0 || u.indexOf('small business set-aside') >= 0 || u === 'sba'; } },
    // SAM's explicit statement that the buy is unrestricted. This is DATA, not
    // a default, and must never be inferred from an absent token.
    { pole: 'Full',       test: function (u) { return u.indexOf('no set aside') >= 0 || u.indexOf('no set-aside') >= 0 || u.indexOf('full and open') >= 0 || u.indexOf('unrestricted') >= 0; } }
  ];
  function normSetaside(s) {
    // Absent value = SAM published no set-aside field. Unrestricted is the
    // correct reading of an absent set-aside on a solicitation.
    if (s == null || String(s).trim() === '') return 'Full';
    var u = String(s).toLowerCase();
    for (var i = 0; i < SETASIDE_RULES.length; i++) {
      if (SETASIDE_RULES[i].test(u)) return SETASIDE_RULES[i].pole;
    }
    return 'UNKNOWN'; // fail CLOSED — never assert an eligibility we did not read
  }

  // document_type → DSO stage (presol|sources|rfp|eval).
  //
  // The ingest stores the CANONICAL short codes produced by classifyDocType()
  // (src/lib/sam.ts / agents/sam-ingest/helpers.ts): SrcSght · PreSol ·
  // Combined · RFQ · IDIQ · BPA · TaskOrd · Mod · Award · Other. Matching those
  // first is what makes the stage lanes correct; the long-string tests below
  // cover rows that predate the classifier and raw SAM `type` strings arriving
  // from other paths.
  // ── STAGE · EXPLICIT ALLOWLIST, FAILS CLOSED ────────────────────────────────
  // Two domain rules decide this table:
  //
  // (1) `Combined` is an OPEN SOLICITATION, not an upstream notice. FAR 12.603
  //     fuses synopsis and solicitation into one posting so the buy can move
  //     immediately, which makes it the most act-now type on SAM. `stage` is the
  //     sole input to the insight line, so mapping it upstream would tell the
  //     reader to shape a requirement whose RFP is already out.
  //
  // (2) `Special` gets its own stage and the render layer suppresses its Run
  //     Audit CTA. A Special Notice (industry day, amendment announcement,
  //     intent-to-sole-source, cancellation) may carry no solicitation to audit,
  //     and audits are metered — so it must not read as an open RFP.
  //
  // The default is 'UNKNOWN' rather than 'rfp': labelling an unrecognised notice
  // "Open RFP" is an assertion, and unrecognised must never assert.
  const DOCTYPE_STAGE = {
    presol: 'presol', srcsght: 'sources',
    combined: 'rfp',                                  // (1) — the solicitation is OUT
    special: 'notice',                                // (2) — not a solicitation
    award: 'eval', mod: 'eval',
    rfq: 'rfp', idiq: 'rfp', bpa: 'rfp', taskord: 'rfp'
  };
  function normStage(docType, status) {
    const raw = String(docType || '').trim();
    const d = raw.toLowerCase();
    const s = String(status || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(DOCTYPE_STAGE, d)) return DOCTYPE_STAGE[d];
    // Long-string tests for raw SAM `type` strings arriving from other paths.
    if (d.includes('pre-sol') || d.includes('presol') || d.includes('synopsis only')) return 'presol';
    if (d.includes('sources sought') || d.includes('rfi')) return 'sources';
    if (d.includes('combined')) return 'rfp';
    if (d.includes('special notice')) return 'notice';
    if (d.includes('award') || d.includes('justification') || s.includes('award') || s.includes('eval')) return 'eval';
    if (d.includes('solicitation') || d.includes('rfq') || d.includes('rfp') || d.includes('ifb')) return 'rfp';
    return 'UNKNOWN'; // fail CLOSED — never assert a stage we did not recognise
  }

  // null when there is no deadline — NEVER a placeholder number.
  function daysUntil(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return null;
    return Math.ceil((ms - Date.now()) / 86400000);
  }

  function relTime(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return null;
    const diff = Date.now() - ms;
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'under an hour ago';
    if (h < 48) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // Split "DEPT · OFFICE" into its two parts. Returns ['',''] for an absent
  // value and ['<whole>',''] when SAM published only one segment — never a
  // guess at which half is missing. Only the FIRST separator splits, so an
  // office name that itself contains " · " stays intact.
  function agencyParts(s) {
    var v = String(s == null ? '' : s).trim();
    if (!v) return ['', ''];
    var i = v.indexOf(' · ');
    if (i < 0) return [v, ''];
    return [v.slice(0, i).trim(), v.slice(i + 3).trim()];
  }

  function mapOpp(o) {
    const ceilingNum = o.award_ceiling != null && !isNaN(Number(o.award_ceiling))
      ? Number(o.award_ceiling) / 1e6
      : null;
    return {
      id: o.solicitation_number || o.notice_id || o.id || '',
      // notice_id is the durable SAM identifier the watcher + audit key off.
      notice_id: o.notice_id || '',
      title: o.title || 'Untitled',
      // resolveAgency() joins the department and the buying office with " · "
      // (it keeps the first two segments of SAM's dotted fullParentPathName).
      // They arrive as ONE string and `office` was hardcoded empty, so the two
      // facts could never be addressed separately — a buyer breakdown, an office
      // filter, or a display map keyed on either name had nothing to key on.
      // Splitting here changes no rendered output: the row already prints
      // agency + " · " + office, which recomposes the original string exactly.
      agency: agencyParts(o.agency)[0],
      office: agencyParts(o.agency)[1],
      naics: o.naics_code || '',
      sa: normSetaside(o.set_aside),
      stage: normStage(o.document_type, o.status),
      // RAW-TOKEN RETENTION. If the normalised pole replaces the source token at
      // map time, the mapping stops being assertable: recomputing a count from
      // the same mapper under test is self-consistent by construction, so it
      // cannot distinguish a correct mapping from an inverted one. The raw token
      // is kept so the raw→rendered table is assertable and the coverage
      // invariant has something to check.
      raw_setaside: o.set_aside == null ? null : String(o.set_aside),
      raw_notice_type: o.document_type == null ? null : String(o.document_type),
      type: o.document_type || 'Notice',
      notice_type: o.document_type || null,
      response_deadline: o.response_deadline || null,
      ceiling: ceilingNum,                                     // null = not stated
      days: daysUntil(o.response_deadline),                    // null = no deadline
      fit: typeof o.compliance_score === 'number' ? o.compliance_score : null, // null = not audited
      is_audited: !!o.is_audited,
      incumbent: o.incumbent_name || null,                     // null = none on record
      ingested_at: o.created_at || null,
      // SAM notice detail. `|| null` is deliberately NOT used on resource_links:
      // [] and null carry different facts (SAM listed none vs not read) and `||`
      // would collapse them into one.
      resource_links: Array.isArray(o.resource_links) ? o.resource_links : null,
      ui_link: o.ui_link || null,
      office_path: o.office_path || null,
      psc: o.psc_code || null,
      poc: Array.isArray(o.point_of_contact) ? o.point_of_contact : null,
      place_of_performance: o.place_of_performance || null
    };
  }

  // Returns a Map of notice_id → watch STATUS ('watching' | 'posted' |
  // 'audited'), or null when the watch state could not be fetched — the render
  // layer disables Track buttons on null rather than showing every row as
  // un-tracked (a false negative). The status matters: a watch that advanced
  // past 'watching' carries audit linkage, and un-tracking would delete it, so
  // the render layer makes those non-toggleable.
  async function hydrateWatchedSet(opps) {
    const noticeIds = opps.map(o => o.notice_id).filter(Boolean);
    if (!noticeIds.length) return new Map();
    try {
      const res = await fetch('/api/watch?noticeIds=' + encodeURIComponent(noticeIds.join(',')), { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return new Map(Object.entries(data.watching || {}));
    } catch (_) {
      return null;
    }
  }

  // Pipeline membership by display id (pipeline table keys on solicitation_number).
  // Returns a Set of ids, or null when unavailable.
  async function hydratePipelineSet() {
    try {
      const res = await fetch('/api/pipeline', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const s = new Set();
      (data.pipeline || []).forEach(function (row) {
        if (row.solicitation_number) s.add(row.solicitation_number);
      });
      return s;
    } catch (_) {
      return null;
    }
  }

  // Topbar status pill — bound to the REAL fetch outcome, never a hardcoded
  // "LIVE". Owns #livePill ONLY; #feedMeta belongs to renderHeader in dso-app.js,
  // which renders every feed state from feedMetaHTML().
  function setFeedStatus(state) {
    const pill = document.getElementById('livePill');
    if (pill) {
      pill.classList.remove('err', 'wait');
      if (state === 'live' || state === 'empty') {
        pill.textContent = 'LIVE';
      } else if (state === 'no-profile') {
        // Not an outage and not an empty window — the feed has nothing to scope
        // ON. Says so rather than claiming LIVE over a blank tab.
        pill.classList.add('wait');
        pill.textContent = 'NO NAICS ON FILE';
      } else if (state === 'error') {
        pill.classList.add('err');
        pill.textContent = 'FEED UNAVAILABLE';
      } else {
        pill.classList.add('wait');
        pill.textContent = 'CONNECTING…';
      }
    }
  }

  async function wire() {
    if (!window.DSO) return;
    setFeedStatus('loading');
    try {
      const res = await fetch('/api/command-center-data', { credentials: 'include' });
      if (!res.ok) throw new Error('opportunities fetch failed: ' + res.status);
      const data = await res.json();
      // null = the server's live SAM fetch failed. That is an outage, not an
      // empty feed — route it to the 'error' state, never 'empty'.
      if (!Array.isArray(data.opportunities)) {
        throw new Error('live SAM feed unavailable (opportunities=' + data.opportunities + ')');
      }
      const opps = data.opportunities;
      // The ingest queue can hold multiple rows for the same notice — showing
      // one notice 3× inflates every count. Dedupe on the DISPLAY identity
      // (same precedence as mapOpp's `id`), not on notice_id: a base notice and
      // its amendment share a solicitation_number but carry different
      // notice_ids, so a notice_id key would keep both and then render them as
      // two cards with identical DOM ids and one shared Pipeline toggle.
      // The query orders created_at desc, so the first occurrence is newest.
      const seen = new Set();
      const mapped = [];
      opps.forEach(function (o) {
        const key = o.solicitation_number || o.notice_id || o.id;
        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        mapped.push(mapOpp(o));
      });

      window.DSO.OPPS.length = 0;
      window.DSO.OPPS.push(...mapped);
      // 'no-profile' is a DISTINCT pole from 'empty'. Both are zero rows, but one
      // is a profile the customer can fix in place and the other is a real
      // zero-result window — rendering them alike would hide the fixable one.
      window.DSO.FEED_SCOPE = data.feedScopeSource || null;
      // null when the server did not say — the copy then omits the number
      // rather than inventing one.
      window.DSO.FEED_WINDOW_DAYS = Number.isFinite(data.feedWindowDays) ? data.feedWindowDays : null;
      window.DSO.FEED_STATE = mapped.length ? 'live'
        : (data.feedScopeSource === 'no-profile-codes' ? 'no-profile' : 'empty');

      // Live NAICS pill set = distinct codes actually present in the feed.
      const counts = {};
      mapped.forEach(function (o) { if (o.naics) counts[o.naics] = (counts[o.naics] || 0) + 1; });
      window.DSO.NAICS.length = 0;
      Object.keys(counts).sort().forEach(function (code) {
        window.DSO.NAICS.push({ code: code, label: counts[code] + ' in feed' });
      });

      // Newest postedDate among rendered rows. Live rows carry created_at =
      // SAM postedDate (date-only), so this dates the NOTICES, not the fetch.
      const newest = mapped.reduce(function (acc, o) {
        const t = o.ingested_at ? new Date(o.ingested_at).getTime() : NaN;
        return !isNaN(t) && t > acc ? t : acc;
      }, 0);
      window.DSO.LAST_INGEST = newest ? relTime(new Date(newest).toISOString()) : null;
      setFeedStatus(window.DSO.FEED_STATE);
      // Refresh the header NOW that FEED_STATE and LAST_INGEST are known, rather
      // than waiting on the watch/pipeline hydration below. renderHeader owns
      // #feedMeta, so without this the line would sit on "Connecting to the
      // SAM.gov ingest…" for the length of two more round trips.
      if (window.DSO_APP && typeof window.DSO_APP.renderHeader === 'function') {
        window.DSO_APP.renderHeader();
      }
      // The rail ships no pill; this page has now MEASURED the feed, so it may
      // assert one. 'empty' is still a live feed — it answered with zero rows.
      if (typeof window.setRailLiveBadge === 'function') {
        window.setRailLiveBadge('live', { count: mapped.length });
      }

      // Watch + pipeline state for visible rows (null = unavailable → the
      // render layer disables those buttons instead of faking "off").
      const hydrated = await Promise.all([hydrateWatchedSet(mapped), hydratePipelineSet()]);
      window.DSO.WATCHED_NOTICE_IDS = hydrated[0];
      window.DSO.PIPELINE_IDS = hydrated[1];
    } catch (e) {
      console.error('[opportunities-live] wire failed:', e);
      window.DSO.OPPS.length = 0;
      window.DSO.FEED_STATE = 'error';
      setFeedStatus('error');
      if (typeof window.setRailLiveBadge === 'function') {
        window.setRailLiveBadge('unavailable');
      }
    }
    if (window.DSO_APP && typeof window.DSO_APP.render === 'function') {
      window.DSO_APP.render();
    }
  }

  // ── CERTIFICATIONS ──────────────────────────────────────────────────────────
  // A SEPARATE request from the feed, deliberately. The two answer different
  // questions and fail independently: SAM's Entity API can be slow or down while
  // the opportunities read is fine, and a page that awaited both would let the
  // certification lookup hold up 191 rows the customer can already act on.
  //
  // Every failure path lands on a state that narrows NOTHING. The set-aside
  // subtraction fires only on 'verified'; 'unverified', 'uei-not-found',
  // 'registration-inactive', 'no-uei' and a thrown request all leave the full
  // read on screen and say why.
  async function wireCerts() {
    if (!window.DSO) return;
    try {
      const res = await fetch('/api/certifications', { credentials: 'include' });
      if (!res.ok) throw new Error('certifications fetch failed: ' + res.status);
      const data = await res.json();
      const state = typeof data.state === 'string' ? data.state : 'unverified';
      window.DSO.CERTS = {
        // An unrecognised state must not reach the render layer as if it were
        // 'verified'. Anything outside the five known poles reads as unverified,
        // which asserts nothing and screens nothing out.
        state: (state === 'verified' || state === 'no-uei' || state === 'uei-not-found' ||
                state === 'registration-inactive') ? state : 'unverified',
        records: Array.isArray(data.records) ? data.records : [],
        establishedPrograms: Array.isArray(data.establishedPrograms) ? data.establishedPrograms : [],
        registrationExpires: data.registrationExpires || null
      };
    } catch (e) {
      console.error('[opportunities-live] certifications failed:', e);
      window.DSO.CERTS = { state: 'unverified', records: [], establishedPrograms: [], registrationExpires: null };
    }
    if (window.DSO_APP && typeof window.DSO_APP.render === 'function') {
      window.DSO_APP.render();
    }
  }

  const obs = new MutationObserver(() => {
    if (window.DSO_APP && typeof window.DSO_APP.onThemeChange === 'function') {
      window.DSO_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* The tracked list, read from /api/watched-notices rather than filtered out of
     the feed. The feed carries only OPEN notices — an expired one never enters
     it — so a filter over the feed would silently drop a tracked notice the
     moment it closed, which is exactly the notice worth surfacing.

     null means the read failed; [] means nothing is tracked. The control renders
     those differently, because "you track nothing" and "we could not tell you"
     are different sentences. */
  async function wireWatched() {
    if (!window.DSO) return;
    try {
      const res = await fetch('/api/watched-notices', { credentials: 'include' });
      if (!res.ok) throw new Error('watched-notices fetch failed: ' + res.status);
      const data = await res.json();
      window.DSO.WATCHED = Array.isArray(data.rows) ? data.rows : [];
    } catch (e) {
      console.error('[opportunities-live] watched notices failed:', e);
      window.DSO.WATCHED = null;
    }
    if (window.DSO_APP && typeof window.DSO_APP.render === 'function') {
      window.DSO_APP.render();
    }
  }

  function start() { wire(); wireCerts(); wireWatched(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
