import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDU_MAP: Record<number, string> = {
  1: "federal contracting — FAR/DFARS, CLIN structure, or solicitation lifecycle (FARaudit)",
  2: "options flow analysis, dark pool accumulation, or financial intelligence signals (Bullrize)",
  3: "contract law, P0/P1/P2 risk classification, or negotiation tactics (LexAnchor)",
  4: "Holdings-level strategy, competitive positioning, or revenue growth levers",
  5: "AI competitive landscape, model optimization, or future-proofing against AI commoditization",
  6: "week in review — key wins, lessons, and what to carry into next week across all 3 companies",
  0: "week ahead — strategic priorities, market outlook, and key decisions for the coming week"
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Anthropic key missing." }, { status: 503 });
  }

  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const isFriday = day === 5;
  const isSaturday = day === 6;
  const days83b = Math.ceil((new Date("2026-05-27").getTime() - Date.now()) / 86400000);
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const shortDate = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const briefPrompt = isWeekend
    ? isSaturday
      ? `APEX Holdings Saturday CEO brief for ${dateStr}. Week in review: key wins, what moved in federal contracting/options market/legal tech this week, one competitive intelligence update, earnings week ahead if any. Mag 7 CEO level. Under 200 words. No markdown.`
      : `APEX Holdings Sunday CEO brief for ${dateStr}. Week ahead: what to prioritize Mon-Fri, SAM.gov opportunities expected, market events this week, one strategic CEO priority. Mag 7 CEO level. Under 200 words. No markdown.`
    : `APEX Holdings CEO brief for ${dateStr}. 83(b) deadline: ${days83b} days (May 27 2026 HARD). Revenue bottleneck per company. Top 3 priorities. Single focus for today. Under 180 words. Professional. No markdown.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const brief = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 500,
      messages: [{ role: "user", content: briefPrompt }]
    });
    const briefText = brief.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n")
      .trim();

    const edu = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `CEO Education AI. 3-minute lesson on ${EDU_MAP[day]}. One specific concept. Plain language. Immediately useful for today's work. Under 120 words. No markdown.`
        }
      ]
    });
    const eduText = edu.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n")
      .trim();

    const icon = isWeekend ? (isSaturday ? "📅" : "🌅") : "🌅";
    const label = isWeekend ? (isSaturday ? "Saturday Review" : "Sunday Outlook") : "Morning Brief";
    const tgMsg = `${icon} APEX ${label} — ${shortDate}\n\n${briefText}\n\n───────────────\n📚 Today's lesson\n\n${eduText}\n\n───────────────\n/status /tasks /prospects /mrr /83b /news /learn`;

    await sendTelegram(tgMsg);

    if (process.env.RESEND_API_KEY && process.env.CEO_EMAIL) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Jose Rodriguez <jose@faraudit.com>",
          to: process.env.CEO_EMAIL,
          subject: `APEX ${label} · ${shortDate}`,
          html: `<div style="font-family:monospace;background:#0A1628;color:#c8dff2;padding:24px;max-width:580px;border-radius:8px">
            <div style="font-size:10px;color:#4a6a96;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px">APEX Holdings · ${label}</div>
            <div style="white-space:pre-wrap;font-size:13px;line-height:1.75">${briefText}</div>
            <hr style="border-color:#1e3a5f;margin:16px 0">
            <div style="font-size:10px;color:#4a6a96;margin-bottom:8px">TODAY'S LESSON</div>
            <div style="white-space:pre-wrap;font-size:13px;line-height:1.75">${eduText}</div>
          </div>`,
          text: `${briefText}\n\n---\n${eduText}`
        });
      } catch (err) {
        console.error("[digest-email]", err);
      }
    }

    if (isFriday) {
      await sendTelegram(
        `📊 Friday Weekly Check\n\nAm I closer to first paying customer than last Friday?\n\n• Memory rules reconciled ✓\n• Route health verified ✓\n• Security protocol checked ✓\n• Pipeline delta reviewed ✓\n• Model currency checked ✓\n\nSay "create handoff" in Claude for full Friday brief.`
      );
    }

    return NextResponse.json({ ok: true, day, briefLength: briefText.length });
  } catch (err) {
    console.error("[digest-cron]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
