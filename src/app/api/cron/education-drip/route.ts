import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getAdminClient } from "@/lib/supabase-admin";
import EducationDrip, { type EducationDripProps } from "@/lib/email/templates/education-drip";

export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";
const PRICE_INPUT_PER_M = 3;
const PRICE_OUTPUT_PER_M = 15;
const AGENT_NAME = "education-ai";
const RECIPIENT = "jose@faraudit.com";

// Phase C Day 2 — Day 1 lesson lifted inline from scripts/test-send-day1-lesson.ts.
// Day 3 will replace this with a Notion query keyed off subscriber's start date.
const INLINE_DAY1: EducationDripProps = {
  dayNumber: 1,
  totalDays: 90,
  moduleName: "SF1449 Anatomy",
  vertical: "faraudit",
  title: "What is SF1449? Why every federal contractor must read it fluently",
  concept:
    "SF1449 is the Solicitation/Contract/Order for Commercial Items — the 17-block cover sheet the federal government wraps around almost every FAR Part 12 commercial-item acquisition. It is not the contract; it is the index. Blocks 1–8 identify the buying activity, solicitation number, response date, and small-business set-aside status. Blocks 9–14 carry the line items, NAICS code, and contract type. Blocks 15–17 carry pricing, payment terms, and the CO signature that converts a solicitation into a contract. If you cannot read SF1449 cold, you cannot price, qualify, or protest the work — every downstream decision (teaming, bid/no-bid, KO email, capability statement match) depends on facts that only this form makes legible.",
  realExample:
    "Solicitation FA251726Q0024 (Air Force, posted 2026-04-22) opens with an SF1449. Block 4 says solicitation #, Block 7 sets the offer due date (10:00 CT, 2026-05-15), Block 10 lists NAICS 541330 with $25.5M small-business size standard, Block 12 marks 'Commercial Items — FAR 12.6 Streamlined Procedures.' That single page tells you: small-business set-aside, engineering services, you have ~3 weeks, and the streamlined procedures path means proposals are evaluated on price + technical narrative, not full FAR Part 15 source selection. Reading those four blocks correctly is what separates a 5-minute go/no-go from a 5-day analysis.",
  practice:
    "On the SF1449 above, Block 10 lists NAICS 541330 and a $25.5M size standard. The bidder you're considering teaming with reported $32M revenue last fiscal year. Are they eligible to bid as the prime on this solicitation? What is the single block on the SF1449 you would cite to defend your answer in a size protest?",
  answer:
    "No — they are over the size standard for NAICS 541330 ($25.5M average annual receipts, 3-year lookback per 13 CFR §121.104). They cannot prime a small-business set-aside with $32M revenue. Cite Block 10 (NAICS code + size standard) plus Block 9 (set-aside designation). In a size protest the SBA Area Office will pull the SF1449 first to confirm the set-aside type and NAICS, then audit the offeror's three-year average receipts against the size standard. If your teaming partner is the prime, the entire bid is defective on its face — you would need to flip roles (you prime, they sub) or no-bid.",
  citation: {
    url: "https://www.acquisition.gov/far/53.212",
    label: "FAR 53.212 — Forms (SF1449 prescribed for commercial item acquisitions)",
  },
  tomorrowDay: 2,
  tomorrowTitle: "Block 9: How to identify and target your CO",
  cost: 0,
  reactionToken: "",
  emailId: "",
};

// Education Drip system prompt — Phase C Day 2 inline (Notion sync deferred to Day 3).
// Voice: CIA President's Daily Brief — short paragraphs, no hedging, no marketing speak.
// Hard stops: ≤700 words concept, ≤500 words real_example, no second citations introduced,
// preserve every fact already grounded in the user-provided text.
const EDUCATION_DRIP_SYSTEM_PROMPT = `You are the Education AI for FARaudit Academy. You polish two sections of a daily federal-contracting lesson before it is sent to a paying subscriber.

VOICE — CIA President's Daily Brief:
- Short declarative sentences. No hedging ("might", "could possibly", "in some cases").
- No marketing speak ("game-changing", "leverage", "unlock", "robust").
- No second-person ("you should") in Concept or Real Example — those sections explain, they do not coach. The Practice and Answer sections (which you do NOT touch) handle coaching.
- Plain English over jargon. When jargon is unavoidable (FAR clause numbers, CFR citations, NAICS codes), state the citation once and move on.

HARD STOPS:
- Concept: ≤700 words.
- Real Example: ≤500 words.
- Do not introduce any new citations beyond what is already in the input. The lesson has exactly ONE authoritative citation, supplied separately, and your output must not reference any other source.
- Do not invent solicitation numbers, agency names, dollar figures, NAICS codes, or dates. If the input is silent on a fact, your output must be silent on it too.
- Do not add closing CTAs ("now go check your portfolio", "ready to apply this?"). The email template handles CTAs via the button bar.
- Do not echo the section headings ("Concept:", "Real Example:") in your output text. The template renders headings.

WHAT YOU DO:
- Tighten prose. Cut filler. Promote the strongest sentence to the top of each section.
- Preserve every concrete fact (block numbers, FAR citations, NAICS codes, dollar amounts, dates) verbatim from the input.
- If the input has a contradiction or factual error, leave it — flag it via a single short comment in the JSON "reviewer_note" field. Do not silently rewrite facts.

OUTPUT FORMAT — return ONE JSON object only, no prose, no code fences:
{
  "concept_polished": "<tightened Concept text>",
  "real_example_polished": "<tightened Real Example text>",
  "reviewer_note": "<empty string OR a one-sentence flag if you saw something off>"
}`;

