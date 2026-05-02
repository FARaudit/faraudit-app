"use client";

import { useState, useEffect } from "react";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import TabNav from "./TabNav";
import PipelineTab from "./tabs/PipelineTab";
import OpportunitiesTab from "./tabs/OpportunitiesTab";
import AuditTab from "./tabs/AuditTab";
import ProposalTab from "./tabs/ProposalTab";
import SubmissionTab from "./tabs/SubmissionTab";
import AwardsTab from "./tabs/AwardsTab";
import CorpusTab from "./tabs/CorpusTab";
import type { CorpusStats, OpportunityRow, AuditRow, HeaderCounter } from "@/lib/bd-os/queries";

export type TabKey =
  | "pipeline"
  | "opportunities"
  | "audit"
  | "proposal"
  | "submission"
  | "awards"
  | "corpus";

export interface TabSpec {
  key: TabKey;
  label: string;
  dot?: "red" | "gold" | "green" | "blue";
  count?: number;
  countTone?: "red" | "gold" | "green";
}

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
  corpus: CorpusStats;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
}

export default function BdOsShell({ user, counter, corpus, opportunities, recentAudits }: Props) {
  const [tab, setTab] = useState<TabKey>("pipeline");

  const TABS: TabSpec[] = [
    { key: "pipeline", label: "Pipeline", dot: "red", count: opportunities.filter((o) => o.status === "pending").length, countTone: "red" },
    { key: "opportunities", label: "Opportunities", dot: "green", count: opportunities.length, countTone: "green" },
    { key: "audit", label: "Audit", dot: "gold" },
    { key: "proposal", label: "Proposal" },
    { key: "submission", label: "Submission" },
    { key: "awards", label: "Awards" },
    { key: "corpus", label: "Corpus", dot: "gold", count: corpus.total_audits, countTone: "gold" }
  ];

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as TabKey;
    if (TABS.find((t) => t.key === fromHash)) setTab(fromHash);
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "") as TabKey;
      if (TABS.find((t) => t.key === h)) setTab(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(next: TabKey) {
    setTab(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${next}`);
  }

  return (
    <div
      className="bd-os"
      style={{
        background: "var(--void)",
        color: "var(--text)",
        fontFamily: "var(--bd-serif)",
        WebkitFontSmoothing: "antialiased",
        height: "100vh",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "var(--bd-sidebar) 1fr",
        gridTemplateRows: "var(--bd-topbar) 1fr"
      }}
    >
      <Topbar user={user} counter={counter} />
      <Sidebar />

      <main
        style={{
          gridColumn: "2 / -1",
          gridRow: "2",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          height: "calc(100vh - var(--bd-topbar))"
        }}
      >
        <TabNav tabs={TABS} active={tab} onSelect={selectTab} />
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {tab === "pipeline" && <PipelineTab opportunities={opportunities} audits={recentAudits} />}
          {tab === "opportunities" && <OpportunitiesTab rows={opportunities} />}
          {tab === "audit" && <AuditTab recent={recentAudits} />}
          {tab === "proposal" && <ProposalTab />}
          {tab === "submission" && <SubmissionTab />}
          {tab === "awards" && <AwardsTab />}
          {tab === "corpus" && <CorpusTab stats={corpus} />}
        </div>
      </main>
    </div>
  );
}
