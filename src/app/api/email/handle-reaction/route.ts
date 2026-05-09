import { NextRequest, NextResponse } from "next/server";

const VALID_REACTIONS = new Set(["useful", "skip", "deeper"]);

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const reaction = req.nextUrl.searchParams.get("reaction");
  const emailId = req.nextUrl.searchParams.get("email_id");

  if (!token || !reaction || !emailId || !VALID_REACTIONS.has(reaction)) {
    return new NextResponse("<html><body><h1>Bad request</h1></body></html>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // TODO Phase C Day 4:
  // - Verify signed reactionToken (HMAC against CRON_SECRET) and decode subscriber + sentAt
  // - Insert row into Notion intelligence_archive with reaction, emailId, subscriber, ts
  // - Feed skip/deeper signals back to Education AI tuning loop

  const safeReaction = reaction.replace(/[^a-z]/g, "");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Thanks</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0d10;color:#e7ebf1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:480px;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px}p{color:#8a93a3}</style>
</head><body><main>
<h1>Thanks — "${safeReaction}" logged.</h1>
<p>Your signal sharpens tomorrow's brief.</p>
</main></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
