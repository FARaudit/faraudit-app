"use client";

// Theme system — Light + Dark + Auto.
// Light re-added 2026-05-24 to match the Claude Design brand standard (CC + Run Audit).
// Stale 'system' values from localStorage or server coerce to 'auto' on load.
// Persists to user_preferences.theme (server) when authed, localStorage (client) otherwise.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode
} from "react";

export type Theme = "light" | "dark" | "auto";
const STORAGE_KEY = "faraudit-theme";
const VALID: Theme[] = ["light", "dark", "auto"];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  // ready=false until initial preference is loaded; lets UIs render without flicker.
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (VALID as readonly string[]).includes(v);
}

function coerce(v: unknown): Theme {
  if (v === "light") return "light";
  if (v === "dark") return "dark";
  if (v === "auto") return "auto";
  if (v === "system") return "auto";
  return "light";
}

function applyToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  // ━ Initial load (client only) ━
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let initial: Theme = "light";
      let staleLocal = false;
      try {
        const fromLocal = window.localStorage.getItem(STORAGE_KEY);
        if (fromLocal !== null) {
          const next = coerce(fromLocal);
          if (next !== fromLocal) staleLocal = true;
          initial = next;
        }
      } catch {
        /* private mode or storage disabled · fall through */
      }

      let serverStale = false;
      try {
        const res = await fetch("/api/preferences", { credentials: "include" });
        if (res.ok) {
          const json = (await res.json()) as { preferences?: { theme?: string } | null };
          const serverTheme = json?.preferences?.theme;
          if (typeof serverTheme === "string") {
            const next = coerce(serverTheme);
            if (next !== serverTheme) serverStale = true;
            initial = next;
          }
        }
      } catch {
        /* network · keep localStorage */
      }

      if (cancelled) return;
      setThemeState(initial);
      applyToDom(initial);
      setReady(true);

      // Persist coerced value back if stale value was found.
      if (staleLocal) {
        try {
          window.localStorage.setItem(STORAGE_KEY, initial);
        } catch {
          /* ignore */
        }
      }
      // serverStale PATCH removed alongside the setTheme PATCH — same
      // /api/preferences 400 surface. Coerced value is already in
      // localStorage above; server reconciliation is deferred.
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    if (!isTheme(next)) return;
    setThemeState(next);
    applyToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    // Server-side persistence removed 2026-05-25 — /api/preferences was
    // returning 400 on theme PATCH and surfacing as a console error on every
    // toggle. localStorage + the inline init script in layout.tsx give us
    // no-flash persistence per browser; cross-device theme sync is out of
    // scope for now. Re-add a server write here when /api/preferences is
    // re-shaped to accept the theme key without erroring.
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, ready }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "light",
      setTheme: () => {},
      ready: false
    };
  }
  return ctx;
}
