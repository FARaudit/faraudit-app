import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signInRedirectPath } from "@/lib/nav/sign-in-redirect";

const PUBLIC = [
  "/",
  "/sign-in",
  "/login",
  "/pricing",
  "/how-it-works",
  "/learn",
  "/terms",
  "/privacy",
  "/access",
  "/access.html",
  "/pricing.html",
  "/how-it-works.html",
  "/learn.html",
  "/root-landing.html",
  "/site.css",
  "/auth.css"
];
const PUBLIC_PREFIX = ["/api/", "/_next/", "/_vercel", "/favicon", "/robots", "/vendor/", "/lifecycle/", "/auth/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Defense-in-depth: hard 404 for CEO/private file paths.
  // Matches doctrine: CEO files exist only in (1) ~/faraudit-app/ceo/ local,
  // (2) Notion, (3) private Drive — never on public web.
  const CEO_PATHS = /^\/(ceo|hub|org-chart|one-pager|session-handoff|protocols|faraudit-bookmarks|digest|ceo-digest)(\b|\/|\.|$)/i;
  if (CEO_PATHS.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (PUBLIC.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // PRESERVE THE DEEP LINK ACROSS THE SIGN-IN BOUNCE. `next` used to carry the PATHNAME only, while the clone
    // kept the original query as top-level params on /sign-in — so `/audit?noticeId=<ref>` became
    // `/sign-in?noticeId=<ref>&next=/audit`, and sign-in (which router.push()es `next` verbatim and ignores
    // everything else) landed the visitor on a BLANK Run Audit form with the reference silently gone. That is the
    // "Run Audit drops the noticeId" symptom, on the one path a signed-in walk cannot see: a shared link, an
    // expired session, a second tab. Every "Run audit" button on Opportunities points at that URL.
    // Built fresh rather than cloned, so the original params cannot ride along as decoration. The URL itself is
    // built by the single shared helper — this gate and the per-route gates must never disagree about it.
    return NextResponse.redirect(new URL(signInRedirectPath(pathname, request.nextUrl.search), request.nextUrl.origin));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
