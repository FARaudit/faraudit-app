"use client";

import { SectionHeader, V2Notice } from "./PipelineTab";
import { Card, EmptyBanner, SubLabel } from "./ProposalTab";

export default function AwardsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="Performance phase"
        title="Awards"
        subtitle="Contract awards · WAWF routing · delivery schedule · past-performance build"
      />

      <EmptyBanner
        title="No awards yet"
        body="When a Pipeline card moves to Awarded, this tab populates with WAWF routing, delivery schedule, and starts auto-building past-performance — every won contract becomes a future reference, locked into the FARaudit corpus."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: "1px solid var(--bd-border)", borderRadius: 3, overflow: "hidden" }}>
        <SitCard label="Active awards"        value="0"  sub="contracts in performance" tone="green" />
        <SitCard label="Total won (lifetime)" value="$0" sub="across 0 contracts" tone="gold" hasBorder />
        <SitCard label="Win rate"             value="—"  sub="awarded / submitted" tone="neutral" hasBorder />
      </div>

      <V2Notice items={[
        "Awards table sourced from awards_won (V2 schema)",
        "Per-award WAWF DoDAAC routing card",
        "Delivery schedule with milestone reminders",
        "Past-performance auto-build · every award becomes a reference",
        "Win rate by NAICS · agency · contract type · KO",
        "Win rate chart vs corpus average"
      ]} />
    </div>
  );
}

function SitCard({
  label, value, sub, tone, hasBorder
}: {
  label: string;
  value: string;
  sub: string;
  tone: "green" | "gold" | "neutral";
  hasBorder?: boolean;
}) {
  const valueColor = tone === "green" ? "var(--green)" : tone === "gold" ? "var(--gold2)" : "var(--t40)";
  return (
    <div
      style={{
        background: "var(--void3)",
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        borderLeft: hasBorder ? "1px solid var(--bd-border)" : "none"
      }}
    >
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--t25)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 28, fontWeight: 700, lineHeight: 1, color: valueColor }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t40)", marginTop: 1 }}>
        {sub}
      </div>
    </div>
  );
}
