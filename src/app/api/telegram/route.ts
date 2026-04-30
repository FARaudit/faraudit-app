import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n")
    .trim();
}

async function askClaude(prompt: string, maxTokens: number): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "Anthropic key not configured in Vercel env.";
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }]
    });
    const text = extractText(msg.content);
    return text || "Empty response from Claude.";
  } catch (err) {
    console.error("[telegram-route] Anthropic error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return `Claude error: ${detail.slice(0, 200)}`;
  }
}

export async function POST(req: Request) {
  let text = "";
  try {
    const body = await req.json();
    const message = body?.message;
    if (!message?.text) return NextResponse.json({ ok: true });
    text = String(message.text).toLowerCase().trim();
  } catch (err) {
    console.error("[telegram-route] body parse error:", err);
    return NextResponse.json({ ok: true });
  }

  let reply = "";
  try {
    if (text === "/brief" || text === "/start") {
      const days83b = Math.ceil((new Date("2026-05-27").getTime() - Date.now()) / 86400000);
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      reply = await askClaude(
        `APEX Holdings CEO morning brief for ${today}. Include: 83(b) deadline ${days83b} days away (May 27 2026 HARD), revenue bottleneck per company (FARaudit/Bullrize/LexAnchor all at $0), top 3 tasks today, one-line single focus. Under 200 words. Professional. No markdown.`,
        600
      );
    } else if (text === "/status") {
      const checks = await Promise.all(
        ["https://faraudit.com", "https://bullrize.com", "https://lexanchor.ai"].map(async (url) => {
          try {
            const r = await fetch(url, { method: "HEAD" });
            return `${url.replace("https://", "")} ${r.status === 200 ? "OK" : "FAIL " + r.status}`;
          } catch {
            return `${url.replace("https://", "")} timeout`;
          }
        })
      );
      reply = `APEX Route Status — ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago" })} CT\n\n${checks.join("\n")}`;
    } else if (text === "/83b") {
      const days = Math.ceil((new Date("2026-05-27").getTime() - Date.now()) / 86400000);
      reply = `83(b) Election Status\n\nFARaudit Inc -> ${days} days · May 27 2026 HARD DEADLINE\nBullrize Inc -> TBD (30d after EIN)\nLexAnchor Inc -> TBD (30d after EIN)\n\nEIN expected ~May 6-7 from Every.io\n\nUSPS Certified Mail + Return Receipt required`;
    } else if (text.startsWith("/learn")) {
      const co = text.includes("fa")
        ? "FARaudit — federal contracting, FAR/DFARS, solicitation lifecycle"
        : text.includes("br")
        ? "Bullrize — options flow, dark pool accumulation, financial intelligence"
        : "LexAnchor — contract law, P0/P1/P2 risk classification, clause negotiation";
      reply = await askClaude(
        `CEO Education AI. 3-minute lesson on ${co}. One specific concept. Plain language. Immediately actionable. Under 130 words. No markdown.`,
        350
      );
    } else if (text === "/news") {
      reply = await askClaude(
        `CEO news brief for APEX Holdings. FARaudit (federal contracting), Bullrize (financial/options), LexAnchor (legal/contract). One headline per company from today. Specific and factual. Format: [COMPANY]: [headline]. Under 100 words.`,
        400
      );
    } else if (text === "/prospects") {
      reply = `FARaudit Pipeline\n\nSnoe Inc · Score 9.2 · Connect today\nPMR Global Aerospace · Score 8.8\nSouthern Machine Works · Score 8.3\nAmerican Valmark (Rachel Prevost) · Score 7.8 · ACTIVE\n\nAll: $1,250/mo design partner -> $2,500/mo standard`;
    } else if (text === "/mrr") {
      reply = `Holdings MRR\n\nFARaudit $0 -> M12 target $225K\nBullrize $0 -> M12 target $750K\nLexAnchor $0 -> M12 target $224K\n\nCombined $0 -> M12 target $1.2M\n\nNext action: Book Rachel Prevost demo`;
    } else if (text === "/tasks") {
      reply = `CEO Tasks Today\n\n[P0] 83(b) — check jose@faraudit.com for EIN from Every.io\n[P1] Rachel Prevost — engage LinkedIn post\n[P1] Snoe Inc — send connection request 09:00 CT\n[P1] Newsletter #2 — publish 08:30 CT\n[P1] Webhook — register after build deploys\n[P1] /brief test — confirm bot working`;
    } else if (text.startsWith("/done ")) {
      reply = `Done: "${text.replace("/done ", "")}" — logged. Say "create handoff" in Claude to update Done tab.`;
    } else if (text.startsWith("/build ")) {
      reply = `Queued: "${text.replace("/build ", "")}" — paste in Claude Code or say "add to build" in Claude chat.`;
    } else {
      reply = `APEX CEO Bot\n\n/brief — morning digest\n/status — route health\n/tasks — today's tasks\n/prospects — pipeline\n/mrr — revenue vs target\n/83b — deadline countdown\n/learn fa|br|la — education\n/news — company news\n/done [item] — log it\n/build [note] — queue it`;
    }
  } catch (err) {
    console.error("[telegram-route] handler error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    reply = `Bot error: ${detail.slice(0, 300)}`;
  }

  const sent = await sendTelegram(reply || "(empty reply)");
  if (!sent) {
    console.error("[telegram-route] sendTelegram returned false for command:", text);
  }
  return NextResponse.json({ ok: true, sent, command: text });
}
