"use client";

import { useState } from "react";

interface Props {
  tier: "design_partner" | "standard" | "growth";
  label: string;
  style: React.CSSProperties;
}

export default function CheckoutButton({ tier, label, style }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/sign-in?next=${encodeURIComponent("/pricing")}`;
          return;
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        style={{ ...style, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Redirecting…" : label}
      </button>
      {err && (
        <p style={{ marginTop: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#dc2626" }}>
          {err}
        </p>
      )}
    </>
  );
}
