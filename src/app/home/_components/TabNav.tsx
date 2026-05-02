"use client";

import type { TabKey } from "./BdOsShell";

interface Props {
  tabs: { key: TabKey; label: string }[];
  active: TabKey;
  onSelect: (k: TabKey) => void;
}

export default function TabNav({ tabs, active, onSelect }: Props) {
  return (
    <nav className="border-b border-[#122240] bg-[#050D1A] sticky top-14 z-20">
      <div className="max-w-[1600px] mx-auto px-4 flex">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              className={[
                "px-4 h-11 text-[12px] uppercase tracking-[0.1em] transition-colors relative",
                isActive ? "text-[#EDF4FF]" : "text-[#5B8AB8] hover:text-[#B5D4F4]"
              ].join(" ")}
              style={{ fontFamily: "var(--sans)", fontWeight: 500 }}
            >
              {t.label}
              {isActive && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#378ADD]" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
