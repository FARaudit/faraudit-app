"use client";

// Unified sidebar shared between /home (workspace tab switcher) and
// every non-/home route (Navigation.tsx · routes via router.push).
// Renders the same DOM + class names regardless of caller so a single
// CSS rule set (.app-sidebar in home.css) styles both. The /home
// caller still wraps inside .bd-home; non-/home callers don't, so the
// .app-sidebar block in home.css carries its own design-token block
// to render correctly outside the .bd-home scope.
//
// Items are caller-driven: caller decides onClick (setTab vs router.push),
// isActive (tab state vs pathname/hash match), and badges (caller has
// data we'd need to fetch ourselves otherwise).

import { ReactNode, useEffect } from "react";
import Link from "next/link";

export type IconName =
  | "today"
  | "audit"
  | "past-audits"
  | "pipeline"
  | "capability"
  | "opportunities"
  | "defense-spending"
  | "news"
  | "contracting-officers"
  | "agencies"
  | "protests"
  | "regulatory"
  | "cmmc"
  | "wages"
  | "teaming"
  | "settings"
  | "signout";

const ICONS: Record<IconName, ReactNode> = {
  today: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  audit: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity=".5" />
      <line x1="6" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity=".5" />
    </svg>
  ),
  "past-audits": (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  pipeline: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  capability: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  opportunities: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "defense-spending": (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  news: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M2 2h12v2L8 10 2 4V2z" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  "contracting-officers": (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  agencies: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M2 14h12M3 14V6l5-3 5 3v8M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  protests: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  regulatory: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="6" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  cmmc: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L13 4V8C13 11 11 13 8 14C5 13 3 11 3 8V4L8 2Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 8l1.5 1.5L10 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wages: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M2 13h12M3 13V8h2v5M7 13V5h2v8M11 13v-3h2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  teaming: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  signout: (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
      <path d="M6 2H3v12h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 5l3 3-3 3M12 8H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
};

export interface SidebarItem {
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  isActive: boolean;
  badge?: { text: string; variant: "gold" | "red" | "green" } | null;
}

export interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

export interface AppSidebarProps {
  sections: SidebarSection[];
  /**
   * Render the FARaudit shield + wordmark at the top of the sidebar.
   * Default true. Pass false from /home where the topbar already shows
   * the wordmark, to avoid double-branding.
   */
  showWordmark?: boolean;
  /**
   * Render the bottom Design-Partner / Upgrade-to-Standard CTA card.
   * Default true.
   */
  showUpgradeCTA?: boolean;
  /**
   * 'inflow' renders the sidebar inside its parent grid/flex layout
   * (used inside /home's .bd-home .app grid). 'fixed' renders
   * position:fixed taking 220px on the left edge (used by Navigation.tsx
   * on every non-/home route). Default 'fixed'.
   */
  mode?: "inflow" | "fixed";
}

export default function AppSidebar({
  sections,
  showWordmark = true,
  showUpgradeCTA = true,
  mode = "fixed"
}: AppSidebarProps) {
  // When fixed-positioned, expose the sidebar's reserved width to the
  // root layout so its main content area can pad-left. Mirrors the
  // pattern Navigation.tsx used to set this on hover/pin transitions —
  // simplified to a static 220px since AppSidebar is never collapsed.
  useEffect(() => {
    if (mode !== "fixed") return;
    document.documentElement.style.setProperty("--sidebar-w", "220px");
    return () => {
      document.documentElement.style.removeProperty("--sidebar-w");
    };
  }, [mode]);

  return (
    <aside className={`sidebar app-sidebar app-sidebar-${mode}`}>
      {showWordmark && (
        <div className="app-sidebar-brand">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <path
              d="M14 2L24 7V15C24 20.5 19.5 25 14 26C8.5 25 4 20.5 4 15V7L14 2Z"
              stroke="#C9A84C"
              strokeWidth="1.4"
              fill="rgba(201,168,76,.1)"
              opacity=".9"
            />
            <line x1="10" y1="13" x2="18" y2="13" stroke="#C9A84C" strokeWidth=".9" opacity=".7" />
            <line x1="10" y1="16" x2="16" y2="16" stroke="#C9A84C" strokeWidth=".9" opacity=".5" />
          </svg>
          <span className="app-sidebar-wordmark">
            FAR<span>audit</span>
          </span>
        </div>
      )}

      <div className="app-sidebar-nav">
        {sections.map((section) => (
          <div key={section.label} className="app-sidebar-section">
            <div className="nav-label">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${item.isActive ? "active" : ""}`}
                onClick={item.onClick}
              >
                {ICONS[item.icon]}
                <span className="nav-item-label">{item.label}</span>
                {item.badge && (
                  <span className={`nav-ct ct-${item.badge.variant}`}>{item.badge.text}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {showUpgradeCTA && (
        <div className="sb-footer">
          <div className="sb-plan">Design Partner · $1,250/mo</div>
          <div className="sb-days">Free during T1 sprint</div>
          <Link href="/pricing" className="sb-upgrade">
            Upgrade to Standard
          </Link>
        </div>
      )}
    </aside>
  );
}
