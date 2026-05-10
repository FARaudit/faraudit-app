import "dotenv/config";

import { runMigrationCheck } from "./migration-check";
import { loadBlacklist, isBlacklisted } from "./blacklist";
import { getSupabase } from "./supabase";
import {
  listLabels,
  listUnreadThreads,
  getThread,
  applyLabel,
  moveToTrash,
} from "./gmail";
import { classifyThread, ACTIVE_MODEL } from "./anthropic";
import { buildAndCreateDraft } from "./draft";
import {
  BUCKET_TO_GMAIL_LABEL,
  type Bucket,
  type ErrorLogEntry,
  type GmailHeader,
  type GmailMessage,
  type GmailThread,
  type RunMetrics,
  type ThreadSummary,
} from "./types";

const GMAIL_USER = (process.env.GMAIL_USER || "jose@faraudit.com").toLowerCase();
const KILL_SWITCH = process.env.EMAIL_AI_ENABLED === "true";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function extractEmail(headerValue: string | undefined): string {
  if (!headerValue) return "";
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim().toLowerCase();
}

function findHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function buildThreadSummary(thread: GmailThread): ThreadSummary {
  const messages = thread.messages || [];
  const last = messages[messages.length - 1] as GmailMessage | undefined;
  const fromHeader = findHeader(last?.payload?.headers, "From");
  const subject = findHeader(last?.payload?.headers, "Subject");
  const snippet = last?.snippet || "";

  let lastCeoMs: number | null = null;
  for (const m of messages) {
    const fromEmail = extractEmail(findHeader(m.payload?.headers, "From"));
    if (fromEmail === GMAIL_USER) {
      const ms = parseInt(m.internalDate || "0", 10);
      if (ms > 0 && (lastCeoMs === null || ms > lastCeoMs)) lastCeoMs = ms;
    }
  }

  return {
    threadId: thread.id,
    fromEmail: extractEmail(fromHeader),
    subject,
    snippet,
    lastCeoMessageAt: lastCeoMs,
    rawMessages: messages,
  };
}

// ────────────────────────────────────────────────────────────
// Run-record lifecycle (one row per tick in email_ai_runs)
// ────────────────────────────────────────────────────────────

async function startRun(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("email_ai_runs")
    .insert({ status: "running", model_used: ACTIVE_MODEL })
    .select("id")
    .single();
  if (error) throw new Error(`startRun: ${error.message}`);
  return data.id as string;
}

async function finalizeRun(runId: string, metrics: RunMetrics, status: "success" | "partial" | "failed"): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("email_ai_runs")
    .update({
      tick_ended_at: new Date().toISOString(),
      threads_processed: metrics.threadsProcessed,
      threads_classified: metrics.threadsClassified,
      threads_skipped_self_loop: metrics.threadsSkippedSelfLoop,
      threads_blacklisted: metrics.threadsBlacklisted,
      drafts_created: metrics.draftsCreated,
      errors_caught: metrics.errorsCaught,
      model_used: metrics.modelUsed,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      cost_usd: Number(metrics.costUsd.toFixed(6)),
      error_log: metrics.errorLog,
      status,
    })
    .eq("id", runId);
  if (error) {
    // Last-ditch: log to console; we cannot fail the cron after the work is done
    console.error(`[email-ai-v3] finalizeRun failed: ${error.message}`);
  }
}

async function persistClassification(
  runId: string,
  thread: ThreadSummary,
  bucket: Bucket,
  confidence: number,
  reasoning: string,
  draftCreated: boolean,
  draftId: string | null
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("email_thread_classifications").insert({
    thread_id: thread.threadId,
    sender_email: thread.fromEmail,
    subject: thread.subject,
    bucket,
    confidence: Number(confidence.toFixed(2)),
    reasoning,
    draft_created: draftCreated,
    draft_id: draftId,
    tick_id: runId,
  });
  if (error) throw new Error(`persistClassification: ${error.message}`);
}

// ────────────────────────────────────────────────────────────
// Per-thread processing
// ────────────────────────────────────────────────────────────

interface ProcessOutcome {
  bucket: Bucket;
  draftCreated: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  modelUsed: string;
}

