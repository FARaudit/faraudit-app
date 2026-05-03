"use client";

// /settings · Profile + Theme toggle.
//
// Self-contained inline-styled page · does NOT rely on Tailwind arbitrary-value
// classes (they were silently failing under Tailwind v4 + @theme bridge,
// rendering the previous version invisible — only stray fragments showed up).
//
// AuthShell Navigation continues to render on this route (it's a private
// authed page) · this page lays out wide enough to coexist with that fixed
// sidebar without overlap.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme, type Theme } from "@/lib/theme";
import { createBrowserClient } from "@/lib/supabase-browser";

const BG = "#050D1A";
const SURFACE = "#091322";
const SURFACE_2 = "#0D1C30";
const BORDER = "#122240";
const BORDER_2 = "#1a3560";
const TEXT_1 = "#EDF4FF";
const TEXT_2 = "#5B8AB8";
const TEXT_3 = "#2D5280";
const ACCENT = "#378ADD";
const GOLD = "#C9A84C";

type Profile = {
  email: string | null;
  id: string | null;
  createdAt: string | null;
};

export default function SettingsPage() {
  const { theme, setTheme, ready } = useTheme();
  const [profile, setProfile] = useState<Profile>({ email: null, id: null, createdAt: null });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createBrowserClient();
        const { data } = await sb.auth.getUser();
        if (cancelled || !data.user) return;
        setProfile({
          email: data.user.email ?? null,
          id: data.user.id,
          createdAt: data.user.created_at ?? null
        });
      } catch {
        /* ignore — profile section will show fallbacks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;

  async function onSignOut() {
    setSigningOut(true);
    try {
      const sb = createBrowserClient();
      await sb.auth.signOut();
      window.location.href = "/sign-in";
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT_1,
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "40px 24px 80px"
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Top breadcrumb */}
        <Link
          href="/home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: TEXT_2,
            fontSize: 12,
            textDecoration: "none",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            letterSpacing: "0.06em",
            marginBottom: 18
          }}
        >
          ← Back to Home
        </Link>

        {/* Header */}
        <h1 style={{ fontSize: 28, fontWeight: 700, color: TEXT_1, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
          Profile &amp; Settings
        </h1>
        <p style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6, marginBottom: 32 }}>
          Tune the platform to your preferences.
        </p>

        {/* Profile section */}
        <section
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: "20px 22px",
            marginBottom: 18
          }}
        >
          <div style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 10, color: TEXT_3, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
            Profile
          </div>
          <Row label="Email" value={profile.email ?? "—"} />
          <Row label="User ID" value={profile.id ? profile.id.slice(0, 8) + "…" + profile.id.slice(-4) : "—"} mono />
          <Row label="Member since" value={memberSince ?? "—"} />
          <div style={{ marginTop: 16, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              style={{
                background: "transparent",
                border: `1px solid ${BORDER_2}`,
                color: TEXT_2,
                padding: "7px 14px",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                letterSpacing: "0.04em",
                cursor: signingOut ? "wait" : "pointer",
                opacity: signingOut ? 0.6 : 1
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </section>

        {/* Appearance / theme toggle section */}
        <section
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: "20px 22px",
            marginBottom: 18
          }}
        >
          <div style={{ fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 10, color: TEXT_3, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
            Appearance
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: TEXT_1, margin: "0 0 6px" }}>Theme</h2>
          <p style={{ fontSize: 12.5, color: TEXT_2, lineHeight: 1.55, margin: "0 0 16px" }}>
            Choose how FARaudit looks. <strong style={{ color: TEXT_1 }}>System</strong> follows your OS preference.
          </p>

          <div
            role="radiogroup"
            aria-label="Theme"
            aria-busy={!ready}
            style={{
              display: "inline-flex",
              border: `1px solid ${BORDER_2}`,
              borderRadius: 6,
              overflow: "hidden",
              background: SURFACE_2
            }}
          >
            {(["light", "dark", "system"] as Theme[]).map((option, idx) => {
              const active = theme === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(option)}
                  style={{
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    borderRight: idx < 2 ? `1px solid ${BORDER_2}` : "none",
                    background: active ? ACCENT : "transparent",
                    color: active ? "#FFFFFF" : TEXT_2,
                    cursor: "pointer",
                    fontFamily: "Inter, system-ui, sans-serif",
                    textTransform: "capitalize",
                    transition: "background 0.12s, color 0.12s"
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <p
            style={{
              marginTop: 14,
              fontSize: 11,
              color: TEXT_3,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              letterSpacing: "0.04em"
            }}
          >
            Current: {theme}
            {ready ? "" : " · loading…"}
            {" · persists to localStorage"}
            {profile.id ? " + Supabase user_preferences" : ""}
          </p>
        </section>

        {/* Persistence note */}
        <p
          style={{
            fontSize: 11,
            color: TEXT_3,
            lineHeight: 1.6,
            fontStyle: "italic",
            marginTop: 8
          }}
        >
          Note: server-side theme persistence requires migration{" "}
          <code style={{ background: SURFACE_2, color: GOLD, padding: "1px 5px", borderRadius: 3, fontSize: 10, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            007_user_preferences_theme.sql
          </code>{" "}
          to be applied in Supabase Studio. Until then, theme persists per-browser via localStorage.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "8px 0",
        borderBottom: `0.5px solid ${BORDER}`,
        fontSize: 13
      }}
    >
      <span style={{ color: TEXT_2 }}>{label}</span>
      <span
        style={{
          color: TEXT_1,
          fontFamily: mono ? "JetBrains Mono, ui-monospace, monospace" : "inherit",
          fontSize: mono ? 12 : 13
        }}
      >
        {value}
      </span>
    </div>
  );
}
