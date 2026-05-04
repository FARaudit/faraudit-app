"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as TooltipP from "@radix-ui/react-tooltip";
import {
  LayoutDashboard,
  FileSearch,
  Clock,
  Activity,
  FileText,
  Target,
  BarChart3,
  Newspaper,
  UserCircle,
  Building2,
  Scale,
  Scroll,
  Shield,
  TrendingUp,
  Users,
  Settings2,
  LogOut,
  Pin,
  PinOff,
  type LucideIcon
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}
interface NavSection {
  eyebrow: string;
  items: NavItem[];
}

// Mirrors the home internal sidebar IA shipped in Prompt 8. Workspace + Intelligence
// items deep-link to /home#<hash>; the home page's hashchange handler picks the hash
// up and switches the right tab. Active highlight matches the path (not the hash —
// Navigation hides on /home anyway, so /home#... links never need to highlight here).
const SECTIONS: NavSection[] = [
  {
    eyebrow: "Workspace",
    items: [
      { label: "Today", href: "/home", icon: LayoutDashboard, description: "Action board · today's signals" },
      { label: "Run Audit", href: "/home#audit", icon: FileSearch, description: "Score a solicitation" },
      { label: "Past Audits", href: "/home#past-audits", icon: Clock, description: "Audit history" },
      { label: "Pipeline", href: "/home#pipeline", icon: Activity, description: "Bid workflow stages" },
      { label: "Capability Statement", href: "/home#capability", icon: FileText, description: "Your firm's profile" }
    ]
  },
  {
    eyebrow: "Intelligence",
    items: [
      { label: "Opportunities", href: "/home#opportunities", icon: Target, description: "Live SAM.gov solicitations" },
      { label: "Defense Spending", href: "/home#defense-spending", icon: BarChart3, description: "DoD obligations by NAICS" },
      { label: "Defense News", href: "/home#news", icon: Newspaper, description: "AI-curated defense feed" },
      { label: "Contracting Officers", href: "/home#contracting-officers", icon: UserCircle, description: "KO award patterns" },
      { label: "Agencies", href: "/home#agencies", icon: Building2, description: "Win-rate by agency" },
      { label: "GAO Protests", href: "/home#protests", icon: Scale, description: "Decision history" },
      { label: "FAR/DFARS Updates", href: "/home#regulatory", icon: Scroll, description: "Clause changes" },
      { label: "CMMC Readiness", href: "/home#cmmc", icon: Shield, description: "Cyber compliance levels" },
      { label: "Wage Benchmarks", href: "/home#wages", icon: TrendingUp, description: "SCA + DBA rates" },
      { label: "Teaming Partners", href: "/home#teaming", icon: Users, description: "SAM-registered partners" }
    ]
  }
];

const ACCOUNT: NavItem[] = [
  { label: "Profile & Settings", href: "/settings", icon: Settings2, description: "Account · preferences · billing" }
];

