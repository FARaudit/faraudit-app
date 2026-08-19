/* GET /notices/<noticeId> — ONE notice, addressable.
 *
 * The list already expands a card in place with SAM's description and its attachment
 * list. What it could not do is give a notice an ADDRESS: there was nothing to send a
 * colleague, nothing to bookmark, and nothing to come back to after a run.
 *
 * SAME FEED AS THE LIST, DELIBERATELY. The row is resolved out of
 * fetchLiveOpportunitiesScoped — the identical call /notices renders from — rather than
 * fetched separately from SAM. A detail page with its own source is a second answer to
 * "what does this notice say", and the two drift the first time either changes.
 *
 * Description and attachments are NOT fetched here. They already have working endpoints
 * that the list calls per card, and this page calls the same two, so there is one
 * implementation of each rather than a server copy and a client copy.
 *
 * ⛔ NOTHING HERE TOUCHES THE ENGINE. The Run audit control is the same link the card
 * carries; pressing it is what costs money, and that path is unchanged.
 */
import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";
import { injectRail } from "@/lib/nav/rail";
import { fetchLiveOpportunitiesScoped } from "@/lib/bd-os/live-opportunities";
import { renderNotice, renderOutOfScope } from "./_render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ noticeId: string }> }
): Promise<Response> {
  const { noticeId } = await ctx.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/notices/${encodeURIComponent(noticeId)}`);

  let body: string;
  try {
    const { rows } = await fetchLiveOpportunitiesScoped(supabase);
    const key = String(noticeId).toLowerCase();
    const row = (rows || []).find(
      (r) =>
        String(r.notice_id || "").toLowerCase() === key ||
        String(r.solicitation_number || "").toLowerCase() === key
    );
    body = row ? renderNotice(row) : renderOutOfScope(noticeId, false);
  } catch {
    // A failed feed read is never an empty feed.
    body = renderOutOfScope(noticeId, true);
  }

  const filePath = path.join(process.cwd(), "public", "notice-detail.html");
  let html = await readFile(filePath, "utf8");
  html = html.replace("<!--NOTICE_BODY-->", body);
  html = injectRail(html, "opportunities");

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
