(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════
  // Intelligence Brief live wiring (Phases 1-3, 2026-06-02).
  // Targets the new Brief DOM emitted by command-center-design.html:
  //   .brief-head + .since · .pulse-bar · .sec-actnow .act-card ×3 ·
  //   .sec-moving .move-row ×8 · .qa-recent .qa-item · .view-all ·
  //   .qa-drop · .search · .sb-signout · .icon-btn[title=Notifications]
  // All emitted class names verified verbatim against the design markup.
  // ═══════════════════════════════════════════════════════

  // ── Format helpers ──
  function scoreClass(s) {
    return s >= 80 ? "s-hi" : s >= 50 ? "s-md" : s > 0 ? "s-lo" : "s-no";
  }
  function scoreLabel(s) {
    return s >= 80 ? "Match" : s >= 50 ? "Score" : s > 0 ? "Trap" : "—";
  }
  function todoUrgencyTier(days) {
    if (days == null) return "u-cold";
    if (days <= 2)   return "u-crit";
    if (days <= 7)   return "u-warn";
    return "u-cold";
  }
  function todoTipText(days) {
    if (days == null || days < 0) return 'Pending audit — <b>queue this</b> for review';
    if (days === 0) return 'Audit this <b>now</b> — closes <b>today</b>';
    if (days === 1) return 'Audit this <b>now</b> — deadline in <b>1 day</b>';
    return 'Audit this <b>now</b> — deadline in <b>' + days + ' days</b>';
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
  function hoursUntil(dl) {
    if (!dl) return null;
    return Math.ceil((new Date(dl) - Date.now()) / 36e5);
  }

  // ── Brief-surface specific helpers ──
  // Returns { num, lbl, isCrit } for the .ac-deadline element.
  function acDeadlineDisplay(opp) {
    var dl = opp.response_deadline;
    if (!dl) return { num: "—", lbl: "no deadline", isCrit: false };
    var days = daysUntil(dl);
    var hours = hoursUntil(dl);
    if (days != null && days < 0) return { num: "expired", lbl: "", isCrit: true };
    if (hours != null && hours <= 24) return { num: Math.max(1, hours) + "h", lbl: "to deadline", isCrit: true };
    if (days != null && days <= 2)    return { num: days + "d", lbl: "to deadline", isCrit: true };
    return { num: days + "d", lbl: "to deadline", isCrit: false };
  }
  // Pick which variant of .act-card to use for an opp.
  function actCardVariant(opp) {
    var days = daysUntil(opp.response_deadline);
    var rec = (opp.recommendation || "").toLowerCase();
    if (opp.bid_no_bid === "no-bid" || rec.indexOf("disqualif") !== -1) return "alert";
    if (days != null && days >= 0 && days <= 2) return "crit";
    if ((opp.compliance_score || 0) >= 80) return "win";
    if (opp.compliance_score == null) return "crit"; // un-audited urgent
    return "win";
  }
  // CTA copy per act-card variant.
  function nbaButtonFor(opp, variant) {
    if (variant === "alert") return { text: "Review P0 trap", danger: true };
    if (opp.compliance_score == null) return { text: "Run audit", danger: false };
    return { text: "Open audit", danger: false };
  }
  function nbaWhyFor(opp, variant) {
    if (variant === "alert") return "confirm no-bid or find a qualified prime";
    if (opp.compliance_score == null) return "audit now to decide bid / no-bid in time";
    if (variant === "crit") return "final review and submit";
    return "review the audit and decide next step";
  }
  // Pick mv-tag variant for a move-row.
  function moveTagFor(opp) {
    var days = daysUntil(opp.response_deadline);
    var posted = opp.posted_date || opp.created_at;
    if (posted && (Date.now() - new Date(posted).getTime()) < 864e5) {
      return { cls: "new", txt: "New 24h" };
    }
    if (opp.in_pipeline) return { cls: "pipe", txt: "In pipeline" };
    if (days != null && days >= 0 && days <= 7) return { cls: "qa", txt: "Q&A closes" };
    return { cls: "", txt: "Watching" };
  }

  // ── Markup builders ──
  // Score chip — same shape as the static design rows. Audited variant uses
  // .score.s-hi/.s-md/.s-lo/.s-no with .v + .l; un-audited uses .score.todo
  // with <span class="vrow"><svg class="bolt">...</svg><span class="v">…</span></span>
  // + <span class="l">Audit Now</span> + <span class="tip">…</span>
  // (exactly mirrors design ROW 2 act-card structure).
  function buildScoreChip(opp) {
    var hasScore = opp.compliance_score != null;
    var days = daysUntil(opp.response_deadline);
    if (hasScore) {
      var s = opp.compliance_score;
      return '<div class="score ' + scoreClass(s) + '"><div class="v">' + s + '</div><div class="l">' + scoreLabel(s) + '</div></div>';
    }
    var uTier = todoUrgencyTier(days);
    var daysTxt = (days != null && days >= 0) ? (days + "d") : "—";
    return '<div class="score todo ' + uTier + '">'
      + '<span class="vrow">'
      + '<svg class="bolt" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg>'
      + '<span class="v">' + daysTxt + '</span>'
      + '</span>'
      + '<span class="l">Audit Now</span>'
      + '<span class="tip">' + todoTipText(days) + '</span>'
      + '</div>';
  }

  function buildActCard(opp) {
    var variant = actCardVariant(opp);
    var dl = acDeadlineDisplay(opp);
    var id = opp.solicitation_number || opp.notice_id || "";
    var agency = opp.agency || "";
    var sub = opp.incumbent_name || "";
    var title = (opp.title || opp.title_plain || "Untitled").trim();
    var subParts = [id, agency, sub].filter(Boolean);
    var subLine = subParts.join(" · ");
    var naics = opp.naics_code ? '<span class="badge naics">NAICS ' + opp.naics_code + '</span>' : "";
    var saCls = setasideBadgeClass(opp.set_aside);
    var sa = saCls ? '<span class="' + saCls + '">' + opp.set_aside + '</span>' : "";
    var docCls = docBadgeClass(opp.document_type);
    var docTxt = opp.document_type || "RFP";
    var value = opp.award_ceiling ? '<span class="ac-value">' + fmtValue(opp.award_ceiling) + '</span>' : "";
    var insightHtml;
    if (opp.recommendation) {
      var rec = opp.recommendation;
      var dot = rec.indexOf(".");
      var lead = dot > 0 ? rec.slice(0, dot + 1) : rec.slice(0, 100);
      var rest = dot > 0 ? rec.slice(dot + 1, dot + 280).trim() : "";
      insightHtml = '<div class="insight ' + insightVariant(opp) + '"><b>' + lead + '</b>' + (rest ? " " + rest : "") + '</div>';
    } else {
      insightHtml = '<div class="insight info"><b>Not yet audited.</b> Run the three-call audit to get your match score, surface compliance traps, and confirm CLIN structure.</div>';
    }
    var nba = nbaButtonFor(opp, variant);

    return '<article class="act-card ' + variant + '" data-opp-id="' + (opp.id || "") + '" data-sol="' + id + '">'
      + buildScoreChip(opp)
      + '<div class="ac-body">'
      +   '<div class="ac-top">'
      +     '<div class="ac-titles">'
      +       '<div class="ac-title">' + title.slice(0, 100) + '</div>'
      +       '<div class="ac-sub">' + subLine + '</div>'
      +     '</div>'
      +     '<div class="ac-deadline' + (dl.isCrit ? ' crit' : '') + '">'
      +       '<span class="acd-num">' + dl.num + '</span>'
      +       '<span class="acd-lbl">' + dl.lbl + '</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="ac-meta">'
      +     '<span class="' + docCls + '">' + docTxt + '</span>'
      +     naics + sa + value
      +   '</div>'
      +   insightHtml
      +   '<div class="ac-actions">'
      +     '<button class="nba' + (nba.danger ? " danger" : "") + '">' + nba.text + ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>'
      +     '<span class="nba-why"><b>Next:</b> ' + nbaWhyFor(opp, variant) + '</span>'
      +     '<button class="ac-more" aria-label="More actions">⋯</button>'
      +   '</div>'
      + '</div>'
      + '</article>';
  }

  function buildMoveRow(opp) {
    var days = daysUntil(opp.response_deadline);
    var hasScore = opp.compliance_score != null;
    var id = opp.solicitation_number || opp.notice_id || "";
    var agency = opp.agency || "";
    var sub = opp.incumbent_name || "";
    var title = (opp.title || opp.title_plain || "Untitled").trim();
    var subParts = [id, agency, sub, opp.award_ceiling ? fmtValue(opp.award_ceiling) : ""].filter(Boolean);
    var subLine = subParts.join(" · ");

    var scoreMini;
    if (hasScore) {
      var s = opp.compliance_score;
      scoreMini = '<div class="score-mini ' + scoreClass(s) + '">' + s + '</div>';
    } else {
      var uTier = todoUrgencyTier(days);
      var daysTxt = (days != null && days >= 0) ? (days + "d") : "—";
      scoreMini = '<div class="score-mini todo ' + uTier + '">' + daysTxt + '</div>';
    }

    var tag = moveTagFor(opp);
    var dlTxt = (days != null && days >= 0) ? (days + "d") : "—";

    return '<div class="move-row" data-opp-id="' + (opp.id || "") + '" data-sol="' + id + '">'
      + scoreMini
      + '<div class="mv-body">'
      +   '<div class="mv-title">' + title.slice(0, 100) + '</div>'
      +   '<div class="mv-sub">' + subLine + '</div>'
      + '</div>'
      + '<span class="mv-tag' + (tag.cls ? " " + tag.cls : "") + '">' + tag.txt + '</span>'
      + '<span class="mv-dl">' + dlTxt + '</span>'
      + '</div>';
  }

  // ── Renderers ──
  function renderBriefHead(data) {
    // .bh-date — today + sync stamp
    var dateEl = document.querySelector(".bh-date");
    if (dateEl) {
      var today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      dateEl.textContent = today + " · SAM.gov synced just now";
    }
    // .brief-greeting — "Good morning, {firstName}." from API user identity
    var greetEl = document.querySelector(".brief-greeting");
    if (greetEl && data.user && data.user.firstName) {
      greetEl.textContent = "Good morning, " + data.user.firstName + ".";
    }
    // .since items × 4 — delta values from API; falls back to static design defaults
    var sinceItems = document.querySelectorAll(".since .since-item");
    if (sinceItems[0] && typeof data.newMatches24h === "number") {
      sinceItems[0].innerHTML = '<b>+' + data.newMatches24h + '</b> new matches';
    }
    if (sinceItems[1] && typeof data.newTraps === "number") {
      sinceItems[1].innerHTML = '<b>' + data.newTraps + '</b> new trap' + (data.newTraps === 1 ? "" : "s");
    }
    if (sinceItems[2] && typeof data.pursuitsAdvanced === "number") {
      sinceItems[2].innerHTML = '<b>' + data.pursuitsAdvanced + '</b> pursuit' + (data.pursuitsAdvanced === 1 ? "" : "s") + ' advanced this week';
    }
    if (sinceItems[3] && typeof data.qaWindowsClosing === "number") {
      sinceItems[3].innerHTML = '<b>' + data.qaWindowsClosing + '</b> Q&amp;A window' + (data.qaWindowsClosing === 1 ? "" : "s") + ' close today';
    }
  }

  // .user-chip in the topbar — initials + full name from session.
  function renderUserChip(data) {
    if (!data.user) return;
    var av = document.querySelector(".user-chip .av");
    if (av && data.user.initials) av.textContent = data.user.initials;
    var nm = document.querySelector(".user-chip .nm");
    if (nm && data.user.fullName) nm.textContent = data.user.fullName;
  }

  // Notification bell badge — count of urgent items needing attention today.
  function renderNotificationBadge(data) {
    var n = document.querySelector('.icon-btn[title="Notifications"] .nbadge');
    if (!n) return;
    var traps = typeof data.newTraps === "number" ? data.newTraps : 0;
    var qa = typeof data.qaWindowsClosing === "number" ? data.qaWindowsClosing : 0;
    var total = traps + qa;
    n.textContent = total > 0 ? String(total) : "0";
    n.style.display = total > 0 ? "" : "none";
  }

  // Sidebar nav badges — wire counts that map to API data. Selectors target
  // the specific .sb-icon[href=...] anchors in the new design's sidebar.
  function renderSidebarBadges(data) {
    function setBadge(href, selector, value) {
      var icon = document.querySelector('.sb-icon[href="' + href + '"]');
      if (!icon) return;
      var badge = icon.querySelector(selector);
      if (badge && value != null) badge.textContent = String(value);
    }
    // Past Audits (.sb-badge.count) — total completed audits
    setBadge("/dashboard", ".sb-badge.count", data.auditTotal);
    // Pipeline (.sb-badge.danger) — at-risk pipeline count
    setBadge("/pipeline", ".sb-badge.danger", data.pipelineAtRisk);
    // Defense Agencies (.sb-badge.count) — distinct agency count
    setBadge("/agencies", ".sb-badge.count", data.agencyCount);
  }

  function renderPulseBar(data) {
    var pulses = document.querySelectorAll(".pulse-bar .pulse");
    if (pulses.length === 0) return;
    // Cell order matches design: navy / red / amber / teal.
    // For .p-delta: writing empty string clears the misleading "+14"/"+33%"
    // statics until we have snapshot data to compute real day-over-day deltas.
    var values = [
      { num: data.liveCount,       delta: (typeof data.liveCountDelta === "number") ? (data.liveCountDelta >= 0 ? "+" + data.liveCountDelta : String(data.liveCountDelta)) : "" },
      { num: data.trapCount,       delta: null }, // keep static "today" qualifier
      { num: data.deadlineSoon,    delta: (typeof data.deadlineSoonNext48h === "number") ? (data.deadlineSoonNext48h + " in 48h") : "" },
      { num: data.auditsThisMonth, delta: "" }
    ];
    pulses.forEach(function (pulse, i) {
      if (i >= values.length) return;
      var num = pulse.querySelector(".p-num");
      var delta = pulse.querySelector(".p-delta");
      if (num && values[i].num != null) num.textContent = fmt(values[i].num);
      if (delta && values[i].delta != null) delta.textContent = values[i].delta;
    });
  }

  // ── Quick Audit panel (right rail) ──
  function buildQaItem(audit) {
    var docType = (audit.document_type || "PDF").toUpperCase();
    var icCls = docType.indexOf("DOCX") !== -1 || docType.indexOf("DOC") !== -1 ? "ic docx" : "ic pdf";
    var sol = audit.solicitation_number || audit.notice_id || "";
    var title = (audit.title || "Untitled").trim();
    var displayTitle = sol ? (sol + " — " + title.slice(0, 40)) : title.slice(0, 60);
    var ts = audit.completed_at || audit.created_at;
    var ago = "—";
    if (ts) {
      var diffMs = Date.now() - new Date(ts).getTime();
      if (diffMs < 60 * 60 * 1000) ago = Math.max(1, Math.round(diffMs / 60000)) + "m ago";
      else if (diffMs < 24 * 60 * 60 * 1000) ago = Math.round(diffMs / (60 * 60 * 1000)) + "h ago";
      else if (diffMs < 48 * 60 * 60 * 1000) ago = "Yesterday";
      else ago = Math.round(diffMs / (24 * 60 * 60 * 1000)) + "d ago";
    }
    var mt = ago;
    if (audit.bid_no_bid === "no-bid") mt += " · 1 disqualifier";
    var s = audit.compliance_score;
    var scCls = s == null ? "" : (s >= 80 ? "sc hi" : s >= 50 ? "sc md" : "sc lo");
    var scTxt = s == null ? "—" : String(s);
    return '<div class="qa-item" data-sol="' + sol + '">'
      + '<div class="' + icCls + '">' + (docType.indexOf("DOCX") !== -1 ? "DOCX" : "PDF") + '</div>'
      + '<div class="bd">'
      +   '<div class="ttl">' + displayTitle + '</div>'
      +   '<div class="mt">' + mt + '</div>'
      + '</div>'
      + '<span class="' + scCls + '">' + scTxt + '</span>'
      + '</div>';
  }
  function renderQuickAuditPanel(data) {
    // .badge-compl "94 ran this week" → auditsThisWeek count
    var compl = document.querySelector(".panel-head .badge-compl");
    if (compl && typeof data.auditsThisWeek === "number") {
      compl.textContent = data.auditsThisWeek + " ran this week";
    }
    // .qa-recent list — replace 4 hardcoded items with live recent audits
    var list = document.querySelector(".qa-recent");
    if (!list) return;
    var items = data.recentAudits4 || [];
    if (items.length === 0) return; // keep static items if API has no data
    // Preserve the "Recent audits" header div (first child) and rebuild items below.
    var header = list.querySelector("div");
    var headerHtml = header ? header.outerHTML : '<div style="font-size:10.5px;color:var(--mute);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 2px 2px">Recent audits</div>';
    list.innerHTML = headerHtml + items.map(buildQaItem).join("");
  }

  // ── Active Pursuits panel (right rail) ──
  function renderActivePursuits(data) {
    // .ps-mid → "Top N active" + "X in flight"
    var psMidLead = document.querySelector(".pursuits-summary .ps-mid .lead");
    var psMidSub = document.querySelector(".pursuits-summary .ps-mid .sub");
    var total = typeof data.pipelineTotal === "number" ? data.pipelineTotal : null;
    if (psMidLead && total != null) {
      psMidLead.textContent = "Top " + Math.min(6, total) + " active";
    }
    if (psMidSub && total != null) {
      psMidSub.textContent = total + " in flight";
    }
    // .ps-right → weighted $ + share
    var psRightLead = document.querySelector(".pursuits-summary .ps-right .lead");
    var psRightSub = document.querySelector(".pursuits-summary .ps-right .sub");
    if (psRightLead && typeof data.pipelineWeightedValue === "number" && data.pipelineWeightedValue > 0) {
      psRightLead.textContent = fmtValue(data.pipelineWeightedValue) + " weighted";
    }
    if (psRightSub && total != null && total > 0) {
      // Weighted-vs-total ratio is unknown without per-card weights; show "of pipeline"
      // with at-risk percent as the meaningful side-stat.
      var atRiskPct = typeof data.pipelineAtRisk === "number"
        ? Math.round((data.pipelineAtRisk / total) * 100)
        : 0;
      psRightSub.textContent = atRiskPct + "% at risk";
    }
    // Funnel cells .fseg.s0–s4 — bucket counts from pipelineFunnel
    var funnel = data.pipelineFunnel || {};
    ["s0", "s1", "s2", "s3", "s4"].forEach(function (key) {
      var seg = document.querySelector(".pursuits-summary .funnel .fseg." + key);
      if (seg && typeof funnel[key] === "number") {
        seg.textContent = String(funnel[key]);
      }
    });
  }

  function renderActNow(opps) {
    var sec = document.querySelector(".sec-actnow");
    if (!sec) return;
    // Categorize opportunities by variant, then pick one alert + one crit + one win.
    var byVariant = { alert: [], crit: [], win: [] };
    opps.forEach(function (opp) {
      var v = actCardVariant(opp);
      if (byVariant[v]) byVariant[v].push(opp);
    });
    var picks = [];
    if (byVariant.alert.length) picks.push(byVariant.alert[0]);
    if (byVariant.crit.length)  picks.push(byVariant.crit[0]);
    if (byVariant.win.length)   picks.push(byVariant.win[0]);
    // Fill to 3 with anything remaining (in given order).
    if (picks.length < 3) {
      for (var i = 0; i < opps.length && picks.length < 3; i++) {
        if (picks.indexOf(opps[i]) === -1) picks.push(opps[i]);
      }
    }
    // Update "N decisions need you today" meta.
    var meta = document.querySelector(".hd-actnow .bs-meta");
    if (meta) {
      var n = picks.length;
      meta.textContent = n + " decision" + (n === 1 ? "" : "s") + " need" + (n === 1 ? "s" : "") + " you today";
    }
    sec.innerHTML = picks.slice(0, 3).map(buildActCard).join("");
    return picks;
  }

  function renderMoving(opps, alreadyShown) {
    var list = document.querySelector(".sec-moving .move-list");
    if (!list) return;
    var shown = alreadyShown || [];
    // Pick the next 8 opps after the act-now picks (filter out duplicates by id).
    var movingOpps = [];
    for (var i = 0; i < opps.length && movingOpps.length < 8; i++) {
      if (shown.indexOf(opps[i]) !== -1) continue;
      movingOpps.push(opps[i]);
    }
    list.innerHTML = movingOpps.map(buildMoveRow).join("");
  }

  // ── Interaction wiring ──
  function wireSearch() {
    document.querySelectorAll(".search").forEach(function (sb) {
      if (sb.dataset.ccWired) return;
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
        input.placeholder = (placeholder.textContent || "").trim() || "Search…";
        input.style.cssText = "background:transparent;border:none;outline:none;color:inherit;font:inherit;flex:1;min-width:0;padding:0;margin:0;";
        placeholder.replaceWith(input);
        input.focus();
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
      // Native parent <form action="/api/auth/sign-out" method="post"> handles the
      // submit. Only wire if the form has been unwrapped (defensive fallback).
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

  function wireQaDrop() {
    document.querySelectorAll(".qa-drop").forEach(function (drop) {
      if (drop.dataset.ccWired) return;
      drop.dataset.ccWired = "1";
      // Static design has inline onclick="location.href='/audit'" — strip it so
      // our click handler runs the file picker dance instead.
      drop.onclick = null;
      drop.removeAttribute("onclick");
      drop.style.cursor = "pointer";
      drop.addEventListener("click", function () {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.docx,.doc";
        input.style.display = "none";
        input.addEventListener("change", function () { window.location.href = "/audit"; });
        document.body.appendChild(input);
        input.click();
        setTimeout(function () { if (input.parentNode) input.remove(); }, 120000);
      });
    });
  }

  function wireQaItems() {
    document.querySelectorAll(".qa-recent .qa-item").forEach(function (item) {
      if (item.dataset.ccWired) return;
      item.dataset.ccWired = "1";
      item.style.cursor = "pointer";
      item.addEventListener("click", function () {
        // .qa-recent .qa-item .ttl text starts with the sol number — extract it
        // for an audit-deeplink param. Falls back to plain /dashboard.
        var ttl = item.querySelector(".ttl");
        var txt = ttl ? (ttl.textContent || "") : "";
        var SOL_RE = /\b([A-Z0-9]{2,}-?[A-Z0-9]{2,}-[A-Z]-[A-Z0-9]{3,})\b/i;
        var m = txt.match(SOL_RE);
        window.location.href = (m && m[1]) ? ("/dashboard?audit=" + encodeURIComponent(m[1])) : "/dashboard";
      });
    });
  }

  function wireViewAll() {
    document.querySelectorAll(".view-all").forEach(function (btn) {
      if (btn.dataset.ccWired) return;
      btn.dataset.ccWired = "1";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", function () { window.location.href = "/pipeline"; });
    });
  }

  function wireActCards() {
    document.querySelectorAll(".sec-actnow .act-card").forEach(function (card) {
      if (card.dataset.ccWired) return;
      card.dataset.ccWired = "1";
      var oppId = card.getAttribute("data-opp-id") || "";
      var sol   = card.getAttribute("data-sol") || "";

      // Primary action button (.nba) — go to /audit or /audit/{id}.
      var nba = card.querySelector(".nba");
      if (nba) {
        nba.style.cursor = "pointer";
        nba.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = oppId ? ("/audit/" + oppId) : "/audit";
        });
      }
      // 3-dot menu → SAM.gov solicitation search (fall back to /opportunities).
      var more = card.querySelector(".ac-more");
      if (more) {
        more.style.cursor = "pointer";
        more.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (sol) {
            window.open("https://sam.gov/search/?keywords=" + encodeURIComponent(sol) + "&index=opp&page=1", "_blank", "noopener,noreferrer");
          } else {
            window.location.href = "/opportunities";
          }
        });
      }
    });
  }

  function wireMoveRows() {
    document.querySelectorAll(".sec-moving .move-row").forEach(function (row) {
      if (row.dataset.ccWired) return;
      row.dataset.ccWired = "1";
      row.style.cursor = "pointer";
      var sol = row.getAttribute("data-sol") || "";
      row.addEventListener("click", function () {
        if (sol) {
          window.open("https://sam.gov/search/?keywords=" + encodeURIComponent(sol) + "&index=opp&page=1", "_blank", "noopener,noreferrer");
        } else {
          window.location.href = "/opportunities";
        }
      });
    });
  }

  function wireInteractions() {
    wireSearch();
    wireNotificationBell();
    wireSignOut();
    wireQaDrop();
    wireQaItems();
    wireViewAll();
    // wireActCards / wireMoveRows are called from inside wireCommandCenter
    // after the .sec-actnow / .sec-moving innerHTML is replaced.
  }

  // ── Entry point ──
  async function wireCommandCenter() {
    var data;
    try {
      var res = await fetch("/api/command-center-data", { credentials: "include" });
      if (!res.ok) {
        console.warn("[cc-live] API returned", res.status, "— static design only");
        return;
      }
      data = await res.json();
    } catch (e) {
      console.warn("[cc-live] fetch failed", e);
      return;
    }

    try { wireInteractions(); }
    catch (e) { console.error("[cc-live] wireInteractions threw:", e); }

    var opps = data.opportunities || [];
    console.log("[cc-live] API ok · opportunities=" + opps.length + " · liveCount=" + data.liveCount);

    try {
      renderBriefHead(data);
      renderUserChip(data);
      renderNotificationBadge(data);
      renderSidebarBadges(data);
      renderPulseBar(data);
      var actNowPicks = renderActNow(opps);
      renderMoving(opps, actNowPicks);
      renderActivePursuits(data);
      renderQuickAuditPanel(data);
      wireActCards();
      wireMoveRows();
      // Re-wire .qa-recent .qa-item clicks since renderQuickAuditPanel may have
      // replaced the static items — wireQaItems is idempotent via dataset.ccWired.
      wireQaItems();
      console.log("[cc-live] rendered Brief surface · " + opps.length + " opps · user=" + (data.user && data.user.firstName || "?"));
    } catch (e) {
      console.error("[cc-live] render threw:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCommandCenter);
  } else {
    wireCommandCenter();
  }
})();
