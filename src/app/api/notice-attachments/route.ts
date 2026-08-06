// GET /api/notice-attachments?noticeId=<32hex> — the notice's attachments, as
// SAM.gov's own UI sees them.
//
// Keyed by NOTICE, not by file id. The previous version took a list of file ids
// read off the feed's `resourceLinks` and resolved a name for each — which could
// never surface an attachment the feed had omitted, and the feed does omit them
// (notice 98d55b83… carries 4 links where SAM lists 5). Asking SAM for the
// notice's attachment list is the only way the panel can show what was actually
// posted.
//
// Why a route: the endpoint needs `Accept: application/hal+json` and is
// cross-origin, so the browser cannot read it directly.
//
// Failure contract (Rule 64): always HTTP 200 on a reachable request, with
// `attachments: null` + reason when the read failed — never `[]`. The panel
// keeps the links it already has rather than claiming the notice has none.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchNoticeAttachments } from "@/lib/sam-attachment-names";

export const dynamic = "force-dynamic";

const NOTICE_ID_RE = /^[a-f0-9]{32}$/i;

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const noticeId = new URL(req.url).searchParams.get("noticeId") || "";
  // A malformed id is a bad request, not a SAM failure — the two need different
  // handling and must not arrive at the card looking alike.
  if (!NOTICE_ID_RE.test(noticeId)) {
    return NextResponse.json({ attachments: null, reason: "bad-notice-id" }, { status: 400 });
  }

  try {
    const { attachments, reason } = await fetchNoticeAttachments(noticeId);
    return NextResponse.json({ attachments, reason: reason ?? null });
  } catch (e) {
    return NextResponse.json({
      attachments: null,
      reason: e instanceof Error ? e.message.slice(0, 120) : "error"
    });
  }
}
