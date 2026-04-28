import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminClient } from "@/lib/supabase-admin";
import { runAllChecks, renderTextReport, type CheckResult } from "@/lib/security-agent";

export const maxDuration = 90;

// Daily security agent. Runs all 7 checks, writes results to security_metrics,
// emails the consolidated report to the CEO via Resend.
//
// Auth: x-vercel-cron header (Vercel cron) OR x-cron-key matching CRON_SECRET.

const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME || "FARaudit";
const CEO_EMAIL = process.env.SECURITY_REPORT_RECIPIENT || "jose@faraudit.com";

function authorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-key") === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = getAdminClient();
  if (!sb) return NextResponse.json({ error: "service-role unavailable" }, { status: 500 });

  const results: CheckResult[] = await runAllChecks(sb);

  // Persist every check result (even passes) for trend analysis
  try {
    await sb.from("security_metrics").insert(
      results.map((r) => ({
        check_name: r.name,
        status: r.status,
        details: { description: r.details, ...(r.metadata ?? {}) },
        severity: r.severity,
        resolved: r.status === "pass"
      }))
    );
  } catch {
    /* persistence is best-effort — never block the email */
  }

  const allPassed = results.every((r) => r.status === "pass");
  const anyCritical = results.some((r) => r.severity === "critical" && r.status !== "pass");
  const report = renderTextReport(COMPANY, results);

  let emailMessageId: string | null = null;
  let emailError: string | null = null;
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const subjectPrefix = anyCritical ? "🚨 CRITICAL · " : allPassed ? "" : "⚠️ ";
      const subject = `${subjectPrefix}Security Report — ${COMPANY} — ${new Date().toLocaleDateString("en-US", {
        timeZone: "America/Chicago"
      })}`;
      const { data: sent } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Security Agent <noreply@faraudit.com>",
        to: CEO_EMAIL,
        subject,
        text: report
      });
      emailMessageId = sent?.id ?? null;
    } else {
      emailError = "RESEND_API_KEY not configured";
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : "resend send failed";
  }

  return NextResponse.json({
    ok: true,
    company: COMPANY,
    all_passed: allPassed,
    any_critical: anyCritical,
    checks: results.map((r) => ({ name: r.name, status: r.status, severity: r.severity })),
    email_sent: !!emailMessageId,
    email_message_id: emailMessageId,
    email_error: emailError
  });
}
