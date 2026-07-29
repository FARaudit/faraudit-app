import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegram } from "@/lib/telegram";
import { getAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// F-14: Telegram webhook authentication. Telegram echoes back the secret_token
// we register via setWebhook on every webhook request via the
// X-Telegram-Bot-Api-Secret-Token header. Fail-closed: if TELEGRAM_WEBHOOK_SECRET
// is unset or the header doesn't match, reject with 401. This eliminates the
// abuse vector documented in the prior comment (anyone POSTing /brief and
// burning Anthropic credits per request).
function isAuthorizedTelegramRequest(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

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
      model: "claude-sonnet-4-6",
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

// Telegram webhook receiver. Authenticated via X-Telegram-Bot-Api-Secret-Token
// header — see isAuthorizedTelegramRequest above. Telegram POSTs here from its
// own infra; no Supabase session to verify (can't use supabase.auth.getUser).
export async function POST(req: Request) {
  if (!isAuthorizedTelegramRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      const filed83b = new Date("2026-05-11T13:36:00-05:00");
      const daysSince83b = Math.floor((Date.now() - filed83b.getTime()) / 86400000);
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      reply = await askClaude(
        `APEX Holdings CEO morning brief for ${today}. Include: 83(b) FILED 2026-05-11 · ${daysSince83b} days since filing · awaiting IRS ack at Stable Dover DE, revenue bottleneck per company (FARaudit/Bullrize/LexAnchor all at $0), top 3 tasks today, one-line single focus. Under 200 words. Professional. No markdown.`,
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
      const filed = new Date("2026-05-11T13:36:00-05:00");
      const daysSince = Math.floor((Date.now() - filed.getTime()) / 86400000);
      reply = `83(b) Election Status\n\nDELIVERED 2026-05-11 · 1:36 PM CT\nIRS Austin TX 73301\nAll 3 entities · QSBS protected\n\nWatching: Stable Dover DE for IRS ack letter\n${daysSince} days since filing`;
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
      reply = `CEO Tasks Today\n\n[P1] Rachel Prevost — engage LinkedIn post\n[P1] Snoe Inc — send connection request 09:00 CT\n[P1] Newsletter #2 — publish 08:30 CT\n[P1] Webhook — register after build deploys\n[P1] /brief test — confirm bot working`;
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
      // PR #328/#326 rebuilt /audit on the live USER lane (source='user' +
      // pre-attributed audits row — the resident worker claims it). The old
      // dead-queue telegram_manual enqueue is gone; this command is live.
      reply = await triggerAuditReply(text.slice("/audit ".length).trim());
    } else {
      reply = `APEX CEO Bot\n\n/brief — morning digest\n/status — route health\n/tasks — today's tasks\n/prospects — pipeline\n/mrr — revenue vs target\n/83b — election status\n/learn fa|br|la — education\n/news — company news\n/done [item] — log it\n/build [note] — queue it\n\n— Vertex Intelligence —\n/signals — top 5 Bullrize signals\n/corpus — FARaudit corpus stats\n/pipeline — solicitations by stage\n/fleet — Railway agent status\n/audit [notice_id] — run an audit now`;
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
  // Pending-queue count dropped 2026-07-29: the pending_audits SAM queue is
  // retired (sam-ingest gone since 2026-05-30) — the count was frozen noise.
  const [audits, traps] = await Promise.all([
    sb.from("audits").select("*", { count: "exact", head: true }),
    sb.from("fa_intelligence_corpus").select("*", { count: "exact", head: true })
  ]);
  const total = audits.count || 0;
  return `FARaudit — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}\n\nAudits: ${total.toLocaleString()}\nTraps caught: ${traps.count || 0}`;
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
  // Agent status — confirmed only by reading each service's last output
  // footprint (audits rows come from the resident audit-worker + watcher, not
  // a cron).
  const sb = getAdminClient();
  let agentLine = "Railway agents: schema unavailable";
  if (sb) {
    // sam-ingest line dropped 2026-07-29: the service was deleted 2026-05-30
    // (Railway CLI-verified), so its "new solicitations" count was a
    // permanent 0.
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await sb.from("audits").select("*", { count: "exact", head: true }).gte("created_at", since24h);
    agentLine = `audits 24h: ${count || 0} new`;
  }
  return `Railway fleet — ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })} CT\n\n${results.join("\n")}\n\n${agentLine}`;
}

async function triggerAuditReply(noticeId: string): Promise<string> {
  if (!noticeId) return "Usage: /audit <notice_id>";
  // Corpus retirement (2026-07-29): the audit-ai cron this used to enqueue for
  // was deleted (5dc9b18), so "picked up next cron tick" could never happen.
  // Manual audits now ride the USER lane — the same path as the product's async
  // enqueue: a pre-attributed audits row (the resident worker hard-fails rows
  // without audit_id) plus a pending_audits row with source='user' that the
  // worker claims within its ~10s poll. The worker re-fetches SAM facts and the
  // full document set at run time, so this route stays metadata-light.
  const sb = getAdminClient();
  if (!sb) return "Manual audit · admin client unavailable.";
  if (!/^[a-f0-9]{32}$/i.test(noticeId)) {
    return `Manual audit · "${noticeId}" is not a SAM notice id (32 hex chars). Copy it from the SAM.gov notice URL or the /home feed.`;
  }
  // Attribution: Telegram has no Supabase session, but the audits row needs an
  // owner (RLS read on /audit/[id] + quota/cost land on this account). Honest
  // fail when unset — never fabricate ownership.
  const userId = process.env.TELEGRAM_AUDIT_USER_ID;
  if (!userId) {
    return "Manual audit · TELEGRAM_AUDIT_USER_ID is not set in Vercel env. Set it to the account UUID that should own Telegram-triggered audits (quota + report visibility land there).";
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://faraudit.com").replace(/\/+$/, "");
  // Dedupe: an in-flight user-lane run for this notice already yields a report —
  // don't double-spend. Completed/failed runs don't block a fresh re-audit.
  const { data: inflight } = await sb
    .from("pending_audits")
    .select("audit_id, status")
    .eq("notice_id", noticeId)
    .eq("source", "user")
    .in("status", ["pending", "processing"])
    .limit(1)
    .maybeSingle();
  if (inflight) {
    return `Manual audit · ${noticeId} already in flight (${inflight.status}). Report: ${base}/audit/${inflight.audit_id}`;
  }
  const { data: audit, error: auditErr } = await sb
    .from("audits")
    .insert({
      notice_id: noticeId,
      title: `Telegram manual audit · ${noticeId}`,
      user_id: userId,
      status: "processing"
    })
    .select("id")
    .single();
  if (auditErr || !audit) return `Manual audit · audits insert failed: ${auditErr?.message ?? "no row returned"}`;
  const { error } = await sb.from("pending_audits").insert({
    notice_id: noticeId,
    title: `Telegram manual audit · ${noticeId}`,
    source: "user",
    status: "pending",
    user_id: userId,
    audit_id: audit.id
  });
  if (error) {
    // Never leave an orphaned 'processing' audits row the worker can't see.
    await sb.from("audits").update({ status: "failed", error_message: `telegram enqueue failed: ${error.message}` }).eq("id", audit.id);
    return `Manual audit · queue failed: ${error.message}`;
  }
  return `Manual audit queued · ${noticeId}\n\nThe resident audit worker claims it within ~10s and fetches SAM facts + documents at run time. Report: ${base}/audit/${audit.id}`;
}

