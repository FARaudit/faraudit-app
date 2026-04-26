"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuditPage() {
  const router = useRouter();
  const [noticeId, setNoticeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticeId: noticeId.trim() })
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
          Enter a SAM.gov notice ID. Three Claude calls (Overview · Compliance · Risks) run in parallel against the solicitation.
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
              required
              autoFocus
              disabled={submitting}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !noticeId.trim()}
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
          Audit pulls the live SAM.gov record then runs Overview, Compliance (FAR/DFARS), and Risks in parallel. Result lands at /audit/[id].
        </p>
      </div>
    </main>
  );
}
