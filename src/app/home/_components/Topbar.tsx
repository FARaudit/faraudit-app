"use client";

import type { HeaderCounter } from "@/lib/bd-os/queries";

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
}

export default function Topbar({ user, counter }: Props) {
  const initials = (user.email[0] || "?").toUpperCase() + (user.email.split("@")[0]?.[1] || "").toUpperCase();
  const handle = user.email.split("@")[0];

  return (
    <header
      style={{
        gridColumn: "1 / -1",
        gridRow: "1",
        height: "var(--bd-topbar)",
        background: "var(--bg-primary)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 30
      }}
    >
      {/* Brand block — width matches sidebar */}
      <div
        style={{
          width: "var(--bd-sidebar)",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderRight: "1px solid var(--border)",
          flexShrink: 0
        }}
      >
        <div
          style={{
            fontFamily: "var(--bd-serif)",
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)"
          }}
        >
          FAR<span style={{ color: "var(--gold)" }}>audit</span>
        </div>
      </div>

      {/* Center — live corpus counter */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--bd-mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            background: "rgba(16,185,129,.06)",
            border: "1px solid rgba(16,185,129,.2)",
            borderRadius: 3,
            padding: "5px 12px",
            color: "var(--green)"
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
              animation: "bd-ldot 1.6s ease-in-out infinite",
              boxShadow: "0 0 8px rgba(16,185,129,.6)"
            }}
          />
          <span>LIVE</span>
          <span style={{ color: "var(--text2)", margin: "0 4px" }}>·</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{counter.audits.toLocaleString()}</span>
          <span style={{ color: "var(--text2)" }}>solicitations</span>
          <span style={{ color: "var(--muted)" }}>·</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{counter.traps.toLocaleString()}</span>
          <span style={{ color: "var(--text2)" }}>traps</span>
        </div>
      </div>

      {/* Right — user */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        <button
          aria-label="Notifications"
          title="Notifications · coming next"
          style={{
            width: 30,
            height: 30,
            borderRadius: 3,
            background: "transparent",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            position: "relative",
            color: "var(--text2)"
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5a4 4 0 0 0-4 4v3l-1.5 2.5h11L12 8V5.5a4 4 0 0 0-4-4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>

        <a
          href="/sign-in"
          title={user.email}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "5px 10px 5px 6px",
            cursor: "pointer",
            textDecoration: "none"
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 2,
              background: "rgba(200,146,42,.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--bd-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--gold)"
            }}
          >
            {initials}
          </span>
          <span style={{ fontFamily: "var(--bd-mono)", fontSize: 10, fontWeight: 600, color: "var(--text2)" }}>
            {handle}
          </span>
        </a>
      </div>
    </header>
  );
}
