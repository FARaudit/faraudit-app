"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (otpError) {
      setError(otpError.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-5">
      {/* Left panel — 40% */}
      <aside className="lg:col-span-2 bg-bg border-b lg:border-b-0 lg:border-r border-border px-8 md:px-12 py-12 lg:py-16 flex flex-col justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">
            FARaudit
          </p>
          <h1 className="mt-12 lg:mt-20 font-display text-3xl md:text-4xl font-light text-text leading-[1.1]">
            Federal Contract<br />Intelligence
            <span className="text-gold">.</span>
          </h1>
          <p className="mt-6 text-text-2 leading-relaxed max-w-md">
            Sign in to access live solicitation feeds, three-call compliance audits, and the full empire stack.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-text-2">
            <li className="flex items-start gap-3">
              <span className="text-gold mt-1.5 font-mono">—</span>
              <span>Solicitation compliance auditing in 45 seconds</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-gold mt-1.5 font-mono">—</span>
              <span>FAR/DFARS clause extraction with risk scoring</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-gold mt-1.5 font-mono">—</span>
              <span>Bloomberg-grade market intelligence</span>
            </li>
          </ul>
        </div>
        <p className="mt-12 lg:mt-0 text-xs text-text-3 font-mono">
          © 2026 FARaudit. Federal Contract Intelligence.
        </p>
      </aside>

      {/* Right panel — 60% */}
      <section className="lg:col-span-3 bg-surface flex items-center justify-center px-6 md:px-10 py-16 lg:py-0">
        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl md:text-4xl text-text">
            Sign in to FARaudit
          </h2>
          <p className="mt-3 text-text-2 text-sm">
            Magic link — no password required.
          </p>

          {status === "sent" ? (
            <div className="mt-12 border border-green/40 bg-green/5 p-7">
              <p className="font-display text-xl text-text">Check your inbox</p>
              <p className="mt-3 text-sm text-text-2">
                We sent a sign-in link to <span className="text-text font-mono">{email}</span>.
              </p>
              <button
                onClick={() => {
                  setStatus("idle");
                  setEmail("");
                }}
                className="mt-5 text-xs text-text-3 underline hover:text-text-2 font-mono"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-12 space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs uppercase tracking-[0.2em] text-text-3 mb-3 font-mono"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full bg-bg border border-border text-text px-4 py-3.5 focus:outline-none focus:border-gold transition-colors font-body"
                />
              </div>
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full bg-gold text-bg py-4 font-medium tracking-wide hover:bg-gold-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === "sending" ? "Sending..." : "Send magic link"}
              </button>
              {error && (
                <p className="text-sm text-red border-l-2 border-red pl-3">{error}</p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
