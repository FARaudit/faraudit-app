import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two flows, discriminated by body shape:
//   { type, description, email?, url?, timestamp? } → bug/feature/general feedback widget
//   { userId?, email, auditId } → legacy NPS one-question email
// Both forward via Resend.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface FeedbackBody {
  // widget shape
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  // NPS shape
  userId?: string;
  auditId?: string;
  // shared
  email?: string | null;
}

export async function POST(req: Request) {
  let body: FeedbackBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email delivery offline." }, { status: 503 });
  }

  // ━━ Widget path ━━ (Bug Report / Feature Request / General Feedback)
  if (body.type && body.description) {
    const type = String(body.type).slice(0, 50);
    const description = String(body.description).trim();
    if (!description) {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }
    const userEmail = (body.email && String(body.email).trim()) || "(no email on session)";
    const url = body.url || "";
    const timestamp = body.timestamp || new Date().toISOString();

    const html = `<div style="font-family:'JetBrains Mono',monospace;background:#03080f;color:#c8dff2;padding:24px;max-width:560px;line-height:1.7;font-size:13px">
      <div style="font-size:11px;color:#c4a44a;letter-spacing:.18em;text-transform:uppercase;margin-bottom:12px">FARaudit Feedback · ${esc(type)}</div>
      <div style="font-size:15px;color:#fff;font-weight:600;margin-bottom:18px">From: ${esc(userEmail)}</div>
      <div style="background:#060f1c;border-left:3px solid #c4a44a;padding:14px;margin-bottom:18px;color:#f5f0e8;white-space:pre-wrap;font-family:inherit">${esc(description)}</div>
      <table style="border-collapse:collapse;width:100%;font-size:11px">
        <tr><td style="padding:3px 0;color:#5a7fa0;width:80px">Page</td><td style="color:#c8dff2">${esc(url)}</td></tr>
        <tr><td style="padding:3px 0;color:#5a7fa0">Sent</td><td style="color:#c8dff2">${esc(timestamp)}</td></tr>
      </table>
    </div>`;

    const text = `FARaudit Feedback · ${type}
From: ${userEmail}

${description}

Page: ${url}
Sent: ${timestamp}`;

    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: "FARaudit Feedback <jose@faraudit.com>",
        to: "jose@faraudit.com",
        replyTo: userEmail.includes("@") ? userEmail : "jose@faraudit.com",
        subject: `FARaudit Feedback: ${type}`,
        text,
        html
      });
      if (error) {
        console.error("[api/feedback] Resend error:", error);
        return NextResponse.json({ error: `Resend: ${error.message || "unknown"}` }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("[api/feedback] send failed:", err);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed." }, { status: 500 });
    }
  }

  // ━━ Legacy NPS path ━━
  const { email, auditId } = body;
  if (!email || !auditId) {
    return NextResponse.json({ error: "email and auditId required" }, { status: 400 });
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
