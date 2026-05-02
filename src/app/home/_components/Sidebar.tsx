"use client";

import Link from "next/link";

// Sidebar nav uses URL-hash routing for in-app tabs (matches BdOsShell)
// and standard Link for external pages (settings, sign-out).

const PLATFORM_NAV = [
  { label: "Mission Control", hash: "#pipeline", icon: "grid", count: null, tone: null as "red" | "gold" | "green" | null },
  { label: "Run Audit", hash: "#audit", icon: "doc", count: "New", tone: "gold" as const },
  { label: "Pipeline", hash: "#pipeline", icon: "trend", count: null, tone: null },
  { label: "Past Audits", hash: "#audit", icon: "clock", count: null, tone: null },
  { label: "Reports Library", hash: "#corpus", icon: "lines", count: null, tone: null }
];

const INTEL_NAV = [
  { label: "SAM.gov Feed", hash: "#opportunities", icon: "check-circle", count: "Live", tone: "green" as const },
  { label: "Awards", hash: "#awards", icon: "bars", count: null, tone: null as "red" | "gold" | "green" | null },
  { label: "Submission", hash: "#submission", icon: "send", count: null, tone: null }
];

export default function Sidebar() {
  return (
    <aside
      style={{
        gridColumn: "1",
        gridRow: "2",
        background: "var(--void2)",
        borderRight: "1px solid var(--bd-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "12px 0"
      }}
    >
      <NavLabel>Platform</NavLabel>
      {PLATFORM_NAV.map((n) => <NavItem key={n.label} {...n} />)}

      <NavLabel>Intelligence</NavLabel>
      {INTEL_NAV.map((n) => <NavItem key={n.label} {...n} />)}

      <NavLabel>Account</NavLabel>
      <NavItem label="Profile & Settings" hash="/settings" icon="user" external />

      <div
        style={{
          marginTop: "auto",
          padding: "14px 16px",
          borderTop: "1px solid var(--bd-border)"
        }}
      >
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--t25)", letterSpacing: "0.05em" }}>
          Design Partner · $1,250/mo
        </div>
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 10, fontWeight: 700, color: "var(--gold)", opacity: 0.65 }}>
          Free during T1 sprint
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--bd-mono)",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--void)",
            background: "var(--gold)",
            padding: "7px 12px",
            borderRadius: 2,
            textAlign: "center",
            cursor: "pointer",
            opacity: 0.8
          }}
        >
          Upgrade to Standard
        </div>
      </div>
    </aside>
  );
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--bd-mono)",
        fontSize: 7.5,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--t25)",
        padding: "12px 16px 5px"
      }}
    >
      {children}
    </div>
  );
}

interface NavItemProps {
  label: string;
  hash: string;
  icon: string;
  count?: string | number | null;
  tone?: "red" | "gold" | "green" | null;
  external?: boolean;
}

function NavItem({ label, hash, icon, count, tone, external }: NavItemProps) {
  const Component = external ? Link : "a";
  return (
    <Component
      href={hash}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 16px",
        cursor: "pointer",
        fontFamily: "var(--bd-mono)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.03em",
        color: "var(--t40)",
        borderLeft: "2px solid transparent",
        textDecoration: "none",
        position: "relative"
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "var(--text2)";
        el.style.background = "rgba(201,168,76,.03)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "var(--t40)";
        el.style.background = "transparent";
      }}
    >
      <Icon name={icon} />
      {label}
      {count != null && (
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--bd-mono)",
            fontSize: 8,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 8,
            ...(tone === "red" && {
              background: "rgba(220,38,38,.16)",
              color: "var(--red)",
              border: "1px solid rgba(220,38,38,.22)"
            }),
            ...(tone === "gold" && {
              background: "rgba(201,168,76,.12)",
              color: "var(--gold)",
              border: "1px solid rgba(201,168,76,.2)"
            }),
            ...(tone === "green" && {
              background: "rgba(74,222,128,.1)",
              color: "var(--green)",
              border: "1px solid rgba(74,222,128,.18)"
            })
          }}
        >
          {count}
        </span>
      )}
    </Component>
  );
}

function Icon({ name }: { name: string }) {
  const props = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none" };
  switch (name) {
    case "grid":
      return (<svg {...props}><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>);
    case "doc":
      return (<svg {...props}><path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/><line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/><line x1="6" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/></svg>);
    case "trend":
      return (<svg {...props}><polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "clock":
      return (<svg {...props}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    case "lines":
      return (<svg {...props}><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    case "check-circle":
      return (<svg {...props}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "bars":
      return (<svg {...props}><rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>);
    case "send":
      return (<svg {...props}><path d="M2 2h12v2L8 10 2 4V2z" stroke="currentColor" strokeWidth="1.2" fill="none"/><line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    case "user":
      return (<svg {...props}><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    default:
      return null;
  }
}
