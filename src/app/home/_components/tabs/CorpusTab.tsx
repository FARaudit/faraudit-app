"use client";

import StatusPill from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";
import type { CorpusStats } from "@/lib/bd-os/queries";

interface Props {
  stats: CorpusStats;
}

export default function CorpusTab({ stats }: Props) {
  const totalDetectedTraps = stats.trap_breakdown.reduce((acc, t) => acc + t.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="Compounding moat"
        title="Corpus"
        subtitle="Live counts from apex-production · every audit makes the next audit smarter"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "1px solid var(--bd-border)", borderRadius: 3, overflow: "hidden" }}>
        <SitCard label="Solicitations audited" value={stats.total_audits} tone="gold" sub="all time" />
        <SitCard label="Traps detected" value={stats.total_corpus_rows} tone="red" sub="DFARS + FAR flags" hasBorder />
        <SitCard label="Audits last 30d" value={stats.recent_30d_audits} tone="green" sub="rolling window" hasBorder />
        <SitCard label="Queue · pending" value={stats.pending_queue_size} tone="amber" sub="awaiting audit" hasBorder />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel
          title="DFARS trap frequency"
          countLabel={`${totalDetectedTraps} total · ${stats.trap_breakdown.length} clauses`}
        >
          {stats.trap_breakdown.length === 0 && (
            <Empty text="No traps detected yet. Run audits to populate." />
          )}
          {stats.trap_breakdown.map((t) => {
            const pct = totalDetectedTraps > 0 ? (t.count / totalDetectedTraps) * 100 : 0;
            return (
              <div key={t.clause} style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--gold)", fontWeight: 600 }}>
                      {t.clause}
                    </span>
                    {t.severity && (
                      <StatusPill kind={t.severity === "P0" ? "trap" : t.severity === "P1" ? "review" : "info"}>
                        {t.severity}
                      </StatusPill>
                    )}
                  </div>
                  <span style={{ fontFamily: "var(--bd-mono)", fontSize: 11, color: "var(--text)", fontWeight: 700 }}>
                    {t.count}
                  </span>
                </div>
                <div style={{ height: 2, background: "rgba(245,240,232,.05)", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--gold)", width: `${pct}%`, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </Panel>

        <Panel
          title="Agency intelligence"
          countLabel={`top ${stats.agency_breakdown.length}`}
        >
          {stats.agency_breakdown.length === 0 && <Empty text="No agency data yet." />}
          {stats.agency_breakdown.map((a) => (
            <div key={a.agency} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--bd-border)", gap: 12 }}>
              <span style={{ fontFamily: "var(--bd-serif)", fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.agency}>
                {a.agency}
              </span>
              <span style={{ fontFamily: "var(--bd-mono)", fontSize: 11, color: "var(--gold)", fontWeight: 700, flexShrink: 0 }}>
                {a.count}
              </span>
            </div>
          ))}
        </Panel>
      </div>

      <V2Notice items={[
        "Corpus growth chart · audits/day for last 90 days",
        "KO relationship history · response rates · notes",
        "Win rate by NAICS / agency / contract type",
        "Customer-isolated views · private vs network corpus"
      ]} />
    </div>
  );
}

function SitCard({
  label, value, tone, sub, hasBorder
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "gold" | "green";
  sub: string;
  hasBorder?: boolean;
}) {
  const valueColor = tone === "red" ? "var(--red)" : tone === "amber" ? "var(--amber)" : tone === "gold" ? "var(--gold2)" : "var(--green)";
  const shadow = tone === "red" ? "0 0 20px rgba(220,38,38,.3)" : "none";
  return (
    <div
      style={{
        background: tone === "red" ? "rgba(220,38,38,.04)" : "var(--void3)",
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
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 34, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: valueColor, textShadow: shadow }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t40)", marginTop: 1 }}>
        {sub}
      </div>
    </div>
  );
}

function Panel({ title, countLabel, children }: { title: string; countLabel?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--void2)", border: "1px solid var(--bd-border)", borderRadius: 3, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd-border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(201,168,76,.025)" }}>
        <h3 style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
          {title}
        </h3>
        {countLabel && (
          <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t40)" }}>{countLabel}</span>
        )}
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {children}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "24px 14px", fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t25)", fontStyle: "italic", textAlign: "center" }}>
      {text}
    </div>
  );
}
