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
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold tracking-tight">Sign in to FARaudit</h1>
        <p className="mt-2 text-zinc-400">Magic link — no password.</p>

        {status === "sent" ? (
          <div className="mt-8 rounded-xl border border-emerald-800 bg-emerald-950/40 p-6">
            <p className="font-semibold">Check your inbox</p>
            <p className="text-sm text-zinc-400 mt-2">
              We sent a sign-in link to <span className="text-white">{email}</span>. Click the link to continue.
            </p>
            <button
              onClick={() => { setStatus("idle"); setEmail(""); }}
              className="mt-4 text-xs text-zinc-500 underline hover:text-zinc-300"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-zinc-400 mb-2">
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
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
            {error && (
              <p className="text-sm text-red-400 mt-2">{error}</p>
            )}
          </form>
        )}

        <p className="mt-8 text-xs text-zinc-600">
          By continuing you agree to our terms. We never share your email.
        </p>
      </div>
    </main>
  );
}
