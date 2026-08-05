import "dotenv/config";
import { initSentry, captureException } from "./sentry";
initSentry("email-ai-v3");

import { runMigrationCheck } from "./migration-check";
import { loadBlacklist, isBlacklisted } from "./blacklist";
import { getSupabase } from "./supabase";
import {
  listLabels,
  listInboxThreads,
  getThread,
  applyLabel,
  removeLabel,
  ensureLabel,
  archiveThread,
  createDraft,
} from "./gmail";
import { shouldArchive } from "./archive-allowlist";
import { alertFailure } from "./alerting";
import {
  shouldEgress,
  buildNeedsAttentionDraft,
  buildTelegramLine,
  type NeedsAttentionItem,
} from "./needs-attention";
import { telegramConfigured, sendTelegram } from "./telegram";
import { BLACKLIST_LABEL } from "./constants";
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

// Tolerant parse, mirroring src/lib/env-flags.ts:isEnvOn — CANONICAL DEFINITION LIVES THERE.
// Copied, not imported: email-ai-v3 is a standalone package (own tsconfig, rootDir ./src, no `@/`
// alias) that compiles with its own tsc — an aliased import fails its Railway BUILD outright.
// This is a KILL SWITCH: a dashboard-set EMAIL_AI_ENABLED=True read as FALSE leaves it dead.
const isEnvOn = (v: string | undefined): boolean =>
  v != null && ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
