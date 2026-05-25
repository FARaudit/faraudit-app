"use client";

/* ═══════════════════════════════════════════════════════════════
   FARaudit · Command Center — new brand standard
   Source of truth: Claude Design handoff bundle
     website-ui-ux-redesign/project/faraudit-command-center.html
   Layout, classes, and CSS variables all live in command-center.css
   (scoped under .fa-cc so it doesn't leak into the rest of the app).

   Mock-data placeholders are clearly tagged `MOCK_*` and listed in
   the implementation report — DO NOT promote any of those to live
   without wiring real data first.
   ═══════════════════════════════════════════════════════════════ */

import React, { useMemo, useState } from "react";
import type {
  HomeStats,
  OpportunityRow,
  AuditRow,
} from "@/lib/bd-os/queries";
import { useTheme } from "@/lib/theme";
import "./command-center.css";

/* ─── types ──────────────────────────────────────────── */
interface Props {
  stats: HomeStats;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
  userEmail: string;
}

type FeedFilter =
  | "all"
  | "urgent"
  | "hot"
  | "new24h"
  | "pipeline"
  | "risk";
type FeedView = "cards" | "compact";
type SortKey = "score" | "deadline" | "agency";

/* ─── MOCK PLACEHOLDERS ──────────────────────────────── */
/* Every value here is decorative copy that the design ships with.
   No real data source has been wired yet. Keep them obviously fake
   strings so they're easy to spot in the running UI.            */
const MOCK_KPI_DELTAS = {
  liveSolDelta: "+14 vs. yesterday", // navy hero — sam-ingest 24h delta
  trapsBriefs: "⚑ 2 unread briefs",
  deadlinesSub: "12 close in < 48h. 4 require teaming.",
  deadlines48h: "◐ 12 in < 48h",
  auditsSubDelta: "+6 vs. last month · 11 critical findings shipped.",
  auditsMoM: "▲ +33% MoM",
};
const MOCK_INGEST_TICKER = [
  { t: "2m", txt: "FA8730 · AF · C5ISR · matched" },
  { t: "9m", txt: "N00174 · Navy · IT svcs · matched" },
  { t: "21m", txt: "70Z023 · DHS · cyber · new" },
];
const MOCK_SYNC_LABEL = "SAM.gov synced 2m ago"; // sam-ingest cron timestamp not yet exposed
const MOCK_NOTIFICATION_COUNT = 7;
const MOCK_SIDEBAR_BADGES = {
  pastAudits: "15", // count placeholder until /api/audits/count
  pipeline: "3",
  agencies: "8",
};
const MOCK_PIPELINE_FUNNEL = {
  segments: [
    { label: "Capture", n: 5 },
    { label: "Drafting", n: 6 },
    { label: "Pricing", n: 4 },
    { label: "Review", n: 3 },
    { label: "Submit", n: 1 },
  ],
  weighted: "$55.9M weighted",
  ofPipeline: "59% of pipeline",
  topActive: "Top 5 active",
  inFlight: "19 in flight",
};
const MOCK_PIPELINE_METRICS = [
  { tone: "amber", lbl: "Closing this week", n: 4, dol: "$54.1M" },
  { tone: "green", lbl: "Hot pursuits", n: 3, dol: "$34.2M" },
  { tone: "red", lbl: "At risk", n: 2, dol: "$7.1M" },
] as const;
const MOCK_FREE_TIER = {
  label: "Free Tier · 13 sprint",
  pct: "62%",
  bar: 0.62,
  detail: "8 of 13 audits used · resets in 4d",
};
const MOCK_AVG_CYCLE_DAYS = 32; // no cycle-time data wired yet
const MOCK_AVG_CYCLE_DELTA = "▼ −4 days";
const MOCK_QUICK_AUDIT_RUN_WEEK = "94 ran this week";

/* ─── helpers ────────────────────────────────────────── */
type Urgency = "urgent" | "watch" | "new" | "";

function urgencyClass(o: OpportunityRow): Urgency {
  if ((o.compliance_score ?? 100) < 40) return "urgent";
  if ((o.compliance_score ?? 100) < 70) return "watch";
  if (o.response_deadline) {
    const days = Math.ceil(
      (new Date(o.response_deadline).getTime() - Date.now()) / 86400000
    );
    if (days <= 7) return "urgent";
    if (days <= 21) return "watch";
  }
  return "new";
}

