import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// CCPA-compliant account deletion. The 30-second confirmation countdown is a
// UX concern handled in the Settings client; this endpoint is the irreversible
// step that runs when the countdown completes.

const USER_TABLES = [
  "audits",
  "fa_intelligence_corpus",
  "user_preferences",
  "model_runs"
];

export async function POST(req: NextRequest) {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = checkRateLimit(`delete:${user.id}`, { max: 3, windowMs: 3600_000 });
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many delete attempts. Try again in an hour." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "confirmation required — POST { confirm: 'DELETE' }" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Service-role client unavailable" }, { status: 500 });

  const userId = user.id;
  const userEmail = user.email ?? null;

  const deletionResults: Record<string, { deleted: number; error: string | null }> = {};
  for (const table of USER_TABLES) {
    try {
      const { error, count } = await admin.from(table).delete({ count: "exact" }).eq("user_id", userId);
      deletionResults[table] = { deleted: count ?? 0, error: error?.message ?? null };
    } catch (err) {
      deletionResults[table] = { deleted: 0, error: err instanceof Error ? err.message : "unknown" };
    }
  }

  let authDeleted = false;
  let authError: string | null = null;
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) authError = error.message;
    else authDeleted = true;
  } catch (err) {
    authError = err instanceof Error ? err.message : "unknown";
  }

  let emailSent = false;
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && userEmail) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "FARaudit <noreply@faraudit.com>",
        to: userEmail,
        subject: "Your FARaudit account has been deleted",
        text: `Your FARaudit account (${userEmail}) was deleted on ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT. All audit history, KO email drafts, and account data has been removed.

If you did not request this deletion, contact jose@faraudit.com immediately.

— FARaudit`
      });
      emailSent = true;
    }
  } catch {
    /* email best-effort */
  }

  return NextResponse.json({
    ok: authDeleted,
    auth_deleted: authDeleted,
    auth_error: authError,
    tables: deletionResults,
    email_sent: emailSent
  });
}
