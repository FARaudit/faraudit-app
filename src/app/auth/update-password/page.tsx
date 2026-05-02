"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";

const BG = "#03080f";
const SURFACE = "#06101a";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // The recovery-flow callback exchanged the code → we should already have a
  // session. Verify before showing the form so we don't take a password from
  // an unauthenticated visitor who guessed the URL.
  useEffect(() => {
    const sb = createBrowserClient();
    sb.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const { error: err } = await sb.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
      setInfo("Password updated. Redirecting to /home…");
      setTimeout(() => {
        router.push("/home");
        router.refresh();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setBusy(false);
    }
  }

  return (
    <main style={{ background: BG, minHeight: "100vh", padding: "80px 24px", fontFamily: "Inter, system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: 400 }}>
        <Link href="/" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT_3, textDecoration: "none", display: "inline-block", marginBottom: 24 }}>
          ← FARaudit
        </Link>

        <div style={{ background: SURFACE, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "32px 28px" }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_2, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 12 }}>
            Reset password
          </p>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 700, color: TEXT_1, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Set new password
          </h1>
          <p style={{ fontSize: 13, color: TEXT_2, marginBottom: 28, lineHeight: 1.6 }}>
            Pick something at least 8 characters. You'll be signed in to FARaudit immediately.
          </p>

          {hasSession === false && (
            <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, fontSize: 12, color: "#fca5a5", marginBottom: 16 }}>
              No active recovery session. The reset link may have expired (1h limit) or already been used.{" "}
              <Link href="/sign-in" style={{ color: "#fca5a5", textDecoration: "underline" }}>Request a new link</Link>.
            </div>
          )}

          <form onSubmit={onSubmit}>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ display: "block", fontSize: 11, color: TEXT_2, marginBottom: 6, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                New password
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={hasSession === false}
                style={{ width: "100%", padding: "10px 12px", background: BG, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: TEXT_1, fontSize: 14, fontFamily: "Inter, sans-serif", opacity: hasSession === false ? 0.5 : 1 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 20 }}>
              <span style={{ display: "block", fontSize: 11, color: TEXT_2, marginBottom: 6, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Confirm
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={hasSession === false}
                style={{ width: "100%", padding: "10px 12px", background: BG, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: TEXT_1, fontSize: 14, fontFamily: "Inter, sans-serif", opacity: hasSession === false ? 0.5 : 1 }}
              />
            </label>

            {error && (
              <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, fontSize: 12, color: "#fca5a5", marginBottom: 16 }}>
                {error}
              </div>
            )}
            {info && (
              <div style={{ padding: "10px 12px", background: "rgba(55,138,221,0.08)", border: "1px solid rgba(55,138,221,0.3)", borderRadius: 6, fontSize: 12, color: "#9bc4eb", marginBottom: 16 }}>
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || hasSession === false}
              style={{
                width: "100%",
                padding: 12,
                background: GOLD,
                color: BG,
                border: "none",
                borderRadius: 6,
                fontFamily: "Syne, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? "wait" : (hasSession === false ? "not-allowed" : "pointer"),
                opacity: (busy || hasSession === false) ? 0.6 : 1
              }}
            >
              {busy ? "Updating…" : "Set new password"}
            </button>
          </form>

          <p style={{ fontSize: 12, color: TEXT_3, marginTop: 18, textAlign: "center" }}>
            Remember it now? <Link href="/sign-in" style={{ color: GOLD }}>Back to sign-in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
