import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// P0-J — server-side sign-out. Browser-side supabase.auth.signOut() doesn't
// reliably clear the sb-* SSR cookie because the @supabase/ssr cookie adapter
// is bound to the server's cookies() store, not document.cookie. CEO observed
// in Chrome DevTools: PRE click → [sb-…-auth-token]; 5s POST click → url STILL
// /home, cookie STILL [sb-…-auth-token]. Three of the four prior call sites
// were using the browser client; the one that did POST /api/auth/signout
// returned JSON and let the client navigate, which left a window for the
// cookie write to race with the location change.
//
// This handler runs supabase.auth.signOut() server-side (cookie-clearing
// Set-Cookie headers attach to THIS response) and then issues a 303 redirect
// to /sign-in. The browser commits the cookie deletions atomically with the
// Location follow — no client-side race possible.
//
// Callers MUST submit via form-POST (action="/api/auth/sign-out" method="post"),
// not fetch(), so the browser performs a real top-level navigation that
// follows the redirect. fetch() would observe the redirect transparently but
// would NOT change the user's URL — they'd stay on /home with cookies cleared,
// which middleware would then bounce on the next click.
export async function POST() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
