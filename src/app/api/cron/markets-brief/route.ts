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

  // Lazy-init clients only when authorized to avoid module-load failure when env missing.
  const anthropic = new Anthropic();
  const notion = process.env.NOTION_TOKEN ? new NotionClient({ auth: process.env.NOTION_TOKEN }) : null;
  const resend = new Resend(process.env.RESEND_API_KEY);

  // TODO: Phase C Day 2 — implement actual generation logic
  // 1. Fetch source data: SEC EDGAR + Unusual Whales + macro feeds (past 24h)
  // 2. Load Markets Brief system prompt from Notion page SYSTEM_PROMPTS_PAGE_ID
  // 3. Call Sonnet 4.6 to synthesize the 5-section brief
  // 4. Render via lib/email/templates/daily-brief.tsx (vertical='bullrize')
  // 5. Send via Resend to subscriber list
  // 6. Archive payload + cost + reactionToken to Notion INTELLIGENCE_ARCHIVE_DB_ID

  void anthropic; void notion; void resend;

  return NextResponse.json({
    status: "stub",
    cron: "markets-brief",
    schedule: "0 11 * * * (06:00 CT daily)",
    message: "Phase C Day 2 implementation pending",
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
