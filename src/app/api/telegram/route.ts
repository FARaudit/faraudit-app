import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegram } from "@/lib/telegram";
import { getAdminClient } from "@/lib/supabase-admin";

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
    } else if (text === "/signals") {
      reply = await topSignalsReply();
    } else if (text === "/corpus") {
      reply = await corpusReply();
    } else if (text === "/pipeline") {
      reply = await pipelineReply();
    } else if (text === "/fleet") {
      reply = await fleetReply();
    } else if (text.startsWith("/audit ")) {
      reply = await triggerAuditReply(text.slice("/audit ".length).trim());
    } else {
      reply = `APEX CEO Bot\n\n/brief — morning digest\n/status — route health\n/tasks — today's tasks\n/prospects — pipeline\n/mrr — revenue vs target\n/83b — deadline countdown\n/learn fa|br|la — education\n/news — company news\n/done [item] — log it\n/build [note] — queue it\n\n— Vertex Intelligence —\n/signals — top 5 Bullrize signals\n/corpus — FARaudit corpus stats\n/pipeline — solicitations by stage\n/fleet — Railway agent status\n/audit [notice_id] — manual audit trigger`;
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

// ─── Vertex Intelligence command helpers ───────────────────────

async function topSignalsReply(): Promise<string> {
  // Bullrize signal_corpus lives in a separate Supabase project.
  // We call the Bullrize signals endpoint over HTTPS — public-readable
  // via Bullrize's own cron output. Fall back to "no signals" gracefully.
  try {
    const url = process.env.BULLRIZE_SIGNALS_URL || "https://bullrize.com/api/signals/top";
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return `Bullrize signals · service ${res.status}. Check bullrize.com/api/signals/top.`;
    const data = await res.json() as { signals?: Array<{ ticker: string; conviction_score: number; factor_count: number; signal_type: string }> };
    const signals = data.signals || [];
    if (signals.length === 0) return "Bullrize signals · no high-conviction signals today.";
    const lines = signals.slice(0, 5).map((s, i) =>
      `${i + 1}. ${s.ticker} · conviction ${s.conviction_score} · ${s.factor_count}/4 factors · ${s.signal_type}`
    );
    return `Top Bullrize signals — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}\n\n${lines.join("\n")}`;
  } catch (err) {
    return `Bullrize signals · ${err instanceof Error ? err.message : "unreachable"}`;
  }
}

async function corpusReply(): Promise<string> {
  const sb = getAdminClient();
  if (!sb) return "Corpus · admin client unavailable.";
  const [audits, traps, pending] = await Promise.all([
    sb.from("audits").select("*", { count: "exact", head: true }),
    sb.from("fa_intelligence_corpus").select("*", { count: "exact", head: true }),
    sb.from("pending_audits").select("*", { count: "exact", head: true }).eq("status", "pending")
  ]);
  const total = audits.count || 0;
  const targetPct = Math.min(100, (total / 10_000) * 100).toFixed(1);
  return `FARaudit corpus — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}\n\nAudits: ${total.toLocaleString()}\nTraps caught: ${traps.count || 0}\nPending queue: ${pending.count || 0}\nProgress to 10K: ${targetPct}%`;
}

async function pipelineReply(): Promise<string> {
  const sb = getAdminClient();
  if (!sb) return "Pipeline · admin client unavailable.";
  const [tracking, bidding, submitted, won, lost] = await Promise.all([
    sb.from("audits").select("*", { count: "exact", head: true }).is("outcome", null).is("bid_submitted", false),
    sb.from("audits").select("*", { count: "exact", head: true }).is("outcome", null).eq("bid_submitted", false).in("recommendation", ["PROCEED", "PROCEED_WITH_CAUTION"]),
    sb.from("audits").select("*", { count: "exact", head: true }).eq("bid_submitted", true).is("outcome", null),
    sb.from("audits").select("*", { count: "exact", head: true }).eq("outcome", "won"),
    sb.from("audits").select("*", { count: "exact", head: true }).eq("outcome", "lost")
  ]);
  return `FARaudit pipeline — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}\n\nTracking: ${tracking.count || 0}\nBidding: ${bidding.count || 0}\nSubmitted: ${submitted.count || 0}\nAwarded (won): ${won.count || 0}\nLost: ${lost.count || 0}`;
}

async function fleetReply(): Promise<string> {
  // Railway doesn't expose a public health-check API key-free, so this is a
  // best-effort domain probe across our 4 deployed services.
  const services = [
    { name: "FARaudit web (Vercel)",  url: "https://faraudit.com/" },
    { name: "Bullrize web (Vercel)",  url: "https://bullrize.com/" },
    { name: "LexAnchor web (Vercel)", url: "https://lexanchor.ai/" }
  ];
  const results = await Promise.all(services.map(async (s) => {
    try {
      const res = await fetch(s.url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      return `${s.name} · ${res.status}`;
    } catch {
      return `${s.name} · unreachable`;
    }
  }));
  // Railway agent status — we can only confirm "scheduled" by reading their last cron-output footprint.
  const sb = getAdminClient();
  let agentLine = "Railway crons: schema unavailable";
  if (sb) {
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [recentAudits, recentPending] = await Promise.all([
      sb.from("audits").select("*", { count: "exact", head: true }).gte("created_at", since24h),
      sb.from("pending_audits").select("*", { count: "exact", head: true }).gte("created_at", since24h).eq("source", "sam_live")
    ]);
    agentLine = `audit-ai 24h: ${recentAudits.count || 0} new audits\nsam-ingest 24h: ${recentPending.count || 0} new solicitations`;
  }
  return `Railway fleet — ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })} CT\n\n${results.join("\n")}\n\n${agentLine}`;
}

async function triggerAuditReply(noticeId: string): Promise<string> {
  if (!noticeId) return "Usage: /audit <notice_id>";
  // Insert into pending_audits with manual source so audit-ai picks it up next cron tick.
  const sb = getAdminClient();
  if (!sb) return "Manual audit · admin client unavailable.";
  // Skip if already queued.
  const { data: existing } = await sb.from("pending_audits").select("id, status").eq("notice_id", noticeId).maybeSingle();
  if (existing) {
    return `Manual audit · ${noticeId} already queued (status: ${existing.status}). audit-ai will pick it up next cron tick (06:30 CDT).`;
  }
  const { error } = await sb.from("pending_audits").insert({
    notice_id: noticeId,
    title: `Telegram-triggered manual audit · ${noticeId}`,
    source: "telegram_manual",
    status: "pending",
    notice_type: "solicitation"
  });
  if (error) return `Manual audit · queue failed: ${error.message}`;
  return `Manual audit queued · ${noticeId}\n\naudit-ai will run at next 06:30 CDT cron tick. Result will appear in /audit/[id] once complete.`;
}

