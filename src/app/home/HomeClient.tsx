"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type {
  HeaderCounter,
  OpportunityRow,
  AuditRow,
  KORow,
  AgencyRow
} from "@/lib/bd-os/queries";

type TabKey = "home" | "audit" | "sam" | "budget" | "news" | "pipeline" | "past-audits" | "ko-intelligence" | "agency-intelligence" | "rfi-response" | "teaming" | "capability";
type FilterKey = "All" | "P0 · P1" | "≤7 Days" | "Small Business" | "IDIQ" | "Pre-Sol";

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
  kos: KORow[];
  agencies: AgencyRow[];
}

const FILTERS: FilterKey[] = ["All", "P0 · P1", "≤7 Days", "Small Business", "IDIQ", "Pre-Sol"];

const TAB_KEYS: TabKey[] = [
  "home", "audit", "sam", "budget", "news", "pipeline",
  "past-audits", "ko-intelligence", "agency-intelligence", "rfi-response",
  "teaming", "capability"
];

export default function HomeClient({ user, counter, opportunities, recentAudits, kos, agencies }: Props) {
  const [tab, setTabState] = useState<TabKey>("home");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [naics, setNaics] = useState<string>("all");
  const [feedTs, setFeedTs] = useState<string>("just now");

  const setTab = (next: TabKey) => {
    setTabState(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const h = window.location.hash.replace("#", "") as TabKey;
      if (TAB_KEYS.includes(h)) setTabState(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    let s = 0;
    const t = setInterval(() => {
      s++;
      setFeedTs(s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`);
      if (s >= 90) s = 0;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const naicsOptions = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((o) => { if (o.naics_code) set.add(o.naics_code); });
    return Array.from(set).sort();
  }, [opportunities]);

  const enriched = useMemo(() => opportunities.map(enrichRow), [opportunities]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (naics !== "all" && r.row.naics_code !== naics) return false;
      if (filter === "P0 · P1") return r.risk === "rp0" || r.risk === "rp1";
      if (filter === "≤7 Days") return r.daysNum != null && r.daysNum <= 7;
      if (filter === "Small Business") return ["SB", "SDVOSB", "WOSB", "8(a)"].includes(r.saLabel);
      if (filter === "IDIQ") {
        const dt = (r.row.document_type || "").toUpperCase();
        return dt.includes("IDIQ");
      }
      if (filter === "Pre-Sol") {
        const nt = (r.row.notice_type || "").toLowerCase();
        return nt === "pre_sol" || nt === "sources_sought";
      }
      return true;
    });
  }, [enriched, filter, naics]);

  const p0Rows = filtered.filter((r) => r.risk === "rp0");
  const otherRows = filtered.filter((r) => r.risk !== "rp0");

  const stats = useMemo(() => {
    const total = enriched.length;
    const p0 = enriched.filter((r) => r.risk === "rp0").length;
    const exp = enriched.filter((r) => r.daysNum != null && r.daysNum <= 7).length;
    return { total, p0, exp };
  }, [enriched]);

  const initials = (user.email[0] || "?").toUpperCase() + (user.email.split("@")[0]?.[1] || "").toUpperCase();
  const handle = (user.email.split("@")[0] || "").slice(0, 18);

  return (
    <div className="bd-home">
      <div className="app">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="tb-brand">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L24 7V15C24 20.5 19.5 25 14 26C8.5 25 4 20.5 4 15V7L14 2Z" stroke="#C9A84C" strokeWidth="1.4" fill="rgba(201,168,76,.1)" opacity=".9"/>
              <line x1="10" y1="13" x2="18" y2="13" stroke="#C9A84C" strokeWidth=".9" opacity=".7"/>
              <line x1="10" y1="16" x2="16" y2="16" stroke="#C9A84C" strokeWidth=".9" opacity=".5"/>
            </svg>
            <div className="tb-wordmark">FAR<span>audit</span></div>
          </div>
          <div className="tb-center">
            <div className="tb-search">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {counter.audits.toLocaleString()} solicitations audited · {counter.traps.toLocaleString()} traps detected
            </div>
          </div>
          <div className="tb-right">
            <div className="tb-live"><div className="live-dot" />Live · <span>{stats.total}</span> Active</div>
            <div className="tb-notif">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 1a5 5 0 00-5 5v3l-1.5 2h13L13 9V6a5 5 0 00-5-5z" stroke="#C9A84C" strokeWidth="1.2" strokeOpacity=".6" fill="none"/>
                <line x1="6.5" y1="14" x2="9.5" y2="14" stroke="#C9A84C" strokeWidth="1.2" strokeOpacity=".5" strokeLinecap="round"/>
              </svg>
              <div className="notif-badge" />
            </div>
            <a className="tb-user" href="/home" title={user.email}>
              <div className="user-av">{initials || "U"}</div>
              <div className="user-nm">{handle || "user"}</div>
            </a>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="nav-label">Platform</div>
          <button className={`nav-item ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Intelligence Home
          </button>
          <button className={`nav-item ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/>
              <line x1="6" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/>
            </svg>
            Run Audit
            <span className="nav-ct ct-gold">New</span>
          </button>
          <button className={`nav-item ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Pipeline Tracker
            {stats.p0 > 0 && <span className="nav-ct ct-red">{stats.p0}</span>}
          </button>
          <button className={`nav-item ${tab === "past-audits" ? "active" : ""}`} onClick={() => setTab("past-audits")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Past Audits
            <span className="nav-ct ct-gold">{recentAudits.length}</span>
          </button>
          <button className={`nav-item ${tab === "past-audits" ? "active" : ""}`} onClick={() => setTab("past-audits")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Reports Library
          </button>

          <div className="nav-label">Intelligence</div>
          <button className={`nav-item ${tab === "sam" ? "active" : ""}`} onClick={() => setTab("sam")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            SAM.gov Feed
            <span className="nav-ct ct-green">Live</span>
          </button>
          <button className={`nav-item ${tab === "budget" ? "active" : ""}`} onClick={() => setTab("budget")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Budget Tracker
          </button>
          <button className={`nav-item ${tab === "news" ? "active" : ""}`} onClick={() => setTab("news")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M2 2h12v2L8 10 2 4V2z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Defense News
          </button>
          <button className={`nav-item ${tab === "ko-intelligence" ? "active" : ""}`} onClick={() => setTab("ko-intelligence")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            KO Intelligence
            {kos.length > 0 && <span className="nav-ct ct-gold">{kos.length}</span>}
          </button>
          <button className={`nav-item ${tab === "agency-intelligence" ? "active" : ""}`} onClick={() => setTab("agency-intelligence")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M2 14h12M3 14V6l5-3 5 3v8M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Agency Intelligence
            {agencies.length > 0 && <span className="nav-ct ct-gold">{agencies.length}</span>}
          </button>
          <button className={`nav-item ${tab === "rfi-response" ? "active" : ""}`} onClick={() => setTab("rfi-response")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10v7H6l-3 2V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            RFI Response
            {(() => {
              const presol = opportunities.filter((o) => {
                const nt = (o.notice_type || "").toLowerCase();
                return nt === "pre_sol" || nt === "sources_sought";
              }).length;
              return presol > 0 ? <span className="nav-ct ct-red">{presol}</span> : null;
            })()}
          </button>
          <button className={`nav-item ${tab === "teaming" ? "active" : ""}`} onClick={() => setTab("teaming")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Find Teaming Partners
          </button>
          <button className={`nav-item ${tab === "capability" ? "active" : ""}`} onClick={() => setTab("capability")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Capability Statement
          </button>

          <div className="nav-label">Account</div>
          <button className="nav-item" onClick={() => alert("Profile & Settings — V2 lives here. Email: " + user.email)}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Profile &amp; Settings
          </button>
          <SignOutButton />

          <div className="sb-footer">
            <div className="sb-plan">Design Partner · $1,250/mo</div>
            <div className="sb-days">Free during T1 sprint</div>
            <a href="/pricing" className="sb-upgrade" style={{ display: "block", textDecoration: "none" }}>Upgrade to Standard</a>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {/* PAGE TABS */}
          <div className="page-tabs">
            <button className={`ptab ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
              <div className="ptab-dot red" />Intelligence Home
            </button>
            <button className={`ptab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
              <div className="ptab-dot gold" />Run Audit
            </button>
            <button className={`ptab ${tab === "sam" ? "active" : ""}`} onClick={() => setTab("sam")}>
              <div className="ptab-dot green" />SAM.gov
              <span className="ptab-count green">{stats.total}</span>
            </button>
            <button className={`ptab ${tab === "budget" ? "active" : ""}`} onClick={() => setTab("budget")}>
              <div className="ptab-dot blue" />Congressional Budget
            </button>
            <button className={`ptab ${tab === "news" ? "active" : ""}`} onClick={() => setTab("news")}>
              <div className="ptab-dot red" />Defense News
            </button>
            <button className={`ptab ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>
              <div className="ptab-dot gold" />Pipeline
              {stats.p0 > 0 && <span className="ptab-count gold">{stats.p0}</span>}
            </button>
          </div>

          {/* TAB PANELS */}
          <div className="tab-panels">
            {/* HOME */}
            <div className={`tab-panel ${tab === "home" ? "active" : ""}`}>
              <div className="situation-board">
                <button className="sit-card urgent" onClick={() => setFilter("P0 · P1")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--red)", marginBottom: 8 }}>⚠ Critical — Act Today</div>
                  <div className="sit-value red">{stats.p0}</div>
                  <div className="sit-sub" style={{ fontSize: 9, color: "rgba(245,240,232,.65)", lineHeight: 1.6, marginTop: 6 }}>Solicitations with compliance traps that could disqualify your bid or cost you money on delivery.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--red)", marginTop: 10, borderTop: "1px solid rgba(220,38,38,.15)", paddingTop: 8 }}>Review P0 Flags →</div>
                </button>
                <button className="sit-card" style={{ borderTop: "3px solid var(--amber)" }} onClick={() => setFilter("≤7 Days")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--amber)", marginBottom: 8 }}>⏱ Expiring This Week</div>
                  <div className="sit-value gold">{stats.exp}</div>
                  <div className="sit-sub" style={{ fontSize: 9, color: "rgba(245,240,232,.65)", lineHeight: 1.6, marginTop: 6 }}>Submission deadlines closing in 7 days or less. Missed windows are permanent — no extensions after closing time.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--amber)", marginTop: 10, borderTop: "1px solid rgba(245,158,11,.15)", paddingTop: 8 }}>View Expiring →</div>
                </button>
                <button className="sit-card" style={{ borderTop: "3px solid var(--gold)" }} onClick={() => setTab("sam")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--gold2)", marginBottom: 8 }}>● Live on SAM.gov Now</div>
                  <div className="sit-value gold">{stats.total}</div>
                  <div className="sit-sub" style={{ fontSize: 9, color: "rgba(245,240,232,.65)", lineHeight: 1.6, marginTop: 6 }}>Active federal solicitations posted right now across your NAICS codes. Updated by sam-ingest cron — every one is a potential contract.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginTop: 10, borderTop: "1px solid rgba(201,168,76,.15)", paddingTop: 8 }}>Open SAM.gov Feed →</div>
                </button>
                <button className="sit-card" style={{ borderTop: "3px solid var(--green)" }} onClick={() => setTab("past-audits")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--green)", marginBottom: 8 }}>✓ Your Audit Activity</div>
                  <div className="sit-value green">{counter.audits}</div>
                  <div className="sit-sub" style={{ fontSize: 9, color: "rgba(245,240,232,.65)", lineHeight: 1.6, marginTop: 6 }}>Audits completed total. {counter.traps} compliance traps caught — every clause read, every trap flagged, every KO email drafted.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--green)", marginTop: 10, borderTop: "1px solid rgba(74,222,128,.15)", paddingTop: 8 }}>View Recent Audits →</div>
                </button>
              </div>

              {/* Upload bar */}
              <button className="upload-bar" onClick={() => setTab("audit")}>
                <div className="upload-icon-wrap">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2v11M6 6l4-4 4 4" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
                  </svg>
                </div>
                <div className="upload-copy">
                  <div className="upload-hed">Start a New Audit — Drop Any Solicitation PDF</div>
                  <div className="upload-sub">FARaudit reads every clause · FAR · DFARS · Section L · Section M · CLIN Structure · P0/P1/P2 risk ranking · KO email drafted</div>
                  <div className="upload-tags">
                    <span className="utag">RFQ</span><span className="utag">RFP</span><span className="utag">IDIQ</span><span className="utag">IFB</span><span className="utag">Any Page Count</span><span className="utag">Any Agency</span>
                  </div>
                </div>
                <span className="upload-cta-btn">Run Audit →</span>
              </button>

              {/* Two col body */}
              <div className="two-col">
                <div className="feed-wrap">
                  <div className="feed-hdr">
                    <div className="feed-hdr-l">
                      <div className="feed-title">Intelligence Feed</div>
                      <div className="feed-sub">Filtered to your NAICS · {feedTs}</div>
                    </div>
                    <div className="live-chip"><div className="live-dot" />LIVE</div>
                  </div>
                  <div className="feed-filters">
                    {FILTERS.map((f) => (
                      <button key={f} className={`ff ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
                    ))}
                  </div>
                  <div className="feed-cols">
                    <div className="fcol">NAICS</div><div className="fcol">Solicitation</div>
                    <div className="fcol">Agency</div><div className="fcol">Est. Value</div>
                    <div className="fcol">Days</div><div className="fcol">Type</div>
                    <div className="fcol">Set-Aside</div><div className="fcol">Risk</div>
                  </div>
                  <div className="feed-scroll">
                    {filtered.length === 0 && (
                      <div className="empty-state">
                        {opportunities.length === 0
                          ? "No solicitations queued yet. sam-ingest will populate the feed at 06:00 CDT."
                          : "No solicitations match this filter."}
                      </div>
                    )}
                    {p0Rows.length > 0 && filter === "All" && (
                      <div className="feed-section-hdr">
                        <div className="fsh-label">⚠ Requires Immediate Action</div>
                        <div className="fsh-count">{p0Rows.length} P0</div>
                      </div>
                    )}
                    {p0Rows.map((r) => <FeedRowCmp key={r.row.id} r={r} onClick={() => setTab("audit")} />)}
                    {otherRows.map((r) => <FeedRowCmp key={r.row.id} r={r} onClick={() => setTab("audit")} />)}
                  </div>
                </div>

                <div className="right-col">
                  <div className="rc-section">
                    <div className="rc-hdr"><div className="rc-title">Recent Audits</div><div className="rc-sub">Last {Math.min(5, recentAudits.length)}</div></div>
                    {recentAudits.length === 0 && (
                      <div className="empty-state">No audits yet.</div>
                    )}
                    {recentAudits.slice(0, 5).map((a) => {
                      const r = riskFromScore(a.compliance_score);
                      const rc = r.cls === "rk0" ? "var(--red)" : r.cls === "rk1" ? "var(--amber)" : "var(--gold)";
                      const bg = r.cls === "rk0" ? "rgba(220,38,38,.14)" : r.cls === "rk1" ? "rgba(245,158,11,.11)" : "rgba(201,168,76,.08)";
                      return (
                        <a key={a.id} className="audit-item" href={`/audit/${a.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                          <div className="ai-top">
                            <div className="ai-title">{a.title || a.notice_id || "Untitled audit"}</div>
                            <span className="ai-badge" style={{ color: rc, background: bg, border: `1px solid ${rc}40` }}>{r.label}</span>
                          </div>
                          <div className="ai-meta">{a.notice_id || "—"} · {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                          <div className="ai-btns">
                            <span className="ai-btn pri">View Report</span>
                            <span className="ai-btn">PDF</span>
                            <span className="ai-btn">KO Email</span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                  <div className="rc-section">
                    <div className="rc-hdr"><div className="rc-title">Account Intelligence</div></div>
                    <div className="acct-grid">
                      <div className="acct-stat"><div className="as-n">{counter.audits}</div><div className="as-l">Audits Run</div></div>
                      <div className="acct-stat"><div className="as-n red">{counter.traps}</div><div className="as-l">Traps Caught</div></div>
                      <div className="acct-stat"><div className="as-n">—</div><div className="as-l">Value Audited</div></div>
                      <div className="acct-stat"><div className="as-n green">$0</div><div className="as-l">Compliance Risk</div></div>
                    </div>
                    <div className="days-wrap">
                      <div className="days-top"><span className="days-lbl">Design Partner Period</span><span className="days-val">62d left</span></div>
                      <div className="days-track"><div className="days-fill" /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AUDIT */}
            <div className={`tab-panel ${tab === "audit" ? "active" : ""}`}>
              <RunAuditPanel />
            </div>

            {/* SAM */}
            <div className={`tab-panel ${tab === "sam" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header">
                    <div className="is-title">SAM.gov · Live Opportunity Feed</div>
                    <div className="is-refresh">
                      <select className="naics-select" value={naics} onChange={(e) => setNaics(e.target.value)}>
                        <option value="all">All NAICS</option>
                        {naicsOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <span>Last updated <span>{feedTs}</span></span>
                    </div>
                  </div>
                  <div className="sam-stat-row">
                    <div className="sam-stat"><div className="ss-n">{stats.total}</div><div className="ss-l">Active Opportunities</div></div>
                    <div className="sam-stat"><div className="ss-n" style={{ color: "var(--red)" }}>{stats.p0}</div><div className="ss-l">P0 Flags Today</div></div>
                    <div className="sam-stat"><div className="ss-n">{naicsOptions.length}</div><div className="ss-l">NAICS Codes Monitored</div></div>
                    <div className="sam-stat"><div className="ss-n" style={{ color: "var(--green)" }}>0</div><div className="ss-l">Competitors w/ Audit</div></div>
                  </div>
                  <div className="sam-table">
                    <div className="sam-th">
                      <span>Sol. Number</span><span>Title</span><span>Agency</span><span>Posted</span><span>Risk</span>
                    </div>
                    {filtered.length === 0 && (
                      <div className="empty-state">{opportunities.length === 0 ? "No solicitations queued yet." : "No rows match this NAICS filter."}</div>
                    )}
                    {[...filtered].sort((a, b) => (a.daysNum ?? 9999) - (b.daysNum ?? 9999)).map((r) => {
                      const rc = r.risk === "rp0" ? "var(--red)" : r.risk === "rp1" ? "var(--amber)" : "var(--gold)";
                      const bg = r.risk === "rp0" ? "rgba(220,38,38,.14)" : r.risk === "rp1" ? "rgba(245,158,11,.11)" : "rgba(201,168,76,.08)";
                      return (
                        <div key={r.row.id} className="sam-row" onClick={() => setTab("audit")}>
                          <span className="sr-num">{r.row.notice_id}</span>
                          <span className="sr-title" title={r.row.title || ""}>{r.row.title || "—"}</span>
                          <span className="sr-agency" title={r.row.agency || ""}>{r.row.agency || "—"}</span>
                          <span className="sr-date">{new Date(r.row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          <span className="sr-badge" style={{ color: rc, background: bg, border: `1px solid ${rc}40` }}>{r.riskLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* BUDGET — live USAspending.gov */}
            <div className={`tab-panel ${tab === "budget" ? "active" : ""}`}>
              <BudgetPanel naicsOptions={naicsOptions} />
            </div>

            {/* NEWS — live RSS aggregation */}
            <div className={`tab-panel ${tab === "news" ? "active" : ""}`}>
              <DefenseNewsPanel />
            </div>

            {/* PIPELINE — kanban */}
            <div className={`tab-panel ${tab === "pipeline" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header"><div className="is-title">Pipeline Kanban</div><div className="is-refresh">Drag a card to update its outcome · auto-saves to audits.outcome</div></div>
                  <PipelineKanban audits={recentAudits} />
                </div>
                <div className="intel-section">
                  <div className="is-header"><div className="is-title">Deadline Calendar</div><div className="is-refresh">Synthetic +30d window from posted date · sam-ingest will populate response_deadline once column wired</div></div>
                  <DeadlineCalendar rows={enriched.map((e) => e.row)} onPick={() => setTab("audit")} />
                </div>
              </div>
            </div>

            {/* PAST AUDITS */}
            <div className={`tab-panel ${tab === "past-audits" ? "active" : ""}`}>
              <PastAuditsPanel audits={recentAudits} />
            </div>

            {/* KO INTELLIGENCE */}
            <div className={`tab-panel ${tab === "ko-intelligence" ? "active" : ""}`}>
              <KOIntelPanel kos={kos} />
            </div>

            {/* AGENCY INTELLIGENCE */}
            <div className={`tab-panel ${tab === "agency-intelligence" ? "active" : ""}`}>
              <AgencyIntelPanel agencies={agencies} />
            </div>

            {/* RFI RESPONSE */}
            <div className={`tab-panel ${tab === "rfi-response" ? "active" : ""}`}>
              <RFIResponsePanel opportunities={opportunities} />
            </div>

            {/* TEAMING PARTNERS */}
            <div className={`tab-panel ${tab === "teaming" ? "active" : ""}`}>
              <TeamingPartnersPanel naicsOptions={naicsOptions} />
            </div>

            {/* CAPABILITY STATEMENT */}
            <div className={`tab-panel ${tab === "capability" ? "active" : ""}`}>
              <CapabilityPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Enriched {
  row: OpportunityRow;
  daysNum: number | null;
  daysCls: "urg" | "soon" | "ok" | "none";
  daysLabel: string;
  risk: "rp0" | "rp1" | "";
  riskLabel: string;
  saCls: "sb" | "sd" | "wo" | "a8" | "un";
  saLabel: string;
}

function enrichRow(row: OpportunityRow): Enriched {
  const daysSince = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400_000);
  const daysNum = isFinite(daysSince) ? daysSince : null;
  const daysCls = daysNum == null ? "none" : daysNum <= 7 ? "urg" : daysNum <= 21 ? "soon" : "ok";
  const daysLabel = daysNum == null ? "—" : `${daysNum}d`;

  let risk: "rp0" | "rp1" | "" = "";
  let riskLabel = "Watch";
  if (row.compliance_score != null) {
    if (row.compliance_score < 40) { risk = "rp0"; riskLabel = "P0"; }
    else if (row.compliance_score < 70) { risk = "rp1"; riskLabel = "P1"; }
    else { riskLabel = "P2"; }
  } else if (row.recommendation === "DECLINE") {
    risk = "rp0"; riskLabel = "P0";
  }

  const sa = (row.set_aside || "").toLowerCase();
  let saCls: Enriched["saCls"] = "un";
  let saLabel = "UNREST";
  if (sa.includes("8(a)") || sa.includes("8a")) { saCls = "a8"; saLabel = "8(a)"; }
  else if (sa.includes("woman")) { saCls = "wo"; saLabel = "WOSB"; }
  else if (sa.includes("sdvosb") || sa.includes("service-disabled")) { saCls = "sd"; saLabel = "SDVOSB"; }
  else if (sa.includes("small")) { saCls = "sb"; saLabel = "SB"; }

  return { row, daysNum, daysCls, daysLabel, risk, riskLabel, saCls, saLabel };
}

function FeedRowCmp({ r, onClick }: { r: Enriched; onClick: () => void }) {
  const riskCls = r.risk === "rp0" ? "rk0" : r.risk === "rp1" ? "rk1" : "rkw";
  const nt = (r.row.notice_type || "").toLowerCase();
  const isPreSol = nt === "pre_sol" || nt === "sources_sought";
  return (
    <div className={`feed-row ${r.risk}`} onClick={onClick}>
      <span className="f-naics">{r.row.naics_code || "—"}</span>
      <div style={{ minWidth: 0 }}>
        <div className="f-title" title={r.row.title || ""}>
          {isPreSol && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: 7, fontWeight: 700,
              padding: "1px 5px", marginRight: 6, borderRadius: 2,
              letterSpacing: ".1em", textTransform: "uppercase",
              color: "#A78BFA", background: "rgba(167,139,250,.10)",
              border: "1px solid rgba(167,139,250,.28)"
            }}>
              {nt === "sources_sought" ? "Src Sought" : "Pre-Sol"}
            </span>
          )}
          {r.row.incumbent_name && (
            <span
              title={`Incumbent: ${r.row.incumbent_name}`}
              style={{
                fontFamily: "var(--mono)", fontSize: 7, fontWeight: 700,
                padding: "1px 5px", marginRight: 6, borderRadius: 2,
                letterSpacing: ".1em", textTransform: "uppercase",
                color: "var(--blue)", background: "rgba(96,165,250,.08)",
                border: "1px solid rgba(96,165,250,.22)"
              }}
            >
              Inc
            </span>
          )}
          {r.row.title || "—"}
        </div>
      </div>
      <span className="f-agency" title={r.row.agency || ""}>{r.row.agency || "—"}</span>
      <span className="f-val">—</span>
      <span className={`f-days ${r.daysCls === "none" ? "" : r.daysCls}`}>{r.daysLabel}</span>
      <span className="f-type">{(r.row.document_type || "—").toUpperCase().slice(0, 6)}</span>
      <span className={`f-sa sa-${r.saCls}`}>{r.saLabel}</span>
      <span className={`f-risk ${riskCls}`}>{r.riskLabel}</span>
    </div>
  );
}

function riskFromScore(score: number | null): { cls: "rk0" | "rk1" | "rkw"; label: string } {
  if (score == null) return { cls: "rkw", label: "Watch" };
  if (score < 40) return { cls: "rk0", label: "P0" };
  if (score < 70) return { cls: "rk1", label: "P1" };
  return { cls: "rkw", label: "P2" };
}

function RunAuditPanel() {
  const [noticeId, setNoticeId] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ auditId?: string; recommendation?: string; score?: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null);
    if (!noticeId && !pdf) { setError("Provide a notice ID or PDF."); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (noticeId) fd.set("noticeId", noticeId);
      if (pdf) fd.set("pdf", pdf);
      const res = await fetch("/api/audit", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `audit failed (${res.status})`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="audit-tab">
      <form className="audit-center" onSubmit={submit}>
        <div className="audit-hero-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L24 7V15C24 20.5 19.5 25 14 26C8.5 25 4 20.5 4 15V7L14 2Z" stroke="#C9A84C" strokeWidth="1.2" fill="rgba(201,168,76,.08)"/>
            <polyline points="9,14 12.5,17.5 19,11" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        <div className="audit-hero-title">Run a New Audit</div>
        <div className="audit-hero-sub">Upload any federal solicitation PDF. FARaudit runs three sequential intelligence calls — Overview · FAR/DFARS Compliance · Risk Extraction — and delivers a ranked report with a KO clarification email drafted and ready to send.</div>
        <label className="audit-drop-zone" style={{ display: "block" }}>
          <div className="adz-title">Drop your solicitation PDF here</div>
          <div className="adz-sub">{pdf ? pdf.name : "Or click to browse · Any page count · Any agency · Any format"}</div>
          <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] || null)} style={{ display: "none" }} />
          <span className="adz-btn" style={{ marginTop: 18 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v9M4 7l4-5 4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Select PDF to Audit
          </span>
        </label>
        <div className="audit-input">
          <input
            type="text"
            value={noticeId}
            onChange={(e) => setNoticeId(e.target.value.trim())}
            placeholder="Or paste a SAM.gov Notice ID — e.g. FA301626Q0068"
          />
          <button type="submit" className="adz-btn" style={{ marginTop: 0 }} disabled={submitting}>
            {submitting ? "Auditing…" : "Run Audit →"}
          </button>
        </div>
        <div className="audit-formats" style={{ marginTop: 22 }}>
          <span className="af">RFQ</span><span className="af">RFP</span><span className="af">IDIQ</span>
          <span className="af">IFB</span><span className="af">Sources Sought</span><span className="af">Pre-Sol Synopsis</span>
          <span className="af">Task Order</span><span className="af">Modification</span>
        </div>
        {error && <div className="audit-error">{error}</div>}
        {result && (
          <div className="audit-success">
            ✓ Audit complete · {result.auditId}
            {result.recommendation && <> · {result.recommendation.replace("_", " ")}</>}
            {typeof result.score === "number" && <> · {result.score}/100</>}
          </div>
        )}
      </form>
    </div>
  );
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch { /* swallow */ }
    window.location.href = "/sign-in";
  }
  return (
    <button className="nav-item" onClick={go} disabled={busy} title="Sign out and return to sign-in">
      <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
        <path d="M10 12l3-4-3-4M5 8h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      {busy ? "Signing out…" : "Sign Out"}
    </button>
  );
}

function PastAuditsPanel({ audits }: { audits: AuditRow[] }) {
  const [filter, setFilter] = useState<"all" | "p0" | "ai" | "user">("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (filter === "p0") return a.compliance_score != null && a.compliance_score < 40;
      if (filter === "ai") return a.audit_source === "audit_ai";
      if (filter === "user") return a.audit_source !== "audit_ai";
      return true;
    }).filter((a) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (a.notice_id || "").toLowerCase().includes(q) ||
        (a.title || "").toLowerCase().includes(q) ||
        (a.agency || "").toLowerCase().includes(q)
      );
    });
  }, [audits, filter, query]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Past Audits · {audits.length} total</div>
          <div className="is-refresh">Click any row to open full intelligence report</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          {([
            { k: "all",  l: "All" },
            { k: "p0",   l: "P0 (< 40)" },
            { k: "ai",   l: "AI Audited" },
            { k: "user", l: "User Audited" }
          ] as const).map((f) => {
            const active = f.k === filter;
            return (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)",
                  cursor: "pointer"
                }}
              >
                {f.l}
              </button>
            );
          })}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notice ID · title · agency…"
            style={{
              flex: 1, minWidth: 240,
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px",
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none"
            }}
          />
        </div>

        <div className="sam-table">
          <div className="sam-th" style={{ gridTemplateColumns: "100px 130px minmax(0,1fr) 140px 70px 80px 110px" }}>
            <span>Date</span><span>Notice ID</span><span>Title</span><span>Agency</span><span>Source</span><span>Score</span><span>Verdict</span>
          </div>
          {filtered.length === 0 && <div className="empty-state">No audits match.</div>}
          {filtered.map((a) => {
            const r = riskFromScore(a.compliance_score);
            const rc = r.cls === "rk0" ? "var(--red)" : r.cls === "rk1" ? "var(--amber)" : "var(--gold)";
            const bg = r.cls === "rk0" ? "rgba(220,38,38,.14)" : r.cls === "rk1" ? "rgba(245,158,11,.11)" : "rgba(201,168,76,.08)";
            const recColor = a.recommendation === "PROCEED" ? "var(--green)" : a.recommendation === "DECLINE" ? "var(--red)" : "var(--amber)";
            return (
              <a
                key={a.id}
                href={`/audit/${a.id}`}
                className="sam-row"
                style={{ gridTemplateColumns: "100px 130px minmax(0,1fr) 140px 70px 80px 110px", textDecoration: "none", color: "inherit" }}
              >
                <span className="sr-date">{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className="sr-num">{a.notice_id || "—"}</span>
                <span className="sr-title" title={a.title || ""}>{a.title || "—"}</span>
                <span className="sr-agency" title={a.agency || ""}>{a.agency || "—"}</span>
                <span className="sr-badge" style={{ background: a.audit_source === "audit_ai" ? "rgba(96,165,250,.10)" : "rgba(148,163,184,.06)", color: a.audit_source === "audit_ai" ? "var(--blue)" : "var(--t40)", border: "1px solid var(--border)" }}>
                  {a.audit_source === "audit_ai" ? "AI" : "USER"}
                </span>
                {a.compliance_score != null
                  ? <span className="sr-badge" style={{ color: rc, background: bg, border: `1px solid ${rc}40` }}>{a.compliance_score}</span>
                  : <span className="sr-date">—</span>}
                <span className="sr-badge" style={{ color: recColor, background: "transparent", border: `1px solid ${recColor}40` }}>
                  {a.recommendation ? a.recommendation.replace("_", " ") : "—"}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CalendarCell {
  date: Date;
  rows: OpportunityRow[];
}

function DeadlineCalendar({ rows, onPick }: { rows: OpportunityRow[]; onPick: (row: OpportunityRow) => void }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleString("en-US", { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const cells: CalendarCell[] = [];
  // Pad leading blanks for week start (Sun-based grid).
  for (let i = 0; i < first.getDay(); i++) {
    cells.push({ date: new Date(year, month, -first.getDay() + i + 1), rows: [] });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), rows: [] });
  }

  // Synthetic deadline = created_at + 30 days. Slot each row into its cell if in this month.
  for (const r of rows) {
    const created = new Date(r.created_at);
    if (isNaN(created.getTime())) continue;
    const deadline = new Date(created);
    deadline.setDate(deadline.getDate() + 30);
    if (deadline.getFullYear() !== year || deadline.getMonth() !== month) continue;
    const cell = cells.find((c) =>
      c.date.getFullYear() === deadline.getFullYear() &&
      c.date.getMonth() === deadline.getMonth() &&
      c.date.getDate() === deadline.getDate()
    );
    if (cell) cell.rows.push(r);
  }

  function toneFor(date: Date): { bg: string; ring: string } {
    const days = Math.floor((date.getTime() - today.getTime()) / 86400_000);
    if (days < 0) return { bg: "rgba(148,163,184,.04)", ring: "var(--border)" };
    if (days < 7) return { bg: "rgba(220,38,38,.10)", ring: "rgba(220,38,38,.4)" };
    if (days <= 30) return { bg: "rgba(245,158,11,.08)", ring: "rgba(245,158,11,.32)" };
    return { bg: "rgba(74,222,128,.06)", ring: "rgba(74,222,128,.28)" };
  }

  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
        {monthName}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6, fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, color: "var(--t25)", letterSpacing: ".12em", textTransform: "uppercase" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((c, i) => {
          const inMonth = c.date.getMonth() === month;
          const tone = inMonth ? toneFor(c.date) : { bg: "transparent", ring: "transparent" };
          return (
            <div
              key={i}
              style={{
                minHeight: 70,
                padding: 6,
                background: tone.bg,
                border: `1px solid ${tone.ring}`,
                borderRadius: 3,
                opacity: inMonth ? 1 : 0.25,
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}
            >
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)", textAlign: "right" }}>{c.date.getDate()}</div>
              {c.rows.slice(0, 3).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onPick(r)}
                  style={{
                    fontFamily: "var(--mono)", fontSize: 8, color: "var(--gold)",
                    background: "rgba(201,168,76,.06)",
                    border: "1px solid rgba(201,168,76,.18)",
                    borderRadius: 2,
                    padding: "2px 4px",
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer"
                  }}
                  title={`${r.notice_id} — ${r.title || ""}`}
                >
                  {r.notice_id}
                </button>
              ))}
              {c.rows.length > 3 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t25)" }}>+{c.rows.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KOIntelPanel({ kos }: { kos: KORow[] }) {
  const [query, setQuery] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [sort, setSort] = useState<"recent" | "response" | "agency">("recent");

  const agencies = useMemo(() => {
    const set = new Set<string>();
    kos.forEach((k) => { if (k.agency) set.add(k.agency); });
    return Array.from(set).sort();
  }, [kos]);

  const visible = useMemo(() => {
    let rows = kos.filter((k) => {
      if (agencyFilter !== "all" && k.agency !== agencyFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (k.ko_email || "").toLowerCase().includes(q) ||
        (k.ko_name || "").toLowerCase().includes(q) ||
        (k.agency || "").toLowerCase().includes(q)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "response") {
        const ar = a.questions_asked > 0 ? a.questions_answered / a.questions_asked : -1;
        const br = b.questions_asked > 0 ? b.questions_answered / b.questions_asked : -1;
        return br - ar;
      }
      if (sort === "agency") return (a.agency || "").localeCompare(b.agency || "");
      return new Date(b.last_contact || 0).getTime() - new Date(a.last_contact || 0).getTime();
    });
    return rows;
  }, [kos, agencyFilter, query, sort]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">KO Intelligence · {kos.length} contacts</div>
          <div className="is-refresh">Auto-populated by audit-ai · enriched on every KO email send</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <select className="naics-select" value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
            <option value="all">All agencies</option>
            {agencies.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="naics-select" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "response" | "agency")}>
            <option value="recent">Most recent contact</option>
            <option value="response">Highest response rate</option>
            <option value="agency">Agency A→Z</option>
          </select>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name · email · agency…"
            style={{
              flex: 1, minWidth: 220,
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px",
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none"
            }}
          />
        </div>

        <div className="sam-table">
          <div className="sam-th" style={{ gridTemplateColumns: "1fr 1.4fr 130px 100px 80px 110px" }}>
            <span>Name</span><span>Email</span><span>Agency</span><span>Solicitations</span><span>Avg Resp</span><span>Response Rate</span>
          </div>
          {visible.length === 0 && <div className="empty-state">No KOs in your intelligence layer yet. Start auditing — auto-populates on draft.</div>}
          {visible.map((k) => {
            const rate = k.questions_asked > 0 ? Math.round((k.questions_answered / k.questions_asked) * 100) : null;
            const rateColor = rate == null ? "var(--gold)" : rate >= 80 ? "var(--green)" : rate >= 50 ? "var(--amber)" : "var(--red)";
            return (
              <div key={k.id} className="sam-row" style={{ gridTemplateColumns: "1fr 1.4fr 130px 100px 80px 110px" }}>
                <span className="sr-title">{k.ko_name || "—"}</span>
                <span className="sr-num">{k.ko_email}</span>
                <span className="sr-agency" title={k.agency || ""}>{k.agency || "—"}</span>
                <span className="sr-date" style={{ textAlign: "center" }}>{k.solicitations_issued ?? 0}</span>
                <span className="sr-date" style={{ textAlign: "center" }}>
                  {k.avg_response_days != null ? `${Number(k.avg_response_days).toFixed(1)}d` : "—"}
                </span>
                <span className="sr-badge" style={{ color: rateColor, background: "transparent", border: `1px solid ${rateColor}40` }}>
                  {rate != null ? `${rate}% (${k.questions_answered}/${k.questions_asked})` : "No data"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgencyIntelPanel({ agencies }: { agencies: AgencyRow[] }) {
  const [sort, setSort] = useState<"audits" | "score" | "win">("audits");

  const sorted = useMemo(() => {
    return [...agencies].sort((a, b) => {
      if (sort === "score") return (b.avg_score ?? -1) - (a.avg_score ?? -1);
      if (sort === "win")   return (b.win_rate ?? -1)  - (a.win_rate ?? -1);
      return b.total_audits - a.total_audits;
    });
  }, [agencies, sort]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Agency Intelligence · {agencies.length} agencies</div>
          <div className="is-refresh">
            <select className="naics-select" value={sort} onChange={(e) => setSort(e.target.value as "audits" | "score" | "win")}>
              <option value="audits">Most audits</option>
              <option value="score">Avg score ↓</option>
              <option value="win">Win rate ↓</option>
            </select>
          </div>
        </div>

        {sorted.length === 0 && <div className="empty-state" style={{ padding: "60px 20px" }}>No agency data yet — run audits to populate.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 14 }}>
          {sorted.map((a) => {
            const scoreColor = a.avg_score == null ? "var(--gold)" : a.avg_score >= 70 ? "var(--green)" : a.avg_score >= 40 ? "var(--amber)" : "var(--red)";
            const winColor = a.win_rate == null ? "var(--t40)" : a.win_rate >= 50 ? "var(--green)" : "var(--amber)";
            return (
              <div key={a.agency} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{a.agency}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".1em" }}>{a.total_audits} audits</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <Metric label="Avg score" value={a.avg_score != null ? `${a.avg_score}/100` : "—"} color={scoreColor} />
                  <Metric label="Win rate" value={a.win_rate != null ? `${a.win_rate}%` : "—"} color={winColor} />
                  <Metric label="Top NAICS" value={a.top_naics[0]?.code || "—"} color="var(--gold2)" />
                </div>

                {a.top_traps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Top DFARS traps</div>
                    {a.top_traps.map((t) => (
                      <div key={t.clause} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--red)", padding: "2px 0" }}>
                        ⚠ {t.clause} <span style={{ color: "var(--t40)", marginLeft: 4 }}>· {t.count}×</span>
                      </div>
                    ))}
                  </div>
                )}

                {a.recent.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Recent solicitations</div>
                    {a.recent.slice(0, 3).map((r) => (
                      <a key={r.id} href={`/audit/${r.id}`} style={{ display: "block", textDecoration: "none", padding: "4px 0", borderBottom: "1px solid rgba(201,168,76,.05)" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)" }}>{r.notice_id || "—"}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)", marginLeft: 8 }}>
                          {r.title ? r.title.slice(0, 50) + (r.title.length > 50 ? "…" : "") : "—"}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 7, color: "var(--t25)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--t40)",
  marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  background: "rgba(3,8,16,.6)",
  border: "1px solid var(--border2)",
  borderRadius: 2,
  padding: "7px 10px",
  fontFamily: "var(--mono)",
  fontSize: 11,
  color: "var(--text)",
  outline: "none"
};

// Stage assignment for kanban: derives from audits.outcome / status / recommendation.
type KanbanStage = "tracking" | "bidding" | "submitted" | "awarded" | "lost";
const STAGES: { key: KanbanStage; label: string; color: string; bg: string }[] = [
  { key: "tracking",  label: "Tracking",  color: "var(--t60)",  bg: "rgba(148,163,184,.04)" },
  { key: "bidding",   label: "Bidding",   color: "var(--gold)", bg: "rgba(201,168,76,.04)" },
  { key: "submitted", label: "Submitted", color: "var(--blue)", bg: "rgba(96,165,250,.04)" },
  { key: "awarded",   label: "Awarded",   color: "var(--green)",bg: "rgba(74,222,128,.04)" },
  { key: "lost",      label: "Lost",      color: "var(--red)",  bg: "rgba(220,38,38,.04)" }
];

function stageOf(a: AuditRow): KanbanStage {
  const outcome = ((a as unknown) as { outcome?: string | null; bid_submitted?: boolean }).outcome;
  const submitted = ((a as unknown) as { bid_submitted?: boolean }).bid_submitted;
  if (outcome === "won")  return "awarded";
  if (outcome === "lost") return "lost";
  if (submitted)          return "submitted";
  if (a.recommendation === "PROCEED" || a.recommendation === "PROCEED_WITH_CAUTION") return "bidding";
  return "tracking";
}

function PipelineKanban({ audits }: { audits: AuditRow[] }) {
  const [grouped, setGrouped] = useState<Record<KanbanStage, AuditRow[]>>(() => {
    const buckets: Record<KanbanStage, AuditRow[]> = { tracking: [], bidding: [], submitted: [], awarded: [], lost: [] };
    for (const a of audits) buckets[stageOf(a)].push(a);
    return buckets;
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function moveTo(auditId: string, stage: KanbanStage) {
    setBusyId(auditId);
    setErr(null);
    // Optimistic update
    setGrouped((prev) => {
      const next: Record<KanbanStage, AuditRow[]> = { tracking: [...prev.tracking], bidding: [...prev.bidding], submitted: [...prev.submitted], awarded: [...prev.awarded], lost: [...prev.lost] };
      let moved: AuditRow | undefined;
      for (const k of Object.keys(next) as KanbanStage[]) {
        const idx = next[k].findIndex((a) => a.id === auditId);
        if (idx !== -1) { [moved] = next[k].splice(idx, 1); break; }
      }
      if (moved) next[stage].unshift(moved);
      return next;
    });

    const today = new Date().toISOString().slice(0, 10);
    const payload: Record<string, unknown> = {};
    if (stage === "awarded") { payload.outcome = "won";    payload.outcome_date = today; }
    if (stage === "lost")    { payload.outcome = "lost";   payload.outcome_date = today; }
    if (stage === "submitted") { payload.bid_submitted = true; payload.bid_submit_date = today; payload.outcome = "pending"; }
    if (stage === "bidding")  { payload.outcome = null; payload.bid_submitted = false; }
    if (stage === "tracking") { payload.outcome = null; payload.bid_submitted = false; }

    try {
      const res = await fetch(`/api/audit/${auditId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {err && <div className="ko-status error" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "start" }}>
        {STAGES.map((s) => (
          <div
            key={s.key}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveTo(id, s.key);
              setDraggingId(null);
            }}
            style={{
              background: "var(--void2)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              minHeight: 280,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
            <div style={{ padding: "8px 12px", background: s.bg, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: s.color }}>{s.label}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: s.color }}>{grouped[s.key].length}</span>
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {grouped[s.key].length === 0 && (
                <div style={{ padding: "20px 8px", textAlign: "center", fontFamily: "var(--mono)", fontSize: 9, color: "var(--t25)", fontStyle: "italic" }}>—</div>
              )}
              {grouped[s.key].slice(0, 30).map((a) => {
                const r = riskFromScore(a.compliance_score);
                const rc = r.cls === "rk0" ? "var(--red)" : r.cls === "rk1" ? "var(--amber)" : "var(--gold)";
                const isDragging = draggingId === a.id;
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", a.id);
                      setDraggingId(a.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => { window.location.href = `/audit/${a.id}`; }}
                    style={{
                      background: "var(--void3)",
                      border: `1px solid ${isDragging ? "rgba(201,168,76,.6)" : "var(--border)"}`,
                      borderRadius: 2,
                      padding: "10px 12px",
                      cursor: busyId === a.id ? "wait" : "grab",
                      opacity: busyId === a.id ? 0.6 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      transition: "border-color .12s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.notice_id || "—"}
                      </span>
                      {a.compliance_score != null && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 2, color: rc, border: `1px solid ${rc}40` }}>
                          {a.compliance_score}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 11, fontWeight: 500, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {a.title || "—"}
                    </div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)" }}>
                      {a.agency || "—"} · {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                );
              })}
              {grouped[s.key].length > 30 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t25)", textAlign: "center", padding: "6px 0" }}>+ {grouped[s.key].length - 30} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function BudgetPanel({ naicsOptions }: { naicsOptions: string[] }) {
  const [naics, setNaics] = useState<string>("");
  const [rows, setRows] = useState<Array<{ agency: string; obligated_amount: number; prior_year_amount: number | null; delta_pct: number | null; fiscal_year: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "growing" | "shrinking">("all");
  const fy = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const url = `/api/budget?fy=${fy}` + (naics ? `&naics=${encodeURIComponent(naics)}` : "");
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setRows(data.rows || []);
        setCached(!!data.cached);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [naics, fy]);

  const visible = useMemo(() => {
    if (filterMode === "growing")    return rows.filter((r) => (r.delta_pct ?? 0) > 0);
    if (filterMode === "shrinking")  return rows.filter((r) => (r.delta_pct ?? 0) < 0);
    return rows;
  }, [rows, filterMode]);

  function fmt(n: number): string {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  }

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Congressional Budget · Defense Appropriations FY{fy}</div>
          <div className="is-refresh">
            <select className="naics-select" value={naics} onChange={(e) => setNaics(e.target.value)}>
              <option value="">All NAICS</option>
              {naicsOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ marginLeft: 6 }}>{cached ? "Cached" : "Live"} · USAspending.gov</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["all", "growing", "shrinking"] as const).map((m) => {
            const active = m === filterMode;
            const labels: Record<typeof m, string> = { all: "All", growing: "Growing ↑", shrinking: "Shrinking ↓" };
            return (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)", cursor: "pointer"
                }}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>

        {loading && <div className="empty-block">Loading budget data from USAspending.gov…</div>}
        {err && <div className="ko-status error">{err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div className="empty-state">No data returned. Try a different NAICS code or wait for cache to populate.</div>
        )}

        {visible.length > 0 && (
          <div className="sam-table">
            <div className="sam-th" style={{ gridTemplateColumns: "1fr 130px 130px 110px" }}>
              <span>Agency</span><span>FY{fy}</span><span>YoY Δ</span><span>Trend</span>
            </div>
            {visible.map((r) => {
              const deltaColor = r.delta_pct == null ? "var(--t40)" : r.delta_pct > 0 ? "var(--green)" : "var(--red)";
              const arrow = r.delta_pct == null ? "—" : r.delta_pct > 0 ? "↑" : "↓";
              const max = visible[0]?.obligated_amount || 1;
              const pct = Math.min(100, (r.obligated_amount / max) * 100);
              return (
                <div key={r.agency} className="sam-row" style={{ gridTemplateColumns: "1fr 130px 130px 110px" }}>
                  <span className="sr-title" title={r.agency}>{r.agency}</span>
                  <span className="sr-num">{fmt(r.obligated_amount)}</span>
                  <span className="sr-num" style={{ color: deltaColor }}>
                    {arrow} {r.delta_pct != null ? `${r.delta_pct > 0 ? "+" : ""}${r.delta_pct.toFixed(1)}%` : "—"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: "100%", height: 4, background: "rgba(201,168,76,.08)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: deltaColor, opacity: 0.6 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface NewsItemRow {
  source: string;
  title: string;
  link: string;
  pub_date: string | null;
  summary: string;
  tag: string;
  relevance: string;
}

function DefenseNewsPanel() {
  const [items, setItems] = useState<NewsItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/defense-news");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setItems(data.items || []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    if (tagFilter === "all") return items;
    return items.filter((i) => i.tag === tagFilter);
  }, [items, tagFilter]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Defense &amp; Federal Contracting News</div>
          <div className="is-refresh">Live RSS · 30 min cache</div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {(["all", "policy", "defense", "contract", "budget"] as const).map((t) => {
            const active = t === tagFilter;
            return (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)", cursor: "pointer"
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {loading && <div className="empty-block">Loading RSS feeds…</div>}
        {err && <div className="ko-status error">{err}</div>}
        {!loading && !err && visible.length === 0 && <div className="empty-state">No news in this filter.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 14 }}>
          {visible.slice(0, 30).map((n, i) => (
            <a
              key={i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "16px 18px", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: tagColor(n.tag), padding: "2px 8px", borderRadius: 2, border: `1px solid ${tagColor(n.tag)}40` }}>
                  {n.tag}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)" }}>
                  {n.source}{n.pub_date ? ` · ${new Date(n.pub_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: 8 }}>
                {n.title}
              </div>
              {n.summary && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)", lineHeight: 1.5, marginBottom: 8 }}>
                  {n.summary.slice(0, 200)}{n.summary.length > 200 ? "…" : ""}
                </div>
              )}
              <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(201,168,76,.04)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--gold)" }}>How this affects your bids:</strong> {n.relevance}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function tagColor(t: string): string {
  if (t === "policy")   return "var(--blue)";
  if (t === "contract") return "var(--gold)";
  if (t === "budget")   return "var(--green)";
  if (t === "defense")  return "var(--red)";
  return "var(--t40)";
}

interface SamEntityRow {
  uei: string | null;
  legal_business_name: string | null;
  cage_code: string | null;
  primary_naics: string | null;
  naics_codes: string[];
  state: string | null;
  zip: string | null;
  business_types: string[];
  certifications: string[];
  poc_name: string | null;
  poc_email: string | null;
  poc_phone: string | null;
  registration_status: string | null;
  registration_expiration: string | null;
}

function TeamingPartnersPanel({ naicsOptions }: { naicsOptions: string[] }) {
  const [naics, setNaics] = useState<string>(naicsOptions[0] || "");
  const [state, setState] = useState<string>("");
  const [setAside, setSetAside] = useState<string>("");
  const [partners, setPartners] = useState<SamEntityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<SamEntityRow | null>(null);

  async function search(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!naics) { setErr("NAICS code required"); return; }
    setLoading(true); setErr(null); setReason(null);
    try {
      const params = new URLSearchParams({ naics });
      if (state) params.set("state", state);
      if (setAside) params.set("setAside", setAside);
      const res = await fetch(`/api/teaming-partners?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPartners(data.partners || []);
      if (data.reason) setReason(data.reason);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function draftIntro(p: SamEntityRow): string {
    return [
      `Subject: Teaming inquiry · NAICS ${p.primary_naics || naics} · FARaudit-sourced`,
      "",
      `Hi ${p.poc_name || "team"},`,
      "",
      `I'm reaching out from the FARaudit network. We're tracking active solicitations under NAICS ${naics}${state ? ` in ${state}` : ""} and your firm came up as a strong fit on capability and certifications (${p.business_types.slice(0, 3).join(", ") || "registered SAM entity"}).`,
      "",
      "We'd like to explore a teaming arrangement on an upcoming opportunity. A few specifics on our side:",
      "  · Past performance: we can share our FARaudit capability statement on request",
      "  · Geography: TX + OK corridor primary, national delivery available",
      "  · Bid-ready timeline: 60–90 days with full FAR/DFARS audit complete on every solicitation",
      "",
      "Open to a 20-minute call this week or next? Happy to send our capability statement first if useful.",
      "",
      "Best,"
    ].join("\n");
  }

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Find Teaming Partners · SAM.gov registered entities</div>
          <div className="is-refresh">Live · SAM Entity Management API v3</div>
        </div>

        <form
          onSubmit={search}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "12px 14px", background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 3 }}
        >
          <select className="naics-select" value={naics} onChange={(e) => setNaics(e.target.value)} required>
            <option value="">Choose NAICS…</option>
            {naicsOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="State (e.g. TX)"
            maxLength={2}
            style={{
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px", width: 100,
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none"
            }}
          />
          <input
            type="text"
            value={setAside}
            onChange={(e) => setSetAside(e.target.value)}
            placeholder="Set-aside type (e.g. SDVOSB)"
            style={{
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px",
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none", flex: 1, minWidth: 200
            }}
          />
          <button type="submit" className="action-btn primary" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {err && <div className="ko-status error">{err}</div>}
        {reason && <div className="empty-block">{reason}</div>}

        {!loading && !err && partners.length === 0 && naics && (
          <div className="empty-state">No SAM-registered entities matched. Try removing state or set-aside filter.</div>
        )}

        {partners.length > 0 && (
          <div className="sam-table">
            <div className="sam-th" style={{ gridTemplateColumns: "1.4fr 110px 1fr 100px 100px 80px" }}>
              <span>Company</span><span>UEI</span><span>POC</span><span>State</span><span>Cert</span><span>Action</span>
            </div>
            {partners.map((p, i) => (
              <div key={p.uei || i} className="sam-row" style={{ gridTemplateColumns: "1.4fr 110px 1fr 100px 100px 80px" }}>
                <span className="sr-title">{p.legal_business_name || "—"}</span>
                <span className="sr-num">{p.uei || "—"}</span>
                <span className="sr-agency">
                  {p.poc_name || p.poc_email || "—"}
                </span>
                <span className="sr-date" style={{ textAlign: "center" }}>{p.state || "—"}</span>
                <span className="sr-date" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.business_types.join(", ")}>
                  {p.business_types[0] ? p.business_types[0].slice(0, 14) : "—"}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDraftFor(p); }}
                  style={{
                    fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                    color: "var(--gold)", background: "rgba(201,168,76,.08)",
                    border: "1px solid var(--border2)", borderRadius: 2, padding: "4px 8px", cursor: "pointer"
                  }}
                >
                  Intro
                </button>
              </div>
            ))}
          </div>
        )}

        {draftFor && (
          <div style={{ marginTop: 16, background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)" }}>
                Introduction draft · {draftFor.legal_business_name}
              </div>
              <button onClick={() => setDraftFor(null)} className="action-btn">Close</button>
            </div>
            <textarea
              className="ko-email-textarea"
              defaultValue={draftIntro(draftFor)}
              style={{ minHeight: 280 }}
            />
            <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)" }}>
              {draftFor.poc_email ? `Send to: ${draftFor.poc_email}` : "No email on SAM record — copy and use your own outreach channel."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CapStatement {
  user_id?: string;
  company_name: string | null;
  uei: string | null;
  cage_code: string | null;
  duns: string | null;
  naics_codes: string[];
  certifications: string[];
  core_competencies: string | null;
  differentiators: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_website: string | null;
  contact_address: string | null;
  past_performance: Array<{
    notice_id?: string | null;
    title?: string | null;
    agency?: string | null;
    naics_code?: string | null;
    contract_value?: string | number | null;
    period?: string | null;
  }>;
  updated_at?: string | null;
  stub?: boolean;
}

function CapabilityPanel() {
  const [stmt, setStmt] = useState<CapStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/capability-statement");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setStmt(data.statement);
        lastSent.current = JSON.stringify(data.statement);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function update<K extends keyof CapStatement>(key: K, value: CapStatement[K]) {
    setStmt((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(), 1000);
  }

  async function persist() {
    if (!stmt) return;
    const payload: Partial<CapStatement> = {
      company_name: stmt.company_name,
      uei: stmt.uei,
      cage_code: stmt.cage_code,
      duns: stmt.duns,
      naics_codes: stmt.naics_codes,
      certifications: stmt.certifications,
      core_competencies: stmt.core_competencies,
      differentiators: stmt.differentiators,
      contact_name: stmt.contact_name,
      contact_email: stmt.contact_email,
      contact_phone: stmt.contact_phone,
      contact_website: stmt.contact_website,
      contact_address: stmt.contact_address
    };
    const sig = JSON.stringify(payload);
    if (sig === lastSent.current) return;
    setSave("saving");
    setErr(null);
    try {
      const res = await fetch("/api/capability-statement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      lastSent.current = sig;
      setStmt(data.statement);
      setSavedAt(new Date());
      setSave("saved");
    } catch (e) {
      setSave("error");
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="intel-tab-content">
        <div className="intel-section">
          <div className="empty-block">Loading capability statement…</div>
        </div>
      </div>
    );
  }
  if (!stmt) {
    return (
      <div className="intel-tab-content">
        <div className="intel-section">
          <div className="ko-status error">{err || "Failed to load."}</div>
        </div>
      </div>
    );
  }

  const indicator = save === "saving" ? { cls: "saving", txt: "● Saving…" }
    : save === "error"  ? { cls: "error",  txt: `! ${err || "Save failed"}` }
    : save === "saved" && savedAt ? { cls: "saved", txt: `✓ Saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` }
    : { cls: "", txt: "Auto-saves 1s after you stop typing" };

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Capability Statement</div>
          <div className="is-refresh">
            <a className="action-btn primary" href="/api/capability-statement/pdf" download style={{ marginRight: 8 }}>
              ↓ Export PDF
            </a>
            <span>{stmt.stub ? "Draft (not yet saved)" : "Synced"}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <CapField label="Company name" value={stmt.company_name || ""} onChange={(v) => update("company_name", v)} />
          <CapField label="Contact name" value={stmt.contact_name || ""} onChange={(v) => update("contact_name", v)} />
          <CapField label="UEI" value={stmt.uei || ""} onChange={(v) => update("uei", v)} placeholder="12-character SAM UEI" />
          <CapField label="CAGE code" value={stmt.cage_code || ""} onChange={(v) => update("cage_code", v)} />
          <CapField label="Contact email" value={stmt.contact_email || ""} onChange={(v) => update("contact_email", v)} />
          <CapField label="Contact phone" value={stmt.contact_phone || ""} onChange={(v) => update("contact_phone", v)} />
          <CapField label="Website" value={stmt.contact_website || ""} onChange={(v) => update("contact_website", v)} />
          <CapField label="Address" value={stmt.contact_address || ""} onChange={(v) => update("contact_address", v)} />
        </div>

        <div style={{ marginTop: 18 }}>
          <CapTextarea label="Core competencies" value={stmt.core_competencies || ""} onChange={(v) => update("core_competencies", v)} placeholder="3–5 sentences. What you build / how you build it / who you've delivered to." />
        </div>

        <div style={{ marginTop: 14 }}>
          <CapTextarea label="Differentiators" value={stmt.differentiators || ""} onChange={(v) => update("differentiators", v)} placeholder="Why FARaudit-tier intelligence + your delivery wins where others can't." />
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <CapTagList label="NAICS codes" values={stmt.naics_codes} onChange={(v) => update("naics_codes", v)} />
          <CapTagList label="Certifications" values={stmt.certifications} onChange={(v) => update("certifications", v)} />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 10 }}>
            Past performance · auto-pulled from won audits
          </div>
          {stmt.past_performance.length === 0 ? (
            <div className="empty-block">No won audits yet. Outcomes you mark "won" on /audit/[id] will appear here automatically.</div>
          ) : (
            stmt.past_performance.map((p, i) => (
              <div key={i} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderLeft: "3px solid var(--gold)", borderRadius: 2, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{p.title || p.notice_id || "—"}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)", marginTop: 4 }}>
                  {p.agency || "—"}{p.naics_code ? ` · NAICS ${p.naics_code}` : ""}
                  {p.contract_value ? ` · ${p.contract_value}` : ""}
                  {p.period ? ` · ${p.period}` : ""}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={`notes-status ${indicator.cls}`} style={{ marginTop: 18 }}>{indicator.txt}</div>
      </div>
    </div>
  );
}

function CapField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, width: "100%" }}
      />
    </div>
  );
}

function CapTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{ ...inputStyle, width: "100%", fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
      />
    </div>
  );
}

function CapTagList({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {values.map((v, i) => (
          <span key={`${v}-${i}`} style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 2, background: "rgba(201,168,76,.08)", border: "1px solid var(--border2)", color: "var(--gold)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              style={{ background: "transparent", border: "none", color: "var(--gold)", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1, padding: 0 }}
              aria-label="Remove"
            >×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const v = draft.trim();
            if (v && !values.includes(v)) onChange([...values, v]);
            setDraft("");
          }
        }}
        placeholder="Add — press Enter"
        style={{ ...inputStyle, width: "100%" }}
      />
    </div>
  );
}

function RFIResponsePanel({ opportunities }: { opportunities: OpportunityRow[] }) {
  const presol = useMemo(() => {
    return opportunities.filter((o) => {
      const nt = (o.notice_type || "").toLowerCase();
      return nt === "pre_sol" || nt === "sources_sought";
    });
  }, [opportunities]);

  const [selected, setSelected] = useState<OpportunityRow | null>(null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function buildDraft(row: OpportunityRow) {
    setSelected(row);
    setDraft("");
    setErr(null);
    setDrafting(true);
    try {
      const res = await fetch("/api/rfi-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_audit_id: row.id,
          notice_id: row.notice_id,
          title: row.title,
          agency: row.agency,
          naics_code: row.naics_code,
          notice_type: row.notice_type
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDraft(data.draft || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(draft); } catch { /* */ }
  }

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Pre-Solicitation Intelligence · 60–90 day upstream</div>
          <div className="is-refresh">{presol.length} pre-sol / sources-sought notices</div>
        </div>

        {presol.length === 0 ? (
          <div className="empty-state" style={{ padding: "60px 20px" }}>
            No pre-sol or sources-sought notices in the queue. sam-ingest will populate once expanded notice-type pull is live.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, alignItems: "start" }}>
            <div>
              {presol.map((r) => (
                <div
                  key={r.id}
                  onClick={() => buildDraft(r)}
                  style={{
                    background: selected?.id === r.id ? "rgba(167,139,250,.06)" : "var(--void3)",
                    border: `1px solid ${selected?.id === r.id ? "rgba(167,139,250,.4)" : "var(--border)"}`,
                    borderRadius: 3, padding: "12px 14px", marginBottom: 8, cursor: "pointer"
                  }}
                >
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "#A78BFA", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
                    {r.notice_type === "sources_sought" ? "Sources Sought" : "Pre-Solicitation"}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)" }}>{r.notice_id}</div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 12, fontWeight: 600, color: "var(--text)", marginTop: 4, lineHeight: 1.3 }}>
                    {r.title || "—"}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t60)", marginTop: 4 }}>
                    {r.agency || "—"} · NAICS {r.naics_code || "—"}
                  </div>
                </div>
              ))}
            </div>
            <div>
              {!selected && (
                <div className="empty-state" style={{ background: "var(--void3)", border: "1px dashed var(--border)" }}>
                  ← Select a notice to draft a strategic RFI response.
                </div>
              )}
              {selected && (
                <div style={{ background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: 16 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>
                    Strategic Response · {selected.notice_id}
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 14, color: "var(--text)", marginBottom: 14 }}>
                    {selected.title || "—"}
                  </div>
                  {drafting && <div className="empty-block">Drafting response… (this can take 8–15 seconds)</div>}
                  {err && <div className="ko-status error">{err}</div>}
                  {draft && (
                    <>
                      <textarea
                        className="ko-email-textarea"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        style={{ minHeight: 360 }}
                      />
                      <div className="ko-email-actions" style={{ marginTop: 10 }}>
                        <button type="button" className="action-btn" onClick={copy}>Copy</button>
                        <button type="button" className="action-btn" onClick={() => buildDraft(selected)} disabled={drafting}>
                          ↻ Re-draft
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
