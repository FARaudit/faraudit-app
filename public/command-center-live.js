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
      ? '<div class="insight ' + insightVariant(opp) + '">'
        + '<div class="ai-row">'
        + '<span class="ai-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg></span>'
        + '<span class="ai-label">AI INSIGHT</span>'
        + '</div>'
        + '<div class="ai-desc">' + opp.recommendation.slice(0, 220) + '</div>'
        + '</div>'
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

    // Newly-injected rows have no listeners — re-bind action buttons + row menu
    wireRowActions();
    wireRowMenu();

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

  // ── Static-row filter: hide/show .feed-list rows by class hints (used when
  // the live API has no scored rows and we're keeping the design's sample feed) ──
  function staticRowMatchesFilter(row, label) {
    if (!label || label === "all") return true;
    if (label === "urgent") return row.classList.contains("urgent");
    if (label === "hot match" || label === "hot") return !!row.querySelector(".score.s-hi");
    if (label === "at risk" || label === "risk") {
      return row.classList.contains("urgent")
        || !!row.querySelector(".score.s-no")
        || !!row.querySelector(".insight.alert")
        || !!row.querySelector(".insight.warn");
    }
    // "new 24h" and "in pipeline" have no truthy signal in static markup → show all
    return true;
  }
  function filterStaticRows(label) {
    var visible = 0, total = 0;
    document.querySelectorAll(".feed-list .row").forEach(function (row) {
      total++;
      var show = staticRowMatchesFilter(row, label);
      row.style.display = show ? "" : "none";
      if (show) visible++;
    });
    var countEl = document.querySelector(".feed-head h2 .count");
    if (countEl) countEl.textContent = visible + " of " + total;
  }

  function wireChips() {
    document.querySelectorAll(".chip-tab").forEach(function (chip) {
      if (chip.dataset.ccWired) return;
      chip.dataset.ccWired = "1";
      chip.style.cursor = "pointer";
      chip.addEventListener("click", function () {
        document.querySelectorAll(".chip-tab").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        var label = (chip.innerText || "").toLowerCase().replace(/\s*\d+\s*$/, "").trim();
        if (ALL_OPPS && ALL_OPPS.length) {
          // Live data mode — drive the existing applyFilters pipeline
          ACTIVE_FILTER = label || "all";
          VISIBLE_COUNT = 20;
          applyFilters();
        } else {
          // Static-design mode — show/hide existing DOM rows in place
          filterStaticRows(label || "all");
        }
      });
    });
  }

  function wireKpiClicks() {
    var routes = { navy: "/opportunities", red: "/dashboard", amber: "/opportunities", teal: "/dashboard" };
    document.querySelectorAll(".kpi").forEach(function (kpi) {
      if (kpi.dataset.ccWired) return;
      var tier = ["navy", "red", "amber", "teal"].find(function (t) { return kpi.classList.contains(t); });
      if (!tier) return;
      kpi.dataset.ccWired = "1";
      kpi.style.cursor = "pointer";
      kpi.addEventListener("click", function () { window.location.href = routes[tier]; });
    });
  }

  function wireRowActions() {
    document.querySelectorAll(".feed-list .row").forEach(function (row) {
      if (row.dataset.ccActionsWired) return;
      row.dataset.ccActionsWired = "1";
      var idEl = row.querySelector(".row-id");
      var solId = idEl ? (idEl.textContent || "").trim() : "";
      row.querySelectorAll(".row-actions .a").forEach(function (btn) {
        btn.style.cursor = "pointer";
        var label = (btn.textContent || "").trim().toLowerCase();
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (label.indexOf("open audit") !== -1) {
            var dataId = btn.getAttribute("data-id") || "";
            window.location.href = dataId ? "/audit/" + dataId : "/audit";
          } else if (label.indexOf("add to pipeline") !== -1) {
            window.location.href = "/pipeline";
          } else if (label.indexOf("view solicitation") !== -1) {
            if (solId) {
              window.open("https://sam.gov/search/?keywords=" + encodeURIComponent(solId) + "&index=opp&page=1", "_blank", "noopener,noreferrer");
            } else {
              window.location.href = "/opportunities";
            }
          }
        });
      });
    });
  }

  // Current sort mode (Score|Deadline|Posted|Value). Read by applyFilters
  // when rendering live data so the displayed order matches the sort label.
  var SORT_MODE = "Score";
  function sortOpps(arr) {
    var key = SORT_MODE;
    return arr.slice().sort(function (a, b) {
      if (key === "Score") {
        var sa = a.compliance_score, sb = b.compliance_score;
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;   // nulls last
        if (sb == null) return -1;
        return sb - sa;             // desc
      }
      if (key === "Deadline") {
        var da = a.response_deadline ? new Date(a.response_deadline).getTime() : NaN;
        var db = b.response_deadline ? new Date(b.response_deadline).getTime() : NaN;
        if (isNaN(da) && isNaN(db)) return 0;
        if (isNaN(da)) return 1;    // nulls last
        if (isNaN(db)) return -1;
        return da - db;             // asc (soonest first)
      }
      if (key === "Posted") {
        var pa = (a.posted_date || a.created_at) ? new Date(a.posted_date || a.created_at).getTime() : NaN;
        var pb = (b.posted_date || b.created_at) ? new Date(b.posted_date || b.created_at).getTime() : NaN;
        if (isNaN(pa) && isNaN(pb)) return 0;
        if (isNaN(pa)) return 1;
        if (isNaN(pb)) return -1;
        return pb - pa;             // desc (newest first)
      }
      if (key === "Value") {
        var va = a.award_ceiling, vb = b.award_ceiling;
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;             // desc
      }
      return 0;
    });
  }

  // Read sort keys from a static row's existing DOM content. Mirrors the
  // shape of sortOpps() but pulls from text nodes the design already
  // rendered (score, deadline, value). "Posted" has no DOM signal in the
  // static markup — falls back to original DOM order (cached on first sort).
  function readStaticRowSortKeys(row) {
    var vEl = row.querySelector(".score .v");
    var rawScore = vEl ? (vEl.textContent || "").trim() : "";
    var score = /^\d+$/.test(rawScore) ? parseInt(rawScore, 10) : NaN;

    var dlEl = row.querySelector(".deadline");
    var dlTxt = dlEl ? (dlEl.textContent || "").trim().toLowerCase() : "";
    var days;
    if (!dlTxt || dlTxt === "—") days = Infinity;
    else if (dlTxt.indexOf("expired") !== -1) days = Infinity; // expired → last on asc
    else if (dlTxt === "today") days = 0;
    else {
      var mD = dlTxt.match(/(\d+)\s*d/);
      var mH = dlTxt.match(/(\d+)\s*h/);
      if (mD)      days = parseInt(mD[1], 10);
      else if (mH) days = parseInt(mH[1], 10) / 24;
      else         days = Infinity;
    }

    var vvEl = row.querySelector(".row-value");
    var vTxt = vvEl ? (vvEl.textContent || "").trim() : "";
    var value = NaN;
    var mM = vTxt.match(/\$?([\d.]+)\s*M/i);
    var mK = vTxt.match(/\$?([\d.]+)\s*K/i);
    if (mM)      value = parseFloat(mM[1]) * 1e6;
    else if (mK) value = parseFloat(mK[1]) * 1e3;

    return { score: score, days: days, value: value };
  }

  function sortStaticRows() {
    var feedList = document.querySelector(".feed-list");
    if (!feedList) return;
    var rows = Array.prototype.slice.call(feedList.querySelectorAll(".row"));
    if (rows.length === 0) return;
    rows.forEach(function (row, i) {
      if (row.dataset.ccOrigIdx == null) row.dataset.ccOrigIdx = String(i);
    });
    var keyed = rows.map(function (row) {
      return { row: row, k: readStaticRowSortKeys(row), orig: parseInt(row.dataset.ccOrigIdx, 10) || 0 };
    });
    keyed.sort(function (a, b) {
      if (SORT_MODE === "Score") {
        var sa = a.k.score, sb = b.k.score;
        if (isNaN(sa) && isNaN(sb)) return a.orig - b.orig;
        if (isNaN(sa)) return 1;
        if (isNaN(sb)) return -1;
        return sb - sa;                   // desc
      }
      if (SORT_MODE === "Deadline") {
        return a.k.days - b.k.days;       // asc — soonest first; Infinity stays last
      }
      if (SORT_MODE === "Posted") {
        return a.orig - b.orig;           // no DOM signal — preserve original order
      }
      if (SORT_MODE === "Value") {
        var va = a.k.value, vb = b.k.value;
        if (isNaN(va) && isNaN(vb)) return a.orig - b.orig;
        if (isNaN(va)) return 1;
        if (isNaN(vb)) return -1;
        return vb - va;                   // desc
      }
      return 0;
    });
    // appendChild on an in-DOM element moves it. Iterate in sorted order →
    // each row gets pushed to the end → final DOM order matches keyed[].
    keyed.forEach(function (item) { feedList.appendChild(item.row); });
  }

  function wireSortAndView() {
    document.querySelectorAll(".sort-pill").forEach(function (sp) {
      if (sp.dataset.ccWired) return;
      sp.dataset.ccWired = "1";
      sp.style.cursor = "pointer";
      var modes = ["Score", "Deadline", "Posted", "Value"];
      sp.addEventListener("click", function () {
        var valEl = sp.querySelector(".val");
        if (!valEl) return;
        var cur = (valEl.textContent || "Score").trim();
        var next = modes[(modes.indexOf(cur) + 1) % modes.length] || "Score";
        valEl.textContent = next;
        SORT_MODE = next;
        if (ALL_OPPS && ALL_OPPS.length) {
          // Live-data path — sort the array + re-render
          ALL_OPPS = sortOpps(ALL_OPPS);
          VISIBLE_COUNT = 20;
          applyFilters();
        } else {
          // Static-feed path — reorder existing DOM rows in place
          sortStaticRows();
        }
      });
    });
    document.querySelectorAll('.view-seg button[data-value]').forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-value") || "cards";
        // CSS selector is [data-feed-view="compact"] .row — attribute selector
        // without an element prefix matches any ancestor. The design's tweaks
        // JS sets it on <html>; mirror that AND set on <body> as a hardening
        // measure so the CSS engages regardless of which ancestor the browser
        // resolves the selector against.
        document.documentElement.setAttribute("data-feed-view", v);
        if (document.body) document.body.setAttribute("data-feed-view", v);
        var parent = btn.parentElement;
        if (parent) {
          parent.querySelectorAll('button[data-value]').forEach(function (s) { s.removeAttribute("data-on"); });
        }
        btn.setAttribute("data-on", "true");
      });
    });
  }

  function wireViewAllPursuits() {
    document.querySelectorAll(".view-all").forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function () { window.location.href = "/pipeline"; });
    });
  }

  function wireRecentAudits() {
    var SOL_RE = /\b([A-Z0-9]{2,}-?[A-Z0-9]{2,}-[A-Z]-[A-Z0-9]{3,})\b/i;
    document.querySelectorAll(".qa-recent .qa-item").forEach(function (item) {
      if (item.dataset.ccWired) return;
      item.dataset.ccWired = "1";
      item.style.cursor = "pointer";
      item.addEventListener("click", function () {
        var ttl = item.querySelector(".ttl");
        var txt = ttl ? (ttl.textContent || "") : "";
        var m = txt.match(SOL_RE);
        if (m && m[1]) {
          window.location.href = "/dashboard?audit=" + encodeURIComponent(m[1]);
        } else {
          window.location.href = "/dashboard";
        }
      });
    });
  }

  function wireOpenFeed() {
    document.querySelectorAll(".btn").forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      if (btn.classList.contains("ghost")) return;
      var txt = (btn.textContent || "").trim().toLowerCase();
      if (txt.indexOf("open feed") !== 0) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function () { window.location.href = "/opportunities"; });
    });
  }

  function wireFiltersButton() {
    document.querySelectorAll(".btn.ghost").forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      var txt = (btn.textContent || "").trim().toLowerCase();
      if (txt !== "filters") return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function () {
        var fb = document.querySelector(".filter-bar");
        if (!fb) return;
        // Use computed style — fb.style.display is "" by default (CSS sets
        // display:flex via stylesheet, not inline), so the previous
        // inline-only check toggled in the wrong direction on first click.
        var current = window.getComputedStyle(fb).display;
        fb.style.display = (current === "none") ? "flex" : "none";
      });
    });
  }

  function wireFieldPills() {
    document.querySelectorAll(".field-pill").forEach(function (pill) {
      if (pill.dataset.ccWired) return;
      pill.dataset.ccWired = "1";
      pill.style.cursor = "pointer";
      pill.addEventListener("click", function (e) {
        // Clear-X icon: clear instead of toggle
        if (e.target && e.target.closest && e.target.closest(".fp-x")) {
          pill.classList.remove("cc-active");
          pill.style.outline = "";
          pill.style.outlineOffset = "";
          return;
        }
        // "Add filter" (+) pill → full filter UI on /opportunities
        if (pill.classList.contains("add")) {
          window.location.href = "/opportunities";
          return;
        }
        var on = !pill.classList.contains("cc-active");
        pill.classList.toggle("cc-active", on);
        pill.style.outline = on ? "2px solid #2563eb" : "";
        pill.style.outlineOffset = on ? "1px" : "";
      });
    });
  }

  function wireNotificationBell() {
    document.querySelectorAll('.icon-btn[title="Notifications"]').forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function () { window.location.href = "/dashboard"; });
    });
  }

  function wireSignOut() {
    document.querySelectorAll(".sb-signout").forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      // Native <form action="/api/auth/sign-out" method="post"> wraps it — let
      // the form submit work natively. We only wire here if there's NO parent
      // form (defensive: in case the form was unwrapped by a layout change).
      if (btn.closest('form[action="/api/auth/sign-out"]')) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
          .finally(function () { window.location.href = "/"; });
      });
    });
  }

  function filterRowsByQuery(q) {
    var visible = 0, total = 0;
    document.querySelectorAll(".feed-list .row").forEach(function (row) {
      total++;
      var hay = "";
      var rid = row.querySelector(".row-id");
      var rtitle = row.querySelector(".row-title");
      var ragency = row.querySelector(".agency-name");
      if (rid)     hay += " " + (rid.textContent || "");
      if (rtitle)  hay += " " + (rtitle.textContent || "");
      if (ragency) hay += " " + (ragency.textContent || "");
      hay = hay.toLowerCase();
      var show = !q || hay.indexOf(q) !== -1;
      row.style.display = show ? "" : "none";
      if (show) visible++;
    });
    var countEl = document.querySelector(".feed-head h2 .count");
    if (countEl) countEl.textContent = visible + " of " + total;
  }

  function wireSearch() {
    document.querySelectorAll(".search").forEach(function (sb) {
      if (sb.dataset.ccWired) return;
      sb.dataset.ccWired = "1";
      sb.style.cursor = "text";
      sb.addEventListener("click", function () {
        if (sb.querySelector(".cc-search-input")) return; // already converted
        var placeholder = null;
        sb.querySelectorAll("span").forEach(function (s) {
          if (!s.classList.contains("kbd") && placeholder === null) placeholder = s;
        });
        if (!placeholder) return;
        var input = document.createElement("input");
        input.type = "text";
        input.className = "cc-search-input";
        input.placeholder = (placeholder.textContent || "").trim() || "Search…";
        input.style.cssText = "background:transparent;border:none;outline:none;color:inherit;font:inherit;flex:1;min-width:0;padding:0;margin:0;";
        placeholder.replaceWith(input);
        input.focus();
        input.addEventListener("keyup", function () {
          filterRowsByQuery((input.value || "").trim().toLowerCase());
        });
      });
    });
  }

  function wireUploadZone() {
    document.querySelectorAll(".qa-drop").forEach(function (drop) {
      if (drop.dataset.ccWired) return;
      drop.dataset.ccWired = "1";
      // Strip inline onclick="location.href='/audit'" so we can intercept
      drop.onclick = null;
      drop.removeAttribute("onclick");
      drop.style.cursor = "pointer";
      drop.addEventListener("click", function () {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.docx,.doc";
        input.style.display = "none";
        input.addEventListener("change", function () {
          window.location.href = "/audit";
        });
        document.body.appendChild(input);
        input.click();
        // Cleanup if user cancels the picker (no change fired)
        setTimeout(function () { if (input.parentNode) input.remove(); }, 120000);
      });
    });
  }

  function wireAccountIntelMetrics() {
    document.querySelectorAll(".ai2 .m").forEach(function (m) {
      if (m.dataset.ccWired) return;
      m.dataset.ccWired = "1";
      m.style.cursor = "pointer";
      m.addEventListener("click", function () { window.location.href = "/dashboard"; });
    });
  }

  function wireRowMenu() {
    // .row-menu is injected by the design's own IIFE on page load (line ~3712)
    // for static rows. Live rows replaced by buildRow() won't have it — inject
    // one if missing, then bind navigation. Idempotent via dataset.ccWired.
    var MENU_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
    document.querySelectorAll(".feed-list .row").forEach(function (row) {
      var btn = row.querySelector(".row-menu");
      if (!btn) {
        btn = document.createElement("button");
        btn.className = "row-menu";
        btn.type = "button";
        btn.setAttribute("aria-label", "More options");
        btn.innerHTML = MENU_SVG;
        row.appendChild(btn);
      }
      if (btn.dataset.ccWired) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idEl = row.querySelector(".row-id");
        var solId = idEl ? (idEl.textContent || "").trim() : "";
        if (solId) {
          window.location.href = "/opportunities?focus=" + encodeURIComponent(solId);
        } else {
          window.location.href = "/opportunities";
        }
      });
    });
  }

  function wireInteractions() {
    wireKpiClicks();
    wireChips();
    wireRowActions();
    wireSortAndView();
    wireViewAllPursuits();
    wireRecentAudits();
    wireOpenFeed();
    wireFiltersButton();
    wireFieldPills();
    wireNotificationBell();
    wireSignOut();
    wireSearch();
    wireUploadZone();
    wireAccountIntelMetrics();
    wireRowMenu();
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

    // Wire ALL interactions unconditionally — every button/chip/tile must be
    // live regardless of whether we replace the feed or keep the static design.
    wireInteractions();

    var opps = data.opportunities || [];
    var hasScored = opps.some(function (o) { return o && o.compliance_score != null; });
    if (!hasScored) {
      // No AI verdict yet — leave the static design rows in place. Chips will
      // filter the static DOM rows via filterStaticRows() (wired in wireChips).
      console.log("[cc-live] no scored rows — keeping static feed (interactions wired)");
      return;
    }

    ALL_OPPS = sortOpps(opps);
    applyFilters(); // also re-wires row actions on the freshly-injected rows

    console.log("[cc-live] rendered", ALL_OPPS.length, "opportunities ·", data.liveCount, "total in DB");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCommandCenter);
  } else {
    wireCommandCenter();
  }
})();
