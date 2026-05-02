"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";

const BG = "#03080f";
const SURFACE = "#06101a";
const TEXT_1 = "#e2eaf4";
const TEXT_2 = "#5a7fa0";
const TEXT_3 = "#3d5b75";
const GOLD = "#c4a44a";

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function onMagicLink() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    setMagicBusy(true);
    try {
      const sb = createBrowserClient();
      // Supabase emails a one-time token; clicking the link hits /auth/callback
      // which exchanges the code for a session + redirects to `next`.
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error: err } = await sb.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          shouldCreateUser: false  // demo flow only — don't allow drive-by registrations
        }
      });
      if (err) {
        setError(err.message);
        setMagicBusy(false);
        return;
      }
      setInfo(`Magic-link sent to ${email}. Check your inbox · the link expires in 1 hour.`);
      setMagicBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Magic-link send failed");
      setMagicBusy(false);
    }
  }

  async function onForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    try {
      const sb = createBrowserClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // Supabase appends type=recovery to the link automatically; our
      // /auth/callback route detects type=recovery and routes to
      // /auth/update-password where the user sets the new password.
      const { error: err } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?type=recovery`
      });
      if (err) {
        setError(err.message);
        return;
      }
      setInfo(`Password reset link sent to ${email}. Check your inbox · expires in 1 hour.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset send failed");
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
            Sign in
          </p>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 700, color: TEXT_1, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13, color: TEXT_2, marginBottom: 28, lineHeight: 1.6 }}>
            Continue to your audit history and saved solicitations.
          </p>

          <form onSubmit={onSubmit}>
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ display: "block", fontSize: 11, color: TEXT_2, marginBottom: 6, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: BG, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: TEXT_1, fontSize: 14, fontFamily: "Inter, sans-serif" }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 20 }}>
              <span style={{ display: "block", fontSize: 11, color: TEXT_2, marginBottom: 6, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Password
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: BG, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: TEXT_1, fontSize: 14, fontFamily: "Inter, sans-serif" }}
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
              disabled={busy || magicBusy}
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
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.6 : 1
              }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 16px" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: 10, color: TEXT_3, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.14em", textTransform: "uppercase" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          <button
            type="button"
            onClick={onMagicLink}
            disabled={busy || magicBusy}
            title="No password — click the link in your email to sign in"
            style={{
              width: "100%",
              padding: 12,
              background: "transparent",
              color: TEXT_1,
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              fontFamily: "Syne, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: magicBusy ? "wait" : "pointer",
              opacity: (busy || magicBusy) ? 0.6 : 1
            }}
          >
            {magicBusy ? "Sending magic link…" : "Email me a magic link"}
          </button>
          <p style={{ fontSize: 11, color: TEXT_3, marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
            One-click sign-in for demos · existing accounts only · link expires in 1h
          </p>

          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={busy || magicBusy}
              style={{
                fontSize: 12,
                color: TEXT_2,
                background: "transparent",
                border: "none",
                cursor: (busy || magicBusy) ? "not-allowed" : "pointer",
                textDecoration: "underline",
                fontFamily: "Inter, sans-serif",
                opacity: (busy || magicBusy) ? 0.5 : 1
              }}
            >
              Forgot password?
            </button>
          </div>

          <p style={{ fontSize: 12, color: TEXT_3, marginTop: 18, textAlign: "center" }}>
            Need an account? <Link href="/audit" style={{ color: GOLD }}>Run a free audit</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
