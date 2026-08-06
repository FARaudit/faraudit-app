// GET /api/notice-attachments?ids=<32hex>,<32hex>,… — the real filenames SAM
// published for a notice's attachments.
//
// Why a route at all: the name lives in a Content-Disposition header on
// sam.gov's download redirect. S3 sends no Access-Control-Expose-Headers and the
// sam.gov hop needs the server-side key, so the browser cannot read it — see
// src/lib/sam-attachment-names.ts for the measurements.
//
// Why ids and not URLs: the client sends bare 32-hex file ids and the server
// rebuilds the one canonical URL shape. No caller-supplied URL reaches fetch(),
// so there is no SSRF surface to argue about. Verified safe to assume: 1853 of
// 1853 links across 384 notices matched that shape exactly.
//
// Failure contract (Rule 64): always HTTP 200 with a per-id entry. An id we
// could not read comes back `name: null` + reason — never "", never a guess, and
// never silently dropped from the response, because the panel decides per
// attachment whether to show a name or keep "Document N".
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
  MAX_ATTACHMENT_IDS,
  SAM_FILE_ID_RE,
  resolveAttachmentNames
} from "@/lib/sam-attachment-names";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("ids") || "";
  const requested = raw.split(",").map((s) => s.trim()).filter(Boolean);

  if (requested.length === 0) {
    return NextResponse.json({ names: [], reason: "no-ids" }, { status: 400 });
  }
  // A malformed id is a bad request, not a SAM failure — the two need different
  // handling and must not arrive at the card looking alike.
  if (requested.some((id) => !SAM_FILE_ID_RE.test(id))) {
    return NextResponse.json({ names: [], reason: "bad-file-id" }, { status: 400 });
  }

  // Over-cap is truncated rather than rejected: 40 names is already more than
  // the panel shows, and failing the whole request would cost the customer the
  // 40 it could have had.
  const ids = requested.slice(0, MAX_ATTACHMENT_IDS);

  try {
    const names = await resolveAttachmentNames(ids);
    return NextResponse.json({
      names,
      truncated: requested.length > ids.length ? requested.length - ids.length : 0
    });
  } catch (e) {
    // resolveAttachmentNames swallows per-id failures, so reaching here means
    // something structural. Still 200 + nulls: the panel falls back to
    // "Document N" and the customer keeps working links.
    return NextResponse.json({
      names: ids.map((id) => ({ id, name: null, reason: "error" })),
      reason: e instanceof Error ? e.message.slice(0, 120) : "error"
    });
  }
}
