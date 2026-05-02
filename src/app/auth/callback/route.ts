import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

// Auth callback — handles both Supabase auth-flow encodings:
//
//   1. PKCE / OAuth flow:  ?code=XXX
//      Exchange code via supabase.auth.exchangeCodeForSession
//
//   2. OTP / email-template flow:  ?token_hash=XXX&type=<recovery|signup|magiclink|invite|email_change>
//      Verify via supabase.auth.verifyOtp
//
// Modern Supabase email templates (default since 2024) use the token_hash
// flow. PKCE remains for OAuth providers. We handle both because we don't
// control which encoding the Studio is currently configured to send.
//
// After successful exchange/verify:
//   type=recovery → /auth/update-password (user sets new password)
//   else          → next (default /dashboard)

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type"); // recovery | signup | invite | magiclink | email_change
  const next = searchParams.get("next") ?? searchParams.get("redirect_to") ?? "/dashboard";

  // Diagnostic — Vercel function logs will show which flow Supabase is using
  // for this project. Drop the log line once production is stable.
  console.log("[auth/callback]", {
    hasCode: !!code,
    hasTokenHash: !!tokenHash,
    type: type || "(none)",
    next
  });

  const supabase = await createServerClient();

  // Branch 1 — PKCE/OAuth flow.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error.message);
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent(error.message)}`
      );
    }
    if (type === "recovery") {
      return NextResponse.redirect(`${origin}/auth/update-password`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Branch 2 — token_hash OTP flow (modern email templates).
  if (tokenHash && type) {
    const validTypes = ["recovery", "signup", "invite", "magiclink", "email_change", "email"];
    if (!validTypes.includes(type)) {
      return NextResponse.redirect(`${origin}/sign-in?error=invalid_type_${encodeURIComponent(type)}`);
    }
    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "signup" | "invite" | "magiclink" | "email_change" | "email",
      token_hash: tokenHash
    });
    if (error) {
      console.error("[auth/callback] verifyOtp error:", error.message);
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent(error.message)}`
      );
    }
    if (type === "recovery") {
      return NextResponse.redirect(`${origin}/auth/update-password`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Neither encoding present → likely a stale or malformed link.
  console.error("[auth/callback] missing both code and token_hash · query =", request.nextUrl.search);
  return NextResponse.redirect(`${origin}/sign-in?error=missing_code_or_token`);
}
