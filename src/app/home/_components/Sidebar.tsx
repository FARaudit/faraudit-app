"use client";

export type ViewKey =
  | "intelligence-home"
  | "run-audit"
  | "pipeline"
  | "past-audits"
  | "reports"
  | "sam-feed"
  | "budget-tracker"
  | "defense-news"
  | "settings";

interface NavSection {
  label: string;
  items: NavItemDef[];
}

interface NavItemDef {
  key: ViewKey;
  label: string;
  icon: IconKey;
  badge?: { text: string; tone: "red" | "gold" | "green" };
}

type IconKey = "grid" | "doc" | "trend" | "clock" | "lines" | "feed" | "bars" | "news" | "user";

export const NAV: NavItemDef[] = [
  { key: "intelligence-home", label: "Intelligence Home", icon: "grid" },
  { key: "run-audit",         label: "Run Audit",         icon: "doc",   badge: { text: "New", tone: "gold" } },
  { key: "pipeline",          label: "Pipeline Tracker",  icon: "trend" },
  { key: "past-audits",       label: "Past Audits",       icon: "clock" },
  { key: "reports",           label: "Reports Library",   icon: "lines" },
  { key: "sam-feed",          label: "SAM.gov Feed",      icon: "feed",  badge: { text: "Live", tone: "green" } },
  { key: "budget-tracker",    label: "Budget Tracker",    icon: "bars" },
  { key: "defense-news",      label: "Defense News",      icon: "news" },
  { key: "settings",          label: "Profile & Settings",icon: "user" }
];

const SECTIONS: NavSection[] = [
  { label: "Pipeline",     items: NAV.slice(0, 5) },
  { label: "Intelligence", items: NAV.slice(5, 8) },
  { label: "Account",      items: NAV.slice(8) }
];

interface Props {
  active: ViewKey;
  onSelect: (key: ViewKey) => void;
}

export default function Sidebar({ active, onSelect }: Props) {
  return (
    <aside
      style={{
        gridColumn: "1",
        gridRow: "2",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "12px 0"
      }}
    >
      <div style={{ flex: 1, overflowY: "auto" }}>
        {SECTIONS.map((sec) => (
          <div key={sec.label}>
            <SectionLabel>{sec.label}</SectionLabel>
            {sec.items.map((it) => (
              <NavRow
                key={it.key}
                item={it}
                isActive={active === it.key}
                onClick={() => onSelect(it.key)}
              />
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--border)"
        }}
      >
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 8, color: "var(--muted)", letterSpacing: "0.05em" }}>
          Design Partner · $1,250/mo
        </div>
        <div style={{ fontFamily: "var(--bd-mono)", fontSize: 10, fontWeight: 700, color: "var(--gold)", opacity: 0.8 }}>
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
            color: "var(--bg-primary)",
            background: "var(--gold)",
            padding: "7px 12px",
            borderRadius: 2,
            textAlign: "center",
            cursor: "pointer"
          }}
        >
          Upgrade to Standard
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--bd-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--muted)",
        padding: "12px 16px 6px"
      }}
    >
      {children}
    </div>
  );
}

function NavRow({ item, isActive, onClick }: { item: NavItemDef; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        background: isActive ? "rgba(200,146,42,.08)" : "transparent",
        borderLeft: `2px solid ${isActive ? "var(--gold)" : "transparent"}`,
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        textAlign: "left",
        fontFamily: "var(--bd-mono)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: isActive ? "var(--gold2)" : "var(--text2)",
        cursor: "pointer",
        transition: "background .12s"
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(200,146,42,.04)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <Icon name={item.icon} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span
          style={{
            fontFamily: "var(--bd-mono)",
            fontSize: 8,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 8,
            ...(item.badge.tone === "red" && {
              background: "rgba(239,68,68,.16)",
              color: "var(--red)",
              border: "1px solid rgba(239,68,68,.22)"
            }),
            ...(item.badge.tone === "gold" && {
              background: "rgba(200,146,42,.14)",
              color: "var(--gold)",
              border: "1px solid rgba(200,146,42,.22)"
            }),
            ...(item.badge.tone === "green" && {
              background: "rgba(16,185,129,.12)",
              color: "var(--green)",
              border: "1px solid rgba(16,185,129,.22)"
            })
          }}
        >
          {item.badge.text}
        </span>
      )}
    </button>
  );
}

function Icon({ name }: { name: IconKey }) {
  const props = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none" };
  switch (name) {
    case "grid": return (<svg {...props}><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>);
    case "doc":  return (<svg {...props}><path d="M4 2h7l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M11 2v3h3" stroke="currentColor" strokeWidth="1.2"/></svg>);
    case "trend":return (<svg {...props}><polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "clock":return (<svg {...props}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    case "lines":return (<svg {...props}><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    case "feed": return (<svg {...props}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "bars": return (<svg {...props}><rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>);
    case "news": return (<svg {...props}><rect x="2" y="3" width="12" height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/><line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="4" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="4" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
    case "user": return (<svg {...props}><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>);
  }
}
