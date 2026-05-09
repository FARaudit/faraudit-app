import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Client as NotionClient } from "@notionhq/client";
import { Resend } from "resend";

export const maxDuration = 300;

const INTELLIGENCE_ARCHIVE_DB_ID = "59fad5dd8a99497ab164a913356818f7";
const SYSTEM_PROMPTS_PAGE_ID = "35bfaf5b931481ccbb26dd8b36fe69fc";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anthropic = new Anthropic();
  const notion = process.env.NOTION_TOKEN ? new NotionClient({ auth: process.env.NOTION_TOKEN }) : null;
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Phase C Day 3 — wire after NOTION_TOKEN is added to .env.local. Day 2 wired
  // education-drip only because its lesson fixture could be hardcoded; the daily
  // briefs depend on Notion-stored system prompts plus live source feeds.
  // TODO Day 3:
  // 1. Fetch SAM.gov daily delta + FPDS award updates + Federal Register defense rules (past 24h)
  // 2. Load Defense Brief system prompt from Notion SYSTEM_PROMPTS_PAGE_ID
  // 3. Call claude-sonnet-4-6 to synthesize the 5-section brief
  // 4. Render via lib/email/templates/daily-brief.tsx (vertical='faraudit')
  // 5. Send via Resend to FARaudit subscriber list (verified domain required — see Day 2 finding)
  // 6. Insert agent_run_log row (mirror education-drip route pattern)
  // 7. Archive to Notion INTELLIGENCE_ARCHIVE_DB_ID

  void anthropic; void notion; void resend;

  return NextResponse.json({
    status: "stub",
    cron: "defense-brief",
    schedule: "30 11 * * * (06:30 CT daily)",
    message: "Phase C Day 3 implementation pending — needs NOTION_TOKEN + verified Resend domain",
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
