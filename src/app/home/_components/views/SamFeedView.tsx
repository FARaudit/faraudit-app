"use client";

import { useMemo, useState } from "react";
import StatusPill, { recPillKind, riskKindFromScore } from "../StatusPill";
import { ViewHeader, V2Notice } from "./shared";
import type { OpportunityRow } from "@/lib/bd-os/queries";

interface Props {
  rows: OpportunityRow[];
}

type StatusFilter = "all" | "pending" | "processed";

export default function SamFeedView({ rows }: Props) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [naics, setNaics] = useState<string>("all");
  const [query, setQuery] = useState("");

  const naicsOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.naics_code) set.add(r.naics_code); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (naics !== "all" && r.naics_code !== naics) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${r.notice_id} ${r.title || ""} ${r.agency || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, status, naics, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1600 }}>
      <ViewHeader
        eyebrow={`Live · sam-ingest cron · ${rows.length} solicitations queued`}
        title="SAM.gov Feed"
        subtitle="Every active solicitation matching your 13 NAICS codes. Pulled directly from SAM.gov via the sam-ingest worker — refreshed daily at 06:00 CDT. Click any row to run an audit."
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
          {(["all", "pending", "processed"] as StatusFilter[]).map((s) => {
            const active = s === status;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
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
                {s === "all" ? "All" : s === "pending" ? "Queued" : "Audited"}
              </button>
            );
          })}
        </div>

        <select
          value={naics}
          onChange={(e) => setNaics(e.target.value)}
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
          <option value="all">All NAICS</option>
          {naicsOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

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
        <span style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)" }}>
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 130px minmax(0,1fr) 160px 90px 90px 80px 90px",
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
          <span>Posted</span>
          <span>Notice ID</span>
          <span>Title</span>
          <span>Agency</span>
          <span>NAICS</span>
          <span>Set-Aside</span>
          <span>Status</span>
          <span>Verdict</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "60px 24px", textAlign: "center", fontFamily: "var(--bd-mono)", fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            {rows.length === 0
              ? "Feed empty. sam-ingest will populate at 06:00 CDT."
              : "No rows match the current filter."}
          </div>
        )}

        {filtered.map((r) => (
          <div
            key={r.id}
            onClick={() => { window.location.hash = "run-audit"; }}
            style={{
              display: "grid",
              gridTemplateColumns: "100px 130px minmax(0,1fr) 160px 90px 90px 80px 90px",
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
              {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span style={{ color: "var(--gold)" }}>{r.notice_id}</span>
            <span style={{ fontFamily: "var(--bd-serif)", fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.title || ""}>
              {r.title || "—"}
            </span>
            <span style={{ color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.agency || ""}>
              {r.agency || "—"}
            </span>
            <span style={{ color: "var(--text)" }}>{r.naics_code || "—"}</span>
            <span style={{ color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.set_aside || ""}>
              {r.set_aside ? abbrSetAside(r.set_aside) : "UNDISCL"}
            </span>
            <StatusPill kind={r.status === "processed" ? "info" : "neutral"}>
              {r.status === "processed" ? "Audited" : "Queued"}
            </StatusPill>
            {r.recommendation
              ? <StatusPill kind={recPillKind(r.recommendation)}>{shortRec(r.recommendation)}</StatusPill>
              : <StatusPill kind={riskKindFromScore(r.compliance_score)}>{r.compliance_score != null ? scoreToRisk(r.compliance_score) : "Watch"}</StatusPill>}
          </div>
        ))}
      </div>

      <V2Notice items={[
        "Saved NAICS searches with email digest",
        "Deadline column (parsed from solicitation response date)",
        "Auto-trigger audit when new high-priority NAICS hits the feed",
        "Vendor-side teaming finder: who else is bidding this notice"
      ]} />
    </div>
  );
}

function abbrSetAside(s: string): string {
  const t = s.toLowerCase();
  if (t.includes("total small")) return "SB";
  if (t.includes("8(a)") || t.includes("8a")) return "8(a)";
  if (t.includes("woman")) return "WOSB";
  if (t.includes("sdvosb") || t.includes("service-disabled")) return "SDVOSB";
  if (t.includes("hubzone")) return "HZN";
  return "UNDISCL";
}

function shortRec(r: string): string {
  if (r === "PROCEED") return "BID";
  if (r === "PROCEED_WITH_CAUTION") return "WATCH";
  if (r === "DECLINE") return "P0";
  return r;
}

function scoreToRisk(score: number): string {
  if (score < 40) return "P0";
  if (score < 70) return "P1";
  return "P2";
}
