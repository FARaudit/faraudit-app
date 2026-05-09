import { NextRequest, NextResponse } from "next/server";

const CEO_LIBRARY_DB_ID = process.env.CEO_LIBRARY_DB_ID || "";

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const emailId = req.nextUrl.searchParams.get("email_id");

  if (!token || !emailId) {
    return new NextResponse("<html><body><h1>Bad request</h1></body></html>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // TODO Phase C Day 4 (spec: Notion 35bfaf5b9314810abd9cc8709e10c3ce Part 2):
  // - Verify signed token, resolve subscriber + emailId
  // - Look up the archived email row in intelligence_archive
  // - Create a Notion page in CEO_LIBRARY_DB_ID with: title (subject), body (html→md), source link,
  //   pinned_at timestamp, reaction='pin', vertical, sendDate
  // - Respond with success page that links to the new Notion page

  void CEO_LIBRARY_DB_ID;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Pinned</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0d10;color:#e7ebf1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:480px;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px}p{color:#8a93a3}</style>
</head><body><main>
<h1>📌 Pin queued.</h1>
<p>Phase C Day 4 will write this to your CEO Intelligence Library in Notion.</p>
</main></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
