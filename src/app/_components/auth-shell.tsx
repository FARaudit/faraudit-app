"use client";

// Renders Navigation only when:
//   1. The current pathname is a private route (not landing / marketing / auth pages)
//   2. The visitor has a Supabase session
//
// P0 fix · the rename src/proxy.ts → src/middleware.ts activated previously
// dormant middleware, but did not stop AuthShell from rendering the sidebar
// for authenticated visitors on the public landing page. This caused the
// hero copy to be cut off and the CTA to sit behind the sidebar.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Navigation from "@/components/Navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
// FeedbackWidget no longer auth-shell-mounted (used to fixed-position
// overlap content). Pages render it inline in their own topbars.

// Routes that NEVER show the sidebar regardless of auth state.
// Marketing, auth, and public-form pages.
const PUBLIC_PATHS = new Set([
  "/",
  "/sign-in",
  "/login",
  "/pricing",
  "/learn",
  "/how-it-works",
  "/terms",
  "/privacy",
  "/access",
  "/landing.html",
  "/access.html",
  "/signin.html"
]);
const PUBLIC_PREFIX = ["/auth/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

export default function AuthShell() {
  const pathname = usePathname() ?? "/";
  // Lock public routes immediately — no need to even check auth.
  const onPublic = isPublicPath(pathname);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (onPublic) return; // never fetch on public — saves a round-trip
    let cancelled = false;
    (async () => {
      try {
        const sb = createBrowserClient();
        const { data } = await sb.auth.getUser();
        if (cancelled) return;
        setAuthed(!!data.user);
        setUserEmail(data.user?.email ?? null);
      } catch {
        if (!cancelled) setAuthed(false);
      }
      // Best-effort fetch sidebar_pinned preference.
      try {
        const res = await fetch("/api/preferences", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { preferences?: { sidebar_pinned?: boolean } | null };
        if (typeof json?.preferences?.sidebar_pinned === "boolean") {
          setPinned(json.preferences.sidebar_pinned);
        }
      } catch {
        /* keep pinned=true default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onPublic, pathname]);

  if (onPublic) return null;
  if (authed !== true) return null; // null while loading + when unauthed

  return (
    <>
      <Navigation initialPinned={pinned} />
    </>
  );
}
