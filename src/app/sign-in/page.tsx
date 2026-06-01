"use client";

import { useState, FormEvent, Suspense } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";

function SignInForm() {
  // ── Supabase auth state (unchanged from prior version) ──
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent]         = useState(false);
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlError     = searchParams.get("error");
  const next         = searchParams.get("next") ?? "/command-center";

  // ── Handlers (unchanged from prior version) ──
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

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
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

  // ── Markup: new Claude Design sign-in layout, hooked to existing handlers ──
  return (
    <>
      <link rel="stylesheet" href="/auth.css" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="auth-shell">

        {/* ── LEFT BRAND PANEL ── */}
        <aside className="brand-panel">
          <div className="bp-top">
            <a className="brand" href="/">
              <span className="tile">F</span>
              <span className="wordmark">FAR<span>audit</span></span>
            </a>
          </div>
          <div className="bp-mid">
            <div className="eyebrow"><span className="dot"></span>Federal Contract Intelligence</div>
            <h2>Seven of eight acquisition stages.<br /><span className="accent">One command center.</span></h2>
            <div className="bp-card">
              <div className="bp-card-top">
                <div className="label"><span className="ico">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /></svg>
                </span>Live Solicitations</div>
                <div className="corner-dot">Live</div>
              </div>
              <div className="bp-num">200<span className="unit">on SAM.gov</span></div>
              <div className="bp-sub">Matched against your NAICS &amp; PSCs in the last 24h.</div>
              <svg className="spark" viewBox="0 0 300 46" preserveAspectRatio="none">
                <path className="fill" d="M0,38 L30,34 L60,30 L90,32 L120,24 L150,26 L180,17 L210,19 L240,11 L270,13 L300,5 L300,46 L0,46 Z" />
                <path d="M0,38 L30,34 L60,30 L90,32 L120,24 L150,26 L180,17 L210,19 L240,11 L270,13 L300,5" />
              </svg>
            </div>
          </div>
          <div className="bp-foot mono">SOC 2 Type II · FedRAMP-aligned · SAM.gov synced 2m ago</div>
        </aside>

        {/* ── RIGHT FORM PANEL ── */}
        <main className="form-panel">
          <div className="form-card">
            <div className="brand brand-sm">
              <span className="tile">F</span>
              <span className="wordmark">FAR<span>audit</span></span>
            </div>
            <h1>Sign in</h1>
            <p className="sub">Welcome back. Pick up where your pipeline left off.</p>

            {/* ── ERROR BANNER ── */}
            {(error || urlError) && (
              <div className="auth-error" role="alert">
                {error || urlError}
              </div>
            )}

            {/* ── MAGIC LINK SENT / RESET SENT STATES ── */}
            {magicLinkSent ? (
              <div className="auth-success">
                Magic link sent to <strong>{email}</strong>.<br />
                Check your inbox — expires in 1 hour.
              </div>
            ) : resetSent ? (
              <div className="auth-info">
                Password reset email sent to <strong>{email}</strong>.<br />
                Check your inbox.
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <label className="field">
                  <span className="lbl">Work email</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </label>
                <label className="field">
                  <span className="lbl">
                    Password
                    <a className="lbl-link" href="#" onClick={handleForgotPassword}>Forgot?</a>
                  </span>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </label>

                <label className="checkrow">
                  <input type="checkbox" name="remember" defaultChecked />
                  <span>Keep me signed in on this device</span>
                </label>

                <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in →"}
                </button>

                <div className="divider"><span>or</span></div>

                <button type="button" className="btn btn-ghost btn-block" onClick={handleMagicLink} disabled={loading}>
                  Email me a sign-in link
                </button>
              </form>
            )}

            <p className="alt">New to FARaudit? <a href="/access.html">Request access&nbsp;→</a></p>
          </div>
          <div className="legal mono">© 2026 FARaudit Inc. · Dover, DE</div>
        </main>

      </div>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0A1628", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#378ADD", fontFamily: "Manrope, system-ui, sans-serif", fontSize: 14 }}>Loading…</div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
