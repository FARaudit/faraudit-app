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
    <div className="space-y-5">
      <SectionHeader
        title="Corpus"
        subtitle="Live counts from apex-production · the moat that compounds with every audit"
      />

      <div className="grid md:grid-cols-4 gap-3">
        <StatCard label="Solicitations audited" value={stats.total_audits} />
        <StatCard label="Traps detected" value={stats.total_corpus_rows} />
        <StatCard label="Audits last 30d" value={stats.recent_30d_audits} />
        <StatCard label="Queue · pending" value={stats.pending_queue_size} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-[#091322] border border-[#122240] rounded">
          <div className="px-4 h-10 flex items-center justify-between border-b border-[#122240]">
            <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">DFARS trap frequency</h3>
            <span className="text-[10px] text-[#5B8AB8]" style={{ fontFamily: "var(--mono)" }}>
              {totalDetectedTraps} total · {stats.trap_breakdown.length} clauses
            </span>
          </div>
          <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
            {stats.trap_breakdown.length === 0 && (
              <div className="text-[12px] text-[#2D5280] italic text-center py-6">
                No traps detected yet. Run audits to populate.
              </div>
            )}
            {stats.trap_breakdown.map((t) => {
              const pct = totalDetectedTraps > 0 ? (t.count / totalDetectedTraps) * 100 : 0;
              return (
                <div key={t.clause} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}>{t.clause}</span>
                      {t.severity && (
                        <StatusPill kind={t.severity === "P0" ? "trap" : t.severity === "P1" ? "review" : "info"}>
                          {t.severity}
                        </StatusPill>
                      )}
                    </div>
                    <span className="text-[#EDF4FF]" style={{ fontFamily: "var(--mono)" }}>{t.count}</span>
                  </div>
                  <div className="h-1 bg-[#0D1C30] rounded overflow-hidden">
                    <div className="h-full bg-[#378ADD]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-[#091322] border border-[#122240] rounded">
          <div className="px-4 h-10 flex items-center justify-between border-b border-[#122240]">
            <h3 className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">Agency intelligence</h3>
            <span className="text-[10px] text-[#5B8AB8]" style={{ fontFamily: "var(--mono)" }}>
              top {stats.agency_breakdown.length}
            </span>
          </div>
          <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
            {stats.agency_breakdown.length === 0 && (
              <div className="text-[12px] text-[#2D5280] italic text-center py-6">
                No agency data yet.
              </div>
            )}
            {stats.agency_breakdown.map((a) => (
              <div key={a.agency} className="flex items-center justify-between text-[11px] py-1 border-b border-[#122240] last:border-b-0">
                <span className="text-[#EDF4FF] truncate pr-3" title={a.agency}>{a.agency}</span>
                <span className="text-[#B5D4F4] flex-shrink-0" style={{ fontFamily: "var(--mono)" }}>{a.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <V2Notice items={[
        "Corpus growth chart (audits/day for last 90 days)",
        "KO relationship history table (every KO contacted, response rates, notes)",
        "Win rate by NAICS / agency / contract type",
        "Compliance trap detection rate trend per clause",
        "Customer-isolated views (private vs network corpus)"
      ]} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#091322] border border-[#122240] rounded p-4">
      <div className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8] mb-2">{label}</div>
      <div className="text-[28px] font-medium text-[#EDF4FF] leading-none" style={{ fontFamily: "var(--mono)" }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
