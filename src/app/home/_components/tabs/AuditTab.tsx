"use client";

import { useState } from "react";
import StatusPill, { recPillKind, scorePillKind } from "../StatusPill";
import { SectionHeader, V2Notice } from "./PipelineTab";
import type { AuditRow } from "@/lib/bd-os/queries";

interface Props {
  recent: AuditRow[];
}

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
    <div className="space-y-5">
      <SectionHeader
        title="Audit"
        subtitle="Lockheed-grade 3-call audit · classifier + overview + compliance + risks · ~2 min · Opus 4.7"
      />

      <form onSubmit={submit} className="bg-[#091322] border border-[#122240] rounded p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="md:col-span-1 space-y-1">
            <span className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">SAM.gov Notice ID</span>
            <input
              type="text"
              value={noticeId}
              onChange={(e) => setNoticeId(e.target.value.trim())}
              placeholder="FA301626Q0068"
              className="w-full bg-[#050D1A] border border-[#122240] rounded px-3 h-9 text-[13px] text-[#EDF4FF] focus:border-[#378ADD] outline-none"
              style={{ fontFamily: "var(--mono)" }}
            />
          </label>
          <label className="md:col-span-2 space-y-1">
            <span className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">Or upload PDF</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] || null)}
              className="block w-full text-[12px] text-[#B5D4F4] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-[#185FA5] file:text-[#EDF4FF] file:text-[12px] file:cursor-pointer hover:file:bg-[#378ADD] cursor-pointer bg-[#050D1A] border border-[#122240] rounded h-9 leading-[2.25rem]"
            />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-[#5B8AB8]">
            Engine: <code className="text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}>claude-opus-4-7</code> ·
            schema: 14 compliance keys · 12 risk keys · DFARS-trap auto-flag
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 h-9 rounded bg-[#185FA5] hover:bg-[#378ADD] text-[#EDF4FF] text-[12px] font-medium uppercase tracking-[0.08em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Auditing…" : "Run audit"}
          </button>
        </div>
        {error && <div className="text-[12px] text-[#EF4444]">{error}</div>}
      </form>

      {result && (
        <div className="bg-[#091322] border border-[#378ADD] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">Audit complete</div>
              <div className="text-[14px] text-[#EDF4FF]" style={{ fontFamily: "var(--mono)" }}>
                {result.auditId}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {result.recommendation && <StatusPill kind={recPillKind(result.recommendation)}>{result.recommendation.replace("_", " ")}</StatusPill>}
              {typeof result.score === "number" && <StatusPill kind={scorePillKind(result.score)}>Score {result.score}/100</StatusPill>}
            </div>
          </div>
          <p className="text-[12px] text-[#5B8AB8]">
            Full result persisted to <code className="text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}>audits</code> +
            <code className="text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}> fa_intelligence_corpus</code>.
            See Corpus tab for live counter.
          </p>
        </div>
      )}

      <div>
        <h3 className="text-[12px] uppercase tracking-[0.1em] text-[#5B8AB8] mb-2">Recent audits ({recent.length})</h3>
        <div className="border border-[#122240] rounded overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#0D1C30] text-[10px] uppercase tracking-[0.1em] text-[#5B8AB8]">
              <tr>
                <th className="text-left font-medium px-3 py-2.5">When</th>
                <th className="text-left font-medium px-3 py-2.5">Notice</th>
                <th className="text-left font-medium px-3 py-2.5">Title</th>
                <th className="text-left font-medium px-3 py-2.5">Agency</th>
                <th className="text-left font-medium px-3 py-2.5">Source</th>
                <th className="text-right font-medium px-3 py-2.5">Score</th>
                <th className="text-left font-medium px-3 py-2.5">Recommendation</th>
              </tr>
            </thead>
            <tbody className="bg-[#091322]">
              {recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-[#2D5280] italic">
                    No audits yet. Run one above.
                  </td>
                </tr>
              )}
              {recent.map((a) => (
                <tr key={a.id} className="border-t border-[#122240] hover:bg-[#0D1C30] transition-colors">
                  <td className="px-3 py-2.5 text-[#5B8AB8] whitespace-nowrap" style={{ fontFamily: "var(--mono)" }}>
                    {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-2.5 text-[#B5D4F4]" style={{ fontFamily: "var(--mono)" }}>{a.notice_id || "—"}</td>
                  <td className="px-3 py-2.5 text-[#EDF4FF] max-w-[280px] truncate" title={a.title || ""}>{a.title || "—"}</td>
                  <td className="px-3 py-2.5 text-[#5B8AB8] max-w-[160px] truncate" title={a.agency || ""}>{a.agency || "—"}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill kind={a.audit_source === "audit_ai" ? "info" : "neutral"}>
                      {a.audit_source || "user"}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {a.compliance_score != null ? (
                      <StatusPill kind={scorePillKind(a.compliance_score)}>{a.compliance_score}</StatusPill>
                    ) : (
                      <span className="text-[#2D5280]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {a.recommendation ? (
                      <StatusPill kind={recPillKind(a.recommendation)}>{a.recommendation.replace("_", " ")}</StatusPill>
                    ) : (
                      <span className="text-[#2D5280]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <V2Notice items={[
        "Inline result viewer with full overview/compliance/risks panes",
        "Audit version history per solicitation (compare runs over time)",
        "KO clarification email auto-drafted from compliance gaps",
        "PDF export with FARaudit cover sheet + executive risk summary",
        "Trigger audit from Opportunities row (one-click instead of typing notice ID)"
      ]} />
    </div>
  );
}
