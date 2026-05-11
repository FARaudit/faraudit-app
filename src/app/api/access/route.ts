import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { firstName, lastName, email, company, role, naics, solicitations, revenue }
// Forwards the access-request form (public/access.html) directly to jose@faraudit.com
// via Resend. Replaces the Formspree handoff that previously swallowed all errors
// in a silent try/catch.
//
// Errors surface as 4xx/5xx with a body — the client must re-enable the submit
// button and show the failure. No silent success fallback. Pattern mirrors
// src/app/api/feedback/route.ts.

interface AccessRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  role?: string;
  naics?: string;
  solicitations?: string;
  revenue?: string;
}

const REQUIRED: Array<keyof AccessRequest> = [
  "firstName", "lastName", "email", "company", "role", "naics", "solicitations", "revenue"
];

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(req: Request) {
  let body: AccessRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const missing = REQUIRED.filter((k) => !(body[k] && String(body[k]).trim()));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing fields: ${missing.join(", ")}` }, { status: 400 });
  }

  const email = String(body.email).trim();
  if (!EMAIL_RX.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email delivery offline (RESEND_API_KEY not configured)." }, { status: 503 });
  }

  const firstName = String(body.firstName).trim();
  const lastName = String(body.lastName).trim();
  const company = String(body.company).trim();
  const role = String(body.role).trim();
  const naics = String(body.naics).trim();
  const solicitations = String(body.solicitations).trim();
  const revenue = String(body.revenue).trim();

  const subject = `Access Request · ${company} · ${firstName} ${lastName}`;
  const text = `New Access Request — FARaudit Design Partner Program

Name:           ${firstName} ${lastName}
Email:          ${email}
Company:        ${company}
Role:           ${role}
NAICS:          ${naics}
Solicitations:  ${solicitations}
Revenue:        ${revenue}

Submitted: ${new Date().toISOString()}
Source: public/access.html`;

  const html = `<div style="font-family:'JetBrains Mono',monospace;background:#03080f;color:#c8dff2;padding:24px;max-width:560px;line-height:1.7;font-size:13px">
    <div style="font-size:11px;color:#c4a44a;letter-spacing:.18em;text-transform:uppercase;margin-bottom:12px">New Access Request</div>
    <div style="font-size:18px;color:#fff;font-weight:600;margin-bottom:20px">${esc(firstName)} ${esc(lastName)} · ${esc(company)}</div>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:4px 0;color:#5a7fa0;width:140px">Email</td><td style="color:#fff"><a href="mailto:${esc(email)}" style="color:#c4a44a">${esc(email)}</a></td></tr>
      <tr><td style="padding:4px 0;color:#5a7fa0">Role</td><td style="color:#fff">${esc(role)}</td></tr>
      <tr><td style="padding:4px 0;color:#5a7fa0">NAICS</td><td style="color:#fff">${esc(naics)}</td></tr>
      <tr><td style="padding:4px 0;color:#5a7fa0">Revenue band</td><td style="color:#fff">${esc(revenue)}</td></tr>
      <tr><td style="padding:4px 0;color:#5a7fa0;vertical-align:top">Solicitations</td><td style="color:#fff;white-space:pre-wrap">${esc(solicitations)}</td></tr>
    </table>
    <div style="font-size:11px;color:#243a52;margin-top:24px">Source: public/access.html · ${new Date().toISOString()}</div>
  </div>`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "FARaudit Access <jose@faraudit.com>",
      to: "jose@faraudit.com",
      replyTo: email,
      subject,
      text,
      html
    });
    if (error) {
      console.error("[api/access] Resend returned error:", error);
      return NextResponse.json({ error: `Resend: ${error.message || "unknown"}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/access] send failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed." }, { status: 500 });
  }
}