export default function Navigation({ initialPinned }: { initialPinned: boolean }) {
  const pathname = usePathname() || "";
  const [pinned, setPinned] = useState(initialPinned);
  const [hovering, setHovering] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const expanded = pinned || hovering;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (pathname.startsWith("/home")) {
      document.documentElement.style.setProperty("--sidebar-w", "0px");
      return () => { document.documentElement.style.removeProperty("--sidebar-w"); };
    }
  }, [pathname]);

  // iPad responsive (Prompt 14): default to collapsed 52px at viewports under
  // 1024px so the sidebar doesn't eat half the content area. User's explicit
  // pin click still wins (writes localStorage + /api/preferences sidebar_pinned).
  // Runs once on mount — does NOT fight subsequent togglePin updates.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024) setPinned(false);
  }, []);

  if (pathname.startsWith("/home")) return null;

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    try {
      await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebar_pinned: next })
      });
    } catch {
      /* silent */
    }
  }

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

  useEffect(() => {
    const w = expanded ? 220 : 52;
    document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    return () => {
      document.documentElement.style.removeProperty("--sidebar-w");
    };
  }, [expanded]);

  // An item is active when pathname matches its href, ignoring the hash. Items
  // pointing at /home#... can never be active (Navigation hides on /home), so
  // only /settings and any other non-/home routes ever highlight.
  function isItemActive(href: string): boolean {
    const path = href.split("#")[0];
    return pathname === path || pathname.startsWith(path + "/");
  }

  function renderItem(it: NavItem) {
    const active = isItemActive(it.href);
    return (
      <li key={it.href}>
        {expanded ? (
          <Link
            href={it.href}
            className={`flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2 ${
              active ? "text-text border-l-2 border-accent bg-surface-2" : "text-text-2"
            }`}
          >
            <it.icon size={16} />
            <span className="flex-1 truncate">{it.label}</span>
          </Link>
        ) : (
          <TooltipP.Root>
            <TooltipP.Trigger asChild>
              <Link
                href={it.href}
                className={`flex items-center justify-center w-full py-2 hover:bg-surface-2 ${
                  active ? "text-text border-l-2 border-accent bg-surface-2" : "text-text-2"
                }`}
                aria-label={it.label}
              >
                <it.icon size={16} />
              </Link>
            </TooltipP.Trigger>
            <TooltipP.Portal>
              <TooltipP.Content
                side="right"
                sideOffset={6}
                className="bg-surface-2 border border-border-2 px-3 py-2 text-xs z-50"
                style={{ borderRadius: 4 }}
              >
                <p className="text-text font-medium">{it.label}</p>
                <p className="text-text-3 text-[11px] mt-0.5">{it.description}</p>
              </TooltipP.Content>
            </TooltipP.Portal>
          </TooltipP.Root>
        )}
      </li>
    );
  }

  return (
    <TooltipP.Provider delayDuration={0} skipDelayDuration={0}>
      <aside
        ref={ref}
        onMouseEnter={() => !pinned && setHovering(true)}
        onMouseLeave={() => !pinned && setHovering(false)}
        className="hidden md:flex fixed top-0 bottom-0 left-0 z-30 flex-col border-r border-border bg-surface transition-[width] duration-150 overflow-hidden"
        style={{ width: expanded ? 220 : 52 }}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-border h-[52px]">
          {expanded ? (
            <>
              <Link href="/home" className="text-text font-medium tracking-wide text-sm">FARaudit</Link>
              <button
                type="button"
                onClick={togglePin}
                className="text-text-3 hover:text-text-2 p-1"
                title={pinned ? "Unpin" : "Pin"}
              >
                {pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            </>
          ) : (
            <Link href="/home" className="text-accent font-bold mx-auto" title="FARaudit">FA</Link>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {SECTIONS.map((section) => (
            <div key={section.eyebrow} className="mb-2">
              {expanded && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-text-3">
                  {section.eyebrow}
                </div>
              )}
              <ul>{section.items.map(renderItem)}</ul>
            </div>
          ))}
          <div className="mb-2 border-t border-border pt-2">
            {expanded && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-text-3">
                Account
              </div>
            )}
            <ul>{ACCOUNT.map(renderItem)}</ul>
            <ul>
              <li>
                {expanded ? (
                  <button
                    type="button"
                    onClick={onSignOut}
                    disabled={signingOut}
                    className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-text-2 hover:bg-surface-2 disabled:opacity-50"
                  >
                    <LogOut size={16} />
                    <span className="flex-1 truncate text-left">{signingOut ? "Signing out…" : "Sign out"}</span>
                  </button>
                ) : (
                  <TooltipP.Root>
                    <TooltipP.Trigger asChild>
                      <button
                        type="button"
                        onClick={onSignOut}
                        disabled={signingOut}
                        className="w-full flex items-center justify-center py-2 text-text-2 hover:bg-surface-2 disabled:opacity-50"
                        aria-label="Sign out"
                      >
                        <LogOut size={16} />
                      </button>
                    </TooltipP.Trigger>
                    <TooltipP.Portal>
                      <TooltipP.Content
                        side="right"
                        sideOffset={6}
                        className="bg-surface-2 border border-border-2 px-3 py-2 text-xs z-50"
                        style={{ borderRadius: 4 }}
                      >
                        <p className="text-text font-medium">Sign out</p>
                        <p className="text-text-3 text-[11px] mt-0.5">Return to /sign-in</p>
                      </TooltipP.Content>
                    </TooltipP.Portal>
                  </TooltipP.Root>
                )}
              </li>
            </ul>
          </div>
        </nav>
      </aside>
    </TooltipP.Provider>
  );
}
