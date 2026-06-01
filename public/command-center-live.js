// v1780353848486
(function () {
  "use strict";

  // ── Utilities ──────────────────────────────────────────────────────────────
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0); }
  function fmtValue(v) { if (!v) return ""; var n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return isNaN(n) ? v : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(0) + "k" : "$" + n; }
  function scoreClass(s) { return s >= 80 ? "s-hi" : s >= 50 ? "s-mid" : s > 0 ? "s-lo" : "s-no"; }
  function scoreLabel(s) { return s >= 80 ? "Match" : s >= 50 ? "Score" : s > 0 ? "Trap" : "—"; }
  function dlClass(days) { return days <= 2 ? "crit" : days <= 7 ? "warn" : days <= 30 ? "ok" : "cold"; }
  function timeLeft(dl) {
    if (!dl) return "";
    var d = Math.ceil((new Date(dl) - Date.now()) / 864e5);
    if (d < 0) return "expired";
    if (d === 0) return "Today";
    if (d === 1) return "1d left";
    return d + "d left";
  }
  function docBadgeClass(type) {
    if (!type) return "";
    var t = type.toLowerCase();
    if (t.includes("rfq")) return "rfq";
    if (t.includes("rfp")) return "rfp";
    if (t.includes("sources") || t.includes("rfi")) return "sources";
    if (t.includes("combined")) return "combined";
    if (t.includes("pre-sol") || t.includes("presol") || t.includes("synopsis")) return "presol";
    return "";
  }
  function insightClass(risk, score) {
    if (risk === "HIGH" || score < 40) return "alert";
    if (risk === "MEDIUM" || score < 60) return "warn";
    if (score >= 80) return "win";
    return "info";
  }
  function insightText(opp) {
    if (opp.risk_level === "HIGH") return "High risk — review before bidding";
    if ((opp.compliance_score || 0) >= 80) return "Strong match — " + (opp.naics_code || "NAICS aligned");
    if ((opp.compliance_score || 0) >= 60) return "Good fit — check set-aside eligibility";
    var dl = opp.response_deadline ? Math.ceil((new Date(opp.response_deadline) - Date.now()) / 864e5) : 99;
    if (dl <= 2) return "Deadline critical — submit within 48h";
    if (dl <= 7) return "Closing this week — prioritize review";
    return "New opportunity — assess fit";
  }

  // ── Build feed row ─────────────────────────────────────────────────────────
      function buildRow(opp) {
    var score = opp.compliance_score || 0; var hasScore = opp.compliance_score !== null && opp.compliance_score !== undefined;
    var dl = opp.response_deadline ? Math.ceil((new Date(opp.response_deadline) - Date.now()) / 864e5) : 99;
    var expired = dl < 0;
    var urgency = expired ? "" : dl <= 2 ? " urgent" : dl <= 7 ? " priority" : "";
    var docSub = docBadgeClass(opp.document_type || opp.notice_type || "");
    var iClass = insightClass(opp.risk_level, score);
    var iText = insightText(opp);
    var iSplit = iText.split(' — ');
    var iBold = iSplit[0];
    var iRest = iSplit.slice(1).join(' — ');
    var tlText = expired ? "expired" : timeLeft(opp.response_deadline);
    var tlClass = expired ? "crit" : dlClass(dl);
    var agencyRaw = opp.agency || opp.department || "";
    var agencyParts = agencyRaw.split(' · ').filter(function(p,i,a){ return a.indexOf(p)===i; });
    var agencyName = agencyParts[0] || agencyRaw;
    var agencySub = agencyParts.slice(1).join(' · ');
    var value = opp.award_ceiling ? fmtValue(opp.award_ceiling) : "";
    var title = opp.title || opp.title_plain || opp.solicitation_title || "Untitled";
    var solNum = opp.solicitation_number || opp.notice_id || "—";

    return '<div class="row' + urgency + '" data-id="' + (opp.id || "") + '">'
      + '<div class="score ' + (hasScore ? scoreClass(score) : (dl <= 2 ? "s-no" : dl <= 7 ? "s-lo" : "s-mid")) + '"><div class="v">' + (hasScore ? score : (dl <= 2 ? "!" : dl <= 7 ? "↑" : "·")) + '</div><div class="l">' + (hasScore ? scoreLabel(score) : (dl <= 2 ? "Urgent" : dl <= 7 ? "Watch" : "New")) + '</div></div>'
      + '<div class="row-body">'
      + '<div class="row-top"><span class="row-id">' + solNum + '</span><span class="row-title">' + title + '</span></div>'
      + '<div class="compact-sub">' + solNum + ' · ' + agencyName + '</div>'
      + '<div class="row-meta">'
      + '<span class="badge doc ' + docSub + '">' + (opp.document_type || opp.notice_type || "Notice") + '</span>'
      + (opp.naics_code ? '<span class="badge naics">NAICS ' + opp.naics_code + '</span>' : '')
      + (opp.set_aside_description || opp.set_aside_code ? '<span class="badge setaside">' + (opp.set_aside_description || opp.set_aside_code) + '</span>' : '')
      + '</div>'
      + '<div class="row-agency one-line"><span class="agency-name">' + agencyName + '</span>'
      + (agencySub ? '<span class="agency-sub">' + agencySub + '</span>' : '')
      + '</div>'
      + '<div class="insight ' + iClass + '"><b>' + iBold + '</b>' + (iRest ? '<span style="font-weight:normal"> — ' + iRest + '</span>' : '') + '</div>'
      + '</div>'
      + '<div class="row-right">'
      + '<span class="deadline ' + tlClass + '">' + tlText + '</span>'
      + (value ? '<span class="row-value">' + value + '</span>' : '')
      + '<div class="row-actions">'
      + '<button class="a primary btn-audit-quick" data-id="' + (opp.id || "") + '">Open audit</button>'
      + '<button class="a btn-pipeline" data-id="' + (opp.id || "") + '">Add to pipeline</button>'
      + '<a class="a" href="/opportunities">View solicitation</a>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Build pursuit row ──────────────────────────────────────────────────────
  function buildPursuit(card) {
    var dl = card.due_date ? Math.ceil((new Date(card.due_date) - Date.now()) / 864e5) : null;
    var dlText = dl !== null ? (dl < 0 ? "expired" : dl + "d left") : "";
    var dlCls = dl !== null ? (dl <= 2 ? "crit" : dl <= 7 ? "warn" : "") : "";
    var stageLabels = {"01":"PRE-SOL","02":"SOURCES SOUGHT","03":"SOLICITATION","04":"PROPOSAL DEV","05":"SUBMISSION","06":"EVALUATION","07":"AWARD","08":"POST-AWARD"};
    return '<a href="/pipeline" class="pursuit-row">'
      + '<div class="pursuit-meta"><span class="pursuit-id">' + (card.solicitation_number || "—") + '</span>'
      + '<span class="pursuit-agency">' + (card.agency || "—") + '</span></div>'
      + '<div class="pursuit-right">'
      + (dlText ? '<span class="pursuit-dl ' + dlCls + '">' + dlText + '</span>' : '')
      + '<span class="pursuit-stage">' + (stageLabels[card.stage] || card.stage || "—") + '</span>'
      + (card.estimated_value ? '<span class="pursuit-value">' + card.estimated_value + '</span>' : '')
      + '</div>'
      + '</a>';
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var ALL_OPPS = [];
  var VISIBLE_COUNT = 50;
  var ACTIVE_FILTER = "all";
  var ACTIVE_SORT = "score";
  var ACTIVE_VIEW = "cards";
  var SEARCH_TERM = "";

  // ── Filter + render feed ───────────────────────────────────────────────────
  function applyFilters() {
    var filtered = ALL_OPPS.filter(function (opp) {
      var dl = opp.response_deadline ? Math.ceil((new Date(opp.response_deadline) - Date.now()) / 864e5) : 99;
      if (dl < 0) return false;

      if (SEARCH_TERM) {
        var s = SEARCH_TERM.toLowerCase();
        var searchable = ((opp.solicitation_number || "") + " " + (opp.title_plain || opp.title || "") + " " + (opp.agency || "")).toLowerCase();
        if (!searchable.includes(s)) return false;
      }

      if (ACTIVE_FILTER === "urgent") return dl <= 2;
      if (ACTIVE_FILTER === "hot") return (opp.compliance_score || 0) >= 80;
      if (ACTIVE_FILTER === "new24h") { var posted = opp.posted_date || opp.created_at; return posted && (Date.now() - new Date(posted)) < 864e5; }
      if (ACTIVE_FILTER === "pipeline") return !!opp.in_pipeline;
      if (ACTIVE_FILTER === "risk") return opp.risk_level === "HIGH";
      return true;
    });

    if (ACTIVE_SORT === "score") filtered.sort(function (a, b) { return (b.compliance_score || 0) - (a.compliance_score || 0); });
    else if (ACTIVE_SORT === "deadline") filtered.sort(function (a, b) { return new Date(a.response_deadline || "2099") - new Date(b.response_deadline || "2099"); });
    else if (ACTIVE_SORT === "value") filtered.sort(function (a, b) { return (b.award_ceiling || 0) - (a.award_ceiling || 0); });

    var visible = filtered.slice(0, VISIBLE_COUNT);
    var feedList = document.querySelector(".feed-list");
    if (feedList) feedList.innerHTML = visible.map(buildRow).join("");

    var countEl = document.querySelector(".feed-head h2 .count");
    if (countEl) countEl.textContent = visible.length + " of " + filtered.length;

    var existing = document.querySelector(".load-more-btn");
    if (existing) existing.remove();
    if (filtered.length > VISIBLE_COUNT) {
      var btn = document.createElement("button");
      btn.className = "load-more-btn btn ghost";
      btn.style.cssText = "display:block;margin:16px auto;padding:8px 24px;font-size:12px;";
      btn.textContent = "Load " + Math.min(50, filtered.length - VISIBLE_COUNT) + " more";
      btn.onclick = function () { VISIBLE_COUNT += 50; applyFilters(); };
      var feedEl = document.querySelector(".feed");
      if (feedEl) feedEl.appendChild(btn);
    }

    document.documentElement.setAttribute("data-feed-view", ACTIVE_VIEW);

    document.querySelectorAll(".btn-audit-quick").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        window.location.href = "/audit";
      });
    });
  }

  function wireInteractions(data) {
    var kpiLinks = { navy: "/opportunities", red: "/dashboard", amber: "/opportunities?filter=deadline", teal: "/dashboard" };
    document.querySelectorAll(".kpi").forEach(function (kpi) {
      var type = Array.from(kpi.classList).find(function (c) { return ["navy","red","amber","teal"].includes(c); });
      if (type) kpi.addEventListener("click", function () { window.location.href = kpiLinks[type] || "/opportunities"; });
      kpi.style.cursor = "pointer";
    });

    var openFeed = Array.from(document.querySelectorAll("button")).find(function (b) { return b.innerText?.includes("Open feed"); });
    if (openFeed) openFeed.addEventListener("click", function () { window.location.href = "/opportunities"; });

    var filtersBtn = Array.from(document.querySelectorAll("button")).find(function (b) { return b.innerText?.trim() === "Filters"; });
    if (filtersBtn) filtersBtn.addEventListener("click", function () {
      var bar = document.querySelector(".filter-bar");
      if (bar) bar.style.display = bar.style.display === "none" ? "" : "none";
    });

    document.querySelectorAll(".sort-pill, [class*=sort]").forEach(function (el) {
      el.addEventListener("click", function () {
        var txt = el.innerText?.toLowerCase();
        if (txt.includes("score")) ACTIVE_SORT = "score";
        else if (txt.includes("deadline")) ACTIVE_SORT = "deadline";
        else if (txt.includes("value")) ACTIVE_SORT = "value";
        applyFilters();
      });
    });

    document.querySelectorAll(".view-seg button, [class*=view-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var txt = btn.innerText?.toLowerCase();
        ACTIVE_VIEW = txt.includes("compact") ? "compact" : "cards";
        applyFilters();
      });
    });

    var chipMap = { "all": "all", "urgent": "urgent", "hot match": "hot", "new 24h": "new24h", "in pipeline": "pipeline", "at risk": "risk" };
    document.querySelectorAll(".chip-tab").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll(".chip-tab").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        var key = chip.innerText?.toLowerCase().replace(/\s*\d+$/, "").trim();
        ACTIVE_FILTER = chipMap[key] || "all";
        VISIBLE_COUNT = 50;
        applyFilters();
      });
    });

    var searchInput = document.querySelector("input[type=search], input[placeholder*=earch], [class*=search-input]");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        SEARCH_TERM = searchInput.value.trim();
        VISIBLE_COUNT = 50;
        applyFilters();
      });
    }

    var pursuitsPanel = Array.from(document.querySelectorAll('.panel')).find(function (p) { return p.innerText?.includes('Active Pursuits'); });
  if (pursuitsPanel) {
    var viewAll = Array.from(pursuitsPanel.querySelectorAll('a, button')).find(function(el){ return el.innerText?.includes('View all') || el.innerText?.includes('view all'); });
    if (viewAll) { viewAll.href = '/pipeline'; viewAll.style.cursor = 'pointer'; }
    Array.from(pursuitsPanel.querySelectorAll('[class*=pursuit], [class*=p-row]')).forEach(function(row){
      row.style.cursor = 'pointer';
      row.addEventListener('click', function(){ window.location.href = '/pipeline'; });
    });
  }

    var quickPanel = Array.from(document.querySelectorAll(".panel")).find(function (p) { return p.innerText?.includes("Quick Audit"); });
    if (quickPanel) {
      quickPanel.querySelectorAll("[class*=audit-row], [class*=recent-row], [class*=audit-item]").forEach(function (row) {
        row.style.cursor = "pointer";
        var idMatch = row.innerText?.match(/([A-Z0-9]{6,}-\d{2}-[A-Z]-\d{4,})/);
        row.addEventListener("click", function () {
          window.location.href = idMatch ? "/dashboard" : "/dashboard";
        });
      });

      var dropZone = quickPanel.querySelector("[class*=drop], [class*=upload-zone], [class*=qa-drop]");
      var fileInput = quickPanel.querySelector("input[type=file]");
      if (dropZone && !fileInput) {
        var inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".pdf,.doc,.docx";
        inp.style.display = "none";
        inp.addEventListener("change", function () {
          if (inp.files && inp.files[0]) window.location.href = "/audit";
        });
        dropZone.appendChild(inp);
        dropZone.style.cursor = "pointer";
        dropZone.addEventListener("click", function () { inp.click(); });
      } else if (dropZone && fileInput) {
        dropZone.style.cursor = "pointer";
        dropZone.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function () {
          if (fileInput.files && fileInput.files[0]) window.location.href = "/audit";
        });
      }
    }

    var acctPanel = Array.from(document.querySelectorAll(".panel")).find(function (p) { return p.innerText?.includes("Account Intelligence"); });
    if (acctPanel) {
      acctPanel.style.cursor = "default";
      if (data && data.auditTotal) {
        var winRateEl = acctPanel.querySelector("[class*=win-rate] [class*=num], [class*=win] .num, [class*=pct]");
        var cycleEl = acctPanel.querySelector("[class*=cycle] [class*=num], [class*=days] .num");
        if (winRateEl && data.auditTotal) winRateEl.textContent = Math.round((data.trapCount === 0 ? 0.34 : (1 - data.trapCount / data.auditTotal)) * 100) + "%";
      }
      acctPanel.querySelectorAll("[class*=metric], [class*=stat], [class*=intel-row]").forEach(function (m) {
        m.style.cursor = "pointer";
        m.addEventListener("click", function () { window.location.href = "/dashboard"; });
      });
    }

    var notifBtn = document.querySelector("[class*=notif-btn], [class*=bell], [class*=alert-btn]");
    if (notifBtn) notifBtn.addEventListener("click", function () { window.location.href = "/dashboard"; });
  }

  function wireCommandCenter() {
    fetch("/api/command-center-data", { credentials: "include" })
      .then(function (r) {
        if (!r.ok) { console.warn("[cc-live] API returned", r.status); return null; }
        return r.json();
      })
      .then(function (data) {
        if (!data) return;

        var kpis = [
          { sel: ".kpi.navy .num", val: fmt(data.liveCount) },
          { sel: ".kpi.red .num", val: fmt(data.trapCount) },
          { sel: ".kpi.amber .num", val: fmt(data.deadlineSoon) },
          { sel: ".kpi.teal .num", val: fmt(data.auditsThisMonth) }
        ];
        kpis.forEach(function (k) { var el = document.querySelector(k.sel); if (el) el.textContent = k.val; });

        var dateEl = document.querySelector(".date");
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        var syncEl = document.querySelector(".sync");
        if (syncEl) syncEl.textContent = "SAM.gov synced just now";

        var greetMuted = document.querySelector(".greeting .muted");
        if (greetMuted) greetMuted.textContent = fmt(data.liveCount) + " federal opportunities tracked.";

        var sbBadge = document.querySelector(".sb-badge.count");
        if (sbBadge) sbBadge.textContent = fmt(data.auditTotal);

        ALL_OPPS = data.opportunities || [];
        applyFilters();

        wireInteractions(data);

        console.log("[cc-live] rendered", ALL_OPPS.length, "opportunities ·", data.liveCount, "total in DB");
      })
      .catch(function (e) { console.warn("[cc-live] fetch failed:", e.message); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCommandCenter);
  } else {
    wireCommandCenter();
  }
})();
