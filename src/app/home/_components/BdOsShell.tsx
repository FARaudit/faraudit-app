"use client";

import { useState, useEffect } from "react";
import Header from "./Header";
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

const TABS: { key: TabKey; label: string }[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "opportunities", label: "Opportunities" },
  { key: "audit", label: "Audit" },
  { key: "proposal", label: "Proposal" },
  { key: "submission", label: "Submission" },
  { key: "awards", label: "Awards" },
  { key: "corpus", label: "Corpus" }
];

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
  corpus: CorpusStats;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
}

export default function BdOsShell({ user, counter, corpus, opportunities, recentAudits }: Props) {
  const [tab, setTab] = useState<TabKey>("pipeline");

  // Persist tab in URL hash so deep-links + reload preserve location.
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as TabKey;
    if (TABS.find((t) => t.key === fromHash)) setTab(fromHash);
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "") as TabKey;
      if (TABS.find((t) => t.key === h)) setTab(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function selectTab(next: TabKey) {
    setTab(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${next}`);
  }

  return (
    <div className="min-h-screen bg-[#050D1A] text-[#EDF4FF]" style={{ fontFamily: "var(--sans)" }}>
      <Header user={user} counter={counter} />
      <TabNav tabs={TABS} active={tab} onSelect={selectTab} />
      <main className="px-6 py-6 max-w-[1600px] mx-auto">
        {tab === "pipeline"      && <PipelineTab opportunities={opportunities} audits={recentAudits} />}
        {tab === "opportunities" && <OpportunitiesTab rows={opportunities} />}
        {tab === "audit"         && <AuditTab recent={recentAudits} />}
        {tab === "proposal"      && <ProposalTab />}
        {tab === "submission"    && <SubmissionTab />}
        {tab === "awards"        && <AwardsTab />}
        {tab === "corpus"        && <CorpusTab stats={corpus} />}
      </main>
    </div>
  );
}
