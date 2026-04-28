"use client";

import { useEffect, useState } from "react";

type Phase = "idle" | "armed" | "deleting" | "done" | "error";

export default function DeleteAccountButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "armed") return;
    if (countdown <= 0) {
      executeDelete();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);

  function arm() {
    if (typeof window === "undefined") return;
    const ack = window.confirm(
      "Permanently delete your account and all data? This cannot be undone. The deletion will execute in 30 seconds — you can cancel during the countdown."
    );
    if (!ack) return;
    setError(null);
    setCountdown(30);
    setPhase("armed");
  }

  function cancel() {
    setPhase("idle");
    setCountdown(30);
  }

  async function executeDelete() {
    setPhase("deleting");
    setError(null);
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" })
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error || `HTTP ${res.status}`);
        setPhase("error");
        return;
      }
      setPhase("done");
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPhase("error");
    }
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={arm}
        className="border border-red text-red hover:bg-red hover:text-bg px-4 py-2 text-xs uppercase tracking-[0.18em]"
      >
        Delete account
      </button>
    );
  }

  if (phase === "armed") {
    return (
      <div className="border border-red bg-red/5 p-4 inline-flex items-center gap-4">
        <span className="text-red font-mono text-sm">
          Deleting in <span className="font-display text-xl">{countdown}</span> s
        </span>
        <button
          type="button"
          onClick={cancel}
          className="text-text-2 hover:text-text text-xs uppercase tracking-[0.18em] underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "deleting") {
    return <p className="text-red text-xs font-mono">Deleting account…</p>;
  }

  if (phase === "done") {
    return <p className="text-green text-xs">✓ Account deleted. Redirecting…</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-red text-xs">{error}</p>
      <button
        type="button"
        onClick={() => setPhase("idle")}
        className="text-text-2 hover:text-text text-xs underline"
      >
        Try again
      </button>
    </div>
  );
}
