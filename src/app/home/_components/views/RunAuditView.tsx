"use client";

import { useState } from "react";
import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import { ViewHeader, V2Notice } from "./shared";
import type { AuditRow } from "@/lib/bd-os/queries";

interface Props {
  recent: AuditRow[];
}

export default function RunAuditView({ recent }: Props) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1400 }}>
      <ViewHeader
        eyebrow="Three-call audit · claude-opus-4-7"
        title="Run a New Audit"
        subtitle="Upload any federal solicitation PDF. FARaudit runs three sequential intelligence calls — Overview · FAR/DFARS Compliance · Risk Extraction — and delivers a ranked report with a KO clarification email drafted and ready to send."
      />

      <form
        onSubmit={submit}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}
      >
        <div
          style={{
            background: "rgba(200,146,42,.04)",
            border: "1.5px dashed rgba(200,146,42,.32)",
            borderRadius: 4,
            padding: "32px 24px",
            textAlign: "center"
          }}
        >
          <div style={{ fontFamily: "var(--bd-serif)", fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            Drop your solicitation PDF here
          </div>
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--text2)", letterSpacing: "0.04em", marginBottom: 14 }}>
            Or use the form below · Any page count · Any agency · Any format
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            {["RFQ", "RFP", "IDIQ", "IFB", "Sources Sought", "Pre-Sol", "Task Order", "Modification"].map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: "var(--bd-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 2,
                  background: "rgba(200,146,42,.10)",
                  border: "1px solid rgba(200,146,42,.22)",
                  color: "var(--gold)",
                  letterSpacing: "0.06em"
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
          <Field label="SAM.gov Notice ID">
            <input
              type="text"
              value={noticeId}
              onChange={(e) => setNoticeId(e.target.value.trim())}
              placeholder="FA301626Q0068"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: 2,
                padding: "9px 12px",
                fontFamily: "var(--bd-mono)",
                fontSize: 12,
                color: "var(--text)",
                outline: "none",
                width: "100%"
              }}
            />
          </Field>
          <Field label="Or Upload PDF">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] || null)}
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: 2,
                padding: "7px 12px",
                fontFamily: "var(--bd-mono)",
                fontSize: 11,
                color: "var(--text2)",
                cursor: "pointer",
                width: "100%"
              }}
            />
          </Field>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", margin: 0 }}>
            Engine: <code style={{ color: "var(--gold)" }}>claude-opus-4-7</code> · 14 compliance keys · 12 risk keys · DFARS-trap auto-flag
          </p>
          <button
            type="submit"
            disabled={submitting}
            style={{
              fontFamily: "var(--bd-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--bg-primary)",
              background: "var(--gold)",
              padding: "12px 24px",
              borderRadius: 2,
              border: "none",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            {submitting && <Spinner />}
            {submitting ? "Auditing…" : "Run Audit →"}
          </button>
        </div>

        {error && (
          <div style={{ fontFamily: "var(--bd-mono)", fontSize: 11, color: "var(--red)", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 2, padding: "10px 12px" }}>
            {error}
          </div>
        )}
      </form>

      {result && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--gold)", borderRadius: 3, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, color: "var(--text2)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
                Audit complete
              </div>
              <div style={{ fontFamily: "var(--bd-mono)", fontSize: 13, color: "var(--gold)" }}>
                {result.auditId}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {result.recommendation && <StatusPill kind={recPillKind(result.recommendation)}>{result.recommendation.replace("_", " ")}</StatusPill>}
              {typeof result.score === "number" && <StatusPill kind={scorePillKind(result.score)}>{result.score}/100</StatusPill>}
            </div>
          </div>
          <p style={{ fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--text2)" }}>
            Persisted to <span style={{ color: "var(--gold)" }}>audits</span> + <span style={{ color: "var(--gold)" }}>fa_intelligence_corpus</span>. Refresh to see in Past Audits.
          </p>
        </div>
      )}

      <div>
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", opacity: 0.85, padding: "8px 0 12px" }}>
          Recent · {recent.length}
        </div>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
          {recent.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--bd-mono)", fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
              No audits yet. Run one above.
            </div>
          )}
          {recent.slice(0, 10).map((a) => (
            <div key={a.id} style={{
              display: "grid",
              gridTemplateColumns: "120px 140px minmax(0,1fr) 160px 80px 90px 110px",
              gap: 10,
              alignItems: "center",
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              fontFamily: "var(--bd-mono)",
              fontSize: 10
            }}>
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
              <StatusPill kind={a.audit_source === "audit_ai" ? "info" : "neutral"}>{a.audit_source || "user"}</StatusPill>
              {a.compliance_score != null
                ? <StatusPill kind={scorePillKind(a.compliance_score)}>{a.compliance_score}</StatusPill>
                : <span style={{ color: "var(--muted)" }}>—</span>}
              {a.recommendation
                ? <StatusPill kind={recPillKind(a.recommendation)}>{a.recommendation.replace("_", " ")}</StatusPill>
                : <span style={{ color: "var(--muted)" }}>—</span>}
            </div>
          ))}
        </div>
      </div>

      <V2Notice items={[
        "Inline result viewer — overview/compliance/risks panes",
        "Audit version history with diffing",
        "KO clarification email auto-drafted from compliance gaps",
        "PDF export with FARaudit cover sheet"
      ]} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: "var(--bd-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text2)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "bd-spin 0.6s linear infinite"
      }}
    />
  );
}
