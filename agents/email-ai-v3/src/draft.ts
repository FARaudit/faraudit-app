import { generateDraftReply } from "./anthropic";
import { createDraft } from "./gmail";
import type { ThreadSummary } from "./types";

export interface DraftOutcome {
  draftId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * For NOW-bucket threads: generate a reply via Anthropic, then create a Gmail draft
 * (drafts only — never gmail.send). Caller is responsible for catching errors and
 * recording them in the run's error_log.
 */
export async function buildAndCreateDraft(thread: ThreadSummary): Promise<DraftOutcome> {
  const draft = await generateDraftReply({
    senderEmail: thread.fromEmail,
    subject: thread.subject,
    snippet: thread.snippet,
  });

  // Reply subject — strip duplicated "Re: " prefixes
  const baseSubject = thread.subject.replace(/^(re:\s*)+/i, "");
  const replySubject = `Re: ${baseSubject}`;

  const lastMessage = thread.rawMessages[thread.rawMessages.length - 1];
  const messageIdHeader = (lastMessage?.payload?.headers || []).find(
    (h) => h.name.toLowerCase() === "message-id"
  )?.value;
  const referencesHeader = (lastMessage?.payload?.headers || []).find(
    (h) => h.name.toLowerCase() === "references"
  )?.value;

  const draftId = await createDraft({
    threadId: thread.threadId,
    to: thread.fromEmail,
    subject: replySubject,
    body: draft.body,
    inReplyTo: messageIdHeader,
    references: referencesHeader
      ? `${referencesHeader}${messageIdHeader ? " " + messageIdHeader : ""}`
      : messageIdHeader,
  });

  return {
    draftId,
    inputTokens: draft.input_tokens,
    outputTokens: draft.output_tokens,
    costUsd: draft.cost_usd,
  };
}
