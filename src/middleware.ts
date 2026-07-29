import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  "/landing.html",
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
    // `next` must carry the QUERY too, not just the pathname: deep links like
    // /audit?noticeId=<ref> (the Opportunities "Run Audit" button) otherwise
    // dropped their parameters and landed the user on an empty form after
    // signing in. Cloning also inherited the original params onto the sign-in
    // URL as strays, so build the target explicitly instead.
    const target = `${pathname}${request.nextUrl.search}`;
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", target);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
