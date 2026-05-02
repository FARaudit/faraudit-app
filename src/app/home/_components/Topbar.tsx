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
        background: "rgba(3,8,16,.96)",
        borderBottom: "1px solid var(--bd-border)",
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
          gap: 10,
          padding: "0 18px",
          borderRight: "1px solid var(--bd-border)",
          flexShrink: 0
        }}
      >
        <div
          style={{
            fontFamily: "var(--bd-serif)",
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "var(--text)"
          }}
        >
          FAR<span style={{ color: "var(--gold)" }}>audit</span>
        </div>
      </div>

      {/* Center search */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, minWidth: 0 }}>
        <div
          style={{
            flex: 1,
            maxWidth: 400,
            background: "rgba(201,168,76,.04)",
            border: "1px solid var(--bd-border)",
            borderRadius: 3,
            fontFamily: "var(--bd-mono)",
            fontSize: 11,
            color: "var(--t25)",
            cursor: "text",
            padding: "6px 12px"
          }}
        >
          ⌕ Search solicitations · NAICS · agency · KO
        </div>
      </div>

      {/* Right cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "var(--bd-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: "rgba(74,222,128,.8)",
            letterSpacing: "0.1em",
            background: "rgba(74,222,128,.06)",
            border: "1px solid rgba(74,222,128,.15)",
            borderRadius: 2,
            padding: "4px 10px"
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--green)",
              animation: "bd-ldot 2s ease-in-out infinite",
              display: "inline-block"
            }}
          />
          LIVE · <span style={{ fontFamily: "var(--bd-mono)" }}>{counter.audits.toLocaleString()}</span> AUDITED · <span style={{ fontFamily: "var(--bd-mono)" }}>{counter.traps.toLocaleString()}</span> TRAPS
        </div>

        <button
          aria-label="Notifications"
          title="Notifications · coming next"
          style={{
            width: 30,
            height: 30,
            borderRadius: 3,
            background: "rgba(201,168,76,.04)",
            border: "1px solid var(--bd-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            position: "relative",
            color: "var(--t60)"
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
            background: "rgba(201,168,76,.04)",
            border: "1px solid var(--bd-border)",
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
              background: "rgba(201,168,76,.2)",
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
          <span style={{ fontFamily: "var(--bd-mono)", fontSize: 10, fontWeight: 600, color: "var(--t60)", letterSpacing: "0.03em" }}>
            {handle}
          </span>
        </a>
      </div>
    </header>
  );
}
