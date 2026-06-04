/* FARaudit · Defense Opportunities — Fork B live wiring.
   Fetches /api/command-center-data, maps data.opportunities → window.DSO.OPPS
   in place, then calls window.DSO_APP.render(). dso-app.js is the render
   layer; this file only swaps data. */
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

  // SAM document_type → DSO stage (presol|sources|rfp|eval).
  function normStage(docType, status) {
    const d = String(docType || '').toLowerCase();
    const s = String(status || '').toLowerCase();
    if (d.includes('pre-sol') || d.includes('presol') || d.includes('synopsis only')) return 'presol';
    if (d.includes('sources sought') || d.includes('rfi') || d.includes('combined')) return 'sources';
    if (d.includes('award') || d.includes('justification') || s.includes('award') || s.includes('eval')) return 'eval';
    return 'rfp'; // RFP/RFQ/IFB/Solicitation default
  }

  function daysUntil(iso) {
    if (!iso) return 999;
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return 999;
    return Math.ceil((ms - Date.now()) / 86400000);
  }

  function postedAgo(iso) {
    if (!iso) return '';
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return '';
    const diff = Date.now() - ms;
    const d = Math.floor(diff / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return '1d ago';
    if (d < 30) return d + 'd ago';
    const mo = Math.floor(d / 30);
    return mo + 'mo ago';
  }

  function mapOpp(o) {
    return {
      id: o.solicitation_number || o.notice_id || o.id || '',
      // notice_id is the durable SAM identifier the watcher keys off. Kept
      // alongside the display `id` so the Track button can target it
      // regardless of whether the display fell back to solicitation_number.
      notice_id: o.notice_id || '',
      title: o.title || 'Untitled',
      agency: o.agency || '',
      office: '',
      naics: o.naics_code || '',
      sa: normSetaside(o.set_aside),
      stage: normStage(o.document_type, o.status),
      type: o.document_type || 'RFP',
      notice_type: o.document_type || null,
      response_deadline: o.response_deadline || null,
      ceiling: o.award_ceiling ? Number(o.award_ceiling) / 1e6 : 0,
      days: daysUntil(o.response_deadline),
      fit: typeof o.compliance_score === 'number' ? o.compliance_score : 0,
      incumbent: o.incumbent_name || 'New requirement',
      posted: postedAgo(o.created_at)
    };
  }

  async function hydrateWatchedSet(opps) {
    const noticeIds = opps.map(o => o.notice_id).filter(Boolean);
    if (!noticeIds.length) return new Set();
    try {
      const res = await fetch('/api/watch?noticeIds=' + encodeURIComponent(noticeIds.join(',')), { credentials: 'include' });
      if (!res.ok) return new Set();
      const data = await res.json();
      return new Set(Object.keys(data.watching || {}));
    } catch (_) {
      return new Set();
    }
  }

  async function wire() {
    try {
      const res = await fetch('/api/command-center-data', { credentials: 'include' });
      if (!res.ok) throw new Error('opportunities fetch failed: ' + res.status);
      const data = await res.json();
      if (!window.DSO) return;
      const opps = Array.isArray(data.opportunities) ? data.opportunities : [];
      if (!opps.length) return; // empty state — keep design's empty render path

      const mapped = opps.map(mapOpp);
      window.DSO.OPPS.length = 0;
      window.DSO.OPPS.push(...mapped);

      // Hydrate the watcher state for visible rows — populated as a Set on
      // window so dso-app.js's renderList can read it without re-fetching.
      window.DSO.WATCHED_NOTICE_IDS = await hydrateWatchedSet(mapped);

      if (window.DSO_APP && typeof window.DSO_APP.render === 'function') {
        window.DSO_APP.render();
      }
    } catch (e) {
      console.error('[opportunities-live] wire failed:', e);
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
