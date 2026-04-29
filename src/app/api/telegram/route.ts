import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body?.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const text = String(message.text).toLowerCase().trim();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let reply = "";

    if (text === "/brief" || text === "/start") {
      const days83b = Math.ceil((new Date("2026-05-27").getTime() - Date.now()) / 86400000);
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      const msg = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `APEX Holdings CEO morning brief for ${today}. Include: 83(b) deadline ${days83b} days away (May 27 2026 HARD), revenue bottleneck per company (FARaudit/Bullrize/LexAnchor all at $0), top 3 tasks today, one-line single focus. Under 200 words. Professional. No markdown.`
          }
        ]
      });
      reply = msg.content.find((c) => c.type === "text") ? (msg.content[0] as { text: string }).text : "Brief unavailable";
    } else if (text === "/status") {
      const checks = await Promise.all(
        ["https://faraudit.com", "https://bullrize.com", "https://lexanchor.ai"].map(async (url) => {
          try {
            const r = await fetch(url, { method: "HEAD" });
            return `${url.replace("https://", "")} ${r.status === 200 ? "✅" : "❌ " + r.status}`;
          } catch {
            return `${url.replace("https://", "")} ❌ timeout`;
          }
        })
      );
      reply = `APEX Route Status — ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago" })} CT\n\n${checks.join("\n")}`;
    } else if (text === "/83b") {
      const days = Math.ceil((new Date("2026-05-27").getTime() - Date.now()) / 86400000);
      reply = `83(b) Election Status\n\nFARaudit Inc → ${days} days · May 27 2026 HARD DEADLINE\nBullrize Inc → TBD (30d after EIN)\nLexAnchor Inc → TBD (30d after EIN)\n\nEIN expected ~May 6-7 from Every.io\n\nUSPS Certified Mail + Return Receipt required`;
    } else if (text.startsWith("/learn")) {
      const co = text.includes("fa")
        ? "FARaudit — federal contracting, FAR/DFARS, solicitation lifecycle"
        : text.includes("br")
        ? "Bullrize — options flow, dark pool accumulation, financial intelligence"
        : "LexAnchor — contract law, P0/P1/P2 risk classification, clause negotiation";
      const msg = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 350,
        messages: [
          {
            role: "user",
            content: `CEO Education AI. 3-minute lesson on ${co}. One specific concept. Plain language. Immediately actionable. Under 130 words. No markdown.`
          }
        ]
      });
      reply = msg.content.find((c) => c.type === "text") ? (msg.content[0] as { text: string }).text : "Lesson unavailable";
    } else if (text === "/news") {
      const msg = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `CEO news brief for APEX Holdings. FARaudit (federal contracting), Bullrize (financial/options), LexAnchor (legal/contract). One headline per company from today. Specific and factual. Format: [COMPANY]: [headline]. Under 100 words.`
          }
        ]
      });
      reply = msg.content.find((c) => c.type === "text") ? (msg.content[0] as { text: string }).text : "News unavailable";
    } else if (text === "/prospects") {
      reply = `FARaudit Pipeline\n\nSnoe Inc · Score 9.2 · Connect today\nPMR Global Aerospace · Score 8.8\nSouthern Machine Works · Score 8.3\nAmerican Valmark (Rachel Prevost) · Score 7.8 · ACTIVE\n\nAll: $1,250/mo design partner → $2,500/mo standard`;
    } else if (text === "/mrr") {
      reply = `Holdings MRR\n\nFARaudit $0 → M12 target $225K\nBullrize $0 → M12 target $750K\nLexAnchor $0 → M12 target $224K\n\nCombined $0 → M12 target $1.2M\n\nNext action: Book Rachel Prevost demo`;
    } else if (text === "/tasks") {
      reply = `CEO Tasks Today\n\n🔴 83(b) — check jose@faraudit.com for EIN from Every.io\n🟡 Rachel Prevost — engage LinkedIn post\n🟡 Snoe Inc — send connection request 09:00 CT\n🟡 Newsletter #2 — publish 08:30 CT\n🟡 Webhook — register after build deploys\n🟡 /brief test — confirm bot working`;
    } else if (text.startsWith("/done ")) {
      reply = `✅ Done: "${text.replace("/done ", "")}" — logged. Say "create handoff" in Claude to update Done tab.`;
    } else if (text.startsWith("/build ")) {
      reply = `🔨 Queued: "${text.replace("/build ", "")}" — paste in Claude Code or say "add to build" in Claude chat.`;
    } else {
      reply = `APEX CEO Bot\n\n/brief — morning digest\n/status — route health\n/tasks — today's tasks\n/prospects — pipeline\n/mrr — revenue vs target\n/83b — deadline countdown\n/learn fa|br|la — education\n/news — company news\n/done [item] — log it\n/build [note] — queue it`;
    }

    await sendTelegram(reply);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram-route]", err);
    return NextResponse.json({ ok: true });
  }
}
