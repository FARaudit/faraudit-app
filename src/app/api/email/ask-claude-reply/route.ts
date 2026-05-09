import { NextRequest, NextResponse } from "next/server";

// Resend Inbound webhook handler.
// Spec: Notion 35bfaf5b9314810abd9cc8709e10c3ce Part 1 (Reply Handler).
//
// Phase C Day 4 will:
// 1. Verify Resend webhook signature header (svix-id, svix-timestamp, svix-signature)
// 2. Extract: from, subject, text/html body, in-reply-to, references
// 3. Resolve thread context from intelligence_archive via in-reply-to
// 4. Call Sonnet 4.6 with the original brief + the user reply as the conversation turn
// 5. Resend.send the answer back to the subscriber, threaded
// 6. Archive Q + A into intelligence_archive

interface ResendInboundPayload {
  type?: string;
  data?: {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    in_reply_to?: string;
    references?: string[];
    message_id?: string;
  };
}

export async function POST(req: NextRequest) {
  let payload: ResendInboundPayload = {};
  try {
    payload = (await req.json()) as ResendInboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // TODO: signature verification

  return NextResponse.json({
    status: "stub",
    received: {
      from: payload.data?.from ?? null,
      subject: payload.data?.subject ?? null,
      messageId: payload.data?.message_id ?? null,
    },
    message: "Phase C Day 4 implementation pending",
  });
}

export async function GET() {
  return NextResponse.json({ status: "stub", endpoint: "ask-claude-reply", method: "POST only" });
}
