// P0-J — server-side sign-out via form-POST. Browser-side
// supabase.auth.signOut() doesn't reliably clear the sb-* SSR cookie
// (the @supabase/ssr cookie adapter is server-bound). CEO observed in
// Chrome DevTools that the cookie persisted across the click. The form
// below submits to /api/auth/sign-out, which runs supabase.auth.signOut()
// and 303-redirects to /sign-in — cookie deletions are committed atomically
// with the navigation.

export default function SignOutButton() {
  return (
    <form action="/api/auth/sign-out" method="post" style={{ margin: 0 }}>
      <button
        type="submit"
        className="mt-1 text-xs text-text-3 hover:text-text-2 underline font-mono"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        Sign out
      </button>
    </form>
  );
}
