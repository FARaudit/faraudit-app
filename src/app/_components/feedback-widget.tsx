"use client";

// Persistent feedback widget — fixed bottom-right button on every authed page.
// Opens a modal with Type (radio) + Description (textarea), POSTs to /api/feedback,
// which forwards to jose@faraudit.com via Resend. Errors surface — no silent success.

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

type FeedbackType = "Bug Report" | "Feature Request" | "General Feedback";

export default function FeedbackWidget({ userEmail }: { userEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("Bug Report");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "success" | "error"; msg?: string }>({ kind: "idle" });
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit() {
    const desc = description.trim();
    if (!desc) {
      setStatus({ kind: "error", msg: "Description required." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          description: desc,
          email: userEmail,
          url: typeof window !== "undefined" ? window.location.href : pathname,
          timestamp: new Date().toISOString()
        })
      });
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j.error || ""; } catch { /* not json */ }
        setStatus({ kind: "error", msg: `HTTP ${res.status}${detail ? ": " + detail : ""}` });
        return;
      }
      setStatus({ kind: "success" });
      setDescription("");
      setTimeout(() => { setOpen(false); setStatus({ kind: "idle" }); }, 1800);
    } catch (err) {
      setStatus({ kind: "error", msg: err instanceof Error ? err.message : "Network error" });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        style={{
          position: "fixed",
          bottom: 18,
          right: 18,
          zIndex: 90,
          background: "rgba(201,168,76,.92)",
          color: "#03080F",
          border: "none",
          borderRadius: 999,
          padding: "10px 16px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,.4)"
        }}
      >
        💬 Feedback
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.55)",
          zIndex: 100,
          backdropFilter: "blur(2px)"
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          bottom: 18,
          right: 18,
          width: "min(420px, calc(100vw - 36px))",
          background: "#060F1C",
          border: "1px solid rgba(201,168,76,.25)",
          borderRadius: 8,
          padding: 20,
          zIndex: 101,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#F5F0E8",
          boxShadow: "0 12px 40px rgba(0,0,0,.6)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#C9A84C" }}>
            Send Feedback
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "rgba(245,240,232,.5)", fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {(["Bug Report", "Feature Request", "General Feedback"] as FeedbackType[]).map((t) => (
            <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", color: type === t ? "#C9A84C" : "rgba(245,240,232,.7)" }}>
              <input
                type="radio"
                name="feedback-type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                style={{ accentColor: "#C9A84C" }}
              />
              {t}
            </label>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's on your mind? Steps to reproduce if it's a bug..."
          rows={5}
          disabled={status.kind === "sending"}
          style={{
            width: "100%",
            background: "#03080F",
            border: "1px solid rgba(201,168,76,.18)",
            borderRadius: 4,
            color: "#F5F0E8",
            padding: 10,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            marginBottom: 12
          }}
        />

        {status.kind === "error" && (
          <div style={{ fontSize: 11, color: "#EF4444", marginBottom: 10 }}>{status.msg}</div>
        )}
        {status.kind === "success" && (
          <div style={{ fontSize: 11, color: "#10B981", marginBottom: 10 }}>✓ Sent. Thanks.</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={status.kind === "sending"}
            style={{
              background: "transparent",
              border: "1px solid rgba(245,240,232,.18)",
              color: "rgba(245,240,232,.7)",
              padding: "8px 14px",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={status.kind === "sending" || !description.trim()}
            style={{
              background: "#C9A84C",
              border: "none",
              color: "#03080F",
              padding: "8px 14px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: status.kind === "sending" || !description.trim() ? "default" : "pointer",
              opacity: status.kind === "sending" || !description.trim() ? 0.5 : 1
            }}
          >
            {status.kind === "sending" ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
