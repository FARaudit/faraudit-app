import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry(agentName: string) {
  if (!SENTRY_DSN) {
    console.warn(`[sentry] SENTRY_DSN not set — disabled for ${agentName}`);
    return;
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    release: agentName,
  });
  console.log(`[sentry] initialized for ${agentName}`);
}

export function captureException(err: unknown) {
  if (!SENTRY_DSN) return;
  Sentry.captureException(err);
}
