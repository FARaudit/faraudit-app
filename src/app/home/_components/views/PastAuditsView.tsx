"use client";

import { useMemo, useState } from "react";
import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import { ViewHeader, V2Notice } from "./shared";
import type { AuditRow } from "@/lib/bd-os/queries";

interface Props {
  audits: AuditRow[];
}

type SortKey = "newest" | "score_low" | "score_high";
type FilterKey = "all" | "p0" | "ai" | "user";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",  label: "All" },
  { key: "p0",   label: "P0 (< 40)" },
  { key: "ai",   label: "AI Audited" },
  { key: "user", label: "User Audited" }
];

export default function PastAuditsView({ audits }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(() => {
    let rows = audits.filter((a) => {
      if (filter === "p0") return a.compliance_score != null && a.compliance_score < 40;
      if (filter === "ai") return a.audit_source === "audit_ai";
      if (filter === "user") return a.audit_source !== "audit_ai";
      return true;
    });
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((a) =>
        (a.notice_id || "").toLowerCase().includes(q) ||
        (a.title || "").toLowerCase().includes(q) ||
        (a.agency || "").toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      if (sort === "score_low")  return (a.compliance_score ?? 999) - (b.compliance_score ?? 999);
      if (sort === "score_high") return (b.compliance_score ?? -1)  - (a.compliance_score ?? -1);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }, [audits, filter, query, sort]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1600 }}>
      <ViewHeader
        eyebrow={`Audit history · ${audits.length} total`}
        title="Past Audits"
        subtitle="Every audit you've run, with full filtering and search. Click any row to re-open the report. V2 wires version diffing and PDF export."
      />

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          padding: "10px 14px"
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  fontFamily: "var(--bd-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "5px 12px",
                  borderRadius: 2,
                  background: active ? "rgba(200,146,42,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(200,146,42,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--text2)",
                  cursor: "pointer"
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notice ID · title · agency…"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 2,
            padding: "6px 12px",
            fontFamily: "var(--bd-mono)",
            fontSize: 10,
            color: "var(--text)",
            outline: "none",
            minWidth: 260
          }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 2,
            padding: "6px 10px",
            fontFamily: "var(--bd-mono)",
            fontSize: 10,
            color: "var(--text)",
            outline: "none",
            cursor: "pointer"
          }}
        >
          <option value="newest">Newest first</option>
          <option value="score_low">Score ↑ (worst first)</option>
          <option value="score_high">Score ↓ (best first)</option>
        </select>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "130px 130px minmax(0,1fr) 160px 80px 80px 110px",
            gap: 10,
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(200,146,42,.025)",
            fontFamily: "var(--bd-mono)",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text2)"
          }}
        >
          <span>Date</span>
          <span>Notice ID</span>
          <span>Title</span>
          <span>Agency</span>
          <span>Source</span>
          <span>Score</span>
          <span>Verdict</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "60px 24px", textAlign: "center", fontFamily: "var(--bd-mono)", fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            No audits match the current filter.
          </div>
        )}

        {filtered.map((a) => (
          <div
            key={a.id}
            style={{
              display: "grid",
              gridTemplateColumns: "130px 130px minmax(0,1fr) 160px 80px 80px 110px",
              gap: 10,
              alignItems: "center",
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              fontFamily: "var(--bd-mono)",
              fontSize: 10,
              cursor: "pointer",
              transition: "background .12s"
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(200,146,42,.03)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ color: "var(--text2)" }}>
              {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            <span style={{ color: "var(--gold)" }}>{a.notice_id || "—"}</span>
            <span style={{ fontFamily: "var(--bd-serif)", fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.title || ""}>
              {a.title || "—"}
            </span>
            <span style={{ color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.agency || ""}>
              {a.agency || "—"}
            </span>
            <StatusPill kind={a.audit_source === "audit_ai" ? "info" : "neutral"}>{a.audit_source === "audit_ai" ? "AI" : "USER"}</StatusPill>
            {a.compliance_score != null
              ? <StatusPill kind={scorePillKind(a.compliance_score)}>{a.compliance_score}</StatusPill>
              : <span style={{ color: "var(--muted)" }}>—</span>}
            {a.recommendation
              ? <StatusPill kind={recPillKind(a.recommendation)}>{a.recommendation.replace("_", " ")}</StatusPill>
              : <span style={{ color: "var(--muted)" }}>—</span>}
          </div>
        ))}
      </div>

      <V2Notice items={[
        "Click row → open in-app audit report viewer (overview / compliance / risks panes)",
        "Audit version diffing — see what changed between re-runs",
        "Bulk export filtered set as PDF or CSV",
        "Tag audits + saved searches per NAICS"
      ]} />
    </div>
  );
}
