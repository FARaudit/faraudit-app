// WEEKLY DIGEST OF WATCHED OPPORTUNITIES — Monday 14:00 UTC.
//
// The Notifications toggle has been persisting `weekly_digest_watched` with nothing behind
// it. This is the thing behind it.
//
// WHAT THIS ROUTE REFUSES TO DO, and why each matters more than what it does:
//   · It never emails a customer who did not switch the digest ON. The preference is the
//     gate, read per user, and a missing preferences row reads as OFF — not as a default-on.
//   · It never sends an empty digest. A quiet week produces NO email. "No activity this
//     week" is indistinguishable from a broken pipeline and teaches a customer to ignore
//     the one that matters (Rule 61).
//   · It never sends on a FAILED read. If a user's rows cannot be fetched, that user is
//     counted as an error and skipped — a read failure must not render as a quiet week.
//   · One user's failure does not abort the run; the others still get theirs.
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildWatchedDigest, buildWatchedDigestEmail, type WatchedRow } from "@/lib/watched-digest";
import { poleToRecommendation } from "@/lib/verdict-pole";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-key") === secret) return true;
  return false;
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const appBase = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.faraudit.com";

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = admin();
  if (!db) return NextResponse.json({ error: "supabase env missing" }, { status: 503 });

  const nowIso = new Date().toISOString();
  const settingsUrl = `${appBase()}/settings`;

  // OPTED IN ONLY. `.eq(true)` rather than "not false" — a user with no preferences row has
  // not asked for this, and inferring consent from an absent row is how a product starts
  // emailing people who never agreed.
  const { data: prefs, error: prefErr } = await db
    .from("user_preferences")
    .select("user_id")
    .eq("weekly_digest_watched", true);
  if (prefErr) {
    return NextResponse.json({ error: `preferences read failed: ${prefErr.message}` }, { status: 503 });
  }
  const userIds = [...new Set((prefs ?? []).map((p) => String((p as { user_id: unknown }).user_id)).filter(Boolean))];

  let sent = 0, quiet = 0, errors = 0, noEmail = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    try {
      const { data: rows, error: rowErr } = await db
        .from("watched_notices")
        .select("id, audit_id, title, agency, solicitation_number, notice_type, status, response_deadline, last_checked_at, created_at")
        .eq("user_id", userId);
      // A READ FAILURE IS NOT A QUIET WEEK. Skip, count, keep going.
      if (rowErr) { errors++; failures.push(`${userId}: rows ${rowErr.message}`); continue; }

      // THE VERDICT IS WHY THE EMAIL IS WORTH OPENING, so it is carried per row — but it is
      // derived by `poleToRecommendation`, the SAME function the watched-notices page uses,
      // rather than read off the stale `recommendation` column. Two derivations of one
      // verdict is how an email comes to say GO while the screen says something else.
      //
      // A FAILED VERDICT READ IS NOT A VERDICT. If this lookup fails the rows keep
      // `verdict: null` and the email renders no badge at all — an absent badge is honest,
      // a defaulted one would be an invented answer about whether the customer may bid.
      const withVerdicts = (rows ?? []) as WatchedRow[];
      const auditIds = withVerdicts.map((r) => r.audit_id).filter((v): v is string => !!v);
      if (auditIds.length) {
        const { data: auditRows, error: aErr } = await db
          .from("audits").select("id, recommendation, compliance_json").in("id", auditIds);
        if (aErr) {
          console.warn(`[watched-digest] verdict lookup failed (${aErr.message}) — rows render without a badge`);
        } else {
          const byId = new Map((auditRows ?? []).map((a) => [String((a as { id: unknown }).id), a]));
          for (const r of withVerdicts) {
            const a = r.audit_id ? byId.get(String(r.audit_id)) : null;
            if (!a) continue;
            const row = a as { recommendation: string | null; compliance_json: Record<string, unknown> | null };
            r.verdict = poleToRecommendation({ compliance_json: row.compliance_json, recommendation: row.recommendation });
          }
        }
      }
      const digest = buildWatchedDigest(withVerdicts, { nowIso, appBaseUrl: appBase() });
      if (!digest) { quiet++; continue; }

      const { data: u, error: uErr } = await db.auth.admin.getUserById(userId);
      const toEmail = u?.user?.email ?? null;
      if (uErr || !toEmail) { noEmail++; failures.push(`${userId}: no address`); continue; }

      if (!process.env.RESEND_API_KEY) { errors++; failures.push("RESEND_API_KEY not configured"); continue; }
      const { subject, html, text } = buildWatchedDigestEmail(digest, settingsUrl, nowIso);
      const { Resend } = await import("resend");
      const res = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: "FARaudit Watching <alerts@faraudit.com>",
        to: toEmail, subject, html, text,
      });
      if ((res as { error?: { message?: string } }).error) {
        errors++; failures.push(`${userId}: ${(res as { error: { message?: string } }).error.message ?? "resend error"}`);
        continue;
      }
      sent++;
    } catch (err) {
      errors++;
      failures.push(`${userId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // `quiet` is reported separately from `errors` on purpose: collapsing them would hide a
  // week where every read failed behind a number that reads like a calm week.
  return NextResponse.json({
    ok: errors === 0,
    optedIn: userIds.length,
    sent, quiet, noEmail, errors,
    failures: failures.slice(0, 20),
    at: nowIso,
  });
}
