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

  // TODO: Phase C Day 2 — implement actual generation logic
  // 1. Compute current Week N (program_started_at vs Sunday)
  // 2. Resolve API target + Feature target for Week N from API Tracker + Phase Plan
  // 3. Load Sunday Deep-Dive system prompt from Notion SYSTEM_PROMPTS_PAGE_ID
  // 4. Call Sonnet 4.6 to synthesize Part 1 / Part 2 / Part 3 + competitive table + CEO decision prompt
  // 5. Render via lib/email/templates/sunday-deepdive.tsx
  // 6. Send via Resend
  // 7. Archive to Notion INTELLIGENCE_ARCHIVE_DB_ID

  void anthropic; void notion; void resend;

  return NextResponse.json({
    status: "stub",
    cron: "sunday-deepdive",
    schedule: "0 11 * * 0 (Sunday 06:00 CT)",
    message: "Phase C Day 2 implementation pending",
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
