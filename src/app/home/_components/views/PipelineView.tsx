"use client";

import { useMemo } from "react";
import StatusPill, { recPillKind } from "../StatusPill";
import { ViewHeader, V2Notice } from "./shared";
import type { OpportunityRow } from "@/lib/bd-os/queries";

interface Props {
  opportunities: OpportunityRow[];
}

type Stage = "tracking" | "bidding" | "submitted" | "awarded" | "lost";

const STAGES: { key: Stage; label: string; tone: string; bg: string }[] = [
  { key: "tracking",  label: "Tracking",  tone: "var(--text2)", bg: "rgba(148,163,184,.04)" },
  { key: "bidding",   label: "Bidding",   tone: "var(--gold)",  bg: "rgba(200,146,42,.04)" },
  { key: "submitted", label: "Submitted", tone: "var(--blue)",  bg: "rgba(37,99,235,.04)" },
  { key: "awarded",   label: "Awarded",   tone: "var(--green)", bg: "rgba(16,185,129,.04)" },
  { key: "lost",      label: "Lost",      tone: "var(--red)",   bg: "rgba(239,68,68,.04)" }
];

export default function PipelineView({ opportunities }: Props) {
  const grouped = useMemo(() => {
    const buckets: Record<Stage, OpportunityRow[]> = {
      tracking: [], bidding: [], submitted: [], awarded: [], lost: []
    };
    for (const o of opportunities) {
      const stage = stageFor(o);
      buckets[stage].push(o);
    }
    return buckets;
  }, [opportunities]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1600 }}>
      <ViewHeader
        eyebrow="Bid lifecycle · 5 stages"
        title="Pipeline Tracker"
        subtitle="Every solicitation in your queue, tracked by stage. Click into any row to open its audit. Stage transitions persist to the audits table — V2 will add bid value, win-rate analytics, and AI-recommended next-action."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "start" }}>
        {STAGES.map((s) => {
          const rows = grouped[s.key];
          return (
            <div
              key={s.key}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minHeight: 320
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: s.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--bd-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: s.tone
                  }}
                >
                  {s.label}
                </span>
                <span style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: s.tone, fontWeight: 700 }}>
                  {rows.length}
                </span>
              </div>
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.length === 0 && (
                  <div style={{ padding: "24px 8px", textAlign: "center", fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--muted)", fontStyle: "italic" }}>
                    Empty
                  </div>
                )}
                {rows.slice(0, 12).map((r) => <StageCard key={r.id} row={r} />)}
                {rows.length > 12 && (
                  <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--text2)", textAlign: "center", padding: "6px 0" }}>
                    + {rows.length - 12} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <V2Notice items={[
        "Drag-and-drop stage transitions (persisted to audits.pipeline_stage)",
        "Bid value tracking with win-rate against agency",
        "AI-recommended next action (e.g. 'KO clarification email overdue 3d')",
        "Calendar export of bid deadlines to .ics"
      ]} />
    </div>
  );
}

function stageFor(o: OpportunityRow): Stage {
  if (o.recommendation === "DECLINE") return "lost";
  if (o.bid_no_bid === "BID" || o.recommendation === "PROCEED") return "bidding";
  if (o.status === "processed") return "tracking";
  return "tracking";
}

function StageCard({ row }: { row: OpportunityRow }) {
  return (
    <button
      onClick={() => { window.location.hash = "run-audit"; }}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 2,
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        transition: "border-color .12s"
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(200,146,42,.4)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--gold)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.notice_id}
        </span>
        {row.recommendation && (
          <StatusPill kind={recPillKind(row.recommendation)}>{shortRec(row.recommendation)}</StatusPill>
        )}
      </div>
      <div style={{ fontFamily: "var(--bd-serif)", fontSize: 11, fontWeight: 500, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {row.title || "—"}
      </div>
      <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--text2)", letterSpacing: "0.04em" }}>
        {row.agency || "—"} · {row.naics_code || "—"}
      </div>
    </button>
  );
}

function shortRec(r: string): string {
  if (r === "PROCEED") return "BID";
  if (r === "PROCEED_WITH_CAUTION") return "WATCH";
  if (r === "DECLINE") return "P0";
  return r;
}
