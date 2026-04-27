"use client";

import { useState } from "react";

export default function KOEmailButton({ auditId }: { auditId: number | string }) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ message_id: string | null; recipient: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleClick() {
    if (!auditId) {
      setError("Audit ID missing — cannot draft email.");
      return;
    }
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
      /* clipboard unavailable; textarea is selectable */
    }
  }

  async function handleSend() {
    if (!draft) return;
    setSendError(null);
    setSentInfo(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setSendError("Enter a valid recipient email.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/ko-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditId,
          recipient: recipient.trim(),
          cc: cc.trim() || undefined,
          body: draft
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || `Send failed (HTTP ${res.status})`);
      } else {
        setSentInfo({ message_id: data.message_id ?? null, recipient: data.recipient });
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading || !auditId}
        className="px-6 py-3 bg-gold text-bg font-medium tracking-wide hover:bg-gold-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Drafting…" : "Draft KO Clarification Email"}
      </button>

      {error && <p className="mt-3 text-sm text-red border-l-2 border-red pl-3">{error}</p>}

      {draft && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3">Draft email</p>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs text-gold hover:text-gold-dim font-mono"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            className="w-full bg-surface border border-border text-text px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none focus:border-gold transition-colors resize-y"
          />

          <div className="mt-6 border-t border-border pt-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-3 mb-3">Send to KO</p>

            {sentInfo ? (
              <div className="border border-green/40 bg-green/5 p-4">
                <p className="text-sm text-text">
                  ✓ Sent to <span className="font-mono">{sentInfo.recipient}</span>
                </p>
                {sentInfo.message_id && (
                  <p className="mt-1 text-xs text-text-3 font-mono">id: {sentInfo.message_id}</p>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="email"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="ko@agency.mil"
                    disabled={sending}
                    className="bg-surface border border-border text-text px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-gold transition-colors"
                  />
                  <input
                    type="email"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc (optional)"
                    disabled={sending}
                    className="bg-surface border border-border text-text px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-gold transition-colors"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !recipient}
                  className="mt-3 px-5 py-2.5 bg-gold text-bg font-medium tracking-wide hover:bg-gold-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? "Sending…" : "Send via Resend"}
                </button>

                {sendError && (
                  <p className="mt-3 text-sm text-red border-l-2 border-red pl-3">{sendError}</p>
                )}

                <p className="mt-3 text-xs text-text-3 italic">
                  Reply-to is set to your account email. Edits in the textarea above are sent verbatim.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
