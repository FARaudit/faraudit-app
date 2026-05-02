"use client";

import StatusPill from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";

const SECTION_L_PLACEHOLDER = [
  "Page-limit compliance",
  "Volume structure (Vol I — Technical · Vol II — Past Performance · Vol III — Price)",
  "Format requirements (font · margin · spacing)",
  "Past performance reference count",
  "Demo / oral presentation requirement",
  "Submission method (eBuy · email · physical)",
  "Pre-proposal questions deadline"
];

const SECTION_M_PLACEHOLDER = [
  { factor: "Technical", weight: "Most important" },
  { factor: "Past Performance", weight: "Slightly less important than Technical" },
  { factor: "Price", weight: "When combined less important than non-price factors" }
];

export default function ProposalTab() {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Proposal Workspace"
        subtitle="Active proposal scaffold · Section L compliance · Section M alignment · risk-adjusted pricing"
      />

      <div className="bg-[#091322] border border-[#122240] rounded p-4 text-center text-[12px] text-[#5B8AB8]">
        <div className="text-[14px] text-[#EDF4FF] mb-1">No active proposal</div>
        <div>Select a solicitation from the Pipeline → Bidding column to start a proposal workspace.</div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Section L — Preparation Instructions">
          <div className="text-[11px] text-[#5B8AB8] mb-2">Compliance checklist (auto-extracted from audit):</div>
          <ul className="space-y-1.5 text-[12px]">
            {SECTION_L_PLACEHOLDER.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <input type="checkbox" disabled className="mt-1 accent-[#378ADD] disabled:opacity-30" />
                <span className="text-[#B5D4F4]">{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Section M — Evaluation Factors">
          <div className="text-[11px] text-[#5B8AB8] mb-2">Weight-aligned focus map:</div>
          <ul className="space-y-2 text-[12px]">
            {SECTION_M_PLACEHOLDER.map((f) => (
              <li key={f.factor} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#122240] last:border-b-0">
                <span className="text-[#EDF4FF] font-medium">{f.factor}</span>
                <span className="text-[#5B8AB8] text-[11px] text-right max-w-[60%]">{f.weight}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Document type">
          <div className="space-y-1.5">
            {(["SOW", "PWS", "SOO", "RFP", "RFQ", "IFB"] as const).map((t) => (
              <div key={t} className="flex items-center justify-between text-[12px]">
                <span className="text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}>{t}</span>
                <StatusPill kind="neutral">—</StatusPill>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-[#5B8AB8]">Auto-classified by audit pre-step.</div>
        </Card>

        <Card title="Risk-adjusted pricing">
          <div className="text-[12px] text-[#5B8AB8] leading-relaxed">
            Price reserves auto-suggested from risks_json (hex-chrome rework reserve · CMMC certification ramp ·
            FOB freight liability · schedule contingency).
          </div>
          <div className="mt-3 text-[11px] text-[#2D5280] italic">
            No active solicitation — open a proposal to see specific reserves.
          </div>
        </Card>
      </div>

      <V2Notice items={[
        "Drag audit findings onto proposal sections",
        "Real-time co-edit with team",
        "Compliance checkbox state persists per solicitation",
        "Auto-generate Vol I / II / III outline scaffolds",
        "Pricing reserves calculated from compliance_json + risks_json"
      ]} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#091322] border border-[#122240] rounded p-4">
      <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8] mb-3">{title}</h3>
      {children}
    </section>
  );
}
