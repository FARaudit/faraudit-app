import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { userId?, email, auditId } — fires the 1-question NPS email after every audit.
// Reply-to is jose@faraudit.com so the user's number lands in the founder's inbox directly.

export async function POST(req: Request) {
  let body: { userId?: string; email?: string; auditId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { email, auditId } = body;
  if (!email || !auditId) {
    return NextResponse.json({ error: "email and auditId required" }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email delivery offline." }, { status: 503 });
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Jose Rodriguez <jose@faraudit.com>",
      to: email,
      replyTo: "jose@faraudit.com",
      subject: "Quick question about your audit",
      text: `How useful was that audit on a scale of 1-10?

Reply to this email with just a number.

Your answer goes directly to me.

— Jose Rodriguez
Founder, FARaudit`,
      html: `<div style="font-family:monospace;background:#03080f;color:#c8dff2;padding:24px;max-width:480px">
        <p style="font-size:14px;color:#fff;margin-bottom:16px">Quick question:</p>
        <p style="font-size:16px;font-weight:500;color:#c4a44a;margin-bottom:20px">
          How useful was that audit — on a scale of 1 to 10?
        </p>
        <p style="font-size:13px;color:#5a7fa0;margin-bottom:20px">
          Reply to this email with just a number. Your answer goes directly to me.
        </p>
        <p style="font-size:12px;color:#243a52">— Jose Rodriguez · Founder, FARaudit</p>
        <p style="font-size:10px;color:#243a52;margin-top:8px">audit ref: ${auditId}</p>
      </div>`
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback]", err);
    return NextResponse.json({ error: "Send failed." }, { status: 500 });
  }
}
