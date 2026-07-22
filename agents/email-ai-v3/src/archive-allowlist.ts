// De-arm (#657): pure decision helpers for allowlist-gated archiving. Kept side-effect-free so the
// full test matrix can exercise them without Gmail I/O.
import { ARCHIVE_ALLOWLIST } from "./constants";
import { extractDomain } from "./utils";

/** True iff the sender's domain matches ARCHIVE_ALLOWLIST — exact or subdomain (notification senders). */
export function isArchiveAllowlisted(senderEmail: string | null | undefined): boolean {
  if (!senderEmail) return false;
  const domain = extractDomain(senderEmail);
  if (!domain) return false;
  return ARCHIVE_ALLOWLIST.some((d) => domain === d || domain.endsWith("." + d));
}

/**
 * A thread may be archived (INBOX + UNREAD removed) ONLY when BOTH hold:
 *   (a) the classification stage was deterministic, AND
 *   (b) the sender is in ARCHIVE_ALLOWLIST.
 * Every LLM-fallback classification, and every non-allowlisted sender, is labeled and RETAINED in inbox.
 */
export function shouldArchive(stage: "deterministic" | "llm", senderEmail: string | null | undefined): boolean {
  return stage === "deterministic" && isArchiveAllowlisted(senderEmail);
}
