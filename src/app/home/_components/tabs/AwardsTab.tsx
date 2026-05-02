"use client";

import { SectionHeader, V2Notice } from "./PipelineTab";

export default function AwardsTab() {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Awards"
        subtitle="Contract awards · WAWF routing · delivery schedule · past-performance record"
      />

      <div className="bg-[#091322] border border-[#122240] rounded p-12 text-center">
        <div className="text-[#EDF4FF] text-[16px] font-medium mb-2">No awards yet</div>
        <div className="text-[12px] text-[#5B8AB8] max-w-md mx-auto leading-relaxed">
          When a Pipeline card moves to Awarded, this tab populates with WAWF routing codes, delivery schedule,
          and starts building the past-performance record automatically — every won contract becomes a future
          past-performance reference for FARaudit customers, locked into the FARaudit corpus.
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Active awards">
          <div className="text-[24px] font-medium text-[#EDF4FF]" style={{ fontFamily: "var(--mono)" }}>0</div>
          <div className="text-[11px] text-[#5B8AB8]">contracts in performance</div>
        </Card>
        <Card title="Total won (lifetime)">
          <div className="text-[24px] font-medium text-[#EDF4FF]" style={{ fontFamily: "var(--mono)" }}>$0</div>
          <div className="text-[11px] text-[#5B8AB8]">across 0 contracts</div>
        </Card>
        <Card title="Win rate">
          <div className="text-[24px] font-medium text-[#5B8AB8]" style={{ fontFamily: "var(--mono)" }}>—</div>
          <div className="text-[11px] text-[#5B8AB8]">awarded / submitted</div>
        </Card>
      </div>

      <V2Notice items={[
        "Awards table sourced from awards_won (V2 schema)",
        "Per-award WAWF DoDAAC routing card",
        "Delivery schedule with milestone reminders",
        "Past-performance auto-build: every award becomes a reference",
        "Win/loss analytics: by NAICS · agency · contract type · KO",
        "Win rate chart + benchmark vs corpus average"
      ]} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#091322] border border-[#122240] rounded p-4">
      <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8] mb-2">{title}</h3>
      {children}
    </section>
  );
}
