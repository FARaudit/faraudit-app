"use client";

import { useMemo, useState } from "react";
import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";
import type { OpportunityRow } from "@/lib/bd-os/queries";

interface Props {
  rows: OpportunityRow[];
}

const TH: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "var(--bd-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--t40)",
  padding: "10px 12px",
  borderBottom: "1px solid var(--bd-border)",
  background: "rgba(201,168,76,.025)"
};

const TD: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--bd-border)",
  fontFamily: "var(--bd-mono)",
  fontSize: 11,
  color: "var(--text)"
};

export default function OpportunitiesTab({ rows }: Props) {
  const [naicsFilter, setNaicsFilter] = useState("");
  const [setAsideFilter, setSetAsideFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "processed" | "failed">("");

  const distinctNaics = useMemo(
    () => Array.from(new Set(rows.map((r) => r.naics_code).filter(Boolean))).sort() as string[],
    [rows]
  );
  const distinctSetAsides = useMemo(
    () => Array.from(new Set(rows.map((r) => r.set_aside).filter(Boolean))).sort() as string[],
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (naicsFilter && r.naics_code !== naicsFilter) return false;
    if (setAsideFilter && r.set_aside !== setAsideFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="SAM.gov · live ingest"
        title="Opportunities"
        subtitle={`${filtered.length} of ${rows.length} solicitations · 13 NAICS × 9 set-aside continuous pull from sam-ingest`}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <FilterSelect label="NAICS" value={naicsFilter} onChange={setNaicsFilter} options={distinctNaics} />
        <FilterSelect label="Set-aside" value={setAsideFilter} onChange={setSetAsideFilter} options={distinctSetAsides} />
        <FilterSelect label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as "")} options={["pending", "processed", "failed"]} />
        {(naicsFilter || setAsideFilter || statusFilter) && (
          <button
            onClick={() => { setNaicsFilter(""); setSetAsideFilter(""); setStatusFilter(""); }}
            style={{
              fontFamily: "var(--bd-mono)",
              fontSize: 10,
              color: "var(--gold)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              padding: "0 4px"
            }}
          >
            clear
          </button>
        )}
      </div>

      <div style={{ border: "1px solid var(--bd-border)", borderRadius: 3, overflow: "hidden", background: "var(--void2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>Notice ID</th>
              <th style={TH}>Title</th>
              <th style={TH}>Agency</th>
              <th style={TH}>NAICS</th>
              <th style={TH}>Set-aside</th>
              <th style={TH}>Status</th>
              <th style={{ ...TH, textAlign: "right" }}>Score</th>
              <th style={TH}>Recommendation</th>
              <th style={{ ...TH, textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...TD, textAlign: "center", padding: "32px 12px", color: "var(--t25)", fontStyle: "italic" }}>
                  No opportunities match the current filters.
                  {rows.length === 0 && " · queue empty — sam-ingest cron has not posted yet."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} style={{ transition: "background .12s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td style={{ ...TD, color: "var(--gold)", whiteSpace: "nowrap" }}>{r.notice_id}</td>
                <td style={{ ...TD, fontFamily: "var(--bd-serif)", fontSize: 12, fontWeight: 500, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.title || ""}>
                  {r.title || "—"}
                </td>
                <td style={{ ...TD, color: "var(--t60)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.agency || ""}>
                  {r.agency || "—"}
                </td>
                <td style={{ ...TD, color: "var(--t80)" }}>{r.naics_code || "—"}</td>
                <td style={{ ...TD, color: "var(--t80)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.set_aside || ""}>
                  {r.set_aside || "—"}
                </td>
                <td style={TD}>
                  <StatusPill kind={r.status === "processed" ? "clean" : r.status === "failed" ? "trap" : "info"}>{r.status}</StatusPill>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  {r.compliance_score != null ? (
                    <StatusPill kind={scorePillKind(r.compliance_score)}>{r.compliance_score}</StatusPill>
                  ) : (
                    <span style={{ color: "var(--t25)" }}>—</span>
                  )}
                </td>
                <td style={TD}>
                  {r.recommendation ? (
                    <StatusPill kind={recPillKind(r.recommendation)}>{r.recommendation.replace("_", " ")}</StatusPill>
                  ) : (
                    <span style={{ color: "var(--t25)" }}>—</span>
                  )}
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <a
                    href="#audit"
                    onClick={(e) => { e.preventDefault(); window.location.hash = "audit"; }}
                    style={{ color: "var(--gold)", fontFamily: "var(--bd-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", textDecoration: "none", fontWeight: 700 }}
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
        "CSV export · real-time row updates · bid/no-bid override per row"
      ]} />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t40)", letterSpacing: "0.16em", textTransform: "uppercase" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "var(--void2)",
          border: "1px solid var(--bd-border)",
          borderRadius: 2,
          padding: "5px 8px",
          fontFamily: "var(--bd-mono)",
          fontSize: 10,
          color: "var(--text)",
          minWidth: 130,
          cursor: "pointer",
          outline: "none"
        }}
      >
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