const KILL_SWITCH = isEnvOn(process.env.EMAIL_AI_ENABLED);

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
    latestMessageId: (last as GmailMessage).id || "",
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
    latest_message_id: meta.latestMessageId, // #660: idempotency key for the widened fetch
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
// Per-thread processing: deterministic Stage 1 → LLM Stage 2
// (#660: dead trackOutbound() stub removed — real outbound tracking lives in outbound-tracker.ts.)
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

  // De-arm (#657) change 2: ALLOWLIST-GATED ARCHIVING (supersedes the old bucket-strip). A thread
  // leaves the inbox ONLY when its classification was deterministic AND its sender is in
  // ARCHIVE_ALLOWLIST. Everything else — every LLM-fallback classification and every non-allowlisted
  // sender — is labeled and RETAINED (INBOX + UNREAD kept; applyLabel no longer strips UNREAD).
  if (shouldArchive(result.stage, meta.senderEmail)) {
    try {
      await removeLabel(meta.threadId, "INBOX");
      await removeLabel(meta.threadId, "UNREAD");
      console.log(`[email-ai-v3] archived (deterministic+allowlist) thread=${meta.threadId} sender=${meta.senderEmail} urgency=${result.urgency}`);
    } catch (e) {
      console.warn(`[email-ai-v3] archive failed thread=${meta.threadId}: ${errorMessage(e)}`);
    }
  } else {
    console.log(`[email-ai-v3] retained-in-inbox thread=${meta.threadId} stage=${result.stage} sender=${meta.senderEmail}`);
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
    needsAttention: 0,
    skippedAlreadyClassified: 0,
    errors: 0,
    totalCostUSD: 0,
    errorLog: [],
  };

  let threadIds: string[] = [];
  try {
    threadIds = await listInboxThreads(50); // #660: in:inbox newer_than:2d (was unread-only)
    console.log(`[email-ai-v3] fetched ${threadIds.length} inbox threads (newer_than:2d)`);
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

  // #660 idempotency guard: pre-load the latest_message_ids already classified for this fetch set.
  // A thread whose current latest message id is already recorded is skipped — classify each message
  // state exactly once; a NEW message (new id) is not in the set, so it re-qualifies (and can re-notify).
  const alreadyClassified = new Set<string>();
  try {
    const supabase = getSupabase();
    for (let i = 0; i < threadIds.length; i += 100) {
      const chunk = threadIds.slice(i, i + 100);
      const { data } = await supabase
        .from("email_thread_classifications")
        .select("latest_message_id")
        .in("thread_id", chunk);
      for (const r of data || []) if (r.latest_message_id) alreadyClassified.add(r.latest_message_id as string);
    }
  } catch (e) {
    console.warn(`[email-ai-v3] idempotency preload failed (will classify all): ${errorMessage(e)}`);
  }

  // #660 Tier 1/2: qualifying (digest_p0_block) items collected across the tick → single draft + per-item push.
  const qualifying: Array<NeedsAttentionItem & { classificationId: string }> = [];

  for (const threadId of threadIds) {
    metrics.threadsProcessed += 1;
    let meta: EmailMeta | null = null;

    try {
      const thread = await getThread(threadId);
      meta = buildEmailMeta(thread);
      if (!meta) continue;

      // #660 idempotency: skip if this exact message state was already classified (no re-label, no re-act,
      // no re-notify). A new message on the thread has a new id → not skipped → re-qualifies.
      if (meta.latestMessageId && alreadyClassified.has(meta.latestMessageId)) {
        metrics.skippedAlreadyClassified += 1;
        continue;
      }

      // Blacklist (legacy v3 hard filter). De-arm (#657) change 1: LABEL-ONLY, never trashed.
      // Apply "AI/Blacklisted" (create if missing) + remove INBOX + UNREAD. Nothing is deleted.
      if (isBlacklisted(meta.senderEmail)) {
        const blLabelId = await ensureLabel(BLACKLIST_LABEL);
        await archiveThread(meta.threadId, [blLabelId]);
        await persistClassification(
          runId,
          meta,
          {
            urgency: "ARCHIVE",
            domain: null,
            company: deriveCompanyFromRecipient(meta.recipient),
            confidence: 1.0,
            reasoning: "hard blacklist match — labeled AI/Blacklisted, inbox+unread removed (never trashed)",
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
        // #660 + #662: collect qualifying for egress — digest_p0_block AND sender NOT allowlisted
        // (strict suppression: allowlisted-domain threads never draft/push, even on failure content).
        if (shouldEgress(action.verb, meta.senderEmail)) {
          const cs = (action.cross_system || {}) as { blocker?: string; deadline?: string };
          qualifying.push({
            classificationId,
            threadId: meta.threadId,
            senderName: meta.senderName,
            senderEmail: meta.senderEmail,
            subject: meta.subject,
            reason: cs.blocker || action.reason || "action-required",
            deadline: cs.deadline,
          });
        }
      } catch (e) {
        metrics.errors += 1;
        metrics.errorLog.push({
          threadId: meta.threadId,
          senderEmail: meta.senderEmail,
          step: "action-persist",
          message: errorMessage(e),
          ts: new Date().toISOString(),
        });
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

  // ── #660 EGRESS: needs-attention (digest_p0_block) → ONE Gmail draft + per-item Telegram push ──
  // Zero qualifying = zero egress. Machine-noise/allowlist senders never reach here (they don't get the verb).
  metrics.needsAttention = qualifying.length;
  let telegramSummary = "disabled";
  if (qualifying.length > 0) {
    const nowLabel =
      new Date()
        .toLocaleString("en-CA", {
          timeZone: "America/Chicago",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false,
        })
        .replace(",", "") + " CT";

    // Tier 1 — single Gmail draft-flag (zero new creds; reuses #657 createDraft).
    try {
      const draft = buildNeedsAttentionDraft(qualifying, nowLabel);
      if (draft) {
        await createDraft({ to: process.env.ALERT_EMAIL || "jose@faraudit.com", subject: draft.subject, body: draft.body });
        metrics.draftsCreated += 1;
        console.log(`[email-ai-v3] needs-attention draft created (${qualifying.length} item(s))`);
      }
    } catch (e) {
      metrics.errors += 1;
      console.error(`[email-ai-v3] needs-attention draft failed: ${errorMessage(e)}`);
    }

    // Tier 2 — env-gated Telegram push (one per qualifying action). Dormant + silent without creds.
    if (telegramConfigured()) {
      let tgSent = 0;
      for (const it of qualifying) {
        const res = await sendTelegram(buildTelegramLine(it, nowLabel));
        if (res.ok) tgSent += 1;
        else console.warn(`[email-ai-v3] telegram push failed thread=${it.threadId}: ${res.reason}`);
      }
      telegramSummary = `${tgSent}/${qualifying.length} sent`;
      console.log(`[email-ai-v3] telegram: ${telegramSummary}`);
    } else {
      console.log(`[email-ai-v3] telegram disabled — ${qualifying.length} qualifying action(s) via draft-flag only`);
    }

    // #660 DEDUPE: stamp notified_at so a thread notifies once across both tiers (a new message re-qualifies).
    try {
      const supabase = getSupabase();
      await supabase
        .from("email_ai_actions")
        .update({ notified_at: new Date().toISOString() })
        .in("classification_id", qualifying.map((q) => q.classificationId));
    } catch (e) {
      console.warn(`[email-ai-v3] notified_at stamp failed: ${errorMessage(e)}`);
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

  lastTickSummary = `status=${status} · fetched=${metrics.threadsProcessed} · skipped=${metrics.skippedAlreadyClassified} · det=${metrics.classifiedDeterministic} · llm=${metrics.classifiedLLM} · qualifying=${metrics.needsAttention} · drafts=${metrics.draftsCreated} · telegram=${telegramSummary} · errors=${metrics.errors} · cost=$${metrics.totalCostUSD.toFixed(4)}`;
  console.log(`[email-ai-v3] tick complete · ${lastTickSummary}`);
}

// De-arm (#657) change 3: failure alerting. Any uncaught error / Gmail auth failure → Sentry capture
// (no-op without SENTRY_DSN) + a rate-limited (1/6h) Gmail DRAFT alert to the CEO. Never masks the exit code.
let lastTickSummary = "tick did not reach completion (failed during setup or fetch — see error)";

main().catch(async (e: Error) => {
  console.error(`[email-ai-v3] fatal: ${errorMessage(e)}`);
  console.error(e.stack);
  captureException(e);
  await alertFailure(e, lastTickSummary);
  process.exit(1);
});
