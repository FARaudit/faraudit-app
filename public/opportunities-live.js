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
  // Until 2026-07-29 this ended in a bare `return 'SB'`, so any token it didn't
  // recognise was ASSERTED as a small-business set-aside. Measured on 200 live
  // rows: SAM's literal "No Set aside used" (= full and open) matched none of the
  // tests and fell through, so **83 rows (42%) told a small business that an
  // unrestricted competition was reserved for them** — the single most
  // decision-relevant field on the row, inverted in the permissive direction.
  // A WOSB *sole-source* notice landed on 'SB' too, rendering a directed buy as
  // competable. Two more collapses: WOSB → SB (WOSB is not SB-wide eligibility)
  // and Partial → Total (different subcontracting posture).
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

  function mapOpp(o) {
    const ceilingNum = o.award_ceiling != null && !isNaN(Number(o.award_ceiling))
      ? Number(o.award_ceiling) / 1e6
      : null;
    return {
      id: o.solicitation_number || o.notice_id || o.id || '',
      // notice_id is the durable SAM identifier the watcher + audit key off.
      notice_id: o.notice_id || '',
      title: o.title || 'Untitled',
      agency: o.agency || '',
      office: '',
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
      ingested_at: o.created_at || null
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

  // Topbar status pill + header feed-meta line — bound to the REAL fetch
  // outcome, never a hardcoded "LIVE".
  function setFeedStatus(state, opts) {
    const pill = document.getElementById('livePill');
    const meta = document.getElementById('feedMeta');
    if (pill) {
      pill.classList.remove('err', 'wait');
      if (state === 'live' || state === 'empty') {
        pill.textContent = 'LIVE';
      } else if (state === 'error') {
        pill.classList.add('err');
        pill.textContent = 'FEED UNAVAILABLE';
      } else {
        pill.classList.add('wait');
        pill.textContent = 'CONNECTING…';
      }
    }
    if (meta) {
      if (state === 'live') {
        // LAST_INGEST is the newest row's SAM postedDate — a fact about the
        // NOTICES, not about our fetch. Label it as such: the live feed itself
        // is at most 30 minutes old (fetchLiveOpportunities' cache window), so
        // "refreshed 22h ago" would understate freshness by a day.
        const ingest = opts && opts.lastIngest ? ' · newest posted ' + opts.lastIngest : '';
        meta.innerHTML = 'Live solicitations read from <b>SAM.gov</b> · ' +
          opts.count + ' notice' + (opts.count === 1 ? '' : 's') + ingest;
      } else if (state === 'empty') {
        meta.innerHTML = 'Connected to the <b>live SAM.gov feed</b> — no notices in the current window.';
      } else if (state === 'error') {
        meta.textContent = 'SAM.gov feed unavailable — nothing shown below is sample data.';
      } else {
        meta.textContent = 'Connecting to the SAM.gov ingest…';
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
      window.DSO.FEED_STATE = mapped.length ? 'live' : 'empty';

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
      setFeedStatus(window.DSO.FEED_STATE, { count: mapped.length, lastIngest: window.DSO.LAST_INGEST });
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

  const obs = new MutationObserver(() => {
    if (window.DSO_APP && typeof window.DSO_APP.onThemeChange === 'function') {
      window.DSO_APP.onThemeChange();
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
