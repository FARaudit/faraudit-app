(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════
  // Past Audits / Dashboard live wiring — NON-INVASIVE MODE.
  //
  // Principle: dashboard-design.html is the source of truth for STRUCTURE.
  // This script only updates DATA VALUES inside existing elements. Never
  // cloneNode, never replace structural wrappers, never change class names
  // on layout elements.
  //
  // What we update:
  //   - #ledgerBody innerHTML (the design's inline JS does this too, same pattern)
  //   - .kpi-val × 4 (textContent / innerHTML where the design itself uses inner HTML)
  //   - .dist-bar segment widths (inline style.width only)
  //   - .dist-legend .dl b textContent
  //   - .fbtn .n textContent
  //   - .page-header .sub innerHTML (it already contains <b>N records</b>)
  //   - #visCount textContent
  //   - #filters click handler (additive — runs AFTER inline handler;
  //     re-renders our live data on top of inline's static render)
  //   - th.sortable click handler (additive — same pattern)
  //   - .search input swap-on-click
  //   - tr click → /audit/{sol}
  // ═══════════════════════════════════════════════════════

  var STATE = {
    rows: [],
    filter: "all",
    // Card 366 Phase-2 filter bar — AND'd across the chip + search. Card #450
    // wired NAICS + set-aside now that fetchRecentAudits returns both columns.
    f: { time: "all", agency: "all", type: "all", rec: "all", status: "all", naics: "all", setAside: "all" },
    // Default order: most recently audited first (CEO ruling 2026-07-28).
    // 'audited' sorts on age-hours; dir 1 = ascending age = newest first.
    sortKey: "audited",
    sortDir: 1,
    search: "",
    loadError: null
  };

  // ── Helpers ──
  function relativeAgo(iso) {
    if (!iso) return { label: "—", ageHours: Infinity };
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return { label: "—", ageHours: Infinity };
    var diffMs = Date.now() - ms;
    var ageHours = diffMs / 3600000;
    if (diffMs < 60 * 1000)                return { label: "just now",                                          ageHours: ageHours };
    if (diffMs < 60 * 60 * 1000)           return { label: Math.max(1, Math.round(diffMs / 60000)) + "m ago",   ageHours: ageHours };
    if (diffMs < 24 * 60 * 60 * 1000)      return { label: Math.round(diffMs / (60 * 60 * 1000)) + "h ago",     ageHours: ageHours };
    if (diffMs < 48 * 60 * 60 * 1000)      return { label: "Yesterday",                                         ageHours: ageHours };
    if (diffMs < 7 * 24 * 60 * 60 * 1000)  return { label: Math.round(diffMs / (24 * 60 * 60 * 1000)) + "d ago",ageHours: ageHours };
    if (diffMs < 30 * 24 * 60 * 60 * 1000) return { label: Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + "w ago", ageHours: ageHours };
    return { label: Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)) + "mo ago", ageHours: ageHours };
  }

  // Card 366 Phase-1 — agency column. office_display is the buying-office code
  // (FA4427 60 CONS LGC), NOT the agency; the real agency is the last '·'
  // segment of the raw `agency` field. Normalize the common branches; else
  // Title-Case the cleaned segment.
  // Resolve any raw agency org-chain (dot- or middot-separated, e.g.
  // "Defense.Dept Of The Army.Amc.Acc.…419th Csb.W6qm Micc Fdo Ft Bragg") to a clean
  // 1-2 word agency — the RECOGNIZABLE agency, never the buying office / DoDAAC code.
  // Feeds both the Agency column cell AND the fAgency slicer (both read r.agency, so they match).
  function normalizeAgency(raw) {
    if (!raw) return "—";
    var s = String(raw);
    var u = s.toUpperCase();
    if (/\bSPACE FORCE\b/.test(u)) return "Space Force";
    if (/\bAIR FORCE\b/.test(u)) return "Air Force";
    if (/\bMARINE\b/.test(u)) return "Marine Corps";
    if (/\bNAV(Y|AL)\b/.test(u)) return "Navy";
    if (/\bARMY\b/.test(u)) return "Army";
    if (/GEOSPATIAL|\bNGA\b/.test(u)) return "NGA";
    if (/VETERANS|\bVA\b/.test(u)) return "VA";
    if (/FEDERAL AVIATION|\bFAA\b/.test(u)) return "FAA";
    if (/CUSTOMS AND BORDER|\bCBP\b|HOMELAND SECURITY/.test(u)) return "Homeland Security";
    if (/FOREST SERVICE/.test(u)) return "Forest Service";
    if (/AGRICULTURE/.test(u)) return "Agriculture";
    if (/ARCHITECT OF THE CAPITOL/.test(u)) return "Architect of the Capitol";
    if (/GENERAL SERVICES|\bGSA\b/.test(u)) return "GSA";
    if (/^DEFENSE[.·]/.test(u) || /\bDEFENSE\b/.test(u.split(/[.·]/)[0])) return "Defense";
    // Fallback: parent dept = first segment; strip DEPARTMENT/DEPT OF + trailing office/DoDAAC codes; Title-Case.
    var parent = s.split(/[.·]/)[0].trim();
    parent = parent.replace(/,?\s*DEPARTMENT OF\s*$/i, "").replace(/^DEPARTMENT OF\s+/i, "").replace(/^DEPT OF\s+/i, "").trim();
    parent = parent.replace(/\s*\b[A-Z0-9]{5,7}\b\s*$/, "").trim();
    var MAP = { "THE AIR FORCE": "Air Force", "THE ARMY": "Army", "THE NAVY": "Navy" };
    if (MAP[parent.toUpperCase()]) return MAP[parent.toUpperCase()];
    return parent.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || "—";
  }

  // Card 366 Phase-1 — due (response_deadline) column, short readable date.
  function dueLabel(iso) {
    if (!iso) return "—";
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return "—";
    var d = new Date(ms);
    var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return MO[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  // SIX-POLE VOCABULARY (ARC #747) — v3_verdict is the AUTHORITATIVE pole, read
  // FIRST; the legacy enums are consulted only for rows that predate it. Nothing
  // falls back to a sibling pole, and a score is not a verdict — the retired
  // score-band guess asserted decisions the engine never issued on every
  // INCOMPLETE / NEEDS_HUMAN_REVIEW row that carried a number.
  var POLE_REC = {
    BID: "Bid", BID_WITH_CAUTION: "Bid · caution", NO_BID: "No-bid", INELIGIBLE: "Ineligible",
    NEEDS_HUMAN_REVIEW: "Needs review", INCOMPLETE: "Incomplete", OUT_OF_SCOPE: "Out of scope"
  };
  function recommendationBucket(audit) {
    if ((audit.status || "").toLowerCase() !== "complete") return null;
    var pole = String(audit.v3_verdict || "").toUpperCase().replace(/[\s-]+/g, "_");
    if (POLE_REC[pole]) return POLE_REC[pole];
    if (pole) return "Unresolved"; // a pole we do not recognise — say so, never borrow a neighbour's word
    // Legacy rows only (no v3 pole recorded): these enums ARE engine-computed
    // for their era, so mapping them is faithful; guessing past them is not.
    var stored = (audit.recommendation || "").toUpperCase();
    if (stored === "PROCEED") return "Bid";
    if (stored === "PROCEED_WITH_CAUTION") return "Bid · caution";
    if (stored === "DECLINE") return "No-bid";
    var ev = String(audit.exec_verdict || "").toUpperCase().replace(/[\s_]+/g, "-");
    if (ev === "NO-BID" || ev === "NOBID") return "No-bid";
    if (ev === "CAUTION") return "Bid · caution";
    if (ev === "PROCEED" || ev === "GO" || ev === "BID") return "Bid";
    return null; // absent, not guessed — renders as an em dash
  }

  function statusBucket(audit) {
    var s = (audit.status || "").toLowerCase();
    if (s === "complete") return "complete";
    if (s === "failed" || s === "error") return "failed";
    return "pending";
  }

  function mapAuditToRow(audit) {
    var ago = relativeAgo(audit.completed_at || audit.created_at);
    var dueTs = audit.response_deadline ? new Date(audit.response_deadline).getTime() : Infinity;
    var st = statusBucket(audit);
    // Card 366 Phase-2 needs-attention (LOGIC ONLY — visual is Design's): a failed
    // audit OR a live audit whose response deadline has already passed.
    // WIRE-MAP #456 Ruling 2 — expose the trigger so the row picks the reason:
    // failed → red status badge is the reason; deadline → keep truthful badge + amber tag.
    var deadlinePassed = (dueTs !== Infinity && dueTs < Date.now());
    var attn = (st === "failed") || deadlinePassed;
    var attnType = (st === "failed") ? "failed" : (deadlinePassed ? "deadline" : null);
    return {
      // uuid is the row's OWN audit — row navigation uses it so a clicked row
      // opens that report, not the newest audit sharing its solicitation number.
      uuid:   String(audit.id || ""),
      id:     audit.solicitation_number || audit.notice_id || audit.id || "—",
      title:  (audit.title || "Untitled").trim(),
      agency: normalizeAgency(audit.agency),
      naics:  audit.naics_code || "—",
      setAside: audit.set_aside || "—",
      // Audited column shows the real date (CEO ruling 2026-07-28) — the
      // relative "1w ago" label is gone; age survives only for the time filter.
      date:   dueLabel(audit.completed_at || audit.created_at),
      age:    ago.ageHours,
      type:   audit.document_type || "—",
      due:    dueLabel(audit.response_deadline),
      dueTs:  dueTs,
      rec:    recommendationBucket(audit),
      status: st,
      attn:   attn,
      attnType: attnType
    };
  }

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Build the EXACT row markup the design's inline render() uses (verbatim copy).
  function buildRowHTML(a) {
    // Six poles → the three existing tone classes. Committal decisions keep their
    // register; non-committal poles (needs review / incomplete / unresolved) take
    // NEITHER green nor red — painting them would assert a decision the engine
    // did not issue.
    var recClassStr = "none";
    if (a.rec === "Bid") recClassStr = "proceed";
    else if (a.rec === "Bid · caution") recClassStr = "caution";
    else if (a.rec === "No-bid" || a.rec === "Ineligible") recClassStr = "decline";
    var recCell = a.rec
      ? '<span class="rec ' + recClassStr + '">' + esc(a.rec) + '</span>'
      : '<span class="rec none">—</span>';
    var slug = encodeURIComponent(a.uuid || a.id);
    // WIRE-MAP #456 Ruling 2 — needs-attention: amber flag in the ID cell + a reason
    // in the status cell (failed → red badge is the reason; deadline → truthful badge + amber tag).
    var attnFlag = a.attn
      ? '<span class="attn-flag" title="Needs attention"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>'
      : '';
    var statusInner = '<span class="status ' + esc(a.status) + '">' + esc(a.status) + '</span>'
      + (a.attnType === "deadline" ? '<span class="deadline-tag">Deadline passed</span>' : '');
    return '<tr data-rec="' + esc(a.rec || "") + '" data-sol="' + esc(a.id) + '" data-uuid="' + esc(a.uuid) + '"' + (a.attn ? ' class="needs-attention" data-attn="' + esc(a.attnType) + '"' : "") + '>'
      + '<td class="cell-id">' + esc(a.id) + attnFlag + '</td>'
      + '<td class="cell-title" title="' + esc(a.title) + '">' + esc(a.title) + '</td>'
      + '<td class="cell-agency">' + esc(a.agency) + '</td>'
      + '<td><span class="doctype">' + esc(a.type) + '</span></td>'
      + '<td class="cell-due">' + esc(a.due) + '</td>'
      + '<td class="cell-date">' + esc(a.date) + '</td>'
      + '<td>' + recCell + '</td>'
      + '<td><span class="st-cell">' + statusInner + '</span></td>'
      + '<td class="right"><a class="view-link" href="/audit/' + slug + '">View<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></td>'
      + '</tr>';
  }

  // ── Filter + sort + search pipeline ──
  function rowMatchesFilter(a) {
    if (STATE.filter === "all") return true;
    if (STATE.filter === "open")   return a.status === "pending";
    if (STATE.filter === "failed") return a.status === "failed";
    return a.rec === STATE.filter;
  }
  // Card 366 Phase-2 filter bar — AND across time / agency / type / rec / status.
  function rowMatchesBar(a) {
    var f = STATE.f;
    if (f.time !== "all") {
      var maxH = f.time === "30" ? 720 : (f.time === "quarter" ? 2160 : 8760);
      if (!(a.age <= maxH)) return false;
    }
    if (f.agency !== "all" && a.agency !== f.agency) return false;
    if (f.type   !== "all" && a.type   !== f.type)   return false;
    if (f.rec    !== "all" && a.rec    !== f.rec)    return false;
    if (f.status !== "all" && a.status !== f.status) return false;
    if (f.naics  !== "all" && a.naics  !== f.naics)  return false;
    if (f.setAside !== "all" && a.setAside !== f.setAside) return false;
    return true;
  }
  function rowMatchesSearch(a) {
    if (!STATE.search) return true;
    var q = STATE.search;
    // Placeholder promises "audits, notice IDs, NAICS…" — match notice/sol id, title, type, NAICS, agency.
    return (a.id     && a.id.toLowerCase().indexOf(q)    !== -1)
        || (a.title  && a.title.toLowerCase().indexOf(q) !== -1)
        || (a.type   && a.type.toLowerCase().indexOf(q)  !== -1)
        || (a.naics  && String(a.naics).toLowerCase().indexOf(q) !== -1)
        || (a.agency && a.agency.toLowerCase().indexOf(q) !== -1);
  }
  function sortedRows() {
    var copy = STATE.rows.slice();
    copy.sort(function (x, y) {
      if (STATE.sortKey === "date") {
        return STATE.sortDir * (x.age - y.age);
      }
      if (STATE.sortKey === "due") {
        return STATE.sortDir * (x.dueTs - y.dueTs);
      }
      if (STATE.sortKey === "audited") {
        return STATE.sortDir * (x.age - y.age);
      }
      if (STATE.sortKey === "agency" || STATE.sortKey === "type" || STATE.sortKey === "rec" || STATE.sortKey === "status") {
        var xa = (x[STATE.sortKey] || "").toString().toLowerCase();
        var ya = (y[STATE.sortKey] || "").toString().toLowerCase();
        return STATE.sortDir * xa.localeCompare(ya);
      }
      var xi = (x.id || "").toLowerCase();
      var yi = (y.id || "").toLowerCase();
      return STATE.sortDir * xi.localeCompare(yi);
    });
    return copy;
  }

  // ── Data writes (no structure changes) ──
  function writeTable() {
    var body = document.getElementById("ledgerBody");
    if (!body) return;
    // Rule 61 — a failed load is a VISIBLE failure state, never an empty ledger
    // (an empty ledger reads as "no audits yet", which the page cannot vouch for).
    if (STATE.loadError) {
      body.innerHTML = '<tr><td colspan="9" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'Could not load your audits (' + esc(STATE.loadError) + '). Reload to try again.'
        + '</td></tr>';
      var vce = document.getElementById("visCount");
      if (vce) vce.textContent = "";
      return;
    }
    syncSlicers();
    var sorted = sortedRows();
    // Filter-bar + search define the working set the chips act on; chip narrows it.
    var mset = sorted.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var visible = mset.filter(rowMatchesFilter);

    if (sorted.length === 0) {
      body.innerHTML = '<tr><td colspan="9" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits yet — <a href="/audit" style="color:var(--blue-600);font-weight:600;text-decoration:none">run your first audit →</a>'
        + '</td></tr>';
    } else if (visible.length === 0) {
      body.innerHTML = '<tr><td colspan="9" style="padding:28px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits match this filter/search. <a href="#" class="cc-clear-filters" style="color:var(--blue-600);font-weight:600;text-decoration:none">Clear →</a>'
        + '</td></tr>';
    } else {
      body.innerHTML = visible.map(buildRowHTML).join("");
    }
    var vc = document.getElementById("visCount");
    if (vc) vc.textContent = visible.length + " of " + mset.length;
    wireRowClicks();
  }

  function writeKPIs() {
    var kpis = document.querySelectorAll(".kpi-strip .kpi");
    function setKPI(i, val, footHTML) {
      if (!kpis[i]) return;
      var v = kpis[i].querySelector(".kpi-val");
      if (v) v.textContent = val;
      if (footHTML != null) {
        var f = kpis[i].querySelector(".foot");
        if (f) f.innerHTML = footHTML;
      }
    }
    // Rule 61 — on a failed load every KPI shows a dash, never a zero: "0 audits"
    // is a claim about the customer's history the page cannot make.
    if (STATE.loadError) {
      setKPI(0, "—", "could not load");
      setKPI(1, "—", "could not load");
      setKPI(2, "—", "could not load");
      setKPI(3, "—", "could not load");
      return;
    }
    var rows = STATE.rows;
    var total = rows.length;
    var completed = rows.filter(function (r) { return r.status === "complete"; });
    var bidRows = completed.filter(function (r) { return r.rec === "Bid" || r.rec === "Bid · caution"; });
    var declineRows = completed.filter(function (r) { return r.rec === "No-bid" || r.rec === "Ineligible"; });
    var attnRows = rows.filter(function (r) { return r.attn; });
    var last30 = rows.filter(function (r) { return r.age <= 720; }).length;
    var bidPct = completed.length > 0 ? Math.round((bidRows.length / completed.length) * 100) : 0;
    setKPI(0, String(total), '<b>' + last30 + '</b> in the last 30 days');
    setKPI(1, String(bidRows.length), '<b>' + bidPct + '%</b> of completed — bid or bid-with-caution');
    setKPI(2, String(declineRows.length), 'committal declines — no-bid or ineligible');
    setKPI(3, String(attnRows.length), 'failed, or response deadline passed');
  }

  function writeDistribution() {
    var rows = STATE.rows;
    var total = rows.length;
    // Six poles → the four bar segments, aggregated HONESTLY: committal green,
    // caution amber, committal red, and everything undecided (pending / needs
    // review / incomplete / unresolved) in the neutral segment — never painted
    // onto a committal color.
    var buckets = { bid: 0, caution: 0, decline: 0, other: 0 };
    rows.forEach(function (r) {
      if (r.status !== "complete") buckets.other++;
      else if (r.rec === "Bid") buckets.bid++;
      else if (r.rec === "Bid · caution") buckets.caution++;
      else if (r.rec === "No-bid" || r.rec === "Ineligible") buckets.decline++;
      else buckets.other++;
    });
    function pct(n) { return total > 0 ? Math.round((n / total) * 100) : 0; }
    var bar = document.querySelector(".dist-bar");
    if (bar) {
      var widths = {
        ".d-proceed": pct(buckets.bid),
        ".d-caution": pct(buckets.caution),
        ".d-decline": pct(buckets.decline),
        ".d-pending": pct(buckets.other)
      };
      Object.keys(widths).forEach(function (sel) {
        var s = bar.querySelector(sel);
        if (s) s.style.width = widths[sel] + "%";
      });
    }
    var legend = document.querySelector(".dist-legend");
    if (legend) {
      function setLeg(cls, n) {
        var el = legend.querySelector(".dl." + cls + " b");
        if (el) el.textContent = STATE.loadError ? "—" : String(n);
      }
      setLeg("proceed", buckets.bid);
      setLeg("caution", buckets.caution);
      setLeg("decline", buckets.decline);
      setLeg("pending", buckets.other);
    }
  }

  function writeFilterCounts() {
    // Chip counts reflect the current filter-bar + search aperture, not the raw total.
    var rows = STATE.rows.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    function recCount(label) {
      return rows.filter(function (r) { return r.rec === label && r.status === "complete"; }).length;
    }
    var counts = {
      all: rows.length,
      "Bid": recCount("Bid"),
      "Bid · caution": recCount("Bid · caution"),
      "No-bid": recCount("No-bid"),
      "Ineligible": recCount("Ineligible"),
      "Needs review": recCount("Needs review"),
      "Incomplete": recCount("Incomplete"),
      open:   rows.filter(function (r) { return r.status === "pending"; }).length,
      failed: rows.filter(function (r) { return r.status === "failed"; }).length
    };
    document.querySelectorAll(".filters .fbtn").forEach(function (btn) {
      var k = btn.dataset.filter;
      var n = btn.querySelector(".n");
      if (n && counts[k] != null) n.textContent = STATE.loadError ? "—" : String(counts[k]);
    });
  }

  function writeHeaderSub() {
    var sub = document.querySelector(".page-header .sub");
    if (!sub) return;
    if (STATE.loadError) {
      sub.innerHTML = 'Your audit history could not be loaded — reload to try again.';
      return;
    }
    var n = STATE.rows.length;
    sub.innerHTML = 'Every solicitation FARaudit has audited for you — <b>'
      + n + ' record' + (n === 1 ? '' : 's') + '</b>, newest first.';
  }

  // Card #450 — live sidebar badge: replace the rail's hardcoded "15" on the
  // Past Audits item with the real OPEN count (response deadline not yet passed)
  // from the loaded audits. Client-side so no shared server-rail change; targets
  // the injectRail markup by href (rail renamed Past Audits → /past-audits).
  // WIRE-MAP #456 Ruling 3 — keep the neutral `count` badge; disambiguate "open" =
  // response-deadline-not-yet-passed, and bind open/total live with explanatory titles.
  function writeSidebarBadge() {
    if (STATE.loadError) return; // markup ships an empty badge — leave it empty, never "0"
    var open = STATE.rows.filter(function (r) { return r.dueTs !== Infinity && r.dueTs > Date.now(); }).length;
    var total = STATE.rows.length;
    var link = document.querySelector('.sb-icon[href="/past-audits"], .sb-icon[href="/dashboard"]');
    if (!link) return;
    link.setAttribute("title", "Past Audits — " + open + " open (response deadline not yet passed) of " + total + " total");
    var el = link.querySelector(".sb-badge");
    if (el) {
      el.textContent = String(open);
      el.setAttribute("title", open + " open — response deadline not yet passed (of " + total + " total)");
    }
    var tip = link.querySelector(".sb-tip");
    if (tip) tip.textContent = "Past Audits · " + open + " open";
  }

  function writeAll() {
    populateFilterBar();
    writeSidebarBadge();
    // Card 366 Phase-2 — expose needs-attention count for a later Today rollup
    // (do NOT build Today here). failed OR deadline-passed.
    window.__paNeedsAttention = STATE.rows.filter(function (r) { return r.attn; }).length;
    writeKPIs();
    writeDistribution();
    writeFilterCounts();
    writeHeaderSub();
    writeTable();
  }

  // ── Wires — this script is the page's ONLY writer (the duplicate inline
  // wiring was removed; two listeners per control meant the last writer won
  // and the ARC #747 six-pole fix never reached the screen). ──
  function wireFilters() {
    var filters = document.getElementById("filters");
    if (!filters || filters.dataset.ccWired) return;
    filters.dataset.ccWired = "1";
    filters.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".fbtn");
      if (!btn) return;
      filters.querySelectorAll(".fbtn").forEach(function (b) { b.classList.toggle("active", b === btn); });
      STATE.filter = btn.dataset.filter || "all";
      writeTable();
    });
  }

  function wireSort() {
    document.querySelectorAll("th.sortable").forEach(function (th) {
      if (th.dataset.ccWired) return;
      th.dataset.ccWired = "1";
      th.addEventListener("click", function () {
        var k = th.dataset.sort;
        if (STATE.sortKey === k) {
          STATE.sortDir *= -1;
        } else {
          STATE.sortKey = k;
          // First click gives the intuitive order: newest first for date-like
          // columns, A→Z for text columns.
          STATE.sortDir = (k === "audited" || k === "date" || k === "due" || k === "id") ? 1 : 1;
        }
        document.querySelectorAll("th.sortable").forEach(function (x) {
          x.classList.remove("sorted");
          var a = x.querySelector(".arr");
          if (a) a.remove();
        });
        th.classList.add("sorted");
        var arr = document.createElement("span");
        arr.className = "arr";
        // For age-based keys dir=1 is newest-first — show ▼ for that (newest at top).
        var newestFirst = (k === "audited" || k === "date");
        arr.textContent = (STATE.sortDir === (newestFirst ? 1 : -1)) ? "▼" : "▲";
        th.appendChild(arr);
        writeTable();
      });
    });
  }

  function wireSearch() {
    var sb = document.querySelector(".search");
    if (!sb || sb.dataset.ccWired) return;
    sb.dataset.ccWired = "1";
    sb.style.cursor = "text";
    // Activate = swap the placeholder span for a live input that filters STATE.rows on keyup.
    // Invoked by BOTH a click on the search shelf AND ⌘K / Ctrl+K (the masthead hint).
    function activateSearch() {
      var existing = sb.querySelector(".cc-search-input");
      if (existing) { existing.focus(); return; }
      var placeholder = null;
      sb.querySelectorAll("span").forEach(function (s) {
        if (!s.classList.contains("kbd") && placeholder === null) placeholder = s;
      });
      if (!placeholder) return;
      var input = document.createElement("input");
      input.type = "text";
      input.className = "cc-search-input";
      input.placeholder = (placeholder.textContent || "").trim() || "Search audits…";
      input.style.cssText = "background:transparent;border:none;outline:none;color:inherit;font:inherit;flex:1;min-width:0;padding:0;margin:0;";
      placeholder.replaceWith(input);
      input.focus();
      input.addEventListener("keyup", function () {
        STATE.search = (input.value || "").trim().toLowerCase();
        writeTable();
      });
    }
    sb.addEventListener("click", activateSearch);
    window.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        activateSearch();
      } else if (e.key === "Escape") {
        var input = sb.querySelector(".cc-search-input");
        if (input && document.activeElement === input) {
          input.value = ""; STATE.search = ""; writeTable(); input.blur();
        }
      }
    });
  }

  function wireRowClicks() {
    document.querySelectorAll("#ledgerBody tr[data-sol]").forEach(function (row) {
      if (row.dataset.ccWired) return;
      row.dataset.ccWired = "1";
      // Navigate by the row's OWN audit uuid — a solicitation number audited more
      // than once resolves server-side to the NEWEST audit, which would silently
      // open a different report than the row the customer clicked.
      var target = row.getAttribute("data-uuid") || row.getAttribute("data-sol") || "";
      row.querySelectorAll(".view-link").forEach(function (link) {
        link.addEventListener("click", function (e) { e.stopPropagation(); });
      });
      row.style.cursor = "pointer";
      row.addEventListener("click", function () {
        if (target) window.location.href = "/audit/" + encodeURIComponent(target);
      });
    });
    var clear = document.querySelector(".cc-clear-filters");
    if (clear && !clear.dataset.ccWired) {
      clear.dataset.ccWired = "1";
      clear.addEventListener("click", function (e) {
        e.preventDefault();
        STATE.filter = "all";
        STATE.search = "";
        STATE.f = { time: "all", agency: "all", type: "all", rec: "all", status: "all", naics: "all", setAside: "all" };
        document.querySelectorAll(".pa-filter").forEach(function (s) { s.value = "all"; });
        document.querySelectorAll(".fbtn").forEach(function (b) {
          b.classList.toggle("active", b.dataset.filter === "all");
        });
        var input = document.querySelector(".cc-search-input");
        if (input) input.value = "";
        writeFilterCounts();
        writeTable();
      });
    }
  }

  // Card 366 Phase-2 — populate the dynamic filter-bar selects (agency/type)
  // from the live rows. Rec/Status/Time options are static in the markup.
  function populateFilterBar() {
    function distinct(key) {
      var seen = {}, out = [];
      STATE.rows.forEach(function (r) {
        var v = r[key];
        if (v != null && v !== "—" && !seen[v]) { seen[v] = 1; out.push(v); }
      });
      return out.sort();
    }
    // WIRE-MAP #456 Ruling 1 — set-aside decode: show the SAM display name, filter on the raw value.
    var SETASIDE_LABELS = { SBA: "Small Business", "8A": "8(a)", "8AN": "8(a)", HZC: "HUBZone", HZS: "HUBZone", SDVOSBC: "SDVOSB", SDVOSBS: "SDVOSB", WOSBC: "WOSB", WOSBSS: "WOSB", EDWOSBC: "EDWOSB", EDWOSBSS: "EDWOSB", VOSBC: "VOSB", VOSBS: "VOSB" };
    function setAsideLabel(v) { if (v == null || v === "—" || v === "" || v === "NONE" || v === "None" || v === "none") return "—"; return SETASIDE_LABELS[v] || v; }
    function fill(id, values, allLabel, labelFn) {
      var el = document.getElementById(id);
      if (!el) return;
      var cur = el.value;
      var opts = '<option value="all">' + allLabel + '</option>';
      values.forEach(function (v) { opts += '<option value="' + esc(v) + '">' + esc(labelFn ? labelFn(v) : v) + '</option>'; });
      el.innerHTML = opts;
      if (cur && (cur === "all" || values.indexOf(cur) !== -1)) el.value = cur;
    }
    fill("fAgency", distinct("agency"), "All agencies");
    fill("fType", distinct("type"), "All types");
    // NAICS: bare code — no title in the audits row payload (WIRE-MAP fallback: "no title on file → bare code").
    fill("fNaics", distinct("naics"), "All NAICS");
    fill("fSetAside", distinct("setAside"), "All set-asides", setAsideLabel);
  }

  // WIRE-MAP #456 Ruling 1 — pill "active" state + Clear visibility. A slicer glows
  // blue when its value ≠ all; Clear appears only when ANY slicer / quick-chip / search
  // is constraining the set. Called from writeTable() so every re-render stays in sync.
  function syncSlicers() {
    var anyActive = false;
    document.querySelectorAll(".pa-filter").forEach(function (sel) {
      var active = sel.value !== "all" && sel.value !== "";
      if (active) anyActive = true;
      var slicer = sel.closest(".pa-slicer");
      if (slicer) slicer.classList.toggle("is-active", active);
    });
    if (STATE.filter && STATE.filter !== "all") anyActive = true;
    if (STATE.search && STATE.search !== "") anyActive = true;
    var clr = document.getElementById("paClear");
    if (clr) clr.hidden = !anyActive;
  }

  function wireFilterBar() {
    [["fTime", "time"], ["fAgency", "agency"], ["fType", "type"], ["fRec", "rec"], ["fStatus", "status"], ["fNaics", "naics"], ["fSetAside", "setAside"]].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el || el.dataset.ccWired) return;
      el.dataset.ccWired = "1";
      el.addEventListener("change", function () {
        STATE.f[pair[1]] = el.value || "all";
        writeFilterCounts();
        writeTable();
      });
    });
    var clr = document.getElementById("paClear");
    if (clr && !clr.dataset.ccWired) {
      clr.dataset.ccWired = "1";
      clr.addEventListener("click", function () {
        STATE.f = { time: "all", agency: "all", type: "all", rec: "all", status: "all", naics: "all", setAside: "all" };
        STATE.filter = "all";
        STATE.search = "";
        document.querySelectorAll(".pa-filter").forEach(function (s) { s.value = "all"; });
        document.querySelectorAll(".fbtn").forEach(function (b) { b.classList.toggle("active", b.dataset.filter === "all"); });
        var input = document.querySelector(".cc-search-input");
        if (input) input.value = "";
        writeFilterCounts();
        writeTable();
      });
    }
  }

  // ── Main ──
  async function wireDashboard() {
    // Attach additive listeners FIRST (before fetch).
    // Inline handlers are already in place from parse-time; ours run after.
    wireFilters();
    wireSort();
    wireSearch();
    wireFilterBar();

    // Loading state before the fetch — the markup ships placeholders, never numbers.
    var body = document.getElementById("ledgerBody");
    if (body) {
      body.innerHTML = '<tr><td colspan="9" style="padding:22px 12px;color:var(--mute)">Loading your audits…</td></tr>';
    }

    // Fetch and map. Rule 61 — a failed request becomes a VISIBLE failure state,
    // never an empty ledger and never zeroed KPIs ("0 audits" is a claim this
    // page cannot make when the request failed).
    var data;
    try {
      var r = await fetch("/api/audits?limit=200", { credentials: "include" });
      if (!r.ok) {
        console.warn("[dashboard-live] /api/audits returned", r.status);
        STATE.loadError = "HTTP " + r.status;
        STATE.rows = [];
      } else {
        data = await r.json();
        var audits = (data && data.audits) || [];
        STATE.loadError = null;
        STATE.rows = audits.map(mapAuditToRow);
      }
    } catch (e) {
      console.warn("[dashboard-live] fetch failed", e);
      STATE.loadError = (e && e.message) || "network error";
      STATE.rows = [];
    }

    // Write all data into existing elements
    writeAll();
    console.log("[dashboard-live] rendered " + STATE.rows.length + " audits" + (STATE.loadError ? " (LOAD ERROR: " + STATE.loadError + ")" : ""));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDashboard);
  } else {
    wireDashboard();
  }
})();