const SCHEMA_REMINDER = `Return ONLY a JSON object with keys "concept_polished", "real_example_polished", "reviewer_note". No code fences, no prose, no commentary.`;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

function extractJson(text: string): { concept_polished: string; real_example_polished: string; reviewer_note: string } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY || !process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY or RESEND_API_KEY" },
      { status: 500 }
    );
  }

  const sb = getAdminClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase admin client unavailable (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    );
  }

  // Promote education-ai to live in agent_fleet_status (idempotent — first-run write,
  // subsequent runs are no-op heartbeat). Required so agent_run_log FK passes.
  await sb.from("agent_fleet_status").upsert(
    {
      agent_name: AGENT_NAME,
      status: "live",
      vertical: "faraudit",
      expected_cadence_seconds: 86400,
      last_tick_at: new Date().toISOString(),
      cost_per_day_usd: 0.05,
      skills_present: ["sonnet_polish", "react_email_render", "resend_send", "agent_run_log_write"],
      skills_missing: ["notion_lesson_fetch", "subscriber_day_n_lookup", "reaction_token_persist"],
      notes: "Phase C Day 2 — live with hardcoded Day 1 SF1449 fixture; Notion sync deferred to Day 3",
    },
    { onConflict: "agent_name" }
  );

  const runStartedAt = new Date().toISOString();
  const { data: runRow, error: runInsertErr } = await sb
    .from("agent_run_log")
    .insert({
      agent_name: AGENT_NAME,
      run_started_at: runStartedAt,
      status: "partial",
      model_used: MODEL,
      metadata: { day: INLINE_DAY1.dayNumber, vertical: INLINE_DAY1.vertical, recipient: RECIPIENT },
    })
    .select("id")
    .single();

  if (runInsertErr || !runRow) {
    return NextResponse.json(
      { error: "Failed to insert agent_run_log row", detail: runInsertErr?.message },
      { status: 500 }
    );
  }
  const runId: string = runRow.id;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = `Polish the two sections below.

=== CONCEPT (raw) ===
${INLINE_DAY1.concept}

=== REAL EXAMPLE (raw) ===
${INLINE_DAY1.realExample}

=== ALREADY-APPROVED CITATION (do not introduce others) ===
${INLINE_DAY1.citation.label} — ${INLINE_DAY1.citation.url}

${SCHEMA_REMINDER}`;

  let conceptPolished = INLINE_DAY1.concept;
  let realExamplePolished = INLINE_DAY1.realExample;
  let reviewerNote = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: EDUCATION_DRIP_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    inputTokens = resp.usage?.input_tokens ?? 0;
    outputTokens = resp.usage?.output_tokens ?? 0;
    const text = resp.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n")
      .trim();
    const parsed = extractJson(text);
    conceptPolished = parsed.concept_polished?.trim() || INLINE_DAY1.concept;
    realExamplePolished = parsed.real_example_polished?.trim() || INLINE_DAY1.realExample;
    reviewerNote = parsed.reviewer_note?.trim() || "";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await sb
      .from("agent_run_log")
      .update({
        run_completed_at: new Date().toISOString(),
        status: "failure",
        error_message: errMsg.slice(0, 500),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      })
      .eq("id", runId);
    return NextResponse.json(
      { error: "Sonnet polish call failed", detail: errMsg, agent_run_log_id: runId },
      { status: 502 }
    );
  }

  const costUsd = (inputTokens / 1_000_000) * PRICE_INPUT_PER_M + (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;

  const reactionToken = `prod-test-day1-${Date.now()}`;
  const emailId = `prod-test-day1-${Date.now()}`;
  const props: EducationDripProps = {
    ...INLINE_DAY1,
    concept: conceptPolished,
    realExample: realExamplePolished,
    cost: costUsd,
    reactionToken,
    emailId,
  };

  const html = await render(EducationDrip(props));
  const subject = `[PROD-TEST Day 2] Day ${props.dayNumber}: ${props.title}`;
  const fromAddr = process.env.RESEND_FROM_EMAIL || "FARaudit Academy <academy@faraudit.com>";

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sendRes = await resend.emails.send({
    from: fromAddr,
    to: RECIPIENT,
    subject,
    html,
  });

  if (sendRes.error) {
    await sb
      .from("agent_run_log")
      .update({
        run_completed_at: new Date().toISOString(),
        status: "failure",
        error_message: `Resend: ${sendRes.error.message ?? "unknown"}`.slice(0, 500),
        cost_usd: costUsd,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        metadata: { day: props.dayNumber, vertical: props.vertical, recipient: RECIPIENT, reviewer_note: reviewerNote },
      })
      .eq("id", runId);
    return NextResponse.json(
      { error: "Resend send failed", detail: sendRes.error.message, agent_run_log_id: runId },
      { status: 502 }
    );
  }

  const resendId = sendRes.data?.id ?? null;
  await sb
    .from("agent_run_log")
    .update({
      run_completed_at: new Date().toISOString(),
      status: "success",
      cost_usd: costUsd,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      metadata: {
        day: props.dayNumber,
        vertical: props.vertical,
        recipient: RECIPIENT,
        resend_id: resendId,
        subject,
        reviewer_note: reviewerNote,
      },
    })
    .eq("id", runId);

  return NextResponse.json({
    status: "sent",
    cron: "education-drip",
    agent: AGENT_NAME,
    model_used: MODEL,
    recipient: RECIPIENT,
    subject,
    resend_id: resendId,
    cost_usd: Number(costUsd.toFixed(6)),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    agent_run_log_id: runId,
    reviewer_note: reviewerNote,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
