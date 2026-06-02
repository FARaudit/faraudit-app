(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════
  // Past Audits / Dashboard live wiring — SELF-SUFFICIENT MODE.
  //
  // The design ships with inline JS that renders a static AUDITS array
  // and wires its own sort/filter handlers. We DON'T cooperate with it
  // — instead:
  //   1. Strip the inline event listeners by cloneNode-replacing the
  //      target elements (#filters and each th.sortable). This removes
  //      the inline handlers entirely.
  //   2. Manage our own STATE (rows + filter + sortKey + sortDir + search).
  //   3. Render the table + KPIs + distribution + filter counts + page
  //      sub all from live /api/audits data.
  //   4. Attach our own filter/sort/search handlers that re-render from
  //      live data.
  //
  // The inline AUDITS const + render() become dead weight but harmless —
  // their last render() call painted a frame of static rows; our DOMContentLoaded
  // handler replaces those rows before paint settles.
  // ═══════════════════════════════════════════════════════

  // ── State ──
  var STATE = {
    rows: [],
    filter: "all",
    sortKey: "score",
    sortDir: -1,    // -1 desc, 1 asc
    search: ""
  };

  // ── Helpers ──
  function relativeAgo(iso) {
    if (!iso) return { label: "—", ageHours: Infinity };
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return { label: "—", ageHours: Infinity };
    var diffMs = Date.now() - ms;
    var ageHours = diffMs / 3600000;
    if (diffMs < 60 * 1000)               return { label: "just now",                                          ageHours: ageHours };
    if (diffMs < 60 * 60 * 1000)          return { label: Math.max(1, Math.round(diffMs / 60000)) + "m ago",   ageHours: ageHours };
    if (diffMs < 24 * 60 * 60 * 1000)     return { label: Math.round(diffMs / (60 * 60 * 1000)) + "h ago",     ageHours: ageHours };
    if (diffMs < 48 * 60 * 60 * 1000)     return { label: "Yesterday",                                         ageHours: ageHours };
    if (diffMs < 7 * 24 * 60 * 60 * 1000) return { label: Math.round(diffMs / (24 * 60 * 60 * 1000)) + "d ago",ageHours: ageHours };
    if (diffMs < 30 * 24 * 60 * 60 * 1000)return { label: Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + "w ago", ageHours: ageHours };
    return { label: Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)) + "mo ago", ageHours: ageHours };
  }

  function recommendationBucket(audit) {
    if ((audit.status || "").toLowerCase() !== "complete") return null;
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
    return {
      id:     audit.solicitation_number || audit.notice_id || audit.id || "—",
      title:  (audit.title || "Untitled").trim(),
      date:   ago.label,
      age:    ago.ageHours,
      type:   audit.document_type || "—",
      score:  typeof audit.compliance_score === "number" ? audit.compliance_score : null,
      rec:    recommendationBucket(audit),
      status: statusBucket(audit)
    };
  }

  function scoreTone(s) {
    if (s == null) return "s-none";
    if (s >= 80) return "s-hi";
    if (s >= 65) return "s-md";
    if (s >= 40) return "s-lo";
    return "s-no";
  }

  function recClass(r) {
    return r ? r.toLowerCase() : "none";
  }

  // Escape user content before insertion — defends against any malformed
  // title/agency text that could break the table.
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Row HTML — exact column structure from the design's inline render():
  // id · title · date · type · score · rec · status · View link
  function buildRowHTML(a) {
    var tone = scoreTone(a.score);
    var scoreCell = a.score == null
      ? '<span class="score s-none">—</span>'
      : '<div class="score-cell"><span class="score-meter"><i class="si ' + tone + '" style="width:' + a.score + '%"></i></span><span class="score ' + tone + '">' + a.score + '</span></div>';
    var recCell = a.rec
      ? '<span class="rec ' + recClass(a.rec) + '">' + esc(a.rec) + '</span>'
      : '<span class="rec none">—</span>';
    var slug = encodeURIComponent(a.id);
    return '<tr data-rec="' + esc(a.rec || "") + '" data-sol="' + esc(a.id) + '">'
      + '<td class="cell-id">' + esc(a.id) + '</td>'
      + '<td class="cell-title" title="' + esc(a.title) + '">' + esc(a.title) + '</td>'
      + '<td class="cell-date">' + esc(a.date) + '</td>'
      + '<td><span class="doctype">' + esc(a.type) + '</span></td>'
      + '<td class="right">' + scoreCell + '</td>'
      + '<td>' + recCell + '</td>'
      + '<td><span class="status ' + esc(a.status) + '">' + esc(a.status) + '</span></td>'
      + '<td class="right"><a class="view-link" href="/audit/' + slug + '">View<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></td>'
      + '</tr>';
  }

  // ── Filter + sort + search pipeline ──
  function rowMatchesFilter(a) {
    if (STATE.filter === "all") return true;
    if (STATE.filter === "open") return a.status !== "complete";
    return a.rec === STATE.filter;
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
      var xv, yv;
      if (STATE.sortKey === "score") {
        xv = x.score == null ? -1 : x.score;
        yv = y.score == null ? -1 : y.score;
        return STATE.sortDir * (xv - yv);
      }
      if (STATE.sortKey === "date") {
        return STATE.sortDir * (x.age - y.age);
      }
      // id (string)
      xv = (x.id || "").toLowerCase();
      yv = (y.id || "").toLowerCase();
      return STATE.sortDir * xv.localeCompare(yv);
    });
    return copy;
  }

  // ── Render functions ──
  function renderTable() {
    var body = document.getElementById("ledgerBody");
    if (!body) return;
    var sorted = sortedRows();
    var visible = sorted.filter(function (a) { return rowMatchesFilter(a) && rowMatchesSearch(a); });
    if (sorted.length === 0) {
      body.innerHTML = '<tr><td colspan="8" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits yet — <a href="/audit" style="color:var(--blue-600);font-weight:600;text-decoration:none">run your first audit →</a>'
        + '</td></tr>';
    } else if (visible.length === 0) {
      body.innerHTML = '<tr><td colspan="8" style="padding:28px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits match this filter/search. <a href="#" class="cc-clear-filters" style="color:var(--blue-600);font-weight:600;text-decoration:none">Clear →</a>'
        + '</td></tr>';
    } else {
      body.innerHTML = visible.map(buildRowHTML).join("");
    }
    var vc = document.getElementById("visCount");
    if (vc) vc.textContent = visible.length + " of " + sorted.length;
    wireRowClicks();
  }

  function renderKPIs() {
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
    function setVal(idx, val, html) {
      if (!kpis[idx]) return;
      var v = kpis[idx].querySelector(".kpi-val");
      if (v) { if (html) v.innerHTML = val; else v.textContent = val; }
    }
    setVal(0, String(total));
    setVal(1, String(proceedRows.length));
    if (kpis[1]) {
      var f = kpis[1].querySelector(".foot");
      if (f) f.innerHTML = '<b>' + proceedPct + '%</b> of completed — clear to bid';
    }
    setVal(2, String(declineRows.length));
    setVal(3, String(avgScore) + '<span class="unit">/100</span>', true);
  }

  function renderDistribution() {
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

  function renderFilterCounts() {
    var rows = STATE.rows;
    var counts = {
      all:     rows.length,
      Proceed: rows.filter(function (r) { return r.rec === "Proceed" && r.status === "complete"; }).length,
      Caution: rows.filter(function (r) { return r.rec === "Caution" && r.status === "complete"; }).length,
      Decline: rows.filter(function (r) { return r.rec === "Decline" && r.status === "complete"; }).length,
      open:    rows.filter(function (r) { return r.status !== "complete"; }).length
    };
    document.querySelectorAll(".filters .fbtn").forEach(function (btn) {
      var k = btn.dataset.filter;
      var n = btn.querySelector(".n");
      if (n && counts[k] != null) n.textContent = String(counts[k]);
    });
  }

  function renderPageHeaderSub() {
    var sub = document.querySelector(".page-header .sub");
    if (!sub) return;
    var n = STATE.rows.length;
    sub.innerHTML = 'Every solicitation FARaudit has scored for you — <b>'
      + n + ' record' + (n === 1 ? '' : 's') + '</b>, newest first.';
  }

  function renderAll() {
    renderTable();
    renderKPIs();
    renderDistribution();
    renderFilterCounts();
    renderPageHeaderSub();
  }

  // ── Wire interactions — strip inline listeners by cloneNode-replace ──
  function wireFilters() {
    var filters = document.getElementById("filters");
    if (!filters) return;
    // Replace with a clone to drop the inline JS click listener
    var fresh = filters.cloneNode(true);
    filters.parentNode.replaceChild(fresh, filters);
    fresh.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".fbtn");
      if (!btn) return;
      fresh.querySelectorAll(".fbtn").forEach(function (b) { b.classList.toggle("active", b === btn); });
      STATE.filter = btn.dataset.filter || "all";
      renderTable();
    });
  }

  function wireSort() {
    document.querySelectorAll("th.sortable").forEach(function (th) {
      // Replace each sortable header with a clone to drop inline listener
      var fresh = th.cloneNode(true);
      th.parentNode.replaceChild(fresh, th);
    });
    document.querySelectorAll("th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.sort;
        if (STATE.sortKey === k) STATE.sortDir *= -1;
        else { STATE.sortKey = k; STATE.sortDir = (k === "id") ? 1 : -1; }
        // Remove arrow indicators from all sortables, add to this one
        document.querySelectorAll("th.sortable").forEach(function (x) {
          x.classList.remove("sorted");
          var a = x.querySelector(".arr");
          if (a) a.remove();
        });
        th.classList.add("sorted");
        var arr = document.createElement("span");
        arr.className = "arr";
        arr.textContent = STATE.sortDir < 0 ? "▼" : "▲";
        th.appendChild(arr);
        renderTable();
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
        renderTable();
      });
    });
  }

  function wireRowClicks() {
    document.querySelectorAll("#ledgerBody tr[data-sol]").forEach(function (row) {
      if (row.dataset.ccWired) return;
      row.dataset.ccWired = "1";
      var sol = row.getAttribute("data-sol") || "";
      // View link inside the row already navigates via native href; row-body
      // click also navigates so the whole row is hot. View link gets preventDefault
      // bubble blocked so we don't double-fire.
      row.querySelectorAll(".view-link").forEach(function (link) {
        link.addEventListener("click", function (e) { e.stopPropagation(); });
      });
      row.style.cursor = "pointer";
      row.addEventListener("click", function () {
        if (sol) window.location.href = "/audit/" + encodeURIComponent(sol);
      });
    });
    // Clear-filter link in empty-match state
    var clear = document.querySelector(".cc-clear-filters");
    if (clear && !clear.dataset.ccWired) {
      clear.dataset.ccWired = "1";
      clear.addEventListener("click", function (e) {
        e.preventDefault();
        STATE.filter = "all";
        STATE.search = "";
        document.querySelectorAll(".fbtn").forEach(function (b) {
          b.classList.toggle("active", b.dataset.filter === "all");
        });
        var input = document.querySelector(".cc-search-input");
        if (input) input.value = "";
        renderTable();
      });
    }
  }

  // ── Main wire ──
  async function wireDashboard() {
    // 1. Strip inline listeners (filters + sort headers) and re-attach our own
    wireFilters();
    wireSort();
    wireSearch();

    // 2. Fetch live audits
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

    // 3. Render everything
    renderAll();
    console.log("[dashboard-live] rendered " + STATE.rows.length + " audits (self-sufficient)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDashboard);
  } else {
    wireDashboard();
  }
})();