async function processThread(
  runId: string,
  thread: ThreadSummary,
  labelMap: Map<string, string>
): Promise<ProcessOutcome> {
  // 1. Classify
  const classification = await classifyThread({
    senderEmail: thread.fromEmail,
    subject: thread.subject,
    snippet: thread.snippet,
    lastCeoMessageInThread: thread.lastCeoMessageAt
      ? new Date(thread.lastCeoMessageAt).toISOString()
      : null,
  });

  let totalInput = classification.input_tokens;
  let totalOutput = classification.output_tokens;
  let totalCost = classification.cost_usd;

  // 2. Apply Gmail label (skip if SKIPPED — defensive; classifier shouldn't return SKIPPED)
  if (classification.bucket !== "SKIPPED") {
    const labelName = BUCKET_TO_GMAIL_LABEL[classification.bucket];
    const labelId = labelMap.get(labelName);
    if (!labelId) {
      throw new Error(
        `Gmail label '${labelName}' not found — create it in Gmail before next tick`
      );
    }
    await applyLabel(thread.threadId, labelId);
  }

  // 3. NOW bucket → generate draft reply
  let draftCreated = false;
  let draftId: string | null = null;
  if (classification.bucket === "NOW") {
    const outcome = await buildAndCreateDraft(thread);
    draftId = outcome.draftId;
    draftCreated = true;
    totalInput += outcome.inputTokens;
    totalOutput += outcome.outputTokens;
    totalCost += outcome.costUsd;
  }

  // 4. Persist classification row
  await persistClassification(
    runId,
    thread,
    classification.bucket,
    classification.confidence,
    classification.reasoning,
    draftCreated,
    draftId
  );

  return {
    bucket: classification.bucket,
    draftCreated,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    costUsd: totalCost,
    modelUsed: classification.model_used,
  };
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[email-ai-v3] tick starting at ${new Date().toISOString()}`);

  if (!KILL_SWITCH) {
    console.log("[email-ai-v3] EMAIL_AI_ENABLED !== 'true' — kill switch active, exiting 0");
    return;
  }

  // Boot: migration + blacklist + labels + run record
  await runMigrationCheck();
  await loadBlacklist();
  const labelMap = await listLabels();

  // Validate all 6 active labels exist
  const missingLabels: string[] = [];
  for (const labelName of Object.values(BUCKET_TO_GMAIL_LABEL)) {
    if (!labelMap.has(labelName)) missingLabels.push(labelName);
  }
  if (missingLabels.length > 0) {
    console.error(
      `[email-ai-v3] missing Gmail labels: ${missingLabels.join(", ")} — create them in Gmail before next tick`
    );
    process.exit(1);
  }
  console.log(`[email-ai-v3] boot: 6 Gmail labels resolved`);

  const runId = await startRun();
  console.log(`[email-ai-v3] run id: ${runId}`);

  const metrics: RunMetrics = {
    threadsProcessed: 0,
    threadsClassified: 0,
    threadsSkippedSelfLoop: 0,
    threadsBlacklisted: 0,
    draftsCreated: 0,
    errorsCaught: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    errorLog: [],
    modelUsed: ACTIVE_MODEL,
  };

  let threadIds: string[] = [];
  try {
    threadIds = await listUnreadThreads(50);
    console.log(`[email-ai-v3] fetched ${threadIds.length} unread threads`);
  } catch (e) {
    metrics.errorsCaught += 1;
    metrics.errorLog.push({
      step: "fetch-threads",
      message: (e as Error).message,
      ts: new Date().toISOString(),
    });
    await finalizeRun(runId, metrics, "failed");
    return;
  }

  for (const threadId of threadIds) {
    metrics.threadsProcessed += 1;
    let summary: ThreadSummary | null = null;

    try {
      const thread = await getThread(threadId);
      summary = buildThreadSummary(thread);

      // 1. SELF-LOOP FILTER (line 1 of loop)
      if (summary.fromEmail === GMAIL_USER) {
        metrics.threadsSkippedSelfLoop += 1;
        // No DB row needed for self-loop — it's a no-op skip
        continue;
      }

      // 2. BLACKLIST FILTER
      if (isBlacklisted(summary.fromEmail)) {
        try {
          await moveToTrash(summary.threadId);
        } catch (trashErr) {
          metrics.errorsCaught += 1;
          metrics.errorLog.push({
            threadId: summary.threadId,
            senderEmail: summary.fromEmail,
            step: "trash-blacklist",
            message: (trashErr as Error).message,
            ts: new Date().toISOString(),
          });
          continue;
        }
        metrics.threadsBlacklisted += 1;
        try {
          await persistClassification(
            runId,
            summary,
            "DELETE",
            1.0,
            "Hard blacklist match — auto-trashed",
            false,
            null
          );
        } catch (persistErr) {
          // Persist failure is logged but not fatal
          metrics.errorsCaught += 1;
          metrics.errorLog.push({
            threadId: summary.threadId,
            senderEmail: summary.fromEmail,
            step: "persist-blacklist",
            message: (persistErr as Error).message,
            ts: new Date().toISOString(),
          });
        }
        continue;
      }

      // 3. Process (classify + label + maybe draft + persist)
      const outcome = await processThread(runId, summary, labelMap);
      metrics.threadsClassified += 1;
      metrics.inputTokens += outcome.inputTokens;
      metrics.outputTokens += outcome.outputTokens;
      metrics.costUsd += outcome.costUsd;
      if (outcome.draftCreated) metrics.draftsCreated += 1;
    } catch (e) {
      metrics.errorsCaught += 1;
      const entry: ErrorLogEntry = {
        threadId: summary?.threadId || threadId,
        senderEmail: summary?.fromEmail,
        step: "process-thread",
        message: (e as Error).message,
        ts: new Date().toISOString(),
      };
      metrics.errorLog.push(entry);
      console.error(
        `[email-ai-v3] thread ${entry.threadId} failed (${entry.step}): ${entry.message}`
      );
    }
  }

  const status: "success" | "partial" | "failed" =
    metrics.errorsCaught === 0
      ? "success"
      : metrics.errorsCaught >= metrics.threadsProcessed && metrics.threadsProcessed > 0
        ? "failed"
        : "partial";

  await finalizeRun(runId, metrics, status);

  console.log(
    `[email-ai-v3] tick complete · status=${status} · processed=${metrics.threadsProcessed} · classified=${metrics.threadsClassified} · self-loop-skipped=${metrics.threadsSkippedSelfLoop} · blacklisted=${metrics.threadsBlacklisted} · drafts=${metrics.draftsCreated} · errors=${metrics.errorsCaught} · cost=$${metrics.costUsd.toFixed(4)}`
  );
}

main().catch((e: Error) => {
  console.error(`[email-ai-v3] fatal: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
