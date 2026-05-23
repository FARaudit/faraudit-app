import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;

type SentryLevel = "fatal" | "error" | "warning" | "info" | "debug";

export function initSentry(agentName: string) {
  if (!SENTRY_DSN) {
    console.warn(`[sentry] SENTRY_DSN not set — disabled for ${agentName}`);
    return;
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    release: agentName,
    tracesSampleRate: 0.1,
  });
  console.log(`[sentry] initialized for ${agentName}`);
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export function captureMessage(msg: string, level: SentryLevel = "info") {
  if (!SENTRY_DSN) return;
  Sentry.captureMessage(msg, level);
}
