import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_ROTATION = ["linkedin_post", "prospect_followup", "linkedin_post", "newsletter_section", "week_review"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FARAUDIT_CONTEXT = `You are Marketing AI for FARaudit — Federal Contract Intelligence.
FARaudit reads federal solicitations (FAR/DFARS compliance, CLIN structure, Section L/M) and flags compliance traps before defense subcontractors bid.
NEVER use AI-powered, AI-based, or SaaS language.
The product category is: Federal Contract Intelligence.
Target audience: mid-market defense subcontractors who bid federal without a dedicated capture team.
Voice: professional, analytical, data-driven. Educational, never promotional.
Every piece of content provides one specific piece of value.
Founder is Jose Rodriguez — 10+ years at Lockheed Martin and Sikorsky.`;

const PROMPTS: Record<string, string> = {
  linkedin_post:
    "Write a LinkedIn post for FARaudit. Topic: one specific federal contracting insight that defense subcontractors miss. 150-200 words. End with a CTA asking readers to send a solicitation number for a free audit. Include 4-5 relevant hashtags at the end. No promotional language. Pure education.",
  prospect_followup:
    "Draft a LinkedIn follow-up message for a defense manufacturing prospect who accepted a connection request but hasn't replied to the initial FARaudit introduction message. 3-4 sentences. Reference a specific federal contracting pain point. End with a soft ask for a free audit. Personalize with placeholder [First Name] and [Company].",
  newsletter_section:
    "Write a 200-word section for the FARaudit newsletter. Topic: one FAR or DFARS clause that defense subcontractors frequently misread and what the actual compliance requirement is. Include the clause number. End with what FARaudit does about it.",
  week_review:
    "Write a short LinkedIn week-in-review post for FARaudit. 3-4 sentences summarizing what was interesting in federal defense contracting this week (use general themes, not specific events). Invite engagement. Include hashtags."
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Anthropic key missing." }, { status: 503 });
  }

  const dayIndex = new Date().getDay();
  const contentType = CONTENT_ROTATION[dayIndex % CONTENT_ROTATION.length];
  const dayName = DAY_NAMES[dayIndex];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 600,
    system: FARAUDIT_CONTEXT,
    messages: [{ role: "user", content: PROMPTS[contentType] || PROMPTS.linkedin_post }]
  });

  const content = msg.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n")
    .trim();

  if (process.env.RESEND_API_KEY && process.env.CEO_EMAIL) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "FARaudit Marketing AI <marketing@faraudit.com>",
        to: process.env.CEO_EMAIL,
        subject: `Marketing AI · ${dayName} · ${contentType.replace(/_/g, " ")} ready`,
        html: `<div style="font-family:monospace;background:#03080f;color:#c8dff2;padding:24px;max-width:600px">
          <p style="color:#c4a44a;font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px">FARaudit Marketing AI · ${dayName}</p>
          <p style="font-size:13px;color:#5a7fa0;margin-bottom:16px">Content type: ${contentType.replace(/_/g, " ")}</p>
          <div style="background:#06101a;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:16px;margin-bottom:14px;white-space:pre-wrap;font-size:13px;color:#e8ecf2;line-height:1.6">${content}</div>
          <p style="font-size:11px;color:#243a52">Copy the content above · Open LinkedIn · Paste · Post · 08:30–10:30 CT window</p>
        </div>`
      });
    } catch (err) {
      console.error("[marketing-cron]", err);
    }
  }

  return NextResponse.json({ ok: true, contentType, day: dayName });
}
