import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({
    status: "queued",
    receivedAt: new Date().toISOString(),
    noticeId: body.noticeId ?? null,
    note: "Audit endpoint shell — wire to faraudit-cron pdf_analyzer module"
  });
}

export async function GET() {
  return NextResponse.json({ status: "audit endpoint live" });
}
