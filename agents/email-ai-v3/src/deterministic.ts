import senders from "./data/senders.json";
import { ClassificationResult, CompanyTag, EmailMeta, UrgencyBucket } from "./types";
import { STALE_THREAD_MAX_DAYS_NOW } from "./constants";
import { extractDomain, extractLocalPart, extractEmail } from "./utils";

export function classifyDeterministic(meta: EmailMeta): ClassificationResult | null {
  const sender = meta.senderEmail.toLowerCase();
  const senderDomain = extractDomain(sender);
  const senderLocal = extractLocalPart(sender);
  const recipient = meta.recipient.toLowerCase();
  const recipientDomain = extractDomain(extractEmail(recipient));
  const subject = meta.subject.toLowerCase();
  const snippet = meta.snippet.toLowerCase();
  const company = deriveCompany(recipient);

  // STEP A — Self-identity sender (handles plus-addressing + Bullrize/LexAnchor self-forwards)
  if (senders.self_identity_domains.includes(senderDomain)) {
    if (senders.self_identity_domains.includes(recipientDomain)) {
      // Self-forward (e.g., jose@bullrize.com → jose@faraudit.com)
      return {
        urgency: "REFERENCE",
        domain: "ATLAS_LEGAL",
        company,
        confidence: 1.0,
        reasoning: "self-forward between owned domains",
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_a_self_forward",
        draft_recommended: false,
      };
    }
    // Self → external (track for WAITING auto-detect)
    return {
      urgency: "ARCHIVE",
      domain: null,
      company,
      confidence: 1.0,
      reasoning: "outbound from self — tracked in outbound_tracking",
      bypassLLM: true,
      stage: "deterministic",
      rule_matched: "step_a_outbound",
      draft_recommended: false,
    };
  }

  // STEP B — Personal email (CEO's own Gmail/AT&T)
  // Action-signal subjects escalate to LLM (return null) instead of short-circuiting to ARCHIVE.
  // Real prospects, forwards, and meeting requests from CEO's own accounts must reach the classifier.
  if ((senders.personal_emails as string[]).includes(sender)) {
    const ACTION_SIGNAL_REGEX = /\b(question|re:|fwd:|fw:|call|meeting|chat|sync|prospect|lead|prep|urgent|asap|today)\b/i;
    if (ACTION_SIGNAL_REGEX.test(subject)) {
      // Escalate — return null so the caller falls through to classifyLLM().
      // Breadcrumb visibility deferred to a separate item if needed.
      return null;
    }

    // Default: no action signal, route to ARCHIVE
    return {
      urgency: "ARCHIVE",
      domain: null,
      company,
      confidence: 1.0,
      reasoning: "personal email account — never auto-prospect",
      bypassLLM: true,
      stage: "deterministic",
      rule_matched: "step_b_personal",
      draft_recommended: false,
    };
  }

  // STEP C — Negative prospects (cancelled vendors, marketing sites)
  for (const neg of senders.prospects_negative) {
    if (sender === neg.toLowerCase() || senderDomain === neg.toLowerCase()) {
      return {
        urgency: "ARCHIVE",
        domain: null,
        company,
        confidence: 1.0,
        reasoning: `negative-prospect list match: ${neg}`,
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_c_negative",
        draft_recommended: false,
      };
    }
  }

  // STEP D — Stable mailbox split (priority → NOW, mailroom → THIS_WEEK, etc.)
  for (const [stableSender, stableUrgency] of Object.entries(senders.stable_senders)) {
    if (sender === stableSender.toLowerCase()) {
      return {
        urgency: stableUrgency as UrgencyBucket,
        domain: "INFRA",
        company,
        confidence: 1.0,
        reasoning: `stable mailbox routing: ${stableSender}`,
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_d_stable",
        draft_recommended: false,
      };
    }
  }

  // STEP E — Atlas/legal senders (high signal, urgent)
  if (senders.atlas_legal_senders.includes(sender)) {
    // Subject keyword routing within atlas_legal
    const isReceiptOrConfirmation =
      /successfully filed|was filed|invoice is available|billing information was received|forwarding confirmation|email address updated/.test(subject);
    const isUrgentAction =
      /verify your email|action required|verification code|security alert|one-time password|recovery|delivery status notification|primary admin/.test(subject + " " + snippet);

    if (isReceiptOrConfirmation && !isUrgentAction) {
      return {
        urgency: "REFERENCE",
        domain: "ATLAS_LEGAL",
        company,
        confidence: 0.95,
        reasoning: "atlas/legal receipt or confirmation",
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_e_atlas_receipt",
        draft_recommended: false,
      };
    }
    return {
      urgency: "NOW",
      domain: "ATLAS_LEGAL",
      company,
      confidence: 0.95,
      reasoning: "atlas/legal urgent action",
      bypassLLM: true,
      stage: "deterministic",
      rule_matched: "step_e_atlas_urgent",
      draft_recommended: false,
    };
  }

  // STEP F — Infra senders (Railway, Vercel, Supabase, Resend)
  if (senders.infra_senders.includes(sender)) {
    const isCrash = /crashed|build failed|failed production deployment|paused/.test(subject);
    return {
      urgency: isCrash ? "NOW" : "THIS_WEEK",
      domain: "INFRA",
      company,
      confidence: 0.9,
      reasoning: isCrash ? "infra crash/failure" : "infra notification",
      bypassLLM: true,
      stage: "deterministic",
      rule_matched: "step_f_infra",
      draft_recommended: false,
    };
  }

  // STEP G — Unreplyable patterns (catch-all for noreply/notifications)
  for (const pattern of senders.unreplyable_patterns) {
    if (new RegExp(pattern, "i").test(sender)) {
      return {
        urgency: "ARCHIVE",
        domain: null,
        company,
        confidence: 0.85,
        reasoning: `unreplyable pattern match: ${pattern}`,
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_g_unreplyable",
        draft_recommended: false,
      };
    }
  }

  // STEP H — Positive prospects (whitelisted people/domains)
  const senderNameLower = (meta.senderName || "").toLowerCase();
  for (const person of senders.prospects_positive_people) {
    const personNormalized = person.replace(".", " ");
    if (senderNameLower.includes(personNormalized) || senderLocal.includes(person.replace(".", ""))) {
      return {
        urgency: meta.ageDays > STALE_THREAD_MAX_DAYS_NOW ? "THIS_WEEK" : "NOW",
        domain: "PROSPECT",
        company,
        confidence: 0.95,
        reasoning: `positive prospect person match: ${person}`,
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_h_prospect_person",
        draft_recommended: true,
      };
    }
  }
  for (const domain of senders.prospects_positive_domains) {
    if (senderDomain === domain.toLowerCase() || senderDomain.endsWith("." + domain.toLowerCase())) {
      return {
        urgency: meta.ageDays > STALE_THREAD_MAX_DAYS_NOW ? "THIS_WEEK" : "NOW",
        domain: "PROSPECT",
        company,
        confidence: 0.9,
        reasoning: `positive prospect domain match: ${domain}`,
        bypassLLM: true,
        stage: "deterministic",
        rule_matched: "step_h_prospect_domain",
        draft_recommended: true,
      };
    }
  }

  // STEP I — Escalate to LLM Stage 2
  return null;
}

function deriveCompany(recipient: string): CompanyTag {
  const recipEmail = extractEmail(recipient);
  const routing = (senders as { company_routing: Record<string, string> }).company_routing;
  if (routing[recipEmail]) return routing[recipEmail] as CompanyTag;
  // Fallback by domain
  const domain = extractDomain(recipEmail);
  if (domain === "bullrize.com") return "Bullrize";
  if (domain === "lexanchor.ai") return "LexAnchor";
  return "FARaudit"; // default
}
