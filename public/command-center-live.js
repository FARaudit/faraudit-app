(function () {
  "use strict";

  // ── Tier + format helpers (every class verified in command-center-design.html) ──
  function scoreClass(s) {
    return s >= 80 ? "s-hi" : s >= 50 ? "s-md" : s > 0 ? "s-lo" : "s-no";
  }
  function scoreLabel(s) {
    return s >= 80 ? "Match" : s >= 50 ? "Score" : s > 0 ? "Trap" : "—";
  }
  function urgencyTier(days) {
    if (days == null) return "s-md";
    if (days <= 2) return "s-no";
    if (days <= 7) return "s-lo";
    return "s-md";
  }
  function docBadgeClass(docType) {
    if (!docType) return "badge doc";
    var d = String(docType).toLowerCase();
    if (d.indexOf("rfq") !== -1) return "badge doc rfq";
    if (d.indexOf("combined") !== -1 || d.indexOf("synopsis") !== -1) return "badge doc combined";
    return "badge doc";
  }
  function setasideBadgeClass(sa) {
    if (!sa) return null;
    var s = String(sa).toLowerCase();
    if (s.indexOf("full") !== -1 || s.indexOf("open") !== -1) return "badge setaside full";
    return "badge setaside";
  }
  function insightVariant(opp) {
    var rec = (opp.recommendation || "").toLowerCase();
    if (opp.bid_no_bid === "no-bid" || rec.indexOf("disqualif") !== -1 || rec.indexOf("no-bid") !== -1 || rec.indexOf("no bid") !== -1) {
      return "alert";
    }
    if (opp.risk_level === "HIGH" || rec.indexOf("warn") !== -1 || rec.indexOf("required") !== -1 || rec.indexOf("renew") !== -1 || rec.indexOf("expire") !== -1) {
      return "warn";
    }
    if ((opp.compliance_score || 0) >= 80 || rec.indexOf("strong fit") !== -1 || rec.indexOf("recommend bid") !== -1) {
      return "win";
    }
    return "info";
  }
  function urgencyClass(days, riskLevel) {
    if (riskLevel === "HIGH") return "row urgent";
    if (days == null) return "row";
    return days <= 2 ? "row urgent" : days <= 7 ? "row priority" : "row";
  }
  function deadlineTier(days) {
    if (days == null) return "cold";
    return days <= 2 ? "crit" : days <= 7 ? "warn" : days <= 30 ? "ok" : "cold";
  }
  function timeLeft(days) {
    if (days == null) return "";
    if (days < 0) return "expired";
    if (days === 0) return "Today";
    if (days === 1) return "1d left";
    return days + "d left";
  }
  function fmt(n) {
    return n != null ? Number(n).toLocaleString() : "--";
  }
  function fmtValue(v) {
    if (!v) return "";
    var m = v / 1e6;
    return m >= 1 ? "$" + m.toFixed(1) + "M" : "$" + (v / 1e3).toFixed(0) + "K";
  }
  function daysUntil(dl) {
    if (!dl) return null;
    return Math.ceil((new Date(dl) - Date.now()) / 864e5);
  }

  function buildRow(opp) {
    var hasScore = opp.compliance_score != null;
    var rawScore = opp.compliance_score || 0;
    var days = daysUntil(opp.response_deadline);
    var sClass = hasScore ? scoreClass(rawScore) : urgencyTier(days);
    var sValue = hasScore ? (rawScore || "--") : "—";
    var sLabel = hasScore ? scoreLabel(rawScore) : "Pending";
    var rowCls = urgencyClass(days, opp.risk_level);
    var dlCls  = deadlineTier(days);
    var id     = opp.solicitation_number || opp.notice_id || "";
    var agency = opp.agency || "";
    var title  = opp.title || opp.title_plain || "Untitled";
    var naics  = opp.naics_code ? '<span class="badge naics">NAICS ' + opp.naics_code + '</span>' : "";
    var saCls  = setasideBadgeClass(opp.set_aside);
    var sa     = saCls ? '<span class="' + saCls + '">' + opp.set_aside + '</span>' : "";
    var docCls = docBadgeClass(opp.document_type);
    var docTxt = opp.document_type || "RFQ";
    var value  = opp.award_ceiling ? '<span class="row-value">' + fmtValue(opp.award_ceiling) + '</span>' : "";
    var insight = opp.recommendation
      ? '<div class="insight ' + insightVariant(opp) + '"><b>' + opp.recommendation.slice(0, 140) + '</b></div>'
      : "";
    var agencySub = opp.incumbent_name ? '<span class="agency-sub">' + opp.incumbent_name + '</span>' : '<span class="agency-sub"></span>';

    return '<div class="' + rowCls + '">'
      + '<div class="score ' + sClass + '"><div class="v">' + sValue + '</div><div class="l">' + sLabel + '</div></div>'
      + '<div class="row-body">'
      + '<div class="row-top"><span class="row-id">' + id + '</span><span class="row-title">' + title.slice(0, 80) + '</span></div>'
      + '<div class="compact-sub">' + id + '</div>'
      + '<div class="row-meta">'
      + '<span class="' + docCls + '">' + docTxt + '</span>'
      + naics + sa
      + '</div>'
      + '<div class="row-agency one-line"><span class="agency-name">' + agency + '</span>' + agencySub + '</div>'
      + '</div>'
      + insight
      + '<div class="row-right">'
      + '<span class="deadline ' + dlCls + '">' + timeLeft(days) + '</span>'
      + value
      + '<div class="row-actions">'
      + '<button class="a primary btn-audit-quick" data-id="' + (opp.id || "") + '">Open audit</button>'
      + '<button class="a btn-pipeline" data-id="' + (opp.id || "") + '">Add to pipeline</button>'
      + '<a class="a" href="/opportunities">View solicitation</a>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── State for filter + pagination ──
  var ALL_OPPS = [];
  var VISIBLE_COUNT = 20;
  var ACTIVE_FILTER = "all";

  function applyFilters() {
    var filtered = ALL_OPPS.filter(function (opp) {
      var days = daysUntil(opp.response_deadline);

      if (ACTIVE_FILTER === "urgent") return days != null && days <= 2;
      if (ACTIVE_FILTER === "hot match") return (opp.compliance_score || 0) >= 80;
      if (ACTIVE_FILTER === "new 24h") {
        var posted = opp.posted_date || opp.created_at;
        return posted && (Date.now() - new Date(posted).getTime()) < 864e5;
      }
      if (ACTIVE_FILTER === "in pipeline") return !!opp.in_pipeline;
      if (ACTIVE_FILTER === "at risk") return opp.risk_level === "HIGH";
      return true;
    });

    var visible = filtered.slice(0, VISIBLE_COUNT);
    var feedList = document.querySelector(".feed-list");
    if (feedList) feedList.innerHTML = visible.map(buildRow).join("");

    var feedCount = document.querySelector(".feed-head h2 .count");
    if (feedCount) feedCount.textContent = visible.length + " of " + filtered.length;

    var existing = document.querySelector(".cc-load-more");
    if (existing) existing.remove();
    if (filtered.length > VISIBLE_COUNT) {
      var btn = document.createElement("button");
      btn.className = "btn ghost cc-load-more";
      btn.style.cssText = "display:block;margin:16px auto;padding:9px 22px;font-size:13px;";
      btn.textContent = "Load " + Math.min(20, filtered.length - VISIBLE_COUNT) + " more";
      btn.addEventListener("click", function () {
        VISIBLE_COUNT += 20;
        applyFilters();
      });
      if (feedList) feedList.appendChild(btn);
    }
  }

  function wireChipFilters() {
    document.querySelectorAll(".chip-tab").forEach(function (chip) {
      chip.style.cursor = "pointer";
      chip.addEventListener("click", function () {
        document.querySelectorAll(".chip-tab").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        var label = (chip.innerText || "").toLowerCase().replace(/\s*\d+\s*$/, "").trim();
        ACTIVE_FILTER = label || "all";
        VISIBLE_COUNT = 20;
        applyFilters();
      });
    });
  }

  function wireKpiClicks() {
    var routes = { navy: "/opportunities", red: "/dashboard", amber: "/opportunities", teal: "/dashboard" };
    document.querySelectorAll(".kpi").forEach(function (kpi) {
      var tier = ["navy", "red", "amber", "teal"].find(function (t) { return kpi.classList.contains(t); });
      if (!tier) return;
      kpi.style.cursor = "pointer";
      kpi.addEventListener("click", function () {
        window.location.href = routes[tier];
      });
    });
  }

  async function wireCommandCenter() {
    var data;
    try {
      var res = await fetch("/api/command-center-data", { credentials: "include" });
      if (!res.ok) {
        console.warn("[cc-live] API returned", res.status, "— keeping sample data");
        return;
      }
      data = await res.json();
    } catch (e) {
      console.warn("[cc-live] fetch failed — keeping sample data", e);
      return;
    }

    var kpis = document.querySelectorAll(".kpi");
    kpis.forEach(function (kpi) {
      var num = kpi.querySelector(".num");
      if (!num) return;
      if (kpi.classList.contains("navy")  && data.liveCount       != null) num.textContent = fmt(data.liveCount);
      if (kpi.classList.contains("red")   && data.trapCount       != null) num.textContent = fmt(data.trapCount);
      if (kpi.classList.contains("amber") && data.deadlineSoon    != null) num.textContent = fmt(data.deadlineSoon);
      if (kpi.classList.contains("teal")  && data.auditsThisMonth != null) num.textContent = fmt(data.auditsThisMonth);
    });

    var dateEl = document.querySelector(".date");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric"
    });
    var syncEl = document.querySelector(".sync");
    if (syncEl) syncEl.textContent = "SAM.gov synced just now";

    var greetMuted = document.querySelector(".greeting .muted");
    if (greetMuted && data.liveCount != null) {
      greetMuted.textContent = fmt(data.liveCount) + " federal opportunities tracked.";
    }

    var sbBadges = document.querySelectorAll(".sb-badge.count");
    if (sbBadges[0] && data.auditTotal != null) {
      sbBadges[0].textContent = String(data.auditTotal);
    }

    wireKpiClicks();
    wireChipFilters();

    ALL_OPPS = data.opportunities || [];
    applyFilters();

    console.log("[cc-live] rendered", ALL_OPPS.length, "opportunities ·", data.liveCount, "total in DB");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCommandCenter);
  } else {
    wireCommandCenter();
  }
})();