function scoreClass(score: number | null): "s-hi" | "s-md" | "s-lo" | "s-no" {
  const s = score ?? 0;
  if (s >= 80) return "s-hi";
  if (s >= 60) return "s-md";
  if (s >= 40) return "s-lo";
  return "s-no";
}

function rowVariant(o: OpportunityRow): string {
  const u = urgencyClass(o);
  if (u === "urgent") return "row urgent";
  if (u === "watch") return "row priority";
  return "row";
}

function deadlineLabel(deadline?: string | null): string {
  if (!deadline) return "—";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.ceil(ms / 86400000);
  if (days === 1) return "1d left";
  return `${days}d left`;
}

function deadlineClass(
  deadline?: string | null
): "crit" | "warn" | "ok" | "cold" {
  if (!deadline) return "cold";
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86400000
  );
  if (days <= 3) return "crit";
  if (days <= 7) return "warn";
  if (days <= 14) return "ok";
  return "cold";
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1000)}K`;
  return `$${v}`;
}

function splitAgency(agency: string | null): {
  name: string;
  sub: string | null;
} {
  if (!agency) return { name: "—", sub: null };
  const parts = agency.split(/\s*[·•|/]\s*/);
  if (parts.length === 1) return { name: parts[0], sub: null };
  return { name: parts[0], sub: parts.slice(1).join(" · ") };
}

function docBadgeClass(doc: string | null): string {
  if (!doc) return "doc";
  const d = doc.toLowerCase();
  if (d.includes("rfq")) return "doc rfq";
  if (d.includes("combined")) return "doc combined";
  if (d.includes("source")) return "doc sources";
  if (d.includes("pre")) return "doc presol";
  return "doc";
}

function docLabel(doc: string | null, notice: string | null): string {
  if (doc && doc.trim().length > 0) return doc;
  if (notice && notice.trim().length > 0) return notice;
  return "RFP";
}

function setAsideLabel(s: string | null): {
  label: string;
  cls: string;
} {
  if (!s || s.toLowerCase() === "none" || s.toLowerCase().includes("full"))
    return { label: "Full & Open", cls: "setaside full" };
  return { label: s, cls: "setaside" };
}

function generateInsight(o: OpportunityRow): {
  variant: "win" | "info" | "warn" | "alert";
  lead: string;
  rest: string;
} {
  const u = urgencyClass(o);
  if (
    (o.compliance_score ?? 100) < 40 ||
    o.bid_no_bid === "no-bid" ||
    o.risk_level === "high"
  ) {
    return {
      variant: "alert",
      lead: "Disqualifying clause detected.",
      rest:
        o.recommendation?.trim() ||
        "Review the audit report before committing — high compliance risk.",
    };
  }
  if (u === "watch") {
    return {
      variant: "warn",
      lead: "Watch item.",
      rest:
        o.recommendation?.trim() ||
        `Compliance score ${o.compliance_score ?? "?"} — manual review recommended before bid.`,
    };
  }
  if ((o.compliance_score ?? 0) >= 80) {
    return {
      variant: "win",
      lead: "Strong fit.",
      rest:
        o.recommendation?.trim() ||
        `${o.set_aside ?? "Open"} · ${o.naics_code ?? "NAICS"} matches your past performance.`,
    };
  }
  return {
    variant: "info",
    lead: "Shape the requirement.",
    rest:
      o.recommendation?.trim() ||
      `${o.document_type ?? "Notice"} · ${o.naics_code ?? "NAICS"} · ${o.set_aside ?? "Open"} — review solicitation.`,
  };
}

function firstName(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[._-]+/g, " ").trim();
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function greetingTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/* ─── MAIN COMPONENT ─────────────────────────────────── */
export function CommandCenterClient({
  stats,
  opportunities,
  recentAudits,
  userEmail,
}: Props) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [view, setView] = useState<FeedView>("cards");
  const [sort, setSort] = useState<SortKey>("score");
  const { theme, setTheme } = useTheme();

  /* ── derived counters ── */
  const urgentCount = useMemo(
    () => opportunities.filter((o) => urgencyClass(o) === "urgent").length,
    [opportunities]
  );
  const new24hCount = useMemo(
    () =>
      opportunities.filter(
        (o) => Date.now() - new Date(o.created_at).getTime() <= 86_400_000
      ).length,
    [opportunities]
  );
  const pipelineCount = useMemo(
    () => opportunities.filter((o) => o.in_pipeline).length,
    [opportunities]
  );
  const hotCount = useMemo(
    () =>
      opportunities.filter(
        (o) => (o.compliance_score ?? 0) >= 80 && urgencyClass(o) !== "urgent"
      ).length,
    [opportunities]
  );
  const riskCount = useMemo(
    () =>
      opportunities.filter(
        (o) => (o.compliance_score ?? 100) < 40 || o.risk_level === "high"
      ).length,
    [opportunities]
  );

  /* ── filtered + sorted feed ── */
  const feed = useMemo(() => {
    let rows = [...opportunities];
    if (filter === "urgent")
      rows = rows.filter((o) => urgencyClass(o) === "urgent");
    else if (filter === "hot")
      rows = rows.filter(
        (o) => (o.compliance_score ?? 0) >= 80 && urgencyClass(o) !== "urgent"
      );
    else if (filter === "new24h")
      rows = rows.filter(
        (o) => Date.now() - new Date(o.created_at).getTime() <= 86_400_000
      );
    else if (filter === "pipeline")
      rows = rows.filter((o) => o.in_pipeline);
    else if (filter === "risk")
      rows = rows.filter(
        (o) => (o.compliance_score ?? 100) < 40 || o.risk_level === "high"
      );

    if (sort === "score")
      rows.sort(
        (a, b) => (b.compliance_score ?? 0) - (a.compliance_score ?? 0)
      );
    else if (sort === "deadline")
      rows.sort((a, b) => {
        if (!a.response_deadline) return 1;
        if (!b.response_deadline) return -1;
        return (
          new Date(a.response_deadline).getTime() -
          new Date(b.response_deadline).getTime()
        );
      });
    else if (sort === "agency")
      rows.sort((a, b) => (a.agency ?? "").localeCompare(b.agency ?? ""));

    return rows;
  }, [opportunities, filter, sort]);

  /* ── account intelligence (live from recentAudits) ── */
  const winCount = recentAudits.filter((a) => a.outcome === "won").length;
  const lossCount = recentAudits.filter((a) => a.outcome === "lost").length;
  const submittedCount = recentAudits.filter((a) => a.bid_submitted).length;
  const lookedAt = recentAudits.length; // proxy: every audit = an opp we looked at
  const winRatePct =
    lookedAt > 0 ? ((winCount / lookedAt) * 100).toFixed(1) : "—";
  const hitRatePct =
    submittedCount > 0
      ? ((winCount / submittedCount) * 100).toFixed(0)
      : "—";

  /* ── greeting bits ── */
  const fname = firstName(userEmail);
  const initials = fname.slice(0, 2).toUpperCase();
  const greeting = greetingTime();
  const dateStr = formatDate();
  const signalCount = urgentCount + riskCount;

  /* ── topbar theme toggle (cycles light ↔ dark) ── */
  const isDark = theme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  /* ─── render ─── */
  return (
    <div className="fa-cc">
      <div className="frame">
        {/* ═════════════ SIDEBAR ═════════════ */}
        <aside className="sidebar">
          <div className="sb-logo-row">
            <div className="sb-logo">F</div>
          </div>

          <div className="sb-group-label">WORKSPACE</div>
          <div className="sb-icon active" data-tip="Today">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span className="sb-tip">Today</span>
          </div>
          <a className="sb-icon" href="/audit" title="Run Audit">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 13l2 2 4-4" />
            </svg>
            <span className="sb-tip">Run Audit</span>
          </a>
          <a className="sb-icon" href="/dashboard" title="Past Audits">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="sb-tip">Past Audits</span>
          </a>
          <div className="sb-icon" title="Pipeline">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
            <span className="sb-tip">Pipeline</span>
          </div>

          <div className="sb-group-label">INTELLIGENCE</div>
          <a className="sb-icon" href="/upstream-intel" title="Opportunities">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span className="sb-tip">Opportunities</span>
          </a>
          <div className="sb-icon" title="Defense Spending">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 19V5M4 19h16" />
              <rect x="7" y="11" width="3" height="6" />
              <rect x="12" y="8" width="3" height="9" />
              <rect x="17" y="13" width="3" height="4" />
            </svg>
            <span className="sb-tip">Defense Spending</span>
          </div>
          <div className="sb-icon" title="Agencies">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 21h18" />
              <path d="M5 21V8l7-5 7 5v13" />
              <path d="M9 21v-6h6v6" />
            </svg>
            <span className="sb-tip">Agencies</span>
          </div>

          <div className="sb-group-label">ACCOUNT</div>
          <a className="sb-icon" href="/settings" title="Profile & Settings">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
            </svg>
            <span className="sb-tip">Profile</span>
          </a>

          <div className="sb-bottom">
            <div className="sb-avatar" title={userEmail}>
              {initials}
            </div>
          </div>
        </aside>

        {/* ═════════════ MAIN ═════════════ */}
        <main className="main">
          {/* ─── topbar ─── */}
          <div className="topbar">
            <div className="crumbs">
              <b>Today</b>
              <span className="sep">/</span>
              <span>Intelligence Brief</span>
            </div>
            <span className="live-pill">LIVE</span>
            <div className="search" aria-label="Search (coming soon)">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 14, height: 14, flexShrink: 0 }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <span>Search opportunities, agencies, NAICS, COs…</span>
              <span className="kbd">⌘K</span>
            </div>
            <div className="top-actions">
              <button
                className="icon-btn"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {isDark ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
                  </svg>
                )}
              </button>
              <button
                className="icon-btn"
                title="Notifications (mock)"
                type="button"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8z" />
                  <path d="M10 21a2 2 0 004 0" />
                </svg>
                <span className="nbadge">{MOCK_NOTIFICATION_COUNT}</span>
              </button>
              <div className="user-chip">
                <div className="av">{initials}</div>
                <div>
                  <div className="nm">{fname}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── body grid ─── */}
          <div className="body">
            {/* center column (display:contents — children slotted via grid-area) */}
            <div className="center">
              {/* greeting */}
              <div className="greeting-wrap">
                <div className="greeting-top">
                  <span className="eyebrow">
                    Federal Contract Intelligence
                  </span>
                  <span className="gt-right">
                    <span className="date">{dateStr}</span>
                    <span className="sep" />
                    <span className="sync">{MOCK_SYNC_LABEL}</span>
                  </span>
                </div>
                <h1 className="greeting">
                  {greeting}, {fname}.{" "}
                  <span className="muted">
                    <span className="num">{signalCount}</span> signal
                    {signalCount === 1 ? "" : "s"} need attention.
                  </span>
                </h1>
              </div>

              {/* KPI hero row */}
              <div className="kpi-row">
                {/* Navy — Live Solicitations (live from opportunities) */}
                <div className="kpi navy">
                  <div className="label">
                    <span className="ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="M3 13l6-6 4 4 8-8" />
                      </svg>
                    </span>
                    Live Solicitations
                    <span className="corner-dot">LIVE</span>
                  </div>
                  <div className="wide">
                    <div className="wide-l">
                      <div>
                        <div className="num">
                          {opportunities.length}
                          <span className="unit">on SAM.gov</span>
                        </div>
                        <div className="sub">
                          Matched against your NAICS &amp; PSCs in the last
                          24h.{" "}
                          <span
                            style={{ color: "#5eead4", fontWeight: 700 }}
                          >
                            {MOCK_KPI_DELTAS.liveSolDelta}
                          </span>
                        </div>
                      </div>
                      <div className="actions">
                        <a className="btn" href="/upstream-intel">
                          Open feed
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            style={{ width: 11, height: 11 }}
                          >
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </a>
                        <button className="btn ghost">Filters</button>
                      </div>
                    </div>
                    <div className="wide-r">
                      <svg
                        className="spark-lg"
                        viewBox="0 0 220 64"
                        preserveAspectRatio="none"
                        aria-label="ingest sparkline (mock)"
                      >
                        <path
                          className="fill"
                          d="M0 52 L18 44 L36 48 L54 36 L72 40 L90 26 L108 30 L126 18 L144 24 L162 14 L180 18 L198 8 L220 16 L220 64 L0 64 Z"
                        />
                        <path d="M0 52 L18 44 L36 48 L54 36 L72 40 L90 26 L108 30 L126 18 L144 24 L162 14 L180 18 L198 8 L220 16" />
                        <circle cx="198" cy="8" r="3" fill="#5eead4" />
                        <circle
                          cx="198"
                          cy="8"
                          r="6"
                          fill="#5eead4"
                          opacity="0.30"
                        />
                      </svg>
                      <div className="ticker">
                        <div className="head">Ingest stream (mock)</div>
                        {MOCK_INGEST_TICKER.map((row) => (
                          <div className="ln" key={row.t}>
                            <span className="t">{row.t}</span>
                            <span className="txt">{row.txt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Red — Compliance Traps (live: stats.critical_p0) */}
                <div className="kpi red">
                  <div className="label">
                    <span className="ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="M12 2L2 22h20L12 2z" />
                        <path d="M12 9v6" />
                      </svg>
                    </span>
                    Compliance Traps
                    <span className="corner-dot">CRITICAL</span>
                  </div>
                  <div>
                    <div className="num">
                      {stats.critical_p0}
                      <span className="unit">audits flagged</span>
                    </div>
                    <div className="sub">
                      Disqualifying clauses caught before submission.
                    </div>
                  </div>
                  <div className="foot">
                    <span className="delta">{MOCK_KPI_DELTAS.trapsBriefs}</span>
                    <svg
                      className="spark"
                      viewBox="0 0 120 28"
                      preserveAspectRatio="none"
                    >
                      <path
                        className="fill"
                        d="M0 18 L15 20 L30 14 L45 16 L60 8 L75 10 L90 6 L105 12 L120 4 L120 28 L0 28 Z"
                      />
                      <path d="M0 18 L15 20 L30 14 L45 16 L60 8 L75 10 L90 6 L105 12 L120 4" />
                    </svg>
                  </div>
                </div>

                {/* Amber — Traps caught (live: stats.total_traps_caught) */}
                <div className="kpi amber">
                  <div className="label">
                    <span className="ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </span>
                    Traps Caught
                    <span className="corner-dot">CORPUS</span>
                  </div>
                  <div>
                    <div className="num">
                      {stats.total_traps_caught}
                      <span className="unit">in corpus</span>
                    </div>
                    <div className="sub">{MOCK_KPI_DELTAS.deadlinesSub}</div>
                  </div>
                  <div className="foot">
                    <span className="delta">
                      {MOCK_KPI_DELTAS.deadlines48h}
                    </span>
                    <svg
                      className="spark"
                      viewBox="0 0 120 28"
                      preserveAspectRatio="none"
                    >
                      <path
                        className="fill"
                        d="M0 10 L15 14 L30 8 L45 12 L60 6 L75 14 L90 10 L105 16 L120 12 L120 28 L0 28 Z"
                      />
                      <path d="M0 10 L15 14 L30 8 L45 12 L60 6 L75 14 L90 10 L105 16 L120 12" />
                    </svg>
                  </div>
                </div>

                {/* Teal — Audits This Month (live: stats.audit_activity_month) */}
                <div className="kpi teal">
                  <div className="label">
                    <span className="ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                      </svg>
                    </span>
                    Audits This Month
                    <span className="corner-dot">RUN RATE</span>
                  </div>
                  <div>
                    <div className="num">
                      {stats.audit_activity_month}
                      <span className="unit">audits run</span>
                    </div>
                    <div className="sub">{MOCK_KPI_DELTAS.auditsSubDelta}</div>
                  </div>
                  <div className="foot">
                    <span className="delta">{MOCK_KPI_DELTAS.auditsMoM}</span>
                    <svg
                      className="spark"
                      viewBox="0 0 120 28"
                      preserveAspectRatio="none"
                    >
                      <path
                        className="fill"
                        d="M0 22 L15 20 L30 18 L45 16 L60 14 L75 12 L90 10 L105 8 L120 5 L120 28 L0 28 Z"
                      />
                      <path d="M0 22 L15 20 L30 18 L45 16 L60 14 L75 12 L90 10 L105 8 L120 5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* ─── INTELLIGENCE FEED ─── */}
              <div className="feed">
                <div className="feed-head">
                  <div className="fh-top">
                    <h2>
                      Intelligence Feed{" "}
                      <span className="count">
                        {feed.length} of {opportunities.length}
                      </span>
                    </h2>
                    <div className="fh-controls">
                      <button
                        className="sort-pill"
                        type="button"
                        onClick={() =>
                          setSort(
                            sort === "score"
                              ? "deadline"
                              : sort === "deadline"
                                ? "agency"
                                : "score"
                          )
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h13M3 12h9M3 18h5M17 8V20m0 0 3-3m-3 3-3-3" />
                        </svg>
                        Sort:{" "}
                        <span className="val">
                          {sort === "score"
                            ? "Score"
                            : sort === "deadline"
                              ? "Deadline"
                              : "Agency"}
                        </span>
                      </button>
                      <div className="view-seg seg">
                        {(["cards", "compact"] as FeedView[]).map((v) => (
                          <button
                            key={v}
                            data-on={view === v}
                            onClick={() => setView(v)}
                            type="button"
                          >
                            {v === "cards" ? "Cards" : "Compact"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="fh-sub">
                    Ranked by composite signal · score · deadline · pipeline
                    fit
                  </div>
                </div>

                <div className="filter-bar">
                  <div className="tier1">
                    <span className="tier-label">View</span>
                    {(
                      [
                        ["all", "All", opportunities.length, ""],
                        ["urgent", "Urgent", urgentCount, ""],
                        ["hot", "Hot Match", hotCount, "hot"],
                        ["new24h", "New 24h", new24hCount, "new"],
                        ["pipeline", "In Pipeline", pipelineCount, ""],
                        ["risk", "At Risk", riskCount, "risk"],
                      ] as [FeedFilter, string, number, string][]
                    ).map(([key, label, count, extra]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`chip-tab ${filter === key ? "active" : ""} ${extra}`}
                      >
                        {label}
                        <span className="ct-num">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`feed-list ${view === "compact" ? "compact" : ""}`}>
                  {feed.length === 0 ? (
                    <div
                      style={{
                        padding: 40,
                        textAlign: "center",
                        color: "var(--mute)",
                        fontSize: 13,
                      }}
                    >
                      No opportunities match the current filters.
                    </div>
                  ) : (
                    feed.map((o) => {
                      const ins = generateInsight(o);
                      const agencyParts = splitAgency(o.agency);
                      const sa = setAsideLabel(o.set_aside);
                      const u = urgencyClass(o);
                      const slugId =
                        (o.solicitation_number || o.notice_id || o.id || "")
                          .toString()
                          .toLowerCase();
                      return (
                        <div className={rowVariant(o)} key={o.id}>
                          <div className={`score ${scoreClass(o.compliance_score)}`}>
                            <div className="v">
                              {o.compliance_score ?? "—"}
                            </div>
                            <div className="l">
                              {u === "urgent" ? "Trap" : "Match"}
                            </div>
                          </div>

                          <div className="row-body">
                            <div className="row-top">
                              <span className="row-title">
                                {o.title_plain || o.title || "Untitled solicitation"}
                              </span>
                            </div>
                            <div className="compact-sub">
                              {(o.solicitation_number || o.notice_id) ?? "—"} ·{" "}
                              {agencyParts.name}
                              {agencyParts.sub
                                ? ` · ${agencyParts.sub}`
                                : ""}
                            </div>
                            <div className="row-meta">
                              <span
                                className={`badge ${docBadgeClass(o.document_type || o.notice_type)}`}
                              >
                                {docLabel(o.document_type, o.notice_type)}
                              </span>
                              {o.naics_code && (
                                <span className="badge naics">
                                  NAICS {o.naics_code}
                                </span>
                              )}
                              <span className={`badge ${sa.cls}`}>
                                {sa.label}
                              </span>
                              <span className="row-id">
                                {o.solicitation_number || o.notice_id}
                              </span>
                            </div>
                            <div className="row-agency one-line">
                              <span className="agency-name">
                                {agencyParts.name}
                              </span>
                              {agencyParts.sub && (
                                <span className="agency-sub">
                                  {agencyParts.sub}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="row-right">
                            <span
                              className={`deadline ${deadlineClass(o.response_deadline)}`}
                            >
                              {deadlineLabel(o.response_deadline)}
                            </span>
                            <span className="row-value">
                              {formatCurrency(o.award_ceiling)}
                            </span>
                          </div>

                          <div className={`insight ${ins.variant}`}>
                            <div className="ai-row">
                              <span className="ai-icon">
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
                                </svg>
                              </span>
                              <span className="ai-label">AI INSIGHT</span>
                            </div>
                            <div className="ai-desc">
                              <b>{ins.lead}</b> {ins.rest}
                            </div>
                          </div>

                          <div className="row-actions">
                            <a
                              className="a primary"
                              href={`/audit/${encodeURIComponent(slugId)}`}
                            >
                              Open audit{" "}
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                              >
                                <path d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </a>
                            {!o.in_pipeline && (
                              <button className="a" type="button">
                                Add to pipeline
                              </button>
                            )}
                            {o.pdf_url && (
                              <a className="a" href={o.pdf_url} target="_blank" rel="noreferrer">
                                View solicitation
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ═════════ RIGHT RAIL ═════════ */}
            <aside className="rail">
              {/* Active Pursuits */}
              <section className="panel">
                <div className="panel-head stacked">
                  <div className="ph-top">
                    <h3>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        style={{ width: 14, height: 14 }}
                      >
                        <path d="M3 12l4-4 5 5 4-4 5 5" />
                      </svg>
                      Active Pursuits
                    </h3>
                    <a className="view-all" href="/dashboard">
                      View all
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </a>
                  </div>
                </div>

                <div className="pursuits-summary">
                  <div className="ps-head">
                    <span className="ps-left">Pipeline funnel (mock)</span>
                    <span className="ps-mid">
                      <span className="lead">
                        {MOCK_PIPELINE_FUNNEL.topActive}
                      </span>
                      <span className="sub">
                        {MOCK_PIPELINE_FUNNEL.inFlight}
                      </span>
                    </span>
                    <span className="ps-right">
                      <span className="lead">
                        {MOCK_PIPELINE_FUNNEL.weighted}
                      </span>
                      <span className="sub">
                        {MOCK_PIPELINE_FUNNEL.ofPipeline}
                      </span>
                    </span>
                  </div>
                  <div className="funnel" role="img" aria-label="mock funnel">
                    {MOCK_PIPELINE_FUNNEL.segments.map((seg, i) => (
                      <div
                        key={seg.label}
                        className={`fseg s${i}`}
                        style={{ flex: 1 }}
                        title={`${seg.label}: ${seg.n}`}
                      >
                        {seg.n}
                      </div>
                    ))}
                  </div>
                  <div className="flabels">
                    {MOCK_PIPELINE_FUNNEL.segments.map((seg) => (
                      <span key={seg.label} style={{ flex: 1 }}>
                        {seg.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pursuits-metrics">
                  {MOCK_PIPELINE_METRICS.map((m) => (
                    <div
                      className={`m-cell ${m.tone}`}
                      key={m.lbl}
                      title="mock placeholder"
                    >
                      <div className="m-lbl">
                        <span className="m-dot" />
                        {m.lbl}
                      </div>
                      <div className="m-val">
                        <span className="num">{m.n}</span>
                        <span className="dol">{m.dol}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* live pipeline rows from recentAudits.in_pipeline */}
                {recentAudits
                  .filter((a) => a.in_pipeline)
                  .slice(0, 5)
                  .map((a) => (
                    <div className="pursuit" key={a.id}>
                      <div className="p-row1">
                        <span className="nm">
                          {a.title || a.solicitation_number || a.notice_id}
                        </span>
                        <span className="ag">{a.agency || "—"}</span>
                        <span
                          className={`due ${deadlineClass(a.response_deadline)}`}
                        >
                          {deadlineLabel(a.response_deadline)}
                        </span>
                      </div>
                      <div className="p-row2">
                        <span className="stage draft">
                          {(a.status || "in progress").toUpperCase()}
                        </span>
                        <span className="val">
                          {a.recommendation || `Score ${a.compliance_score ?? "—"}`}
                        </span>
                      </div>
                    </div>
                  ))}
                {recentAudits.filter((a) => a.in_pipeline).length === 0 && (
                  <div
                    style={{
                      padding: "12px 14px",
                      color: "var(--mute)",
                      fontSize: 12,
                    }}
                  >
                    No active pursuits.{" "}
                    <a href="/audit" style={{ color: "var(--gold-600)" }}>
                      Run an audit
                    </a>{" "}
                    to start one.
                  </div>
                )}
              </section>

              {/* Quick Audit */}
              <section className="panel">
                <div className="panel-head stacked">
                  <div className="ph-top">
                    <h3>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        style={{ width: 14, height: 14 }}
                      >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M9 15l2 2 4-4" />
                      </svg>
                      Quick Audit
                    </h3>
                    <span
                      className="badge-compl"
                      style={{
                        fontFamily: "IBM Plex Mono",
                        fontSize: 10.5,
                        color: "var(--mute)",
                        fontWeight: 600,
                      }}
                      title="mock"
                    >
                      {MOCK_QUICK_AUDIT_RUN_WEEK}
                    </span>
                  </div>
                </div>

                <a className="qa-drop" href="/audit" style={{ textDecoration: "none" }}>
                  <div className="ic">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <path d="M17 8l-5-5-5 5" />
                      <path d="M12 3v12" />
                    </svg>
                  </div>
                  <div className="t">
                    Drop PDF or <span className="browse">browse</span>
                  </div>
                  <div className="types">
                    PWS <span className="sep">·</span> SOW{" "}
                    <span className="sep">·</span> SOO{" "}
                    <span className="sep">·</span> RFP{" "}
                    <span className="sep">·</span> RFQ{" "}
                    <span className="sep">·</span> max 25MB
                  </div>
                </a>

                <div className="qa-recent">
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--mute)",
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      margin: "0 2px 2px",
                    }}
                  >
                    Recent audits
                  </div>
                  {recentAudits.slice(0, 4).map((a) => {
                    const sc = a.compliance_score ?? 0;
                    const tone = sc >= 80 ? "hi" : sc >= 60 ? "md" : "lo";
                    const slug = (
                      a.solicitation_number ||
                      a.notice_id ||
                      a.id ||
                      ""
                    )
                      .toString()
                      .toLowerCase();
                    return (
                      <a
                        className="qa-item"
                        key={a.id}
                        href={`/audit/${encodeURIComponent(slug)}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div className="ic pdf">PDF</div>
                        <div className="bd">
                          <div className="ttl">
                            {(a.solicitation_number || a.notice_id) ?? "—"} —{" "}
                            {a.title || "Untitled"}
                          </div>
                          <div className="mt">
                            {new Date(a.created_at).toLocaleDateString()} ·{" "}
                            {a.recommendation ?? a.status}
                          </div>
                        </div>
                        <span className={`sc ${tone}`}>{sc}</span>
                      </a>
                    );
                  })}
                  {recentAudits.length === 0 && (
                    <div
                      style={{
                        padding: "12px 6px",
                        fontSize: 11,
                        color: "var(--mute)",
                      }}
                    >
                      No audits yet.
                    </div>
                  )}
                </div>

                <div className="free-strip" title="mock — billing not wired">
                  <div className="ft-top">
                    <span>{MOCK_FREE_TIER.label}</span>
                    <span>{MOCK_FREE_TIER.pct}</span>
                  </div>
                  <div className="ft-bar">
                    <i style={{ width: `${MOCK_FREE_TIER.bar * 100}%` }} />
                  </div>
                  <div className="ft-d">{MOCK_FREE_TIER.detail}</div>
                </div>
              </section>

              {/* Account Intelligence */}
              <section className="panel">
                <div className="panel-head">
                  <h3>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      style={{ width: 14, height: 14 }}
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
                    </svg>
                    Account Intelligence
                  </h3>
                </div>

                <div className="ai2">
                  <div className="ai2-row cols-2">
                    <div
                      className="m hero"
                      title="Win Rate = wins ÷ every opportunity you looked at (live from audits.outcome)"
                    >
                      <div className="lbl">Win Rate · 12mo</div>
                      <div className="val">
                        {winRatePct}
                        <span className="small">%</span>
                      </div>
                      <div className="def">of all opps you look at</div>
                    </div>
                    <div
                      className="m"
                      title="Hit Rate = wins ÷ proposals submitted (live from audits.bid_submitted)"
                    >
                      <div className="lbl">Hit Rate · 12mo</div>
                      <div className="val">
                        {hitRatePct}
                        <span className="small">%</span>
                      </div>
                      <div className="def">of bids you actually submit</div>
                    </div>
                    <div
                      className="m critical"
                      title="Open Priority-0 compliance findings (live)"
                    >
                      <div className="lbl">Critical P0</div>
                      <div className="val">{stats.critical_p0}</div>
                      <div className="def">blocking deals right now</div>
                    </div>
                    <div
                      className="m"
                      title="Avg Cycle Time — MOCK (no cycle-time data wired)"
                    >
                      <div className="lbl">Avg Cycle Time</div>
                      <div className="val">
                        {MOCK_AVG_CYCLE_DAYS}
                        <span className="small">days</span>
                      </div>
                      <div className="delta up">{MOCK_AVG_CYCLE_DELTA}</div>
                      <div className="def">to get a proposal out (mock)</div>
                    </div>
                  </div>

                  {/* Locked Pipeline Coverage — design ships as locked / mock */}
                  <div className="locked-chart">
                    <div className="lc-head">
                      <span className="lc-lbl">
                        Pipeline Coverage · 8 weeks
                      </span>
                      <span className="lock-ico" title="Coming soon">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect
                            x="4"
                            y="10"
                            width="16"
                            height="10"
                            rx="2"
                          />
                          <path d="M8 10V7a4 4 0 018 0v3" />
                        </svg>
                      </span>
                    </div>
                    <div className="lc-bars" aria-hidden="true">
                      {[32, 46, 60, 52, 72, 80, 76, 100].map((h, i) => (
                        <i key={i} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="lc-msg">
                      Populates once you have <b>3+ active pursuits</b>.
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
