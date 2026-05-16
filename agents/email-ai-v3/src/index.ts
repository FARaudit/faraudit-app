import "dotenv/config";

import { runMigrationCheck } from "./migration-check";
import { loadBlacklist, isBlacklisted } from "./blacklist";
import { getSupabase } from "./supabase";
import {
  listLabels,
  listUnreadThreads,
  getThread,
  applyLabel,
  removeLabel,
  moveToTrash,
} from "./gmail";
import { classifyDeterministic } from "./deterministic";
import { classifyLLM } from "./anthropic";
import { tickOutbound, tickReplies, tickWaiting } from "./outbound-tracker";
import { getGmail } from "./gmail";
import { extractEmail, extractDomain, errorMessage } from "./utils";
import { extractAction } from "./action-extractor";
import type { ActionDecision } from "./action-extractor";
import senders from "./data/senders.json";
import {
  URGENCY_TO_GMAIL_LABEL,
  DOMAIN_TO_GMAIL_LABEL,
  COMPANY_TO_GMAIL_LABEL,
  ALL_V3_URGENCY_LABELS,
  type ClassificationResult,
  type CompanyTag,
  type EmailMeta,
  type GmailHeader,
  type GmailMessage,
  type GmailThread,
  type RunMetrics,
} from "./types";

// Self-loop filter is now domain-based (per Phase 2 spec) — handles plus-addressing
// and Bullrize/LexAnchor self-forwards. Per-email match used to be GMAIL_USER but
// senders.self_identity_domains is the canonical source of truth.
const SELF_DOMAINS = new Set(senders.self_identity_domains.map((d) => d.toLowerCase()));
const KILL_SWITCH = process.env.EMAIL_AI_ENABLED === "true";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function findHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function buildEmailMeta(thread: GmailThread): EmailMeta | null {
  const messages = thread.messages || [];
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1] as GmailMessage;
  const headers = last.payload?.headers;

  const fromValue = findHeader(headers, "From");
  const senderEmail = extractEmail(fromValue);
  const senderName = fromValue
    .replace(/<[^>]+>/, "")
    .trim()
    .replace(/^"|"$/g, "");
  const internalMs = parseInt(last.internalDate || "0", 10);
  const ageDays = internalMs > 0 ? Math.floor((Date.now() - internalMs) / 86_400_000) : 0;

  return {
    threadId: thread.id,
    senderEmail,
    senderName,
    recipient: findHeader(headers, "To"),
    subject: findHeader(headers, "Subject"),
    snippet: last.snippet || "",
    date: findHeader(headers, "Date"),
    ageDays,
    hasReply: messages.length > 1,
  };
}

// ────────────────────────────────────────────────────────────
// Run-record lifecycle (one row per tick in email_ai_runs)
// Schema mapped to v3 columns; shape evolved for Phase 2 metrics.
// ────────────────────────────────────────────────────────────

async function startRun(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("email_ai_runs")
    .insert({ status: "running", model_used: process.env.ANTHROPIC_MODEL || "claude-opus-4-7" })
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
      threads_classified: metrics.classifiedDeterministic + metrics.classifiedLLM,
      drafts_created: metrics.draftsCreated,
      errors_caught: metrics.errors,
      cost_usd: Number(metrics.totalCostUSD.toFixed(6)),
      error_log: metrics.errorLog,
      status,
    })
    .eq("id", runId);
  // P1 fix: throw on metrics persist failure (was silent log; codereview L4)
  if (error) {
    console.error(`[email-ai-v3] finalizeRun FAILED — metrics row incomplete: ${error.message}`);
    throw new Error(`finalizeRun: ${error.message}`);
  }
}

async function persistClassification(
  runId: string,
  meta: EmailMeta,
  result: ClassificationResult,
  draftCreated: boolean,
  draftId: string | null,
): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("email_thread_classifications").insert({
    thread_id: meta.threadId,
    sender_email: meta.senderEmail,
    subject: meta.subject,
    bucket: result.urgency,
    confidence: Number(result.confidence.toFixed(2)),
    reasoning: `[${result.stage}${result.rule_matched ? ":" + result.rule_matched : ""}] ${result.reasoning}`,
    draft_created: draftCreated,
    draft_id: draftId,
    tick_id: runId,
    overridden: false,
    override_reason: null,
  }).select("id").single();
  if (error) throw new Error(`persistClassification: ${error.message}`);
  return data.id as string;
}

async function persistAction(
  classificationId: string,
  threadId: string,
  tickId: string,
  decision: ActionDecision,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("email_ai_actions").insert({
    classification_id: classificationId,
    thread_id: threadId,
    tick_id: tickId,
    verb: decision.verb,
    reason: decision.reason,
    cross_system: decision.cross_system,
    confidence: Number(decision.confidence.toFixed(2)),
    extractor_stage: decision.extractor_stage,
    extractor_model: decision.extractor_model,
  });
  if (error) {
    console.error(`persistAction soft-fail thread=${threadId}: ${error.message}`);
  }
}

