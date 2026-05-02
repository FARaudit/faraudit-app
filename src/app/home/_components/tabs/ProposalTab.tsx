"use client";

import StatusPill from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";

const SECTION_L_PLACEHOLDER = [
  "Page-limit compliance",
  "Volume structure (Vol I — Tech · Vol II — Past Performance · Vol III — Price)",
  "Format requirements (font · margin · spacing)",
  "Past performance reference count",
  "Demo / oral presentation",
  "Submission method (eBuy · email · physical)",
  "Pre-proposal questions deadline"
];

const SECTION_M_PLACEHOLDER = [
  { factor: "Technical", weight: "Most important" },
  { factor: "Past Performance", weight: "Slightly less important than Technical" },
  { factor: "Price", weight: "Combined less important than non-price factors" }
];

export default function ProposalTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="Proposal workspace"
        title="Proposal"
        subtitle="Section L compliance · Section M alignment · doc-type · risk-adjusted pricing"
      />

      <EmptyBanner
        title="No active proposal"
        body="Move a card to Bidding in the Pipeline tab to start a proposal workspace."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="Section L · Preparation Instructions">
          <SubLabel>Auto-extracted from audit</SubLabel>
          <ul style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, listStyle: "none" }}>
            {SECTION_L_PLACEHOLDER.map((item, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <input type="checkbox" disabled style={{ marginTop: 4, accentColor: "var(--gold)", opacity: 0.4 }} />
                <span style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--t60)" }}>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Section M · Evaluation Factors">
          <SubLabel>Weight-aligned focus map</SubLabel>
          <ul style={{ display: "flex", flexDirection: "column", marginTop: 8, listStyle: "none" }}>
            {SECTION_M_PLACEHOLDER.map((f) => (
              <li key={f.factor} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bd-border)", gap: 10 }}>
                <span style={{ fontFamily: "var(--bd-serif)", fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{f.factor}</span>
                <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t40)", textAlign: "right", maxWidth: "60%" }}>{f.weight}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Document type">
          <SubLabel>Auto-classified by audit pre-step</SubLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {(["SOW", "PWS", "SOO", "RFP", "RFQ", "IFB"] as const).map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--bd-mono)", fontSize: 10 }}>
                <span style={{ color: "var(--gold)" }}>{t}</span>
                <StatusPill kind="neutral">—</StatusPill>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Risk-adjusted pricing">
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--t60)", lineHeight: 1.6 }}>
            Reserves auto-suggested from <span style={{ color: "var(--gold)" }}>risks_json</span> — hex-chrome rework · CMMC certification · FOB freight liability · schedule contingency.
          </p>
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t25)", fontStyle: "italic", marginTop: 10 }}>
            No active solicitation — open a proposal to see specific reserves.
          </p>
        </Card>
      </div>

      <V2Notice items={[
        "Drag audit findings onto proposal sections",
        "Real-time co-edit with team",
        "Compliance checkbox state persists per solicitation",
        "Auto-generate Vol I / II / III scaffolds",
        "Pricing reserves calculated from compliance_json + risks_json"
      ]} />
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--void2)", border: "1px solid var(--bd-border)", borderRadius: 3, padding: 16 }}>
      <h3 style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85, marginBottom: 6 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t25)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

export function EmptyBanner({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: "var(--void2)", border: "1px dashed var(--bd-border2)", borderRadius: 3, padding: "20px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--bd-serif)", fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--t60)" }}>
        {body}
      </div>
    </div>
  );
}
