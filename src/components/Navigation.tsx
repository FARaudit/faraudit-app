"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as TooltipP from "@radix-ui/react-tooltip";
import {
  LayoutDashboard,
  FileSearch,
  Radio,
  Users,
  Map,
  Bell,
  Settings2,
  Pin,
  PinOff,
  type LucideIcon
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

const ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Audit pipeline overview" },
  { label: "Run Audit", href: "/audit", icon: FileSearch, description: "Score a solicitation" },
  { label: "Upstream Intel", href: "/upstream-intel", icon: Radio, description: "RFI / Sources Sought feed" },
  { label: "Prospects", href: "/prospects", icon: Users, description: "Subcontractor CRM" },
  { label: "How It Works", href: "/how-it-works", icon: Map, description: "Lifecycle visual" },
  { label: "Alerts", href: "/alerts", icon: Bell, description: "Trap + KO email events" },
  { label: "Settings", href: "/settings", icon: Settings2, description: "Profile + connections" }
];

export default function Navigation({ initialPinned }: { initialPinned: boolean }) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(initialPinned);
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (pathname?.startsWith("/home")) {
      document.documentElement.style.setProperty("--sidebar-w", "0px");
      return () => { document.documentElement.style.removeProperty("--sidebar-w"); };
    }
  }, [pathname]);

  if (pathname?.startsWith("/home")) return null;

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

  useEffect(() => {
    const w = expanded ? 220 : 52;
    document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    return () => {
      document.documentElement.style.removeProperty("--sidebar-w");
    };
  }, [expanded]);

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
              <Link href="/dashboard" className="text-text font-medium tracking-wide text-sm">FARaudit</Link>
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
            <Link href="/dashboard" className="text-accent font-bold mx-auto" title="FARaudit">FA</Link>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <ul>
            {ITEMS.map((it) => {
              const isActive = pathname === it.href || pathname.startsWith(it.href + "/");
              return (
                <li key={it.href}>
                  {expanded ? (
                    <Link
                      href={it.href}
                      className={`flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2 ${
                        isActive ? "text-text border-l-2 border-accent bg-surface-2" : "text-text-2"
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
                            isActive ? "text-text border-l-2 border-accent bg-surface-2" : "text-text-2"
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
            })}
          </ul>
        </nav>
      </aside>
    </TooltipP.Provider>
  );
}
