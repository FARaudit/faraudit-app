"use client";

import StatusPill from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";
import { Card, SubLabel, EmptyBanner } from "./ProposalTab";

const CHECKLIST_PLACEHOLDER = [
  { item: "Vol I — Technical Approach finalized", auto: "Section L page-limit + format check" },
  { item: "Vol II — Past Performance references compiled", auto: "past_performance table (V2)" },
  { item: "Vol III — Price reflects risk reserves", auto: "compliance_json.fob_conflicts + risks reserves" },
  { item: "Required certifications attached (Cr-VI free, CMMC, ITAR)", auto: "compliance_json.dfars_traps" },
  { item: "Reps + Certs (52.204-24, -26) up to date", auto: "required_certifications" },
  { item: "WAWF routing codes verified", auto: "compliance_json.wawf_routing" },
  { item: "Base access request filed (if 5352.242-9000)", auto: "dfars_trap_risks.base_access_risk" },
  { item: "Submission method confirmed (eBuy / email / physical)", auto: "Section L summary" },
  { item: "Pre-submission KO clarification questions answered", auto: "manual" },
  { item: "Submission deadline + timezone confirmed", auto: "compliance_json.deadlines" }
];

export default function SubmissionTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="Pre-submission"
        title="Submission"
        subtitle="Auto-generated checklist · deadline tracker · KO contact confirmation"
      />

      <EmptyBanner
        title="No active submission"
        body="Move a Pipeline card from Bidding → Submitted to activate the submission workspace."
      />

      <section style={{ background: "var(--void2)", border: "1px solid var(--bd-border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(201,168,76,.025)" }}>
          <h3 style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
            Pre-submission checklist
          </h3>
          <StatusPill kind="neutral">0 / {CHECKLIST_PLACEHOLDER.length}</StatusPill>
        </div>
        <ul style={{ listStyle: "none" }}>
          {CHECKLIST_PLACEHOLDER.map((c, i) => (
            <li key={i} style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10, borderBottom: "1px solid var(--bd-border)" }}>
              <input type="checkbox" disabled style={{ marginTop: 3, accentColor: "var(--gold)", opacity: 0.4 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--bd-serif)", fontSize: 12, color: "var(--text)" }}>{c.item}</div>
                <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t40)", marginTop: 2 }}>{c.auto}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="Deadline tracker">
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 22, fontWeight: 700, color: "var(--gold)", letterSpacing: "-0.02em", marginTop: 6 }}>
            — : — : —
          </div>
          <SubLabel>No active deadline · select a solicitation</SubLabel>
        </Card>
        <Card title="CO contact">
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--t60)", lineHeight: 1.6, marginTop: 6 }}>
            Auto-extracted from solicitation cover sheet during audit. Email confirmation status logged here.
          </p>
        </Card>
      </div>

      <V2Notice items={[
        "Live countdown timer with timezone",
        "Telegram alerts at T-24h · T-2h · T-30min",
        "Submission status (in flight · acknowledged · accepted · rejected) with audit trail",
        "Auto-generated KO clarification email drafts"
      ]} />
    </div>
  );
}
