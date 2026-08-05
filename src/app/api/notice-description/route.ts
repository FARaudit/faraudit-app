// GET /api/notice-description?noticeId=<32-hex> — the SAM notice text, resolved
// one notice at a time.
//
// SAM's v2 search returns `description` as a ~94-char noticedesc URL, not the
// text, so the feed carries the URL (live-opportunities.ts) and this route
// resolves it. Per-notice rather than per-feed on purpose: a 200-row read would
// otherwise become 200 extra SAM calls to render text nobody has opened yet.
//
// Failure contract (Rule 64): a read that does not complete returns
// `{ description: null, reason }` with HTTP 200. "SAM published no description"
// and "we could not reach SAM" are different facts and the card must not render
// them alike — so neither is allowed to arrive as an empty string.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveSamDescription } from "@/lib/sam-description";

export const dynamic = "force-dynamic";

const NOTICE_ID_RE = /^[a-f0-9]{32}$/i;

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const noticeId = new URL(req.url).searchParams.get("noticeId") || "";
  // Reject a malformed id here rather than letting SAM answer 404 for what is
  // really a bad request — the two need different messages on the card.
  if (!NOTICE_ID_RE.test(noticeId)) {
    return NextResponse.json(
      { description: null, reason: "bad-notice-id" },
      { status: 400 }
    );
  }

  try {
    const url = `https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=${noticeId}`;
    const resolved = await resolveSamDescription(noticeId, url);
    // It hands back the ORIGINAL url in `text` when it could not fetch, so
    // `fetched` is the only honest signal that real notice text arrived —
    // reading `text` alone would ship a URL to the card as if it were prose.
    if (!resolved.fetched) {
      return NextResponse.json({
        description: null,
        reason: resolved.reason || "unresolved",
      });
    }
    const text = (resolved.text || "").trim();
    return NextResponse.json({
      description: text.length ? text : null,
      reason: text.length ? null : "empty-body",
    });
  } catch (e) {
    return NextResponse.json({
      description: null,
      reason: e instanceof Error ? e.message.slice(0, 120) : "error",
    });
  }
}