// ────────────────────────────────────────────────────────────
// Outbound tracking stub (for WAITING auto-detect — Phase 2 SHIP wires)
// For now, just no-op log. Phase 2 SHIP will write to outbound_tracking table.
// ────────────────────────────────────────────────────────────

function trackOutbound(meta: EmailMeta): void {
  // TODO Phase 2 SHIP: persist {thread_id, recipient, sent_at} to outbound_tracking
  // for downstream WAITING auto-detect (4hr threshold, 14d expiry)
  console.log(`[email-ai-v3] outbound tracked (stub): ${meta.threadId} → ${extractEmail(meta.recipient)}`);
}

// ────────────────────────────────────────────────────────────
// Per-thread processing: deterministic Stage 1 → LLM Stage 2
// ────────────────────────────────────────────────────────────

interface ProcessOutcome {
  result: ClassificationResult;
  draftCreated: boolean;
  draftId: string | null;
}

async function processThread(
  meta: EmailMeta,
  labelMap: Map<string, string>,
): Promise<ProcessOutcome> {
  // Self-domain filter (handles plus-addressing + Bullrize/LexAnchor self-forwards).
  // Step A in deterministic.ts catches this too; this is the route for outbound tracking.
  const senderDomain = extractDomain(meta.senderEmail);
  if (SELF_DOMAINS.has(senderDomain)) {
    trackOutbound(meta);
  }

  // Stage 1: deterministic
  let result = classifyDeterministic(meta);

  // Stage 2: LLM (only if Stage 1 returned null)
  if (!result) {
    const company: CompanyTag = deriveCompanyFromRecipient(meta.recipient);
    result = await classifyLLM(meta, company);
  }

  // Idempotency strip: remove ALL prior v3 urgency labels before applying new ones
  await stripPriorUrgencyLabels(meta.threadId, labelMap);

  // Apply new urgency label
  const urgencyLabelName = URGENCY_TO_GMAIL_LABEL[result.urgency];
  const urgencyLabelId = labelMap.get(urgencyLabelName);
  if (urgencyLabelId) {
    await applyLabel(meta.threadId, urgencyLabelId);
  } else {
    console.warn(`[email-ai-v3] urgency label '${urgencyLabelName}' not in Gmail — skipping label apply`);
  }

  // Apply domain tag (if any)
  if (result.domain) {
    const domainLabelName = DOMAIN_TO_GMAIL_LABEL[result.domain];
    const domainLabelId = labelMap.get(domainLabelName);
    if (domainLabelId) await applyLabel(meta.threadId, domainLabelId);
  }

  // Apply company tag (always)
  const companyLabelName = COMPANY_TO_GMAIL_LABEL[result.company];
  const companyLabelId = labelMap.get(companyLabelName);
  if (companyLabelId) await applyLabel(meta.threadId, companyLabelId);

  // Email-AI v4 Stage 1 (2026-05-15): Inbox-as-NOW-queue.
  // ONLY NOW keeps INBOX. THIS_WEEK / WAITING / REFERENCE / ARCHIVE all strip INBOX —
  // bucket label retained, threads remain findable via label search.
  // Defensive: only strip for KNOWN non-NOW buckets. Unknown urgency values keep INBOX
  // to surface classifier failures rather than silently hiding them.
  const STRIP_INBOX_BUCKETS = ["THIS_WEEK", "WAITING", "REFERENCE", "ARCHIVE"];
  if (STRIP_INBOX_BUCKETS.includes(result.urgency)) {
    try {
      await removeLabel(meta.threadId, "INBOX");
      console.log(`[email-ai-v3] inbox-removed thread=${meta.threadId} urgency=${result.urgency}`);
    } catch (e) {
      console.warn(`[email-ai-v3] inbox-remove failed thread=${meta.threadId}: ${errorMessage(e)}`);
    }
  }

  // Phase 2 BUILD: drafts disabled. Phase 2 SHIP restores draft creation here.
  // if (result.draft_recommended && result.urgency === "NOW") { ... }

  return { result, draftCreated: false, draftId: null };
}

async function stripPriorUrgencyLabels(threadId: string, labelMap: Map<string, string>): Promise<void> {
  for (const oldLabelName of ALL_V3_URGENCY_LABELS) {
    const id = labelMap.get(oldLabelName);
    if (!id) continue;
    try {
      await removeLabel(threadId, id);
    } catch {
      // Tolerate "label not on thread" — Gmail returns 200 anyway in practice
    }
  }
}

