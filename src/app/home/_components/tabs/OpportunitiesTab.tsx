"use client";

import { useMemo, useState } from "react";
import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";
import type { OpportunityRow } from "@/lib/bd-os/queries";

interface Props {
  rows: OpportunityRow[];
}

export default function OpportunitiesTab({ rows }: Props) {
  const [naicsFilter, setNaicsFilter] = useState("");
  const [setAsideFilter, setSetAsideFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "processed" | "failed">("");

  const distinctNaics = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.naics_code).filter(Boolean))).sort() as string[];
  }, [rows]);
  const distinctSetAsides = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.set_aside).filter(Boolean))).sort() as string[];
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (naicsFilter && r.naics_code !== naicsFilter) return false;
    if (setAsideFilter && r.set_aside !== setAsideFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Opportunities"
        subtitle={`${filtered.length} of ${rows.length} solicitations · live SAM.gov ingestion via sam-ingest`}
      />

      <div className="flex gap-2 flex-wrap items-center">
        <FilterSelect label="NAICS" value={naicsFilter} onChange={setNaicsFilter} options={distinctNaics} />
        <FilterSelect label="Set-aside" value={setAsideFilter} onChange={setSetAsideFilter} options={distinctSetAsides} />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "")}
          options={["pending", "processed", "failed"]}
        />
        {(naicsFilter || setAsideFilter || statusFilter) && (
          <button
            onClick={() => {
              setNaicsFilter("");
              setSetAsideFilter("");
              setStatusFilter("");
            }}
            className="text-[11px] text-[#5B8AB8] hover:text-[#EDF4FF] underline px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="border border-[#122240] rounded overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-[#0D1C30] text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]" style={{ fontFamily: "var(--sans)" }}>
            <tr>
              <th className="text-left font-medium px-3 py-2.5">Notice ID</th>
              <th className="text-left font-medium px-3 py-2.5">Title</th>
              <th className="text-left font-medium px-3 py-2.5">Agency</th>
              <th className="text-left font-medium px-3 py-2.5">NAICS</th>
              <th className="text-left font-medium px-3 py-2.5">Set-aside</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-right font-medium px-3 py-2.5">Score</th>
              <th className="text-left font-medium px-3 py-2.5">Recommendation</th>
              <th className="text-right font-medium px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody className="bg-[#091322]" style={{ fontFamily: "var(--mono)" }}>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-[#2D5280] italic">
                  No opportunities match the current filters.
                  {rows.length === 0 && " · Queue empty — sam-ingest cron has not posted any solicitations yet."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-[#122240] hover:bg-[#0D1C30] transition-colors">
                <td className="px-3 py-2.5 text-[#B5D4F4] whitespace-nowrap">{r.notice_id}</td>
                <td className="px-3 py-2.5 text-[#EDF4FF] max-w-[320px] truncate" style={{ fontFamily: "var(--sans)" }} title={r.title || ""}>
                  {r.title || "—"}
                </td>
                <td className="px-3 py-2.5 text-[#5B8AB8] max-w-[180px] truncate" style={{ fontFamily: "var(--sans)" }} title={r.agency || ""}>
                  {r.agency || "—"}
                </td>
                <td className="px-3 py-2.5 text-[#B5D4F4]">{r.naics_code || "—"}</td>
                <td className="px-3 py-2.5 text-[#B5D4F4] max-w-[160px] truncate" style={{ fontFamily: "var(--sans)" }} title={r.set_aside || ""}>
                  {r.set_aside || "—"}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill kind={r.status === "processed" ? "clean" : r.status === "failed" ? "trap" : "info"}>{r.status}</StatusPill>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.compliance_score != null ? (
                    <StatusPill kind={scorePillKind(r.compliance_score)}>{r.compliance_score}</StatusPill>
                  ) : (
                    <span className="text-[#2D5280]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {r.recommendation ? (
                    <StatusPill kind={recPillKind(r.recommendation)}>{r.recommendation.replace("_", " ")}</StatusPill>
                  ) : (
                    <span className="text-[#2D5280]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <a
                    href={`#audit`}
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.hash = "audit";
                    }}
                    className="text-[#378ADD] hover:text-[#EDF4FF] text-[11px]"
                  >
                    Audit →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <V2Notice items={[
        "Customer-saved NAICS watchlists",
        "One-click bulk-audit selected rows",
        "CSV export",
        "Real-time row updates via Supabase subscriptions when sam-ingest posts new rows",
        "Bid/no-bid recommendation override per row with reason logged"
      ]} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="text-[#5B8AB8] uppercase tracking-[0.08em]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#091322] border border-[#122240] rounded px-2 h-8 text-[12px] text-[#EDF4FF] focus:border-[#378ADD] outline-none min-w-[120px]"
        style={{ fontFamily: "var(--mono)" }}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
