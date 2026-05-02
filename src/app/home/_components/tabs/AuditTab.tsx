"use client";

import { useState } from "react";
import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";
import type { AuditRow } from "@/lib/bd-os/queries";

interface Props {
  recent: AuditRow[];
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
  fontSize: 10,
  color: "var(--text)"
};

export default function AuditTab({ recent }: Props) {
  const [noticeId, setNoticeId] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!noticeId && !pdf) {
      setError("Provide a notice ID or PDF.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (noticeId) fd.set("noticeId", noticeId);
      if (pdf) fd.set("pdf", pdf);
      const res = await fetch("/api/audit", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `audit failed (${res.status})`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader
        eyebrow="Three-call audit · claude-opus-4-7"
        title="Run Audit"
        subtitle="Lockheed-grade · classifier + overview + compliance + risks · ~2 min · upload PDF or paste notice ID"
      />

      <form
        onSubmit={submit}
        style={{
          background: "rgba(201,168,76,.04)",
          border: "1.5px dashed rgba(201,168,76,.3)",
          borderRadius: 4,
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 3,
              background: "rgba(201,168,76,.1)",
              border: "1px solid var(--bd-border2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M4 2h7l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="var(--gold)" strokeWidth="1.4"/>
              <path d="M11 2v3h3" stroke="var(--gold)" strokeWidth="1.4"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: "var(--bd-serif)", fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
              Drop your solicitation PDF here
            </div>
            <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t60)", letterSpacing: "0.04em" }}>
              Or click to browse · Any page count · Any agency · Any format
            </div>
          </div>
          <span style={{
            fontFamily: "var(--bd-mono)",
            fontSize: 8,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 2,
            background: "rgba(201,168,76,.08)",
            border: "1px solid var(--bd-border2)",
            color: "var(--gold)",
            letterSpacing: "0.05em"
          }}>
            ENGINE LIVE
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--t40)" }}>
              SAM.gov Notice ID
            </span>
            <input
              type="text"
              value={noticeId}
              onChange={(e) => setNoticeId(e.target.value.trim())}
              placeholder="FA301626Q0068"
              style={{
                background: "var(--void)",
                border: "1px solid var(--bd-border)",
                borderRadius: 2,
                padding: "8px 10px",
                fontFamily: "var(--bd-mono)",
                fontSize: 11,
                color: "var(--text)",
                outline: "none"
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--t40)" }}>
              Or upload PDF
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] || null)}
              style={{
                background: "var(--void)",
                border: "1px solid var(--bd-border)",
                borderRadius: 2,
                padding: "6px 10px",
                fontFamily: "var(--bd-mono)",
                fontSize: 11,
                color: "var(--t80)",
                cursor: "pointer"
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--t40)", margin: 0 }}>
            <code style={{ color: "var(--gold)" }}>claude-opus-4-7</code> · 14 compliance keys · 12 risk keys · DFARS-trap auto-flag
          </p>
          <button
            type="submit"
            disabled={submitting}
            style={{
              fontFamily: "var(--bd-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--void)",
              background: "var(--gold)",
              padding: "11px 22px",
              borderRadius: 2,
              border: "none",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.6 : 1,
              flexShrink: 0
            }}
          >
            {submitting ? "Auditing…" : "Run audit"}
          </button>
        </div>

        {error && (
          <div style={{
            fontFamily: "var(--bd-mono)",
            fontSize: 10,
            color: "var(--red)",
            background: "rgba(239,68,68,.08)",
            border: "1px solid rgba(239,68,68,.2)",
            borderRadius: 2,
            padding: "8px 10px"
          }}>
            {error}
          </div>
        )}
      </form>

      {result && (
        <div style={{
          background: "var(--void2)",
          border: "1px solid var(--gold)",
          borderRadius: 3,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t40)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
                Audit complete
              </div>
              <div style={{ fontFamily: "var(--bd-mono)", fontSize: 12, color: "var(--gold)" }}>
                {result.auditId}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {result.recommendation && <StatusPill kind={recPillKind(result.recommendation)}>{result.recommendation.replace("_", " ")}</StatusPill>}
              {typeof result.score === "number" && <StatusPill kind={scorePillKind(result.score)}>{result.score}/100</StatusPill>}
            </div>
          </div>
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--t60)" }}>
            Persisted to <span style={{ color: "var(--gold)" }}>audits</span> + <span style={{ color: "var(--gold)" }}>fa_intelligence_corpus</span>. See Corpus tab.
          </p>
        </div>
      )}

      <div>
        <h3 style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.75, marginBottom: 8, padding: "8px 0" }}>
          Recent audits · {recent.length}
        </h3>
        <div style={{ border: "1px solid var(--bd-border)", borderRadius: 3, overflow: "hidden", background: "var(--void2)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>When</th>
                <th style={TH}>Notice</th>
                <th style={TH}>Title</th>
                <th style={TH}>Agency</th>
                <th style={TH}>Source</th>
                <th style={{ ...TH, textAlign: "right" }}>Score</th>
                <th style={TH}>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...TD, textAlign: "center", padding: "28px 12px", color: "var(--t25)", fontStyle: "italic" }}>
                    No audits yet. Run one above.
                  </td>
                </tr>
              )}
              {recent.map((a) => (
                <tr key={a.id}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,.025)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ ...TD, color: "var(--t40)", whiteSpace: "nowrap" }}>
                    {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td style={{ ...TD, color: "var(--gold)" }}>{a.notice_id || "—"}</td>
                  <td style={{ ...TD, fontFamily: "var(--bd-serif)", fontSize: 11, fontWeight: 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.title || ""}>
                    {a.title || "—"}
                  </td>
                  <td style={{ ...TD, color: "var(--t60)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.agency || ""}>
                    {a.agency || "—"}
                  </td>
                  <td style={TD}>
                    <StatusPill kind={a.audit_source === "audit_ai" ? "info" : "neutral"}>
                      {a.audit_source || "user"}
                    </StatusPill>
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    {a.compliance_score != null ? <StatusPill kind={scorePillKind(a.compliance_score)}>{a.compliance_score}</StatusPill> : <span style={{ color: "var(--t25)" }}>—</span>}
                  </td>
                  <td style={TD}>
                    {a.recommendation ? <StatusPill kind={recPillKind(a.recommendation)}>{a.recommendation.replace("_", " ")}</StatusPill> : <span style={{ color: "var(--t25)" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <V2Notice items={[
        "Inline result viewer — full overview/compliance/risks panes",
        "Audit version history with diffing",
        "KO clarification email auto-drafted",
        "PDF export with FARaudit cover sheet"
      ]} />
    </div>
  );
}
