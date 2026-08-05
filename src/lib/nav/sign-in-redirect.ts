// THE ONE PLACE THE SIGN-IN BOUNCE URL IS BUILT.
//
// Two gates redirect an unauthenticated visitor to /sign-in: src/middleware.ts (the live one — its matcher
// covers every path) and the individual static-HTML route handlers (defense-in-depth, reachable only if that
// matcher ever narrows). They MUST agree, and until 2026-08-04 they did not: both carried the PATHNAME only,
// so `/audit?noticeId=<ref>` came back from sign-in as a blank Run Audit form with the reference gone. Every
// "Run audit" button on Opportunities points at that URL.
//
// A rule kept in two copies is two rules. This is the single source; both callers import it.
//
// CONTRACT: `next` is the full relative destination — path AND search — encoded once, because
// src/app/sign-in/page.tsx does `router.push(searchParams.get("next"))` verbatim. Never let the original query
// ride along as separate top-level params on /sign-in: sign-in ignores them, so they read as preserved state
// while being silently dropped.
export function signInRedirectPath(pathname: string, search = ""): string {
  return `/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
