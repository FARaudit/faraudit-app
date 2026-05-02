"use client";

import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import type { OpportunityRow, AuditRow } from "@/lib/bd-os/queries";

interface Props {
  opportunities: OpportunityRow[];
  audits: AuditRow[];
}

type Stage = "tracking" | "bidding" | "submitted" | "awarded" | "lost";
const STAGES: { key: Stage; label: string; help: string }[] = [
  { key: "tracking", label: "Tracking", help: "Solicitations being monitored" },
  { key: "bidding", label: "Bidding", help: "Audit complete, drafting proposal" },
  { key: "submitted", label: "Submitted", help: "Quote/proposal in with KO" },
  { key: "awarded", label: "Awarded", help: "Contract won — performance phase" },
  { key: "lost", label: "Lost", help: "No award — record reasons" }
];

// V1 staging logic: all opportunities in 'pending' or 'processing' status →
// Tracking. Anything 'processed' → Bidding (audit complete). Awarded/Submitted/
// Lost have no data source yet (V2 — needs proposals + awards tables).
function bucketize(opps: OpportunityRow[]): Record<Stage, OpportunityRow[]> {
  const out: Record<Stage, OpportunityRow[]> = {
    tracking: [],
    bidding: [],
    submitted: [],
    awarded: [],
    lost: []
  };
  for (const o of opps) {
    if (o.status === "processed") out.bidding.push(o);
    else if (o.status === "pending" || o.status === "processing") out.tracking.push(o);
  }
  return out;
}

function daysToDeadline(_o: OpportunityRow): number | null {
  // V2: parse responseDeadLine from joined audits row.
  return null;
}

export default function PipelineTab({ opportunities }: Props) {
  const buckets = bucketize(opportunities);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Pipeline"
        subtitle="Drag-and-drop kanban — V2. Today: read-only stages auto-derived from audit status."
        cta={
          <button
            disabled
            title="Coming next — manual quick-add"
            className="px-3 h-9 rounded border border-[#122240] text-[12px] text-[#2D5280] bg-[#091322] cursor-not-allowed"
          >
            + Add solicitation
          </button>
        }
      />

      <div className="grid grid-cols-5 gap-3 min-w-[1100px] overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const cards = buckets[stage.key];
          return (
            <div key={stage.key} className="bg-[#091322] border border-[#122240] rounded">
              <div className="px-3 h-10 flex items-center justify-between border-b border-[#122240]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-[#EDF4FF] font-medium">{stage.label}</div>
                  <div className="text-[10px] text-[#5B8AB8] hidden xl:block">{stage.help}</div>
                </div>
                <div
                  className="text-[10px] text-[#5B8AB8] px-2 py-[1px] rounded bg-[#0D1C30] border border-[#122240]"
                  style={{ fontFamily: "var(--mono)" }}
                >
                  {cards.length}
                </div>
              </div>
              <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                {cards.length === 0 && (
                  <div className="text-[11px] text-[#2D5280] italic px-2 py-6 text-center">
                    no cards
                  </div>
                )}
                {cards.map((c) => (
                  <article
                    key={c.id}
                    className="bg-[#050D1A] border border-[#122240] hover:border-[#1a3560] rounded p-2.5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="text-[11px] text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}>
                        {c.notice_id}
                      </div>
                      {c.recommendation && <StatusPill kind={recPillKind(c.recommendation)}>{c.recommendation.replace("_", " ")}</StatusPill>}
                    </div>
                    <div className="text-[12px] text-[#EDF4FF] leading-snug mb-1.5 line-clamp-2">{c.title || "—"}</div>
                    <div className="flex items-center justify-between text-[10px] text-[#5B8AB8]" style={{ fontFamily: "var(--mono)" }}>
                      <span className="truncate">{c.agency || "—"}</span>
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
        "Drag-and-drop between stages with persistence",
        "Quick-add solicitation by notice ID (one-click queue + audit)",
        "Stage-transition triggers: notify assignee, update past-performance counter",
        "Per-card comment thread + @mentions"
      ]} />
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  cta
}: {
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[20px] font-medium text-[#EDF4FF] tracking-tight">{title}</h2>
        {subtitle && <p className="text-[12px] text-[#5B8AB8] mt-0.5">{subtitle}</p>}
      </div>
      {cta}
    </div>
  );
}

export function V2Notice({ items }: { items: string[] }) {
  return (
    <div className="bg-[#091322] border border-[#122240] rounded p-3 text-[11px] text-[#5B8AB8] leading-relaxed">
      <span className="text-[#378ADD] font-medium">Coming next:</span>{" "}
      {items.join(" · ")}
    </div>
  );
}
