"use client";

import { useState } from "react";

export default function KOEmailButton({ auditId }: { auditId: number }) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/ko-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (HTTP ${res.status})`);
      } else {
        setDraft(data.draft || "(no draft returned)");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers — silently no-op; textarea is selectable
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-6 py-3 bg-gold text-bg font-medium tracking-wide hover:bg-gold-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Drafting…" : "Draft KO Clarification Email"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red border-l-2 border-red pl-3">{error}</p>
      )}

      {draft && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3">
              Draft email
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs text-gold hover:text-gold-dim font-mono"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <textarea
            readOnly
            value={draft}
            rows={20}
            className="w-full bg-surface border border-border text-text px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none focus:border-gold transition-colors resize-y"
          />
        </div>
      )}
    </div>
  );
}
