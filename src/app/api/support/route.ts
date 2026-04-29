import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; reset: number }>();

function rateLimit(key: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now > b.reset) {
    rateBuckets.set(key, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (b.count >= RATE_LIMIT_MAX) return { ok: false, remaining: 0 };
  b.count += 1;
  return { ok: true, remaining: RATE_LIMIT_MAX - b.count };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

const SYSTEM_PROMPT = `You are FARaudit Support — the embedded help agent for FARaudit, a federal-contracting compliance product run by Woof Management LLC.

PRODUCT CONTEXT:
- FARaudit reads federal solicitations (RFQ/RFP/IFB) and surfaces FAR/DFARS compliance traps before bid submission.
- Six DFARS detections: 252.223-7008 (hex chrome), 252.204-7012 / 7018 (covered defense info), 252.204-7021 (CMMC), 252.225-7048 (export), CLIN ambiguity, Section L/M page-limit conflicts.
- Three plans: Design Partner $1,250/mo (12-mo, 7 spots), Standard $1,500/mo (most popular), Growth $2,500/mo. First audit free.
- Workflows: Upload at /audit → audit report → KO clarification email drafts → proposal strategy.
- Education at /learn. Pricing at /pricing.

ANSWER STYLE:
- Direct, terse, expert. Federal-contracting professionals don't need hand-holding.
- If you don't know something, say so and point to jose@faraudit.com.
- Never invent FAR/DFARS clause numbers or quote text you don't have.
- Never give legal advice. Surface what the clause says; tell users to confirm with their KO or counsel.
- Cap responses at ~120 words unless the user explicitly asks for more depth.

OUT OF SCOPE:
- Specific bid strategy for a named opportunity (refer to Growth tier).
- Past performance of named contractors (refer to SAM.gov / FPDS).
- Pricing competitor solicitations (we don't publish or store other companies' bids).`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const rate = rateLimit(clientKey(req));
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Support is offline." }, { status: 503 });
  }

  let body: { messages?: Msg[]; question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const messages: Msg[] = Array.isArray(body.messages)
    ? body.messages
    : body.question
    ? [{ role: "user", content: body.question }]
    : [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages." }, { status: 400 });
  }

  const trimmed = messages.slice(-12).map((m) => ({
    role: m.role,
    content: String(m.content || "").slice(0, 4000)
  }));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: trimmed
    });

    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n")
      .trim();

    return NextResponse.json({ reply: text || "I'm not sure — email jose@faraudit.com." });
  } catch (err) {
    console.error("[support]", err);
    return NextResponse.json({ error: "Support failed." }, { status: 500 });
  }
}
