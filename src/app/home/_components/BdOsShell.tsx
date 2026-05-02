"use client";

import { useState, useEffect } from "react";
import Topbar from "./Topbar";
import Sidebar, { type ViewKey, NAV } from "./Sidebar";
import IntelligenceHomeView from "./views/IntelligenceHomeView";
import RunAuditView from "./views/RunAuditView";
import PipelineView from "./views/PipelineView";
import PastAuditsView from "./views/PastAuditsView";
import SamFeedView from "./views/SamFeedView";
import DefenseNewsView from "./views/DefenseNewsView";
import PlaceholderView from "./views/PlaceholderView";
import type {
  CorpusStats,
  OpportunityRow,
  AuditRow,
  HeaderCounter,
  HomeStats
} from "@/lib/bd-os/queries";

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
  corpus: CorpusStats;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
  homeStats: HomeStats;
}

export default function BdOsShell({
  user, counter, corpus, opportunities, recentAudits, homeStats
}: Props) {
  const [view, setView] = useState<ViewKey>("intelligence-home");

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as ViewKey;
    if (NAV.find((n) => n.key === fromHash)) setView(fromHash);
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "") as ViewKey;
      if (NAV.find((n) => n.key === h)) setView(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function selectView(next: ViewKey) {
    setView(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${next}`);
  }

  return (
    <div
      className="bd-os"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text)",
        fontFamily: "var(--bd-sans)",
        WebkitFontSmoothing: "antialiased",
        height: "100vh",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "var(--bd-sidebar) 1fr",
        gridTemplateRows: "var(--bd-topbar) 1fr"
      }}
    >
      <Topbar user={user} counter={counter} />
      <Sidebar active={view} onSelect={selectView} />

      <main
        style={{
          gridColumn: "2 / -1",
          gridRow: "2",
          overflow: "auto",
          minWidth: 0,
          height: "calc(100vh - var(--bd-topbar))",
          padding: "20px 24px"
        }}
      >
        <div className="fade-in" key={view}>
          {view === "intelligence-home" && (
            <IntelligenceHomeView
              homeStats={homeStats}
              opportunities={opportunities}
              recentAudits={recentAudits}
              counter={counter}
              onNav={selectView}
            />
          )}
          {view === "run-audit" && <RunAuditView recent={recentAudits} />}
          {view === "pipeline" && <PipelineView opportunities={opportunities} />}
          {view === "past-audits" && <PastAuditsView audits={recentAudits} />}
          {view === "reports" && (
            <PlaceholderView
              title="Reports Library"
              eyebrow="Saved + scheduled"
              body="Saved audit reports, scheduled exports (PDF / DOCX), and customer-facing report links live here. V2 — wire after first design-partner customer signs."
              comingNext={[
                "PDF export with FARaudit cover sheet + executive risk summary",
                "Scheduled weekly NAICS digest export",
                "Customer-facing report URLs (read-only) for prospect sharing"
              ]}
            />
          )}
          {view === "sam-feed" && <SamFeedView rows={opportunities} />}
          {view === "budget-tracker" && (
            <PlaceholderView
              title="Budget Tracker"
              eyebrow="DoD spend by NAICS · agency · fiscal year"
              body="USASpending.gov-sourced rollups. DoD FY2026 = $895.2B. Click any agency to see their solicitation history + your win rate against them."
              comingNext={[
                "USASpending.gov ingestion (separate Railway worker)",
                "Agency × NAICS spend matrix",
                "Quarter-over-quarter trend analysis"
              ]}
            />
          )}
          {view === "defense-news" && <DefenseNewsView />}
          {view === "settings" && (
            <PlaceholderView
              title="Profile & Settings"
              eyebrow={`Signed in as ${user.email}`}
              body="Account-level settings live at /settings. NAICS watchlist persistence + team membership coming next."
              comingNext={[
                "Custom NAICS watchlist save/load (per user)",
                "Team membership (multi-seat orgs)",
                "API key management for raw access to your audit corpus"
              ]}
            />
          )}
        </div>
      </main>
    </div>
  );
}
