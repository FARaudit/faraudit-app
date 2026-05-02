"use client";

import { useState } from "react";
import type { HeaderCounter } from "@/lib/bd-os/queries";

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
}

export default function Header({ user, counter }: Props) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="border-b border-[#122240] bg-[#091322] sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-[#EDF4FF] tracking-tight" style={{ fontFamily: "var(--sans)" }}>
            <span className="text-[#378ADD]">FAR</span>audit
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#5B8AB8] hidden md:block">
            Defense Intelligence
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[12px]" style={{ fontFamily: "var(--mono)" }}>
          <span className="text-[#5B8AB8]">Live corpus</span>
          <span className="text-[#EDF4FF] font-medium">{counter.audits.toLocaleString()}</span>
          <span className="text-[#5B8AB8]">solicitations audited</span>
          <span className="text-[#2D5280]">·</span>
          <span className="text-[#EDF4FF] font-medium">{counter.traps.toLocaleString()}</span>
          <span className="text-[#5B8AB8]">traps detected</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            aria-label="Notifications"
            className="w-8 h-8 rounded flex items-center justify-center hover:bg-[#0D1C30] text-[#5B8AB8] hover:text-[#EDF4FF]"
            title="Notifications · coming next"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a4 4 0 0 0-4 4v3l-1.5 2.5h11L12 8V5.5a4 4 0 0 0-4-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu((s) => !s)}
              className="px-3 h-8 rounded text-[12px] hover:bg-[#0D1C30] text-[#B5D4F4] flex items-center gap-2"
              style={{ fontFamily: "var(--mono)" }}
            >
              <span className="w-6 h-6 rounded-full bg-[#185FA5] text-[#EDF4FF] text-[10px] flex items-center justify-center font-medium">
                {(user.email[0] || "?").toUpperCase()}
              </span>
              <span className="hidden md:inline">{user.email.split("@")[0]}</span>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 w-56 rounded border border-[#122240] bg-[#091322] py-1 text-[12px]">
                <div className="px-3 py-2 text-[#5B8AB8] border-b border-[#122240] truncate">{user.email}</div>
                <a href="/settings" className="block px-3 py-2 hover:bg-[#0D1C30] text-[#B5D4F4]">Settings</a>
                <a href="/sign-in" className="block px-3 py-2 hover:bg-[#0D1C30] text-[#B5D4F4]">Sign out</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
