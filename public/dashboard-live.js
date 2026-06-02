(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════
  // Past Audits / Dashboard live wiring (Phase 5 · 2026-06-02).
  // Targets the new Bid Decision Ledger DOM in dashboard-design.html.
  //
  // The design ships with inline JS that renders an `AUDITS` array into
  // #ledgerBody + wires sort/filter handlers. Live mode:
  //   1. dashboard-design.html exposes window.AUDITS + window.__renderDashboard
  //   2. We fetch /api/audits, map AuditRow → design row shape, mutate the
  //      same AUDITS array in place (so the inline sort/filter handlers keep
  //      working against live data), then invoke window.__renderDashboard().
  //   3. Update KPI strip, distribution bar, filter chip counts, and the
  //      page-header "N records" line from the same data.
  // ═══════════════════════════════════════════════════════

  // ── Helpers ──
  function relativeAgo(iso) {
    if (!iso) return { label: "—", ageHours: Infinity };
    var ms = new Date(iso).getTime();
    if (isNaN(ms)) return { label: "—", ageHours: Infinity };
    var diffMs = Date.now() - ms;
    var ageHours = diffMs / 3600000;
    if (diffMs < 60 * 1000)               return { label: "just now",                                  ageHours: ageHours };
    if (diffMs < 60 * 60 * 1000)          return { label: Math.max(1, Math.round(diffMs / 60000)) + "m ago", ageHours: ageHours };
    if (diffMs < 24 * 60 * 60 * 1000)     return { label: Math.round(diffMs / (60 * 60 * 1000)) + "h ago",   ageHours: ageHours };
    if (diffMs < 48 * 60 * 60 * 1000)     return { label: "Yesterday",                                 ageHours: ageHours };
    if (diffMs < 7 * 24 * 60 * 60 * 1000) return { label: Math.round(diffMs / (24 * 60 * 60 * 1000)) + "d ago", ageHours: ageHours };
    if (diffMs < 30 * 24 * 60 * 60 * 1000) return { label: Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + "w ago", ageHours: ageHours };
    return { label: Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)) + "mo ago", ageHours: ageHours };
  }

  // Decide which recommendation bucket an audit lands in.
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

  // ── KPI strip ──
  function renderKPIStrip(rows) {
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

  // ── Distribution bar + legend ──
  function renderDistribution(rows) {
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
      var segs = {
        ".d-proceed": pct(buckets.Proceed),
        ".d-caution": pct(buckets.Caution),
        ".d-decline": pct(buckets.Decline),
        ".d-pending": pct(buckets.pending)
      };
      Object.keys(segs).forEach(function (sel) {
        var s = bar.querySelector(sel);
        if (s) s.style.width = segs[sel] + "%";
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

  // ── Filter chip counts (.fbtn .n × 5) ──
  function renderFilterCounts(rows) {
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

  // ── Page-header sub-text ──
  function renderPageHeaderSub(rows) {
    var sub = document.querySelector(".page-header .sub");
    if (!sub) return;
    sub.innerHTML = 'Every solicitation FARaudit has scored for you — <b>'
      + rows.length + ' record' + (rows.length === 1 ? '' : 's') + '</b>, newest first.';
  }

  // ── Empty state when zero audits ──
  function renderEmptyState() {
    var body = document.getElementById("ledgerBody");
    if (body) {
      body.innerHTML = '<tr><td colspan="8" style="padding:36px 16px;text-align:center;color:var(--mute);font-size:13px">'
        + 'No audits yet — <a href="/audit" style="color:var(--blue-600);font-weight:600;text-decoration:none">run your first audit →</a>'
        + '</td></tr>';
    }
    var vc = document.getElementById("visCount");
    if (vc) vc.textContent = "0 of 0";
  }

  // ── Main wire ──
  async function wireDashboard() {
    var data;
    try {
      var r = await fetch("/api/audits?limit=200", { credentials: "include" });
      if (!r.ok) {
        console.warn("[dashboard-live] /api/audits returned", r.status, "— keeping static");
        return;
      }
      data = await r.json();
    } catch (e) {
      console.warn("[dashboard-live] fetch failed", e);
      return;
    }
    var audits = (data && data.audits) || [];
    var rows = audits.map(mapAuditToRow);

    // Update non-table surfaces regardless of row count
    renderPageHeaderSub(rows);
    renderKPIStrip(rows);
    renderDistribution(rows);
    renderFilterCounts(rows);

    if (rows.length === 0) {
      renderEmptyState();
      console.log("[dashboard-live] 0 audits · empty state rendered");
      return;
    }

    // Mutate window.AUDITS in place so inline sort/filter handlers keep working.
    if (window.AUDITS && Array.isArray(window.AUDITS)) {
      window.AUDITS.length = 0;
      Array.prototype.push.apply(window.AUDITS, rows);
    } else {
      console.warn("[dashboard-live] window.AUDITS not exposed by inline JS");
    }

    // Re-run the design's render() (now reading live AUDITS).
    if (typeof window.__renderDashboard === "function") {
      try { window.__renderDashboard(); }
      catch (e) { console.error("[dashboard-live] __renderDashboard threw", e); }
    }

    console.log("[dashboard-live] rendered " + rows.length + " audits");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDashboard);
  } else {
    // Defer one tick so the design's inline render() (which also runs at
    // load) populates #ledgerBody first — our render then replaces it.
    setTimeout(wireDashboard, 0);
  }
})();
