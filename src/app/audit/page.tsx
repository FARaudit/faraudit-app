"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuditPage() {
  const router = useRouter();
  const [noticeId, setNoticeId] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!noticeId.trim() && !pdfFile) {
      setError("Provide a notice ID or upload a PDF.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("noticeId", noticeId.trim());
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

      router.push(`/audit/${data.auditId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold">Audit a solicitation</h1>
        <p className="mt-2 text-zinc-400">
          Enter a SAM.gov notice ID and/or upload the solicitation PDF. Three Claude calls (Overview · Compliance · Risks) run in parallel.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="noticeId" className="block text-sm text-zinc-400 mb-2">
              Notice ID
            </label>
            <input
              id="noticeId"
              type="text"
              value={noticeId}
              onChange={(e) => setNoticeId(e.target.value)}
              placeholder="e.g. W912DY24R0042"
              autoFocus
              disabled={submitting}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="pdf" className="block text-sm text-zinc-400 mb-2">
              Solicitation PDF (optional)
            </label>
            <input
              id="pdf"
              type="file"
              accept="application/pdf,.pdf"
              disabled={submitting}
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="w-full text-zinc-300 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 disabled:opacity-50"
            />
            {pdfFile && (
              <p className="text-xs text-zinc-500 mt-2">
                {pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || (!noticeId.trim() && !pdfFile)}
            className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Running audit (this takes ~45s)..." : "Run audit"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
              {error}
            </div>
          )}
        </form>

        <p className="mt-6 text-xs text-zinc-600">
          Notice ID pulls the live SAM.gov record. PDF goes directly to Claude as a document. If you provide both, both are used.
        </p>
      </div>
    </main>
  );
}
