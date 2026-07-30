// POST /api/audit/[id]/refetch — one-click server-side SAM re-pull + re-audit.
//
// Wired to the [data-fetch] CTA in the preliminary-read verdict block when
// the classifier puts the audit in data-prelim-mode="fetch" (doc EXISTS on
// SAM but our original retrieval failed — oversize, network, etc.).
//
// ASYNC (2026-07-29) — the armed flag env pushed a real multi-doc engine run
// past the 200s inline budget (36C25626Q1137 hit 206s → HTTP 500 under
// Vercel's 300s ceiling), so this route no longer runs the engine. It
// validates + enqueues a pending_audits row (source='user', audit_id = THIS
// audit) and the resident audit-worker re-runs executeAudit against the SAME
// audits row under its own budget. The worker's SAM arm re-assembles the full
// document set, refreshes the SAM fact columns, and (for refetch-stamped
// rows) merges last_refetched_at + pdf_source back into compliance_json —
// the bookkeeping this route used to do inline.
//
// Flow:
//   1. Auth + load the audit row (mirrors /audit/[id] auth — also honors the
//      curated HERO_AUDIT_ID service-role fallback so the demo audit is
//      re-fetchable for any signed-in user).
//   2. 24h idempotency check: if the row already has a real PDF source
//      (anything other than sam_unavailable) AND was refreshed within the
//      last 24h, return success without re-running the engine.
//      BYPASS: a POST body of { "force": true } skips this check so an
//      explicit user-triggered re-run always re-invokes the current engine.
//   3. Rate limit (shares the existing audit:<user.id> bucket — 10/hr).
//   4. In-flight dedupe: an existing pending/processing pending_audits row
//      for this audit_id returns 202 without a second enqueue (double-click,
//      stale tab).
//   5. fetchSolicitationByNoticeId() presence check only (one SAM call — no
//      document downloads here). If no resourceLinks → 422.
//   6. Stamp compliance_json.last_refetched_at, flip the audits row to
//      status='processing' (the report page renders its polling wait state),
//      insert the pending_audits row, return 202. The [data-fetch] handler
//      redirects to /audit/[id], which polls GET /api/audit/[id]/status and
//      reloads on terminal status — same contract as the FA-116 async POST.
//
// The worker UPDATEs the audits row in place (executeAudit persists by id —
// the worker never inserts audits rows), so a refetch can never duplicate a
// report row.

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency } from "@/lib/sam";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// No engine run here anymore — one SAM presence call + two row writes. 60s is
// generous headroom for a slow SAM endpoint (the fetch itself retries inside).
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HERO_AUDIT_ID = "7e389f1a-0fc4-4ba2-8299-c86d23adb62a";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required (UUID)" }, { status: 400 });
  }

  // Optional { force?: boolean } body. Body is optional — the [data-fetch]
  // button POSTs with no body and inherits force=false. Explicit re-runs send
  // { "force": true } to bypass the 24h cache and always re-invoke the engine.
  let force = false;
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { force?: boolean } | null;
    force = Boolean(body?.force);
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Rate limit shared with the main audit POST.
  const rate = checkRateLimit(`audit:${user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rate.retryAfter}s.`, retryAfter: rate.retryAfter },
      { status: 429 }
    );
  }

  // Load the audit row. Mirror /audit/[id]'s hero service-role fallback so the
  // curated demo audit is fetchable for any authed user. `db` is whichever
  // client can actually see (and therefore UPDATE) the row — the RLS session
  // for owned audits, service-role for the hero row.
  let audit: Record<string, unknown> | null = null;
  let db: SupabaseClient = supabase;
  {
    const { data } = await supabase.from("audits").select("*").eq("id", id).single();
    audit = data as Record<string, unknown> | null;
  }
  if (!audit && id.toLowerCase() === HERO_AUDIT_ID) {
    const adminClient = getAdminClient();
    if (adminClient) {
      const { data } = await adminClient.from("audits").select("*").eq("id", HERO_AUDIT_ID).single();
      audit = data as Record<string, unknown> | null;
      if (audit) db = adminClient;
    }
  }
  if (!audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  const compJson = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const currentPdfSource = String(compJson.pdf_source ?? "");
  const lastRefetchedAtRaw = compJson.last_refetched_at as string | undefined;
  const lastRefetchedAt = lastRefetchedAtRaw ? new Date(lastRefetchedAtRaw).getTime() : 0;

  // 24h idempotency: if the row was successfully refetched recently AND now
  // carries a real PDF source, skip the model call. Explicit { force: true }
  // bypasses so a user-triggered re-run always re-invokes the current engine.
  // status guard: the enqueue stamps last_refetched_at BEFORE the worker runs,
  // so a terminally-failed re-run leaves a fresh stamp on a 'failed' row — the
  // cache must never block retrying that row (the failed page's retry CTA
  // sends force:true anyway; this covers direct no-force POSTs too).
  if (
    !force &&
    String(audit.status ?? "") === "complete" &&
    currentPdfSource !== "" &&
    currentPdfSource !== "sam_unavailable" &&
    lastRefetchedAt > Date.now() - TWENTY_FOUR_HOURS_MS
  ) {
    return NextResponse.json({
      auditId: audit.id,
      status: "already_fetched",
      pdfSource: currentPdfSource,
      lastRefetchedAt: lastRefetchedAtRaw,
      redirect: `/audit/${audit.id}`
    });
  }

  // Everything past here needs the service-role client (pending_audits RLS
  // grants authenticated users READ only — migration 011).
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Audit queue is unavailable. Nothing was charged — please try again." },
      { status: 500 }
    );
  }

  const noticeId = String(audit.notice_id ?? "");
  if (!noticeId) {
    return NextResponse.json({ error: "audit has no notice_id" }, { status: 422 });
  }
  if (!process.env.SAM_API_KEY) {
    return NextResponse.json({ error: "SAM API key not configured" }, { status: 503 });
  }

  // ━━ SAM presence check — one API call, no document downloads ━━
  const solicitation = await fetchSolicitationByNoticeId(noticeId);
  if (!solicitation) {
    return NextResponse.json({ error: "Solicitation not found on SAM.gov" }, { status: 404 });
  }
  if (solicitation.resourceLinks.length === 0) {
    // Still nothing fetchable. Update last_refetched_at so the user can't
    // hammer the button + return a clear signal the prelim mode should stay.
    const merged = { ...compJson, last_refetched_at: new Date().toISOString() };
    await db.from("audits").update({ compliance_json: merged }).eq("id", audit.id);
    return NextResponse.json(
      { error: "no document attached to this notice", refetched: false, redirect: `/audit/${audit.id}` },
      { status: 422 }
    );
  }

  // In-flight dedupe — a refetch already queued/running for this audit must
  // not enqueue (and pay for) a second run. force does NOT bypass this: the
  // queued run IS the current engine invocation the user is asking for.
  // Checked HERE (after the ~seconds-long SAM call, immediately before the
  // insert) to keep the check-then-act window at milliseconds — there is no
  // DB uniqueness constraint on audit_id to backstop a race (migration 011
  // rescoped the unique index to non-user rows), so concurrent POSTs that
  // both pass this check would each fund an engine run.
  {
    const { data: inflight } = await admin
      .from("pending_audits")
      .select("id, status")
      .eq("audit_id", audit.id)
      .eq("source", "user")
      .in("status", ["pending", "processing"])
      .limit(1);
    if (inflight && inflight.length > 0) {
      return NextResponse.json(
        { auditId: audit.id, status: "queued", alreadyQueued: true, redirect: `/audit/${audit.id}` },
        { status: 202 }
      );
    }
  }

  // ━━ Enqueue ━━
  // Stamp last_refetched_at BEFORE the worker runs: the worker reads the
  // pre-run stamp to recognize a refetch-shaped row (an audits row that
  // already existed) and re-stamps it after executeAudit replaces
  // compliance_json. Flip to 'processing' BEFORE the pending insert so the
  // worker's current_stage writes can never be stomped by this route.
  const nowIso = new Date().toISOString();
  const prevStatus = String(audit.status ?? "complete");
  const { error: flipErr } = await db
    .from("audits")
    .update({
      status: "processing",
      current_stage: null,
      stage_updated_at: nowIso,
      error_message: null,
      compliance_json: { ...compJson, last_refetched_at: nowIso }
    })
    .eq("id", audit.id);
  if (flipErr) {
    return NextResponse.json(
      { error: `Refetch could not start: ${flipErr.message}. Nothing was charged.` },
      { status: 500 }
    );
  }

  const { error: enqueueErr } = await admin.from("pending_audits").insert({
    notice_id: solicitation.noticeId,
    solicitation_number: solicitation.solicitationNumber,
    title: solicitation.title,
    agency: resolveAgency(solicitation) || (audit.agency as string | null),
    naics_code: solicitation.naicsCode,
    set_aside: solicitation.typeOfSetAside,
    response_deadline: solicitation.responseDeadLine,
    pdf_url: solicitation.resourceLinks[0] ?? null,
    source: "user",
    status: "pending",
    user_id: user.id,
    audit_id: audit.id,
    anthropic_file_id: null,
    pdf_filename: null,
    pdf_path: null,
    upload_docs: null
  });

  if (enqueueErr) {
    // Restore the pre-flip row — the queue insert failed, so no worker will
    // ever land a terminal status and the report page would poll forever.
    // compliance_json goes back too (drops the enqueue stamp — no run
    // happened, so the 24h cache must not think one did).
    const { error: restoreErr } = await db
      .from("audits")
      .update({ status: prevStatus, error_message: `refetch enqueue failed: ${enqueueErr.message}`, compliance_json: compJson })
      .eq("id", audit.id);
    if (restoreErr) {
      // Row is stranded in 'processing' with no queue row — loud, so it is
      // findable without log archaeology.
      console.error(`[refetch] enqueue failed AND status restore failed for ${audit.id} — row stranded in 'processing': ${restoreErr.message}`);
    }
    return NextResponse.json(
      { error: `Refetch could not be queued: ${enqueueErr.message}. Nothing was charged.` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      auditId: audit.id,
      status: "queued",
      redirect: `/audit/${audit.id}`,
      poll: `/api/audit/${audit.id}/status`
    },
    { status: 202 }
  );
}
