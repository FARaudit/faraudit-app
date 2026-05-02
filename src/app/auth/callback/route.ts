import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

// Auth callback — handles three flows by sniffing the `type` URL param:
//   - magic-link / OAuth → exchange code, redirect to `next`
//   - recovery (password reset) → exchange code (creates short-lived session
//     so the user can call updateUser), redirect to /auth/update-password
//     where the user sets a new password
//   - signup confirm → exchange code, redirect to `next`
//
// All error paths land on /sign-in (not /login — that route doesn't exist).

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");        // recovery | signup | invite | magiclink | email_change
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error.message)}`
    );
  }

  // Recovery flow → user must set a new password before continuing.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/update-password`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
