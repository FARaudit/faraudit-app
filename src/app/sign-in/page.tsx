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
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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

            <button
              type="submit"
              disabled={busy}
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
