"use client";

import { useState, FormEvent, Suspense } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";

function SignInForm() {
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent]       = useState(false);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlError     = searchParams.get("error");
  const next         = searchParams.get("next") ?? "/home";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const sb = createBrowserClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else { router.push(next); }
  };

  const handleMagicLink = async () => {
    if (!email) { setError("Enter your email address first."); return; }
    setLoading(true);
    setError(null);
    const sb = createBrowserClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
    if (error) { setError(error.message); setLoading(false); }
    else { setMagicLinkSent(true); setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email address first."); return; }
    setLoading(true);
    setError(null);
    const sb = createBrowserClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    if (error) { setError(error.message); setLoading(false); }
    else { setResetSent(true); setLoading(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    color: "#0A1628",
    fontSize: 14,
    fontFamily: "Manrope, system-ui, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: "JetBrains Mono, monospace",
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#0A1628",
      backgroundImage: "radial-gradient(rgba(55,138,221,0.12) 1px, transparent 1px)",
      backgroundSize: "24px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "Manrope, system-ui, sans-serif",
    }}>

      {/* BRAND MARK */}
      <a href="/" style={{ textDecoration: "none", marginBottom: 36, textAlign: "center", display: "block" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: "#e2e8f2", marginBottom: 6 }}>
          FAR<span style={{ color: "#378ADD" }}>audit</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#6b8aaa", textTransform: "uppercase" }}>
          Federal Contract Intelligence
        </div>
      </a>

      {/* CARD */}
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#ffffff",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        padding: "36px 32px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.3)",
      }}>

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 8, fontFamily: "JetBrains Mono, monospace" }}>
          Sign in
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0A1628", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          Welcome back
        </h1>

        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 28px", lineHeight: 1.6 }}>
          Continue to your audit history and saved solicitations.
        </p>

        {/* ERROR BANNER */}
        {(error || urlError) && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 20 }}>
            {error || urlError}
          </div>
        )}

        {/* MAGIC LINK SENT STATE */}
        {magicLinkSent ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "20px", fontSize: 14, color: "#166534", textAlign: "center", lineHeight: 1.7 }}>
            Magic link sent to <strong>{email}</strong>.<br />
            Check your inbox — expires in 1 hour.
          </div>
        ) : resetSent ? (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "20px", fontSize: 14, color: "#1d4ed8", textAlign: "center", lineHeight: 1.7 }}>
            Password reset email sent to <strong>{email}</strong>.<br />
            Check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>

            {/* EMAIL */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@yourcompany.com"
                style={inputStyle}
              />
            </div>

            {/* PASSWORD */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {/* SIGN IN BUTTON */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: loading ? "#93c5fd" : "#378ADD",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "Manrope, system-ui, sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: 16,
                letterSpacing: "0.01em",
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            {/* DIVIDER */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
              <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            </div>

            {/* MAGIC LINK BUTTON */}
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              style={{
                width: "100%",
                padding: "11px",
                background: "transparent",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "#94a3b8",
                fontFamily: "Manrope, system-ui, sans-serif",
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: 6,
              }}
            >
              Email me a magic link
            </button>

            <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", lineHeight: 1.5, margin: "0 0 20px" }}>
              One-click sign-in for demos · existing accounts only · expires in 1h
            </p>

            {/* FOOTER */}
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                style={{ background: "none", border: "none", fontSize: 13, color: "#378ADD", cursor: "pointer", fontFamily: "Manrope, system-ui, sans-serif", display: "block", width: "100%", marginBottom: 8 }}
              >
                Forgot password?
              </button>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
                Need an account?{" "}
                <a href="/access.html" style={{ color: "#378ADD", fontWeight: 600, textDecoration: "none" }}>
                  Request Access →
                </a>
              </p>
            </div>

          </form>
        )}
      </div>
      {/* TRUST SIGNAL */}
      <div style={{
        marginTop: 20,
        fontSize: 11,
        color: "#2a4060",
        textAlign: "center",
        fontFamily: "JetBrains Mono, monospace",
        letterSpacing: "0.04em",
        lineHeight: 1.6,
      }}>
        🔒 256-bit encryption · SOC 2 in progress · Dover DE C-Corp
      </div>

    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0A1628", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#378ADD", fontFamily: "Manrope, system-ui, sans-serif", fontSize: 14 }}>Loading...</div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
