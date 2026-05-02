"use client";

import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import type { OpportunityRow, AuditRow } from "@/lib/bd-os/queries";

interface Props {
  opportunities: OpportunityRow[];
  audits: AuditRow[];
}

type Stage = "tracking" | "bidding" | "submitted" | "awarded" | "lost";
const STAGES: { key: Stage; label: string; help: string; tone: "red" | "gold" | "green" | "neutral" }[] = [
  { key: "tracking", label: "Tracking",  help: "monitored",  tone: "neutral" },
  { key: "bidding",  label: "Bidding",   help: "audit done", tone: "gold" },
  { key: "submitted",label: "Submitted", help: "with KO",    tone: "neutral" },
  { key: "awarded",  label: "Awarded",   help: "performance",tone: "green" },
  { key: "lost",     label: "Lost",      help: "no award",   tone: "red" }
];

function bucketize(opps: OpportunityRow[]): Record<Stage, OpportunityRow[]> {
  const out: Record<Stage, OpportunityRow[]> = {
    tracking: [], bidding: [], submitted: [], awarded: [], lost: []
  };
  for (const o of opps) {
    if (o.status === "processed") out.bidding.push(o);
    else if (o.status === "pending" || o.status === "processing") out.tracking.push(o);
  }
  return out;
}

export default function PipelineTab({ opportunities }: Props) {
  const buckets = bucketize(opportunities);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="Mission Control"
        title="Pipeline"
        subtitle="Five-stage acquisition kanban · auto-derived from queue + audit status · DnD persistence in V2"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, minWidth: 1100, overflowX: "auto", paddingBottom: 4 }}>
        {STAGES.map((stage) => {
          const cards = buckets[stage.key];
          return (
            <div
              key={stage.key}
              style={{
                background: "var(--void2)",
                border: "1px solid var(--bd-border)",
                borderRadius: 4
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--bd-border)",
                  background: "rgba(201,168,76,.025)"
                }}
              >
                <div>
                  <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85 }}>
                    {stage.label}
                  </div>
                  <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t25)", marginTop: 1 }}>
                    {stage.help}
                  </div>
                </div>
                <StatusPill kind={cards.length > 0 ? "gold" : "neutral"}>{cards.length}</StatusPill>
              </div>
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: "60vh", overflowY: "auto" }}>
                {cards.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 8px", fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t25)", fontStyle: "italic" }}>
                    no cards
                  </div>
                )}
                {cards.map((c) => (
                  <article
                    key={c.id}
                    style={{
                      background: "var(--void3)",
                      border: "1px solid var(--bd-border)",
                      borderRadius: 3,
                      padding: 10,
                      cursor: "pointer",
                      transition: "border-color .15s"
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--bd-border2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--bd-border)"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--gold)", fontWeight: 600 }}>
                        {c.notice_id}
                      </div>
                      {c.recommendation && <StatusPill kind={recPillKind(c.recommendation)}>{c.recommendation.replace("_", " ")}</StatusPill>}
                    </div>
                    <div style={{ fontFamily: "var(--bd-serif)", fontSize: 12, fontWeight: 500, color: "var(--text)", lineHeight: 1.35, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {c.title || "—"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t40)" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>
                        {c.agency || "—"}
                      </span>
                      {c.compliance_score != null && (
                        <StatusPill kind={scorePillKind(c.compliance_score)}>{c.compliance_score}</StatusPill>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <V2Notice items={[
        "Drag-and-drop with persistence",
        "Quick-add solicitation by notice ID",
        "Stage-transition triggers · assignee notify",
        "Per-card comment thread + @mentions"
      ]} />
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  cta
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
      <div>
        {eyebrow && (
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--t40)", marginBottom: 4 }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ fontFamily: "var(--bd-serif)", fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{title}</h2>
        {subtitle && (
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--t40)", marginTop: 4 }}>{subtitle}</p>
        )}
      </div>
      {cta}
    </div>
  );
}

export function V2Notice({ items }: { items: string[] }) {
  return (
    <div
      style={{
        background: "rgba(201,168,76,.04)",
        border: "1px dashed rgba(201,168,76,.25)",
        borderRadius: 3,
        padding: "10px 14px",
        fontFamily: "var(--bd-mono)",
        fontSize: 9,
        color: "var(--t60)",
        lineHeight: 1.6
      }}
    >
      <span style={{ color: "var(--gold)", fontWeight: 700 }}>COMING NEXT · </span>
      {items.join(" · ")}
    </div>
  );
}
