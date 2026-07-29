/* FARaudit · Opportunities — live wiring, fail-closed.
   Fetches /api/command-center-data and populates window.DSO.OPPS in place,
   then calls window.DSO_APP.render(). dso-app.js is the render layer.

   Contract:
   - No sample rows exist anywhere; DSO.OPPS starts empty.
   - Fetch failure  → FEED_STATE 'error'  → explicit unavailable state.
   - Zero rows      → FEED_STATE 'empty'  → explicit "feed is empty" state.
   - Unknown values stay null (fit / ceiling / days / incumbent) — the render
     layer shows "—" / "not audited", never a placeholder number. */
(function () {
  'use strict';

  // SAM set-aside string → DSO sa key. Empty/full-and-open → "Full".
  function normSetaside(s) {
    if (!s) return 'Full';
    const u = String(s).toLowerCase();
    if (u.includes('sdvosb') || u.includes('service-disabled')) return 'SDVOSB';
    if (u.includes('8(a)') || u === '8a' || u.includes('8 a')) return '8(a)';
    if (u.includes('hubzone') || u.includes('hub zone')) return 'HUBZone';
    if (u.includes('wosb') || u.includes('woman')) return 'SB';
    if (u.includes('small business') || u.includes('total small') || u === 'sba') return 'SB';
    if (u.includes('full') || u.includes('open') || u.includes('unrestricted')) return 'Full';
    return 'SB';
  }

  // document_type → DSO stage (presol|sources|rfp|eval).
  //
  // The ingest stores the CANONICAL short codes produced by classifyDocType()
  // (src/lib/sam.ts / agents/sam-ingest/helpers.ts): SrcSght · PreSol ·
  // Combined · RFQ · IDIQ · BPA · TaskOrd · Mod · Award · Other. Matching those
  // first is what makes the stage lanes correct; the long-string tests below
  // remain only for rows written before the classifier landed (and for raw SAM
  // `type` strings arriving from other paths).
  const DOCTYPE_STAGE = {
    presol: 'presol', srcsght: 'sources', combined: 'sources',
    award: 'eval', mod: 'eval',
    rfq: 'rfp', idiq: 'rfp', bpa: 'rfp', taskord: 'rfp'
  };
  function normStage(docType, status) {
    const raw = String(docType || '').trim();
    const d = raw.toLowerCase();
    const s = String(status || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(DOCTYPE_STAGE, d)) return DOCTYPE_STAGE[d];
    if (d.includes('pre-sol') || d.includes('presol') || d.includes('synopsis only')) return 'presol';
    if (d.includes('sources sought') || d.includes('rfi') || d.includes('combined')) return 'sources';
    if (d.includes('award') || d.includes('justification') || s.includes('award') || s.includes('eval')) return 'eval';
    return 'rfp'; // RFP/RFQ/IFB/Solicitation default
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
      type: o.document_type || 'Notice',
      notice_type: o.document_type || null,
      response_deadline: o.response_deadline || null,
      ceiling: ceilingNum,                                     // null = not stated
      days: daysUntil(o.response_deadline),                    // null = no deadline
      fit: typeof o.compliance_score === 'number' ? o.compliance_score : null, // null = not audited
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
        const ingest = opts && opts.lastIngest ? ' · last ingest ' + opts.lastIngest : '';
        meta.innerHTML = 'Live solicitations from the <b>SAM.gov daily ingest</b> · ' +
          opts.count + ' notice' + (opts.count === 1 ? '' : 's') + ingest;
      } else if (state === 'empty') {
        meta.innerHTML = 'Connected to the <b>SAM.gov daily ingest</b> — no notices in the current window.';
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
    // Pipeline membership does not depend on the feed — start it now instead of
    // serializing it behind the feed fetch. (hydratePipelineSet never rejects;
    // it resolves null on failure.)
    const pipelineP = hydratePipelineSet();
    try {
      const res = await fetch('/api/command-center-data', { credentials: 'include' });
      if (!res.ok) throw new Error('opportunities fetch failed: ' + res.status);
      const data = await res.json();
      const opps = Array.isArray(data.opportunities) ? data.opportunities : [];
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

      // Newest ingest write among rendered rows = honest "last ingest" time.
      const newest = mapped.reduce(function (acc, o) {
        const t = o.ingested_at ? new Date(o.ingested_at).getTime() : NaN;
        return !isNaN(t) && t > acc ? t : acc;
      }, 0);
      setFeedStatus(window.DSO.FEED_STATE, {
        count: mapped.length,
        lastIngest: newest ? relTime(new Date(newest).toISOString()) : null
      });

      // PAINT NOW. Watch/pipeline state only affects two buttons per row, and
      // the render layer already draws those disabled while state is null — so
      // holding the whole page behind two more round-trips (a stalled endpoint
      // meant seconds of "Connecting…" with the data already in memory) buys
      // nothing.
      if (window.DSO_APP && typeof window.DSO_APP.render === 'function') {
        window.DSO_APP.render();
      }

      // Then hydrate the button state and refresh just the list.
      const hydrated = await Promise.all([hydrateWatchedSet(mapped), pipelineP]);
      window.DSO.WATCHED_NOTICE_IDS = hydrated[0];
      window.DSO.PIPELINE_IDS = hydrated[1];
      if (window.DSO_APP && typeof window.DSO_APP.renderList === 'function') {
        window.DSO_APP.renderList();
      }
      return;
    } catch (e) {
      console.error('[opportunities-live] wire failed:', e);
      window.DSO.OPPS.length = 0;
      window.DSO.FEED_STATE = 'error';
      setFeedStatus('error');
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
