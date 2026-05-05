"use client";

// Navigation.tsx is now a thin wrapper around <AppSidebar>. The Tailwind
// aside it used to render (cool-blue palette, Lucide icons, collapse-on-
// hover, Radix tooltips) is replaced by the same warm-cream chrome /home
// uses, so /home and every non-/home route render visually-identical
// sidebar surfaces. Items here deep-link via /home#<hash> so HomeClient's
// hashchange listener picks them up and switches the workspace tab.
//
// Design simplifications baked in:
// · No collapse / pin / hover-expand. Always 220px. The pinned/initialPinned
//   prop and /api/preferences sidebar_pinned record are now no-ops here —
//   keeping the prop signature so AuthShell continues to compile.
// · No Lucide. Icons live inside AppSidebar's typed IconName map and match
//   the SVGs used by /home's inline sidebar.
// · No Radix tooltip portal. The sidebar is always expanded; tooltips were
//   only meaningful when collapsed to icons.

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import AppSidebar, { type SidebarItem, type SidebarSection } from "./AppSidebar";

export default function Navigation(_: { initialPinned: boolean }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [signingOut, setSigningOut] = useState(false);
  const [hash, setHash] = useState("");

  // /home renders its own AppSidebar inline (workspace tab pattern).
  // Hide the global sidebar there to avoid double-rendering.
  useEffect(() => {
    if (pathname.startsWith("/home")) {
      document.documentElement.style.setProperty("--sidebar-w", "0px");
      return () => { document.documentElement.style.removeProperty("--sidebar-w"); };
    }
  }, [pathname]);

  // Track current location.hash for active-state highlighting on workspace
  // items. Items pointing at /home#audit highlight only when the user is
  // already on /home (Navigation hides on /home, so this only matters
  // visually mid-deep-link click animation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHash(window.location.hash);
    const handle = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);

  if (pathname.startsWith("/home")) return null;

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

  // Build nav items. onClick is router.push for non-/home callers, so
  // workspace items deep-link to /home#<hash> and HomeClient's hashchange
  // listener resolves to the right tab on landing.
  const isWorkspaceActive = (target: string) =>
    pathname === "/home" && hash === `#${target}`;

  const sections: SidebarSection[] = [
    {
      label: "Workspace",
      items: (
        [
          { id: "today", label: "Today", icon: "today", href: "/home" },
          { id: "audit", label: "Run Audit", icon: "audit", href: "/home#audit", badge: { text: "New", variant: "gold" } },
          { id: "past-audits", label: "Past Audits", icon: "past-audits", href: "/home#past-audits" },
          { id: "pipeline", label: "Pipeline", icon: "pipeline", href: "/home#pipeline" },
          { id: "capability", label: "Capability Statement", icon: "capability", href: "/home#capability" }
        ] as Array<{ id: string; label: string; icon: SidebarItem["icon"]; href: string; badge?: SidebarItem["badge"] }>
      ).map<SidebarItem>((it) => ({
        id: it.id,
        label: it.label,
        icon: it.icon,
        onClick: () => router.push(it.href),
        isActive: isWorkspaceActive(it.id),
        badge: it.badge ?? null
      }))
    },
    {
      label: "Intelligence",
      items: (
        [
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
        ] as Array<{ id: string; label: string; icon: SidebarItem["icon"]; href: string; badge?: SidebarItem["badge"] }>
      ).map<SidebarItem>((it) => ({
        id: it.id,
        label: it.label,
        icon: it.icon,
        onClick: () => router.push(it.href),
        isActive: isWorkspaceActive(it.id),
        badge: it.badge ?? null
      }))
    },
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
          label: signingOut ? "Signing out…" : "Sign out",
          icon: "signout",
          onClick: () => { if (!signingOut) void onSignOut(); },
          isActive: false,
          badge: null
        }
      ]
    }
  ];

  return <AppSidebar sections={sections} mode="fixed" showWordmark={true} showUpgradeCTA={true} />;
}
