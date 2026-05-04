"use client";

// Theme system — Dark + Auto only (Light dropped May 3 2026, F-44).
// Stale 'light' / 'system' values from localStorage or server coerce to 'auto' on load.
// Persists to user_preferences.theme (server) when authed, localStorage (client) otherwise.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode
} from "react";

export type Theme = "dark" | "auto";
const STORAGE_KEY = "faraudit-theme";
const VALID: Theme[] = ["dark", "auto"];

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

// Stale values from before the F-44 cleanup map to Auto.
function coerce(v: unknown): Theme {
  if (v === "dark") return "dark";
  if (v === "auto") return "auto";
  if (v === "light" || v === "system") return "auto";
  return "dark";
}

function applyToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  // ━ Initial load (client only) ━
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let initial: Theme = "dark";
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
      if (serverStale) {
        fetch("/api/preferences", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: initial })
        }).catch(() => {
          /* offline */
        });
      }
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
    return {
      theme: "dark",
      setTheme: () => {},
      ready: false
    };
  }
  return ctx;
}
