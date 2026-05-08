"use client";

// Navigation.tsx — sidebar shown on every authed non-/home route
// (/settings, /audit/[id], /pricing, 404, etc.). Renders the same
// gold wordmark + shield, JetBrains-Mono nav rows, custom SVG icons,
// badges, gold-fill active state, and UPGRADE TO STANDARD card that
// /home's existing inline sidebar already renders.
//
// Architecture: co-located CSS Module (Navigation.module.css). Per
// Next.js App Router behavior, modules imported by a client component
// auto-bundle on every route that renders the component, so styles
// travel with Navigation without per-route CSS imports.
//
// /home is NOT touched by this work. HomeClient.tsx renders its own
// inline sidebar inside .bd-home — we explicitly suppress Navigation
// on /home (line below) to avoid double-rendering.
//
// SVGs in ICONS map are byte-equivalent copies of the inline <svg>
// elements in HomeClient.tsx's nav buttons. No redraws, no
// optimization — exact ports keep the visual identity unchanged.

import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import styles from "./Navigation.module.css";

type IconName =
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
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity=".5" />
      <line x1="6" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity=".5" />
    </svg>
  ),
  "past-audits": (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  pipeline: (
    <svg viewBox="0 0 16 16" fill="none">
      <polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  capability: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  opportunities: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "defense-spending": (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="2" y="8" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6.5" y="5" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M2 2h12v2L8 10 2 4V2z" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  "contracting-officers": (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  agencies: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M2 14h12M3 14V6l5-3 5 3v8M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  protests: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  regulatory: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="6" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  cmmc: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M8 2L13 4V8C13 11 11 13 8 14C5 13 3 11 3 8V4L8 2Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 8l1.5 1.5L10 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wages: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M2 13h12M3 13V8h2v5M7 13V5h2v8M11 13v-3h2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  teaming: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  signout: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M10 12l3-4-3-4M5 8h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
};

interface NavBadge {
  text: string;
  variant: "red" | "gold" | "green";
}

interface NavItemDef {
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  isActive: boolean;
  badge?: NavBadge | null;
}

interface NavSection {
  label: string;
  items: NavItemDef[];
}

const BADGE_VARIANT_CLASS: Record<NavBadge["variant"], string> = {
  red: styles.badgeRed,
  gold: styles.badgeGold,
  green: styles.badgeGreen
};

export default function Navigation(_: { initialPinned: boolean }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  // Reserve --sidebar-w for the layout's main column. /home renders
  // its own inline sidebar, and Navigation suppresses itself there
  // (return null below), so --sidebar-w must be 0 on /home to avoid
  // double-padding the main column.
  useEffect(() => {
    if (pathname.startsWith("/home")) {
      document.documentElement.style.setProperty("--sidebar-w", "0px");
    } else {
      document.documentElement.style.setProperty("--sidebar-w", "220px");
    }
    return () => {
      document.documentElement.style.removeProperty("--sidebar-w");
    };
  }, [pathname]);

  if (pathname.startsWith("/home")) return null;

  // P0-J — sign-out is now form-POST to /api/auth/sign-out (server-side
  // supabase.auth.signOut() + 303 redirect). Browser-side signOut() left the
  // sb-* SSR cookie in place. The button below uses a <form> wrapper so the
  // browser performs a real top-level navigation that follows the redirect
  // and atomically commits the cookie deletions.

  const workspaceDefs: Array<{
    id: string;
    label: string;
    icon: IconName;
    href: string;
    badge?: NavBadge;
  }> = [
    { id: "today", label: "Today", icon: "today", href: "/home" },
    { id: "audit", label: "Run Audit", icon: "audit", href: "/home#audit", badge: { text: "New", variant: "gold" } },
    { id: "past-audits", label: "Past Audits", icon: "past-audits", href: "/home#past-audits" },
    { id: "pipeline", label: "Pipeline", icon: "pipeline", href: "/home#pipeline" },
    { id: "capability", label: "Capability Statement", icon: "capability", href: "/home#capability" }
  ];

  const intelligenceDefs: Array<{
    id: string;
    label: string;
    icon: IconName;
    href: string;
    badge?: NavBadge;
  }> = [
    { id: "opportunities", label: "Opportunities", icon: "opportunities", href: "/home#opportunities", badge: { text: "Live", variant: "green" } },
    { id: "defense-spending", label: "Defense Spending", icon: "defense-spending", href: "/home#defense-spending" },
    { id: "news", label: "Defense News", icon: "news", href: "/home#news" },
    { id: "contracting-officers", label: "Contracting Officers", icon: "contracting-officers", href: "/home#contracting-officers" },
    { id: "agencies", label: "Agencies", icon: "agencies", href: "/home#agencies" },
    { id: "protests", label: "GAO Protests", icon: "protests", href: "/home#protests" },
    { id: "regulatory", label: "FAR/DFARS Updates", icon: "regulatory", href: "/home#regulatory" },
    { id: "cmmc", label: "CMMC Readiness", icon: "cmmc", href: "/home#cmmc" },
    { id: "wages", label: "Wage Benchmarks", icon: "wages", href: "/home#wages" },
    { id: "teaming", label: "Teaming Partners", icon: "teaming", href: "/home#teaming" }
  ];

  const toItem = (def: { id: string; label: string; icon: IconName; href: string; badge?: NavBadge }): NavItemDef => ({
    id: def.id,
    label: def.label,
    icon: def.icon,
    onClick: () => router.push(def.href),
    isActive: false, // workspace items can't be active here — Navigation hides on /home
    badge: def.badge ?? null
  });

  const sections: NavSection[] = [
    { label: "Workspace", items: workspaceDefs.map(toItem) },
    { label: "Intelligence", items: intelligenceDefs.map(toItem) },
    {
      label: "Account",
      items: [
        {
          id: "settings",
          label: "Profile & Settings",
          icon: "settings",
          onClick: () => router.push("/settings"),
          isActive: pathname === "/settings",
          badge: null
        },
        {
          id: "signout",
          label: "Sign out",
          icon: "signout",
          // Rendered as a form-POST button below; this onClick is a no-op
          // kept only because the NavItem type requires the field. The
          // <form>'s submit drives the navigation.
          onClick: () => {},
          isActive: false,
          badge: null
        }
      ]
    }
  ];

  return (
    <aside className={styles.root}>
      <div className={styles.brand}>
        <svg className={styles.shield} width="22" height="22" viewBox="0 0 28 28" fill="none">
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
        <span className={styles.wordmark}>
          FAR<span className={styles.wordmarkAccent}>audit</span>
        </span>
      </div>

      <div className={styles.nav}>
        {sections.map((section) => (
          <div key={section.label} className={styles.section}>
            <div className={styles.navLabel}>{section.label}</div>
            {section.items.map((item) => {
              if (item.id === "signout") {
                return (
                  <form
                    key={item.id}
                    action="/api/auth/sign-out"
                    method="post"
                    style={{ margin: 0 }}
                  >
                    <button
                      type="submit"
                      className={`${styles.navItem} ${item.isActive ? styles.active : ""}`}
                      style={{ width: "100%" }}
                    >
                      <span className={styles.navIcon}>{ICONS[item.icon]}</span>
                      <span className={styles.navItemLabel}>{item.label}</span>
                    </button>
                  </form>
                );
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${item.isActive ? styles.active : ""}`}
                  onClick={item.onClick}
                >
                  <span className={styles.navIcon}>{ICONS[item.icon]}</span>
                  <span className={styles.navItemLabel}>{item.label}</span>
                  {item.badge && (
                    <span className={`${styles.badge} ${BADGE_VARIANT_CLASS[item.badge.variant]}`}>
                      {item.badge.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.plan}>Design Partner · $1,250/mo</div>
        <div className={styles.days}>Free during T1 sprint</div>
        <a href="/pricing" className={styles.upgrade}>
          Upgrade to Standard
        </a>
      </div>
    </aside>
  );
}
