"use client";

import { useState, useMemo, useEffect } from "react";
import type {
  HeaderCounter,
  OpportunityRow,
  AuditRow
} from "@/lib/bd-os/queries";

type TabKey = "home" | "audit" | "sam" | "budget" | "news" | "pipeline" | "past-audits";
type FilterKey = "All" | "P0 · P1" | "≤7 Days" | "Small Business" | "IDIQ";

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
}

const FILTERS: FilterKey[] = ["All", "P0 · P1", "≤7 Days", "Small Business", "IDIQ"];

export default function HomeClient({ user, counter, opportunities, recentAudits }: Props) {
  const [tab, setTab] = useState<TabKey>("home");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [naics, setNaics] = useState<string>("all");
  const [feedTs, setFeedTs] = useState<string>("just now");

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

            {/* BUDGET */}
            <div className={`tab-panel ${tab === "budget" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header">
                    <div className="is-title">Congressional Budget · Defense Appropriations</div>
                    <div className="is-refresh">USASpending.gov ingestion · V2</div>
                  </div>
                  <div className="empty-state" style={{ padding: "60px 20px" }}>
                    Budget tracker wires after USASpending.gov ingestion ships.
                  </div>
                </div>
              </div>
            </div>

            {/* NEWS */}
            <div className={`tab-panel ${tab === "news" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header">
                    <div className="is-title">Defense &amp; Federal Contracting News</div>
                    <div className="is-refresh">NewsAPI worker · V2</div>
                  </div>
                  <div className="empty-state" style={{ padding: "60px 20px" }}>
                    News feed wires after the NewsAPI worker ships.
                  </div>
                </div>
              </div>
            </div>

            {/* PIPELINE */}
            <div className={`tab-panel ${tab === "pipeline" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header"><div className="is-title">Deadline Calendar</div><div className="is-refresh">Synthetic +30d window from posted date · sam-ingest will populate response_deadline once column wired</div></div>
                  <DeadlineCalendar rows={enriched.map((e) => e.row)} onPick={() => setTab("audit")} />
                </div>
                <div className="intel-section">
                  <div className="is-header"><div className="is-title">Active Solicitations · Bid Stage</div></div>
                  {filtered.length === 0 && <div className="empty-state">No active solicitations.</div>}
                  {filtered.slice(0, 20).map((r) => {
                    const rc = r.risk === "rp0" ? "var(--red)" : r.risk === "rp1" ? "var(--amber)" : "var(--gold)";
                    return (
                      <div key={r.row.id} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 3, padding: "16px 20px", marginBottom: 10, cursor: "pointer" }} onClick={() => setTab("audit")}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                          <div style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{r.row.title || "—"}</div>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, padding: "3px 8px", borderRadius: 2, color: rc, border: `1px solid ${rc}40`, whiteSpace: "nowrap" }}>{r.riskLabel}</span>
                        </div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, color: "var(--t40)", marginBottom: 10 }}>{r.row.notice_id} · {r.row.agency || "—"}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: r.row.status === "processed" ? "var(--green)" : "var(--gold)", opacity: .8 }}>
                          {r.row.status === "processed" ? "✓ Audit Complete" : "● Queued for audit"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* PAST AUDITS */}
            <div className={`tab-panel ${tab === "past-audits" ? "active" : ""}`}>
              <PastAuditsPanel audits={recentAudits} />
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
  return (
    <div className={`feed-row ${r.risk}`} onClick={onClick}>
      <span className="f-naics">{r.row.naics_code || "—"}</span>
      <div style={{ minWidth: 0 }}><div className="f-title" title={r.row.title || ""}>{r.row.title || "—"}</div></div>
      <span className="f-agency" title={r.row.agency || ""}>{r.row.agency || "—"}</span>
      <span className="f-val">—</span>
      <span className={`f-days ${r.daysCls === "none" ? "" : r.daysCls}`}>{r.daysLabel}</span>
      <span className="f-type">—</span>
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