function deriveCompanyFromRecipient(recipient: string): CompanyTag {
  const recipEmail = extractEmail(recipient);
  const routing = (senders as { company_routing: Record<string, string> }).company_routing;
  if (routing[recipEmail]) return routing[recipEmail] as CompanyTag;
  const domain = extractDomain(recipEmail);
  if (domain === "bullrize.com") return "Bullrize";
  if (domain === "lexanchor.ai") return "LexAnchor";
  return "FARaudit";
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

  await runMigrationCheck();
  await loadBlacklist();
  const labelMap = await listLabels();

  // Soft check on label coverage — warn but don't fail (Phase 2 may need new labels created)
  for (const labelName of Object.values(URGENCY_TO_GMAIL_LABEL)) {
    if (!labelMap.has(labelName)) console.warn(`[email-ai-v3] missing urgency label: ${labelName}`);
  }
  for (const labelName of Object.values(DOMAIN_TO_GMAIL_LABEL)) {
    if (!labelMap.has(labelName)) console.warn(`[email-ai-v3] missing domain label: ${labelName}`);
  }
  for (const labelName of Object.values(COMPANY_TO_GMAIL_LABEL)) {
    if (!labelMap.has(labelName)) console.warn(`[email-ai-v3] missing company label: ${labelName}`);
  }

  const runId = await startRun();
  console.log(`[email-ai-v3] run id: ${runId}`);

  const metrics: RunMetrics = {
    runStart: new Date(),
    threadsProcessed: 0,
    classifiedDeterministic: 0,
    classifiedLLM: 0,
    draftsCreated: 0,
    errors: 0,
    totalCostUSD: 0,
    errorLog: [],
  };

  let threadIds: string[] = [];
  try {
    threadIds = await listUnreadThreads(50);
    console.log(`[email-ai-v3] fetched ${threadIds.length} unread threads`);
  } catch (e) {
    metrics.errors += 1;
    metrics.errorLog.push({
      threadId: "",
      senderEmail: "",
      step: "fetch-threads",
      message: errorMessage(e),
      ts: new Date().toISOString(),
    });
    await finalizeRun(runId, metrics, "failed");
    return;
  }

  for (const threadId of threadIds) {
    metrics.threadsProcessed += 1;
    let meta: EmailMeta | null = null;

    try {
      const thread = await getThread(threadId);
      meta = buildEmailMeta(thread);
      if (!meta) continue;

      // Blacklist (legacy v3 hard filter — kept for backwards compat)
      if (isBlacklisted(meta.senderEmail)) {
        await moveToTrash(meta.threadId);
        // Persist as ARCHIVE (not DELETE — DELETE is killed)
        await persistClassification(
          runId,
          meta,
          {
            urgency: "ARCHIVE",
            domain: null,
            company: deriveCompanyFromRecipient(meta.recipient),
            confidence: 1.0,
            reasoning: "hard blacklist match — auto-trashed",
            bypassLLM: true,
            stage: "deterministic",
            rule_matched: "blacklist",
            draft_recommended: false,
          },
          false,
          null,
        );
        continue;
      }

      const outcome = await processThread(meta, labelMap);

      if (outcome.result.stage === "deterministic") metrics.classifiedDeterministic += 1;
      else metrics.classifiedLLM += 1;

      const classificationId = await persistClassification(runId, meta, outcome.result, outcome.draftCreated, outcome.draftId);
      try {
        const action = await extractAction(meta, outcome.result);
        await persistAction(classificationId, meta.threadId, runId, action);
      } catch (e) {
        console.error(`[email-ai-v3] action extract failed thread=${meta.threadId}: ${errorMessage(e)}`);
      }
    } catch (e) {
      metrics.errors += 1;
      metrics.errorLog.push({
        threadId: meta?.threadId || threadId,
        senderEmail: meta?.senderEmail || "",
        step: "process-thread",
        message: errorMessage(e),
        ts: new Date().toISOString(),
      });
      console.error(`[email-ai-v3] thread ${meta?.threadId || threadId} failed: ${errorMessage(e)}`);
    }
  }

  // Outbound tracking: WAITING auto-detect (4hr threshold, 14d expiry)
  // Each tick: ingest new SENT messages, check for replies, apply/remove WAITING.
  // Errors here are logged but don't fail the run — observability only.
  try {
    const gmail = getGmail();
    await tickOutbound(gmail);
    await tickReplies(gmail, labelMap);
    await tickWaiting(gmail, labelMap);
  } catch (e) {
    metrics.errors += 1;
    metrics.errorLog.push({
      threadId: "",
      senderEmail: "",
      step: "outbound-tracker",
      message: errorMessage(e),
      ts: new Date().toISOString(),
    });
    console.error(`[email-ai-v3] outbound tracker failed: ${errorMessage(e)}`);
  }

  const status: "success" | "partial" | "failed" =
    metrics.errors === 0
      ? "success"
      : metrics.errors >= metrics.threadsProcessed && metrics.threadsProcessed > 0
        ? "failed"
        : "partial";

  await finalizeRun(runId, metrics, status);

  console.log(
    `[email-ai-v3] tick complete · status=${status} · processed=${metrics.threadsProcessed} · det=${metrics.classifiedDeterministic} · llm=${metrics.classifiedLLM} · drafts=${metrics.draftsCreated} · errors=${metrics.errors} · cost=$${metrics.totalCostUSD.toFixed(4)}`
  );
}

main().catch((e: Error) => {
  console.error(`[email-ai-v3] fatal: ${errorMessage(e)}`);
  console.error(e.stack);
  process.exit(1);
});
