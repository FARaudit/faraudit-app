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
    sortKey: "score",
    sortDir: -1,
    search: ""
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
  function normalizeAgency(raw) {
    if (!raw) return "—";
    var seg = String(raw).split("·").pop().trim();
    var key = seg.replace(/,?\s*DEPARTMENT OF\s*$/i, "").replace(/^DEPARTMENT OF\s+/i, "").replace(/^DEPT OF\s+/i, "").trim();
    var MAP = { "THE AIR FORCE": "Air Force", "AIR FORCE": "Air Force", "THE ARMY": "Army", "ARMY": "Army", "THE NAVY": "Navy", "NAVY": "Navy", "FEDERAL AVIATION ADMINISTRATION": "FAA", "VETERANS AFFAIRS": "VA" };
    var hit = MAP[key.toUpperCase()];
    if (hit) return hit;
    return key.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || "—";
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

  function recommendationBucket(audit) {
    if ((audit.status || "").toLowerCase() !== "complete") return null;
    // FA-126 — audits.recommendation is the single source of truth. The
    // engine persists one of three enums; map them 1:1 so the ledger can
    // never disagree with the report masthead / §06 / PDF, which read the
    // same stored field. (Pre-fix, a stored PROCEED_WITH_CAUTION with score
    // 35 fell through the free-text probes into the score branch and
    // rendered "Decline".) The heuristics below survive ONLY for legacy
    // rows that predate the enum.
    var stored = (audit.recommendation || "").toUpperCase();
    if (stored === "PROCEED") return "Proceed";
    if (stored === "PROCEED_WITH_CAUTION") return "Caution";
    if (stored === "DECLINE") return "Decline";
    var bnb = (audit.bid_no_bid || "").toLowerCase();
    var rec = (audit.recommendation || "").toLowerCase();
    if (bnb === "no-bid" || rec.indexOf("disqualif") !== -1 || rec.indexOf("no bid") !== -1) return "Decline";
    if (bnb === "bid" || rec.indexOf("recommend bid") !== -1 || rec.indexOf("strong fit") !== -1) return "Proceed";
    if (typeof audit.compliance_score === "number") {
      if (audit.compliance_score >= 80) return "Proceed";
      if (audit.compliance_score < 50)  return "Decline";
      return "Caution";
    }
    return "Caution";
  }

  function statusBucket(audit) {
    var s = (audit.status || "").toLowerCase();
    if (s === "complete") return "complete";
    if (s === "failed" || s === "error") return "failed";
    return "pending";
  }

  function mapAuditToRow(audit) {
    var ago = relativeAgo(audit.completed_at || audit.created_at);
    // FA-126 — DECISION_GATE audits suppress the numeric score on the
    // report (gates supersede the scored tier; view-model renders "—").
    // Mirror that here so the ledger never shows a number the report hides.
    var gateMode = audit.verdict_type === "DECISION_GATE";
    var dueTs = audit.response_deadline ? new Date(audit.response_deadline).getTime() : Infinity;
    var st = statusBucket(audit);
    // Card 366 Phase-2 needs-attention (LOGIC ONLY — visual is Design's): a failed
    // audit OR a live audit whose response deadline has already passed.
    var attn = (st === "failed") || (dueTs !== Infinity && dueTs < Date.now());
    return {
      id:     audit.solicitation_number || audit.notice_id || audit.id || "—",
      title:  (audit.title || "Untitled").trim(),
      agency: normalizeAgency(audit.agency),
      naics:  audit.naics_code || "—",
      setAside: audit.set_aside || "—",
      date:   ago.label,
      age:    ago.ageHours,
      type:   audit.document_type || "—",
      due:    dueLabel(audit.response_deadline),
      dueTs:  dueTs,
      score:  (!gateMode && typeof audit.compliance_score === "number") ? audit.compliance_score : null,
      rec:    recommendationBucket(audit),
      status: st,
      attn:   attn
    };
  }

  function scoreTone(s) {
    if (s == null) return "s-none";
    if (s >= 80) return "s-hi";
    if (s >= 65) return "s-md";
    if (s >= 40) return "s-lo";
    return "s-no";
  }

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Build the EXACT row markup the design's inline render() uses (verbatim copy).
  function buildRowHTML(a) {
    var tone = scoreTone(a.score);
    var scoreCell = a.score == null
      ? '<span class="score s-none">—</span>'
      : '<div class="score-cell"><span class="score-meter"><i class="si ' + tone + '" style="width:' + a.score + '%"></i></span><span class="score ' + tone + '">' + a.score + '</span></div>';
    var recClassStr = a.rec ? a.rec.toLowerCase() : "none";
    var recCell = a.rec
      ? '<span class="rec ' + recClassStr + '">' + esc(a.rec) + '</span>'
      : '<span class="rec none">—</span>';
    var slug = encodeURIComponent(a.id);
    return '<tr data-rec="' + esc(a.rec || "") + '" data-sol="' + esc(a.id) + '"' + (a.attn ? ' class="needs-attention"' : "") + '>'
      + '<td class="cell-id">' + esc(a.id) + '</td>'
      + '<td class="cell-title" title="' + esc(a.title) + '">' + esc(a.title) + '</td>'
      + '<td class="cell-agency">' + esc(a.agency) + '</td>'
      + '<td><span class="doctype">' + esc(a.type) + '</span></td>'
      + '<td class="cell-due">' + esc(a.due) + '</td>'
      + '<td class="cell-date">' + esc(a.date) + '</td>'
      + '<td class="right">' + scoreCell + '</td>'
      + '<td>' + recCell + '</td>'
      + '<td><span class="status ' + esc(a.status) + '">' + esc(a.status) + '</span></td>'
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
    return (a.id   && a.id.toLowerCase().indexOf(q)    !== -1)
        || (a.title && a.title.toLowerCase().indexOf(q) !== -1)
        || (a.type  && a.type.toLowerCase().indexOf(q)  !== -1);
  }
  function sortedRows() {
    var copy = STATE.rows.slice();
    copy.sort(function (x, y) {
      if (STATE.sortKey === "score") {
        var xs = x.score == null ? -1 : x.score;
        var ys = y.score == null ? -1 : y.score;
        return STATE.sortDir * (xs - ys);
      }
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
    var sorted = sortedRows();
    // Filter-bar + search define the working set the chips act on; chip narrows it.
    var mset = sorted.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var visible = mset.filter(rowMatchesFilter);

    if (sorted.length === 0) {
      body.innerHTML = '<tr><td colspan="10" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits yet — <a href="/audit" style="color:var(--blue-600);font-weight:600;text-decoration:none">run your first audit →</a>'
        + '</td></tr>';
    } else if (visible.length === 0) {
      body.innerHTML = '<tr><td colspan="10" style="padding:28px 16px;text-align:center;color:var(--mute);font-size:13px">'
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
    var rows = STATE.rows;
    var total = rows.length;
    var completed = rows.filter(function (r) { return r.status === "complete"; });
    var proceedRows = completed.filter(function (r) { return r.rec === "Proceed"; });
    var declineRows = completed.filter(function (r) { return r.rec === "Decline"; });
    var scored = rows.filter(function (r) { return typeof r.score === "number"; });
    var avgScore = scored.length > 0
      ? Math.round(scored.reduce(function (s, r) { return s + r.score; }, 0) / scored.length)
      : 0;
    var proceedPct = completed.length > 0
      ? Math.round((proceedRows.length / completed.length) * 100)
      : 0;
    var kpis = document.querySelectorAll(".kpi-strip .kpi");
    if (kpis[0]) { var v0 = kpis[0].querySelector(".kpi-val"); if (v0) v0.textContent = String(total); }
    if (kpis[1]) {
      var v1 = kpis[1].querySelector(".kpi-val"); if (v1) v1.textContent = String(proceedRows.length);
      var f1 = kpis[1].querySelector(".foot");    if (f1) f1.innerHTML = '<b>' + proceedPct + '%</b> of completed — clear to bid';
    }
    if (kpis[2]) { var v2 = kpis[2].querySelector(".kpi-val"); if (v2) v2.textContent = String(declineRows.length); }
    if (kpis[3]) {
      var v3 = kpis[3].querySelector(".kpi-val");
      if (v3) v3.innerHTML = String(avgScore) + '<span class="unit">/100</span>';
    }
  }

  function writeDistribution() {
    var rows = STATE.rows;
    var total = rows.length;
    if (total === 0) return;
    var buckets = { Proceed: 0, Caution: 0, Decline: 0, pending: 0 };
    rows.forEach(function (r) {
      if (r.status !== "complete") buckets.pending++;
      else if (r.rec) buckets[r.rec] = (buckets[r.rec] || 0) + 1;
    });
    function pct(n) { return Math.round((n / total) * 100); }
    var bar = document.querySelector(".dist-bar");
    if (bar) {
      var widths = {
        ".d-proceed": pct(buckets.Proceed),
        ".d-caution": pct(buckets.Caution),
        ".d-decline": pct(buckets.Decline),
        ".d-pending": pct(buckets.pending)
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
        if (el) el.textContent = String(n);
      }
      setLeg("proceed", buckets.Proceed);
      setLeg("caution", buckets.Caution);
      setLeg("decline", buckets.Decline);
      setLeg("pending", buckets.pending);
    }
  }

  function writeFilterCounts() {
    // Chip counts reflect the current filter-bar + search aperture, not the raw total.
    var rows = STATE.rows.filter(function (a) { return rowMatchesSearch(a) && rowMatchesBar(a); });
    var counts = {
      all:     rows.length,
      Proceed: rows.filter(function (r) { return r.rec === "Proceed" && r.status === "complete"; }).length,
      Caution: rows.filter(function (r) { return r.rec === "Caution" && r.status === "complete"; }).length,
      Decline: rows.filter(function (r) { return r.rec === "Decline" && r.status === "complete"; }).length,
      open:    rows.filter(function (r) { return r.status === "pending"; }).length,
      failed:  rows.filter(function (r) { return r.status === "failed"; }).length
    };
    document.querySelectorAll(".filters .fbtn").forEach(function (btn) {
      var k = btn.dataset.filter;
      var n = btn.querySelector(".n");
      if (n && counts[k] != null) n.textContent = String(counts[k]);
    });
  }

  function writeHeaderSub() {
    var sub = document.querySelector(".page-header .sub");
    if (!sub) return;
    var n = STATE.rows.length;
    sub.innerHTML = 'Every solicitation FARaudit has scored for you — <b>'
      + n + ' record' + (n === 1 ? '' : 's') + '</b>, newest first.';
  }

  // Card #450 — live sidebar badge: replace the rail's hardcoded "15" on the
  // Past Audits item with the real OPEN count (response deadline not yet passed)
  // from the loaded audits. Client-side so no shared server-rail change; targets
  // the injectRail markup by href (rail renamed Past Audits → /past-audits).
  function writeSidebarBadge() {
    var open = STATE.rows.filter(function (r) { return r.dueTs !== Infinity && r.dueTs > Date.now(); }).length;
    var el = document.querySelector('.sb-icon[href="/past-audits"] .sb-badge, .sb-icon[href="/dashboard"] .sb-badge');
    if (el) el.textContent = String(open);
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

  // ── Wires (additive — never replace inline handlers) ──
  function wireFilters() {
    var filters = document.getElementById("filters");
    if (!filters || filters.dataset.ccWired) return;
    filters.dataset.ccWired = "1";
    // Inline handler fires FIRST (was attached at parse time). It re-renders
    // the static AUDITS. Our handler fires AFTER (addEventListener order)
    // and overwrites the table with our live data.
    filters.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".fbtn");
      if (!btn) return;
      // Inline handler already set .active on the clicked button — read it.
      STATE.filter = btn.dataset.filter || "all";
      writeTable();
    });
  }

  function wireSort() {
    document.querySelectorAll("th.sortable").forEach(function (th) {
      if (th.dataset.ccWired) return;
      th.dataset.ccWired = "1";
      th.addEventListener("click", function () {
        // Inline handler already updated its own sortKey/sortDir + the .arr
        // arrow element. Read the resulting state from DOM.
        var k = th.dataset.sort;
        var arr = th.querySelector(".arr");
        var arrowText = arr ? (arr.textContent || "▼").trim() : "▼";
        if (STATE.sortKey === k) STATE.sortDir *= -1;
        else { STATE.sortKey = k; STATE.sortDir = (k === "id") ? 1 : -1; }
        // Override sortDir from the visible arrow indicator the inline handler
        // already set (so we agree with the displayed arrow).
        STATE.sortDir = arrowText === "▲" ? 1 : -1;
        writeTable();
      });
    });
  }

  function wireSearch() {
    var sb = document.querySelector(".search");
    if (!sb || sb.dataset.ccWired) return;
    sb.dataset.ccWired = "1";
    sb.style.cursor = "text";
    sb.addEventListener("click", function () {
      if (sb.querySelector(".cc-search-input")) return;
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
    });
  }

  function wireRowClicks() {
    document.querySelectorAll("#ledgerBody tr[data-sol]").forEach(function (row) {
      if (row.dataset.ccWired) return;
      row.dataset.ccWired = "1";
      var sol = row.getAttribute("data-sol") || "";
      row.querySelectorAll(".view-link").forEach(function (link) {
        link.addEventListener("click", function (e) { e.stopPropagation(); });
      });
      row.style.cursor = "pointer";
      row.addEventListener("click", function () {
        if (sol) window.location.href = "/audit/" + encodeURIComponent(sol);
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
    function fill(id, values, allLabel) {
      var el = document.getElementById(id);
      if (!el) return;
      var cur = el.value;
      var opts = '<option value="all">' + allLabel + '</option>';
      values.forEach(function (v) { opts += '<option value="' + esc(v) + '">' + esc(v) + '</option>'; });
      el.innerHTML = opts;
      if (cur && (cur === "all" || values.indexOf(cur) !== -1)) el.value = cur;
    }
    fill("fAgency", distinct("agency"), "All agencies");
    fill("fType", distinct("type"), "All types");
    fill("fNaics", distinct("naics"), "All NAICS");
    fill("fSetAside", distinct("setAside"), "All set-asides");
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

    // Fetch and map
    var data;
    try {
      var r = await fetch("/api/audits?limit=200", { credentials: "include" });
      if (!r.ok) {
        console.warn("[dashboard-live] /api/audits returned", r.status);
        STATE.rows = [];
      } else {
        data = await r.json();
        var audits = (data && data.audits) || [];
        STATE.rows = audits.map(mapAuditToRow);
      }
    } catch (e) {
      console.warn("[dashboard-live] fetch failed", e);
      STATE.rows = [];
    }

    // Write all data into existing elements
    writeAll();
    console.log("[dashboard-live] rendered " + STATE.rows.length + " audits (non-invasive)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDashboard);
  } else {
    wireDashboard();
  }
})();
