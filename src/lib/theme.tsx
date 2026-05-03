"use client";

// Theme system foundation — light default · dark + system options.
// Persists to user_preferences.theme (server) when authed, localStorage (client) otherwise.
// Components stay on legacy --fa-* vars until migrated; this file builds the wiring.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode
} from "react";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "faraudit-theme";
const VALID: Theme[] = ["light", "dark", "system"];

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

function applyToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe initial: render with light default; once mounted, hydrate from storage/server.
  const [theme, setThemeState] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  // ━ Initial load (client only) ━
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. localStorage first (fast, works logged-out).
      let initial: Theme = "light";
      try {
        const fromLocal = window.localStorage.getItem(STORAGE_KEY);
        if (isTheme(fromLocal)) initial = fromLocal;
      } catch {
        /* private mode or storage disabled · fall through */
      }

      // 2. If logged in, server pref wins (canonical source of truth).
      try {
        const res = await fetch("/api/preferences", { credentials: "include" });
        if (res.ok) {
          const json = (await res.json()) as { preferences?: { theme?: string } | null };
          const serverTheme = json?.preferences?.theme;
          if (isTheme(serverTheme)) initial = serverTheme;
        }
        // 401 (logged out) and other errors → keep localStorage fallback.
      } catch {
        /* network · keep localStorage */
      }

      if (cancelled) return;
      setThemeState(initial);
      applyToDom(initial);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ━ Setter — apply DOM, persist locally + server (best effort) ━
  const setTheme = useCallback((next: Theme) => {
    if (!isTheme(next)) return;
    setThemeState(next);
    applyToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    // Best-effort server persist · ignore 401 (logged-out user uses localStorage).
    fetch("/api/preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next })
    }).catch(() => {
      /* offline · localStorage already saved */
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, ready }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Defensive — if a component using useTheme() renders outside the provider
    // (e.g. during a refactor), give it a no-op so we don't crash the page.
    return {
      theme: "light",
      setTheme: () => {},
      ready: false
    };
  }
  return ctx;
}
