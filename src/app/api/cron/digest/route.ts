import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CEO morning brief — runs at 12:00 UTC (07:00 CT) Mon–Fri
// Wired in vercel.json: { "path": "/api/cron/digest", "schedule": "0 12 * * 1-5" }

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Anthropic key missing." }, { status: 503 });
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const shortDate = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are the Lead Engineer AI for APEX Holdings. Generate a concise CEO morning brief for ${today}. Include:
1. One 83(b) election reminder (FARaudit due May 27 2026)
2. Three priority tasks for today (Rachel Prevost follow-up, Bullrize /pricing fix, LinkedIn newsletter)
3. One motivational line
Keep it under 150 words. Professional tone.`
      }
    ]
  });

  const brief = msg.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n")
    .trim();

  if (process.env.RESEND_API_KEY && process.env.CEO_EMAIL) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Jose Rodriguez <jose@faraudit.com>",
        to: process.env.CEO_EMAIL,
        subject: `CEO Morning Brief · ${shortDate}`,
        html: `<div style="font-family: monospace; background: #0A1628; color: #c8dff2; padding: 24px; max-width: 580px; border-radius: 8px;">
          <div style="font-size: 10px; color: #4a6a96; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 8px;">APEX Holdings · CEO Executive Digest</div>
          <div style="font-size: 18px; font-weight: 500; color: #e2e8f2; margin-bottom: 16px;">Morning Brief</div>
          <div style="font-size: 13px; color: #c8dff2; line-height: 1.75; white-space: pre-wrap;">${brief}</div>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #1e3a5f; font-size: 10px; color: #2d4a6e;">
            FARaudit · Bullrize · LexAnchor · claude-sonnet-4-20250514
          </div>
        </div>`,
        text: brief
      });
    } catch (err) {
      console.error("[digest-cron]", err);
    }
  }

  return NextResponse.json({ ok: true, day: today });
}
