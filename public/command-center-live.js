(function () {
  "use strict";

  function scoreClass(s) {
    return s >= 80 ? "s-hi" : s >= 50 ? "s-mid" : "s-lo";
  }
  function urgencyClass(deadline, riskLevel) {
    if (riskLevel === "HIGH") return "row urgent";
    if (!deadline) return "row";
    const h = (new Date(deadline) - Date.now()) / 36e5;
    return h < 48 ? "row urgent" : h < 168 ? "row mid" : "row";
  }
  function timeLeft(deadline) {
    if (!deadline) return "";
    const h = Math.round((new Date(deadline) - Date.now()) / 36e5);
    if (h < 0) return "expired";
    if (h < 24) return h + "h left";
    return Math.round(h / 24) + "d left";
  }
  function fmt(n) {
    return n != null ? Number(n).toLocaleString() : "--";
  }
  function fmtValue(v) {
    if (!v) return "";
    const m = v / 1e6;
    return m >= 1 ? "$" + m.toFixed(1) + "M" : "$" + (v / 1e3).toFixed(0) + "K";
  }

  function buildRow(opp) {
    const score  = opp.compliance_score ?? 0;
    const rowCls = urgencyClass(opp.response_deadline, opp.risk_level);
    const dlCls  = rowCls.includes("urgent") ? "crit" : "warn";
    const id     = opp.solicitation_number ?? opp.notice_id ?? "";
    const naics  = opp.naics_code ? `<span class="badge naics">NAICS ${opp.naics_code}</span>` : "";
    const sa     = opp.set_aside  ? `<span class="badge setaside">${opp.set_aside}</span>`      : "";
    const insight = opp.recommendation
      ? `<div class="insight win">${opp.recommendation.slice(0, 140)}</div>` : "";

    return `
      <div class="${rowCls}">
        <div class="score ${scoreClass(score)}">
          <div class="v">${score || "--"}</div>
          <div class="l">Score</div>
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="row-id">${id}</span>
            <span class="row-title">${(opp.title || "Untitled").slice(0, 80)}</span>
          </div>
          <div class="compact-sub">${id} · ${opp.agency || ""}</div>
          <div class="row-meta">
            <span class="badge doc">${opp.document_type || "RFQ"}</span>
            ${naics}${sa}
          </div>
          <div class="row-agency one-line">
            <span class="agency-name">${opp.agency || ""}</span>
          </div>
          ${insight}
        </div>
        <div class="row-right">
          <span class="deadline ${dlCls}">${timeLeft(opp.response_deadline)}</span>
          <span class="row-value">${fmtValue(opp.award_ceiling)}</span>
        </div>
      </div>`;
  }

  async function wireCommandCenter() {
    let data;
    try {
      const res = await fetch("/api/command-center-data", { credentials: "include" });
      if (!res.ok) {
        console.warn("[cc-live] API returned", res.status, "— keeping sample data");
        return;
      }
      data = await res.json();
    } catch (e) {
      console.warn("[cc-live] fetch failed — keeping sample data", e);
      return;
    }

    const kpis = document.querySelectorAll(".kpi");
    kpis.forEach(function (kpi) {
      const num = kpi.querySelector(".num");
      if (!num) return;
      if (kpi.classList.contains("navy")  && data.liveCount        != null) num.textContent = fmt(data.liveCount);
      if (kpi.classList.contains("red")   && data.trapCount        != null) num.textContent = fmt(data.trapCount);
      if (kpi.classList.contains("amber") && data.deadlineSoon     != null) num.textContent = fmt(data.deadlineSoon);
      if (kpi.classList.contains("teal")  && data.auditsThisMonth  != null) num.textContent = fmt(data.auditsThisMonth);
    });

    const dateEl = document.querySelector(".date");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric"
    });

    const syncEl = document.querySelector(".sync");
    if (syncEl) syncEl.textContent = "SAM.gov synced just now";

    const greetMuted = document.querySelector(".greeting .muted");
    if (greetMuted && data.liveCount != null)
      greetMuted.textContent = fmt(data.liveCount) + " federal opportunities tracked.";

    const sbBadges = document.querySelectorAll(".sb-badge.count");
    if (sbBadges[0] && data.auditTotal != null)
      sbBadges[0].textContent = String(data.auditTotal);

    if (!data.opportunities || !data.opportunities.length) return;
    const feedList = document.querySelector(".feed-list");
    if (!feedList) return;
    feedList.innerHTML = data.opportunities.map(buildRow).join("");

    const feedCount = document.querySelector(".feed-head h2 .count");
    if (feedCount) feedCount.textContent = data.opportunities.length + " of " + fmt(data.liveCount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCommandCenter);
  } else {
    wireCommandCenter();
  }
})();
