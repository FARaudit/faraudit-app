"use client";

// Profile & Settings · theme toggle. Components elsewhere remain on legacy --fa-*
// vars until migrated; this page is the on-ramp for the new theme system.

import { useTheme, type Theme } from "@/lib/theme";

export default function SettingsPage() {
  const { theme, setTheme, ready } = useTheme();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Profile &amp; Settings</h1>
      <p className="text-sm opacity-60 mb-8">Tune the platform to your preferences.</p>

      <section className="border border-[var(--fa-border)] rounded-lg p-6 bg-[var(--fa-surface)]">
        <h2 className="text-base font-semibold mb-1">Appearance</h2>
        <p className="text-xs opacity-60 mb-5">
          Choose how FARaudit looks. <strong>System</strong> follows your OS preference.
        </p>

        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex rounded-md border border-[var(--fa-border)] overflow-hidden"
          aria-busy={!ready}
        >
          {(["light", "dark", "system"] as Theme[]).map((option) => {
            const active = theme === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(option)}
                className={
                  "px-4 py-2 text-sm font-medium transition-colors capitalize " +
                  (active
                    ? "bg-[var(--fa-accent)] text-white"
                    : "bg-transparent text-[var(--fa-text-2)] hover:text-[var(--fa-text-1)]")
                }
              >
                {option}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] opacity-50 mt-4 font-mono">
          Current: {theme} {ready ? "" : "(loading…)"}
        </p>
      </section>
    </main>
  );
}
