import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase-server";

export const maxDuration = 30;

interface SendBody {
  auditId?: number | string;
  recipient?: string;
  body?: string;
  sender_name?: string;
  cc?: string;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: SendBody = await req.json().catch(() => ({}));
  const raw = body.auditId;
  const auditId =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw.trim())
      ? Number(raw.trim())
      : null;

  if (!auditId) return NextResponse.json({ error: "auditId required" }, { status: 400 });
  if (!body.recipient || !EMAIL_RX.test(body.recipient)) {
    return NextResponse.json({ error: "valid recipient email required" }, { status: 400 });
  }
  if (!body.body || body.body.trim().length < 40) {
    return NextResponse.json({ error: "email body required" }, { status: 400 });
  }
  if (body.cc && !EMAIL_RX.test(body.cc)) {
    return NextResponse.json({ error: "cc must be a valid email" }, { status: 400 });
  }

  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select("id, notice_id, title, agency")
    .eq("id", auditId)
    .single();

  if (auditErr || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const subjectMatch = body.body.match(/^Subject:\s*(.+)$/m);
  const subject = subjectMatch
    ? subjectMatch[1].trim()
    : `Clarification request — ${audit.notice_id}`;
  const emailBody = body.body.replace(/^Subject:\s*.+\n+/m, "");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddr = process.env.RESEND_FROM_EMAIL || "FARaudit <noreply@faraudit.com>";

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: fromAddr,
    to: body.recipient,
    cc: body.cc || undefined,
    replyTo: user.email || undefined,
    subject,
    text: emailBody
  });

  if (sendErr) {
    return NextResponse.json({ error: sendErr.message ?? "Resend send failed" }, { status: 502 });
  }

  await supabase
    .from("audits")
    .update({
      ko_email_sent: true,
      ko_email_sent_at: new Date().toISOString(),
      ko_email_recipient: body.recipient,
      ko_email_message_id: sent?.id ?? null
    })
    .eq("id", auditId);

  return NextResponse.json({
    ok: true,
    message_id: sent?.id ?? null,
    recipient: body.recipient,
    subject
  });
}
