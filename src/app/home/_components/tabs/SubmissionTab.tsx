"use client";

import StatusPill from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";

const CHECKLIST_PLACEHOLDER = [
  { item: "Volume I — Technical Approach finalized", auto: "from Section L page-limit + format check" },
  { item: "Volume II — Past Performance references compiled", auto: "from past_performance table (V2)" },
  { item: "Volume III — Price reflects risk reserves", auto: "from compliance_json.fob_conflicts + risks_json reserves" },
  { item: "Required certifications attached (Cr-VI free, CMMC, ITAR)", auto: "from compliance_json.dfars_traps" },
  { item: "Representations + Certifications (52.204-24, -26) up to date", auto: "from required_certifications" },
  { item: "WAWF routing codes verified", auto: "from compliance_json.wawf_routing" },
  { item: "Base access request filed (if 5352.242-9000)", auto: "from dfars_trap_risks.base_access_risk" },
  { item: "Submission method confirmed (eBuy / email / physical)", auto: "from Section L summary" },
  { item: "Pre-submission KO clarification questions answered", auto: "manual" },
  { item: "Submission deadline + timezone confirmed", auto: "from compliance_json.deadlines" }
];

export default function SubmissionTab() {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Submission"
        subtitle="Pre-submission checklist · deadline tracker · KO contact confirmation"
      />

      <div className="bg-[#091322] border border-[#122240] rounded p-4 text-center text-[12px] text-[#5B8AB8]">
        <div className="text-[14px] text-[#EDF4FF] mb-1">No active submission</div>
        <div>Move a card from Bidding → Submitted in the Pipeline tab to activate the submission workspace.</div>
      </div>

      <section className="bg-[#091322] border border-[#122240] rounded">
        <div className="px-4 h-10 flex items-center justify-between border-b border-[#122240]">
          <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">Pre-submission checklist (auto-generated from audit)</h3>
          <StatusPill kind="neutral">0 / {CHECKLIST_PLACEHOLDER.length}</StatusPill>
        </div>
        <ul className="divide-y divide-[#122240]">
          {CHECKLIST_PLACEHOLDER.map((c, i) => (
            <li key={i} className="px-4 py-3 flex items-start gap-3">
              <input type="checkbox" disabled className="mt-1 accent-[#378ADD] disabled:opacity-30" />
              <div className="flex-1">
                <div className="text-[12px] text-[#EDF4FF]">{c.item}</div>
                <div className="text-[11px] text-[#5B8AB8]">{c.auto}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-[#091322] border border-[#122240] rounded p-4">
          <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8] mb-3">Deadline tracker</h3>
          <div className="text-[14px] text-[#EDF4FF] mb-1">— : — : —</div>
          <div className="text-[11px] text-[#5B8AB8]">No active deadline · select a solicitation from Pipeline.</div>
        </section>
        <section className="bg-[#091322] border border-[#122240] rounded p-4">
          <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8] mb-3">CO contact</h3>
          <div className="text-[12px] text-[#5B8AB8]">Auto-extracted from solicitation cover sheet during audit. Email confirmation status logged here.</div>
        </section>
      </div>

      <V2Notice items={[
        "Live countdown timer with timezone handling",
        "Deadline alerts via Telegram at T-24h, T-2h, T-30min",
        "Submission status (in flight · acknowledged · accepted · rejected) with audit trail",
        "Auto-generated KO clarification email drafts pre-populated"
      ]} />
    </div>
  );
}
