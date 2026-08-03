import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protected CEO Digest endpoint
// Access: faraudit.com/api/digest?token=YOUR_DIGEST_TOKEN
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const digestToken = process.env.CRON_SECRET || "apex-digest-2026";

  if (token !== digestToken) {
    return new NextResponse("Access denied", { status: 401 });
  }

  // Pointed at /home.html until 2026-08-03 — a legacy shell, now deleted.
  return NextResponse.redirect(new URL("/today", req.url));
}
