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
import "./settings.css";

// Palette matched to /home (.bd-home in src/app/home/home.css). The
// previous values were the cool-blue Tailwind theme tokens; switched
// to the warm cream-on-dark-navy + gold-accent identity /home uses
// everywhere. Mapping:
//   BG       --void  #030810      (was #050D1A · cool blue)
//   SURFACE  --void2 #060F1C      (was #091322)
//   SURFACE_2 --void3 #0A1628     (was #0D1C30)
//   BORDER   rgba(201,168,76,.10) (was #122240 · cool)
//   BORDER_2 rgba(201,168,76,.20) (was #1a3560)
//   TEXT_1   --text  #F5F0E8      (was #EDF4FF · cool white)
//   TEXT_2   --t60   60% cream    (was #5B8AB8)
//   TEXT_3   --t40   40% cream    (was #2D5280)
//   ACCENT   --gold  #C9A84C      (was #378ADD · cool blue)
//   GOLD     unchanged (already gold)
const BG = "#030810";
const SURFACE = "#060F1C";
const SURFACE_2 = "#0A1628";
const BORDER = "rgba(201, 168, 76, 0.10)";
const BORDER_2 = "rgba(201, 168, 76, 0.20)";
const TEXT_1 = "#F5F0E8";
const TEXT_2 = "rgba(245, 240, 232, 0.60)";
const TEXT_3 = "rgba(245, 240, 232, 0.40)";
const ACCENT = "#C9A84C";
const GOLD = "#C9A84C";

const SERIF = "Fraunces, Georgia, serif";

type Profile = {
  email: string | null;
  id: string | null;
  createdAt: string | null;
};

export default function SettingsPage() {
  const { theme, setTheme, ready } = useTheme();
  const [profile, setProfile] = useState<Profile>({ email: null, id: null, createdAt: null });
  const [displayName, setDisplayName] = useState<string>("");
  const [displayNameStatus, setDisplayNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
        // Load display_name from user_preferences (Prompt 1 / migration 007).
        try {
          const res = await fetch("/api/preferences", { credentials: "include" });
          if (cancelled || !res.ok) return;
          const json = (await res.json()) as { preferences?: { display_name?: string | null } | null };
          if (typeof json.preferences?.display_name === "string") {
            setDisplayName(json.preferences.display_name);
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore — profile section will show fallbacks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistDisplayName(next: string) {
    setDisplayNameStatus("saving");
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: next })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDisplayNameStatus("saved");
      setTimeout(() => setDisplayNameStatus("idle"), 1800);
    } catch {
      setDisplayNameStatus("error");
    }
  }

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
      className="settings-main"
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT_1,
        fontFamily: "Inter, system-ui, sans-serif",
        paddingTop: 40,
        paddingBottom: 80,
        paddingLeft: 24,
        paddingRight: 24
      }}
    >
      {/* Reserve space on the left for AuthShell's fixed sidebar (Navigation.tsx · 220px expanded · 52px collapsed).
          Layout's md:pl-[var(--sidebar-w,0px)] Tailwind class was failing to apply consistently — overriding here directly. */}
      <style>{`
        @media (min-width: 768px) {
          .settings-main {
            padding-left: calc(var(--sidebar-w, 220px) + 32px) !important;
            padding-right: 32px !important;
          }
        }
      `}</style>
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
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 900, color: TEXT_1, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          Profile &amp; Settings
        </h1>
        <p style={{ fontSize: 13, color: TEXT_2, lineHeight: 1.6, marginBottom: 32 }}>
          Tune the platform to your preferences.
        </p>

        {/* SECTION 1 · Account */}
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
            Account
          </div>
          <Row label="Email" value={profile.email ?? "—"} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `0.5px solid ${BORDER}`, gap: 14 }}>
            <span style={{ color: TEXT_2, fontSize: 13 }}>Display name</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {displayNameStatus === "saving" && (
                <span style={{ color: TEXT_3, fontSize: 11, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>● Saving…</span>
              )}
              {displayNameStatus === "saved" && (
                <span style={{ color: "#10B981", fontSize: 11, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>✓ Saved</span>
              )}
              {displayNameStatus === "error" && (
                <span style={{ color: "#EF4444", fontSize: 11, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>! Save failed</span>
              )}
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => { if (displayName.trim() !== "") persistDisplayName(displayName.trim()); }}
                placeholder="Your name"
                maxLength={80}
                style={{
                  background: SURFACE_2,
                  border: `1px solid ${BORDER_2}`,
                  color: TEXT_1,
                  padding: "6px 10px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "Inter, system-ui, sans-serif",
                  width: 220,
                  outline: "none"
                }}
              />
            </div>
          </div>
          {/* User UUID hidden — partial display ("135cb5c6…c797") leaks
              internal identifiers without giving the user anything actionable.
              Email already uniquely identifies the account on this page. */}
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

        {/* SECTION 2 · Preferences (theme · more options as backends ship) */}
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
            Preferences
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: TEXT_1, margin: "0 0 6px", letterSpacing: "-0.01em" }}>Theme</h2>
          <p style={{ fontSize: 12.5, color: TEXT_2, lineHeight: 1.55, margin: "0 0 16px" }}>
            Choose how FARaudit looks. <strong style={{ color: TEXT_1 }}>Auto</strong> follows your OS preference.
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
            {(["dark", "auto"] as Theme[]).map((option, idx, arr) => {
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
                    border: "none",
                    borderRight: idx < arr.length - 1 ? `1px solid ${BORDER_2}` : "none",
                    background: active ? ACCENT : "transparent",
                    color: active ? BG : TEXT_2,
                    fontWeight: active ? 700 : 600,
                    cursor: "pointer",
                    fontFamily: "JetBrains Mono, ui-monospace, monospace",
                    letterSpacing: active ? "0.06em" : "0.04em",
                    textTransform: "uppercase",
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
          </p>
        </section>

        {/* SECTION 3 · Plan & Billing (placeholder · billing backend ships in Phase 1 launch) */}
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
            Plan &amp; Billing
          </div>
          <Row label="Current plan" value="Design Partner" />
          <Row label="Pricing" value="$1,250/mo · waived during T1 sprint" />
          <p style={{ fontSize: 12, color: TEXT_2, lineHeight: 1.6, marginTop: 14, marginBottom: 14 }}>
            Billing setup coming with Phase 1 launch. Design partner pricing locks in your rate when invoicing begins.
          </p>
          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              background: "transparent",
              border: `1px solid ${GOLD}`,
              color: GOLD,
              padding: "7px 14px",
              borderRadius: 4,
              fontSize: 12,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              letterSpacing: "0.04em",
              textDecoration: "none"
            }}
          >
            View pricing →
          </Link>
        </section>
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
