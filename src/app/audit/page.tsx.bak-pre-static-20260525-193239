"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./audit.css";

type Mode = "id" | "upload" | "url";

const STAGES = ["Overview", "FAR / DFARS Compliance", "Risk Extraction"] as const;

function extractNoticeIdFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\/opp\/([A-Za-z0-9]+)/i);
  return m?.[1] ?? null;
}

export default function AuditPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("id");
  const [noticeId, setNoticeId] = useState("");
  const [samUrl, setSamUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setError(null);
    } else if (file) {
      setError("Only PDF files are accepted.");
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent, active: boolean) => {
    e.preventDefault();
    setDragActive(active);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    let resolvedNoticeId = noticeId.trim();

    if (mode === "url") {
      const extracted = extractNoticeIdFromUrl(samUrl);
      if (!extracted) {
        setError("Could not extract a Notice ID from that URL.");
        return;
      }
      resolvedNoticeId = extracted;
    }

    if (mode === "upload" && !pdfFile) {
      setError("Drop or browse a PDF to audit.");
      return;
    }

    if (!resolvedNoticeId && !pdfFile) {
      setError("Provide a notice ID or upload a PDF.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("noticeId", resolvedNoticeId);
      if (pdfFile) formData.append("pdf", pdfFile);

      const res = await fetch("/api/audit", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Audit failed");
        setSubmitting(false);
        return;
      }

      const slug = (data.solicitationNumber as string | null)?.trim();
      router.push(`/audit/${slug ? slug.toLowerCase() : data.auditId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    ((mode === "id" && noticeId.trim().length > 0) ||
      (mode === "url" && samUrl.trim().length > 0) ||
      (mode === "upload" && pdfFile !== null));

  return (
    <div className="fa-run-audit">
      <main className="ra-main">
        <Link href="/command-center" className="back-link">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Command Center
        </Link>

        <div className="run-audit-stage">
          <div className="ra-shield" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>

          <h1 className="ra-title">Run a New Audit</h1>

          <p className="ra-sub">
            Upload any federal solicitation PDF. FARaudit runs{" "}
            <b>three sequential intelligence calls</b> and delivers a ranked
            report with a KO clarification email drafted and ready to send.
          </p>

          <div className="ra-steps" aria-label="Audit pipeline stages">
            {STAGES.map((label, i) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className={`ra-step${submitting ? " active" : ""}`}>
                  <span className="dot">{i + 1}</span>
                  <span className="lbl">{label}</span>
                </span>
                {i < STAGES.length - 1 && <span className="ra-arrow">→</span>}
              </span>
            ))}
          </div>

          <div className="ra-mode" role="tablist" aria-label="Input mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "id"}
              className={`ra-mode-btn${mode === "id" ? " active" : ""}`}
              onClick={() => setMode("id")}
              disabled={submitting}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              SAM Notice ID
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "upload"}
              className={`ra-mode-btn${mode === "upload" ? " active" : ""}`}
              onClick={() => setMode("upload")}
              disabled={submitting}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4v12" />
                <path d="M7 9l5-5 5 5" />
                <path d="M5 20h14" />
              </svg>
              Upload PDF
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "url"}
              className={`ra-mode-btn${mode === "url" ? " active" : ""}`}
              onClick={() => setMode("url")}
              disabled={submitting}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" />
                <path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
              </svg>
              SAM.gov URL
            </button>
          </div>

          <form onSubmit={handleSubmit} className="ra-input-wrap">
            {mode === "id" && (
              <div className="ra-input-row">
                <input
                  type="text"
                  className="ra-input"
                  placeholder="Paste a SAM.gov Notice ID — e.g. FA301626Q0068"
                  value={noticeId}
                  onChange={(e) => setNoticeId(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
                <button
                  type="submit"
                  className="ra-run-btn"
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      Running
                      <span className="ra-dots" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  ) : (
                    <>
                      Run Audit
                      <span className="ra-run-sub">Notice ID</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {mode === "upload" && (
              <div className="ra-input-row">
                <label
                  className={`ra-dropzone${dragActive ? " drag" : ""}`}
                  onDrop={handleDrop}
                  onDragOver={(e) => handleDrag(e, true)}
                  onDragEnter={(e) => handleDrag(e, true)}
                  onDragLeave={(e) => handleDrag(e, false)}
                >
                  {pdfFile ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span className="ra-dz-title">{pdfFile.name}</span>
                      <span className="ra-dz-types">
                        {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <button
                        type="button"
                        className="ra-dz-remove"
                        onClick={(e) => {
                          e.preventDefault();
                          setPdfFile(null);
                        }}
                        disabled={submitting}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M12 4v12" />
                        <path d="M7 9l5-5 5 5" />
                        <path d="M5 20h14" />
                      </svg>
                      <span className="ra-dz-title">
                        Drop a solicitation PDF or{" "}
                        <span className="ra-dz-browse">browse</span>
                      </span>
                      <span className="ra-dz-types">PDF · max 25MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    hidden
                    accept="application/pdf,.pdf"
                    onChange={(e) =>
                      setPdfFile(e.target.files?.[0] ?? null)
                    }
                    disabled={submitting}
                  />
                </label>
                <button
                  type="submit"
                  className="ra-run-btn"
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      Running
                      <span className="ra-dots" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  ) : (
                    <>
                      Run Audit
                      <span className="ra-run-sub">PDF</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {mode === "url" && (
              <div className="ra-input-row">
                <input
                  type="text"
                  className="ra-input"
                  placeholder="Paste full SAM.gov opportunity URL"
                  value={samUrl}
                  onChange={(e) => setSamUrl(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
                <button
                  type="submit"
                  className="ra-run-btn"
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      Running
                      <span className="ra-dots" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  ) : (
                    <>
                      Run Audit
                      <span className="ra-run-sub">URL</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {error && <div className="ra-error" role="alert">{error}</div>}
          </form>

          <div className="ra-chips" aria-label="Supported document types">
            {["RFQ", "RFP", "IDIQ", "IFB", "Sources Sought", "Pre-Sol Synopsis", "Task Order", "Modification"].map(
              (c) => (
                <span key={c} className="ra-chip">
                  {c}
                </span>
              )
            )}
          </div>

          <div className="ra-foot">
            <span className="ra-foot-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Avg <b>~50 sec</b>
            </span>
            <span className="ra-foot-sep">·</span>
            <span className="ra-foot-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 018 0v3" />
              </svg>
              Your PDFs stay private
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
