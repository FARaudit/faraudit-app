// De-arm (#657) change 3: minimal interim alerting. On any uncaught error / Gmail auth failure, draft
// a failure alert to the CEO (Sentry-ready — Sentry fires separately via captureException). Rate-limited
// to at most 1 alert draft per 6h, using existing alert drafts in Gmail as the durable rate-limit store
// (each cron tick is a fresh process, so an in-memory timer would not survive). Best-effort throughout:
// if the alert path itself fails (e.g. Gmail auth is the root cause), it logs and returns — never throws.
import { getGmail, createDraft } from "./gmail";
import { errorMessage } from "./utils";

const ALERT_SUBJECT_PREFIX = "🔴 email-ai-v3 FAILURE";
const RATE_LIMIT_MS = 6 * 60 * 60 * 1000; // 6h
const ALERT_TO = process.env.ALERT_EMAIL || "jose@faraudit.com";

/** True if an alert draft with our subject prefix was created within the last 6h. */
async function recentAlertExists(): Promise<boolean> {
  const gmail = getGmail();
  const res = await gmail.users.drafts.list({ userId: "me", maxResults: 25 });
  const drafts = res.data.drafts || [];
  const cutoff = Date.now() - RATE_LIMIT_MS;
  for (const d of drafts) {
    if (!d.message?.id) continue;
    const m = await gmail.users.messages.get({
      userId: "me",
      id: d.message.id,
      format: "metadata",
      metadataHeaders: ["Subject"],
    });
    const subj = (m.data.payload?.headers || []).find((h) => h.name === "Subject")?.value || "";
    const internal = parseInt(m.data.internalDate || "0", 10);
    if (subj.startsWith(ALERT_SUBJECT_PREFIX) && internal > cutoff) return true;
  }
  return false;
}

/** Draft a failure alert to the CEO (rate-limited 1/6h). Never throws. */
export async function alertFailure(err: unknown, lastTickSummary: string): Promise<void> {
  try {
    if (await recentAlertExists()) {
      console.warn("[email-ai-v3] failure alert suppressed — one already drafted within 6h");
      return;
    }
    const ts = new Date().toISOString();
    const stack = err instanceof Error && err.stack ? err.stack + "\n\n" : "";
    await createDraft({
      to: ALERT_TO,
      subject: `${ALERT_SUBJECT_PREFIX} ${ts}`,
      body: `email-ai-v3 tick FAILED at ${ts}\n\nError:\n${errorMessage(err)}\n\n${stack}Last tick summary:\n${lastTickSummary}\n`,
    });
    console.log(`[email-ai-v3] failure alert draft created → ${ALERT_TO}`);
  } catch (e) {
    // The alert path itself failed (very likely the same Gmail auth failure that triggered it).
    // Log and move on — Sentry (if a DSN is configured) is the backstop for this case.
    console.error(`[email-ai-v3] alertFailure itself failed (best-effort): ${errorMessage(e)}`);
  }
}
